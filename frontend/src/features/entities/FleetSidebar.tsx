import { useSyncExternalStore } from 'react';
import { Drone } from 'lucide-react';
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
          const status = assetStatus(frame!, id);
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
                <Drone size={20} strokeWidth={1.5} aria-label="Quadcopter" />
                <span className="fleet-identity">
                  <strong>{label}</strong>
                  <span>
                    {detail}
                    {!row.visible && status !== 'Available'
                      ? ` · ${status}`
                      : ''}
                  </span>
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
