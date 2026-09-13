import {
  Viewer,
  Cartesian2,
  Cartesian3,
  Cartographic,
  Color,
  EllipsoidTerrainProvider,
  GridImageryProvider,
  IonResource,
  CesiumTerrainProvider,
  Cesium3DTileset,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Entity,
  ConstantPositionProperty,
  PolygonHierarchy,
  HeightReference,
  BillboardCollection,
  type Billboard,
  LabelGraphics,
  PolygonGraphics,
  PolylineGraphics,
  PointGraphics,
  PolylineDashMaterialProperty,
  ArcType,
  HorizontalOrigin,
  LabelStyle,
  HeadingPitchRange,
  Matrix4,
  JulianDate,
  Math as CesiumMath,
  PerspectiveFrustum,
  SceneTransforms,
  sampleTerrainMostDetailed,
  type ImageryLayer,
  CameraEventType,
  Resource,
  Credit,
  SkyAtmosphere,
  DirectionalLight,
  SunLight,
  DynamicAtmosphereLightingType,
} from 'cesium';
import type {
  CameraIntent,
  MapRenderer,
  RendererCallbacks,
  SceneProjection,
  SpatialStatus,
  MapPresentation,
} from '../contracts';
import { sceneBounds } from '../camera';
import { constrainCamera } from '../regions';
import { defaultMapPresentation } from '../contracts';
import { affiliationSymbols } from '../symbology';
import { symbolCanvas } from '../symbolCanvas';
import { visualHeight } from './altitude';
import type { CesiumProvider } from './config';
import { ionImagery } from './ionImagery';
import { RequestRecovery } from './requestRecovery';
import { presentCredits } from './attribution';

const counts = { created: 0, disposed: 0, active: 0 };
const probes = new Map<string, CesiumAdapter>();
if (import.meta.env.MODE === 'verification')
  Object.assign(window, {
    __sentinelCesiumTest: {
      inspect: (id: string) => probes.get(id)?.inspect(),
      stats: () => ({ ...counts }),
      setProvider: (id: string, provider: CesiumProvider) =>
        probes.get(id)?.setProvider(provider),
      setCamera: (id: string, camera: CameraIntent) =>
        probes.get(id)?.restoreCamera(camera),
      setPresentation: (id: string, options: MapPresentation) =>
        probes.get(id)?.setPresentation(options),
      failTile: (id: string) => probes.get(id)?.injectFailure('tile'),
      failRenderer: (id: string, reason: 'context-lost' | 'render-exception') =>
        probes.get(id)?.injectFailure(reason),
    },
  });
type Layer = 'imagery' | 'terrain' | 'buildings';
const initialSpatial = (): SpatialStatus => ({
  displayedBase: 'local',
  imagery: 'local',
  terrain: 'local',
  buildings: 'local',
  approximateHeights: 0,
  unavailableHeights: 0,
  surfaceZones: 0,
  unavailableZones: 0,
});

/** Renderer-owned WebGL/resources only. The complete shared scene is its sole world input. */
export class CesiumAdapter implements MapRenderer {
  private readonly viewer: Viewer;
  private readonly observer: ResizeObserver;
  private readonly input: ScreenSpaceEventHandler;
  private readonly billboards: BillboardCollection;
  private readonly markers = new Map<string, Billboard>();
  private pendingSymbols = false;
  private readonly removers: (() => void)[] = [];
  private layerRemovers: Record<Layer, (() => void)[]> = {
    imagery: [],
    terrain: [],
    buildings: [],
  };
  private timers = new Map<Layer, ReturnType<typeof setTimeout>>();
  private readonly layerGenerations: Record<Layer, number> = {
    imagery: 0,
    terrain: 0,
    buildings: 0,
  };
  private scene?: SceneProjection;
  private framed = false;
  private disposed = false;
  private bookmark?: CameraIntent;
  private generation = 0;
  private missionGeneration = 0;
  private mode: 'select' | 'pan' = 'select';
  private keyboardId?: string;
  private spatial = initialSpatial();
  private imagery?: ImageryLayer;
  private buildings?: Cesium3DTileset;
  private terrain?: CesiumTerrainProvider;
  private terrainHeights = new Map<string, number | null>();
  private sampling = new Set<string>();
  private symbols = new Map<string, HTMLCanvasElement>();
  private appliedFrameId?: string;
  private engineReady = false;
  private resourceFailed = false;
  private renderDeadline?: ReturnType<typeof setTimeout>;
  private zoneSignatures = new Map<string, string>();
  private trailSignatures = new Map<string, string>();
  private keyHandler = (event: KeyboardEvent) => this.onKey(event);
  private presentation: MapPresentation = { ...defaultMapPresentation };
  private photorealistic?: Cesium3DTileset;
  private photoRemovers: (() => void)[] = [];
  private photoTimer?: ReturnType<typeof setTimeout>;
  private photoVisibleTiles = 0;
  private photoFailures = 0;
  private renderedFrames = 0;
  private constraining = false;
  private active = true;
  private pendingScene?: { scene: SceneProjection; bookmark?: CameraIntent };
  private pendingPresentation?: MapPresentation;
  private lightingKey = '';
  private constraintPosition = new Cartesian3();
  private constraintDirection = new Cartesian3();
  private constraintViewport = '';
  private readonly markerSignatures = new Map<string, string>();
  private readonly labelSignatures = new Map<string, string>();
  private readonly imageKeys = new Map<string, string>();
  private drawCount = 0;
  private labelUpdates = 0;
  private symbolUpdates = 0;
  private environmentLoads = 0;
  private requestRecovery?: RequestRecovery;
  private recoveryTask?: ReturnType<typeof setTimeout>;
  private pendingCamera?: CameraIntent;
  private readonly failures: { at: string; stage: string; code: string }[] = [];
  private readonly failureTasks = new Set<ReturnType<typeof setTimeout>>();
  private readonly pendingLayerFailures = new Set<string>();

