import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  CameraIntent,
  SceneObject,
  SceneProjection,
  RendererCallbacks,
  MapPresentation,
} from '../contracts';
import { defaultMapPresentation } from '../contracts';
import { constrainCamera } from '../regions';
import { acquireArchives, refreshRegionalArchives } from './archiveProtocol';
import {
  terrainSource,
  elevationSource,
  hillshadeLayer,
  extrusionLayer,
  buildingFootprints,
} from './regionalStyle';
import { affiliationSymbols } from '../symbology';
import { symbolCanvas } from '../symbolCanvas';
import { groundSpan, sceneBounds, zoomForCamera } from '../camera';
import {
  loadHostedStyle,
  localStyle,
  hasTacticalCredentials,
  resourceUrl,
  type TacticalProvider,
} from '../providers';

const prefix = '__sentinel-';
// MapLibre 6's ESM worker must be bundled with its shared imports by Vite.
maplibregl.setWorkerUrl(workerUrl);
const sourceId = `${prefix}world`;
const symbols = `${prefix}symbols`;
const empty: FeatureCollection = { type: 'FeatureCollection', features: [] };
export type { ProviderStatus } from '../contracts';
const counts = { created: 0, disposed: 0, active: 0 };
const probes = new Map<string, MapLibreAdapter>();
if (import.meta.env.MODE === 'verification') {
  Object.assign(window, {
    __sentinelMapTest: {
      inspect: (id: string) => probes.get(id)?.inspect(),
      stats: () => ({ ...counts }),
      setProvider: (id: string, styleUrl: string) =>
        probes.get(id)?.setProvider({ styleUrl }),
      setCamera: (id: string, camera: CameraIntent) =>
        probes.get(id)?.restoreCamera(camera),
      useRegional: (id: string) =>
        probes.get(id)?.setProvider({ kind: 'regional' }),
    },
  });
}

/** Owns only projection resources. Receives complete scenes; never opens a backend connection. */
export class MapLibreAdapter {
  private readonly map: maplibregl.Map;
  private readonly observer: ResizeObserver;
  private scene?: SceneProjection;
  private disposed = false;
  private installed = false;
  private framed = false;
  private initialCamera?: CameraIntent;
  private imageIds = new Set<string>();
  private mode: 'select' | 'pan' = 'select';
  private keyboardId?: string;
  private provider: TacticalProvider;
  private providerGeneration = 0;
  private request?: AbortController;
  private requestTimer?: ReturnType<typeof setTimeout>;
  private readinessTimer?: ReturnType<typeof setTimeout>;
  private rendererTimer?: ReturnType<typeof setTimeout>;
  private hosted = false;
  private failed = false;
  private appliedFrameId?: string;
  private appliedSequence?: number;
  private readonly keyHandler = (event: KeyboardEvent) => this.onKey(event);
  private readonly releaseArchives: () => void;
  private presentation: MapPresentation = { ...defaultMapPresentation };
  private terrainFailed = false;
  private constraining = false;
  private active = true;
  private rendererFailed = false;
  private pendingScene?: { scene: SceneProjection; camera?: CameraIntent };
  private pendingCamera?: CameraIntent;
  private dormantCamera?: CameraIntent;
  private pendingProvider = false;
  private providerLoading = false;
  private sourceSignature?: string;
  private gridSignature?: string;
  private filtersHidden = false;
  private filterRestoreQueued = false;
  private renderedFrames = 0;
  private sceneDraws = 0;
  private attribution?: maplibregl.AttributionControl;
  private attributionObserver?: ResizeObserver;

