import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Check,
  Crosshair,
  Hand,
  Layers,
  MousePointer2,
  RotateCcw,
  ChevronRight,
} from 'lucide-react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import type { ViewId } from '../workspace/viewRegistry';
import { createScene } from '../../renderers/scene';
import { MAX_SCENARIO_UNITS } from '../../contracts/scenarios';
import { defaultDisplayPreferences } from '../../state/displayPreferences';
import { interceptSelection } from '../../world/behavior';
import { BoundaryMapMenu } from '../units/BoundaryMapMenu';
import { BoundaryPanel } from '../units/BoundaryPanel';
import {
  boundaryEditorContext,
  liveBoundaryScene,
} from '../../world/boundaryContext';
import { scenarioScene } from '../../world/scenarioDraft';
import {
  configuredProvider,
  hasTacticalCredentials,
  isMapTiler,
} from '../../renderers/providers';
import { cesiumProvider } from '../../renderers/cesium/config';
import {
  altitudeDisclosure,
  visualHeight,
} from '../../renderers/cesium/altitude';
import type {
  MapRenderer,
  ProviderStatus,
  RendererCallbacks,
  SpatialStatus,
} from '../../renderers/contracts';
import type { RendererLease } from '../../renderers/rendererPool';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import './tactical.css';
import { selectForDetails } from '../entities/selectionActions';
import { countText } from '../entities/values';
import { FilterItems, filtersActive } from '../entities/EntityFilters';
import { entityRows } from '../../world/entityRows';
import { formatSgt } from '../../world/time';

