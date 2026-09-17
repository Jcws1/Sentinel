import { useSyncExternalStore } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { Info, ListChecks, CircleAlert, LoaderCircle } from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { terminalExecution } from '../../world/movement';
import { SimulationControls } from './SimulationControls';
import { directStatusText } from './presentation';

export function OperationalChrome({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime();
  return runtime ? <Chrome runtime={runtime} bridge={bridge} /> : null;
}
function Chrome({
  runtime,
  bridge,
}: {
  runtime: ApplicationRuntime;
  bridge: WorkspaceBridge;
}) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    ui = state.interactive,
    frame = state.presentation.frame;
  const executions = frame?.interactive?.executions ?? [],
    active = executions.filter((e) => !terminalExecution(e)),
    failures = executions.filter((e) =>
      ['Failed', 'Interrupted', 'Expired'].includes(e.state),
    );
  const awaiting = [ui.directReceipt, ui.movementReceipt, ui.receipt].some(
    (r) =>
      r?.missionId === frame?.mission.id &&
      r?.accepted &&
      (r.sequence ?? 0) > (frame?.sequence ?? 0),
  );
  const stale =
    !!frame &&
    (state.connection !== 'connected' || state.presentation.status === 'stale');
  const directPending = (ui.directPending ?? []).filter(
    (p) => p.missionId === frame?.mission.id,
  );
  const conflict =
    frame?.interactive?.state !== 'ended' &&
    ui.current &&
    ui.current.run.runId === frame?.interactive?.runId &&
    !ui.current.ownsControl &&
    ['held', 'expired'].includes(ui.current.leaseState);
  const skipped =
    ui.directReceipt?.missionId === frame?.mission.id &&
    ui.directReceipt?.memberOutcomes?.some((o) => o.outcome === 'skipped');
  const directProblem = ui.directFeedback?.stage === 'rejected' || skipped;
  const connection = state.presentation.sourceDelayed
    ? 'Source report delayed'
    : state.connection === 'connected'
      ? 'Reports delayed'
      : 'Connection lost';
  const messages = [
    ...new Set(
      [
        stale ? `${connection} · Last committed state retained.` : undefined,
        ui.error,
        conflict
          ? ui.current?.leaseState === 'held'
            ? 'Another session has control.'
            : 'Control expired. Simulation → Take control.'
          : undefined,
        directProblem ? directStatusText(state) : undefined,
        directPending.length
          ? `${directPending.length} command${directPending.length === 1 ? '' : 's'} pending · checking receipts`
          : undefined,
        ui.pending
          ? ui.busy
            ? 'Request pending…'
            : 'Saved request · outcome unconfirmed'
          : undefined,
        awaiting ? 'Received, awaiting world synchronization.' : undefined,
        failures.length
          ? `${failures.length} movement${failures.length === 1 ? '' : 's'} need attention`
          : undefined,
      ].filter((m): m is string => !!m),
    ),
  ];
  const warning =
    stale || !!ui.error || !!conflict || !!failures.length || !!directProblem;
  const label = stale ? connection : warning ? 'Attention' : 'Pending';
  return (
    <div className="operational-chrome">
      <SimulationControls state={state} runtime={runtime} compact />
      {!!messages.length && (
        <div
          className="operational-attention"
          data-warning={warning}
          aria-label="Operational attention"
        >
          <span className="sr-only" role="status">
            {messages.map((message) => (
              <span key={message}>{message} </span>
            ))}
          </span>
          <Menu.Root>
            <Menu.Trigger
              className="text-control attention-trigger"
              aria-label={`${label}: ${messages.join(' ')}`}
              title={messages.join(' · ')}
            >
              {warning ? <CircleAlert size={13} /> : <LoaderCircle size={13} />}
              <span>{label}</span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content
                className="menu-content attention-menu"
                align="end"
                sideOffset={6}
              >
                <Menu.Label className="menu-label">
                  Operational attention
                </Menu.Label>
                {messages.map((m) => (
                  <p key={m}>{m}</p>
                ))}
                {ui.pending && !ui.busy && (
                  <>
                    <Menu.Separator className="menu-separator" />
                    <Menu.Item
                      className="menu-item"
                      onSelect={() => void runtime.reconcileInteractive()}
                    >
                      Check receipt
                    </Menu.Item>
                    <Menu.Item
                      className="menu-item"
                      onSelect={() => void runtime.reconcileInteractive(true)}
                    >
                      Retry saved request
                    </Menu.Item>
                  </>
                )}
                <Menu.Separator className="menu-separator" />
                <Menu.Item
                  className="menu-item"
                  onSelect={() => bridge.open('movement')}
                >
                  Open Activity
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </div>
      )}
      <button
        className="text-control chrome-details"
        aria-label="Open Details"
        onClick={() => bridge.revealDetails(true)}
      >
        <Info size={13} />
        <span>Details</span>
      </button>
      <button
        className="text-control"
        aria-label="Open Activity"
        onClick={() => bridge.open('movement')}
      >
        <ListChecks size={13} />
        <span>Activity{active.length ? ` · ${active.length}` : ''}</span>
      </button>
    </div>
  );
}
