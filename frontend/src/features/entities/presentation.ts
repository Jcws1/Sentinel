import type { RuntimeSnapshot } from '../../app/runtime';
import type { DeepReadonly, ImmutableFrame } from '../../contracts/types';
import type { SourceRef } from '../../contracts/generated';
import { entityRows, type EntityRow } from '../../world/entityRows';

export function managedRows(state: RuntimeSnapshot) {
  const frame = state.presentation.frame;
  if (!frame) return [];
  const ids = new Set(
    Object.values(frame.assets)
      .filter((a) => a.missionId === frame.mission.id)
      .map((a) => a.entityId),
  );
  return entityRows(frame, state.session.filters).filter((r) =>
    ids.has(r.entity.id),
  );
}
export function availability(frame: ImmutableFrame, id: string) {
  const values = Object.values(frame.assets)
    .filter((a) => a.entityId === id)
    .map((a) => a.availability);
  const unique = [...new Set(values)];
  return !unique.length
    ? 'Unmanaged'
    : unique.length > 1
      ? 'Mixed availability'
      : unique[0].charAt(0).toUpperCase() + unique[0].slice(1);
}
export function sourceLabel(
  source: DeepReadonly<SourceRef> | undefined,
  frame?: ImmutableFrame,
) {
  if (!source) return 'Unavailable';
  if (source.id === frame?.interactive?.sourceId) return 'Local simulator';
  if (source.id === 'demo-observer-v1') return 'Demo observer';
  const kind = source.kind.replaceAll('-', ' ');
  return `${kind.charAt(0).toUpperCase() + kind.slice(1)} · ${source.mode}`;
}
export function boundSourceLabel(sourceId: string, frame?: ImmutableFrame) {
  const source = Object.values(frame?.tracks ?? {}).find(
    (t) => t.source.id === sourceId,
  )?.source;
  return sourceId === frame?.interactive?.sourceId
    ? 'Local simulator'
    : sourceLabel(source, frame);
}
export function sourceChoices(frame?: ImmutableFrame) {
  const sources = new Map(
    [
      ...Object.values(frame?.tracks ?? {}).map((t) => t.source),
      ...Object.values(frame?.entities ?? {}).map((e) => e.provenance.source),
    ].map((source) => [source.id, source]),
  );
  const entries = [...sources].sort(([a], [b]) => a.localeCompare(b));
  const labels = entries.map(([, source]) => sourceLabel(source, frame));
  const seen = new Map<string, number>();
  return entries.map(([id], index) => {
    const label = labels[index],
      ordinal = (seen.get(label) ?? 0) + 1;
    seen.set(label, ordinal);
    return {
      id,
      label:
        labels.filter((value) => value === label).length > 1
          ? `${label} ${ordinal}`
          : label,
    };
  });
}

/** A current-status summary of the newest command; never mutates its original receipt. */
export function directStatusText(state: RuntimeSnapshot): string | undefined {
  const { directReceipt: receipt, directFeedback: feedback } =
    state.interactive;
  if (!receipt || (feedback && feedback.id !== receipt.requestId))
    return feedback?.message;
  const frame = state.presentation.frame;
  if (!frame || receipt.missionId !== frame.mission.id) return undefined;
  if (!receipt.accepted) return feedback?.message ?? receipt.message;
  const members = receipt.memberOutcomes ?? [];
  if (receipt.sequence == null || receipt.sequence > frame.sequence)
    return (
      feedback?.message ??
      `${members.filter((member) => member.outcome === 'accepted').length} commanded`
    );
  const counts = new Map<string, number>();
  const count = (label: string) =>
    counts.set(label, (counts.get(label) ?? 0) + 1);
  const executions = frame.interactive?.executions ?? [];
  for (const member of members) {
    if (member.outcome === 'skipped') {
      count('skipped');
      continue;
    }
    const execution = executions.find(
      (e) =>
        e.id === member.executionId &&
        e.commandId === receipt.requestId &&
        e.entityId === member.entityId &&
        e.assetId === member.assetId,
    );
    if (!execution) {
      count('state unavailable');
      continue;
    }
    if (
      execution.state === 'Completed' &&
      (!execution.completionSample ||
        execution.completionSample.sequence > frame.sequence)
    ) {
      count('completion unverified');
      continue;
    }
    count(
      execution.state === 'Cancelled' &&
        execution.reason?.startsWith('Superseded by order ')
        ? 'superseded'
        : ((
            {
              Accepted: 'commanded',
              Running: 'moving',
              Suspended: 'paused',
            } as Record<string, string>
          )[execution.state] ?? execution.state.toLowerCase()),
    );
  }
  const text = [...counts]
    .map(([label, amount]) => `${amount} ${label}`)
    .join(' · ');
  if (!text) return feedback?.message ?? receipt.message;
  return state.connection !== 'connected' ||
    state.presentation.status !== 'current'
    ? `Last reported · ${text}`
    : text;
}
export function entityType(row: EntityRow, frame: ImmutableFrame) {
  return (
    row.entity.classification?.label ??
    row.entity.classification?.code ??
    (frame.interactive?.templateId?.startsWith('singapore-local-v')
      ? 'Drone'
      : row.entity.kind.replaceAll('-', ' '))
  );
}

/** Do not infer destruction from missing reports or unavailable Asset membership. */
export function assetStatus(frame: ImmutableFrame, id: string) {
  const entity = frame.entities[id];
  if (!entity) return 'Missing';
  if (entity.condition === 'non-operational') return 'Down';
  const controls = frame.interactive?.controls.filter((c) => c.entityId === id);
  const tracks = controls?.length
    ? controls.flatMap((c) =>
        c.controlTrackId && frame.tracks[c.controlTrackId]
          ? [frame.tracks[c.controlTrackId]]
          : [],
      )
    : Object.values(frame.tracks).filter((t) => t.entityId === id);
  if (!tracks.length) return 'No position';
  if (
    entity.presence !== 'present' ||
    tracks.every((t) => t.state !== 'tracking')
  )
    return 'No response';
  return availability(frame, id);
}

export function controlLabel(state: RuntimeSnapshot) {
  const run = state.presentation.frame?.interactive,
    current = state.interactive.current;
  if (
    state.connection !== 'connected' ||
    state.presentation.status !== 'current'
  )
    return 'Control status unverified';
  if (
    !run ||
    !current ||
    current.run.executorEpoch !== run.executorEpoch ||
    current.run.runRevision !== run.runRevision ||
    current.run.lease.revision !== run.lease.revision
  )
    return 'Waiting for synchronized control status';
  if (
    run.lease.expiresAt &&
    (state.interactive.now ?? current.serverTime) >= run.lease.expiresAt
  )
    return 'Control expired';
  return current.ownsControl
    ? 'Control held by this session'
    : current.leaseState === 'held'
      ? 'Control held by another session'
      : 'Control unclaimed';
}