  constructor(
    private readonly container: HTMLElement,
    private readonly viewId: string,
    provider: TacticalProvider,
    private readonly callbacks: RendererCallbacks,
    initialCamera?: CameraIntent,
  ) {
    this.provider = provider;
    this.initialCamera = initialCamera;
    this.map = new maplibregl.Map({
      container,
      style: localStyle(),
      center: initialCamera
        ? [initialCamera.center.longitudeDeg, initialCamera.center.latitudeDeg]
        : [0, 0],
      zoom: initialCamera
        ? zoomForCamera(initialCamera, container.clientWidth)
        : 1,
      bearing: initialCamera?.headingTrueDeg ?? 0,
      pitch: initialCamera?.pitchFromNadirDeg ?? 0,
      maxPitch: 60,
      attributionControl: false,
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
      renderWorldCopies: false,
      fadeDuration: 0,
      transformRequest: (url) => ({
        url: resourceUrl(url, this.provider.key),
        credentials: 'same-origin',
      }),
    });
    this.releaseArchives = acquireArchives();
    this.map.touchZoomRotate.disableRotation();
    this.updateAttribution();
    this.map.addControl(
      new maplibregl.ScaleControl({ maxWidth: 100, unit: 'metric' }),
      'bottom-left',
    );
    const canvas = this.map.getCanvas();
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Tactical map');
    canvas.setAttribute(
      'aria-describedby',
      `map-help-${viewId.replace(':', '-')}`,
    );
    canvas.addEventListener('keydown', this.keyHandler);
    this.map.on('style.load', () => this.install());
    this.map.on('render', () => this.renderedFrames++);
    this.map.on('idle', () => {
      if (!this.installed || this.disposed) return;
      if (this.rendererTimer) clearTimeout(this.rendererTimer);
      this.rendererTimer = undefined;
      this.appliedFrameId = this.scene?.frameId;
      this.appliedSequence = this.scene?.sequence;
      // Images referenced by the preceding worker frame are safe to release now.
      const current = new Set(
        (this.scene?.objects ?? []).map((object) => this.labelId(object)),
      );
      for (const id of this.imageIds)
        if (!current.has(id) && id.startsWith(`${prefix}label-`)) {
          this.map.removeImage(id);
          this.imageIds.delete(id);
        }
      if (this.hosted && !this.failed) {
        if (this.readinessTimer) clearTimeout(this.readinessTimer);
        this.providerLoading = false;
        this.providerStatus();
      }
    });
    this.map.on('moveend', () => {
      this.updateGrid();
      this.saveCamera();
    });
    this.map.on('move', () => this.saveCamera());
    this.map.on('click', (event) => {
      if (this.mode !== 'select' || !this.installed) return;
      const picked = this.map.queryRenderedFeatures(
        [
          [event.point.x - 7, event.point.y - 7],
          [event.point.x + 7, event.point.y + 7],
        ],
        { layers: [symbols] },
      )[0];
      if (typeof picked?.properties.entityId === 'string')
        this.callbacks.pick(picked.properties.entityId);
    });
    this.map.on('error', (event) => {
      const failingSource = 'sourceId' in event ? event.sourceId : undefined;
      if (
        failingSource === terrainSource ||
        failingSource === elevationSource
      ) {
        this.terrainFailed = true;
        this.applyPresentation();
        this.providerStatus();
        return;
      }
      if (
        failingSource === sourceId ||
        failingSource === `${prefix}grid` ||
        !this.hosted
      ) {
        this.rendererFailed = true;
        this.callbacks.status({ kind: 'renderer-error' });
      } else if (!this.failed) this.fallback();
    });
    this.map.on('webglcontextlost', () => {
      this.rendererFailed = true;
      this.callbacks.status({ kind: 'renderer-error' });
    });
    this.observer = new ResizeObserver(() => {
      if (
        !this.active ||
        this.disposed ||
        !container.clientWidth ||
        !container.clientHeight
      )
        return;
      this.map.resize();
      this.limitCamera();
      this.saveCamera();
    });
    this.observer.observe(container);
    counts.created++;
    counts.active++;
    if (import.meta.env.MODE === 'verification') probes.set(viewId, this);
    this.rendererTimer = setTimeout(() => {
      // MapLibre's shared dispatcher can retain an initially failed worker.
      // Recreating one map cannot reliably repair that application asset failure.
      if (!this.disposed) {
        this.rendererFailed = true;
        this.callbacks.status({ kind: 'renderer-timeout' });
      }
    }, 8000);
    this.setProvider(provider);
  }

