import type {
  MoveAnchor,
  MoveIntent,
  MoveMember,
  MovePosition,
  MovementExecution,
} from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import type { RuntimeSnapshot } from '../app/runtime';
import { entityRows } from './entityRows';

const radius = 6378137,
  radians = Math.PI / 180;
export const terminalExecution = (e: Pick<MovementExecution, 'state'>) =>
  ['Completed', 'Cancelled', 'Failed', 'Expired', 'Interrupted'].includes(
    e.state,
  );
export function metric(p: DeepReadonly<MoveAnchor>) {
  return [
    (p.longitudeDeg - 103.85) * radians * radius * Math.cos(1.29 * radians),
    (p.latitudeDeg - 1.29) * radians * radius,
  ];
}
export function translatedEndpoints(
  origins: readonly DeepReadonly<MovePosition>[],
  anchor: MoveAnchor,
): MovePosition[] {
  const inside = (p: DeepReadonly<MoveAnchor>) =>
    Number.isFinite(p.longitudeDeg) &&
    Number.isFinite(p.latitudeDeg) &&
    metric(p).every((v) => Math.abs(v) <= 5000);
  if (!origins.length || !inside(anchor) || origins.some((p) => !inside(p)))
    throw new Error(
      'Origins and anchor must lie within the local ±5,000 m extent.',
    );
  const points = origins.map(metric),
    a = metric(anchor);
  const center = [0, 1].map(
    (i) => points.reduce((sum, p) => sum + p[i], 0) / points.length,
  );
  const targets = points.map((p, i) => ({
    longitudeDeg: Number(
      (
        103.85 +
        (a[0] + p[0] - center[0]) /
          (radius * Math.cos(1.29 * radians) * radians)
      ).toFixed(9),
    ),
    latitudeDeg: Number(
      (1.29 + (a[1] + p[1] - center[1]) / (radius * radians)).toFixed(9),
    ),
    altitude: { ...origins[i].altitude },
  }));
  const distance = (
    p: DeepReadonly<MoveAnchor>,
    q: DeepReadonly<MoveAnchor>,
  ) => {
    const a = metric(p),
      b = metric(q);
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  };
  if (targets.some((p) => !inside(p)))
    throw new Error('A translated endpoint exceeds the local model extent.');
  if (targets.some((p, i) => distance(p, origins[i]) < 1))
    throw new Error(
      'Enter a new anchor: every member must move at least one metre.',
    );
  if (
    targets.some((p, i) =>
      targets.slice(i + 1).some((q) => distance(p, q) < 0.5),
    )
  )
    throw new Error('Coincident endpoints require explicit revision.');
  return targets;
}
export function movementReason(
  state: RuntimeSnapshot,
  id: string,
): string | undefined {
  const frame = state.presentation.frame,
    run = frame?.interactive,
    current = state.interactive.current;
  if (!frame || !run) return 'Load a local demo run.';
  const row = entityRows(frame, state.session.filters).find(
    (r) => r.entity.id === id,
  );
  if (!row) return 'Identity missing from the presented frame.';
  if (!row.visible)
    return 'Hidden by shared filters; reset filters or revise selection.';
  const controls = run.controls.filter((c) => c.entityId === id);
  if (!controls.length)
    return 'No Asset control grant; affiliation is not authority.';
  if (controls.length !== 1) return 'Ambiguous Asset/control binding.';
  const c = controls[0];
  if (!c.controlTrackId || !frame.tracks[c.controlTrackId])
    return 'No supplied control position.';
  const track = frame.tracks[c.controlTrackId];
  if (
    track.state !== 'tracking' ||
    Date.parse(frame.effectiveAt) - Date.parse(track.latest.timestamp) > 1000
  )
    return 'Control observation is stale.';
  if (
    track.latest.position.altitude.reference !== 'ELLIPSOID' ||
    track.latest.position.altitude.datumId !== 'WGS84'
  )
    return 'Control height must be ELLIPSOID/WGS84.';
  if (!c.capabilities.includes('move-horizontal'))
    return 'No horizontal movement capability.';
  if (
    row.entity.presence !== 'present' ||
    row.entity.condition !== 'operational' ||
    frame.assets[c.assetId]?.availability !== 'available'
  )
    return 'Entity or Asset is unavailable.';
  if (
    (run.executions ?? []).some(
      (e) => e.assetId === c.assetId && !terminalExecution(e),
    )
  )
    return 'Asset busy; cancel its execution and confirm termination.';
  if (state.presentation.sourceDelayed)
    return 'Source report delayed; wait for committed source recovery.';
  if (
    state.connection !== 'connected' ||
    state.presentation.status !== 'current'
  )
    return 'Reconnect for a current verified world.';
  if (
    !current ||
    current.run.executorEpoch !== run.executorEpoch ||
    current.run.lease.revision !== run.lease.revision ||
    current.run.runRevision !== run.runRevision
  )
    return 'Waiting for synchronized control status.';
  const now = state.interactive.now ?? current.serverTime;
  if (
    !current.ownsControl ||
    !run.lease.expiresAt ||
    now >= run.lease.expiresAt
  )
    return 'Acquire or explicitly reclaim control in this session.';
  if (run.state !== 'running')
    return 'Start or resume the source before moving.';
  if (
    !run.lastReportAt ||
    Date.parse(now) - Date.parse(run.lastReportAt) > 2000
  )
    return 'Source report delayed; movement requires a report within two seconds.';
  if (!c.eligible) return c.reason;
  return undefined;
}

