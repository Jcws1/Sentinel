import { useState, useSyncExternalStore } from 'react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import type { DeepReadonly } from '../../contracts/types';
import type { MovementExecution, Receipt } from '../../contracts/generated';
import { terminalExecution } from '../../world/movement';
import {
  directContextReason,
  directMovementReason,
} from '../../world/directMovement';
import { formatSgt } from '../../world/time';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { viewKind, type ViewId } from '../workspace/viewRegistry';
import { boundSourceLabel } from '../entities/presentation';
import { CopyValue } from '../entities/CopyValue';
import './movement.css';

export function executionLabel(
  execution: Pick<MovementExecution, 'state' | 'reason'>,
) {
  if (
    execution.state === 'Cancelled' &&
    execution.reason?.startsWith('Superseded by order ')
  )
    return 'Superseded';
  return (
    (
      {
        Accepted: 'Commanded',
        Running: 'Moving',
        Suspended: 'Paused',
      } as Record<string, string>
    )[execution.state] ?? execution.state
  );
}

function cancelReason(
  state: RuntimeSnapshot,
  execution: DeepReadonly<MovementExecution>,
) {
  const run = state.presentation.frame?.interactive,
    current = state.interactive.current;
  if (terminalExecution(execution)) return 'Movement has terminated.';
  if (state.interactive.pending || state.interactive.busy)
    return 'Another session action is pending.';
  if (
    state.connection !== 'connected' ||
    (state.presentation.status !== 'current' &&
      !state.presentation.sourceDelayed)
  )
    return 'Reconnect to cancel.';
  if (
    !run ||
    run.runId !== execution.runId ||
    run.executorEpoch !== execution.executorEpoch
  )
    return 'Waiting for restart recovery.';
  if (
    !current ||
    current.run.runRevision !== run.runRevision ||
    current.run.lease.revision !== run.lease.revision
  )
    return 'Synchronizing control.';
  if (
    !current.ownsControl ||
    !run.lease.expiresAt ||
    (state.interactive.now ?? current.serverTime) >= run.lease.expiresAt
  )
    return 'Take control from Simulation to cancel.';
}

/** Navigation only: one shared runtime captures the intent when its destination is chosen. */
export function armMoveInMap(
  runtime: ApplicationRuntime,
  bridge: WorkspaceBridge,
) {
  const workspace = bridge.getSnapshot();
  const isMap = (id?: ViewId) =>
    !!id && ['tactical', 'three-d'].includes(viewKind(id));
  const id = isMap(workspace.activeViewId)
    ? workspace.activeViewId!
    : (workspace.views.find((v) => isMap(v.id) && v.selectedInPane)?.id ??
      workspace.views.find((v) => isMap(v.id))?.id ??
      'tactical');
  bridge.open(id);
  runtime.armDirectMove(id);
}