  setMode(mode: 'select' | 'pan') {
    this.mode = mode;
    this.map.getCanvas().style.cursor = mode === 'pan' ? 'grab' : 'crosshair';
  }
  setPresentation(options: MapPresentation) {
    const changed =
      options.buildings !== this.presentation.buildings ||
      options.hillshade !== this.presentation.hillshade ||
      options.terrain !== this.presentation.terrain;
    this.presentation = { ...options };
    if (changed && this.active) this.applyPresentation();
  }
  setActive(active: boolean) {
    if (this.disposed || this.active === active) return;
    if (!active) {
      this.map.stop();
      this.saveCamera();
      this.dormantCamera = this.camera();
      this.active = false;
      return;
    }
    // Resize while camera callbacks are still suppressed; reconcile newest scene first.
    this.map.resize();
    this.active = true;
    const pending = this.pendingScene;
    this.pendingScene = undefined;
    if (pending) this.setScene(pending.scene, pending.camera);
    if (this.pendingCamera) {
      const camera = this.pendingCamera;
      this.pendingCamera = undefined;
      this.restoreCamera(camera);
    }
    if (this.pendingProvider) {
      this.pendingProvider = false;
      this.setProvider(this.provider);
    }
    this.applyPresentation();
    this.limitCamera();
    this.map.triggerRepaint();
  }
  canRetain() {
    return (
      !this.disposed &&
      !this.failed &&
      !this.rendererFailed &&
      !this.providerLoading &&
      !this.terrainFailed &&
      this.installed &&
      this.map.loaded()
    );
  }
  retainedBytes() {
    // MapLibre exposes no reliable whole-view GPU-byte counter. Pool count/TTL
    // bounds this renderer; do not invent a memory estimate.
    return 0;
  }
  captureCamera() {
    return this.disposed
      ? undefined
      : this.active
        ? this.camera()
        : this.dormantCamera;
  }
  setPitch(pitchFromNadirDeg: number) {
    this.map.jumpTo({ pitch: Math.max(0, Math.min(60, pitchFromNadirDeg)) });
  }
  private applyPresentation() {
    if (!this.installed || this.disposed || !this.map.getSource(terrainSource))
      return;
    const visibility = (id: string, visible: boolean) => {
      if (this.map.getLayer(id))
        this.map.setLayoutProperty(
          id,
          'visibility',
          visible ? 'visible' : 'none',
        );
    };
    visibility(
      hillshadeLayer,
      this.presentation.hillshade && !this.terrainFailed,
    );
    visibility(extrusionLayer, this.presentation.buildings);
    visibility(buildingFootprints, !this.presentation.buildings);
    const terrain = this.presentation.terrain && !this.terrainFailed;
    if (Boolean(this.map.getTerrain()) !== terrain)
      this.map.setTerrain(
        terrain ? { source: elevationSource, exaggeration: 1 } : null,
      );
  }
  private providerStatus() {
    this.callbacks.status({
      kind: 'hosted',
      source: this.provider.kind === 'regional' ? 'regional' : 'maptiler',
      terrainError: this.terrainFailed,
    });
  }
  restoreCamera(camera: CameraIntent) {
    if (!this.active) {
      this.pendingCamera = camera;
      return;
    }
    const limited = constrainCamera(camera, this.scene?.region);
    this.map.jumpTo({
      center: [limited.center.longitudeDeg, limited.center.latitudeDeg],
      zoom: zoomForCamera(limited, this.container.clientWidth),
      bearing: limited.headingTrueDeg,
      pitch: limited.pitchFromNadirDeg ?? this.map.getPitch(),
    });
  }
  private limitCamera() {
    if (
      this.constraining ||
      !this.scene?.region ||
      !this.framed ||
      this.disposed
    )
      return;
    const camera = this.camera(),
      limited = constrainCamera(camera, this.scene.region);
    if (
      Math.abs(camera.groundSpanM - limited.groundSpanM) < 0.1 &&
      Math.abs(camera.center.longitudeDeg - limited.center.longitudeDeg) <
        1e-7 &&
      Math.abs(camera.center.latitudeDeg - limited.center.latitudeDeg) < 1e-7
    )
      return;
    this.constraining = true;
    this.restoreCamera(limited);
    this.constraining = false;
  }

