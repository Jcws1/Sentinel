import { expect, it } from 'vitest';
import raw from '../../../contracts/sentinel/v1.11/fixture.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';
import { entityRows, selectionStatus } from '../../src/world/entityRows';
import {
  altitudeText,
  freshness,
  speedText,
} from '../../src/features/entities/values';
import {
  inspectorId,
  inspectorIdentity,
  isViewId,
} from '../../src/features/workspace/viewRegistry';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';

it('keeps unlocated identities discoverable, counts Entity once and distinguishes zero from unknown', () => {
  const frame = validateFrame(structuredClone(raw)),
    filters = initialSession(frame.mission.id).filters;
  const tracks = Object.values(frame.tracks),
    first = tracks[0],
    last = tracks.at(-1)!;
  frame.tracks['alternate'] = { ...first, id: 'alternate' };
  delete frame.tracks[last.id];
  const rows = entityRows(frame, filters);
  expect(rows).toHaveLength(Object.keys(frame.entities).length);
  expect(rows.find((r) => r.entity.id === first.entityId)?.tracks).toHaveLength(
    2,
  );
  const unlocated = rows.find((r) => r.entity.id === last.entityId)!;
  expect(unlocated.visible).toBe(true);
  expect(selectionStatus(unlocated)).toBe('unlocated');
  expect(altitudeText(unlocated)).toBe('Unavailable');
  const row = rows.find((r) => r.entity.id === first.entityId)!;
  const noSpeed = {
    ...row,
    track: { ...first, latest: { ...first.latest, velocity: undefined } },
  };
  expect(speedText(noSpeed)).toBe('Unavailable');
  expect(
    speedText({
      ...row,
      track: {
        ...first,
        latest: {
          ...first.latest,
          velocity: { speedMps: 0, headingTrueDeg: 0 },
        },
      },
    }),
  ).toBe('0 m/s');
  filters.observationStates = ['unlocated'];
  expect(
    entityRows(frame, filters)
      .filter((r) => r.visible)
      .map((r) => r.entity.id),
  ).toEqual([last.entityId]);
  expect(
    selectionStatus(
      entityRows(frame, filters).find((r) => r.entity.id === first.entityId),
    ),
  ).toBe('filtered');
});
it('states observation age in seconds below an hour, then in hours or days', () => {
  const frame = validateFrame(structuredClone(raw)),
    filters = initialSession(frame.mission.id).filters;
  const row = entityRows(frame, filters).find((r) => r.track)!;
  const observed = Date.parse(row.track!.latest.timestamp);
  const after = (seconds: number) =>
    new Date(observed + seconds * 1000).toISOString();
  expect(freshness(row, after(12.34))).toBe('12.3 s before frame');
  expect(freshness(row, after(3599))).toBe('3,599 s before frame');
  expect(freshness(row, after(3600 + 25 * 60))).toBe('1 h 25 min before frame');
  expect(freshness(row, after(1_603_467.9))).toBe('18 d 13 h before frame');
  expect(freshness(row, after(-5))).toBe('0 s before frame');
});

it('searches supplied identity/class/source and source arbitration agrees with map projection', () => {
  const frame = validateFrame(structuredClone(raw)),
    filters = initialSession(frame.mission.id).filters,
    track = Object.values(frame.tracks)[0];
  frame.entities[track.entityId].classification = {
    scheme: 'fixture',
    code: 'target',
    label: 'Test object',
  };
  filters.search = 'TEST OBJECT';
  expect(entityRows(frame, filters).filter((r) => r.visible)).toHaveLength(1);
  filters.search = '';
  filters.sourceIds = ['other'];
  frame.tracks['other'] = {
    ...track,
    id: 'other',
    source: { ...track.source, id: 'other' },
    state: 'ended',
  };
  const row = entityRows(frame, filters).find(
    (r) => r.entity.id === track.entityId,
  )!;
  expect(row.track?.id).toBe('other');
  expect(row.visible).toBe(true);
  filters.sourceIds = [];
  frame.entities[track.entityId].presence = 'unobserved';
  filters.observationStates = ['stale'];
  expect(
    entityRows(frame, filters).find((r) => r.entity.id === track.entityId)
      ?.visible,
  ).toBe(true);
});
it('inspector keys preserve opaque mission/entity pairs and repeated Open Details focuses the pinned tab', () => {
  const mission = 'a/b:? Ω',
    entity = 'x]["? /#';
  const id = inspectorId(mission, entity);
  expect(inspectorIdentity(id)).toEqual({
    missionId: mission,
    entityId: entity,
  });
  expect(isViewId(id)).toBe(true);
  expect(inspectorId('a', 'b/c')).not.toBe(inspectorId('a/b', 'c'));
  expect(inspectorIdentity('inspector:%bad')).toBeUndefined();
  const bridge = new WorkspaceBridge();
  bridge.openInspector(mission, entity, 'Short');
  bridge.openInspector(mission, entity, 'Short');
  expect(bridge.getSnapshot().views.filter((v) => v.id === id)).toHaveLength(1);
  bridge.dispose();
});
