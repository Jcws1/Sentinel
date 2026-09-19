import type { Position3D, Zone, ObservedSegment } from '../contracts/generated';
import type { DeepReadonly, Entity } from '../contracts/types';
import type { ObjectRef } from '../state/sessionStore';
import type { BoundaryDefinition } from '../contracts/generated';
import type { ScreenPoint } from './gestures';
import type { MapRegion } from './regions';
import type { DisplayPreferences } from '../state/displayPreferences';

/** View-local geographic intent. A 2D camera center has no invented altitude. */
export interface CameraIntent {
  center: { longitudeDeg: number; latitudeDeg: number };
  groundSpanM: number;
  headingTrueDeg: number;
  /** Optional, pane-local orientation; never a source altitude or operational value. */
  pitchFromNadirDeg?: number;
  /** Presentation focus height only; never a requested or reported flight height. */
  focusHeightM?: number;
  projection?: MapMode;
}

export interface SceneObject {
  readonly profileId?: string;
  readonly planLabel?: string;
  readonly condition?: Entity['condition'];
  readonly ref: Readonly<ObjectRef & { kind: 'entity' }>;
  readonly trackId: string;
  readonly position: DeepReadonly<Position3D>;
  readonly affiliation: Entity['affiliation'];
  readonly label: string;
  readonly selected: boolean;
  readonly stale: boolean;
  readonly managed?: boolean;
  readonly unavailable?: string;
}

export interface SceneZone {
  readonly boundaryType?: BoundaryDefinition['type'];
  readonly ref: Readonly<ObjectRef & { kind: 'zone' }>;
  readonly label: string;
  readonly geometry: DeepReadonly<Zone['geometry']>;
  readonly altitudeBand?: DeepReadonly<Zone['altitudeBand']>;
}

export interface ScenePath {
  readonly id: string;
  readonly entityId: string;
  readonly trackId: string;
  readonly source: DeepReadonly<ObservedSegment['source']>;
  readonly breakReason: ObservedSegment['breakReason'];
  readonly points: DeepReadonly<ObservedSegment['points']>;
  readonly affiliation: Entity['affiliation'];
}
export type MapMode = 'tactical' | 'three-d';
export interface MapPresentation {
  buildings: boolean;
  hillshade: boolean;
  terrain: boolean;
  environment: 'standard' | 'photorealistic';
  daylight: boolean;
}
export const defaultMapPresentation: Readonly<MapPresentation> = Object.freeze({
  buildings: false,
  hillshade: true,
  terrain: false,
  environment: 'standard',
  daylight: true,
});
export interface ProviderStatus {
  kind:
    | 'local'
    | 'loading'
    | 'hosted'
    | 'error'
    | 'renderer-limit'
    | 'renderer-error'
    | 'renderer-timeout';
  source?: 'regional' | 'maptiler';
  coverage?: 'outside' | 'partial' | 'inside';
  terrainError?: boolean;
  reason?:
    | 'context-lost'
    | 'render-exception'
    | 'initial-geometry'
    | 'geometry-delay'
    | 'capacity';
  recoverable?: boolean;
}
export type LayerAvailability =
  'local' | 'loading' | 'ready' | 'error' | 'disabled';