export interface DraftParticipant {
  entityId: string;
  label: string;
  reason?: string;
  member?: MoveMember;
}
export interface MovementDraft {
  id: string;
  context: Omit<MoveIntent, 'members' | 'anchor'>;
  participants: DraftParticipant[];
  longitude: string;
  latitude: string;
  phase: 'editing' | 'reviewed' | 'submitted';
  intent?: MoveIntent;
  error?: string;
  requestId?: string;
  selectionRevision: number;
}
export function captureMovement(
  state: RuntimeSnapshot,
): MovementDraft | undefined {
  const frame = state.presentation.frame,
    run = frame?.interactive;
  if (!frame || !run) return;
  const participants = state.session.selection.items
    .filter((i) => i.kind === 'entity')
    .map(({ id }) => {
      const c = run.controls.find((c) => c.entityId === id),
        position = c?.controlTrackId
          ? frame.tracks[c.controlTrackId]?.latest.position
          : undefined;
      const member =
        c?.controlTrackId &&
        position?.altitude.reference === 'ELLIPSOID' &&
        position.altitude.datumId === 'WGS84'
          ? {
              assetId: c.assetId,
              entityId: id,
              executorId: c.executorId,
              sourceId: c.sourceId,
              controlTrackId: c.controlTrackId,
              grantId: c.grantId,
              bindingRevision: c.bindingRevision,
              busyRevision: c.busyRevision ?? 0,
              origin: structuredClone(position) as MovePosition,
              destination: structuredClone(position) as MovePosition,
            }
          : undefined;
      return {
        entityId: id,
        label: frame.entities[id]?.label ?? id,
        reason: movementReason(state, id),
        member,
      };
    });
  const origins = participants.flatMap((p) =>
    p.member ? [p.member.origin] : [],
  );
  return {
    id: crypto.randomUUID(),
    phase: 'editing',
    selectionRevision: state.session.selection.revision,
    participants,
    longitude: (origins.length
      ? origins.reduce((s, p) => s + p.longitudeDeg, 0) / origins.length
      : 103.85
    ).toFixed(9),
    latitude: (origins.length
      ? origins.reduce((s, p) => s + p.latitudeDeg, 0) / origins.length
      : 1.29
    ).toFixed(9),
    context: {
      missionId: frame.mission.id,
      runId: run.runId,
      executorEpoch: run.executorEpoch,
      sourceId: run.sourceId,
      grantId: run.grantId,
      grantRevision: run.grantRevision,
      reviewedFrameId: frame.frameId,
      modelId: 'local-horizontal-v1',
      deadline: new Date(Date.parse(frame.recordedAt) + 30_000).toISOString(),
    },
  };
}
export function reviewMovement(draft: DeepReadonly<MovementDraft>): MoveIntent {
  if (
    !draft.participants.length ||
    draft.participants.some((p) => p.reason || !p.member)
  )
    throw new Error(
      'Every frozen participant must be eligible. Revise selection and create a new draft.',
    );
  if (!draft.longitude.trim() || !draft.latitude.trim())
    throw new Error('Enter both longitude and latitude.');
  const members = draft.participants.map((p) =>
    structuredClone(p.member!),
  ) as MoveMember[];
  const anchor = {
    longitudeDeg: Number(draft.longitude),
    latitudeDeg: Number(draft.latitude),
  };
  const targets = translatedEndpoints(
    members.map((m) => m.origin),
    anchor,
  );
  return {
    ...draft.context,
    anchor,
    members: members.map((m, i) => ({
      ...m,
      destination: targets[i],
    })) as MoveIntent['members'],
  };
}
export function draftReason(state: RuntimeSnapshot): string | undefined {
  const d = state.session.movementDraft;
  if (!d) return 'Create a draft from the selected members.';
  if (d.phase !== 'reviewed' || !d.intent)
    return 'Review every endpoint before submission.';
  if (state.interactive.pending || state.interactive.busy)
    return 'Wait or reconcile the pending request.';
  const now = state.interactive.now ?? state.interactive.current?.serverTime;
  if (!now || now >= d.context.deadline)
    return 'Review expired; create a fresh draft explicitly.';
  const run = state.presentation.frame?.interactive;
  if (
    !run ||
    run.executorEpoch !== d.context.executorEpoch ||
    run.grantRevision !== d.context.grantRevision ||
    run.runId !== d.context.runId
  )
    return 'Run or grant changed. Create a fresh draft explicitly.';
  for (const p of d.participants) {
    const reason = p.reason ?? movementReason(state, p.entityId);
    if (reason) return `${p.label}: ${reason}`;
    const control = state.presentation.frame?.interactive?.controls.find(
      (c) => c.assetId === p.member?.assetId,
    );
    if (
      !control ||
      control.bindingRevision !== p.member?.bindingRevision ||
      (control.busyRevision ?? 0) !== p.member?.busyRevision
    )
      return `${p.label}: binding or reservation changed. Create a new draft.`;
  }
  return undefined;
}
