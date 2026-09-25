import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  PaneVisibilityContext,
  useOperationalRuntime,
} from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../../features/workspace/workspaceBridge';
import { previewRequest } from './contracts';
import type { SimulationResponse } from './response.generated';
import golden from '../../../../contracts/simulation/fixtures/golden.request.json';
import '../../styles/mission.css';
import './simulation.css';

const dormant = () => () => {};
const PAGE = 50;
type HealthRow =
  SimulationResponse['results_by_timestamp'][string]['drone_health'][number];

/**
 * An unavailable action stays focusable (aria-disabled) and ignores activation,
 * so keyboard focus never falls to the page while a command starts or ends.
 */
function Action({
  unavailable,
  onPress,
  children,
  className = 'text-control',
  buttonRef,
}: {
  unavailable?: boolean;
  onPress: () => void;
  children: ReactNode;
  className?: string;
  buttonRef?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      aria-disabled={unavailable || undefined}
      onClick={() => {
        if (!unavailable) onPress();
      }}
    >
      {children}
    </button>
  );
}

/**
 * Confirmation for an irreversible or destructive step. The safe choice is
 * focused first; closing returns focus to the control that asked.
 */
function Confirm({
  open,
  title,
  children,
  keep,
  proceed,
  danger,
  onKeep,
  onProceed,
  returnFocus,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  keep: string;
  proceed: string;
  danger?: boolean;
  onKeep: () => void;
  onProceed: () => void;
  returnFocus: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onKeep();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="mission-plan-overlay" />
        <Dialog.Content
          className="mission-plan-confirm"
          role="alertdialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{children}</Dialog.Description>
          <button type="button" onClick={onKeep}>
            {keep}
          </button>
          <button
            type="button"
            className={danger ? 'simulation-danger' : undefined}
            onClick={onProceed}
          >
            {proceed}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Keep a focused pager button in view when a shorter page shrinks the table. */
function useFocusedInView(
  container: RefObject<HTMLElement | null>,
  page: unknown,
) {
  useEffect(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && container.current?.contains(active))
      active.scrollIntoView({ block: 'nearest' });
  }, [container, page]);
}

const ABORT_EFFECT =
  "ABORT finalizes this run's recording. The run cannot be held or resumed afterwards; continuing needs a new mission ID. Recorded results stay inspectable.";

