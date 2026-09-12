import { describe, expect, it } from 'vitest';
import rawFixture from '../../../contracts/sentinel/v1/fixture.world.json';
import { validateFrame } from '../../src/contracts/decode';
import type { Track, Zone } from '../../src/contracts/generated';
import type { WorldFrame } from '../../src/contracts/types';
import { createScene } from '../../src/renderers/scene';
import { affiliationSymbols } from '../../src/renderers/symbology';
import {
  initialSession,
  type SessionState,
} from '../../src/state/sessionStore';
import { immutableCopy } from '../../src/world/immutable';

function fixture() {
  const frame = validateFrame(JSON.parse(JSON.stringify(rawFixture)));
  const session = initialSession(frame.mission.id);
  return { frame, session };
}
function project(
  frame: WorldFrame,
  session = initialSession(frame.mission.id),
) {
  return createScene(
    { status: 'current', mode: 'live', frame: immutableCopy(frame) },
    immutableCopy(session),
  );
}
function select(session: SessionState, id: string) {
  session.selection = {
    missionId: session.missionId,
    items: [{ kind: 'entity', id }],
    primary: { kind: 'entity', id },
    revision: 1,
  };
}
function zone(frame: WorldFrame, id = 'test-zone'): Zone {
  return {
    id,
    missionId: frame.mission.id,
    label: 'Synthetic display test area',
    purpose: 'test-area',
    provenance: Object.values(frame.entities)[0].provenance,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    },
  };
}
function locate(track: Track, longitude: number, latitude: number) {
  track.latest.position.longitudeDeg = longitude;
  track.latest.position.latitudeDeg = latitude;
}

