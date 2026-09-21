import { useId, useRef, useState } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import type { Mission } from '../../contracts/generated';
import type { DeepReadonly } from '../../contracts/types';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import '../../styles/mission.css';

export function MissionControls({ bridge }: { bridge?: WorkspaceBridge } = {}) {
  const runtime = useOperationalRuntime();
  return runtime ? <Controls runtime={runtime} bridge={bridge} /> : null;
}

const fixtureNames: Record<string, string> = {
  'fixture-alpha': 'Alpha',
  'fixture-bravo': 'Bravo',
  'fixture-tactical': 'Tactical',
  'fixture-observations': 'Observations',
};
export function missionDisplayName(
  mission?: DeepReadonly<
    Pick<Mission, 'id' | 'name'> & Partial<Pick<Mission, 'extensions'>>
  >,
) {
  const scenario = mission?.extensions?.['sentinel.scenario'] as
    { name?: string; revision?: number } | undefined;
  if (scenario?.name && typeof scenario.revision === 'number')
    return `${scenario.name} · r${scenario.revision} · ${mission!.name}`;
  return mission
    ? mission.name === `Synthetic ${fixtureNames[mission.id]}`
      ? fixtureNames[mission.id]
      : mission.name
    : 'No mission';
}

function Controls({
  runtime,
  bridge,
}: {
  runtime: ApplicationRuntime;
  bridge?: WorkspaceBridge;
}) {
  const state = useOperationalSnapshot(runtime);
  const [replaceId, setReplaceId] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const picker = useRef<HTMLButtonElement>(null);
  const frame = state.presentation.frame;
  const mission =
    state.catalog.missions.find((item) => item.id === state.missionId) ??
    frame?.mission;
  const name = state.scenario.active
    ? `${state.scenario.draft.name} · ${state.scenario.dirty || !state.scenario.saved ? 'Unsaved plan' : `Saved r${state.scenario.saved.revision}`} · Not started`
    : mission
      ? missionDisplayName(mission)
      : state.missionId
        ? 'Loading mission'
        : state.interactive.entry?.activeMissionId
          ? 'No mission displayed · demo active'
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
  async function openSaved(id: string, discard = false) {
    const s = state.scenario;
    if (state.interactive.pending || state.interactive.startingDemo) {
      setNotice(
        'Finish or reconcile the current demo request in Simulation, then load the saved scenario. Your arrangement is retained.',
      );
      return;
    }
    if (s.edit || s.actionEdit || s.boundaryEdit || s.pending || s.busy) {
      setNotice(
        'Finish the open editor or reconcile the pending request before loading another scenario.',
      );
      bridge?.open(s.actionEdit ? 'conductor' : 'units');
      return;
    }
    if (s.dirty && !discard) {
      setReplaceId(id);
      return;
    }
    setReplaceId(undefined);
    if (await runtime.openSavedScenario(id, discard)) {
      setNotice(undefined);
      bridge?.open('conductor');
    } else
      setNotice(
        runtime.getSnapshot().scenario.error ??
          'The saved scenario could not be loaded.',
      );
  }
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
          if (open) {
            void runtime.loadMissions();
            void runtime.refreshScenarios();
            void runtime.refreshInteractive();
          }
        }}
      >
        <Menu.Trigger
          ref={picker}
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
            <Menu.Label className="menu-label">
              Saved scenarios · latest revisions
            </Menu.Label>
            {(state.interactive.pending || state.interactive.startingDemo) && (
              <div className="catalog-message" role="status">
                Finishing or reconciling a demo request. Saved scenarios will be
                available when it completes.
              </div>
            )}
            {state.scenario.catalog.map((saved) => (
              <Menu.Item
                key={saved.definitionId}
                className="menu-item mission-option"
                disabled={Boolean(
                  state.interactive.pending || state.interactive.startingDemo,
                )}
                onSelect={() => void openSaved(saved.definitionId)}
              >
                <span className="mission-option-check" aria-hidden="true">
                  {state.scenario.active &&
                    state.scenario.saved?.definitionId ===
                      saved.definitionId && <Check size={12} />}
                </span>
                <span>
                  {saved.content.name} · r{saved.revision}
                  <small className="saved-scenario-caption">
                    Saved plan · inspect, validate and run
                  </small>
                </span>
              </Menu.Item>
            ))}
            {!state.scenario.catalog.length && (
              <div className="catalog-message">
                Save a scenario in Orchestrator to list it here.
              </div>
            )}
            <Menu.Separator className="menu-separator" />
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
                  <Menu.SubContent
                    className="menu-content mission-menu"
                    sticky="always"
                  >
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
                  <Menu.SubContent
                    className="menu-content mission-menu"
                    sticky="always"
                  >
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
      <Dialog.Root
        open={!!replaceId}
        onOpenChange={(open) => {
          if (!open) setReplaceId(undefined);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="mission-plan-overlay" />
          <Dialog.Content
            className="mission-plan-confirm"
            role="alertdialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              picker.current?.focus();
            }}
          >
            <Dialog.Title>Replace unsaved arrangement?</Dialog.Title>
            <Dialog.Description>
              Loading this saved scenario replaces your unsaved arrangement.
              Save it first, or explicitly discard those changes.
            </Dialog.Description>
            <button
              onClick={() => {
                setReplaceId(undefined);
                bridge?.open('units');
              }}
            >
              Keep editing
            </button>
            <button
              onClick={() => replaceId && void openSaved(replaceId, true)}
            >
              Discard changes and load
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      {notice && (
        <span className="mission-error" role="alert">
          {notice}
          <button
            aria-label="Dismiss mission notice"
            onClick={() => setNotice(undefined)}
          >
            ×
          </button>
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
  const state = useOperationalSnapshot(runtime);
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
      ) : state.scenario.active ? (
        `${state.scenario.draft.name} · ${state.scenario.saved && !state.scenario.dirty ? `Saved revision ${state.scenario.saved.revision}` : 'Unsaved plan'} · Not started`
      ) : state.interactive.entry?.activeMissionId ? (
        'No mission displayed · active demo remains running'
      ) : (
        'No mission loaded'
      )}
    </span>
  );
}
