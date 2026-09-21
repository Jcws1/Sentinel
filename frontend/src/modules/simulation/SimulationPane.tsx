import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  PaneVisibilityContext,
  useOperationalRuntime,
} from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../../features/workspace/workspaceBridge';
import { previewRequest } from './contracts';
import golden from '../../../../contracts/simulation/fixtures/golden.request.json';
import './simulation.css';

const dormant = () => () => {};
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
  const fileGeneration = useRef(0);
  const notice = useRef<HTMLDivElement>(null);
  const input = useMemo(() => previewRequest(state.draft), [state.draft]);
  const times = useMemo(
    () => Object.keys(state.result?.results_by_timestamp ?? {}).sort(),
    [state.result],
  );
  const at = times.includes(timestamp) ? timestamp : times[0];
  const result = state.result?.results_by_timestamp[at];
  const pages = Math.max(1, Math.ceil((result?.interactions.length ?? 0) / 50));
  const currentPage = Math.min(page, pages - 1);
  const run = state.selected;
  const locked = state.busy || !!state.pending || !!state.blocked;
  const controls =
    !!run &&
    run.phase === 'ready' &&
    ['RUNNING', 'HELD'].includes(run.state ?? '') &&
    !locked;
  useEffect(() => {
    if (visible) void client.refresh();
  }, [visible, client]);
  useEffect(() => {
    if (visible && state.error) notice.current?.focus();
  }, [visible, state.error]);
  useEffect(
    () => () => {
      fileGeneration.current++;
    },
    [],
  );
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
            aria-label="Load simulation JSON batch"
            type="file"
            accept=".json,application/json"
            disabled={locked}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              const generation = ++fileGeneration.current;
              if (!file) return;
              try {
                const raw = await file.text();
                if (generation === fileGeneration.current) {
                  client.edit(raw);
                  setFileError('');
                }
              } catch {
                if (generation === fileGeneration.current)
                  setFileError('The selected file could not be read.');
              }
            }}
          />
        </label>
        <button
          className="text-control"
          disabled={locked}
          onClick={() => {
            fileGeneration.current++;
            client.edit(
              JSON.stringify(
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
              ),
            );
          }}
        >
          Load notional example
        </button>
      </div>
      <label className="simulation-editor">
        External request JSON
        <textarea
          aria-label="External simulation request JSON"
          value={state.draft}
          spellCheck={false}
          disabled={locked}
          onChange={(event) => {
            fileGeneration.current++;
            client.edit(event.target.value);
          }}
        />
      </label>
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
            {input.command.source_mode} · altitude MSL ·{' '}
            {Object.keys(input.samples_by_timestamp).length} supplied timestamps
          </dd>
        </dl>
      ) : (
        <p>
          Load a batch or example. Complete validation runs at the authority on
          submission.
        </p>
      )}
      <div className="simulation-actions">
        <button
          className="text-control"
          disabled={locked || !state.draft.trim()}
          onClick={() => void client.submit()}
        >
          Submit {input?.command.action ?? 'batch'}
        </button>
        {state.pending && (
          <button
            className="text-control"
            disabled={state.busy || state.blocked}
            onClick={() => void client.submit(true)}
          >
            Retry exact pending command
          </button>
        )}
      </div>
      <div
        ref={notice}
        tabIndex={-1}
        className="simulation-notice"
        role={state.error || fileError ? 'alert' : 'status'}
      >
        {state.error || fileError}
        {state.message && <p>{state.message}</p>}
        {state.pending && (
          <p>
            Pending body is protected across reload. Editing is locked until
            acknowledgement or authoritative rejection.
          </p>
        )}
      </div>
      <section aria-label="External simulation runs">
        <h2>Recorded runs</h2>
        <div className="simulation-actions">
          <select
            aria-label="External simulation run"
            value={run?.missionId ?? ''}
            onChange={(event) => {
              setPage(0);
              void client.inspect(event.target.value);
            }}
            disabled={state.loading}
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
          <button
            className="text-control"
            onClick={() => void client.refresh()}
          >
            Refresh runs
          </button>
        </div>
        {run && (
          <>
            <p>
              {run.state ?? 'RECEIVED'} · {run.phase} ·{' '}
              {run.calibration.evidenceStatus}
            </p>
            <p className="simulation-policy">
              Local provisional policy: {run.policyId}. Exact external signoff
              remains separate.
            </p>
            <div className="simulation-actions">
              <button
                className="text-control"
                onClick={() => {
                  runtime.loadMission(run.missionId);
                  void runtime.loadMissions();
                  bridge.open('tactical');
                }}
              >
                Inspect mapped mission
              </button>
              <button
                className="text-control"
                disabled={!controls}
                onClick={() => void client.control('HOLD')}
              >
                HOLD external run
              </button>
              <button
                className="text-control"
                disabled={!controls}
                onClick={() => void client.control('ABORT')}
              >
                ABORT external run
              </button>
            </div>
            <div className="simulation-actions">
              <button
                className="text-control"
                disabled={state.loading}
                onClick={() => void client.commands()}
              >
                Load recorded commands
              </button>
              {state.commands && (
                <>
                  <select
                    aria-label="Recorded external command"
                    disabled={state.loading}
                    value={
                      state.commands.some(
                        (command) =>
                          command.commandId === state.resultCommandId,
                      )
                        ? state.resultCommandId
                        : ''
                    }
                    onChange={(event) =>
                      void client.inspectCommand(event.target.value)
                    }
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
                        {command.action} · {command.commandId} · {command.state}
                      </option>
                    ))}
                  </select>
                  <button
                    className="text-control"
                    disabled={state.loading || state.commands.length < 100}
                    onClick={() =>
                      void client.commands(state.commands!.at(-1)!.sequence)
                    }
                  >
                    Next 100 commands
                  </button>
                  {!!state.commandsAfter && (
                    <button
                      className="text-control"
                      disabled={state.loading}
                      onClick={() => void client.commands()}
                    >
                      First command page
                    </button>
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
      {state.result && (
        <section aria-label="Recorded simulation outcome">
          <h2>Committed outcome</h2>
          <p>
            {state.result.command_ack.command_id} ·{' '}
            {state.result.command_ack.run_status}
          </p>
          <a
            className="text-control"
            href={client.resultUrl(state.result.command_ack.command_id)}
            target="_blank"
            rel="noreferrer"
          >
            Open complete recorded JSON
          </a>
          {times.length === 0 ? (
            <p>This control evaluated no timestamps.</p>
          ) : (
            <>
              <label>
                Source timestamp{' '}
                <select
                  aria-label="Recorded result timestamp"
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
                {result!.drone_health.length} health rows ·{' '}
                {result!.interactions.length} interactions. All rows remain in
                the complete recorded JSON.
              </p>
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
                      .slice(currentPage * 50, (currentPage + 1) * 50)
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
              <div className="simulation-actions">
                <button
                  className="text-control"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  Previous interactions
                </button>
                <button
                  className="text-control"
                  disabled={currentPage + 1 >= pages}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next interactions
                </button>
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