/** Per-timestamp health outcomes: changed rows by default, every row on request. */
function HealthChanges({ rows }: { rows: readonly Readonly<HealthRow>[] }) {
  const [all, setAll] = useState(false);
  const [page, setPage] = useState(0);
  const pager = useRef<HTMLDivElement>(null);
  const changed = rows.filter(
    (row) => row.health_after !== row.health_before || row.state_discontinuity,
  );
  const shown = all ? rows : changed;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const current = Math.min(page, pages - 1);
  const disabled = changed.filter(
    (row) => row.health_before > 0 && row.health_after === 0,
  ).length;
  const corrected = changed.filter((row) => row.state_discontinuity).length;
  useFocusedInView(pager, `${all}:${current}`);
  return (
    <>
      <p>
        Health changes: {changed.length} of {rows.length}{' '}
        {rows.length === 1 ? 'drone' : 'drones'} · {disabled} reached zero
        health · {corrected} supplied{' '}
        {corrected === 1 ? 'correction' : 'corrections'}.
      </p>
      {shown.length > 0 && (
        <div className="simulation-table-scroll">
          <table>
            <caption>
              {all ? 'All health rows' : 'Changed health rows'} · page{' '}
              {current + 1} of {pages}
            </caption>
            <thead>
              <tr>
                <th>Drone</th>
                <th>Health before → after</th>
                <th>Status after</th>
                <th>Supplied correction</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(current * PAGE, (current + 1) * PAGE).map((row) => (
                <tr key={row.drone_id}>
                  <td>{row.drone_id}</td>
                  <td>
                    {row.health_before} → {row.health_after}
                  </td>
                  <td>{row.status_after}</td>
                  <td>
                    {row.state_discontinuity
                      ? 'Yes: supplied health differs from the last recorded output'
                      : 'No'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="simulation-actions" ref={pager}>
        <Action
          onPress={() => {
            setAll(!all);
            setPage(0);
          }}
        >
          {all
            ? 'Show changed health rows only'
            : `Show all ${rows.length} health rows`}
        </Action>
        {pages > 1 && (
          <>
            <Action
              unavailable={current === 0}
              onPress={() => setPage(current - 1)}
            >
              Previous health rows
            </Action>
            <Action
              unavailable={current + 1 >= pages}
              onPress={() => setPage(current + 1)}
            >
              Next health rows
            </Action>
          </>
        )}
      </div>
    </>
  );
}

export function SimulationPane({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime()!;
  const client = runtime.simulation;
  const visible = useContext(PaneVisibilityContext);
  const state = useSyncExternalStore(
    visible ? client.subscribe : dormant,
    client.getSnapshot,
  );
  const [page, setPage] = useState(0);
  const [timestamp, setTimestamp] = useState('');
  const [fileError, setFileError] = useState('');
  const [confirm, setConfirm] = useState<
    'abort-run' | 'abort-draft' | 'replace-draft'
  >();
  const fileGeneration = useRef(0);
  /** The draft exactly as last loaded from a file or the example: unedited. */
  const loaded = useRef<string>(undefined);
  const retrying = useRef(false);
  const notice = useRef<HTMLDivElement>(null);
  const abortButton = useRef<HTMLButtonElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const exampleButton = useRef<HTMLButtonElement>(null);
  const interactionPager = useRef<HTMLDivElement>(null);
  const input = useMemo(() => previewRequest(state.draft), [state.draft]);
  const abortDraft = input?.command.action === 'ABORT';
  const times = useMemo(
    () => Object.keys(state.result?.results_by_timestamp ?? {}).sort(),
    [state.result],
  );
  const at = times.includes(timestamp) ? timestamp : times[0];
  const result = state.result?.results_by_timestamp[at];
  const pages = Math.max(
    1,
    Math.ceil((result?.interactions.length ?? 0) / PAGE),
  );
  const currentPage = Math.min(page, pages - 1);
  const run = state.selected;
  const locked = state.busy || !!state.pending || !!state.blocked;
  const controls =
    !!run &&
    run.phase === 'ready' &&
    ['RUNNING', 'HELD'].includes(run.state ?? '') &&
    !locked;
  const supplied = input ? Object.keys(input.samples_by_timestamp).length : 0;
  useEffect(() => {
    if (visible) void client.refresh();
  }, [visible, client]);
  useEffect(() => {
    if (visible && (state.error || fileError)) notice.current?.focus();
  }, [visible, state.error, fileError]);
  useEffect(() => {
    if (state.pending || !retrying.current) return;
    retrying.current = false;
    // The retry button leaves once its command resolves: keep focus on the
    // command row instead of letting it fall to the page.
    if (!document.activeElement || document.activeElement === document.body)
      submitButton.current?.focus();
  }, [state.pending]);
  useFocusedInView(interactionPager, `${at}:${currentPage}`);
  useEffect(
    () => () => {
      fileGeneration.current++;
    },
    [],
  );
  function loadExample() {
    fileGeneration.current++;
    const text = JSON.stringify(
      {
        ...golden,
        mission_id: `TEST-${crypto.randomUUID()}`,
        command: {
          ...golden.command,
          command_id: crypto.randomUUID(),
        },
      },
      null,
      2,
    );
    loaded.current = text;
    client.edit(text);
  }
  return (
    <div className="simulation-pane">
      <header>
        <span className="constraint-tag">SIMULATION ONLY</span>
        <h1>External simulation</h1>
        <p>
          Load a v1 batch, review its identity, then submit it for authoritative
          recording.
        </p>
      </header>
      <div className="simulation-actions">
        <label className="text-control">
          Load JSON batch
          <input
            type="file"
            accept=".json,application/json"
            disabled={locked}
            onChange={async (event) => {
              const control = event.currentTarget;
              const file = control.files?.[0];
              const generation = ++fileGeneration.current;
              if (!file) return;
              try {
                const raw = await file.text();
                if (generation === fileGeneration.current) {
                  loaded.current = raw;
                  client.edit(raw);
                  setFileError('');
                }
              } catch {
                if (generation === fileGeneration.current)
                  setFileError('The selected file could not be read.');
              } finally {
                // The draft identity below names what was loaded; a stale file
                // name here would not.
                control.value = '';
              }
            }}
          />
        </label>
        <Action
          buttonRef={exampleButton}
          unavailable={locked}
          onPress={() => {
            if (state.draft.trim() && state.draft !== loaded.current)
              setConfirm('replace-draft');
            else loadExample();
          }}
        >
          Load notional example
        </Action>
      </div>
      <Confirm
        open={confirm === 'replace-draft' && !locked}
        title="Replace the edited draft?"
        keep="Keep draft"
        proceed="Replace draft"
        onKeep={() => setConfirm(undefined)}
        onProceed={() => {
          setConfirm(undefined);
          loadExample();
        }}
        returnFocus={exampleButton}
      >
        The notional example replaces the draft in the editor. The editor keeps
        no undo history, so the edits are lost.
      </Confirm>
      <label className="simulation-editor">
        External request JSON
        <textarea
          value={state.draft}
          spellCheck={false}
          disabled={locked}
          onChange={(event) => {
            fileGeneration.current++;
            client.edit(event.target.value);
          }}
        />
      </label>
      <h2>Draft to submit</h2>
      {input ? (
        <dl className="simulation-identity">
          <dt>Mission</dt>
          <dd>{input.mission_id}</dd>
          <dt>Command</dt>
          <dd>
            {input.command.command_id} · {input.command.action}
          </dd>
          <dt>Profile</dt>
          <dd>
            {input.calibration_profile.profile_id} /{' '}
            {input.calibration_profile.version} ·{' '}
            {input.calibration_profile.evidence_status}
          </dd>
          <dt>Source</dt>
          <dd>
            {input.command.source_mode} · altitude MSL · {supplied} supplied{' '}
            {supplied === 1 ? 'timestamp' : 'timestamps'}
          </dd>
        </dl>
      ) : state.draft.trim() ? (
        <p>
          This draft is not a readable v1 request (invalid JSON or outside the
          v1 schema), so its identity cannot be shown. It can still be
          submitted: the authority validates it completely and reports the first
          error.
        </p>
      ) : (
        <p>
          Load a batch or example. Complete validation runs at the authority on
          submission.
        </p>
      )}
      <div className="simulation-actions">
        <Action
          buttonRef={submitButton}
          className={
            abortDraft ? 'text-control simulation-danger' : 'text-control'
          }
          unavailable={locked || !state.draft.trim()}
          onPress={() => {
            if (abortDraft) setConfirm('abort-draft');
            else void client.submit();
          }}
        >
          Submit {input?.command.action ?? 'batch'}
        </Action>
        {state.pending && (
          <Action
            unavailable={state.busy || state.blocked}
            onPress={() => {
              retrying.current = true;
              void client.submit(true);
            }}
          >
            Retry exact pending command
          </Action>
        )}
      </div>
      <Confirm
        open={confirm === 'abort-draft' && !locked && abortDraft}
        title={`ABORT ${input?.mission_id ?? ''}?`}
        keep="Keep run"
        proceed="Confirm ABORT"
        danger
        onKeep={() => setConfirm(undefined)}
        onProceed={() => {
          setConfirm(undefined);
          void client.submit();
        }}
        returnFocus={submitButton}
      >
        {ABORT_EFFECT}
      </Confirm>
      <div className="simulation-notice">
        <div
          ref={notice}
          tabIndex={-1}
          className="simulation-alert"
          role="alert"
        >
          {state.error || fileError}
        </div>
        <div role="status">
          {state.message && <p>{state.message}</p>}
          {state.pending && (
            <p>
              Pending body is protected across reload. Editing is locked until
              acknowledgement or authoritative rejection.
            </p>
          )}
        </div>
      </div>
      <section aria-label="External simulation runs">
        <h2>Recorded runs</h2>
        <div className="simulation-actions">
          <label>
            Recorded run{' '}
            <select
              value={run?.missionId ?? state.inspecting ?? ''}
              onChange={(event) => {
                setPage(0);
                setTimestamp('');
                void client.inspect(event.target.value);
              }}
            >
              <option value="" disabled>
                Select a recorded run
              </option>
              {state.runs.map((item) => (
                <option key={item.missionId} value={item.missionId}>
                  {item.externalMissionId} · {item.state ?? 'RECEIVED'} ·{' '}
                  {item.phase}
                </option>
              ))}
            </select>
          </label>
          <Action onPress={() => void client.refresh()}>Refresh runs</Action>
        </div>
        {state.inspecting && !run && (
          <p role="status" className="simulation-run-loading">
            Loading recorded run…
          </p>
        )}
        {run && (
          <>
            <p>
              {run.state ?? 'RECEIVED'} · {run.phase} ·{' '}
              {run.calibration.evidenceStatus}
              {run.state === 'ABORTED' ? ' · recording finalized' : ''}
            </p>
            <p className="simulation-policy">
              Local provisional policy: {run.policyId}. Exact external signoff
              remains separate.
            </p>
            <div className="simulation-actions">
              <Action
                onPress={() => {
                  runtime.loadMission(run.missionId);
                  void runtime.loadMissions();
                  bridge.open('tactical');
                }}
              >
                Inspect mapped mission
              </Action>
              <Action
                unavailable={!controls}
                onPress={() => void client.control('HOLD')}
              >
                {run.state === 'HELD'
                  ? 'HOLD again (recorded no-op)'
                  : 'HOLD external run'}
              </Action>
              <Action
                className="text-control simulation-danger simulation-separated"
                buttonRef={abortButton}
                unavailable={!controls}
                onPress={() => setConfirm('abort-run')}
              >
                ABORT external run
              </Action>
            </div>
            <Confirm
              open={confirm === 'abort-run' && controls}
              title={`ABORT ${run.externalMissionId}?`}
              keep="Keep run"
              proceed="Confirm ABORT"
              danger
              onKeep={() => setConfirm(undefined)}
              onProceed={() => {
                setConfirm(undefined);
                void client.control('ABORT');
              }}
              returnFocus={abortButton}
            >
              {ABORT_EFFECT}
            </Confirm>
            <div className="simulation-actions">
              <Action
                unavailable={state.loading}
                onPress={() => void client.commands()}
              >
                Load recorded commands
              </Action>
              {state.commands && (
                <>
                  <label>
                    Recorded command{' '}
                    <select
                      value={
                        state.commands.some(
                          (command) =>
                            command.commandId === state.resultCommandId,
                        )
                          ? state.resultCommandId
                          : ''
                      }
                      onChange={(event) => {
                        setPage(0);
                        setTimestamp('');
                        void client.inspectCommand(event.target.value);
                      }}
                    >
                      <option value="" disabled>
                        Select committed command
                      </option>
                      {state.commands.map((command) => (
                        <option
                          key={command.commandId}
                          value={command.commandId}
                          disabled={command.state !== 'completed'}
                        >
                          {command.action} · {command.commandId} ·{' '}
                          {command.state}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Action
                    unavailable={state.loading || state.commands.length < 100}
                    onPress={() =>
                      void client.commands(state.commands!.at(-1)!.sequence)
                    }
                  >
                    Next 100 commands
                  </Action>
                  {!!state.commandsAfter && (
                    <Action
                      unavailable={state.loading}
                      onPress={() => void client.commands()}
                    >
                      First command page
                    </Action>
                  )}
                </>
              )}
            </div>
            {run.state === 'HELD' && (
              <p>
                To RESUME, load a batch with this mission ID, action RESUME, a
                new command ID and explicitly supplied health. Review it above,
                then submit.
              </p>
            )}
          </>
        )}
      </section>
      {state.resultCommandId && !state.result && state.loading && (
        <p role="status">Loading recorded command result…</p>
      )}
      {state.result && (
        <section aria-label="Recorded simulation outcome">
          <h2>Committed outcome</h2>
          <p>
            {state.result.command_ack.command_id} · run state recorded with this
            command: {state.result.command_ack.run_status}
          </p>
          <div className="simulation-actions">
            <a
              className="text-control"
              href={client.resultUrl(state.result.command_ack.command_id)}
              target="_blank"
              rel="noreferrer"
            >
              Open complete recorded JSON
            </a>
          </div>
          {times.length === 0 ? (
            <p>This control evaluated no timestamps.</p>
          ) : (
            <>
              <label>
                Source timestamp (UTC){' '}
                <select
                  value={at}
                  onChange={(event) => {
                    setTimestamp(event.target.value);
                    setPage(0);
                  }}
                >
                  {times.map((time) => (
                    <option key={time}>{time}</option>
                  ))}
                </select>
              </label>
              <p>
                {result!.drone_health.length}{' '}
                {result!.drone_health.length === 1
                  ? 'health row'
                  : 'health rows'}{' '}
                · {result!.interactions.length}{' '}
                {result!.interactions.length === 1
                  ? 'interaction'
                  : 'interactions'}
                . All rows remain in the complete recorded JSON.
              </p>
              <HealthChanges
                key={`${state.result.command_ack.command_id}:${at}`}
                rows={result!.drone_health}
              />
              <div className="simulation-table-scroll">
                <table>
                  <caption>
                    Recorded interactions · page {currentPage + 1} of {pages}
                  </caption>
                  <thead>
                    <tr>
                      <th>Red</th>
                      <th>Blue</th>
                      <th>Outcome</th>
                      <th>Separation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result!.interactions
                      .slice(currentPage * PAGE, (currentPage + 1) * PAGE)
                      .map((interaction, index) => (
                        <tr
                          key={`${interaction.red_drone_id}:${interaction.blue_drone_id}:${index}`}
                        >
                          <td>{interaction.red_drone_id}</td>
                          <td>{interaction.blue_drone_id}</td>
                          <td>{interaction.outcome}</td>
                          <td>{interaction.separation_m} m</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <div className="simulation-actions" ref={interactionPager}>
                <Action
                  unavailable={currentPage === 0}
                  onPress={() => setPage(currentPage - 1)}
                >
                  Previous interactions
                </Action>
                <Action
                  unavailable={currentPage + 1 >= pages}
                  onPress={() => setPage(currentPage + 1)}
                >
                  Next interactions
                </Action>
              </div>
            </>
          )}
        </section>
      )}
      <p className="simulation-policy">
        Recorded observations are discrete. Missing inputs mean unobserved. No
        live aircraft control or inferred aircraft model. MSL is preserved; no
        terrain-clearance claim.
      </p>
    </div>
  );
}
