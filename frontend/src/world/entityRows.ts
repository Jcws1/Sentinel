import type { Track, Zone } from '../contracts/generated';
import type { DeepReadonly, Entity, ImmutableFrame } from '../contracts/types';
import type { FilterState } from '../state/sessionStore';

export type ReadTrack = DeepReadonly<Track>;
type Point = readonly number[];
export const rawCompare = (a: string, b: string) =>
  a < b ? -1 : a > b ? 1 : 0;
/** A display choice, never fusion. Source filtering precedes arbitration. */
export function chooseTrack(
  tracks: readonly ReadTrack[],
): ReadTrack | undefined {
  return [...tracks].sort(
    (a, b) =>
      Number(a.state === 'ended') - Number(b.state === 'ended') ||
      rawCompare(b.latest.timestamp, a.latest.timestamp) ||
      rawCompare(a.id, b.id),
  )[0];
}
function ringLocation(point: Point, ring: readonly Point[]) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1],
      b = ring[i],
      dx = b[0] - a[0],
      dy = b[1] - a[1];
    const cross = (point[0] - a[0]) * dy - (point[1] - a[1]) * dx;
    if (
      Math.abs(cross) <= 1e-12 * Math.max(1, Math.abs(dx), Math.abs(dy)) &&
      point[0] >= Math.min(a[0], b[0]) - 1e-12 &&
      point[0] <= Math.max(a[0], b[0]) + 1e-12 &&
      point[1] >= Math.min(a[1], b[1]) - 1e-12 &&
      point[1] <= Math.max(a[1], b[1]) + 1e-12
    )
      return 'boundary';
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < (dx * (point[1] - a[1])) / dy + a[0]
    )
      inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}
function inZone(track: ReadTrack, zone: DeepReadonly<Zone>) {
  const p = track.latest.position,
    point = [p.longitudeDeg, p.latitudeDeg];
  const [outer, ...holes] = zone.geometry.coordinates;
  return (
    outer &&
    ringLocation(point, outer) !== 'outside' &&
    !holes.some((h) => ringLocation(point, h) === 'inside')
  );
}
export function activeZones(
  frame: ImmutableFrame,
  filters: DeepReadonly<FilterState>,
) {
  return Object.values(frame.zones)
    .filter(
      (z) =>
        z.missionId === frame.mission.id &&
        (!z.validFrom || z.validFrom <= frame.effectiveAt) &&
        (!z.validUntil || z.validUntil >= frame.effectiveAt) &&
        (!filters.zoneIds.length || filters.zoneIds.includes(z.id)),
    )
    .sort((a, b) => rawCompare(a.id, b.id));
}
export interface EntityRow {
  entity: DeepReadonly<Entity>;
  track?: ReadTrack;
  tracks: readonly ReadTrack[];
  visible: boolean;
  observation: 'tracking' | 'stale' | 'ended' | 'unlocated';
}
/** Exactly one row per Entity, including unlocated identities. Asset is a role,
 * never an extra row. Hidden rows keep their supplied values for pinned details. */
export function entityRows(
  frame: ImmutableFrame,
  filters: DeepReadonly<FilterState>,
): EntityRow[] {
  const byEntity = new Map<string, ReadTrack[]>();
  for (const track of Object.values(frame.tracks)) {
    if (track.missionId !== frame.mission.id) continue;
    const list = byEntity.get(track.entityId) ?? [];
    list.push(track);
    byEntity.set(track.entityId, list);
  }
  const zones = activeZones(frame, filters);
  const query = (filters.search ?? '').trim().toLocaleLowerCase();
  return Object.values(frame.entities)
    .filter((e) => e.missionId === frame.mission.id)
    .sort((a, b) => rawCompare(a.id, b.id))
    .map((entity) => {
      const tracks = byEntity.get(entity.id) ?? [];
      const candidates = filters.sourceIds.length
        ? tracks.filter((t) => filters.sourceIds.includes(t.source.id))
        : tracks;
      const chosen = chooseTrack(candidates);
      const track = chosen ?? chooseTrack(tracks);
      const observation = !track
        ? 'unlocated'
        : entity.presence === 'unobserved' && track.state === 'tracking'
          ? 'stale'
          : track.state;
      const visible =
        (!filters.conditions?.length ||
          filters.conditions.includes(entity.condition)) &&
        (!filters.affiliations.length ||
          filters.affiliations.includes(entity.affiliation)) &&
        (!filters.classificationCodes.length ||
          (entity.classification != null &&
            filters.classificationCodes.includes(
              entity.classification.code,
            ))) &&
        (filters.showRemoved || entity.presence !== 'removed') &&
        (filters.showUnobserved ||
          (entity.presence !== 'unobserved' &&
            (!track || track.state === 'tracking'))) &&
        (!filters.sourceIds.length ||
          !!chosen ||
          (!tracks.length &&
            filters.sourceIds.includes(entity.provenance.source.id))) &&
        (!filters.zoneIds.length ||
          (!!chosen && zones.some((z) => inZone(chosen, z)))) &&
        (!filters.observationStates?.length ||
          filters.observationStates.includes(observation)) &&
        (!query ||
          [
            entity.id,
            entity.label,
            entity.classification?.code,
            entity.classification?.label,
            track?.id,
            track?.source.id,
          ].some((value) => value?.toLocaleLowerCase().includes(query)));
      return { entity, track, tracks, visible, observation };
    });
}

export function selectionStatus(row?: EntityRow) {
  return !row
    ? 'missing'
    : !row.visible
      ? 'filtered'
      : !row.track
        ? 'unlocated'
        : 'visible';
}