export function MovementToolbar({
  state,
  runtime,
  bridge,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  bridge: WorkspaceBridge;
}) {
  if (!state.presentation.frame?.interactive) return null;
  const selected = state.session.selection.items.filter(
    (i) => i.kind === 'entity',
  );
  const contextReason = directContextReason(state);
  const issues = selected.flatMap((i) => {
    const reason = directMovementReason(state, i.id);
    return reason && reason !== contextReason ? [{ id: i.id, reason }] : [];
  });
  const available = selected.length - issues.length;
  return (
    <div className="movement-toolbar">
      <span role="status" aria-label="Movement selection count">
        {selected.length} selected · {available} available
      </span>
      <button
        className="text-control"
        disabled={!selected.length || !!contextReason}
        title={contextReason}
        onClick={() => armMoveInMap(runtime, bridge)}
      >
        Move
      </button>
      <button className="text-control" onClick={() => bridge.open('movement')}>
        Activity
      </button>
      {contextReason && selected.length > 0 && (
        <span className="movement-context" role="status">
          {contextReason}
        </span>
      )}
      {!!issues.length && (
        <details className="movement-issues">
          <summary>{issues.length} unavailable</summary>
          <ul>
            {issues.map((i) => (
              <li key={i.id}>
                <b>
                  {state.presentation.frame?.entities[i.id]?.label ??
                    'Missing entity'}
                </b>
                : {i.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ExecutionCard({
  execution: e,
  state,
  runtime,
  compact = false,
}: {
  execution: DeepReadonly<MovementExecution>;
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  compact?: boolean;
}) {
  const reason = cancelReason(state, e);
  const label =
    state.presentation.frame?.entities[e.entityId]?.label ?? 'Missing entity';
  const summary = (
    {
      'operator-cancel': 'Stopped by the operator.',
      'run-revoke': 'Control released.',
      'run-end': 'Demo ended.',
      'backend-restart': 'Interrupted by backend restart.',
      superseded: 'Replaced by a newer command.',
    } as Record<string, string>
  )[e.reason ?? ''];
  return (
    <article
      className="movement-execution"
      data-execution-id={e.id}
      data-execution-state={e.state}
      aria-label={`Movement for ${label}`}
    >
      <div className="movement-execution-heading">
        <strong>{label}</strong>
        <span className="constraint-tag">{executionLabel(e)}</span>
      </div>
      {summary && <p>{summary}</p>}
      {['Failed', 'Interrupted', 'Expired'].includes(e.state) &&
        e.reason &&
        !summary && <p className="entity-notice">{e.reason}</p>}
      {!compact && (
        <>
          {!terminalExecution(e) && (
            <p>
              {e.state === 'Accepted'
                ? 'Waiting for the executor to start.'
                : `${e.remainingMetres.toFixed(0)} m remaining · ${e.travelledMetres.toFixed(0)} m observed`}
            </p>
          )}
          {e.completionSample && (
            <p>
              Completed ·{' '}
              <time
                dateTime={e.completionSample.timestamp}
                title={e.completionSample.timestamp}
              >
                {formatSgt(e.completionSample.timestamp, { date: true })}
              </time>
            </p>
          )}
        </>
      )}
      {!terminalExecution(e) && (
        <div className="movement-cancel">
          <button
            className="text-control"
            disabled={!!reason}
            onClick={() => void runtime.cancelExecution(e.id)}
          >
            Cancel {label}
          </button>
          {reason && <span>{reason}</span>}
        </div>
      )}
      <details className="movement-audit">
        <summary>Movement details</summary>
        <p>
          Control source ·{' '}
          {boundSourceLabel(e.sourceId, state.presentation.frame)}
        </p>
        <p>
          Destination · {e.destination.longitudeDeg.toFixed(6)}°,{' '}
          {e.destination.latitudeDeg.toFixed(6)}°
        </p>
        <p>
          Retained height · {e.destination.altitude.metres} m{' '}
          {e.destination.altitude.reference} / {e.destination.altitude.datumId}
        </p>
        <p>
          {e.startedAt
            ? `Started · simulation ${formatSgt(e.startedAt, { date: true })}`
            : 'Executor has not started.'}
        </p>
        {e.completionSample && (
          <p>Completion is supported by a committed position sample.</p>
        )}
        <details className="movement-audit">
          <summary>Technical evidence</summary>
          <dl>
            <CopyValue label="Execution ID" value={e.id} />
            <CopyValue label="Control source ID" value={e.sourceId} />
            <CopyValue label="Control Track ID" value={e.controlTrackId} />
            <CopyValue
              label="Execution JSON"
              value={JSON.stringify(e, null, 2)}
            />
          </dl>
        </details>
      </details>
    </article>
  );
}

export function MovementDetails({
  state,
  runtime,
  entityId,
  expanded = false,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  entityId: string;
  expanded?: boolean;
}) {
  const executions = (
    state.presentation.frame?.interactive?.executions ?? []
  ).filter((e) => e.entityId === entityId);
  const last =
    executions.find((e) => !terminalExecution(e)) ?? executions.at(-1);
  return last && expanded ? (
    <section className="detail-section">
      <h2>Movement</h2>
      <ExecutionCard execution={last} state={state} runtime={runtime} />
    </section>
  ) : last ? (
    <details className="control-binding">
      <summary>Movement · {executionLabel(last)}</summary>
      <ExecutionCard execution={last} state={state} runtime={runtime} compact />
    </details>
  ) : null;
}

function CommandResult({
  receipt,
  state,
}: {
  receipt: DeepReadonly<Receipt>;
  state: RuntimeSnapshot;
}) {
  const accepted =
    receipt.memberOutcomes?.filter((m) => m.outcome === 'accepted') ?? [];
  const skipped =
    receipt.memberOutcomes?.filter((m) => m.outcome === 'skipped') ?? [];
  const awaiting =
    receipt.accepted &&
    (receipt.sequence ?? 0) > (state.presentation.frame?.sequence ?? 0);
  return (
    <details className="movement-receipt" data-command-id={receipt.requestId}>
      <summary>
        {receipt.accepted
          ? `${accepted.length} commanded${skipped.length ? ` · ${skipped.length} skipped` : ''}`
          : receipt.message}
        <time dateTime={receipt.recordedAt}>
          {formatSgt(receipt.recordedAt, { date: true })}
        </time>
      </summary>
      {awaiting && (
        <p role="status">Received, awaiting world synchronization.</p>
      )}
      <p>
        Command acceptance. Current movement and positions come from the
        committed world.
      </p>
      <ul className="movement-outcomes">
        {receipt.memberOutcomes?.map((member) => (
          <li key={member.assetId}>
            <strong>
              {state.presentation.frame?.entities[member.entityId]?.label ??
                'Missing entity'}
            </strong>{' '}
            ·{' '}
            {member.outcome === 'accepted'
              ? 'Commanded'
              : `Skipped · ${member.reason}`}
          </li>
        ))}
      </ul>
      <details className="movement-audit">
        <summary>Technical receipt</summary>
        <dl>
          <CopyValue
            label="Receipt JSON"
            value={JSON.stringify(receipt, null, 2)}
          />
        </dl>
      </details>
    </details>
  );
}

export function MovementPane({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime()!,
    state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [longitude, setLongitude] = useState(''),
    [latitude, setLatitude] = useState(''),
    [coordinateError, setCoordinateError] = useState<string>();
  const frame = state.presentation.frame,
    run = frame?.interactive;
  const receipts = (state.interactive.directReceipts ?? []).filter(
    (r) => r.missionId === frame?.mission.id,
  );
  const pending = (state.interactive.directPending ?? []).filter(
    (r) => r.missionId === frame?.mission.id,
  );
  const executions = run?.executions ?? [],
    active = executions.filter((e) => !terminalExecution(e));
  const contextReason = directContextReason(state);
  return (
    <div className="movement-pane">
      {!run ? (
        <p className="entity-empty">
          Open a demo to inspect movement activity.
        </p>
      ) : (
        <div className="movement-scroll">
          <header className="movement-heading">
            <h1>Activity</h1>
            <span className="quiet-label">{active.length} active</span>
          </header>
          <MovementToolbar state={state} runtime={runtime} bridge={bridge} />
          {(state.connection !== 'connected' ||
            state.presentation.status !== 'current') && (
            <p role="status" className="entity-notice">
              {state.connection !== 'connected'
                ? 'Connection lost'
                : 'Reports delayed'}{' '}
              · Last committed positions and activity retained.
            </p>
          )}
          {!!pending.length && (
            <p role="status">
              {pending.length} command{pending.length === 1 ? '' : 's'} pending
              · checking receipts
            </p>
          )}
          <section aria-label="Movement activity" className="movement-results">
            <h2>Current & recent movement</h2>
            {!executions.length ? (
              <p>
                No movement yet. Select drones, then right-click a map
                destination.
              </p>
            ) : (
              <div className="movement-executions">
                {[
                  ...active,
                  ...executions.filter(terminalExecution).reverse(),
                ].map((e) => (
                  <ExecutionCard
                    key={e.id}
                    execution={e}
                    state={state}
                    runtime={runtime}
                  />
                ))}
              </div>
            )}
          </section>
          {!!receipts.length && (
            <section className="movement-results" aria-label="Command outcomes">
              <h2>Command outcomes</h2>
              {[...receipts].reverse().map((r) => (
                <CommandResult key={r.requestId} receipt={r} state={state} />
              ))}
            </section>
          )}
          <details className="movement-draft">
            <summary>Move by coordinates</summary>
            <p>
              Optional keyboard input. Submit moves the current selection
              directly; unavailable members are skipped. Heights stay unchanged.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !longitude.trim() ||
                  !latitude.trim() ||
                  !Number.isFinite(Number(longitude)) ||
                  !Number.isFinite(Number(latitude))
                ) {
                  setCoordinateError(
                    'Enter a longitude and latitude in degrees.',
                  );
                  return;
                }
                setCoordinateError(undefined);
                void runtime.directMove(Number(longitude), Number(latitude));
              }}
            >
              <div className="movement-coordinates">
                <label>
                  Longitude
                  <input
                    aria-label="Destination longitude"
                    inputMode="decimal"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                  />
                </label>
                <label>
                  Latitude
                  <input
                    aria-label="Destination latitude"
                    inputMode="decimal"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="submit"
                className="text-control movement-submit"
                disabled={
                  !!contextReason || !state.session.selection.items.length
                }
              >
                Move selected
              </button>
              {coordinateError && <p role="alert">{coordinateError}</p>}
            </form>
          </details>
          <p className="quiet-label movement-retention">
            All active movements and up to 64 recent outcomes. Older results
            remain in recordings. Destinations do not describe validated routes.
          </p>
        </div>
      )}
    </div>
  );
}
