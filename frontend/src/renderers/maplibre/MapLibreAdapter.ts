import * as maplibregl from 'maplibre-gl';
import { affiliationSymbols } from '../symbology';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { GeoJSONSource, StyleSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type {
  CameraIntent,
  SceneObject,
  SceneProjection,
  RendererCallbacks,
  MapPresentation,
  SceneDestination,
} from '../contracts';
import { defaultMapPresentation } from '../contracts';
import { displayedRoutePoints } from '../../world/activePlans';
import { defaultDisplayPreferences } from '../../state/displayPreferences';
import { entityLabel, entityLabelVisible } from '../symbolCanvas';
import { constrainCamera } from '../regions';
import { acquireArchives, refreshRegionalArchives } from './archiveProtocol';
import {
  terrainSource,
  elevationSource,
  hillshadeLayer,
  extrusionLayer,
  buildingFootprints,
} from './regionalStyle';
import { boundaryColors, boundaryLabels } from '../../world/boundaryGeometry';
import {
  symbolCanvas,
  destinationCanvas,
  boundaryCaption,
} from '../symbolCanvas';
import {
  groundSpan,
  sceneBounds,
  zoomForCamera,
  wheelSpanFactor,
  localHomeCamera,
  boundsCamera,
} from '../camera';
import { MapGestures, insideRectangle, type ScreenPoint } from '../gestures';
import { DestinationAcknowledgement } from '../acknowledgement';
import {
  loadHostedStyle,
  localStyle,
  hasTacticalCredentials,
  resourceUrl,
  type TacticalProvider,
} from '../providers';

const prefix = '__sentinel-';
const destinationImageId = (d: SceneDestination, style = 'ring') =>
  `${prefix}label-destination-${JSON.stringify([d.label, d.stage, d.selected, d.outcome, style])}`;
// MapLibre 6's ESM worker must be bundled with its shared imports by Vite.
maplibregl.setWorkerUrl(workerUrl);
const sourceId = `${prefix}world`;
const symbols = `${prefix}symbols`;
const zoneFilter: maplibregl.FilterSpecification = [
  '==',
  ['get', 'kind'],
  'zone',
];
const boundaryFilters: Record<string, maplibregl.FilterSpecification> = {
  'zone-line': [
    'all',
    zoneFilter,
    [
      '!',
      [
        'in',
        ['get', 'boundaryType'],
        ['literal', ['friendly', 'patrol', 'restricted']],
      ],
    ],
  ],
  'zone-friendly': [
    'all',
    zoneFilter,
    ['==', ['get', 'boundaryType'], 'friendly'],
  ],
  'zone-patrol': ['all', zoneFilter, ['==', ['get', 'boundaryType'], 'patrol']],
  'zone-restricted': [
    'all',
    zoneFilter,
    ['==', ['get', 'boundaryType'], 'restricted'],
  ],
  'boundary-labels': ['==', ['get', 'kind'], 'boundary-label'],
  'boundary-edit-line': ['==', ['get', 'kind'], 'boundary-edit-line'],
  'boundary-handles': ['==', ['get', 'kind'], 'boundary-handle'],
  'boundary-numbers': ['==', ['get', 'kind'], 'boundary-number'],
};
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
  private mode: 'select' | 'pan' | 'destination' | 'draw' | 'vertex' = 'select';
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
  private submittedObjects: readonly SceneObject[] = [];
  private motionDeferred = false;
  private submittedFrame?: { frameId?: string; sequence?: number };
  private gridSignature?: string;
  private filtersHidden = false;
  private restoreSceneFilters?: () => void;
  private renderedFrames = 0;
  private sceneDraws = 0;
  private attribution?: maplibregl.AttributionControl;
  private attributionObserver?: ResizeObserver;
  private readonly gestures: MapGestures;
  private readonly acknowledgement: DestinationAcknowledgement;
  private temporaryPan = false;
  private focusHeightM?: number;
  private readonly wheelHandler = (event: WheelEvent) => this.onWheel(event);

  constructor(
    private readonly container: HTMLElement,
    private readonly viewId: string,
    provider: TacticalProvider,
    private readonly callbacks: RendererCallbacks,
    initialCamera?: CameraIntent,
  ) {
    this.provider = provider;
    this.initialCamera = initialCamera;
    this.focusHeightM = initialCamera?.focusHeightM;
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
      maxZoom: 24,
      clickTolerance: 5,
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
    this.map.scrollZoom.disable();
    this.map.boxZoom.disable();
    this.map.doubleClickZoom.disable();
    this.map.keyboard.disable();
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
    canvas.addEventListener('wheel', this.wheelHandler, {
      passive: false,
      capture: true,
    });
    this.acknowledgement = new DestinationAcknowledgement(container);
    this.gestures = new MapGestures(canvas, container, {
      mode: () => this.mode,
      finishBoundary: () => this.callbacks.boundaryFinish?.(),
      deleteBoundaryVertex: () => this.callbacks.boundaryDeleteVertex?.(),
      doubleClick: (point, reverse) => this.zoomAt(point, reverse ? 2 : 0.5),
      vertexDrag: (start, end) => this.dragVertex(start, end),
      pan: (temporary) => {
        this.temporaryPan = temporary;
        this.updateGestures();
      },
      click: (point, additive) => this.pick(point, additive),
      rectangle: (start, end, additive) => this.rectangle(start, end, additive),
      move: (point) => this.move(point),
      clear: () => this.callbacks.clearSelection?.(),
      cancelDestination: () => this.callbacks.cancelDestination?.(),
    });
    this.updateGestures();
    this.map.on('style.load', () => this.install());
    this.map.on('render', () => {
      this.renderedFrames++;
      this.positionAcknowledgement();
      if (!this.active || !this.installed || !this.map.isSourceLoaded(sourceId))
        return;
      if (this.rendererTimer) clearTimeout(this.rendererTimer);
      this.rendererTimer = undefined;
      if (this.submittedFrame) {
        this.appliedFrameId = this.submittedFrame.frameId;
        this.appliedSequence = this.submittedFrame.sequence;
        this.submittedFrame = undefined;
      }
      // A continuously moving scene need never emit global `idle`. Reveal the
      // new mission once its source has actually painted, independently of motion.
      this.restoreSceneFilters?.();
      this.restoreSceneFilters = undefined;
      if (this.motionDeferred && this.scene) this.setMotion(this.scene.objects);
    });
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
      for (const z of this.scene?.zones ?? [])
        current.add(
          `${prefix}label-boundary-${JSON.stringify([z.label, z.boundaryType])}`,
        );
      for (const d of this.scene?.destinations ?? [])
        current.add(
          destinationImageId(d, this.scene?.display?.destinationStyle),
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

  setMode(mode: 'select' | 'pan' | 'destination' | 'draw' | 'vertex') {
    this.gestures.cancel();
    this.mode = mode;
    this.updateGestures();
    if (mode === 'destination') {
      this.map.dragRotate.disable();
      this.map.touchPitch.disable();
    } else {
      this.map.dragRotate.enable();
      this.map.touchPitch.enable();
    }
  }
  private updateGestures() {
    const pan = this.mode === 'pan' || this.temporaryPan;
    this.map.getCanvas().style.cursor = pan ? 'grab' : 'crosshair';
    if (pan) this.map.dragPan.enable();
    else this.map.dragPan.disable();
  }
  private pick(point: ScreenPoint, additive: boolean) {
    if (!this.installed || this.disposed || !this.active) return false;
    if (this.mode === 'vertex') {
      const index = this.vertexAt(point);
      if (index >= 0) this.callbacks.boundaryVertex?.(index);
      return;
    }
    if (this.mode === 'destination' || this.mode === 'draw') {
      const position = this.map.unproject([point.x, point.y]);
      return this.callbacks.destination
        ? this.callbacks.destination(position.lng, position.lat) !== false
        : false;
    }
    const picked = this.map.queryRenderedFeatures(
      [
        [point.x - 10, point.y - 10],
        [point.x + 10, point.y + 10],
      ],
      { layers: [symbols] },
    )[0];
    if (typeof picked?.properties.entityId === 'string')
      this.callbacks.pick(picked.properties.entityId, additive);
    else if (!additive) this.callbacks.clearSelection?.();
  }
  private rectangle(start: ScreenPoint, end: ScreenPoint, additive: boolean) {
    if (!this.installed || !this.active) return;
    const pickable = new Set(
      this.map
        .queryRenderedFeatures({ layers: [symbols] })
        .map((feature) => feature.properties.entityId),
    );
    const ids = (this.scene?.objects ?? [])
      .filter((object) => {
        if (
          (this.scene?.context !== 'authoring' &&
            (!object.managed || object.affiliation !== 'friendly')) ||
          !pickable.has(object.ref.id)
        )
          return false;
        const point = this.map.project([
          object.position.longitudeDeg,
          object.position.latitudeDeg,
        ]);
        return (
          point.x >= 0 &&
          point.y >= 0 &&
          point.x <= this.container.clientWidth &&
          point.y <= this.container.clientHeight &&
          insideRectangle(point, start, end)
        );
      })
      .map((object) => object.ref.id);
    this.callbacks.selection?.(ids, additive);
  }
  projectBoundaryVertex(index: number) {
    const v = this.scene?.boundaryEdit?.vertices[index];
    return v ? this.map.project([v[0], v[1]]) : undefined;
  }
  private vertexAt(point: ScreenPoint) {
    return (
      this.scene?.boundaryEdit?.vertices.findIndex((_, i) => {
        const p = this.projectBoundaryVertex(i);
        return p && Math.hypot(point.x - p.x, point.y - p.y) <= 12;
      }) ?? -1
    );
  }
  private dragVertex(start: ScreenPoint, end: ScreenPoint) {
    const index = this.vertexAt(start);
    if (index < 0) return;
    const v = this.map.unproject([end.x, end.y]);
    this.callbacks.boundaryVertex?.(index, {
      longitude: v.lng,
      latitude: v.lat,
    });
  }
  private move(point: ScreenPoint) {
    if (!this.installed || !this.active) return;
    const position = this.map.unproject([point.x, point.y]);
    if (this.scene?.context === 'authoring' || this.scene?.boundaryInteraction)
      this.callbacks.boundaryContext?.(position.lng, position.lat, point);
    else this.callbacks.directMove?.(position.lng, position.lat);
  }
  private positionAcknowledgement() {
    this.acknowledgement.position((longitude, latitude) =>
      this.map.project([longitude, latitude]),
    );
  }
  private onWheel(event: WheelEvent) {
    if (!this.active || this.disposed) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const rect = this.map.getCanvas().getBoundingClientRect();
    this.zoomAt(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      wheelSpanFactor(event.deltaY, event.deltaMode, this.camera().groundSpanM),
    );
  }
  private zoomAt(point: ScreenPoint, factor: number) {
    if (!this.active || this.disposed) return;
    const around = this.map.unproject([point.x, point.y]);
    const camera = this.camera();
    const limited = constrainCamera(
      { ...camera, groundSpanM: camera.groundSpanM * factor },
      this.scene?.region,
    );
    // No residual animation: small trackpad events compose exactly, including reduced motion.
    this.map.easeTo({
      zoom: zoomForCamera(limited, this.container.clientWidth),
      around,
      duration: 0,
    });
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
      this.gestures.reset();
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
    this.focusHeightM = limited.focusHeightM;
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
    const changedBasemap =
      Boolean(this.scene?.localGrid) !== Boolean(scene.localGrid);
    if (changedMission || this.scene?.context !== scene.context) {
      this.gestures.reset();
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
        this.map.setFilter(`${prefix}active-route`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}destinations`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}script-intent`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        this.map.setFilter(`${prefix}zone-fill`, [
          '==',
          ['get', 'kind'],
          'none',
        ]);
        for (const layer of Object.keys(boundaryFilters))
          this.map.setFilter(`${prefix}${layer}`, [
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
    if (changedBasemap) this.setProvider(this.provider);
    if (this.installed)
      this.map.setFilter(`${prefix}script-intent`, [
        '==',
        ['get', 'kind'],
        scene.context === 'authoring' && !this.filtersHidden
          ? 'script-intent'
          : 'none',
      ]);
    this.acknowledgement.update(scene.acknowledgement);
    this.positionAcknowledgement();
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

  setMotion(objects: readonly SceneObject[]) {
    if (
      this.disposed ||
      !this.active ||
      !this.installed ||
      !this.scene ||
      this.scene.context === 'authoring'
    )
      return;
    this.scene = { ...this.scene, objects };
    // One worker/tile update at a time. Intermediate presentation samples are
    // replaceable; the next render submits the newest shared sample, never a queue
    // of old coordinates. Authoritative frames still pass through the shared store.
    if (!this.map.isSourceLoaded(sourceId)) {
      this.motionDeferred = true;
      return;
    }
    this.motionDeferred = false;
    const prior = new Map(
      this.submittedObjects.map((o) => [o.ref.id, o.position]),
    );
    const update: { id: string; newGeometry: Geometry }[] = objects
      .filter((o) => {
        const p = prior.get(o.ref.id);
        return (
          p &&
          (p.longitudeDeg !== o.position.longitudeDeg ||
            p.latitudeDeg !== o.position.latitudeDeg)
        );
      })
      .map((o) => ({
        id: JSON.stringify(o.ref),
        newGeometry: {
          type: 'Point' as const,
          coordinates: [o.position.longitudeDeg, o.position.latitudeDeg],
        },
      }));
    if (update.length) {
      for (const route of this.scene.routes ?? []) {
        const points = displayedRoutePoints(route, objects);
        if (points.some((p) => Math.abs(p.latitudeDeg) > 85.051129)) continue;
        update.push({
          id: `active-route:${route.id}`,
          newGeometry: {
            type: 'LineString',
            coordinates: points.map((p) => [p.longitudeDeg, p.latitudeDeg]),
          },
        });
      }
      (this.map.getSource(sourceId) as GeoJSONSource)?.updateData({ update });
      this.submittedObjects = objects;
      this.submittedFrame = {
        frameId: this.scene.frameId,
        sequence: this.scene.sequence,
      };
    }
  }

  private install() {
    if (this.disposed) return;
    this.installed = true;
    this.sourceSignature = undefined;
    this.submittedObjects = [];
    this.motionDeferred = false;
    this.submittedFrame = undefined;
    this.restoreSceneFilters = undefined;
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
    this.map.addLayer({
      id: `${prefix}zone-fill`,
      type: 'fill',
      source: sourceId,
      filter: zoneFilter,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#d3d9df'],
        'fill-opacity': 0.06,
      },
    });
    this.map.addLayer({
      id: `${prefix}zone-line`,
      type: 'line',
      source: sourceId,
      filter: boundaryFilters['zone-line'],
      paint: {
        'line-color': '#a4adb6',
        'line-width': 1,
        'line-opacity': 0.5,
        'line-dasharray': [4, 3],
      },
    });
    for (const kind of ['friendly', 'patrol', 'restricted'])
      this.map.addLayer({
        id: `${prefix}zone-${kind}`,
        type: 'line',
        source: sourceId,
        filter: boundaryFilters[`zone-${kind}`],
        paint: {
          'line-color': ['get', 'color'],
          'line-width': kind === 'restricted' ? 1.5 : 2,
          'line-opacity': 0.9,
          ...(kind === 'restricted'
            ? { 'line-gap-width': 2 }
            : kind === 'patrol'
              ? { 'line-dasharray': [4, 3] }
              : {}),
        },
      });
    this.map.addLayer({
      id: `${prefix}boundary-labels`,
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'boundary-label'],
      layout: {
        'icon-image': ['get', 'image'],
        'icon-anchor': 'bottom-left',
        'icon-offset': [4, -6],
        'icon-allow-overlap': false,
      },
    });
    this.map.addLayer({
      id: `${prefix}boundary-edit-line`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'boundary-edit-line'],
      paint: {
        'line-color': '#d4e2e6',
        'line-width': 2,
        'line-dasharray': [3, 2],
      },
    });
    this.map.addLayer({
      id: `${prefix}boundary-handles`,
      type: 'circle',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'boundary-handle'],
      paint: {
        'circle-radius': 6,
        'circle-color': '#142630',
        'circle-stroke-color': '#d4e2e6',
        'circle-stroke-width': 2,
      },
    });
    this.map.addLayer({
      id: `${prefix}boundary-numbers`,
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'boundary-number'],
      layout: {
        'icon-image': ['get', 'image'],
        'icon-anchor': 'bottom-left',
        'icon-offset': [4, -6],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
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
        'icon-size': ['coalesce', ['get', 'iconScale'], 1],
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
      paint: { 'icon-opacity': ['case', ['get', 'stale'], 0.7, 1] },
    });
    this.map.addLayer({
      id: `${prefix}labels`,
      type: 'symbol',
      source: sourceId,
      filter: [
        'all',
        ['==', ['get', 'kind'], 'entity'],
        ['boolean', ['get', 'labelVisible'], true],
      ],
      layout: {
        'icon-image': ['get', 'labelImage'],
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'icon-anchor': 'left',
        'icon-offset': [
          'case',
          ['get', 'nonOperational'],
          [
            'case',
            ['get', 'friendly'],
            ['literal', [18, -16]],
            ['literal', [18, 16]],
          ],
          ['literal', [18, 0]],
        ],
        'icon-padding': 3,
      },
      paint: {
        'icon-opacity': [
          'case',
          ['get', 'labelVisible'],
          ['case', ['get', 'stale'], 0.65, 1],
          0,
        ],
      },
    });
    this.map.addLayer({
      id: `${prefix}active-route`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'active-route'],
      paint: {
        'line-color': affiliationSymbols.friendly.color,
        'line-width': 1.6,
        'line-dasharray': [4, 3],
        'line-opacity': ['coalesce', ['get', 'opacity'], 0.7],
      },
    });
    this.map.addLayer({
      id: `${prefix}script-intent`,
      type: 'line',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'script-intent'],
      paint: {
        'line-color': '#a8c1c9',
        'line-width': [
          'case',
          ['boolean', ['get', 'selected'], false],
          2.7,
          1.25,
        ],
        'line-dasharray': [3, 3],
        'line-opacity': [
          'case',
          ['boolean', ['get', 'selected'], false],
          1,
          0.55,
        ],
      },
    });
    this.map.addLayer({
      id: `${prefix}destinations`,
      type: 'symbol',
      source: sourceId,
      filter: ['==', ['get', 'kind'], 'destination'],
      layout: {
        'icon-image': ['get', 'image'],
        'icon-anchor': 'left',
        'icon-offset': [-14, 0],
        'icon-pitch-alignment': 'viewport',
        'icon-rotation-alignment': 'viewport',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
    this.draw();
    this.updateGrid();
  }

  private labelId(object: SceneObject) {
    return `${prefix}label-${JSON.stringify([entityLabel(object, this.scene?.display), object.affiliation, object.stale, object.unavailable])}`;
  }

  private addImages(object: SceneObject) {
    const iconId = `${prefix}${object.affiliation}:${Boolean(object.unavailable)}:${object.condition === 'non-operational'}:${object.profileId ?? 'generic'}:${this.scene?.display?.entityStyle ?? 'minimal'}`;
    if (!this.map.hasImage(iconId)) {
      const canvas = symbolCanvas(
        object.affiliation,
        false,
        false,
        false,
        Boolean(object.unavailable),
        object.condition === 'non-operational',
        object.profileId,
        this.scene?.display?.entityStyle,
      );
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
      const text = entityLabel(object, this.scene?.display);
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
    const display = scene.display ?? defaultDisplayPreferences;
    const features: Feature<Geometry>[] = scene.zones.map((zone) => ({
      type: 'Feature',
      id: JSON.stringify(zone.ref),
      properties: {
        kind: 'zone',
        zoneId: zone.ref.id,
        boundaryType: zone.boundaryType ?? '',
        color: boundaryColors[zone.boundaryType ?? 'untyped'],
      },
      geometry: {
        type: 'Polygon',
        coordinates: zone.geometry.coordinates.map((ring) =>
          ring.map((point) => [...point]),
        ),
      },
    }));
    for (const z of scene.zones) {
      if (!z.boundaryType) continue;
      const id = `${prefix}label-boundary-${JSON.stringify([z.label, z.boundaryType])}`;
      if (!this.map.hasImage(id)) {
        const caption = boundaryCaption(
          `${z.label.length > 32 ? `${z.label.slice(0, 31)}…` : z.label}\n${boundaryLabels[z.boundaryType]}`,
          boundaryColors[z.boundaryType],
        );
        this.map.addImage(
          id,
          caption
            .getContext('2d')!
            .getImageData(0, 0, caption.width, caption.height),
          { pixelRatio: 2 },
        );
        this.imageIds.add(id);
      }
      features.push({
        type: 'Feature',
        properties: { kind: 'boundary-label', image: id },
        geometry: {
          type: 'Point',
          coordinates: [...z.geometry.coordinates[0][0]],
        },
      });
    }
    const vertices = scene.boundaryEdit?.vertices ?? [];
    if (vertices.length > 1)
      features.push({
        type: 'Feature',
        properties: { kind: 'boundary-edit-line' },
        geometry: {
          type: 'LineString',
          coordinates: vertices.map((v) => [...v]),
        },
      });
    vertices.forEach((v, index) =>
      features.push({
        type: 'Feature',
        properties: { kind: 'boundary-handle', index },
        geometry: { type: 'Point', coordinates: [...v] },
      }),
    );
    vertices.forEach((v, index) => {
      const id = `${prefix}boundary-handle-number-${index}`;
      if (!this.map.hasImage(id)) {
        const caption = boundaryCaption(String(index + 1), '#d4e2e6');
        this.map.addImage(
          id,
          caption
            .getContext('2d')!
            .getImageData(0, 0, caption.width, caption.height),
          { pixelRatio: 2 },
        );
        this.imageIds.add(id);
      }
      features.push({
        type: 'Feature',
        properties: { kind: 'boundary-number', image: id },
        geometry: { type: 'Point', coordinates: [...v] },
      });
    });
    for (const path of scene.paths ?? []) {
      // Never bridge across unsupported Mercator latitudes.
      let segment: number[][] = [];
      const flush = () => {
        if (segment.length > 1)
          features.push({
            type: 'Feature',
            properties: {
              kind: 'trail',
              pathId: path.id,
            },
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
          iconScale: display.iconSize / 28,
          labelVisible: entityLabelVisible(object, display),
          entityId: object.ref.id,
          selected: object.selected,
          keyboard: object.ref.id === this.keyboardId,
          stale: object.stale,
          nonOperational: object.condition === 'non-operational',
          friendly: object.affiliation === 'friendly',
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
    for (const route of scene.routes ?? []) {
      const points = displayedRoutePoints(route, scene.objects);
      if (points.some((p) => Math.abs(p.latitudeDeg) > 85.051129)) continue;
      features.push({
        type: 'Feature',
        id: `active-route:${route.id}`,
        properties: {
          kind: 'active-route',
          routeKind: route.kind,
          label: route.label,
          opacity: display.planOpacity,
        },
        geometry: {
          type: 'LineString',
          coordinates: points.map((p) => [p.longitudeDeg, p.latitudeDeg]),
        },
      });
    }
    for (const d of scene.destinations ?? []) {
      if (d.intentOrigin)
        features.push({
          type: 'Feature',
          id: `script-intent:${d.id}`,
          properties: { kind: 'script-intent', selected: !!d.selected },
          geometry: {
            type: 'LineString',
            coordinates: [
              [d.intentOrigin.longitudeDeg, d.intentOrigin.latitudeDeg],
              [
                (d.intentEnd ?? d.position).longitudeDeg,
                (d.intentEnd ?? d.position).latitudeDeg,
              ],
            ],
          },
        });
      const imageId = destinationImageId(d, display.destinationStyle);
      if (!this.map.hasImage(imageId)) {
        const canvas = destinationCanvas(d, display.destinationStyle);
        this.map.addImage(
          imageId,
          canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height),
          { pixelRatio: 2 },
        );
        this.imageIds.add(imageId);
      }
      features.push({
        type: 'Feature',
        id: `destination:${d.id}`,
        properties: {
          kind: 'destination',
          destinationId: d.id,
          stage: d.stage,
          image: imageId,
        },
        geometry: {
          type: 'Point',
          coordinates: [d.position.longitudeDeg, d.position.latitudeDeg],
        },
      });
    }
    // Moving coordinates use the incremental path. Replacing the entire source
    // on every health/status publication needlessly rebuilds all static geometry
    // and competes with the interpolation updates already in flight.
    const signature = JSON.stringify(
      features.map((feature) =>
        scene.context !== 'authoring' && feature.properties?.kind === 'entity'
          ? { ...feature, geometry: undefined }
          : feature,
      ),
    );
    if (signature !== this.sourceSignature) {
      this.sourceSignature = signature;
      this.sceneDraws++;
      this.submittedObjects = scene.objects;
      this.submittedFrame = {
        frameId: scene.frameId,
        sequence: scene.sequence,
      };
      (this.map.getSource(sourceId) as GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: features.map((f, i) => ({ ...f, id: f.id ?? `static:${i}` })),
      });
    } else {
      this.setMotion(scene.objects);
      if (this.map.isSourceLoaded(sourceId)) {
        // A new frame with identical geometry is already fully represented.
        this.appliedFrameId = scene.frameId;
        this.appliedSequence = scene.sequence;
      }
    }
    // Filters include mission identity through source replacement. Hide until worker catches up after a switch.
    const restoreFilters = () => {
      if (this.disposed || !this.installed || !this.filtersHidden) return;
      this.filtersHidden = false;
      this.map.setFilter(`${prefix}script-intent`, [
        '==',
        ['get', 'kind'],
        this.scene?.context === 'authoring' ? 'script-intent' : 'none',
      ]);
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
      this.map.setFilter(`${prefix}active-route`, [
        '==',
        ['get', 'kind'],
        'active-route',
      ]);
      this.map.setFilter(`${prefix}destinations`, [
        '==',
        ['get', 'kind'],
        'destination',
      ]);
      this.map.setFilter(`${prefix}labels`, [
        'all',
        ['==', ['get', 'kind'], 'entity'],
        ['boolean', ['get', 'labelVisible'], true],
      ]);
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
      for (const [layer, filter] of Object.entries(boundaryFilters))
        this.map.setFilter(`${prefix}${layer}`, filter);
    };
    if (this.filtersHidden) this.restoreSceneFilters = restoreFilters;
    if (!this.framed && (scene.frameId || scene.context === 'authoring')) {
      if (this.initialCamera) {
        this.focusHeightM = this.initialCamera.focusHeightM;
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
    const home = localHomeCamera(
      this.scene,
      this.container.clientWidth,
      this.container.clientHeight,
    );
    if (home) {
      this.framed = true;
      this.restoreCamera({ ...home, pitchFromNadirDeg: 0 });
      this.saveCamera();
      return;
    }
    this.overview();
  }
  focusSelection() {
    if (!this.scene || this.disposed) return;
    const objects = this.scene.objects.filter((object) => object.selected);
    if (!objects.length) {
      this.callbacks.announce('No located selection to focus.');
      return;
    }
    const bounds = sceneBounds({ ...this.scene, objects, zones: [] });
    if (!bounds) return;
    this.framed = true;
    this.restoreCamera({
      ...boundsCamera(
        bounds,
        this.container.clientWidth,
        this.container.clientHeight,
        250,
      ),
      pitchFromNadirDeg: this.map.getPitch(),
    });
    this.saveCamera();
  }
  overview() {
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
      maxZoom: 19,
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
      focusHeightM: this.focusHeightM,
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
        `${next.label}${next.unavailable ? `, ${next.unavailable}` : ''}. Press Enter to select.`,
      );
      this.draw();
    } else if (event.key === 'Enter' && this.mode === 'destination') {
      event.preventDefault();
      const center = this.map.getCenter();
      this.callbacks.destination?.(center.lng, center.lat);
    } else if (event.key === 'Enter' && this.keyboardId) {
      event.preventDefault();
      this.callbacks.pick(
        this.keyboardId,
        event.shiftKey || event.ctrlKey || event.metaKey,
      );
    } else if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        '+',
        '=',
        '-',
      ].includes(event.key)
    ) {
      event.preventDefault();
      if (event.key === '+' || event.key === '=' || event.key === '-') {
        const camera = this.camera();
        this.restoreCamera({
          ...camera,
          groundSpanM:
            camera.groundSpanM * (event.key === '-' ? 1.12 : 1 / 1.12),
        });
      } else {
        const x =
          event.key === 'ArrowLeft' ? -60 : event.key === 'ArrowRight' ? 60 : 0;
        const y =
          event.key === 'ArrowUp' ? -60 : event.key === 'ArrowDown' ? 60 : 0;
        this.map.panBy([x, y], { duration: 0 });
      }
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
    if (this.scene?.localGrid || !hasTacticalCredentials(provider)) {
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
      renderedPoints: features
        .filter(
          (f) => f.properties.kind === 'entity' && f.geometry.type === 'Point',
        )
        .map((f) => ({
          id: f.properties.entityId,
          coordinates:
            f.geometry.type === 'Point' ? f.geometry.coordinates : [],
        })),
      selectedIds: this.scene?.objects
        .filter((o) => o.selected)
        .map((o) => o.ref.id),
      destinations: this.scene?.destinations,
      routes: this.scene?.routes,
      display: this.scene?.display,
      scriptIntents: features.filter(
        (f) => f.properties.kind === 'script-intent',
      ).length,
      destinationImagesReady: (this.scene?.destinations ?? []).every((d) =>
        this.map.hasImage(
          destinationImageId(d, this.scene?.display?.destinationStyle),
        ),
      ),
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
        managed: object.managed,
        unavailable: object.unavailable,
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
    this.gestures.dispose();
    this.acknowledgement.dispose();
    this.map.getCanvas().removeEventListener('keydown', this.keyHandler);
    this.map.getCanvas().removeEventListener('wheel', this.wheelHandler, true);
    this.map.remove();
    this.releaseArchives();
    this.imageIds.clear();
    counts.disposed++;
    counts.active--;
    if (probes.get(this.viewId) === this) probes.delete(this.viewId);
  }
}
