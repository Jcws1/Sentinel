import { scriptControlReason } from '../../world/scriptControl';
import { behaviorLabel } from '../../world/behavior';
import { BehaviorControls } from './BehaviorControls';
import { useSyncExternalStore } from 'react';
import { Drone, CircleSlash } from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { managedRows, availability, assetStatus } from './presentation';
import { selectForDetails } from './selectionActions';
import { terminalExecution } from '../../world/movement';
import { MovementToolbar, executionLabel } from '../movement/MovementPane';
import './details.css';

export function FleetSidebar({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime();
  return runtime ? (
    <Fleet runtime={runtime} bridge={bridge} />
  ) : (
    <p className="entity-empty">Load a mission to view managed assets.</p>
  );
}
function Fleet({
  runtime,
  bridge,
}: {
  runtime: ApplicationRuntime;
  bridge: WorkspaceBridge;
}) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    frame = state.presentation.frame,
    rows = managedRows(state);
  const selected = new Set(state.session.selection.items.map((i) => i.id));
  const controlReason = scriptControlReason(state),
    schedule = frame?.scenarioSchedule;
  return (
    <div
      className="fleet-sidebar"
      aria-label="Managed fleet"
      data-frame-id={frame?.frameId}
    >
      <div className="fleet-scope">
        <strong>{rows.length} managed</strong>
        <span>
          {
            rows.filter(
              (r) => availability(frame!, r.entity.id) === 'Available',
            ).length
          }{' '}
          available
        </span>
      </div>
      <MovementToolbar state={state} runtime={runtime} bridge={bridge} />
      <BehaviorControls state={state} runtime={runtime} />
      {frame?.interactive && (
        <div
          className="fleet-script-controls"
          aria-label="Selected drone script controls"
        >
          <div>
            <button
              disabled={!!controlReason}
              title={
                controlReason ??
                'Hold selected drones at their committed positions.'
              }
              onClick={() => void runtime.selectedControl('stop')}
            >
              Stop selected
            </button>
            {schedule && (
              <button
                disabled={!!controlReason}
                title={
                  controlReason ??
                  'Clear override; enable only future pending actions.'
                }
                onClick={() => void runtime.selectedControl('return-to-script')}
              >
                Return to script
              </button>
            )}
          </div>
          <small>
            {controlReason ??
              `${selected.size} selected · live orders establish Manual override`}
          </small>
          {(state.interactive.receipt?.schemaVersion === '1.3' ||
            state.interactive.receipt?.schemaVersion === '1.4' ||
            state.interactive.receipt?.schemaVersion === '1.5' ||
            state.interactive.receipt?.schemaVersion === '1.6') &&
            ['stop', 'return-to-script'].includes(
              state.interactive.receipt.operation,
            ) && (
              <p role="status" aria-label="Last selected-control receipt">
                <strong>
                  Last{' '}
                  {state.interactive.receipt.operation === 'stop'
                    ? 'Stop'
                    : 'Return to script'}{' '}
                  receipt · order {state.interactive.receipt.controlOrder} ·{' '}
                  {state.interactive.receipt.accepted ? 'accepted' : 'rejected'}
                </strong>
                {state.interactive.receipt.controlOutcomes
                  ?.map((o) => o.reason)
                  .filter((r, i, a) => a.indexOf(r) === i)
                  .join(' ') || state.interactive.receipt.message}
              </p>
            )}
        </div>
      )}
      <ul
        className="fleet-list"
        aria-label="Managed assets"
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key))
            return;
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
              '.fleet-select',
            ),
          ];
          const row = (event.target as HTMLElement).closest('li');
          const index = items.findIndex((b) => row?.contains(b));
          if (index < 0) return;
          event.preventDefault();
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : Math.max(
                    0,
                    Math.min(
                      items.length - 1,
                      index + (event.key === 'ArrowDown' ? 1 : -1),
                    ),
                  );
          items[next]?.focus();
        }}
      >
        {rows.map((row) => {
          const id = row.entity.id,
            label = row.entity.label || 'Unnamed entity';
          const execution = frame?.interactive?.executions?.find(
            (e) => e.entityId === id && !terminalExecution(e),
          );
          const sourceWork = schedule?.actions.find(
            (e) =>
              e.entityId === id && ['Accepted', 'Running'].includes(e.state),
          );
          const scriptState = schedule?.manualOverrides?.includes(id)
            ? 'Manual override'
            : sourceWork
              ? `Script ${sourceWork.state.toLowerCase()}`
              : schedule?.actions.some(
                    (e) => e.entityId === id && e.state === 'Pending',
                  )
                ? 'Script pending'
                : schedule
                  ? 'Script holding'
                  : undefined;
          const status = assetStatus(frame!, id);
          const behavior = behaviorLabel(frame!, id);
          const detail = !row.visible
            ? 'Filtered'
            : execution
              ? executionLabel(execution)
              : status;
          return (
            <li
              key={id}
              data-entity-id={id}
              data-selected={selected.has(id)}
              data-primary={state.session.selection.primary?.id === id}
              data-unavailable={!['Available', 'Assigned'].includes(status)}
              data-non-operational={row.entity.condition === 'non-operational'}
            >
              <input
                type="checkbox"
                aria-label={`Select ${label}`}
                checked={selected.has(id)}
                onChange={() => selectForDetails(runtime, bridge, id, true)}
              />
              <button
                className="fleet-select"
                aria-label={`Inspect ${label}`}
                aria-pressed={selected.has(id)}
                onClick={(e) =>
                  selectForDetails(
                    runtime,
                    bridge,
                    id,
                    e.shiftKey || e.ctrlKey || e.metaKey,
                  )
                }
              >
                {row.entity.condition === 'non-operational' ? (
                  <CircleSlash
                    size={20}
                    strokeWidth={1.5}
                    aria-label="Non-operational drone"
                  />
                ) : (
                  <Drone size={20} strokeWidth={1.5} aria-label="Quadcopter" />
                )}
                <span className="fleet-identity">
                  <strong>{label}</strong>
                  {frame?.unitProfiles?.[id] && (
                    <small>{frame.unitProfiles[id].label}</small>
                  )}
                  <span>
                    {behavior ??
                      (scriptState ? `${scriptState} · ${detail}` : detail)}
                    {!row.visible && status !== 'Available'
                      ? ` · ${status}`
                      : ''}
                  </span>
                  {frame?.fleetBehavior?.members?.find(
                    (m) =>
                      m.entityId === id &&
                      ['reserve', 'blocked', 'interrupted'].includes(m.state),
                  )?.reason && (
                    <small>
                      {
                        frame.fleetBehavior.members?.find(
                          (m) => m.entityId === id,
                        )?.reason
                      }
                    </small>
                  )}
                </span>
                {state.session.selection.primary?.id === id && (
                  <span
                    className="fleet-primary"
                    aria-label="Primary selection"
                  >
                    ●
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!rows.length && (
        <p className="entity-empty">
          {frame
            ? 'No explicitly managed assets in this mission. Observed entities remain available on the map and in Tracks.'
            : 'Load a mission or create a demo from Simulation.'}
        </p>
      )}
      <div className="fleet-footer">
        <button className="text-control" onClick={() => bridge.open('tracks')}>
          All entities in Tracks
        </button>
        <p>Managed assets · all observations stay on the maps</p>
      </div>
    </div>
  );
}
