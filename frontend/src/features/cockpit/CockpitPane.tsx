import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Columns2, RotateCcw, ScanLine, VideoOff } from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import type {
  MapRenderer,
  ProviderStatus,
  SpatialStatus,
} from '../../renderers/contracts';
import { cesiumProvider } from '../../renderers/cesium/config';
import type { RendererLease } from '../../renderers/rendererPool';
import { cockpitKey, type CockpitState } from '../../world/cockpit';
import {
  cockpitNotice,
  cockpitPoseAge,
  cockpitReportAge,
  hasGoogleEnvironment,
  readCockpitEnvironment,
  saveCockpitEnvironment,
  type CockpitEnvironment,
} from './presentation';
import './cockpit.css';

const initial: CockpitState = {
  followSelection: false,
  yaw: 0,
  pitch: 0,
  status: 'View unavailable',
  phase: 'unavailable',
  interpolating: false,
};
const viewId = 'cockpit';

export function CockpitPane({
  bridge,
  visible,
}: {
  bridge: WorkspaceBridge;
  visible: boolean;
}) {
  const runtime = useOperationalRuntime()!;
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const workspace = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const state = snapshot.cockpit ?? initial;
  const latest = useRef(state);
  latest.current = state;
  const host = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapRenderer | undefined>(undefined);
  const activeLease = useRef<RendererLease | undefined>(undefined);
  const [provider, setProvider] = useState<ProviderStatus>({ kind: 'loading' });
  const [spatial, setSpatial] = useState<SpatialStatus>();
  const [intersects, setIntersects] = useState<boolean>();
  const [generation, setGeneration] = useState(0);
  const [environment, setEnvironment] = useState<CockpitEnvironment>(() =>
    readCockpitEnvironment(cesiumProvider),
  );
  const environmentRef = useRef(environment);
  environmentRef.current = environment;
  const age = useRef<HTMLSpanElement>(null);
  const noticeAge = useRef<HTMLSpanElement>(null);
  const notice = cockpitNotice(state);
  const hasPose = !!state.pose && !!state.binding;
  const apply = useRef<(renderer: MapRenderer, now?: number) => void>(() => {});
  apply.current = (renderer, now) => {
    const s = latest.current,
      b = s.binding,
      p = s.pose;
    if (!b || !p) return;
    const bindingKey = cockpitKey(b);
    if (activeLease.current) activeLease.current.subject = bindingKey;
    renderer.setCockpitPose?.({
      bindingKey,
      missionId: b.missionId,
      frameId: p.frameId,
      sequence: p.sequence,
      effectiveAt: p.effectiveAt,
      position:
        s.interpolating && b.trackId
          ? runtime.motion.sampleTrack(p.frameId, b.trackId, p.position, now)
          : p.position,
      headingTrueDeg: p.headingTrueDeg,
      yaw: s.yaw,
      pitch: s.pitch,
    });
  };
  useEffect(() => {
    if (adapter.current) apply.current(adapter.current);
  }, [state]);
  useEffect(() => {
    if (!visible || !hasPose) return;
    return runtime.motion.subscribe((now) => {
      if (adapter.current && latest.current.interpolating)
        apply.current(adapter.current, now);
    });
  }, [runtime, visible, hasPose]);
  useEffect(() => {
    adapter.current?.setPresentation({
      environment,
      daylight: true,
      terrain: true,
      buildings: true,
      hillshade: false,
    });
  }, [environment]);
  useEffect(() => {
    if (!visible) return;
    // A wall-age label is not a pose clock; no React update or storage write.
    const update = () => {
      const p = latest.current.pose;
      const now = Date.now();
      if (age.current)
        age.current.textContent = p ? cockpitReportAge(p, now) : '';
      if (noticeAge.current)
        noticeAge.current.textContent = p ? cockpitPoseAge(p, now) : '';
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [visible, state.phase, state.pose?.observedAt, state.pose?.reportAt]);
  useEffect(() => () => bridge.renderers.closeView(viewId), [bridge]);
  useEffect(() => {
    if (!visible || !hasPose || !host.current) return;
    const pool = bridge.renderers;
    const lease = pool.acquire(
      viewId,
      'three-d',
      host.current.ownerDocument,
      'cockpit',
      cockpitKey(latest.current.binding!),
    );
    if (!lease) {
      setProvider({ kind: 'renderer-limit', reason: 'capacity' });
      return;
    }
    activeLease.current = lease;
    host.current.append(lease.host);
    let cancelled = false;
    const valid = () => !cancelled && pool.owns(lease) && lease.active;
    const publish = () => {
      if (!valid()) return;
      setProvider({ ...lease.status });
      setSpatial(lease.spatial && { ...lease.spatial });
    };
    const failure = (status: ProviderStatus) => {
      if (!valid()) return;
      pool.status(lease, status);
      // Dispose outside SDK event stacks and never retain a failed slot.
      queueMicrotask(() => {
        if (!valid()) return;
        adapter.current = undefined;
        pool.evict(lease);
      });
    };
    lease.changed = publish;
    publish();
    const resume = (renderer: MapRenderer) => {
      if (!valid()) return;
      adapter.current = renderer;
      renderer.setPresentation({
        environment: environmentRef.current,
        daylight: true,
        terrain: true,
        buildings: true,
        hillshade: false,
      });
      apply.current(renderer);
      renderer.setActive(true);
    };
    let deadline: ReturnType<typeof setTimeout> | undefined;
    if (lease.renderer) resume(lease.renderer);
    else {
      deadline = setTimeout(
        () => failure({ kind: 'renderer-timeout', recoverable: true }),
        12000,
      );
      Object.assign(window, {
        CESIUM_BASE_URL: `${import.meta.env.BASE_URL}cesium/`,
      });
      void import('../../renderers/cesium/CesiumAdapter')
        .then(({ CesiumAdapter }) => {
          clearTimeout(deadline);
          if (!valid()) return;
          const renderer = new CesiumAdapter(
            lease.host,
            viewId,
            cesiumProvider,
            {
              pick: () => {},
              camera: () => {},
              announce: () => {},
              status: (value) => {
                if (!pool.owns(lease)) return;
                if (
                  value.kind === 'renderer-error' ||
                  value.kind === 'renderer-timeout'
                ) {
                  pool.status(lease, value);
                  queueMicrotask(() => {
                    if (!pool.owns(lease)) return;
                    if (activeLease.current === lease)
                      adapter.current = undefined;
                    pool.evict(lease);
                  });
                } else pool.status(lease, value);
              },
              spatial: (value) => {
                if (pool.owns(lease)) {
                  lease.spatial = value;
                  lease.changed?.();
                }
              },
              cockpitGeometry: (value) => {
                if (
                  pool.owns(lease) &&
                  lease.active &&
                  activeLease.current === lease
                )
                  setIntersects(value);
              },
            },
            undefined,
            'cockpit',
          );
          if (pool.install(lease, renderer)) resume(renderer);
        })
        .catch(() => failure({ kind: 'renderer-error', recoverable: true }));
    }
    return () => {
      cancelled = true;
      clearTimeout(deadline);
      if (activeLease.current === lease) {
        activeLease.current = undefined;
        adapter.current = undefined;
      }
      pool.release(lease);
    };
  }, [visible, hasPose, bridge, runtime, generation]);
  const restart = () => {
    bridge.renderers.closeView(viewId);
    setGeneration((g) => g + 1);
  };
  const failed =
    provider.kind === 'renderer-error' || provider.kind === 'renderer-timeout';
  const serviceFailure =
    spatial &&
    (spatial.degraded ||
      [
        spatial.imagery,
        spatial.terrain,
        spatial.buildings,
        spatial.photorealistic,
      ].includes('error'));
  const p = state.pose,
    b = state.binding;
  const base =
    spatial?.displayedBase === 'photorealistic'
      ? 'Google photorealistic 3D'
      : spatial?.displayedBase === 'standard'
        ? 'Cesium standard'
        : 'Local globe fallback';
  return (
    <article
      className="cockpit-pane"
      aria-label="Simulated cockpit"
      data-binding={b && cockpitKey(b)}
      data-state={state.status}
      data-phase={state.phase}
      onFocusCapture={(event) => {
        // The shared workspace can be wider than its viewport. Keep the compact
        // controls and their essential context together when keyboard focus
        // returns from a neighbouring pane. This runs on focus, never on frames.
        const viewport =
          event.currentTarget.closest<HTMLElement>('.workspace-scroll');
        if (!viewport) return;
        const left =
          event.currentTarget.getBoundingClientRect().left -
          viewport.getBoundingClientRect().left;
        if (left < 0) viewport.scrollBy({ left, behavior: 'instant' });
      }}
    >
      <header className="cockpit-heading">
        <strong>SIMULATED VIEW · no video feed</strong>
        <div className="cockpit-subject">
          <span>{b?.label ?? 'No subject bound'}</span>
          <button
            className="icon-button"
            aria-label="Place cockpit beside map"
            title="Place beside map on a wide workspace"
            onClick={() => bridge.openToSide('cockpit')}
          >
            <Columns2 size={15} />
          </button>
        </div>
        <p className="cockpit-state" role="status">
          <span className="cockpit-state-dot" aria-hidden="true" />
          {state.status}
          {snapshot.presentation.mode === 'replay' && (
            <span className="cockpit-recorded">Recorded run</span>
          )}
        </p>
        {state.cannotFollow && (
          <p role="status" className="cockpit-warning">
            Cannot follow selection: {state.cannotFollow}{' '}
            {b ? `Still bound to ${b.label}.` : ''}
          </p>
        )}
      </header>
      <div className="cockpit-body">
        <div className="cockpit-scene" data-inactive={!!notice}>
          <div
            ref={host}
            className="cockpit-renderer map-canvas"
            hidden={!hasPose || failed || provider.kind === 'renderer-limit'}
          />
          {notice &&
            (!hasPose || (!failed && provider.kind !== 'renderer-limit')) && (
              <div className="cockpit-notice" role="status">
                <div>
                  <VideoOff size={21} aria-hidden="true" />
                  <strong>{notice.title}</strong>
                  <p>{notice.detail}</p>
                  {notice.age && <span ref={noticeAge} />}
                </div>
              </div>
            )}
          {hasPose && provider.kind === 'loading' && (
            <p className="cockpit-loading" role="status">
              Loading rendered environment…
            </p>
          )}
          {hasPose && failed && (
            <div className="cockpit-empty" role="status">
              <strong>Renderer unavailable</strong>
              <p>The simulated pose is retained.</p>
              <button className="text-control" onClick={restart}>
                Restart cockpit renderer
              </button>
            </div>
          )}
          {hasPose && provider.kind === 'renderer-limit' && (
            <div className="cockpit-empty" role="status">
              <strong>Renderer capacity reached</strong>
              <p>Four slots are in use. Focus or close an existing view.</p>
              {workspace.views
                .filter((v) =>
                  ['tactical', 'three-d'].includes(
                    bridge.getViewTitle(v.id).startsWith('3D')
                      ? 'three-d'
                      : v.id.split(':')[0],
                  ),
                )
                .map((v) => (
                  <div key={v.id}>
                    <button
                      className="text-control"
                      onClick={() => bridge.focus(v.id)}
                    >
                      Focus {bridge.getViewTitle(v.id)}
                    </button>
                    <button
                      className="text-control"
                      onClick={() => {
                        bridge.close(v.id);
                        restart();
                      }}
                    >
                      Close {bridge.getViewTitle(v.id)}
                    </button>
                  </div>
                ))}
              <button className="text-control" onClick={restart}>
                Retry cockpit
              </button>
            </div>
          )}
        </div>
        <div className="cockpit-toolbar">
          <div>
            <label
              className="cockpit-follow"
              title={
                state.followSelection
                  ? 'Follows the primary selected entity'
                  : 'Subject stays pinned when selection changes'
              }
            >
              <input
                type="checkbox"
                checked={state.followSelection}
                onChange={(e) => runtime.followCockpit(e.target.checked)}
              />
              Follow selection
              <span>{state.followSelection ? 'Primary' : 'Pinned'}</span>
            </label>
            <button
              className="text-control"
              onClick={() => runtime.lookCockpit(0, 0)}
              disabled={!hasPose}
            >
              <RotateCcw size={13} /> Reset view
            </button>
          </div>
        </div>
        <footer className="cockpit-footer">
          <div className="cockpit-section-title">
            <ScanLine size={13} aria-hidden="true" /> Telemetry{' '}
            <span>Committed data</span>
          </div>
          {p ? (
            <>
              <dl className="cockpit-telemetry">
                <div>
                  <dt>Altitude</dt>
                  <dd>
                    {p.position.altitude.metres.toFixed(1)} m{' '}
                    <small>
                      ELLIPSOID ·{' '}
                      {p.position.altitude.datumId ?? 'WGS84 assumed'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Speed</dt>
                  <dd>
                    {p.speedMps === undefined
                      ? 'Unavailable'
                      : `${(p.speedMps * 3.6).toFixed(1)} km/h`}
                  </dd>
                </div>
                <div>
                  <dt>Heading</dt>
                  <dd>
                    {p.headingTrueDeg.toFixed(0)}° true{' '}
                    <small>{p.headingBasis}</small>
                  </dd>
                </div>
                <div>
                  <dt>Position</dt>
                  <dd>
                    {p.position.latitudeDeg.toFixed(6)}°,{' '}
                    {p.position.longitudeDeg.toFixed(6)}°{' '}
                    <small>LAT / LON</small>
                  </dd>
                </div>
              </dl>
              <p className="cockpit-note cockpit-data-age">
                <span ref={age} />
              </p>
              <p className="cockpit-note">
                {state.interpolating
                  ? 'View uses shared bounded interpolation.'
                  : 'View uses the frozen / committed pose.'}
              </p>
            </>
          ) : (
            <p className="cockpit-note">
              No supported pose available for this view.
            </p>
          )}
          {b && (
            <p className="cockpit-note cockpit-source">
              {b.controlled
                ? 'Declared control Track'
                : 'Displayed observation Track'}{' '}
              ·{' '}
              {b.sourceId === snapshot.presentation.frame?.interactive?.sourceId
                ? 'Local simulator'
                : b.sourceId}
            </p>
          )}
          <div className="cockpit-provider">
            <label>
              Environment
              <select
                aria-label="Cockpit environment"
                value={environment}
                onChange={(e) => {
                  const value = e.target.value as CockpitEnvironment;
                  setEnvironment(value);
                  saveCockpitEnvironment(value);
                }}
              >
                <option value="standard">Cesium standard</option>
                <option
                  value="photorealistic"
                  disabled={!hasGoogleEnvironment(cesiumProvider)}
                >
                  Google photorealistic 3D
                </option>
              </select>
            </label>
          </div>
          {hasPose && (
            <div
              className={`cockpit-provider-status${serviceFailure ? ' cockpit-warning' : ''}`}
              role="status"
            >
              <span>Showing: {base}</span>
              {environment === 'photorealistic' &&
                spatial?.photorealistic === 'loading' && (
                  <span>Google 3D loading…</span>
                )}
              {serviceFailure && (
                <span>
                  {environment === 'photorealistic'
                    ? 'Google 3D unavailable or incomplete'
                    : 'Provider content incomplete'}
                  {spatial?.failureCode ? ` · ${spatial.failureCode}` : ''}
                </span>
              )}
              {!cesiumProvider.token && environment === 'standard' && (
                <span>Standard provider credentials required</span>
              )}
              {serviceFailure && (
                <button
                  className="text-control"
                  onClick={() => adapter.current?.retryProvider()}
                >
                  Retry services
                </button>
              )}
            </div>
          )}
          {intersects && (
            <p className="cockpit-warning">
              Scene geometry intersects the supplied viewpoint. Camera position
              is unchanged.
            </p>
          )}
          <details className="cockpit-options">
            <summary>View controls and pose</summary>
            <p id="cockpit-help" className="cockpit-note">
              Look-around changes only this view. Pitch 0°, roll 0°, FOV 60° are
              presentation defaults.
            </p>
            <label>
              Look left / right
              <input
                type="range"
                aria-label="Cockpit look yaw"
                min={-90}
                max={90}
                step={5}
                value={state.yaw}
                disabled={!hasPose}
                onChange={(e) =>
                  runtime.lookCockpit(Number(e.target.value), state.pitch)
                }
              />
              <output>{state.yaw}°</output>
            </label>
            <label>
              Look down / up
              <input
                type="range"
                aria-label="Cockpit look pitch"
                min={-45}
                max={45}
                step={5}
                value={state.pitch}
                disabled={!hasPose}
                onChange={(e) =>
                  runtime.lookCockpit(state.yaw, Number(e.target.value))
                }
              />
              <output>{state.pitch}°</output>
            </label>
            {b && (
              <dl>
                <dt>Entity</dt>
                <dd>{b.entityId}</dd>
                <dt>Pose Track</dt>
                <dd>{b.trackId ?? 'Missing'}</dd>
                <dt>Source</dt>
                <dd>{b.sourceId}</dd>
                <dt>Recording</dt>
                <dd>{b.recordingId}</dd>
                {p && (
                  <>
                    <dt>Observation UTC</dt>
                    <dd>{p.observedAt}</dd>
                    <dt>Frame</dt>
                    <dd>{p.frameId}</dd>
                  </>
                )}
              </dl>
            )}
            {spatial && (
              <p className="cockpit-note">
                Provider layers: imagery {spatial.imagery} · terrain{' '}
                {spatial.terrain} · buildings {spatial.buildings}
                {spatial.photorealistic &&
                  ` · Google ${spatial.photorealistic}`}
              </p>
            )}
            <p className="cockpit-note">
              Geometry may intersect this viewpoint. No clearance or sensor
              visibility is established.
            </p>
          </details>
        </footer>
      </div>
    </article>
  );
}
