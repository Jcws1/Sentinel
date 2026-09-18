import type { ImmutableFrame, DeepReadonly } from '../contracts/types';
import type { MovePosition } from '../contracts/generated';
import type {
  SceneObject,
  SceneRoute,
  SceneDestination,
} from '../renderers/contracts';
import type { DisplayPreferences } from '../state/displayPreferences';

const position = (p: DeepReadonly<MovePosition>) => ({
  ...p,
  altitude: {
    ...p.altitude,
    reference: 'ELLIPSOID' as const,
    datumId: 'WGS84',
  },
});
/** Read-only projection of work already accepted by the sole simulation writer. */
export function activePlans(
  frame: ImmutableFrame,
  objects: readonly SceneObject[],
  preferences: Readonly<DisplayPreferences>,
  stale = false,
) {
  const routes: SceneRoute[] = [],
    destinations: SceneDestination[] = [];
  if (
    !preferences.plansVisible ||
    !frame.interactive ||
    frame.interactive.state === 'ended'
  )
    return { routes, destinations };
  for (const o of objects) {
    if (
      o.affiliation !== 'friendly' ||
      !o.managed ||
      o.condition === 'non-operational' ||
      o.stale ||
      (preferences.planScope === 'selected' && !o.selected)
    )
      continue;
    const e = frame.interactive.executions?.find(
      (e) =>
        e.entityId === o.ref.id &&
        ['Accepted', 'Running', 'Suspended'].includes(e.state),
    );
    const member = frame.fleetBehavior?.members?.find(
      (m) => m.entityId === o.ref.id,
    );
    const suffix = stale
      ? ' · last reported'
      : frame.interactive.state === 'paused'
        ? ' · paused'
        : '';
    if (e) {
      destinations.push({
        id: e.id,
        entityId: o.ref.id,
        position: position(e.destination),
        stage: 'accepted',
        selected: o.selected,
        label: `${e.suspendedBy ? 'Retained destination' : 'Destination'}${suffix} · ${o.label}`,
      });
      if (!e.suspendedBy && e.controlTrackId === o.trackId)
        routes.push({
          id: e.id,
          entityId: o.ref.id,
          kind: 'move',
          label: `Move${suffix}`,
          points: [o.position, position(e.destination)],
        });
    }
    if (!member || member.controlTrackId !== o.trackId) continue;
    if (member.state === 'pursuing') {
      const a = frame.fleetBehavior?.assignments?.find(
        (a) => a.id === member.assignmentId && a.state === 'active',
      );
      const target = a && frame.tracks[a.targetTrackId];
      if (
        a &&
        target &&
        target.state === 'tracking' &&
        frame.entities[a.targetId]?.condition === 'operational'
      ) {
        routes.push({
          id: a.id,
          entityId: o.ref.id,
          targetId: a.targetId,
          targetTrackId: a.targetTrackId,
          kind: 'pursuit',
          label: `Pursuit${suffix}`,
          points: [o.position, target.latest.position],
        });
      }
    } else if (member.state === 'patrolling' && member.patrol) {
      const { loop, waypoint } = member.patrol;
      const remaining = [
        ...loop.slice(waypoint),
        ...loop.slice(0, waypoint + 1),
      ].map(position);
      routes.push({
        id: member.id,
        entityId: o.ref.id,
        kind: 'patrol',
        label: `Patrol${suffix}`,
        points: [o.position, ...remaining],
      });
    }
  }
  return { routes, destinations };
}
/** Only visual endpoints follow interpolation; stored anchors remain untouched. */
export function displayedRoutePoints(
  route: SceneRoute,
  objects: readonly SceneObject[],
) {
  const points = [...route.points];
  const start = objects.find((o) => o.ref.id === route.entityId);
  if (start) points[0] = start.position;
  if (route.targetId) {
    const target = objects.find(
      (o) => o.ref.id === route.targetId && o.trackId === route.targetTrackId,
    );
    if (target) points[points.length - 1] = target.position;
  }
  return points;
}
