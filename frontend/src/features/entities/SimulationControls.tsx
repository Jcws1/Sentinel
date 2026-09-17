import * as Menu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import './simulation.css';

export function SimulationControls({
  state,
  runtime,
  compact = false,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  compact?: boolean;
}) {
  const [copyOwnerResult, setCopyOwnerResult] = useState('Copy owner ID');
  const ui = state.interactive,
    frame = state.presentation.frame,
    run = frame?.interactive,
    current = ui.current;
  const ended = run?.state === 'ended';
  const synced =
    !!run &&
    current?.run.executorEpoch === run.executorEpoch &&
    current.run.runRevision === run.runRevision &&
    current.run.lease.revision === run.lease.revision;
  const pending = ui.busy || !!ui.pending || ui.startingDemo;
  const activeElsewhere =
    ui.entry?.activeMissionId && ui.entry.activeMissionId !== state.missionId;
  const ownershipConflict = !!run && !ended && synced && !current?.ownsControl;
  const action =
    run?.state === 'running'
      ? 'pause'
      : run?.state === 'ready'
        ? 'start'
        : 'resume';
  const actionLabel =
    action === 'pause' ? 'Pause' : action === 'start' ? 'Start demo' : 'Resume';
  const actionReason = pending
    ? 'Request pending'
    : state.connection !== 'connected'
      ? 'Connection lost'
      : !synced
        ? 'Waiting for synchronized state'
        : !current?.ownsControl
          ? 'Control is not held by this session'
          : undefined;
  const status = ui.startingDemo
    ? 'Starting demo…'
    : ended
      ? 'Demo ended · Recording saved'
      : !run
        ? undefined
        : state.connection !== 'connected'
          ? 'Connection lost'
          : state.presentation.sourceDelayed
            ? 'Reports delayed'
            : state.presentation.status !== 'current'
              ? 'State unverified'
              : run.state === 'running'
                ? 'Running'
                : 'Paused';
  return (
    <section
      className={`simulation-controls ${compact ? 'simulation-compact' : ''}`}
      aria-label="Demo controls"
    >
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
              <Menu.Label className="menu-label">Demo</Menu.Label>
              {status && <div className="simulation-menu-status">{status}</div>}
              {activeElsewhere ? (
                <Menu.Item
                  className="menu-item"
                  onSelect={() =>
                    runtime.loadMission(ui.entry!.activeMissionId!)
                  }
                >
                  Return to active demo
                </Menu.Item>
              ) : !run || ended ? (
                <Menu.Item
                  className="menu-item"
                  disabled={pending || !ui.entry?.enabled}
                  onSelect={() => void runtime.newDemo()}
                >
                  {ui.startingDemo ? 'Starting demo…' : 'New demo'}
                </Menu.Item>
              ) : null}
              {!ui.entry?.enabled && (
                <div className="simulation-menu-status">
                  {ui.entry
                    ? 'Demo mode is unavailable on this backend.'
                    : 'Checking demo availability…'}
                </div>
              )}
              {ownershipConflict && (
                <>
                  <div className="simulation-menu-status" role="status">
                    {current?.leaseState === 'held'
                      ? 'Another session has control. Its accepted movements continue.'
                      : current?.leaseState === 'expired'
                        ? 'Control expired. Take control to issue new actions.'
                        : 'Control was released. Take control to issue new actions.'}
                  </div>
                  {current?.leaseState !== 'held' && (
                    <Menu.Item
                      className="menu-item"
                      disabled={pending || state.connection !== 'connected'}
                      onSelect={() =>
                        void runtime.interactiveAction(
                          current?.leaseState === 'expired'
                            ? 'reclaim'
                            : 'acquire',
                        )
                      }
                    >
                      Take control
                    </Menu.Item>
                  )}
                </>
              )}
              {!!run && !ended && (
                <>
                  <Menu.Item
                    className="menu-item"
                    disabled={!!actionReason}
                    title={actionReason}
                    onSelect={() => void runtime.interactiveAction(action)}
                  >
                    {actionLabel}
                  </Menu.Item>
                  <Menu.Separator className="menu-separator" />
                  <Menu.Item
                    className="menu-item"
                    disabled={!!actionReason}
                    title={actionReason}
                    onSelect={() => void runtime.interactiveAction('end')}
                  >
                    End demo
                  </Menu.Item>
                </>
              )}
              {run && (
                <Menu.Sub>
                  <Menu.SubTrigger className="menu-item">
                    Technical session details
                  </Menu.SubTrigger>
                  <Menu.Portal>
                    <Menu.SubContent className="menu-content simulation-menu">
                      <div className="simulation-menu-status">
                        {current?.run.lease.holderId ?? 'No control owner'}
                      </div>
                      {current?.run.lease.holderId && (
                        <Menu.Item
                          className="menu-item"
                          onSelect={(event) => {
                            event.preventDefault();
                            void navigator.clipboard
                              .writeText(current.run.lease.holderId!)
                              .then(
                                () => setCopyOwnerResult('Owner ID copied'),
                                () =>
                                  setCopyOwnerResult(
                                    'Copy unavailable; select the owner text',
                                  ),
                              );
                          }}
                        >
                          {copyOwnerResult}
                        </Menu.Item>
                      )}
                      {current?.ownsControl && !ended && (
                        <Menu.Item
                          className="menu-item"
                          disabled={!!actionReason}
                          onSelect={() =>
                            void runtime.interactiveAction('revoke')
                          }
                        >
                          Release control and stop its work
                        </Menu.Item>
                      )}
                    </Menu.SubContent>
                  </Menu.Portal>
                </Menu.Sub>
              )}
            </Menu.Content>
          </Menu.Portal>
        </Menu.Root>
        {run && !ended ? (
          <button
            className="text-control simulation-toggle"
            disabled={!!actionReason}
            title={actionReason}
            onClick={() => void runtime.interactiveAction(action)}
          >
            {action === 'pause' ? <Pause size={12} /> : <Play size={12} />}
            {actionLabel}
          </button>
        ) : !activeElsewhere ? (
          <button
            className="text-control simulation-toggle"
            disabled={pending || !ui.entry?.enabled}
            onClick={() => void runtime.newDemo()}
          >
            {ui.startingDemo ? 'Starting…' : 'New demo'}
          </button>
        ) : null}
        {status && (
          <span className="simulation-run-state" data-run-state={run?.state}>
            {status}
          </span>
        )}
      </div>
      {!compact && ui.error && (
        <p className="simulation-error" role="status">
          {ui.error}
        </p>
      )}
    </section>
  );
}
