import { useId, useSyncExternalStore } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import '../../styles/mission.css';

export function MissionControls() {
  const runtime = useOperationalRuntime();
  return runtime ? <Controls runtime={runtime} /> : null;
}

function Controls({ runtime }: { runtime: ApplicationRuntime }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const frame = state.presentation.frame;
  const mission =
    frame?.mission ??
    state.catalog.missions.find((item) => item.id === state.missionId);
  const name =
    mission?.name ?? (state.missionId ? 'Loading mission' : 'No mission');
  const fixture =
    mission?.extensions?.['sentinel.fixture'] != null ||
    mission?.extensions?.['sentinel.interactive'] != null;
  const error = state.error || state.advanceError || state.catalog.error;
  const descriptionId = useId();
  const loading = Boolean(state.missionId && !frame && !state.error);
  function retry() {
    if (state.error || state.advanceError) runtime.retry();
    else void runtime.loadMissions();
  }
  return (
    <div className="mission-controls" role="group" aria-label="Mission context">
      <span className="mission-breadcrumb" aria-hidden="true">
        Missions <ChevronRight size={11} />
      </span>
      <span id={descriptionId} className="sr-only">
        {state.missionId ? `Current mission: ${name}` : 'No mission selected'}
      </span>
      <Menu.Root
        onOpenChange={(open) => {
          if (open) void runtime.loadMissions();
        }}
      >
        <Menu.Trigger
          className="mission-picker"
          aria-label="Load mission"
          aria-describedby={descriptionId}
          aria-busy={loading}
          title={name}
        >
          <span className="mission-name">{name}</span>
          <ChevronDown size={11} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            className="menu-content mission-menu"
            align="start"
            sideOffset={4}
          >
            <Menu.Label className="menu-label">Missions</Menu.Label>
            {error && (
              <div className="catalog-error" role="status">
                {error}
              </div>
            )}
            {state.catalog.status === 'loading' && (
              <div className="catalog-message">Loading...</div>
            )}
            {state.catalog.status === 'error' && (
              <div className="catalog-message">Backend unavailable</div>
            )}
            {state.catalog.status === 'ready' &&
              state.catalog.missions.length === 0 && (
                <div className="catalog-message">No missions available</div>
              )}
            {state.catalog.missions.map((mission) => (
              <Menu.Item
                key={mission.id}
                className="menu-item mission-option"
                title={mission.name}
                aria-current={
                  mission.id === state.missionId ? 'true' : undefined
                }
                onSelect={() => runtime.loadMission(mission.id)}
              >
                <span className="mission-option-check" aria-hidden="true">
                  {mission.id === state.missionId && <Check size={12} />}
                </span>
                <span>{mission.name}</span>
              </Menu.Item>
            ))}
            {error && (
              <Menu.Item
                className="menu-item"
                onSelect={(event) => {
                  event.preventDefault();
                  retry();
                }}
              >
                <RefreshCw size={13} />
                Retry
              </Menu.Item>
            )}
            {state.missionId && (
              <>
                <Menu.Separator className="menu-separator" />
                <Menu.Item
                  className="menu-item"
                  onSelect={() => runtime.unloadMission()}
                >
                  <X size={13} />
                  Unload mission
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      {fixture && (
        <span
          className="mission-fixture"
          title="Deterministic synthetic fixture"
        >
          SYNTHETIC
        </span>
      )}
      {loading && (
        <span className="mission-loading" role="status">
          LOADING
        </span>
      )}
      {error && (
        <>
          <span className="mission-error" role="status" title={error}>
            <span aria-hidden="true">
              {state.error
                ? 'STREAM ERROR'
                : state.advanceError
                  ? 'FIXTURE ERROR'
                  : 'CATALOG ERROR'}
            </span>
            <span className="sr-only">{error}</span>
          </span>
          <button
            className="mission-retry"
            aria-label="Retry"
            title={`Retry: ${error}`}
            onClick={retry}
          >
            <RefreshCw size={12} />
            <span>Retry</span>
          </button>
        </>
      )}
    </div>
  );
}

export function MissionStatus() {
  const runtime = useOperationalRuntime();
  return runtime ? (
    <Status runtime={runtime} />
  ) : (
    <span>No mission loaded</span>
  );
}
function Status({ runtime }: { runtime: ApplicationRuntime }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  return (
    <span className="mission-status" role="status">
      {state.missionId ? (
        <>
          <span className="connection-state">
            {state.connection === 'connected'
              ? 'CONNECTED'
              : state.connection.toUpperCase()}
          </span>
          <span
            className="status-mission-name"
            title={state.presentation.frame?.mission.name ?? state.missionId}
          >
            {state.presentation.frame?.mission.name ?? state.missionId}
          </span>
        </>
      ) : (
        'No mission loaded'
      )}
    </span>
  );
}
