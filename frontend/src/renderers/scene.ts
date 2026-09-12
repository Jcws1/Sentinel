import type { Track, Zone } from '../contracts/generated';
import type { DeepReadonly, Entity } from '../contracts/types';
import type { FilterState, SessionState } from '../state/sessionStore';
import type { PresentationFrame } from '../world/presentation';
import type { SceneObject, SceneProjection, SceneZone } from './contracts';
import { regionalMissions } from './regions';

type ReadTrack = DeepReadonly<Track>;
type ReadZone = DeepReadonly<Zone>;
// DeepReadonly maps the generated coordinate tuple to a readonly array.
// Ingress validation has already guaranteed exactly longitude and latitude.
type Point = readonly number[];

function rawCompare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** No fusion: prefer non-ended sources, then newest sample, then raw ID order. */
function chooseTrack(tracks: readonly ReadTrack[]): ReadTrack | undefined {
  return [...tracks].sort((a, b) => {
    const ended = Number(a.state === 'ended') - Number(b.state === 'ended');
    return (
      ended ||
      rawCompare(b.latest.timestamp, a.latest.timestamp) ||
      rawCompare(a.id, b.id)
    );
  })[0];
}

function onSegment(point: Point, a: Point, b: Point) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cross = (point[0] - a[0]) * dy - (point[1] - a[1]) * dx;
  const tolerance = 1e-12;
  return (
    Math.abs(cross) <= tolerance * Math.max(1, Math.abs(dx), Math.abs(dy)) &&
    point[0] >= Math.min(a[0], b[0]) - tolerance &&
    point[0] <= Math.max(a[0], b[0]) + tolerance &&
    point[1] >= Math.min(a[1], b[1]) - tolerance &&
    point[1] <= Math.max(a[1], b[1]) + tolerance
  );
}

function ringLocation(point: Point, ring: readonly Point[]) {
  let inside = false;
  for (let index = 1; index < ring.length; index++) {
    const a = ring[index - 1];
    const b = ring[index];
    if (onSegment(point, a, b)) return 'boundary';
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

/** Horizontal display filter only; it does not imply altitude eligibility. */
function inZone(track: ReadTrack, zone: ReadZone) {
  const position = track.latest.position;
  const point: Point = [position.longitudeDeg, position.latitudeDeg];
  const [outer, ...holes] = zone.geometry.coordinates;
  if (!outer || ringLocation(point, outer) === 'outside') return false;
  // Polygon boundaries are included, including the boundary of a hole.
  return !holes.some((ring) => ringLocation(point, ring) === 'inside');
}

function entityPasses(
  entity: DeepReadonly<Entity>,
  filters: DeepReadonly<FilterState>,
) {
  return (
    (!filters.affiliations.length ||
      filters.affiliations.includes(entity.affiliation)) &&
    (!filters.classificationCodes.length ||
      (entity.classification != null &&
        filters.classificationCodes.includes(entity.classification.code))) &&
    (filters.showRemoved || entity.presence !== 'removed') &&
    (filters.showUnobserved || entity.presence !== 'unobserved')
  );
}

export function createScene(
  presentation: PresentationFrame,
  session: DeepReadonly<SessionState>,
): SceneProjection {
  const frame =
    presentation.frame?.mission.id === session.missionId
      ? presentation.frame
      : undefined;
  const selectedId =
    session.selection.missionId === session.missionId &&
    session.selection.primary?.kind === 'entity'
      ? session.selection.primary.id
      : undefined;
  if (!frame)
    return Object.freeze({
      missionId: session.missionId,
      stale:
        presentation.status === 'stale' || presentation.status === 'seeking',
      objects: Object.freeze([]),
      zones: Object.freeze([]),
      selection: Object.freeze({
        id: selectedId,
        status: selectedId ? 'missing' : 'none',
      }),
      unlocatedCount: 0,
    });

  const filters = session.filters;
  const activeZones = Object.values(frame.zones)
    .filter(
      (zone) =>
        zone.missionId === frame.mission.id &&
        (!zone.validFrom || zone.validFrom <= frame.effectiveAt) &&
        (!zone.validUntil || zone.validUntil >= frame.effectiveAt) &&
        (!filters.zoneIds.length || filters.zoneIds.includes(zone.id)),
    )
    .sort((a, b) => rawCompare(a.id, b.id));
  const tracksByEntity = new Map<string, ReadTrack[]>();
  for (const track of Object.values(frame.tracks)) {
    if (track.missionId !== frame.mission.id) continue;
    const tracks = tracksByEntity.get(track.entityId) ?? [];
    tracks.push(track);
    tracksByEntity.set(track.entityId, tracks);
  }

  const objects: SceneObject[] = [];
  let unlocatedCount = 0;
  for (const entity of Object.values(frame.entities).sort((a, b) =>
    rawCompare(a.id, b.id),
  )) {
    if (entity.missionId !== frame.mission.id) continue;
    const tracks = tracksByEntity.get(entity.id) ?? [];
    if (!tracks.length) unlocatedCount++;
    if (!entityPasses(entity, filters)) continue;
    const track = chooseTrack(
      filters.sourceIds.length
        ? tracks.filter((candidate) =>
            filters.sourceIds.includes(candidate.source.id),
          )
        : tracks,
    );
    if (!track) continue;
    const stale = entity.presence !== 'present' || track.state !== 'tracking';
    if (!filters.showUnobserved && track.state !== 'tracking') continue;
    if (
      filters.zoneIds.length &&
      !activeZones.some((zone) => inZone(track, zone))
    )
      continue;
    objects.push(
      Object.freeze({
        ref: Object.freeze({ kind: 'entity', id: entity.id }),
        trackId: track.id,
        position: track.latest.position,
        affiliation: entity.affiliation,
        label: entity.label,
        selected: entity.id === selectedId,
        stale,
      }),
    );
  }

  const zones: SceneZone[] = session.overlays.zones
    ? activeZones.map((zone) =>
        Object.freeze({
          ref: Object.freeze({ kind: 'zone', id: zone.id }),
          label: zone.label,
          geometry: zone.geometry,
          altitudeBand: zone.altitudeBand,
        }),
      )
    : [];
  const selected =
    selectedId && Object.hasOwn(frame.entities, selectedId)
      ? frame.entities[selectedId]
      : undefined;
  const selectionStatus = !selectedId
    ? 'none'
    : !selected
      ? 'missing'
      : !tracksByEntity.has(selectedId)
        ? 'unlocated'
        : objects.some((object) => object.ref.id === selectedId)
          ? 'visible'
          : 'filtered';
  return Object.freeze({
    missionId: frame.mission.id,
    frameId: frame.frameId,
    sequence: frame.sequence,
    effectiveAt: frame.effectiveAt,
    stale: presentation.status !== 'current',
    objects: Object.freeze(objects),
    zones: Object.freeze(zones),
    selection: Object.freeze({
      id: selectedId,
      label: selected?.label,
      status: selectionStatus,
    }),
    unlocatedCount,
    referencePoint: frame.mission.referencePoint ?? undefined,
    region: regionalMissions[frame.mission.id],
  });
}
