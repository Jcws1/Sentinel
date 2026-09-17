import { useId, useSyncExternalStore } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import type { Mission } from '../../contracts/generated';
import type { DeepReadonly } from '../../contracts/types';
import '../../styles/mission.css';

export function MissionControls() {
  const runtime = useOperationalRuntime();
  return runtime ? <Controls runtime={runtime} /> : null;
}

const fixtureNames: Record<string, string> = {
  'fixture-alpha': 'Alpha',
  'fixture-bravo': 'Bravo',
  'fixture-tactical': 'Tactical',
  'fixture-observations': 'Observations',
};
export function missionDisplayName(mission?: Pick<Mission, 'id' | 'name'>) {
  return mission
    ? mission.name === `Synthetic ${fixtureNames[mission.id]}`
      ? fixtureNames[mission.id]
      : mission.name
    : 'No mission';
}

function Controls({ runtime }: { runtime: ApplicationRuntime }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const frame = state.presentation.frame;
  const mission =
    state.catalog.missions.find((item) => item.id === state.missionId) ??
    frame?.mission;
  const name = mission
    ? missionDisplayName(mission)
    : state.missionId
      ? 'Loading mission'
      : 'No mission';
  const error = state.error || state.advanceError || state.catalog.error;
  const descriptionId = useId();
  const loading = Boolean(state.missionId && !frame && !state.error);
  const activeId = state.interactive.entry?.activeMissionId;
  const active = state.catalog.missions.find((item) => item.id === activeId);
  const previous = state.catalog.missions.filter(
    (item) =>
      item.extensions?.['sentinel.interactive'] != null && item.id !== activeId,
  );
  const fixtures = state.catalog.missions.filter(
    (item) => item.extensions?.['sentinel.fixture'] != null,
  );
  const others = state.catalog.missions.filter(
    (item) =>
      item.extensions?.['sentinel.interactive'] == null &&
      item.extensions?.['sentinel.fixture'] == null,
  );
  const option = (item: DeepReadonly<Mission>) => (
    <Menu.Item
      key={item.id}
      className="menu-item mission-option"
      aria-current={item.id === state.missionId ? 'true' : undefined}
      onSelect={() => runtime.loadMission(item.id)}
    >
      <span className="mission-option-check" aria-hidden="true">
        {item.id === state.missionId && <Check size={12} />}
      </span>
      <span>{missionDisplayName(item)}</span>
    </Menu.Item>
  );
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
            {active && (
              <>
                <Menu.Label className="menu-label">Active demo</Menu.Label>
                {option(active)}
              </>
            )}
            {!!previous.length && (
              <Menu.Sub>
                <Menu.SubTrigger className="menu-item">
                  Previous demos <ChevronRight size={12} />
                </Menu.SubTrigger>
                <Menu.Portal>
                  <Menu.SubContent className="menu-content mission-menu">
                    {previous.map(option)}
                  </Menu.SubContent>
                </Menu.Portal>
              </Menu.Sub>
            )}
            {!!others.length && others.map(option)}
            {!!fixtures.length && (
              <Menu.Sub>
                <Menu.SubTrigger className="menu-item">
                  Developer fixtures <ChevronRight size={12} />
                </Menu.SubTrigger>
                <Menu.Portal>
                  <Menu.SubContent className="menu-content mission-menu">
                    {fixtures.map(option)}
                  </Menu.SubContent>
                </Menu.Portal>
              </Menu.Sub>
            )}
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
  const mission =
    state.catalog.missions.find((m) => m.id === state.missionId) ??
    state.presentation.frame?.mission;
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
            title={mission ? missionDisplayName(mission) : 'Loading mission'}
          >
            {mission ? missionDisplayName(mission) : 'Loading mission'}
          </span>
        </>
      ) : (
        'No mission loaded'
      )}
    </span>
  );
}