  setScene(scene: SceneProjection, restoredCamera?: CameraIntent) {
    if (this.disposed) return;
    if (!this.active) {
      this.pendingScene = { scene, camera: restoredCamera };
      return;
    }
    const changedMission = this.scene?.missionId !== scene.missionId;
    if (changedMission) {
      this.framed = false;
      this.keyboardId = undefined;
      this.appliedFrameId = undefined;
      this.appliedSequence = undefined;
      this.sourceSignature = undefined;
      this.initialCamera =
        restoredCamera ?? (this.scene ? undefined : this.initialCamera);
      if (this.installed) {
        this.filtersHidden = true;
        this.map.setFilter(`${prefix}trail-line`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}trail-points`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        // Clear old mission geometry before the worker processes the new source.
        this.map.setFilter(symbols, ['==', ['get', 'kind'], 'none']);
        this.map.setFilter(`${prefix}zone-fill`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}zone-line`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}labels`, ['==', ['get', 'kind'], 'none']);
        this.map.setFilter(`${prefix}selection`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}keyboard`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
      }
    }
    this.scene = scene;
    if (changedMission) {
      this.map.setMaxBounds(
        scene.region
          ? [
              [scene.region.bounds[0], scene.region.bounds[1]],
              [scene.region.bounds[2], scene.region.bounds[3]],
            ]
          : null,
      );
    }
    if (
      this.keyboardId &&
      !scene.objects.some((o) => o.ref.id === this.keyboardId)
    )
      this.keyboardId = undefined;
    if (this.installed) this.draw();
  }

  private install() {
    if (this.disposed) return;
    this.installed = true;
    this.sourceSignature = undefined;
    this.gridSignature = undefined;
    this.filtersHidden = false;
    this.applyPresentation();
    this.imageIds.clear();
    this.map.addSource(`${prefix}grid`, { type: 'geojson', data: empty });
    this.map.addLayer({
      id: `${prefix}grid`,
      type: 'line',
      source: `${prefix}grid`,
      paint: {
        'line-color': '#a8b4bf',
        'line-opacity': 0.085,
        'line-width': 1,
      },
    });
    this.map.addSource(sourceId, { type: 'geojson', data: empty });
    const zoneFilter: maplibregl.FilterSpecification = [
      '==',
      ['get', 'kind'],
      'zone',
    ];
    this.map.addLayer({
      id: `${prefix}zone-fill`,
      type: 'fill',
      source: sourceId,
      filter: zoneFilter,
      paint: { 'fill-color': '#d3d9df', 'fill-opacity': 0.025 },
    });
    this.map.addLayer({
      id: `${prefix}zone-line`,
      type: 'line',
      source: sourceId,
      filter: zoneFilter,
      paint: {
        'line-color': '#a4adb6',
        'line-width': 1,
        'line-opacity': 0.5,
        'line-dasharray': [4, 3],
      },
    });
    this.map.addLayer({
      id: `${prefix}trail-line`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'trail'],
      paint: {
        'line-color': '#c5d0da',
        'line-width': 1.5,
        'line-opacity': 0.7,
      },
    });
    this.map.addLayer({
      id: `${prefix}trail-points`,
      type: 'circle',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'trail-point'],
      paint: {
        'circle-radius': 2,
        'circle-color': '#d1dae2',
        'circle-stroke-color': '#10161c',
        'circle-stroke-width': 1,
      },
    });
    this.map.addLayer({
      id: `${prefix}selection`,
      type: 'circle',
      source: sourceId,
      filter: [
        'all',
        ['==', ['get', 'kind'], 'entity'],
        ['==', ['get', 'selected'], true],
      ],
      paint: {
        'circle-radius': 15,
        'circle-color': '#ffffff',
        'circle-opacity': 0.06,
        'circle-stroke-color': '#e4e8ec',
        'circle-stroke-width': 1.5,
      },
    });
    this.map.addLayer({
      id: `${prefix}keyboard`,
      type: 'circle',
      source: sourceId,
      filter: [
        'all',
        ['==', ['get', 'kind'], 'entity'],
        ['==', ['get', 'keyboard'], true],
      ],
      paint: {
        'circle-radius': 19,
        'circle-opacity': 0,
        'circle-stroke-color': '#c8d0d9',
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.5,
      },
    });
    this.map.addLayer({
      id: symbols,
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'entity'],
      layout: {
        'icon-image': ['get', 'symbol'],
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['case', ['get', 'stale'], 0.6, 1] },
    });
    this.map.addLayer({
      id: `${prefix}labels`,
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'entity'],
      layout: {
        'icon-image': ['get', 'labelImage'],
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'icon-anchor': 'left',
        'icon-offset': [18, 0],
        'icon-padding': 3,
      },
      paint: { 'icon-opacity': ['case', ['get', 'stale'], 0.65, 1] },
    });
    this.draw();
    this.updateGrid();
  }

  private labelId(object: SceneObject) {
    return `${prefix}label-${JSON.stringify([object.label, object.affiliation, object.stale])}`;
  }

  private addImages(object: SceneObject) {
    const symbol = affiliationSymbols[object.affiliation];
    const iconId = `${prefix}${object.affiliation}`;
    if (!this.map.hasImage(iconId)) {
      const canvas = symbolCanvas(object.affiliation);
      const context = canvas.getContext('2d')!;
      this.map.addImage(iconId, context.getImageData(0, 0, 56, 56), {
        pixelRatio: 2,
      });
      this.imageIds.add(iconId);
    }
    const labelId = this.labelId(object);
    if (!this.map.hasImage(labelId)) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      const label =
        object.label.length > 36
          ? `${object.label.slice(0, 35)}…`
          : object.label;
      const text = `${label} · ${symbol.shortLabel}${object.stale ? ' · LAST KNOWN' : ''}`;
      context.font = '22px ui-monospace, Consolas, monospace';
      canvas.width = Math.ceil(context.measureText(text).width) + 12;
      canvas.height = 32;
      context.font = '22px ui-monospace, Consolas, monospace';
      context.fillStyle = 'rgba(11,16,21,0.86)';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#c6cdd4';
      context.textBaseline = 'middle';
      context.fillText(text, 6, 16);
      this.map.addImage(
        labelId,
        context.getImageData(0, 0, canvas.width, canvas.height),
        { pixelRatio: 2 },
      );
      this.imageIds.add(labelId);
    }
    return { symbol: iconId, labelImage: labelId };
  }

  private draw() {
    if (!this.active || !this.installed || !this.scene) return;
    const scene = this.scene;
    const features: Feature<Geometry>[] = scene.zones.map((zone) => ({
      type: 'Feature',
      id: JSON.stringify(zone.ref),
      properties: { kind: 'zone', zoneId: zone.ref.id },
      geometry: {
        type: 'Polygon',
        coordinates: zone.geometry.coordinates.map((ring) =>
          ring.map((point) => [...point]),
        ),
      },
    }));
    for (const path of scene.paths ?? []) {
      // Never bridge across unsupported Mercator latitudes.
      let segment: number[][] = [];
      const flush = () => {
        if (segment.length > 1)
          features.push({
            type: 'Feature',
            properties: { kind: 'trail', pathId: path.id },
            geometry: { type: 'LineString', coordinates: segment },
          });
        segment = [];
      };
      for (const point of path.points) {
        const p = point.sample.position;
        if (Math.abs(p.latitudeDeg) > 85.051129) {
          flush();
          continue;
        }
        const position = [p.longitudeDeg, p.latitudeDeg];
        segment.push(position);
        features.push({
          type: 'Feature',
          properties: {
            kind: 'trail-point',
            pointId: JSON.stringify([path.id, point.sample.timestamp]),
            pathId: path.id,
            timestamp: point.sample.timestamp,
          },
          geometry: { type: 'Point', coordinates: position },
        });
      }
      flush();
    }
    for (const object of scene.objects) {
      if (Math.abs(object.position.latitudeDeg) > 85.051129) continue;
      features.push({
        type: 'Feature',
        id: JSON.stringify(object.ref),
        properties: {
          kind: 'entity',
          entityId: object.ref.id,
          selected: object.selected,
          keyboard: object.ref.id === this.keyboardId,
          stale: object.stale,
          ...this.addImages(object),
        },
        geometry: {
          type: 'Point',
          coordinates: [
            object.position.longitudeDeg,
            object.position.latitudeDeg,
          ],
        },
      });
    }
    const signature = JSON.stringify(features);
    if (signature !== this.sourceSignature) {
      this.sourceSignature = signature;
      this.sceneDraws++;
      (this.map.getSource(sourceId) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features,
      });
    } else if (this.map.loaded()) {
      // A new frame with identical geometry is already fully represented.
      this.appliedFrameId = scene.frameId;
      this.appliedSequence = scene.sequence;
    }
    // Filters include mission identity through source replacement. Hide until worker catches up after a switch.
    const restoreFilters = () => {
      this.filterRestoreQueued = false;
      if (this.disposed || !this.installed || !this.filtersHidden) return;
      this.filtersHidden = false;
      this.map.setFilter(`${prefix}trail-line`, [
        '==',
        ['get', 'kind'],
        'trail',
      ]);
      this.map.setFilter(`${prefix}trail-points`, [
        '==',
        ['get', 'kind'],
        'trail-point',
      ]);
      this.map.setFilter(symbols, ['==', ['get', 'kind'], 'entity']);
      this.map.setFilter(`${prefix}labels`, ['==', ['get', 'kind'], 'entity']);
      this.map.setFilter(`${prefix}selection`, [
        'all',
        ['==', ['get', 'kind'], 'entity'],
        ['==', ['get', 'selected'], true],
      ]);
      this.map.setFilter(`${prefix}keyboard`, [
        'all',
        ['==', ['get', 'kind'], 'entity'],
        ['==', ['get', 'keyboard'], true],
      ]);
      this.map.setFilter(`${prefix}zone-fill`, ['==', ['get', 'kind'], 'zone']);
      this.map.setFilter(`${prefix}zone-line`, ['==', ['get', 'kind'], 'zone']);
    };
    if (this.filtersHidden && !this.filterRestoreQueued) {
      this.filterRestoreQueued = true;
      this.map.once('idle', restoreFilters);
    }
    if (!this.framed && scene.frameId) {
      if (this.initialCamera) {
        this.map.jumpTo({
          center: [
            this.initialCamera.center.longitudeDeg,
            this.initialCamera.center.latitudeDeg,
          ],
          zoom: zoomForCamera(this.initialCamera, this.container.clientWidth),
          bearing: this.initialCamera.headingTrueDeg,
          pitch: this.initialCamera.pitchFromNadirDeg ?? this.map.getPitch(),
        });
        this.initialCamera = undefined;
        this.framed = true;
      } else this.recenter();
    }
  }

  recenter() {
    if (!this.scene || this.disposed) return;
    const bounds = sceneBounds(this.scene);
    if (!bounds) return;
    this.framed = true;
    this.map.fitBounds(bounds, {
      padding: Math.max(
        24,
        Math.min(
          65,
          this.container.clientWidth * 0.14,
          this.container.clientHeight * 0.15,
        ),
      ),
      maxZoom: 14,
      duration: 0,
      bearing: 0,
    });
    this.limitCamera();
  }

  private updateGrid() {
    if (!this.active || !this.installed || this.disposed) return;
    const source = this.map.getSource(`${prefix}grid`) as
      GeoJSONSource | undefined;
    if (!source) return;
    if (this.hosted && !this.failed) {
      if (this.gridSignature !== 'empty') {
        this.gridSignature = 'empty';
        source.setData(empty);
      }
      return;
    }
    const bounds = this.map.getBounds();
    const west = Math.max(-180, bounds.getWest()),
      east = Math.min(180, bounds.getEast());
    const south = Math.max(-85, bounds.getSouth()),
      north = Math.min(85, bounds.getNorth());
    const raw = Math.max(east - west, north - south) / 8;
    const base = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-8)));
    const step = [1, 2, 5, 10]
      .map((value) => value * base)
      .find((value) => value >= raw)!;
    const features: Feature<Geometry>[] = [];
    for (let lon = Math.ceil(west / step) * step; lon <= east; lon += step)
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [lon, south],
            [lon, north],
          ],
        },
      });
    for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step)
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [
            [west, lat],
            [east, lat],
          ],
        },
      });
    const signature = JSON.stringify(features);
    if (signature !== this.gridSignature) {
      this.gridSignature = signature;
      source.setData({ type: 'FeatureCollection', features });
    }
  }

  private camera(): CameraIntent {
    const center = this.map.getCenter();
    return {
      center: { longitudeDeg: center.lng, latitudeDeg: center.lat },
      groundSpanM: groundSpan(
        this.map.getZoom(),
        center.lat,
        this.container.clientWidth,
      ),
      headingTrueDeg: this.map.getBearing(),
      pitchFromNadirDeg: this.map.getPitch(),
      projection: 'tactical',
    };
  }
  private saveCamera() {
    if (!this.active) return;
    if (!this.container.clientWidth || !this.container.clientHeight) return;
    this.limitCamera();
    if (this.scene?.missionId && this.framed && !this.disposed)
      this.callbacks.camera(this.scene.missionId, this.camera());
  }

  private onKey(event: KeyboardEvent) {
    if (!this.scene) return;
    const candidates = this.scene.objects.filter((object) => {
      const point = this.map.project([
        object.position.longitudeDeg,
        object.position.latitudeDeg,
      ]);
      return (
        point.x >= 0 &&
        point.y >= 0 &&
        point.x <= this.container.clientWidth &&
        point.y <= this.container.clientHeight
      );
    });
    if ((event.key === '[' || event.key === ']') && candidates.length) {
      event.preventDefault();
      const index = candidates.findIndex(
        (object) => object.ref.id === this.keyboardId,
      );
      const next =
        candidates[
          (index + (event.key === ']' ? 1 : -1) + candidates.length) %
            candidates.length
        ];
      this.keyboardId = next.ref.id;
      this.callbacks.announce(
        `${next.label}. ${this.mode === 'select' ? 'Press Enter to select.' : 'Switch to Select to choose this symbol.'}`,
      );
      this.draw();
    } else if (
      event.key === 'Enter' &&
      this.keyboardId &&
      this.mode === 'select'
    ) {
      event.preventDefault();
      this.callbacks.pick(this.keyboardId);
    }
  }

  private updateAttribution() {
    this.attributionObserver?.disconnect();
    if (this.attribution) this.map.removeControl(this.attribution);
    // Local OSM credits start expanded and can collapse on narrow-map drag.
    // Hosted terms (including MapTiler) require persistent on-map text.
    this.attribution = new maplibregl.AttributionControl(
      this.provider.kind === 'regional' ? {} : { compact: false },
    );
    this.map.addControl(this.attribution, 'bottom-right');
    const element = this.container.querySelector<HTMLElement>(
      '.maplibregl-ctrl-attrib',
    )!;
    this.attributionObserver = new ResizeObserver(() => {
      if (this.disposed || !this.active || !this.container.clientWidth) return;
      this.container
        .closest<HTMLElement>('.map-surface')
        ?.style.setProperty(
          '--map-credits-height',
          `${element.getBoundingClientRect().height}px`,
        );
    });
    this.attributionObserver.observe(element);
  }
  setProvider(provider: TacticalProvider) {
    if (this.disposed) return;
    this.provider = provider;
    if (!this.active) {
      this.pendingProvider = true;
      return;
    }
    this.updateAttribution();
    this.request?.abort();
    if (this.requestTimer) clearTimeout(this.requestTimer);
    if (this.readinessTimer) clearTimeout(this.readinessTimer);
    const generation = ++this.providerGeneration;
    this.failed = false;
    this.terrainFailed = false;
    if (!hasTacticalCredentials(provider)) {
      this.providerLoading = false;
      const wasHosted = this.hosted;
      this.hosted = false;
      this.callbacks.status({ kind: 'local' });
      if (wasHosted) this.replaceStyle(localStyle());
      return;
    }
    this.callbacks.status({
      kind: 'loading',
      source: provider.kind === 'regional' ? 'regional' : 'maptiler',
    });
    this.providerLoading = true;
    const controller = new AbortController();
    this.request = controller;
    this.requestTimer = setTimeout(() => controller.abort(), 8000);
    void loadHostedStyle(provider, controller.signal)
      .then((style) => {
        if (this.disposed || generation !== this.providerGeneration) return;
        this.hosted = true;
        this.replaceStyle(style);
        this.readinessTimer = setTimeout(() => {
          if (
            !this.disposed &&
            generation === this.providerGeneration &&
            this.hosted
          )
            this.fallback();
        }, 15000);
      })
      .catch(() => {
        if (!this.disposed && generation === this.providerGeneration)
          this.fallback();
      })
      .finally(() => {
        if (generation === this.providerGeneration && this.requestTimer)
          clearTimeout(this.requestTimer);
      });
  }

  private replaceStyle(style: StyleSpecification) {
    this.installed = false;
    this.map.setStyle(style, { diff: false });
  }
  private fallback() {
    if (this.disposed) return;
    if (this.readinessTimer) clearTimeout(this.readinessTimer);
    this.failed = true;
    this.providerLoading = false;
    this.hosted = false;
    this.callbacks.status({ kind: 'error' });
    this.replaceStyle(localStyle());
  }
  retryProvider() {
    if (this.provider.kind === 'regional') refreshRegionalArchives();
    this.setProvider(this.provider);
  }

  inspect() {
    const features = this.installed
      ? this.map.querySourceFeatures(sourceId)
      : [];
    return {
      missionId: this.scene?.missionId,
      retainable: this.canRetain(),
      frameId: this.appliedFrameId,
      sequence: this.appliedSequence,
      entityIds: [
        ...new Set(
          features
            .filter((f) => f.properties.kind === 'entity')
            .map((f) => f.properties.entityId as string),
        ),
      ].sort(),
      zoneIds: [
        ...new Set(
          features
            .filter((f) => f.properties.kind === 'zone')
            .map((f) => f.properties.zoneId as string),
        ),
      ].sort(),
      selectedId: this.scene?.selection.id,
      trails: (this.scene?.paths ?? []).map((p) => ({
        id: p.id,
        trackId: p.trackId,
        sourceId: p.source.id,
        positions: p.points.map((v) => v.sample.position),
        times: p.points.map((v) => v.sample.timestamp),
      })),
      // A GeoJSON observation may occur in several loaded vector tiles.
      renderedTrailPoints: new Set(
        features
          .filter((f) => f.properties.kind === 'trail-point')
          .map((f) => f.properties.pointId),
      ).size,
      region: this.scene?.region,
      presentation: { ...this.presentation },
      pitch: this.map.getPitch(),
      terrain: this.map.getTerrain(),
      terrainFailed: this.terrainFailed,
      geography:
        this.installed && this.map.getSource('regional')
          ? {
              buildings: this.map.querySourceFeatures('regional', {
                sourceLayer: 'buildings',
              }).length,
              footprintVisible: this.map.getLayer(buildingFootprints)
                ? this.map.getLayoutProperty(
                    buildingFootprints,
                    'visibility',
                  ) !== 'none'
                : false,
              extrusionsVisible: this.map.getLayer(extrusionLayer)
                ? this.map.getLayoutProperty(extrusionLayer, 'visibility') ===
                  'visible'
                : false,
              hillshadeVisible: this.map.getLayer(hillshadeLayer)
                ? this.map.getLayoutProperty(hillshadeLayer, 'visibility') !==
                  'none'
                : false,
            }
          : undefined,
      camera: this.captureCamera(),
      effectiveAt: this.scene?.effectiveAt,
      points: (this.scene?.objects ?? []).map((object) => ({
        id: object.ref.id,
        ...this.map.project([
          object.position.longitudeDeg,
          object.position.latitudeDeg,
        ]),
        affiliation: object.affiliation,
        stale: object.stale,
      })),
      ready:
        this.installed &&
        this.map.loaded() &&
        this.appliedFrameId === this.scene?.frameId,
      renderer: {
        active: this.active,
        renderedFrames: this.renderedFrames,
        sceneDraws: this.sceneDraws,
        installed: this.installed,
        loaded: this.map.loaded(),
        styleLoaded: this.map.isStyleLoaded(),
        sourceLoaded: this.installed
          ? this.map.isSourceLoaded(sourceId)
          : false,
        layers: this.map.getStyle()?.layers.map((layer) => layer.id),
      },
    };
  }

  dispose() {
    this.attributionObserver?.disconnect();
    if (this.disposed) return;
    this.saveCamera();
    this.disposed = true;
    this.providerGeneration++;
    this.request?.abort();
    if (this.requestTimer) clearTimeout(this.requestTimer);
    if (this.readinessTimer) clearTimeout(this.readinessTimer);
    if (this.rendererTimer) clearTimeout(this.rendererTimer);
    this.observer.disconnect();
    this.map.getCanvas().removeEventListener('keydown', this.keyHandler);
    this.map.remove();
    this.releaseArchives();
    this.imageIds.clear();
    counts.disposed++;
    counts.active--;
    if (probes.get(this.viewId) === this) probes.delete(this.viewId);
  }
}
