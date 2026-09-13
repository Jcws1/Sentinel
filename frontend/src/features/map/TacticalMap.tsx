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
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import type { ViewId } from '../workspace/viewRegistry';
import { createScene } from '../../renderers/scene';
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
import { EntitySummary } from '../entities/EntitySummary';
import { countText } from '../entities/values';
import { FilterItems, filtersActive } from '../entities/EntityFilters';
import { entityRows } from '../../world/entityRows';

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
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const projection = bridge.getMapMode(viewId);
  const threeD = projection === 'three-d';
  const presentation = bridge.getMapPresentation(viewId);
  const latestPresentation = useRef(presentation);
  latestPresentation.current = presentation;
  const scene = useMemo(
    () => createScene(state.presentation, state.session, state.observed),
    [state.presentation, state.session, state.observed],
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
  const latestMode = useRef(mode);
  const [announcement, setAnnouncement] = useState('');
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
      scene,
      scene.missionId
        ? bridge.getMapCamera(viewId, scene.missionId)
        : undefined,
    );
  }, [scene, bridge, viewId]);
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
        renderer.setScene(current, camera);
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
      pick: (id) => {
        if (pool.owns(lease) && lease.active) runtime.selectEntity(id);
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
    latestMode.current = mode;
    adapter.current?.setMode(mode);
  }, [mode, visible, generation]);
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
            onClick={() => bridge.setMapMode(viewId, 'tactical')}
          >
            Tactical
          </button>
          <button
            className="map-tool"
            aria-pressed={threeD}
            onClick={() => bridge.setMapMode(viewId, 'three-d')}
          >
            3D
          </button>
        </div>
        <button
          className="map-tool"
          aria-label="Select"
          title="Select an entity"
          aria-pressed={mode === 'select'}
          onClick={() => setMode('select')}
        >
          <MousePointer2 size={15} />
          <span>Select</span>
        </button>
        <button
          className="map-tool"
          aria-label="Pan"
          title="Pan without selecting"
          aria-pressed={mode === 'pan'}
          onClick={() => setMode('pan')}
        >
          <Hand size={15} />
          <span>Pan</span>
        </button>
        <button
          className="map-tool"
          aria-label="Recenter"
          title="Frame visible entities and zones; use mission reference point if empty"
          disabled={
            !scene.frameId ||
            (!scene.objects.length &&
              !scene.zones.length &&
              !scene.referencePoint)
          }
          onClick={() => adapter.current?.recenter()}
        >
          <Crosshair size={15} />
          <span>Recenter</span>
        </button>
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
      <div className="map-surface">
        <div
          ref={canvas}
          className="map-canvas"
          data-renderer-failed={provider.kind === 'renderer-error'}
        />
        <div className="map-notices">
          <div className="map-status" role="status">
            {provider.kind === 'local' && (
              <>
                <span>{threeD ? 'LOCAL GLOBE' : 'LOCAL GRID'}</span>
                <span className="constraint-tag">CREDENTIAL REQUIRED</span>
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
              STALE · Last complete frame retained
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
        {!scene.frameId && (
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
        <EntitySummary state={state} runtime={runtime} bridge={bridge} map />
      </div>
      <div className="map-footer">
        <span
          id={`map-help-${viewId.replace(':', '-')}`}
          title={`Arrow keys pan; + and − zoom; [ and ] review symbols; ${mode === 'select' ? 'Enter selects' : 'switch to Select to choose a symbol'}.${threeD ? ' Drag to pan; right-drag to orbit.' : ''}`}
        >
          {mode === 'select'
            ? '[ ] symbols · Enter select'
            : 'PAN · [ ] review symbols'}
        </span>
        {filtered && (
          <button
            className="text-control"
            onClick={() => runtime.resetFilters()}
            title="Shared filters affect every map and Tracks"
          >
            {rows.filter((r) => r.visible).length}/{rows.length} entities ·
            Reset filters
          </button>
        )}
        <span
          className="map-value"
          title="Total mission entities without a recorded position"
        >
          {scene.unlocatedCount > 0 &&
            `Mission · ${scene.unlocatedCount} unlocated`}
        </span>
      </div>
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
                      {state.observed.data.throughAt}
                    </time>
                  </span>
                )}
            </>
          ) : (
            'Trail unavailable'
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}
