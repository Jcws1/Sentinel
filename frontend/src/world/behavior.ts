import type { RuntimeSnapshot } from '../app/runtime';
import type { BehaviorPolicy } from '../contracts/generated';
import type { ImmutableFrame } from '../contracts/types';
import { captureScriptControl } from './scriptControl';
import { directContextReason } from './directMovement';

export function interceptSelection(state: RuntimeSnapshot) {
  const frame = state.presentation.frame;
  const members = state.session.selection.items.filter(
    (i) => i.kind === 'entity',
  );
  const available = members.filter((i) => {
    const e = frame?.entities[i.id];
    const c = frame?.interactive?.controls.find((c) => c.entityId === i.id);
    const t = c?.controlTrackId ? frame?.tracks[c.controlTrackId] : undefined;
    return (
      e?.condition === 'operational' &&
      e.presence === 'present' &&
      c &&
      frame?.assets[c.assetId]?.availability === 'available' &&
      t?.state === 'tracking' &&
      e.affiliation === 'friendly' &&
      c.capabilities.includes('move-horizontal') &&
      Date.parse(frame.effectiveAt) - Date.parse(t.latest.timestamp) <= 1000 &&
      t.latest.position.altitude.reference === 'ELLIPSOID' &&
      t.latest.position.altitude.datumId === 'WGS84'
    );
  });
  const armed = available.filter((i) =>
    frame?.fleetBehavior?.members?.some(
      (m) =>
        m.entityId === i.id &&
        m.policy === 'intercept' &&
        ['armed', 'pursuing', 'reserve', 'blocked'].includes(m.state),
    ),
  ).length;
  return {
    armed: armed > 0 && armed === available.length,
    mixed: armed > 0 && armed < available.length,
    count: armed,
  };
}

export function captureBehavior(
  state: RuntimeSnapshot,
  kind: BehaviorPolicy['kind'],
  boundaryId?: string,
) {
  const members = captureScriptControl(state);
  const frame = state.presentation.frame!;
  if (!frame.interactive?.capabilities.includes('fleet-policy'))
    throw new Error('Create a fresh demo to use Fleet behavior.');
  const policy: BehaviorPolicy = { kind };
  if (kind === 'patrol') {
    const reason = directContextReason(state);
    if (reason) throw new Error(reason);
    if (!boundaryId || frame.boundaryRules?.zones[boundaryId] !== 'patrol')
      throw new Error('Choose a current Patrol boundary.');
    Object.assign(policy, {
      boundaryId,
      reviewedFrameId: frame.frameId,
      deadline: new Date(Date.parse(frame.recordedAt) + 30000).toISOString(),
    });
  }
  return { members, policy };
}

export function behaviorLabel(frame: ImmutableFrame, entityId: string) {
  if (frame.entities[entityId]?.condition === 'non-operational')
    return frame.fleetBehavior?.outcomes?.some((o) =>
      o.participants.some((p) => p.entityId === entityId),
    )
      ? 'NON-OP · simulated loss'
      : 'NON-OP';
  const m = frame.fleetBehavior?.members?.find((m) => m.entityId === entityId);
  if (!m) return undefined;
  const moving = frame.interactive?.executions?.some(
    (e) => e.entityId === entityId && ['Accepted', 'Running'].includes(e.state),
  );
  if (m.state === 'pursuing') {
    const a = frame.fleetBehavior?.assignments?.find(
      (a) => a.id === m.assignmentId,
    );
    return `Intercept → ${a ? (frame.entities[a.targetId]?.label ?? 'target') : 'assignment'}${frame.interactive?.state === 'paused' ? ' · paused' : ''}`;
  }
  if (m.state === 'patrolling')
    return `Patrol · ${frame.zones[m.patrol!.boundaryId]?.label ?? 'area'} · ${m.patrol!.completedLoops ?? 0} loops${frame.interactive?.state === 'paused' ? ' · paused' : ''}`;
  return (
    {
      hold: moving ? 'Manual · moving' : 'Manual · holding',
      armed:
        frame.fleetBehavior?.ruleVersion === 'local-fleet-v2'
          ? moving
            ? 'Intercept · moving'
            : 'Intercept · proximity watch'
          : 'Intercept armed · choose map area',
      reserve: 'Intercept · held reserve',
      blocked: 'Blocked · held',
      interrupted: 'Interrupted · disarmed',
      unavailable: 'Unavailable',
    } as Record<string, string>
  )[m.state];
}
