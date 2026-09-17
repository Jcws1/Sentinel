import type { RuntimeSnapshot } from '../app/runtime';
import type { DirectMoveIntent } from '../contracts/generated';
import { entityRows } from './entityRows';

/** Presentation eligibility only. Admission always rechecks the explicit binding. */
export function directContextReason(
  state: RuntimeSnapshot,
): string | undefined {
  const frame = state.presentation.frame,
    run = frame?.interactive,
    current = state.interactive.current;
  if (!frame || !run) return 'Open a demo to move drones.';
  if (state.connection !== 'connected') return 'Connection lost.';
  if (
    state.presentation.sourceDelayed ||
    state.presentation.status !== 'current'
  )
    return 'Source report delayed. Wait for current observations.';
  if (
    !current ||
    current.run.executorEpoch !== run.executorEpoch ||
    current.run.grantRevision !== run.grantRevision ||
    current.run.lease.revision !== run.lease.revision ||
    current.run.runRevision !== run.runRevision
  )
    return 'Synchronizing demo control.';
  if (!current.ownsControl)
    return current.leaseState === 'held'
      ? 'Another session has control.'
      : 'Waiting for available control.';
  const now = state.interactive.now ?? current.serverTime;
  if (!run.lease.expiresAt || now >= run.lease.expiresAt)
    return 'Control expired. Continue the demo to regain control.';
  if (run.state !== 'running')
    return run.state === 'ended'
      ? 'Demo ended.'
      : 'Resume the demo to move drones.';
  if (
    !run.lastReportAt ||
    Date.parse(now) - Date.parse(run.lastReportAt) > 2000
  )
    return 'Source report delayed. Wait for current observations.';
}

export function directMovementReason(
  state: RuntimeSnapshot,
  id: string,
): string | undefined {
  const frame = state.presentation.frame,
    run = frame?.interactive;
  if (!frame || !run) return 'Open a demo to move drones.';
  const row = entityRows(frame, state.session.filters).find(
    (r) => r.entity.id === id,
  );
  if (!row) return 'Entity missing.';
  if (!row.visible) return 'Hidden by filters.';
  const bindings = run.controls.filter((c) => c.entityId === id);
  if (bindings.length !== 1)
    return bindings.length
      ? 'Ambiguous control binding.'
      : 'Not under Sentinel control.';
  const c = bindings[0];
  if (row.entity.condition !== 'operational')
    return row.entity.condition === 'non-operational' ? 'Down' : 'Unavailable';
  if (row.entity.presence !== 'present') return 'No response';
  const track = c.controlTrackId ? frame.tracks[c.controlTrackId] : undefined;
  if (!track) return 'No known position';
  if (
    track.state !== 'tracking' ||
    Date.parse(frame.effectiveAt) - Date.parse(track.latest.timestamp) > 1000
  )
    return 'No response';
  if (!c.capabilities.includes('move-horizontal'))
    return 'Movement unavailable.';
  if (frame.assets[c.assetId]?.availability !== 'available')
    return 'Unavailable';
  if (
    track.latest.position.altitude.reference !== 'ELLIPSOID' ||
    track.latest.position.altitude.datumId !== 'WGS84'
  )
    return 'Unsupported altitude reference';
  return directContextReason(state);
}

export function captureDirectMove(
  state: RuntimeSnapshot,
  longitudeDeg: number,
  latitudeDeg: number,
): Omit<DirectMoveIntent, 'order'> {
  const reason = directContextReason(state);
  if (reason) throw new Error(reason);
  const frame = state.presentation.frame!,
    run = frame.interactive!;
  const ids = state.session.selection.items
    .filter((i) => i.kind === 'entity')
    .map((i) => i.id);
  if (!ids.length) throw new Error('Select drones to move.');
  const rows = entityRows(frame, state.session.filters);
  const members = ids.map((id) => {
    const controls = run.controls.filter((c) => c.entityId === id);
    if (controls.length !== 1)
      throw new Error(
        'Selection includes an entity without a unique control binding.',
      );
    if (!rows.find((r) => r.entity.id === id)?.visible)
      throw new Error(
        'Selection includes hidden or missing entities. Reset filters or revise selection.',
      );
    const c = controls[0];
    return {
      assetId: c.assetId,
      entityId: id,
      executorId: c.executorId,
      sourceId: c.sourceId,
      controlTrackId: c.controlTrackId ?? null,
      grantId: c.grantId,
      bindingRevision: c.bindingRevision,
    };
  });
  return {
    missionId: frame.mission.id,
    runId: run.runId,
    executorEpoch: run.executorEpoch,
    sourceId: run.sourceId,
    grantId: run.grantId,
    grantRevision: run.grantRevision,
    reviewedFrameId: frame.frameId,
    deadline: new Date(Date.parse(frame.recordedAt) + 30000).toISOString(),
    anchor: { longitudeDeg, latitudeDeg },
    members: members as DirectMoveIntent['members'],
  };
}