describe('renderer-neutral scene', () => {
  it('projects tracks once per Entity without counting Asset roles as objects', () => {
    const { frame, session } = fixture();
    const before = JSON.stringify(frame);
    const scene = project(frame, session);
    expect(scene.objects).toHaveLength(Object.keys(frame.entities).length);
    expect(
      scene.objects.filter((object) => object.ref.kind !== 'entity'),
    ).toEqual([]);
    expect(scene.objects[0].position).toEqual(
      Object.values(frame.tracks)[0].latest.position,
    );
    expect(scene.objects[0].affiliation).toBe('unknown');
    expect(scene.frameId).toBe(frame.frameId);
    expect(scene.effectiveAt).toBe(frame.effectiveAt);
    expect(JSON.stringify(frame)).toBe(before);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.objects)).toBe(true);
    expect(Object.isFrozen(scene.objects[0].ref)).toBe(true);
    expect(Object.isFrozen(scene.objects[0].position)).toBe(true);
  });

  it('chooses a source deterministically without interpolating or fusing positions', () => {
    const { frame, session } = fixture();
    const original = Object.values(frame.tracks)[0];
    const older = structuredClone(original);
    older.id = 'A-older';
    older.latest.timestamp = '2026-09-09T23:59:59.000Z';
    locate(older, 90, 20);
    const newest = structuredClone(original);
    newest.id = 'z-newest';
    newest.latest.timestamp = frame.effectiveAt;
    locate(newest, 30, 10);
    const tied = structuredClone(newest);
    tied.id = 'B-newest';
    locate(tied, 40, 15);
    const ended = structuredClone(newest);
    ended.id = '0-ended';
    ended.state = 'ended';
    frame.tracks = Object.fromEntries(
      [newest, older, ended, tied].map((track) => [track.id, track]),
    );
    const object = project(frame, session).objects[0];
    expect(object.trackId).toBe('B-newest');
    expect(object.position.longitudeDeg).toBe(40);
    expect(object.position.latitudeDeg).toBe(15);
    frame.tracks = Object.fromEntries(Object.entries(frame.tracks).reverse());
    expect(project(frame, session).objects[0]).toEqual(object);
  });

  it('uses only a permitted source and reports source-filtered selection', () => {
    const { frame, session } = fixture();
    const base = Object.values(frame.tracks)[0];
    const other = structuredClone(base);
    other.id = 'alternate-track';
    other.source.id = 'alternate-source';
    locate(other, 45, 25);
    frame.tracks[other.id] = other;
    select(session, base.entityId);
    session.filters.sourceIds = ['alternate-source'];
    expect(project(frame, session).objects[0].trackId).toBe(other.id);
    session.filters.sourceIds = ['not-supplied'];
    expect(project(frame, session).selection).toMatchObject({
      id: base.entityId,
      status: 'filtered',
    });
  });

  it('replaces additions, changes and removals while keeping stable Entity refs', () => {
    const { frame, session } = fixture();
    const initial = project(frame, session);
    const first = Object.values(frame.tracks)[0];
    locate(first, 70, 35);
    frame.entities[first.entityId].affiliation = 'friendly';
    const removed = Object.values(frame.tracks)[1];
    delete frame.tracks[removed.id];
    delete frame.entities[removed.entityId];
    const addedEntity = structuredClone(frame.entities[first.entityId]);
    addedEntity.id = 'new-entity';
    addedEntity.affiliation = 'hostile';
    frame.entities[addedEntity.id] = addedEntity;
    const addedTrack = structuredClone(first);
    addedTrack.id = 'new-track';
    addedTrack.entityId = addedEntity.id;
    frame.tracks[addedTrack.id] = addedTrack;
    frame.frameId = 'next-committed-frame';
    frame.sequence++;
    const next = project(frame, session);
    expect(
      next.objects.find((object) => object.ref.id === first.entityId)?.ref,
    ).toEqual(
      initial.objects.find((object) => object.ref.id === first.entityId)?.ref,
    );
    expect(
      next.objects.find((object) => object.ref.id === first.entityId),
    ).toMatchObject({
      affiliation: 'friendly',
      position: { longitudeDeg: 70, latitudeDeg: 35 },
    });
    expect(
      next.objects.some((object) => object.ref.id === removed.entityId),
    ).toBe(false);
    expect(
      next.objects.find((object) => object.ref.id === 'new-entity')
        ?.affiliation,
    ).toBe('hostile');
    expect(initial.frameId).not.toBe(next.frameId);
  });

  it('preserves missing and unlocated selections without inventing a position', () => {
    const { frame, session } = fixture();
    const track = Object.values(frame.tracks)[0];
    select(session, track.entityId);
    delete frame.tracks[track.id];
    const unlocated = project(frame, session);
    expect(unlocated.selection.status).toBe('unlocated');
    expect(unlocated.unlocatedCount).toBe(1);
    expect(
      unlocated.objects.some((object) => object.ref.id === track.entityId),
    ).toBe(false);
    delete frame.entities[track.entityId];
    for (const asset of Object.values(frame.assets)) {
      if (asset.entityId === track.entityId) delete frame.assets[asset.id];
    }
    expect(project(frame, session).selection).toMatchObject({
      id: track.entityId,
      status: 'missing',
    });
    expect(session.selection.primary?.id).toBe(track.entityId);
  });

  it('filters affiliations and supplied classification codes without inventing missing classes', () => {
    const { frame, session } = fixture();
    const entities = Object.values(frame.entities);
    entities[0].affiliation = 'friendly';
    entities[0].classification = { scheme: 'test', code: 'declared-type' };
    entities[1].affiliation = 'hostile';
    select(session, entities[1].id);
    session.filters.affiliations = ['friendly'];
    session.filters.classificationCodes = ['declared-type'];
    expect(
      project(frame, session).objects.map((object) => object.ref.id),
    ).toEqual([entities[0].id]);
    expect(project(frame, session).selection.status).toBe('filtered');
    session.filters.classificationCodes = ['absent-type'];
    expect(project(frame, session).objects).toEqual([]);
  });

  it('keeps observation staleness distinct from a stale backend presentation', () => {
    const { frame, session } = fixture();
    const tracks = Object.values(frame.tracks);
    tracks[0].state = 'stale';
    tracks[1].state = 'ended';
    frame.entities[tracks[2].entityId].presence = 'unobserved';
    const current = project(frame, session);
    expect(current.stale).toBe(false);
    expect(current.objects.every((object) => object.stale)).toBe(true);
    session.filters.showUnobserved = false;
    expect(project(frame, session).objects).toEqual([]);
    session.filters.showUnobserved = true;
    const lost = createScene(
      { status: 'stale', mode: 'live', frame: immutableCopy(frame) },
      session,
    );
    expect(lost.stale).toBe(true);
    expect(lost.objects).toEqual(current.objects);
    expect(lost.frameId).toBe(current.frameId);
  });

  it('requires explicit removed visibility and never clears its selection', () => {
    const { frame, session } = fixture();
    const entity = Object.values(frame.entities)[0];
    entity.presence = 'removed';
    select(session, entity.id);
    expect(project(frame, session).selection.status).toBe('filtered');
    session.filters.showRemoved = true;
    const scene = project(frame, session);
    expect(scene.selection.status).toBe('visible');
    expect(
      scene.objects.find((object) => object.ref.id === entity.id),
    ).toMatchObject({
      selected: true,
      stale: true,
    });
  });

  it('renders supplied zones only in their validity window and respects the shared overlay', () => {
    const { frame, session } = fixture();
    const active = zone(frame, 'active');
    active.validFrom = frame.effectiveAt;
    active.validUntil = frame.effectiveAt;
    const future = zone(frame, 'future');
    future.validFrom = '2026-09-11T00:00:00.000Z';
    const expired = zone(frame, 'expired');
    expired.validUntil = '2026-09-09T00:00:00.000Z';
    frame.zones = { active, future, expired };
    expect(project(frame, session).zones.map((item) => item.ref.id)).toEqual([
      'active',
    ]);
    session.overlays.zones = false;
    expect(project(frame, session).zones).toEqual([]);
    expect(project(frame, session).objects).toHaveLength(3);
  });

  it('applies horizontal polygon filters with included boundaries and excluded hole interiors', () => {
    const { frame, session } = fixture();
    const area = zone(frame);
    area.altitudeBand = {
      lower: { metres: 900, reference: 'AGL' },
      upper: { metres: 1000, reference: 'AGL' },
    };
    area.geometry.coordinates.push([
      [3, 3],
      [6, 3],
      [6, 6],
      [3, 6],
      [3, 3],
    ]);
    frame.zones = { [area.id]: area };
    const tracks = Object.values(frame.tracks);
    locate(tracks[0], 0, 2); // outer boundary
    locate(tracks[1], 4, 4); // hole interior
    locate(tracks[2], 3, 4); // hole boundary
    select(session, tracks[1].entityId);
    session.filters.zoneIds = [area.id];
    const scene = project(frame, session);
    expect(scene.objects.map((object) => object.ref.id)).toEqual([
      tracks[0].entityId,
      tracks[2].entityId,
    ]);
    expect(scene.selection.status).toBe('filtered');
    // Hiding the overlay does not disable the independently selected zone filter.
    session.overlays.zones = false;
    expect(project(frame, session).objects).toEqual(scene.objects);
    session.filters.zoneIds = ['unknown-zone'];
    expect(project(frame, session).objects).toEqual([]);
  });

  it('does not render an old mission frame or carry its selection into another mission', () => {
    const { frame, session } = fixture();
    select(session, Object.keys(frame.entities)[0]);
    session.missionId = 'another-mission';
    const scene = project(frame, session);
    expect(scene.missionId).toBe('another-mission');
    expect(scene.frameId).toBeUndefined();
    expect(scene.objects).toEqual([]);
    expect(scene.zones).toEqual([]);
    expect(scene.selection.status).toBe('none');
  });

  it('preserves declared reference altitude without guessing a camera or altitude conversion', () => {
    const { frame } = fixture();
    expect(project(frame).referencePoint).toBeUndefined();
    frame.mission.referencePoint = {
      longitudeDeg: 12,
      latitudeDeg: -24,
      altitude: { metres: 75, reference: 'MSL' },
    };
    expect(project(frame).referencePoint).toEqual(frame.mission.referencePoint);
  });

  it('gives each supplied affiliation a distinct shape and explicit text meaning', () => {
    const symbols = Object.values(affiliationSymbols);
    expect(new Set(symbols.map((symbol) => symbol.shape)).size).toBe(4);
    expect(new Set(symbols.map((symbol) => symbol.shortLabel)).size).toBe(4);
    expect(affiliationSymbols.unknown.label).toBe('Unknown');
  });
});