export function TacticalMap({
  viewId,
  visible,
  bridge,
}: {
  viewId: ViewId;
  visible: boolean;
  bridge: WorkspaceBridge;
}) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const projection = bridge.getMapMode(viewId);
  const interceptMode = interceptSelection(state);
  const threeD = projection === 'three-d';
  const presentation = bridge.getMapPresentation(viewId);
  const latestPresentation = useRef(presentation);
  latestPresentation.current = presentation;
  const rawScene = useMemo(
    () =>
      state.scenario.active
        ? scenarioScene(state.scenario, state.session)
        : {
            ...liveBoundaryScene(
              createScene(
                state.presentation,
                state.session,
                state.observed,
                state.interactive,
                state.scenario,
                state.engagementCues,
                state.display,
              ),
              state,
              viewId,
            ),
            acknowledgement: state.interactive.directFeedback && {
              id: state.interactive.directFeedback.id,
              longitudeDeg: state.interactive.directFeedback.longitudeDeg,
              latitudeDeg: state.interactive.directFeedback.latitudeDeg,
              state: state.interactive.directFeedback.stage,
              expiresAtMs:
                (state.interactive.directFeedback.acknowledgedAt ?? 0) + 900,
            },
          },
    [
      state.presentation,
      state.session,
      state.observed,
      state.interactive,
      state.scenario,
      state.engagementCues,
      state.liveBoundary,
      state.display,
      viewId,
    ],
  );
  const scene = useMemo(
    () => ({
      ...rawScene,
      display: state.display ?? defaultDisplayPreferences,
    }),
    [rawScene, state.display],
  );
  const canvas = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapRenderer | undefined>(undefined);
  const activeLease = useRef<RendererLease | undefined>(undefined);
  const previousProjection = useRef(projection);
  const latest = useRef(scene);
  latest.current = scene;
  const [provider, setProvider] = useState<ProviderStatus>({
    kind: hasTacticalCredentials(configuredProvider) ? 'loading' : 'local',
  });
  const [spatial, setSpatial] = useState<SpatialStatus>();
  const [mode, setMode] = useState<'select' | 'pan'>('select');
  const [placementPointer, setPlacementPointer] = useState<{
    x: number;
    y: number;
  }>();
  const picking = state.session.destinationPickView === viewId;
  const directPicking = state.session.directDestinationView === viewId;
  const placing =
    state.scenario.active &&
    !!state.scenario.placement &&
    state.scenario.placement.viewId === viewId;
  const scripting =
    state.scenario.active && state.scenario.actionEdit?.viewId === viewId;
  const boundary = boundaryEditorContext(state);
  const boundaryEditing = boundary.boundaryEdit?.viewId === viewId;
  const drawing = boundaryEditing && !boundary.boundaryEdit?.originalId;
  const effectiveMode = boundaryEditing
    ? drawing
      ? 'draw'
      : 'vertex'
    : picking || directPicking || placing || scripting
      ? 'destination'
      : mode;
  const latestMode = useRef<
    'select' | 'pan' | 'destination' | 'draw' | 'vertex'
  >(effectiveMode);
  useEffect(() => {
    const missionId = state.missionId;
    if (picking && missionId) {
      const camera = bridge.beginDestinationAuthoring(viewId, missionId);
      if (!threeD) adapter.current?.restoreCamera(camera);
    } else {
      const saved = bridge.endDestinationAuthoring(viewId);
      if (
        saved?.camera &&
        saved.missionId === missionId &&
        saved.mode === projection
      )
        adapter.current?.restoreCamera(saved.camera);
    }
  }, [picking, state.missionId, bridge, viewId, projection, threeD]);
  useEffect(
    () => () => {
      bridge.endDestinationAuthoring(viewId);
      runtime.disarmBoundary(viewId);
      runtime.disarmAction(viewId);
      if (runtime.getSnapshot().session.destinationPickView === viewId)
        runtime.pickDestination();
      if (runtime.getSnapshot().session.directDestinationView === viewId)
        runtime.armDirectMove();
      if (runtime.getSnapshot().scenario.placement?.viewId === viewId)
        runtime.armPlacement();
    },
    [bridge, viewId, runtime],
  );
  useEffect(() => {
    if (!visible && runtime.getSnapshot().scenario.placement?.viewId === viewId)
      runtime.armPlacement();
    if (!visible) {
      runtime.disarmBoundary(viewId);
      runtime.disarmAction(viewId);
    }
  }, [visible, runtime, viewId]);
  useEffect(() => {
    const locate = state.scenario.locate;
    if (
      !visible ||
      !state.scenario.active ||
      locate?.viewId !== viewId ||
      runtime.getSnapshot().scenario.locate?.serial !== locate.serial ||
      !adapter.current
    )
      return;
    const unit = state.scenario.draft.units.find((u) => u.id === locate.id);
    if (!unit) return;
    const current = adapter.current.captureCamera() ?? scene.localHome!;
    adapter.current.restoreCamera({
      ...current,
      center: {
        longitudeDeg: unit.position.longitudeDeg,
        latitudeDeg: unit.position.latitudeDeg,
      },
      groundSpanM: Math.min(current.groundSpanM, 1200),
      focusHeightM: unit.position.altitude.metres,
    });
    runtime.completeScenarioLocate(locate.serial);
  }, [
    state.scenario.locate,
    state.scenario.active,
    state.scenario.draft.units,
    visible,
    viewId,
    provider,
    scene.localHome,
    runtime,
  ]);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!announcement) return;
    const timer = setTimeout(() => setAnnouncement(''), 4000);
    return () => clearTimeout(timer);
  }, [announcement]);
  const [generation, setGeneration] = useState(0);
  // Adapter diagnostics use a bounded vocabulary. Never display request details or URLs.
  const failureCode =
    spatial?.failureCode &&
    /^(HTTP_[1-5][0-9]{2}|NETWORK|TILE_PROCESSING|TILE_UNAVAILABLE|BASE_UNAVAILABLE|NO_VISIBLE_CONTENT|AUTH|RATE_LIMIT|SERVICE|OTHER)$/.test(
      spatial.failureCode,
    )
      ? spatial.failureCode
      : undefined;
  useEffect(() => {
    adapter.current?.setPresentation({ ...presentation });
  }, [presentation]);
  useEffect(() => {
    adapter.current?.setScene(
      runtime.motion.project(scene),
      scene.missionId
        ? bridge.getMapCamera(viewId, scene.missionId)
        : undefined,
    );
  }, [scene, bridge, viewId, runtime]);
  useEffect(() => {
    if (!visible) return;
    return runtime.motion.subscribe((now) => {
      const displayed = runtime.motion.project(latest.current, now);
      adapter.current?.setMotion?.(displayed.objects);
    });
  }, [runtime, visible]);
  useEffect(() => () => bridge.renderers.closeView(viewId), [bridge, viewId]);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    const container = canvas.current;
    const pool = bridge.renderers;
    const lease = pool.acquire(viewId, projection, container.ownerDocument);
    if (!lease) {
      setProvider({
        kind: 'renderer-limit',
        reason: 'capacity',
        recoverable: true,
      });
      return;
    }
    activeLease.current = lease;
    container.append(lease.host);
    const changedProjection = previousProjection.current !== projection;
    previousProjection.current = projection;
    const publish = () => {
      if (activeLease.current !== lease || !pool.owns(lease)) return;
      setProvider({ ...lease.status });
      setSpatial(lease.spatial && { ...lease.spatial });
    };
    lease.changed = publish;
    publish();
    const resume = (renderer: MapRenderer) => {
      const current = latest.current;
      const camera = current.missionId
        ? bridge.getMapCamera(viewId, current.missionId)
        : undefined;
      try {
        adapter.current = renderer;
        // Queue the complete current scene/settings before the dormant viewer resumes.
        renderer.setPresentation({ ...latestPresentation.current });
        renderer.setMode(latestMode.current);
        renderer.setScene(runtime.motion.project(current), camera);
        if (changedProjection && camera) renderer.restoreCamera(camera);
        renderer.setActive(true);
        publish();
      } catch {
        adapter.current = undefined;
        pool.status(lease, {
          kind: 'renderer-error',
          reason: 'render-exception',
          recoverable: true,
        });
        pool.evict(lease);
      }
    };
    const release = () => {
      if (activeLease.current === lease) {
        activeLease.current = undefined;
        adapter.current = undefined;
      }
      pool.release(lease);
    };
    if (lease.renderer) {
      resume(lease.renderer);
      return release;
    }
    let expired = false;
    const importDeadline = setTimeout(() => {
      if (!pool.owns(lease) || lease.renderer) return;
      expired = true;
      pool.status(lease, { kind: 'renderer-error', recoverable: true });
    }, 12000);
    const callbacks: RendererCallbacks = {
      pick: (id, additive) => {
        if (!pool.owns(lease) || !lease.active) return;
        if (runtime.getSnapshot().scenario.active) {
          runtime.selectScenarioUnit(id, additive);
          if (
            id &&
            !additive &&
            !bridge
              .getSnapshot()
              .views.some((v) => v.id === 'conductor' && v.selectedInPane)
          )
            bridge.open('units');
        } else selectForDetails(runtime, bridge, id, additive);
      },
      selection: (ids, additive) => {
        if (!pool.owns(lease) || !lease.active) return;
        runtime.selectEntities(ids, additive);
        if (
          !runtime.getSnapshot().scenario.active &&
          runtime.getSnapshot().session.selection.items.length
        )
          bridge.revealDetails();
      },
      clearSelection: () => {
        if (pool.owns(lease) && lease.active) {
          if (boundaryEditorContext(runtime.getSnapshot()).boundaryEdit) return;
          runtime.selectEntity();
        }
      },
      boundaryFinish: () => {
        if (pool.owns(lease) && lease.active) runtime.applyBoundary();
      },
      boundaryDeleteVertex: () => {
        if (
          pool.owns(lease) &&
          lease.active &&
          boundaryEditorContext(runtime.getSnapshot()).boundaryEdit?.viewId ===
            viewId
        )
          runtime.removeBoundaryVertex();
      },
      boundaryVertex: (index, position) => {
        if (
          !pool.owns(lease) ||
          !lease.active ||
          boundaryEditorContext(runtime.getSnapshot()).boundaryEdit?.viewId !==
            viewId
        )
          return;
        runtime.editBoundary({ selectedVertex: index });
        if (position)
          runtime.boundaryPoint(position.longitude, position.latitude, index);
      },
      boundaryContext: (longitude, latitude, point) => {
        if (pool.owns(lease) && lease.active)
          runtime.boundaryContext(
            longitude,
            latitude,
            viewId,
            point.x,
            point.y,
          );
      },
      cancelDestination: () => {
        if (!pool.owns(lease) || !lease.active) return;
        runtime.armDirectMove();
        runtime.pickDestination();
        runtime.armPlacement();
        runtime.disarmAction(viewId);
        if (
          boundaryEditorContext(runtime.getSnapshot()).boundaryEdit?.viewId ===
          viewId
        )
          runtime.cancelBoundary();
      },
      directMove: (longitude, latitude) => {
        if (!pool.owns(lease) || !lease.active) return;
        if (runtime.getSnapshot().scenario.active) runtime.armPlacement();
        else void runtime.directMove(longitude, latitude);
      },
      destination: (longitude, latitude) => {
        if (!pool.owns(lease) || !lease.active) return;
        const draft = runtime.getSnapshot().scenario;
        const boundaryDraft = boundaryEditorContext(
          runtime.getSnapshot(),
        ).boundaryEdit;
        if (boundaryDraft?.viewId === viewId && !boundaryDraft.originalId)
          return runtime.boundaryPoint(longitude, latitude);
        if (draft.active) {
          if (
            draft.boundaryEdit?.viewId === viewId &&
            !draft.boundaryEdit.originalId
          ) {
            return runtime.boundaryPoint(longitude, latitude);
          }
          if (draft.actionEdit?.viewId === viewId)
            return runtime.actionDestination(longitude, latitude, viewId);
          if (draft.placement?.viewId === viewId)
            runtime.placeScenarioUnit(longitude, latitude);
          return;
        }
        if (
          pool.owns(lease) &&
          lease.active &&
          runtime.getSnapshot().session.directDestinationView === viewId
        ) {
          void runtime.directMove(longitude, latitude);
          return;
        }
        if (
          pool.owns(lease) &&
          lease.active &&
          runtime.getSnapshot().session.destinationPickView === viewId
        )
          runtime.setDestination(longitude, latitude);
      },
      camera: (missionId, camera) => {
        if (pool.owns(lease) && lease.active)
          bridge.setMapCamera(viewId, missionId, camera);
      },
      status: (status) => {
        pool.status(lease, status);
      },
      announce: (message) => {
        if (activeLease.current === lease) setAnnouncement(message);
      },
      spatial: (value) => {
        if (!pool.owns(lease)) return;
        lease.spatial = value;
        lease.changed?.();
      },
    };
    // Set before the lazy Cesium import. Workers, WASM and widget assets use this URL.
    Object.assign(window, {
      CESIUM_BASE_URL: `${import.meta.env.BASE_URL}cesium/`,
    });
    // The isolated workspace harness never mounts this component. The renderer loads on demand.
    const module = threeD
      ? import('../../renderers/cesium/CesiumAdapter')
      : import('../../renderers/maplibre/MapLibreAdapter');
    void module
      .then((loaded) => {
        if (!pool.owns(lease) || !lease.active || expired) return;
        clearTimeout(importDeadline);
        try {
          const current = latest.current;
          const camera = current.missionId
            ? bridge.getMapCamera(viewId, current.missionId)
            : undefined;
          const renderer =
            'CesiumAdapter' in loaded
              ? new loaded.CesiumAdapter(
                  lease.host,
                  viewId,
                  cesiumProvider,
                  callbacks,
                  camera,
                )
              : new loaded.MapLibreAdapter(
                  lease.host,
                  viewId,
                  configuredProvider,
                  callbacks,
                  camera,
                );
          if (pool.install(lease, renderer)) resume(renderer);
        } catch {
          pool.status(lease, { kind: 'renderer-error', recoverable: true });
        }
      })
      .catch(() => {
        clearTimeout(importDeadline);
        pool.status(lease, { kind: 'renderer-error', recoverable: true });
      });
    return () => {
      clearTimeout(importDeadline);
      release();
    };
  }, [visible, viewId, bridge, runtime, generation, threeD, projection]);
  useEffect(() => {
    latestMode.current = effectiveMode;
    adapter.current?.setMode(effectiveMode);
  }, [effectiveMode, visible, generation]);
  const selection = scene.selection;
  const filtered = filtersActive(state.session.filters);
  const rows = state.presentation.frame
    ? entityRows(state.presentation.frame, state.session.filters)
    : [];
  const polarCount = scene.objects.filter(
    (object) => Math.abs(object.position.latitudeDeg) > 85.051129,
  ).length;
  return (
    <div
      className="tactical-view"
      data-view-id={viewId}
      data-frame-id={scene.frameId}
      data-sequence={scene.sequence}
      data-mission-id={scene.missionId}
      data-selection={selection.id}
      data-projection={projection}
      data-context={state.scenario.active ? 'authoring' : 'operational'}
      onKeyDownCapture={(event) => {
        if (
          state.scenario.active &&
          state.scenario.actionEdit?.viewId &&
          event.key === 'Escape'
        ) {
          runtime.disarmAction();
          event.preventDefault();
          event.stopPropagation();
        } else if (boundary.boundaryEdit && event.key === 'Escape') {
          runtime.cancelBoundary();
          event.preventDefault();
          event.stopPropagation();
        } else if (
          state.scenario.active &&
          state.scenario.placement &&
          event.key === 'Escape'
        ) {
          runtime.armPlacement();
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div className="map-tools" role="toolbar" aria-label="Map controls">
        <div
          className="map-projection"
          role="group"
          aria-label="Map projection"
        >
          <button
            className="map-tool"
            aria-pressed={!threeD}
            disabled={picking}
            onClick={() => {
              if (placing) runtime.armPlacement();
              runtime.disarmBoundary(viewId);
              runtime.disarmAction(viewId);
              bridge.setMapMode(viewId, 'tactical');
            }}
          >
            Tactical
          </button>
          <button
            className="map-tool"
            aria-pressed={threeD}
            disabled={picking}
            onClick={() => {
              if (placing) runtime.armPlacement();
              runtime.disarmBoundary(viewId);
              runtime.disarmAction(viewId);
              bridge.setMapMode(viewId, 'three-d');
            }}
          >
            3D
          </button>
        </div>
        <button
          className="map-tool"
          aria-label="Select"
          title="Click to select; drag to select managed drones"
          aria-pressed={mode === 'select'}
          onClick={() => {
            runtime.pickDestination();
            runtime.armDirectMove();
            runtime.armPlacement();
            runtime.disarmBoundary(viewId);
            runtime.disarmAction(viewId);
            setMode('select');
          }}
        >
          <MousePointer2 size={15} />
          <span>Select</span>
        </button>
        <button
          className="map-tool"
          aria-label="Pan"
          title="Click to select; drag to pan"
          aria-pressed={mode === 'pan'}
          onClick={() => {
            runtime.pickDestination();
            runtime.armDirectMove();
            runtime.armPlacement();
            runtime.disarmBoundary(viewId);
            runtime.disarmAction(viewId);
            setMode('pan');
          }}
        >
          <Hand size={15} />
          <span>Pan</span>
        </button>
        {
          <button
            className="map-tool"
            aria-label="Draw zone/boundary"
            aria-pressed={!!boundaryEditing}
            title={
              !state.scenario.active
                ? state.liveBoundaryView?.reason
                : undefined
            }
            disabled={
              (state.scenario.active &&
                (!!state.scenario.actionEdit ||
                  !!state.scenario.edit ||
                  !!state.scenario.pending ||
                  state.scenario.busy ||
                  !!state.scenario.blocked)) ||
              (!state.scenario.active &&
                !!state.presentation.frame &&
                !!state.liveBoundaryView?.reason)
            }
            onClick={() => {
              if (boundary.boundaryEdit) {
                if (!state.scenario.active) runtime.openLiveBoundaries(viewId);
                runtime.editBoundary({ viewId });
              } else runtime.beginBoundary(viewId);
              if (runtime.getSnapshot().scenario.active) bridge.open('units');
            }}
          >
            Draw boundary
          </button>
        }
        {!state.scenario.active && state.presentation.frame?.interactive && (
          <button
            className="map-tool"
            aria-label="Inspect or edit live boundaries"
            aria-pressed={state.liveBoundary?.visibleView === viewId}
            onClick={() =>
              state.liveBoundary?.visibleView === viewId
                ? runtime.closeLiveBoundaries()
                : runtime.openLiveBoundaries(viewId)
            }
          >
            Boundaries
          </button>
        )}
        {state.presentation.frame?.interactive && (
          <button
            className="map-tool"
            aria-label={
              interceptMode.armed
                ? 'Move selected members with Intercept enabled'
                : 'Move selected members'
            }
            disabled={
              !state.session.selection.items.length ||
              (interceptMode.mixed &&
                state.presentation.frame?.fleetBehavior?.ruleVersion !==
                  'local-fleet-v2') ||
              state.presentation.mode !== 'live'
            }
            onClick={() => {
              runtime.armDirectMove(viewId);
              canvas.current
                ?.querySelector<HTMLCanvasElement>('canvas')
                ?.focus();
            }}
          >
            {interceptMode.armed ? 'Move · Intercept' : 'Move'}
          </button>
        )}
        <button
          className="map-tool"
          aria-label="Recenter"
          title="Return to the local operating area"
          disabled={
            (!scene.frameId && !state.scenario.active) ||
            (!scene.objects.length &&
              !scene.zones.length &&
              !scene.referencePoint)
          }
          onClick={() => adapter.current?.recenter()}
        >
          <Crosshair size={15} />
          <span>Recenter</span>
        </button>
        {filtered && (
          <button
            className="map-tool map-filter-state"
            onClick={() => runtime.resetFilters()}
            title="Shared filters affect every map and Tracks"
            aria-label="Reset shared map filters"
          >
            {rows.filter((r) => r.visible).length}/{rows.length} entities ·
            Reset filters
          </button>
        )}
        <Menu.Root>
          <Menu.Trigger
            className="map-tool map-layers"
            aria-label="Map layers"
            title="Map layers"
          >
            <Layers size={15} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              className="menu-content map-layer-menu"
              onKeyDown={(event) => {
                // Radix normally maps Page keys to the first/last menu item.
                // This menu also has read-only disclosures below its controls.
                if (event.key === 'PageDown' || event.key === 'PageUp') {
                  event.preventDefault();
                  event.currentTarget.scrollBy({
                    top:
                      event.currentTarget.clientHeight *
                      (event.key === 'PageDown' ? 1 : -1),
                    behavior: 'instant',
                  });
                }
              }}
              sideOffset={5}
              align="end"
              collisionPadding={8}
            >
              <Menu.Label className="menu-label map-scope">
                Mission · {scene.unlocatedCount} unlocated
              </Menu.Label>
              <Menu.Item
                className="menu-item"
                onSelect={() => adapter.current?.overview()}
              >
                Overview
              </Menu.Item>
              <Menu.Item
                className="menu-item"
                disabled={!scene.objects.some((o) => o.selected)}
                onSelect={() => adapter.current?.focusSelection()}
              >
                Focus selection
              </Menu.Item>
              <Menu.Separator className="menu-separator" />
              <Menu.Sub>
                <Menu.SubTrigger className="menu-item">
                  Shared entity filters
                  <ChevronRight size={12} />
                </Menu.SubTrigger>
                <Menu.Portal>
                  <Menu.SubContent
                    className="menu-content entity-filter-menu"
                    sideOffset={4}
                  >
                    <FilterItems
                      runtime={runtime}
                      state={state}
                      presence={false}
                    />
                  </Menu.SubContent>
                </Menu.Portal>
              </Menu.Sub>
              <Menu.CheckboxItem
                className="menu-item"
                checked={!!state.session.overlays.history}
                onCheckedChange={(checked) =>
                  runtime.setHistoryVisible(checked)
                }
              >
                <Menu.ItemIndicator>
                  <Check size={13} />
                </Menu.ItemIndicator>
                Observed trail · selected · 60 s
              </Menu.CheckboxItem>
              <Menu.CheckboxItem
                className="menu-item"
                checked={state.session.overlays.zones}
                onCheckedChange={(checked) => runtime.setZonesVisible(checked)}
              >
                <Menu.ItemIndicator>
                  <Check size={13} />
                </Menu.ItemIndicator>
                Zones
              </Menu.CheckboxItem>
              <Menu.CheckboxItem
                className="menu-item"
                checked={state.session.filters.showUnobserved}
                onCheckedChange={(checked) =>
                  runtime.setFilters({ showUnobserved: checked })
                }
              >
                <Menu.ItemIndicator>
                  <Check size={13} />
                </Menu.ItemIndicator>
                Last known observations
              </Menu.CheckboxItem>
              {!threeD && (
                <>
                  <Menu.Separator className="menu-separator" />
                  <Menu.Label className="menu-label">
                    Tactical perspective
                  </Menu.Label>
                  <Menu.Item
                    className="menu-item"
                    onSelect={() => adapter.current?.setPitch?.(55)}
                  >
                    Pitched · 55°
                  </Menu.Item>
                  <Menu.Item
                    className="menu-item"
                    onSelect={() => adapter.current?.setPitch?.(0)}
                  >
                    Top-down
                  </Menu.Item>
                  <Menu.Separator className="menu-separator" />
                  <Menu.Label className="menu-label">
                    Local cartography
                  </Menu.Label>
                  {(
                    [
                      ['buildings', '3D buildings'],
                      ['hillshade', 'Hillshade'],
                      ['terrain', 'Terrain relief'],
                    ] as const
                  ).map(([key, label]) => (
                    <Menu.CheckboxItem
                      key={key}
                      className="menu-item"
                      checked={presentation[key]}
                      disabled={
                        provider.source !== 'regional' ||
                        provider.kind !== 'hosted' ||
                        (key !== 'buildings' && provider.terrainError)
                      }
                      onCheckedChange={(checked) =>
                        bridge.setMapPresentation(viewId, { [key]: checked })
                      }
                    >
                      <Menu.ItemIndicator>
                        <Check size={13} />
                      </Menu.ItemIndicator>
                      {label}
                    </Menu.CheckboxItem>
                  ))}
                  <div className="provider-explanation">
                    Supplied building heights; missing heights use 6 m. Terrain
                    scale 1×. Local vector z0–15, terrain z0–12; closer views
                    overzoom this data.
                  </div>
                  {scene.region && (
                    <div className="provider-explanation">
                      {scene.region.label} · presentation bounds only.
                    </div>
                  )}
                </>
              )}
              {threeD && spatial && (
                <>
                  <Menu.Separator className="menu-separator" />
                  <Menu.Label className="menu-label">
                    Environmental base
                  </Menu.Label>
                  <Menu.RadioGroup
                    value={presentation.environment}
                    onValueChange={(value) =>
                      bridge.setMapPresentation(viewId, {
                        environment: value as 'standard' | 'photorealistic',
                      })
                    }
                  >
                    <Menu.RadioItem className="menu-item" value="standard">
                      <Menu.ItemIndicator>
                        <Check size={13} />
                      </Menu.ItemIndicator>
                      Standard · imagery / terrain
                    </Menu.RadioItem>
                    <Menu.RadioItem
                      className="menu-item"
                      value="photorealistic"
                      disabled={
                        !cesiumProvider.googleKey &&
                        !(
                          cesiumProvider.token &&
                          cesiumProvider.photorealisticAssetId
                        )
                      }
                    >
                      <Menu.ItemIndicator>
                        <Check size={13} />
                      </Menu.ItemIndicator>
                      Google photorealistic
                      <span className="constraint-tag">
                        {cesiumProvider.googleKey ||
                        (cesiumProvider.token &&
                          cesiumProvider.photorealisticAssetId)
                          ? 'NETWORK'
                          : 'CREDENTIAL REQUIRED'}
                      </span>
                    </Menu.RadioItem>
                  </Menu.RadioGroup>
                  <Menu.CheckboxItem
                    className="menu-item"
                    checked={presentation.daylight}
                    onCheckedChange={(checked) =>
                      bridge.setMapPresentation(viewId, { daylight: checked })
                    }
                  >
                    <Menu.ItemIndicator>
                      <Check size={13} />
                    </Menu.ItemIndicator>
                    Noon daylight
                  </Menu.CheckboxItem>
                  <div className="provider-explanation">
                    Lighting presentation only. Off uses mission time.
                    Photographic shadows are baked into imagery; this preset
                    cannot relight them.
                  </div>
                  <Menu.Separator className="menu-separator" />
                  <Menu.Label className="menu-label">3D services</Menu.Label>
                  <div className="provider-detail">
                    <span>Displayed base</span>
                    <span className="map-value">
                      {spatial.displayedBase === 'photorealistic'
                        ? 'Google'
                        : spatial.displayedBase === 'standard'
                          ? 'Standard'
                          : 'Local globe'}
                    </span>
                  </div>
                  {presentation.environment === 'photorealistic' && (
                    <div className="provider-detail">
                      <span>Google base</span>
                      <span className="map-value">
                        {spatial.degraded ? 'partial' : spatial.photorealistic}
                      </span>
                    </div>
                  )}
                  {failureCode && (
                    <div className="provider-detail">
                      <span>Provider response</span>
                      <span className="map-value">{failureCode}</span>
                    </div>
                  )}
                  {(['imagery', 'terrain', 'buildings'] as const).map(
                    (layer) => (
                      <div className="provider-detail" key={layer}>
                        <span>{layer}</span>
                        <span className="map-value">{spatial[layer]}</span>
                      </div>
                    ),
                  )}
                  <Menu.Separator className="menu-separator" />
                  <div className="provider-explanation">
                    {altitudeDisclosure} Ellipsoid heights without a datum
                    identifier assume WGS84. Symbols remain visible through
                    terrain and buildings for selection.
                    {spatial.displayedBase === 'photorealistic' && (
                      <>
                        {' '}
                        Google supplies a combined ground/building mesh;
                        separate imagery, terrain and OSM buildings are
                        disabled. AGL remains unresolved in the displayed Google
                        base.
                      </>
                    )}
                  </div>
                </>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
      </div>
      {state.scenario.active ? (
        <div className="scenario-map-context" role="status">
          <strong>AUTHORING</strong>
          <span>
            {state.scenario.draft.name} · {state.scenario.draft.units.length}/
            {MAX_SCENARIO_UNITS}
            units
          </span>
          <span>
            {scripting
              ? 'Pick scripted destination · Esc cancels pick'
              : state.scenario.actionEdit?.viewId
                ? 'Script pick belongs to another map'
                : placing
                  ? 'Click to place · Esc or right-click cancels'
                  : state.scenario.placement
                    ? 'Placement belongs to another map'
                    : state.scenario.actionEdit
                      ? 'Script preview · straight intent, not route clearance'
                      : 'Units to place · Conductor to script'}
          </span>
        </div>
      ) : state.presentation.frame?.scenario ? (
        <div className="scenario-map-context scenario-map-running">
          <strong>SIMULATION</strong>
          <span>
            {state.presentation.frame.scenario.name} · revision{' '}
            {state.presentation.frame.scenario.revision}
          </span>
          <span>{state.presentation.frame.interactive?.state}</span>
        </div>
      ) : null}
      <div className="map-surface">
        <div
          ref={canvas}
          className="map-canvas"
          data-renderer-failed={provider.kind === 'renderer-error'}
          onPointerMoveCapture={(event) => {
            if ((!placing && !boundaryEditing && !scripting) || event.buttons) {
              setPlacementPointer(undefined);
              return;
            }
            const bounds = event.currentTarget.getBoundingClientRect();
            setPlacementPointer({
              x: event.clientX - bounds.left,
              y: event.clientY - bounds.top,
            });
          }}
          onPointerDownCapture={() => setPlacementPointer(undefined)}
          onPointerLeave={() => setPlacementPointer(undefined)}
          onBlurCapture={() => setPlacementPointer(undefined)}
        />
        {drawing &&
          placementPointer &&
          (() => {
            const count = scene.boundaryEdit?.vertices.length ?? 0,
              last = adapter.current?.projectBoundaryVertex?.(count - 1);
            return last ? (
              <svg
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 4,
                }}
              >
                <line
                  x1={last.x}
                  y1={last.y}
                  x2={placementPointer.x}
                  y2={placementPointer.y}
                  stroke="#d4e2e6"
                  strokeDasharray="5 4"
                />
              </svg>
            ) : null;
          })()}
        {(placing || scripting) && placementPointer && (
          <div
            className="scenario-placement-preview"
            aria-hidden="true"
            style={{ left: placementPointer.x, top: placementPointer.y }}
          >
            <span>+</span>
            <small>
              PREVIEW ·{' '}
              {scripting
                ? 'script destination'
                : state.scenario.placement?.category}
            </small>
          </div>
        )}
        <div className="map-notices">
          <div className="map-status" role="status">
            {provider.kind === 'local' && (
              <>
                <span>{threeD ? 'LOCAL GLOBE' : 'LOCAL GRID'}</span>
                <span className="constraint-tag">
                  {!threeD && scene.localGrid
                    ? 'EMPTY FIXTURE'
                    : 'CREDENTIAL REQUIRED'}
                </span>
              </>
            )}
            {provider.kind === 'loading' && (
              <>
                <span>
                  {threeD
                    ? 'Loading 3D resources'
                    : provider.source === 'regional'
                      ? 'Loading local map'
                      : 'Loading basemap'}
                </span>
                <span className="constraint-tag">
                  {threeD
                    ? 'LOADING'
                    : provider.source === 'regional'
                      ? 'LOCAL DATA'
                      : 'NETWORK'}
                </span>
              </>
            )}
            {provider.kind === 'hosted' && !threeD && (
              <>
                <span>
                  {provider.source === 'regional'
                    ? 'LOCAL VECTOR'
                    : 'HOSTED BASEMAP'}
                </span>
                {provider.terrainError && (
                  <>
                    <span className="constraint-tag">TERRAIN UNAVAILABLE</span>
                    <button
                      className="map-inline-button"
                      onClick={() => adapter.current?.retryProvider()}
                    >
                      Retry terrain
                    </button>
                  </>
                )}
              </>
            )}
            {threeD && spatial && provider.kind === 'hosted' && (
              <>
                <span>
                  {spatial.environment === 'photorealistic'
                    ? spatial.degraded
                      ? 'Google tiles incomplete'
                      : spatial.photorealistic === 'ready'
                        ? 'GOOGLE PHOTOREALISTIC'
                        : 'Loading Google 3D tiles'
                    : spatial.photorealistic === 'error'
                      ? 'Google unavailable · standard fallback'
                      : Object.values({
                            imagery: spatial.imagery,
                            terrain: spatial.terrain,
                            buildings: spatial.buildings,
                          }).includes('loading')
                        ? 'Loading 3D services'
                        : Object.values(spatial).includes('error')
                          ? '3D services degraded'
                          : 'CESIUM ION · STANDARD'}
                </span>
                {(Object.values(spatial).includes('error') ||
                  spatial.degraded) && (
                  <button
                    className="map-inline-button"
                    onClick={() => adapter.current?.retryProvider()}
                  >
                    <RotateCcw size={12} />
                    {spatial.retrying ? 'Retrying services' : 'Retry services'}
                  </button>
                )}
              </>
            )}
            {threeD &&
              spatial?.photorealistic === 'error' &&
              provider.kind === 'local' && (
                <>
                  <span>Google unavailable · local globe</span>
                  <button
                    className="map-inline-button"
                    onClick={() => adapter.current?.retryProvider()}
                  >
                    Retry services
                  </button>
                </>
              )}
            {provider.kind === 'error' && (
              <>
                <span>Basemap unavailable · local grid</span>
                <button
                  className="map-inline-button"
                  onClick={() => adapter.current?.retryProvider()}
                >
                  <RotateCcw size={12} />
                  Retry basemap
                </button>
              </>
            )}
            {provider.kind === 'renderer-error' && (
              <>
                <span>
                  {provider.reason === 'context-lost'
                    ? 'Graphics context lost'
                    : provider.reason === 'render-exception'
                      ? 'Map rendering stopped'
                      : provider.reason === 'geometry-delay'
                        ? 'Map geometry update stalled'
                        : 'Map renderer unavailable'}
                </span>
                <button
                  className="map-inline-button"
                  onClick={() => setGeneration((value) => value + 1)}
                >
                  Retry renderer
                </button>
              </>
            )}
            {provider.kind === 'renderer-timeout' && (
              <>
                <span>Map resources unavailable</span>
                <span className="constraint-tag">STARTUP TIMEOUT</span>
                <button
                  className="map-inline-button"
                  onClick={() => setGeneration((value) => value + 1)}
                >
                  Retry renderer
                </button>
                <button
                  className="map-inline-button"
                  onClick={() => window.location.reload()}
                >
                  Reload application
                </button>
              </>
            )}
            {provider.kind === 'renderer-limit' && (
              <>
                <span>Map capacity reached · 4 renderer slots in use</span>
                <button
                  className="map-inline-button"
                  onClick={() => setGeneration((value) => value + 1)}
                >
                  Retry after closing or hiding a map
                </button>
              </>
            )}
          </div>
          {scene.stale && scene.frameId && (
            <div className="map-stale" role="status">
              {state.presentation.sourceDelayed
                ? 'SOURCE REPORT DELAYED · Last complete frame retained'
                : 'STALE · Last complete frame retained'}
            </div>
          )}
          {!threeD && polarCount > 0 && (
            <div className="map-stale">
              {polarCount} outside Tactical latitude range
            </div>
          )}
          {threeD &&
            spatial &&
            (provider.kind === 'local' || provider.kind === 'hosted') &&
            (spatial.approximateHeights > 0 ||
              spatial.unavailableHeights > 0 ||
              spatial.surfaceZones > 0) && (
              <div className="map-stale" title={altitudeDisclosure}>
                {spatial.approximateHeights > 0 && (
                  <span>HEIGHT APPROXIMATE · MSL ≈ ellipsoid</span>
                )}
                {spatial.unavailableHeights > 0 && (
                  <span>
                    {spatial.unavailableHeights} without resolved height
                  </span>
                )}
                {spatial.surfaceZones > 0 && (
                  <span>
                    {spatial.surfaceZones} zone footprint
                    {spatial.surfaceZones > 1 ? 's' : ''}
                    {spatial.unavailableZones > 0 ? ' · height unresolved' : ''}
                  </span>
                )}
              </div>
            )}
        </div>
        {!scene.frameId && !state.scenario.active && (
          <div className="map-empty">
            {state.missionId
              ? 'Waiting for a complete mission frame'
              : 'Load a mission to display operational content'}
            {(provider.kind === 'local' || provider.kind === 'error') && (
              <span>
                {threeD
                  ? 'Local ellipsoid only; imagery and terrain require credentials.'
                  : 'Local grid provides geographic coordinates only.'}
              </span>
            )}
          </div>
        )}
        {!threeD &&
          provider.kind === 'hosted' &&
          provider.source !== 'regional' &&
          isMapTiler(configuredProvider) && (
            <a
              className="maptiler-credit"
              href="https://www.maptiler.com/"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src="https://api.maptiler.com/resources/logo.svg"
                alt="MapTiler"
              />
            </a>
          )}
      </div>
      <BoundaryMapMenu
        viewId={viewId}
        width={canvas.current?.clientWidth ?? 600}
        height={canvas.current?.clientHeight ?? 600}
      />
      {boundaryEditing && (
        <div className="boundary-map-help" role="status">
          {drawing ? 'DRAW' : 'EDIT'} · {boundary.boundaryEdit?.vertices.length}{' '}
          vertices ·{' '}
          {drawing
            ? 'Double-click final vertex / Enter to finish'
            : 'Drag a handle or use numeric coordinates'}{' '}
          · Esc cancels
        </div>
      )}
      {!state.scenario.active && state.liveBoundary?.visibleView === viewId && (
        <aside
          className="live-boundary-flyout units-pane"
          aria-label="Live boundary tools"
        >
          <div className="live-boundary-heading">
            <strong>Boundaries · current run</strong>
            <button
              aria-label="Close live boundary tools"
              onClick={() => {
                runtime.closeLiveBoundaries();
                requestAnimationFrame(() =>
                  canvas.current?.querySelector('canvas')?.focus(),
                );
              }}
            >
              ×
            </button>
          </div>
          <div className="units-body">
            <BoundaryPanel viewId={viewId} />
            <p className="units-hint">
              Restricted activation refuses occupied footprints. Accepted
              changes stop crossing movements at their last committed position.
              Removing a rule does not restart them.
            </p>
          </div>
        </aside>
      )}
      {(picking || directPicking) && (
        <div className="map-destination-help" role="status">
          {directPicking ? (
            <>
              <span>
                {interceptMode.armed
                  ? 'INTERCEPT · choose a movement destination. Nearby hostiles acquired automatically.'
                  : 'Choose a destination · click the map or press Enter at its centre.'}
              </span>
              <button
                className="text-control"
                onClick={() => runtime.armDirectMove()}
              >
                Cancel picking
              </button>
            </>
          ) : picking ? (
            <>
              <span>
                TOP-DOWN · Click an anchor, then review every endpoint in
                Movement.
              </span>
              <button
                className="text-control"
                onClick={() => runtime.pickDestination()}
              >
                Finish picking
              </button>
            </>
          ) : (
            <span>
              DEST · dashed = draft · dotted = requested · solid = accepted
              endpoint. No validated route.
            </span>
          )}
        </div>
      )}
      {!state.scenario.active &&
        state.presentation.mode === 'live' &&
        interceptMode.armed &&
        !directPicking && (
          <div className="map-intercept-mode" role="status">
            INTERCEPT ENABLED · right-click to move ·{' '}
            {state.presentation.frame?.fleetBehavior?.model.acquisitionRadiusM}{' '}
            m proximity
          </div>
        )}
      {!!state.engagementCues?.length && (
        <span className="sr-only" role="status">
          SIMULATED ENGAGEMENT · {state.engagementCues.length} mutual loss
          outcome. Participants now NON-OP.
        </span>
      )}
      {state.session.overlays.history && (
        <div className="map-trail-status" role="status">
          {!selection.id ? (
            'Select an entity for its observed trail'
          ) : state.observed.status === 'loading' ? (
            'Loading recorded trail…'
          ) : state.observed.status === 'error' ? (
            <>
              {state.observed.error}{' '}
              <button
                className="text-control"
                onClick={() => runtime.retryHistory()}
              >
                Retry history
              </button>
            </>
          ) : state.observed.status === 'ready' ? (
            <>
              <span>{`${countText(scene.paths?.reduce((n, p) => n + p.points.length, 0) ?? 0, 'recorded observation')} · 60 s${state.observed.data?.truncated ? ' · bounded' : ''}${threeD && scene.paths?.some((p) => p.points.some((s) => s.sample.position.altitude.reference === 'MSL')) ? ' · dashed height approximate' : ''}${threeD && scene.paths?.some((p) => p.points.some((s) => !visualHeight(s.sample.position.altitude))) ? ' · unresolved heights omitted' : ''}`}</span>
              {state.observed.data &&
                state.observed.data.throughFrameId !== scene.frameId && (
                  <span>
                    Refreshing · trail through{' '}
                    <time className="entity-value">
                      {formatSgt(state.observed.data.throughAt)}
                    </time>
                  </span>
                )}
            </>
          ) : (
            'Trail unavailable'
          )}
        </div>
      )}
      {announcement && (
        <div className="map-destination-help" role="status">
          {announcement}
        </div>
      )}
    </div>
  );
}
