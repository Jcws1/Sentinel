import * as Menu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import type { Action } from '../../services/interactiveClient';
import './simulation.css';

export function SimulationControls({
  state,
  runtime,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
}) {
  const ui = state.interactive,
    frame = state.presentation.frame,
    run = frame?.interactive;
  const current = ui.current;
  const synced =
    !!run &&
    current?.run.executorEpoch === run.executorEpoch &&
    current.run.runRevision === run.runRevision &&
    current.run.lease.revision === run.lease.revision;
  const common = !ui.entry
    ? 'Checking the local backend.'
    : !ui.entry.enabled
      ? 'Enable the local synthetic template on the backend.'
      : ui.pending
        ? 'Reconcile the saved request first.'
        : ui.busy
          ? 'A request is pending.'
          : undefined;
  const reason = (action: Action) => {
    if (common) return common;
    if (!run) return 'Create or reopen a local demo run.';
    if (run.state === 'ended') return 'This run has ended.';
    if (state.connection !== 'connected')
      return 'Reconnect to the backend for current state.';
    if (!synced) return 'Waiting for current control status and world sync.';
    if (action === 'acquire')
      return current.leaseState === 'held'
        ? 'Control is already held.'
        : current.leaseState === 'expired'
          ? 'Use Reclaim control for the expired lease.'
          : undefined;
    if (action === 'reclaim')
      return current.leaseState !== 'expired'
        ? 'Reclaim is available only after lease expiry.'
        : undefined;
    if (!current.ownsControl)
      return current.leaseState === 'expired'
        ? 'Reclaim control before submitting an action.'
        : 'Acquire control in this session.';
    if (action === 'start' && run.state !== 'ready')
      return 'Start is available before the first start.';
    if (action === 'pause' && run.state !== 'running')
      return 'Pause requires a running source.';
    if (action === 'resume' && run.state !== 'paused')
      return 'Resume requires a paused source.';
    return undefined;
  };
  const actions: [Action, string][] = [
    ['acquire', 'Acquire control'],
    ['start', 'Start'],
    ['pause', 'Pause'],
    ['resume', 'Resume'],
    ['end', 'End'],
  ];
  if (current?.leaseState === 'expired')
    actions.splice(1, 0, ['reclaim', 'Reclaim control']);
  if (current?.ownsControl) actions.push(['revoke', 'Release control']);
  const createReason =
    common ??
    (ui.entry?.activeMissionId
      ? 'End the active run before creating another.'
      : undefined);
  const verifiedSource =
    state.connection === 'connected' &&
    state.presentation.status !== 'stale' &&
    current &&
    synced;
  const sourceStatus = !run
    ? undefined
    : run.state === 'ended'
      ? 'Recording retained'
      : !verifiedSource
        ? `Source state unverified · last known ${run.state === 'running' ? 'running' : 'paused'}`
        : run.state !== 'running'
          ? 'Source clock paused'
          : !run.lastReportAt
            ? 'Waiting for the first source report'
            : Date.parse(current.serverTime) - Date.parse(run.lastReportAt) >
                2000
              ? 'Source report delayed'
              : 'Stationary source running';
  const awaiting =
    ui.receipt?.accepted &&
    ui.receipt.missionId === frame?.mission.id &&
    !!frame &&
    ui.receipt.sequence! > frame.sequence;
  return (
    <section className="simulation-controls" aria-label="Local demo simulation">
      <div className="simulation-heading">
        <Menu.Root
          modal={false}
          onOpenChange={(open) => {
            if (open) void runtime.refreshInteractive();
          }}
        >
          <Menu.Trigger className="text-control simulation-trigger">
            Simulation <ChevronDown size={12} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Content
              className="menu-content simulation-menu"
              align="start"
              sideOffset={5}
            >
              <Menu.Label className="menu-label">
                Local synthetic demonstration
              </Menu.Label>
              <Menu.Item
                className="menu-item simulation-action"
                disabled={!!createReason}
                onSelect={() => void runtime.interactiveAction('create')}
              >
                <span>New demo run</span>
                {createReason && <small>{createReason}</small>}
              </Menu.Item>
              {ui.entry?.activeMissionId &&
                ui.entry.activeMissionId !== state.missionId && (
                  <Menu.Item
                    className="menu-item"
                    onSelect={() =>
                      runtime.loadMission(ui.entry!.activeMissionId!)
                    }
                  >
                    Reopen active run
                  </Menu.Item>
                )}
              <Menu.Separator className="menu-separator" />
              {actions.map(([action, label]) => {
                const unavailable = reason(action);
                return (
                  <Menu.Item
                    key={action}
                    className="menu-item simulation-action"
                    disabled={!!unavailable}
                    onSelect={() => void runtime.interactiveAction(action)}
                  >
                    <span>{label}</span>
                    {unavailable && <small>{unavailable}</small>}
                  </Menu.Item>
                );
              })}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        <span className="constraint-tag">SYNTHETIC · LOCAL</span>
        <span className="simulation-run-state" data-run-state={run?.state}>
          {run
            ? run.state === 'ready'
              ? 'READY · PAUSED'
              : run.state.toUpperCase()
            : 'No demo run loaded'}
        </span>
      </div>
      <div className="simulation-status" role="status" aria-live="polite">
        <span>
          {run
            ? current && synced
              ? current.ownsControl
                ? `You have control · ${ui.holderId}`
                : current.leaseState === 'expired'
                  ? `Control expired · ${current.run.lease.holderId}. Reclaim explicitly.`
                  : current.run.lease.holderId
                    ? `Control held by ${current.run.lease.holderId}`
                    : 'Control unclaimed · Acquire control to begin.'
              : 'Checking control status…'
            : ui.entry?.activeMissionId
              ? 'An active run is available. Simulation → Reopen active run.'
              : 'Simulation → New demo run to begin.'}
        </span>
        {run && (
          <span>{sourceStatus} · Movement and encounters unavailable</span>
        )}
        {ui.busy && <span>Request pending…</span>}
        {awaiting && (
          <span>Committed receipt received · awaiting world sync</span>
        )}
        {ui.error && <span className="simulation-error">{ui.error}</span>}
      </div>
      {ui.pending && (
        <div className="simulation-reconciliation">
          <span>
            Saved{' '}
            {'creationId' in ui.pending.body
              ? 'creation'
              : ui.pending.body.intent.action}{' '}
            request · outcome unconfirmed
          </span>
          <button
            className="text-control"
            disabled={ui.busy}
            onClick={() => void runtime.reconcileInteractive()}
          >
            Reconcile request
          </button>
          <button
            className="text-control"
            disabled={ui.busy}
            onClick={() => void runtime.reconcileInteractive(true)}
          >
            Retry saved request
          </button>
        </div>
      )}
    </section>
  );
}