  constructor(
    private readonly container: HTMLElement,
    private readonly viewId: string,
    private provider: CesiumProvider,
    private readonly callbacks: RendererCallbacks,
    initialCamera?: CameraIntent,
  ) {
    this.bookmark = initialCamera;
    this.viewer = new Viewer(container, {
      // Never allow Viewer to implicitly subscribe to default imagery or geocoding.
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      animation: false,
      timeline: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      shouldAnimate: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
      skyBox: false,
      skyAtmosphere: new SkyAtmosphere(),
      shadows: false,
      orderIndependentTranslucency: false,
      useBrowserRecommendedResolution: false,
      showRenderLoopErrors: false,
      creditViewport: container,
    });
    this.removers.push(
      presentCredits(this.viewer, container, () => this.photorealistic),
    );
    this.viewer.scene.backgroundColor = Color.fromCssColorString('#0b1015');
    this.viewer.scene.globe.baseColor = Color.fromCssColorString('#10171d');
    this.viewer.scene.globe.showGroundAtmosphere = true;
    this.viewer.scene.globe.enableLighting = true;
    this.viewer.scene.globe.maximumScreenSpaceError = 1.5;
    this.viewer.scene.globe.dynamicAtmosphereLighting = false;
    this.viewer.scene.atmosphere.dynamicLighting =
      DynamicAtmosphereLightingType.NONE;
    this.viewer.scene.globe.depthTestAgainstTerrain = true;
    this.billboards = this.viewer.scene.primitives.add(
      new BillboardCollection({ scene: this.viewer.scene }),
    );
    const owner = container.ownerDocument.defaultView!;
    const resize = () => {
      if (this.disposed || !this.active) return;
      // Crisp at common scaling, bounded at two device pixels per CSS pixel.
      this.viewer.resolutionScale = Math.min(
        1,
        2 / Math.max(1, owner.devicePixelRatio),
      );
      this.viewer.resize();
      this.viewer.scene.requestRender();
    };
    resize();
    owner.addEventListener('resize', resize);
    this.removers.push(() => owner.removeEventListener('resize', resize));
    this.viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20;
    this.viewer.scene.screenSpaceCameraController.maximumTiltAngle =
      CesiumMath.toRadians(70);
    this.viewer.scene.screenSpaceCameraController.maximumZoomDistance = 20_000_000;
    this.viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
    this.viewer.scene.screenSpaceCameraController.tiltEventTypes = [
      CameraEventType.RIGHT_DRAG,
    ];
    this.viewer.scene.screenSpaceCameraController.zoomEventTypes = [
      CameraEventType.WHEEL,
      CameraEventType.PINCH,
    ];
    this.viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      ScreenSpaceEventType.LEFT_DOUBLE_CLICK,
    );
    this.viewer.imageryLayers.addImageryProvider(
      new GridImageryProvider({
        cells: 4,
        canvasSize: 512,
        color: new Color(0.5, 0.56, 0.62, 0.055),
        glowWidth: 0,
        glowColor: Color.TRANSPARENT,
        backgroundColor: Color.fromCssColorString('#10171d'),
      }),
    );
    const canvas = this.viewer.canvas;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3D map');
    canvas.setAttribute(
      'aria-describedby',
      `map-help-${viewId.replace(':', '-')}`,
    );
    canvas.addEventListener('keydown', this.keyHandler);
    this.input = new ScreenSpaceEventHandler(canvas);
    this.input.setInputAction((event: { position: Cartesian2 }) => {
      if (this.mode !== 'select') return;
      const picked = this.viewer.scene.pick(event.position);
      if (picked?.id instanceof Entity) {
        const object = this.scene?.objects.find(
          (o) => JSON.stringify(o.ref) === picked.id.id,
        );
        if (object) this.callbacks.pick(object.ref.id);
      }
    }, ScreenSpaceEventType.LEFT_CLICK);
    this.removers.push(
      this.viewer.camera.moveEnd.addEventListener(() => this.saveCamera()),
    );
    this.removers.push(
      this.viewer.scene.postRender.addEventListener(() => {
        this.renderedFrames++;
        this.checkReadiness();
      }),
    );
    this.removers.push(
      this.viewer.scene.preUpdate.addEventListener(() => {
        this.limitCamera();
      }),
    );
    this.removers.push(
      this.viewer.scene.preRender.addEventListener(() => {
        this.photoVisibleTiles = 0;
      }),
    );
    this.removers.push(
      this.viewer.scene.renderError.addEventListener(
        (_scene, error: unknown) => {
          // Preserve classification, never provider URLs, response bodies or tokens.
          this.recordFailure(
            'render',
            error instanceof Error ? error.name : 'RenderError',
          );
          this.rendererFailure('renderer-error', 'render-exception');
        },
      ),
    );
    const contextLost = (event: Event) => {
      event.preventDefault();
      this.recordFailure('context', 'WEBGL_CONTEXT_LOST');
      this.rendererFailure('renderer-error', 'context-lost');
    };
    canvas.addEventListener('webglcontextlost', contextLost);
    this.removers.push(() =>
      canvas.removeEventListener('webglcontextlost', contextLost),
    );
    this.observer = new ResizeObserver(() => {
      if (
        this.disposed ||
        !this.active ||
        !container.clientWidth ||
        !container.clientHeight
      )
        return;
      resize();
      this.saveCamera();
    });
    this.observer.observe(container);
    this.restoreCamera(
      initialCamera ?? {
        center: { longitudeDeg: 103.85, latitudeDeg: 1.35 },
        groundSpanM: 25000,
        headingTrueDeg: 0,
      },
    );
    counts.created++;
    counts.active++;
    probes.set(viewId, this);
    // Warm local globe/geometry before starting hosted layers, so missing workers
    // cannot be misreported as a provider/network delay or a complete scene.
    this.callbacks.status({ kind: 'loading' });
    this.watchReadiness();
  }

  private watchReadiness() {
    if (
      this.renderDeadline ||
      this.resourceFailed ||
      this.disposed ||
      !this.active
    )
      return;
    this.renderDeadline = setTimeout(
      () => {
        this.renderDeadline = undefined;
        if (this.disposed || !this.active) return;
        // Cesium's shared worker handshake can remain pending after a blocked asset.
        // Recreating a Viewer cannot repair that module-level promise; reload is explicit.
        this.rendererFailure(
          this.engineReady ? 'renderer-error' : 'renderer-timeout',
          this.engineReady ? 'geometry-delay' : 'initial-geometry',
        );
      },
      this.engineReady ? 15000 : 8000,
    );
  }
  private recordFailure(stage: string, code: string) {
    this.failures.push({
      at: new Date().toISOString(),
      stage,
      code: /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : 'RendererError',
    });
    if (this.failures.length > 20) this.failures.shift();
  }
  private rendererFailure(
    kind: 'renderer-error' | 'renderer-timeout',
    reason:
      | 'context-lost'
      | 'render-exception'
      | 'initial-geometry'
      | 'geometry-delay',
  ) {
    if (this.disposed) return;
    this.recordFailure('renderer', reason);
    this.resourceFailed = true;
    this.appliedFrameId = undefined;
    clearTimeout(this.renderDeadline);
    this.renderDeadline = undefined;
    this.viewer.useDefaultRenderLoop = false;
    this.callbacks.status({
      kind,
      reason,
      recoverable: reason !== 'initial-geometry',
    });
  }
  private checkReadiness() {
    if (this.disposed || this.resourceFailed || !this.active) return;
    // Canvas textures upload asynchronously. Entity visualizers report ready
    // before those uploads finish; public Billboard.ready lets us wait for the
    // real resources. Commit one further render after readiness so the updated
    // texture coordinates have reached the framebuffer, then return to idle.
    if (this.pendingSymbols) {
      const ready = [...this.markers.values()].every((marker) => marker.ready);
      this.pendingSymbols = !ready;
      this.viewer.scene.requestRender();
      this.watchReadiness();
      return;
    }
    const complete =
      this.viewer.dataSourceDisplay.ready &&
      (this.engineReady || this.viewer.scene.globe.tilesLoaded);
    if (!complete) {
      this.watchReadiness();
      return;
    }
    clearTimeout(this.renderDeadline);
    this.renderDeadline = undefined;
    this.appliedFrameId = this.scene?.frameId;
    if (!this.engineReady) {
      this.engineReady = true;
      this.setProvider(this.provider);
    }
  }

  setMode(mode: 'select' | 'pan') {
    this.mode = mode;
    this.viewer.canvas.style.cursor = mode === 'pan' ? 'grab' : '';
  }
  captureCamera() {
    return this.active ? this.camera() : this.bookmark;
  }
  retainedBytes() {
    return (
      (this.photorealistic?.totalMemoryUsageInBytes ?? 0) +
      (this.buildings?.totalMemoryUsageInBytes ?? 0)
    );
  }
  canRetain() {
    return (
      !this.disposed &&
      this.engineReady &&
      !this.resourceFailed &&
      !this.pendingSymbols &&
      this.viewer.dataSourceDisplay.ready &&
      (!this.viewer.scene.globe.show || this.viewer.scene.globe.tilesLoaded) &&
      (!this.photorealistic || this.photorealistic.tilesLoaded) &&
      (!this.buildings || this.buildings.tilesLoaded) &&
      !this.requestRecovery?.snapshot().pending &&
      !this.spatial.degraded &&
      ![
        this.spatial.imagery,
        this.spatial.terrain,
        this.spatial.buildings,
        this.spatial.photorealistic,
      ].some((state) => state === 'loading' || state === 'error')
    );
  }
  setActive(active: boolean) {
    if (this.disposed || active === this.active) return;
    if (!active) {
      this.saveCamera();
      this.viewer.camera.cancelFlight();
      this.active = false;
      this.viewer.useDefaultRenderLoop = false;
      if (this.photorealistic) this.photorealistic.show = false;
      if (this.buildings) this.buildings.show = false;
      clearTimeout(this.renderDeadline);
      this.renderDeadline = undefined;
      this.requestRecovery?.setActive(false);
      return;
    }
    this.active = true;
    this.viewer.resize();
    this.requestRecovery?.setActive(true);
    const presentation = this.pendingPresentation;
    this.pendingPresentation = undefined;
    if (presentation) this.setPresentation(presentation);
    const pending = this.pendingScene;
    this.pendingScene = undefined;
    if (pending) this.setScene(pending.scene, pending.bookmark);
    const camera = this.pendingCamera;
    this.pendingCamera = undefined;
    if (camera) this.restoreCamera(camera);
    if (this.photorealistic) this.photorealistic.show = true;
    if (this.buildings) this.buildings.show = true;
    if (!this.resourceFailed) {
      this.viewer.useDefaultRenderLoop = true;
      this.viewer.scene.requestRender();
    }
  }
  setScene(scene: SceneProjection, bookmark?: CameraIntent) {
    if (!this.active) {
      this.pendingScene = { scene, bookmark };
      return;
    }
    const changed = scene.missionId !== this.scene?.missionId;
    if (changed) {
      this.missionGeneration++;
      this.framed = false;
      this.bookmark = bookmark ?? (this.scene ? undefined : this.bookmark);
      this.keyboardId = undefined;
      this.terrainHeights.clear();
      this.sampling.clear();
      this.viewer.entities.removeAll();
      this.billboards.removeAll();
      this.markers.clear();
      this.zoneSignatures.clear();
      this.trailSignatures.clear();
      this.markerSignatures.clear();
      this.labelSignatures.clear();
      this.imageKeys.clear();
      this.appliedFrameId = undefined;
    }
    this.scene = scene;
    if (scene.effectiveAt)
      this.viewer.clock.currentTime = JulianDate.fromIso8601(scene.effectiveAt);
    this.viewer.clock.shouldAnimate = false;
    this.draw();
    if (!this.framed && scene.frameId) {
      if (this.bookmark) {
        this.restoreCamera(this.bookmark);
        this.framed = true;
      } else this.recenter();
    }
    this.applyLighting();
  }
  private publish() {
    if (!this.disposed) this.callbacks.spatial?.({ ...this.spatial });
  }
  private draw() {
    if (this.disposed || !this.scene || !this.active || this.resourceFailed)
      return;
    this.drawCount++;
    let symbolsChanged = false;
    const scene = this.scene;
    const activeSampleKeys = new Set(
      scene.objects
        .filter((object) => object.position.altitude.reference === 'AGL')
        .map(
          (object) =>
            `${scene.missionId}:${object.position.longitudeDeg}:${object.position.latitudeDeg}`,
        ),
    );
    for (const key of this.terrainHeights.keys())
      if (!activeSampleKeys.has(key)) this.terrainHeights.delete(key);
    const collection = this.viewer.entities;
    const retained = new Set<string>();
    this.spatial.approximateHeights = 0;
    this.spatial.unavailableHeights = 0;
    this.spatial.surfaceZones = 0;
    this.spatial.unavailableZones = 0;
    collection.suspendEvents();
    try {
      for (const object of scene.objects) {
        const position = object.position;
        const sampleKey = `${scene.missionId}:${position.longitudeDeg}:${position.latitudeDeg}`;
        const height = visualHeight(
          position.altitude,
          this.terrainHeights.get(sampleKey) ?? undefined,
        );
        if (!height) {
          this.spatial.unavailableHeights++;
          if (position.altitude.reference === 'AGL')
            this.sampleGround(
              sampleKey,
              position.longitudeDeg,
              position.latitudeDeg,
            );
          continue;
        }
        if (height.quality === 'approximate-msl')
          this.spatial.approximateHeights++;
        const id = JSON.stringify(object.ref);
        retained.add(id);
        const imageKey = `${object.affiliation}:${object.selected}:${object.ref.id === this.keyboardId}:${object.stale}`;
        if (!this.symbols.has(imageKey))
          this.symbols.set(
            imageKey,
            symbolCanvas(
              object.affiliation,
              object.selected,
              object.ref.id === this.keyboardId,
              object.stale,
            ),
          );
        const entity = collection.getById(id) ?? collection.add({ id });
        const positionKey = `${position.longitudeDeg}:${position.latitudeDeg}:${height.metres}`;
        let marker = this.markers.get(id);
        if (this.markerSignatures.get(id) !== positionKey || !marker) {
          const cartesian = Cartesian3.fromDegrees(
            position.longitudeDeg,
            position.latitudeDeg,
            height.metres,
          );
          if (entity.position instanceof ConstantPositionProperty)
            entity.position.setValue(cartesian);
          else entity.position = new ConstantPositionProperty(cartesian);
          if (!marker) {
            marker = this.billboards.add({
              id: entity,
              position: cartesian,
              width: 28,
              height: 28,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
            this.markers.set(id, marker);
          } else marker.position = cartesian;
          this.markerSignatures.set(id, positionKey);
        }
        // Stable keys share uploaded glyphs; only renderer resources are cached.
        if (this.imageKeys.get(id) !== imageKey) {
          marker!.setImage(imageKey, this.symbols.get(imageKey)!);
          this.imageKeys.set(id, imageKey);
          symbolsChanged = true;
          this.symbolUpdates++;
        }
        const labelKey = `${object.label}:${object.affiliation}:${object.stale}`;
        if (this.labelSignatures.get(id) !== labelKey) {
          this.labelSignatures.set(id, labelKey);
          this.labelUpdates++;
          entity.label = new LabelGraphics({
            text: `${object.label.length > 36 ? `${object.label.slice(0, 35)}…` : object.label} · ${affiliationSymbols[object.affiliation].shortLabel}${object.stale ? ' · LAST KNOWN' : ''}`,
            font: '11px Consolas, monospace',
            fillColor: Color.fromCssColorString(
              object.stale ? '#8a949e' : '#c6cfd7',
            ),
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Color.fromCssColorString('#0b1015'),
            outlineWidth: 3,
            showBackground: true,
            backgroundColor:
              Color.fromCssColorString('#0b1015').withAlpha(0.88),
            backgroundPadding: new Cartesian2(5, 3),
            horizontalOrigin: HorizontalOrigin.LEFT,
            pixelOffset: new Cartesian2(18, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          });
        }
      }
      for (const path of scene.paths ?? []) {
        // No invented AGL history heights. MSL keeps the existing explicit N=0
        // approximation, visually distinguished from resolved ellipsoid segments.
        let positions: Cartesian3[] = [],
          approximate = false,
          part = 0;
        const flush = () => {
          if (positions.length > 1) {
            const id = JSON.stringify({
              kind: 'observed-trail',
              id: path.id,
              part: part++,
            });
            retained.add(id);
            const signature = JSON.stringify([positions, approximate]);
            if (this.trailSignatures.get(id) !== signature) {
              this.trailSignatures.set(id, signature);
              const entity = collection.getById(id) ?? collection.add({ id });
              const color = Color.fromCssColorString('#ccd6df').withAlpha(0.8);
              const material = approximate
                ? new PolylineDashMaterialProperty({ color, dashLength: 12 })
                : color;
              entity.polyline = new PolylineGraphics({
                positions,
                arcType: ArcType.NONE,
                width: 1.5,
                material,
                depthFailMaterial: material,
                clampToGround: false,
              });
            }
          }
          positions = [];
          approximate = false;
        };
        for (const point of path.points) {
          const p = point.sample.position,
            height = visualHeight(p.altitude);
          if (!height) {
            flush();
            continue;
          }
          approximate ||= height.quality === 'approximate-msl';
          const position = Cartesian3.fromDegrees(
            p.longitudeDeg,
            p.latitudeDeg,
            height.metres,
          );
          positions.push(position);
          const pointId = JSON.stringify({
            kind: 'observed-point',
            path: path.id,
            at: point.sample.timestamp,
          });
          retained.add(pointId);
          const pointSignature = JSON.stringify(position);
          if (this.trailSignatures.get(pointId) !== pointSignature) {
            this.trailSignatures.set(pointId, pointSignature);
            const entity =
              collection.getById(pointId) ?? collection.add({ id: pointId });
            entity.position = new ConstantPositionProperty(position);
            entity.point = new PointGraphics({
              pixelSize: 3,
              color: Color.fromCssColorString('#ccd6df'),
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            });
          }
        }
        flush();
      }
      for (const zone of scene.zones) {
        const id = JSON.stringify(zone.ref);
        retained.add(id);
        const entity = collection.getById(id) ?? collection.add({ id });
        const rings = zone.geometry.coordinates.map((ring) =>
          ring.map((point) => Cartesian3.fromDegrees(point[0], point[1])),
        );
        const lower = zone.altitudeBand
          ? visualHeight(zone.altitudeBand.lower)
          : undefined;
        const upper = zone.altitudeBand
          ? visualHeight(zone.altitudeBand.upper)
          : undefined;
        const volume = lower && upper;
        if (
          volume &&
          (lower.quality === 'approximate-msl' ||
            upper.quality === 'approximate-msl')
        )
          this.spatial.approximateHeights++;
        if (!volume) this.spatial.surfaceZones++;
        if (zone.altitudeBand && !volume) this.spatial.unavailableZones++;
        const signature = JSON.stringify([zone.geometry, zone.altitudeBand]);
        if (this.zoneSignatures.get(id) === signature) continue;
        this.zoneSignatures.set(id, signature);
        entity.polygon = new PolygonGraphics({
          hierarchy: new PolygonHierarchy(
            rings[0],
            rings.slice(1).map((ring) => new PolygonHierarchy(ring)),
          ),
          material: Color.fromCssColorString('#bbc4ce').withAlpha(
            volume ? 0.08 : 0.06,
          ),
          height: volume ? lower.metres : 0,
          extrudedHeight: volume ? upper.metres : undefined,
          heightReference: volume
            ? HeightReference.NONE
            : HeightReference.CLAMP_TO_GROUND,
          outline: false,
        });
        entity.polyline = new PolylineGraphics({
          positions: rings[0],
          width: 1,
          material: Color.fromCssColorString('#8e99a5').withAlpha(0.65),
          clampToGround: true,
        });
      }
      for (const entity of [...collection.values])
        if (!retained.has(entity.id)) {
          collection.remove(entity);
          const marker = this.markers.get(entity.id);
          if (marker) this.billboards.remove(marker);
          this.markers.delete(entity.id);
          this.zoneSignatures.delete(entity.id);
          this.trailSignatures.delete(entity.id);
          this.markerSignatures.delete(entity.id);
          this.labelSignatures.delete(entity.id);
          this.imageKeys.delete(entity.id);
        }
    } finally {
      collection.resumeEvents();
    }
    this.pendingSymbols ||= symbolsChanged;
    this.appliedFrameId = undefined;
    this.watchReadiness();
    this.viewer.scene.requestRender();
    this.publish();
  }
  private sampleGround(key: string, longitude: number, latitude: number) {
    if (
      !this.terrain ||
      this.spatial.terrain !== 'ready' ||
      this.sampling.has(key) ||
      this.terrainHeights.has(key)
    )
      return;
    const generation = this.generation,
      missionGeneration = this.missionGeneration,
      terrainGeneration = this.layerGenerations.terrain;
    this.sampling.add(key);
    void sampleTerrainMostDetailed(this.terrain, [
      Cartographic.fromDegrees(longitude, latitude),
    ])
      .then(([point]) => {
        if (
          this.disposed ||
          generation !== this.generation ||
          terrainGeneration !== this.layerGenerations.terrain ||
          missionGeneration !== this.missionGeneration
        )
          return;
        this.terrainHeights.set(
          key,
          Number.isFinite(point.height) ? point.height : null,
        );
        this.draw();
      })
      .catch(() => {
        if (
          !this.disposed &&
          generation === this.generation &&
          terrainGeneration === this.layerGenerations.terrain &&
          missionGeneration === this.missionGeneration
        )
          this.terrainHeights.set(key, null);
      })
      .finally(() => {
        if (
          generation === this.generation &&
          terrainGeneration === this.layerGenerations.terrain &&
          missionGeneration === this.missionGeneration
        )
          this.sampling.delete(key);
      });
  }
  recenter() {
    const bounds = this.scene && sceneBounds(this.scene);
    if (!bounds) return;
    const longitude = (bounds[0][0] + bounds[1][0]) / 2,
      latitude = (bounds[0][1] + bounds[1][1]) / 2;
    const width =
      (bounds[1][0] - bounds[0][0]) *
      111320 *
      Math.cos((latitude * Math.PI) / 180);
    const height = (bounds[1][1] - bounds[0][1]) * 111320;
    this.restoreCamera({
      center: { longitudeDeg: longitude, latitudeDeg: latitude },
      groundSpanM:
        Math.max(
          1200,
          width,
          (height * this.container.clientWidth) /
            Math.max(1, this.container.clientHeight),
        ) * 1.65,
      headingTrueDeg: 0,
    });
    this.framed = true;
    this.saveCamera();
  }
  private horizontalFov() {
    const frustum = this.viewer.camera.frustum as PerspectiveFrustum;
    return (
      2 *
      Math.atan(
        Math.tan((frustum.fovy ?? Math.PI / 3) / 2) *
          (frustum.aspectRatio ?? 1),
      )
    );
  }
  restoreCamera(input: CameraIntent) {
    if (!this.active) {
      this.pendingCamera = { ...input, center: { ...input.center } };
      return;
    }
    const camera = constrainCamera(input, this.scene?.region);
    const range = Math.max(
      25,
      camera.groundSpanM / (2 * Math.tan(this.horizontalFov() / 2)),
    );
    this.viewer.camera.lookAt(
      Cartesian3.fromDegrees(
        camera.center.longitudeDeg,
        camera.center.latitudeDeg,
      ),
      new HeadingPitchRange(
        CesiumMath.toRadians(camera.headingTrueDeg),
        CesiumMath.toRadians((camera.pitchFromNadirDeg ?? 35) - 90),
        range,
      ),
    );
    this.viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    this.bookmark = { ...camera, center: { ...camera.center } };
    this.viewer.scene.requestRender();
    this.applyLighting();
  }
  private camera(): CameraIntent | undefined {
    const viewer = this.viewer;
    // Focus is the ellipsoid intersection, independent of asynchronous terrain LOD.
    const target = viewer.camera.pickEllipsoid(
      new Cartesian2(
        viewer.canvas.clientWidth / 2,
        viewer.canvas.clientHeight / 2,
      ),
      viewer.scene.globe.ellipsoid,
    );
    if (!target) return this.bookmark; // Looking above the horizon preserves the last geographic focus.
    const point = Cartographic.fromCartesian(target);
    return {
      center: {
        longitudeDeg: CesiumMath.toDegrees(point.longitude),
        latitudeDeg: CesiumMath.toDegrees(point.latitude),
      },
      groundSpanM:
        2 *
        Cartesian3.distance(viewer.camera.positionWC, target) *
        Math.tan(this.horizontalFov() / 2),
      headingTrueDeg: CesiumMath.toDegrees(viewer.camera.heading),
      pitchFromNadirDeg: 90 + CesiumMath.toDegrees(viewer.camera.pitch),
      projection: 'three-d',
    };
  }
  private saveCamera() {
    if (
      this.disposed ||
      !this.active ||
      !this.framed ||
      !this.scene?.missionId ||
      !this.container.clientWidth ||
      !this.container.clientHeight
    )
      return;
    const camera = this.camera();
    if (camera) {
      this.bookmark = camera;
      this.callbacks.camera(this.scene.missionId, camera);
      this.applyLighting();
    }
  }
  private limitCamera() {
    if (
      this.disposed ||
      !this.active ||
      this.constraining ||
      !this.framed ||
      !this.scene?.region
    )
      return;
    const native = this.viewer.camera;
    const viewport = `${this.viewer.canvas.clientWidth}:${this.viewer.canvas.clientHeight}:${this.horizontalFov()}`;
    if (
      Cartesian3.equals(native.positionWC, this.constraintPosition) &&
      Cartesian3.equals(native.directionWC, this.constraintDirection) &&
      viewport === this.constraintViewport
    )
      return;
    this.constraintViewport = viewport;
    Cartesian3.clone(native.positionWC, this.constraintPosition);
    Cartesian3.clone(native.directionWC, this.constraintDirection);
    const camera = this.camera();
    if (!camera) return;
    const limited = constrainCamera(camera, this.scene.region);
    if (
      Math.abs(camera.center.longitudeDeg - limited.center.longitudeDeg) <
        1e-6 &&
      Math.abs(camera.center.latitudeDeg - limited.center.latitudeDeg) < 1e-6 &&
      Math.abs(camera.groundSpanM - limited.groundSpanM) < 0.5
    )
      return;
    this.constraining = true;
    this.restoreCamera(limited);
    this.constraining = false;
  }
  private applyLighting() {
    if (!this.viewer || this.disposed || !this.active) return;
    const scene = this.viewer.scene;
    const focus = this.bookmark?.center ?? {
      longitudeDeg: 103.85,
      latitudeDeg: 1.35,
    };
    const key = this.presentation.daylight
      ? `${focus.longitudeDeg}:${focus.latitudeDeg}`
      : 'sun';
    if (key === this.lightingKey) return;
    this.lightingKey = key;
    if (this.presentation.daylight) {
      const normal = scene.globe.ellipsoid.geodeticSurfaceNormal(
        Cartesian3.fromDegrees(focus.longitudeDeg, focus.latitudeDeg),
      );
      scene.light = new DirectionalLight({
        direction: Cartesian3.negate(normal, new Cartesian3()),
        intensity: 1.3,
      });
      scene.atmosphere.dynamicLighting = DynamicAtmosphereLightingType.NONE;
    } else {
      scene.light = new SunLight();
      scene.atmosphere.dynamicLighting = DynamicAtmosphereLightingType.SUNLIGHT;
    }
    // A lighting preset never writes Viewer.clock, which remains the frame's effective time.
    scene.globe.dynamicAtmosphereLighting = !this.presentation.daylight;
    scene.requestRender();
  }
  private clearLayer(layer: Layer) {
    // Invalidate unresolved loads and installed error callbacks independently.
    // Retrying one layer must leave healthy layers' callbacks current.
    this.layerGenerations[layer]++;
    clearTimeout(this.timers.get(layer));
    this.timers.delete(layer);
    this.layerRemovers[layer].splice(0).forEach((remove) => remove());
    if (layer === 'imagery' && this.imagery) {
      this.viewer.imageryLayers.remove(this.imagery, true);
      this.imagery = undefined;
    }
    if (layer === 'buildings' && this.buildings) {
      this.viewer.scene.primitives.remove(this.buildings);
      this.buildings = undefined;
    }
    if (layer === 'terrain') {
      this.terrain = undefined;
      this.viewer.terrainProvider = new EllipsoidTerrainProvider();
      this.terrainHeights.clear();
      this.sampling.clear();
    }
  }
  private fail(layer: Layer, generation: number, layerGeneration: number) {
    if (
      this.disposed ||
      generation !== this.generation ||
      layerGeneration !== this.layerGenerations[layer]
    )
      return;
    const failureKey = `${layer}:${generation}:${layerGeneration}`;
    if (this.pendingLayerFailures.has(failureKey)) return;
    this.pendingLayerFailures.add(failureKey);
    // A tileset may raise its failure event while still processing that tileset.
    // Never destroy resources synchronously inside the SDK's event stack.
    const task = setTimeout(() => {
      this.failureTasks.delete(task);
      this.pendingLayerFailures.delete(failureKey);
      this.applyLayerFailure(layer, generation, layerGeneration);
    }, 0);
    this.failureTasks.add(task);
  }
  private applyLayerFailure(
    layer: Layer,
    generation: number,
    layerGeneration: number,
  ) {
    if (
      this.disposed ||
      generation !== this.generation ||
      layerGeneration !== this.layerGenerations[layer] ||
      this.spatial[layer] === 'error'
    )
      return;
    this.clearLayer(layer);
    this.spatial[layer] = 'error';
    this.spatial.displayedBase =
      this.imagery || this.terrain ? 'standard' : 'local';
    this.draw();
    this.publish();
    this.viewer.scene.requestRender();
  }
  private async loadLayer<T>(
    layer: Layer,
    task: (isCurrent: () => boolean) => Promise<T>,
    install: (value: T, onFailure: () => void) => void,
    discard?: (value: T) => void,
  ) {
    this.clearLayer(layer);
    const generation = this.generation;
    const layerGeneration = this.layerGenerations[layer];
    const isCurrent = () =>
      !this.disposed &&
      generation === this.generation &&
      layerGeneration === this.layerGenerations[layer];
    const onFailure = () => this.fail(layer, generation, layerGeneration);
    this.spatial[layer] = 'loading';
    this.timers.set(layer, setTimeout(onFailure, 12000));
    try {
      const value = await task(isCurrent);
      if (!isCurrent() || !this.timers.has(layer)) {
        discard?.(value);
        return;
      }
      install(value, onFailure);
      clearTimeout(this.timers.get(layer));
      this.timers.delete(layer);
      this.spatial[layer] = 'ready';
      if (layer === 'imagery' || layer === 'terrain')
        this.spatial.displayedBase = 'standard';
      this.draw();
      this.viewer.scene.requestRender();
    } catch {
      onFailure();
    }
    this.publish();
  }
  setProvider(provider: CesiumProvider) {
    this.configureEnvironment(provider, false);
  }
  private configureEnvironment(provider: CesiumProvider, photoFailed: boolean) {
    if (this.disposed) return;
    this.provider = provider;
    if (!this.engineReady || this.resourceFailed) return;
    this.environmentLoads++;
    this.generation++;
    this.clearPhotorealistic();
    for (const layer of ['imagery', 'terrain', 'buildings'] as const)
      this.clearLayer(layer);
    this.spatial = initialSpatial();
    this.spatial.environment = 'standard';
    this.spatial.photorealistic = photoFailed ? 'error' : 'disabled';
    if (this.presentation.environment === 'photorealistic' && !photoFailed) {
      this.loadPhotorealistic();
      return;
    }
    this.callbacks.status({ kind: provider.token ? 'hosted' : 'local' });
    for (const layer of ['imagery', 'terrain', 'buildings'] as const) {
      if (!provider[`${layer}AssetId`]) this.spatial[layer] = 'disabled';
    }
    if (!provider.token) {
      this.draw();
      this.publish();
      return;
    }
    for (const layer of ['imagery', 'terrain', 'buildings'] as const)
      this.loadStandardLayer(layer);
    this.publish();
  }
  private loadStandardLayer(layer: Layer) {
    const provider = this.provider;
    if (!provider.token || !provider[`${layer}AssetId`]) return;
    const options = { accessToken: provider.token };
    if (layer === 'imagery')
      void this.loadLayer(
        'imagery',
        () => ionImagery(provider.imageryAssetId!, provider.token!),
        (imagery, onFailure) => {
          this.layerRemovers.imagery.push(
            imagery.errorEvent.addEventListener(onFailure),
          );
          this.imagery = this.viewer.imageryLayers.addImageryProvider(imagery);
          this.imagery.saturation = 1;
          this.imagery.brightness = 1;
        },
      );
    if (layer === 'terrain')
      void this.loadLayer(
        'terrain',
        async (isCurrent) => {
          const resource = await IonResource.fromAssetId(
            provider.terrainAssetId!,
            options,
          );
          if (!isCurrent()) throw new Error('Superseded');
          return CesiumTerrainProvider.fromUrl(resource);
        },
        (terrain, onFailure) => {
          this.terrain = terrain;
          this.viewer.terrainProvider = terrain;
          this.layerRemovers.terrain.push(
            terrain.errorEvent.addEventListener(onFailure),
          );
        },
      );
    if (layer === 'buildings')
      void this.loadLayer(
        'buildings',
        async (isCurrent) => {
          const resource = await IonResource.fromAssetId(
            provider.buildingsAssetId!,
            options,
          );
          if (!isCurrent()) throw new Error('Superseded');
          return Cesium3DTileset.fromUrl(resource, {
            maximumScreenSpaceError: 8,
            cacheBytes: 192 * 1024 * 1024,
            maximumCacheOverflowBytes: 64 * 1024 * 1024,
            showCreditsOnScreen: true,
            preloadFlightDestinations: false,
            preloadWhenHidden: false,
            loadSiblings: false,
          });
        },
        (buildings, onFailure) => {
          this.buildings = buildings;
          this.layerRemovers.buildings.push(
            buildings.tileFailed.addEventListener(onFailure),
          );
          this.viewer.scene.primitives.add(buildings);
        },
        (buildings) => {
          if (!buildings.isDestroyed()) buildings.destroy();
        },
      );
  }
  setPresentation(options: MapPresentation) {
    if (!this.active) {
      this.pendingPresentation = { ...options };
      return;
    }
    const environmentChanged =
      options.environment !== this.presentation.environment;
    this.presentation = { ...options };
    this.applyLighting();
    if (environmentChanged) this.setProvider(this.provider);
  }
  private clearPhotorealistic() {
    clearTimeout(this.recoveryTask);
    this.recoveryTask = undefined;
    this.requestRecovery?.dispose();
    this.requestRecovery = undefined;
    clearTimeout(this.photoTimer);
    this.photoTimer = undefined;
    this.photoRemovers.splice(0).forEach((remove) => remove());
    if (this.photorealistic)
      this.viewer.scene.primitives.remove(this.photorealistic);
    this.photorealistic = undefined;
    this.viewer.scene.globe.show = true;
    this.photoVisibleTiles = 0;
  }
  private loadPhotorealistic() {
    const generation = this.generation;
    const provider = this.provider;
    const fail = (code = 'BASE_UNAVAILABLE') => {
      if (this.disposed || generation !== this.generation) return;
      if (this.recoveryTask) return;
      this.photoFailures++;
      this.recordFailure('google-base', code);
      this.recoveryTask = setTimeout(() => {
        this.recoveryTask = undefined;
        if (this.disposed || generation !== this.generation) return;
        this.configureEnvironment(provider, true);
        this.spatial.failureCode = code;
        this.publish();
      }, 0);
    };
    const failureCode = () => {
      const last = [...(this.requestRecovery?.snapshot().recent ?? [])]
        .reverse()
        .find((value) => value.stage === 'root');
      return last && Date.now() - last.at < 5000
        ? last.status
          ? `HTTP_${last.status}`
          : 'NETWORK'
        : 'BASE_UNAVAILABLE';
    };
    this.requestRecovery = new RequestRecovery({
      mayRetry: () =>
        !this.disposed &&
        this.active &&
        generation === this.generation &&
        !this.resourceFailed,
      onDiagnostic: (diagnostic) => {
        this.recordFailure(
          `google-${diagnostic.stage}`,
          diagnostic.status
            ? `HTTP_${diagnostic.status}`
            : diagnostic.category.toUpperCase(),
        );
      },
    });
    this.spatial.environment = 'photorealistic';
    this.spatial.photorealistic = 'loading';
    this.spatial.imagery = 'disabled';
    this.spatial.terrain = 'disabled';
    this.spatial.buildings = 'disabled';
    this.callbacks.status({ kind: 'hosted' });
    this.publish();
    if (
      !provider.googleKey &&
      !(provider.token && provider.photorealisticAssetId)
    ) {
      fail('CREDENTIAL_REQUIRED');
      return;
    }
    // Loading/failure keeps a labelled local globe; real standard layers are restored on failure.
    this.photoTimer = setTimeout(() => fail('NO_VISIBLE_CONTENT'), 45000);
    void (async () => {
      const resource = provider.googleKey
        ? new Resource({
            url: 'https://tile.googleapis.com/v1/3dtiles/root.json',
            queryParameters: { key: provider.googleKey },
            retryAttempts: 2,
            retryCallback: this.requestRecovery!.retry,
          })
        : await IonResource.fromAssetId(provider.photorealisticAssetId!, {
            accessToken: provider.token,
          });
      if (this.disposed || generation !== this.generation) return;
      const tileset = await Cesium3DTileset.fromUrl(resource, {
        maximumScreenSpaceError: 6,
        dynamicScreenSpaceError: true,
        cacheBytes: 256 * 1024 * 1024,
        maximumCacheOverflowBytes: 128 * 1024 * 1024,
        showCreditsOnScreen: true,
        enableCollision: true,
        preloadFlightDestinations: false,
        preloadWhenHidden: false,
        loadSiblings: false,
      });
      if (this.disposed || generation !== this.generation) {
        tileset.destroy();
        return;
      }
      this.photorealistic = tileset;
      const credit = new Credit(
        '<span class="google-maps-credit">Google Maps</span>',
        true,
      );
      let credited = false;
      this.photoRemovers.push(() =>
        this.viewer.cesiumWidget.creditDisplay.removeStaticCredit(credit),
      );
      this.photoRemovers.push(
        tileset.tileFailed.addEventListener(() => {
          if (this.disposed || generation !== this.generation) return;
          // Keep usable content/cache. Request-level retries have already run.
          // A failed child is neither proof of a dead base nor a lost WebGL context.
          this.photoFailures++;
          this.spatial.degraded = true;
          // tileFailed lacks a structured status; unrelated concurrent request
          // errors must not be attributed to this child. HTTP diagnostics stay separate.
          this.spatial.failureCode = 'TILE_UNAVAILABLE';
          this.recordFailure('google-tile', this.spatial.failureCode);
          this.publish();
        }),
      );
      this.photoRemovers.push(
        tileset.tileVisible.addEventListener(() => {
          // Direct Google needs its identity in addition to per-tile copyright.
          // The optional ion route supplies its own required Google logo credit.
          if (!credited && provider.googleKey) {
            this.viewer.creditDisplay.addStaticCredit(credit);
            credited = true;
          }
          this.photoVisibleTiles++;
          // Initial usable geometry and full refinement are different milestones.
          // Navigation must not trip a fixed deadline after useful tiles appeared.
          clearTimeout(this.photoTimer);
          this.photoTimer = undefined;
          // Exclusive environmental base: no terrain globe, imagery or duplicate OSM mesh.
          this.viewer.scene.globe.show = false;
          const baseChanged = this.spatial.displayedBase !== 'photorealistic';
          this.spatial.displayedBase = 'photorealistic';
          if (this.spatial.photorealistic !== 'ready' && tileset.tilesLoaded) {
            clearTimeout(this.photoTimer);
            this.spatial.photorealistic = 'ready';
            this.publish();
          } else if (baseChanged) this.publish();
        }),
      );
      this.viewer.scene.primitives.add(tileset);
      this.draw();
      this.viewer.scene.requestRender();
    })().catch(() => fail(failureCode()));
  }
  retryProvider() {
    if (this.disposed || !this.engineReady || this.resourceFailed) return;
    if (this.presentation.environment === 'photorealistic') {
      this.setProvider(this.provider);
      return;
    }
    // Keep healthy standard services, their resources, and their error listeners.
    // An explicit provider/environment change still uses the full reset above.
    for (const layer of ['imagery', 'terrain', 'buildings'] as const) {
      if (this.spatial[layer] === 'error') this.loadStandardLayer(layer);
    }
    this.publish();
  }
  private onKey(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === '[' || event.key === ']') {
      event.preventDefault();
      const objects =
        this.scene?.objects.filter((o) =>
          this.viewer.entities.getById(JSON.stringify(o.ref)),
        ) ?? [];
      if (!objects.length) return;
      const old = objects.findIndex((o) => o.ref.id === this.keyboardId);
      const index =
        (old + (event.key === ']' ? 1 : -1) + objects.length) % objects.length;
      this.keyboardId = objects[index].ref.id;
      this.callbacks.announce(objects[index].label);
      this.draw();
    } else if (
      event.key === 'Enter' &&
      this.keyboardId &&
      this.mode === 'select'
    ) {
      event.preventDefault();
      this.callbacks.pick(this.keyboardId);
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
      const camera = this.camera();
      if (!camera) return;
      const step = camera.groundSpanM / 111320 / 10;
      if (event.key === 'ArrowLeft')
        camera.center.longitudeDeg -=
          step /
          Math.max(0.1, Math.cos((camera.center.latitudeDeg * Math.PI) / 180));
      if (event.key === 'ArrowRight')
        camera.center.longitudeDeg +=
          step /
          Math.max(0.1, Math.cos((camera.center.latitudeDeg * Math.PI) / 180));
      if (event.key === 'ArrowUp') camera.center.latitudeDeg += step;
      if (event.key === 'ArrowDown') camera.center.latitudeDeg -= step;
      if (event.key === '+' || event.key === '=') camera.groundSpanM /= 1.3;
      if (event.key === '-') camera.groundSpanM *= 1.3;
      camera.center.longitudeDeg =
        ((camera.center.longitudeDeg + 540) % 360) - 180;
      camera.center.latitudeDeg = Math.max(
        -85,
        Math.min(85, camera.center.latitudeDeg),
      );
      this.restoreCamera(camera);
      this.saveCamera();
    }
  }
  injectFailure(reason: 'tile' | 'context-lost' | 'render-exception') {
    if (import.meta.env.MODE !== 'verification') return;
    if (reason === 'tile')
      this.photorealistic?.tileFailed.raiseEvent({
        message: 'Synthetic tile processing failure',
      });
    else if (reason === 'render-exception')
      this.viewer.scene.renderError.raiseEvent(
        this.viewer.scene,
        new Error('Synthetic renderer exception'),
      );
    else
      this.viewer.canvas.dispatchEvent(
        new Event('webglcontextlost', { cancelable: true }),
      );
  }
  inspect() {
    const scene = this.scene;
    const time = this.viewer.clock.currentTime;
    // Optional verification diagnostic: this pinned SDK exposes its adaptive
    // detail error through an internal getter. Never use it to drive rendering.
    const adjustedDetailError: unknown = this.photorealistic
      ? Reflect.get(this.photorealistic, 'memoryAdjustedScreenSpaceError')
      : undefined;
    return {
      active: this.active,
      retainable: this.canRetain(),
      diagnostics: {
        drawCount: this.drawCount,
        labelUpdates: this.labelUpdates,
        symbolUpdates: this.symbolUpdates,
        environmentLoads: this.environmentLoads,
        accountedBytes: this.retainedBytes(),
        failures: [...this.failures],
        requestRecovery: this.requestRecovery?.snapshot(),
      },
      ready:
        !this.disposed &&
        this.engineReady &&
        !this.resourceFailed &&
        !this.pendingSymbols &&
        this.viewer.dataSourceDisplay.ready &&
        Boolean(scene?.frameId && this.appliedFrameId === scene.frameId),
      rendererRunning: this.viewer.useDefaultRenderLoop,
      globeLoaded: this.viewer.scene.globe.tilesLoaded,
      geometryReady: this.viewer.dataSourceDisplay.ready,
      clockTime: JulianDate.toIso8601(this.viewer.clock.currentTime, 3),
      missionId: scene?.missionId,
      frameId: this.appliedFrameId,
      sequence: scene?.sequence,
      effectiveAt: scene?.effectiveAt,
      selectionId: scene?.selection.id,
      trails: (scene?.paths ?? []).map((p) => ({
        id: p.id,
        trackId: p.trackId,
        sourceId: p.source.id,
        positions: p.points.map((v) => v.sample.position),
        times: p.points.map((v) => v.sample.timestamp),
      })),
      renderedTrailSegments: [...this.trailSignatures.keys()].filter(
        (id) => this.viewer.entities.getById(id)?.polyline,
      ).length,
      renderedTrailPoints: [...this.trailSignatures.keys()].filter(
        (id) => this.viewer.entities.getById(id)?.point,
      ).length,
      camera: this.captureCamera(),
      spatial: { ...this.spatial },
      presentation: { ...this.presentation },
      region: scene?.region,
      environment: {
        photorealisticPresent: Boolean(this.photorealistic),
        photorealisticDetailError:
          typeof adjustedDetailError === 'number'
            ? adjustedDetailError
            : undefined,
        requestedPhotorealisticDetailError:
          this.photorealistic?.maximumScreenSpaceError,
        globeShown: this.viewer.scene.globe.show,
        photorealisticLoaded: this.photorealistic?.tilesLoaded ?? false,
        photorealisticBytes: this.photorealistic?.totalMemoryUsageInBytes ?? 0,
        photoVisibleTiles: this.photoVisibleTiles,
        photoFailures: this.photoFailures,
        osmBuildings: Boolean(this.buildings),
        osmBuildingsLoaded: this.buildings?.tilesLoaded ?? false,
        imageryLayers: this.viewer.imageryLayers.length,
        realTerrain: Boolean(this.terrain),
        terrainSample: this.scene?.referencePoint
          ? this.viewer.scene.globe.getHeight(
              Cartographic.fromDegrees(
                this.scene.referencePoint.longitudeDeg,
                this.scene.referencePoint.latitudeDeg,
              ),
            )
          : undefined,
        imagerySaturation: this.imagery?.saturation,
        imageryBrightness: this.imagery?.brightness,
        resolutionScale: this.viewer.resolutionScale,
        canvasSize: [this.viewer.canvas.width, this.viewer.canvas.height],
        renderedFrames: this.renderedFrames,
      },
      entityIds: this.viewer.entities.values
        .filter((e) => this.markers.has(e.id))
        .map((e) => JSON.parse(e.id).id as string)
        .sort(),
      zoneIds: this.viewer.entities.values
        .filter((e) => e.polygon)
        .map((e) => JSON.parse(e.id).id as string)
        .sort(),
      points: this.viewer.entities.values
        .filter((e) => this.markers.has(e.id))
        .map((e) => {
          const position = e.position?.getValue(time);
          const pixel =
            position &&
            SceneTransforms.worldToWindowCoordinates(
              this.viewer.scene,
              position,
            );
          return {
            id: JSON.parse(e.id).id as string,
            x: pixel?.x,
            y: pixel?.y,
            height: position && Cartographic.fromCartesian(position).height,
          };
        }),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.saveCamera();
    this.disposed = true;
    this.viewer.useDefaultRenderLoop = false;
    this.pendingScene = undefined;
    this.pendingPresentation = undefined;
    this.pendingCamera = undefined;
    this.failureTasks.forEach(clearTimeout);
    this.failureTasks.clear();
    this.pendingLayerFailures.clear();
    this.generation++;
    this.observer.disconnect();
    clearTimeout(this.renderDeadline);
    this.viewer.canvas.removeEventListener('keydown', this.keyHandler);
    this.removers.splice(0).forEach((remove) => remove());
    this.clearPhotorealistic();
    for (const layer of ['imagery', 'terrain', 'buildings'] as const)
      this.clearLayer(layer);
    this.input.destroy();
    this.viewer.destroy();
    this.markers.clear();
    this.symbols.clear();
    counts.disposed++;
    counts.active--;
    if (probes.get(this.viewId) === this) probes.delete(this.viewId);
  }
}