export interface SpatialStatus {
  imagery: LayerAvailability;
  terrain: LayerAvailability;
  buildings: LayerAvailability;
  approximateHeights: number;
  unavailableHeights: number;
  surfaceZones: number;
  unavailableZones: number;
  environment?: 'standard' | 'photorealistic';
  /** Environment actually contributing visible content, independent of desired base. */
  displayedBase?: 'local' | 'standard' | 'photorealistic';
  photorealistic?: LayerAvailability;
  degraded?: boolean;
  failureCode?: string;
  retrying?: boolean;
  retryAfterSeconds?: number;
}
export interface RendererCallbacks {
  cockpitGeometry?(intersects: boolean | undefined): void;
  pick(id: string, additive?: boolean): void;
  selection?(ids: string[], additive?: boolean): void;
  clearSelection?(): void;
  directMove?(longitude: number, latitude: number): void;
  cancelDestination?(): void;
  destination?(longitude: number, latitude: number): boolean | void;
  boundaryFinish?(): void;
  boundaryDeleteVertex?(): void;
  boundaryContext?(
    longitude: number,
    latitude: number,
    point: ScreenPoint,
  ): void;
  boundaryVertex?(
    index: number,
    position?: { longitude: number; latitude: number },
  ): void;
  camera(missionId: string, camera: CameraIntent): void;
  status(status: ProviderStatus): void;
  announce(message: string): void;
  spatial?(status: SpatialStatus): void;
}
/** A pane owns one projection. No transport or world mutation is exposed here. */
export interface MapRenderer {
  setVideoOverlay?(
    frame?: import('../world/videoOverlay').VideoOverlayFrame,
  ): void;
  setCockpitPose?(
    pose: import('./cesium/cockpitCamera').CockpitCameraFrame,
  ): void;
  /** Suspends renderer work; the application applies its latest scene on resume. */
  setActive(active: boolean): void;
  canRetain(): boolean;
  /** Accounted renderer cache bytes, not total GPU/process memory. */
  retainedBytes(): number;
  captureCamera(): CameraIntent | undefined;
  projectBoundaryVertex?(index: number): ScreenPoint | undefined;
  restoreCamera(camera: CameraIntent): void;
  setScene(scene: SceneProjection, bookmark?: CameraIntent): void;
  /** Presentation poses only; no transport, history, camera or rule updates. */
  setMotion?(objects: readonly SceneObject[]): void;
  setMode(mode: 'select' | 'pan' | 'destination' | 'draw' | 'vertex'): void;
  setPresentation(options: MapPresentation): void;
  setPitch?(pitchFromNadirDeg: number): void;
  recenter(): void;
  overview(): void;
  focusSelection(): void;
  retryProvider(): void;
  dispose(): void;
}

/** Derived from one complete presentation frame; never an operational store. */
export interface SceneProjection {
  readonly locationGuides?: readonly {
    readonly id: 'current' | 'proposed';
    readonly origin: Readonly<{ longitudeDeg: number; latitudeDeg: number }>;
    readonly corners: readonly (readonly [number, number])[];
  }[];
  /** Empty developer fixture: use Tactical's local grid without changing saved provider settings. */
  readonly localGrid?: boolean;
  readonly display?: Readonly<DisplayPreferences>;
  readonly routes?: readonly SceneRoute[];
  readonly boundaryInteraction?: boolean;
  readonly boundaryEdit?: {
    readonly vertices: readonly (readonly [number, number])[];
    readonly selectedVertex?: number;
  };
  readonly context?: 'authoring';
  readonly destinations?: readonly SceneDestination[];
  readonly missionId?: string;
  readonly frameId?: string;
  readonly sequence?: number;
  readonly effectiveAt?: string;
  readonly stale: boolean;
  readonly objects: readonly SceneObject[];
  readonly zones: readonly SceneZone[];
  readonly paths?: readonly ScenePath[];
  readonly selection: Readonly<{
    id?: string;
    label?: string;
    status: 'none' | 'visible' | 'filtered' | 'unlocated' | 'missing';
  }>;
  /** All entities without a Track, independent of the current visibility filters. */
  readonly unlocatedCount: number;
  readonly referencePoint?: DeepReadonly<Position3D>;
  readonly region?: MapRegion;
  readonly localHome?: CameraIntent;
  readonly acknowledgement?: {
    readonly id: string;
    readonly longitudeDeg: number;
    readonly latitudeDeg: number;
    readonly state: 'pending' | 'accepted' | 'rejected';
    /** UI-only wall-time expiry; old intents do not pulse on pane reopen. */
    readonly expiresAtMs?: number;
  };
}

/** Accepted current intent, distinct from observed history and authored scripts. */
export interface SceneRoute {
  readonly id: string;
  readonly entityId: string;
  readonly kind: 'move' | 'patrol' | 'pursuit';
  readonly label: string;
  readonly points: readonly DeepReadonly<Position3D>[];
  readonly targetId?: string;
  readonly targetTrackId?: string;
}

export interface SceneDestination {
  /** Optional straight script intent, not observed history or route clearance. */
  readonly intentOrigin?: DeepReadonly<Position3D>;
  /** Actual/nominal interruption endpoint; the destination marker can remain unreached. */
  readonly intentEnd?: DeepReadonly<Position3D>;
  readonly selected?: boolean;
  readonly outcome?: string;
  readonly id: string;
  readonly entityId: string;
  readonly position: DeepReadonly<Position3D>;
  readonly stage: 'draft' | 'requested' | 'accepted';
  readonly label: string;
}
