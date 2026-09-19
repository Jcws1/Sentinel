import { describe, expect, it } from 'vitest';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';
import {
  cockpitCandidate,
  cockpitKey,
  createCockpitPresentation,
  type CockpitInput,
} from '../../src/world/cockpit';
import { cockpitOrientation } from '../../src/renderers/cesium/cockpitCamera';
import { createMotionPresentation } from '../../src/world/motionPresentation';
import { createScene } from '../../src/renderers/scene';

function setup() {
  const frame = validateFrame(structuredClone(demo));
  const session = initialSession(frame.mission.id);
  const input: CockpitInput = {
    presentation: { frame, status: 'current', mode: 'live' },
    session,
    connection: 'connected',
    authoring: false,
  };
  const owner = createCockpitPresentation();
  const entity = (label: string) =>
    Object.values(frame.entities).find((e) => e.label === label)!;
  const id = entity('F-01').id;
  const track =
    frame.tracks[
      frame.interactive!.controls.find((c) => c.entityId === id)!
        .controlTrackId!
    ];
  owner.open(input, id);
  const sync = () => owner.sync(input);
  const select = (label?: string) => {
    const primary = label
      ? { kind: 'entity' as const, id: entity(label).id }
      : undefined;
    session.selection = {
      ...session.selection,
      revision: session.selection.revision + 1,
      primary,
      items: primary ? [primary] : [],
    };
  };
  return { input, frame, session, owner, entity, id, track, sync, select };
}
describe('one frontend-only simulated cockpit', () => {
  it('binds the declared control Track, even when a newer display source differs', () => {
    const h = setup();
    const alternate = Object.values(h.frame.tracks).find(
      (t) => t.entityId === h.id && t.id !== h.track.id,
    )!;
    alternate.latest.position.longitudeDeg += 1;
    alternate.latest.timestamp = '2099-01-01T00:00:00Z';
    const before = JSON.stringify(h.frame);
    expect(h.sync().binding?.trackId).toBe(h.track.id);
    expect(h.sync().pose?.position).toEqual(h.track.latest.position);
    expect(JSON.stringify(h.frame)).toBe(before);
  });
  it('pins subject and Track across ordinary selection and source-filter changes', () => {
    const h = setup(),
      key = cockpitKey(h.sync().binding!);
    h.select('F-02');
    h.session.filters.sourceIds = ['demo-observer-v1'];
    expect(cockpitKey(h.sync().binding!)).toBe(key);
    expect(h.sync().followSelection).toBe(false);
  });
  it('follows only the primary member, and discloses an ineligible/empty primary', () => {
    const h = setup();
    h.owner.follow(true);
    h.select('F-02');
    h.session.selection.items = [
      { kind: 'entity', id: h.id },
      ...h.session.selection.items,
    ];
    expect(h.sync().binding?.entityId).toBe(h.entity('F-02').id);
    h.select('O-01');
    expect(h.sync().cannotFollow).toContain('Only friendly');
    expect(h.sync().binding?.entityId).toBe(h.entity('F-02').id);
    h.select();
    expect(h.sync().cannotFollow).toContain('primary selection');
  });
  it('allows a friendly observation-only simulated drone without inventing authority', () => {
    const h = setup();
    const c = cockpitCandidate(h.input, h.entity('F-05').id);
    expect(c.binding?.controlled).toBe(false);
    expect(c.binding?.trackId).toBeDefined();
    expect(
      h.frame.interactive!.controls.some(
        (c) => c.entityId === h.entity('F-05').id,
      ),
    ).toBe(false);
  });
  it('attributes report age only to the bound source, otherwise preserving observation time', () => {
    const h = setup();
    h.frame.interactive!.lastReportAt = '2026-09-19T00:00:35Z';
    expect(h.sync().pose?.reportAt).toBe(h.frame.interactive!.lastReportAt);
    const observer = h.entity('F-05');
    const track = Object.values(h.frame.tracks).find(
      (t) => t.entityId === observer.id,
    )!;
    track.source.id = 'separate-simulated-observer';
    track.latest.timestamp = '2026-09-19T00:00:00Z';
    h.owner.open(h.input, observer.id);
    expect(h.sync().pose).toMatchObject({
      observedAt: '2026-09-19T00:00:00Z',
      reportAt: undefined,
    });
    expect(h.sync().binding?.sourceId).toBe('separate-simulated-observer');
  });
  it.each(['hostile', 'unknown', 'neutral'] as const)(
    'rejects %s affiliation',
    (affiliation) => {
      const h = setup();
      h.frame.entities[h.id].affiliation = affiliation;
      expect(cockpitCandidate(h.input, h.id).binding).toBeUndefined();
    },
  );
  it('rejects a live source and unclassified non-drone', () => {
    const h = setup();
    h.track.source.mode = 'live';
    expect(cockpitCandidate(h.input, h.id).binding).toBeUndefined();
    h.track.source.mode = 'simulated';
    delete h.frame.interactive;
    expect(cockpitCandidate(h.input, h.id).binding).toBeUndefined();
  });
  it('never substitutes the display Track for missing control position', () => {
    const h = setup();
    delete h.frame.tracks[h.track.id];
    expect(h.sync().status).toBe('View unavailable');
    expect(h.sync().pose).toBeUndefined();
    expect(h.sync().binding?.trackId).toBe(h.track.id);
  });
  it.each(['MSL', 'AGL'] as const)(
    'refuses unresolved %s heights',
    (reference) => {
      const h = setup();
      h.track.latest.position.altitude.reference = reference;
      expect(h.sync().status).toBe('View unavailable');
      expect(h.sync().reason).toContain(reference);
    },
  );
  it('refuses unsupported ellipsoid datum without changing source height', () => {
    const h = setup();
    h.track.latest.position.altitude = {
      reference: 'ELLIPSOID',
      metres: 17,
      datumId: 'unsupported',
    };
    expect(h.sync().pose).toBeUndefined();
    expect(h.track.latest.position.altitude.metres).toBe(17);
  });
  it('preserves zero/negative supplied ellipsoid height and authored stationary heading', () => {
    const h = setup();
    h.track.latest.position.altitude.metres = -5;
    h.track.latest.velocity = { speedMps: 0, headingTrueDeg: 273 };
    expect(h.sync().pose).toMatchObject({
      position: { altitude: { metres: -5 } },
      headingTrueDeg: 273,
      headingBasis: 'supplied',
    });
  });
  it('uses last valid orientation only within the same exact binding', () => {
    const h = setup();
    h.track.latest.velocity = { speedMps: 0, headingTrueDeg: 81 };
    h.sync();
    delete h.track.latest.velocity;
    expect(h.sync().pose).toMatchObject({
      headingTrueDeg: 81,
      headingBasis: 'last valid',
    });
    const other = Object.values(h.frame.tracks).find(
      (t) => t.entityId === h.entity('F-02').id,
    )!;
    delete other.latest.velocity;
    h.owner.open(h.input, h.entity('F-02').id);
    expect(h.sync().pose).toMatchObject({
      headingTrueDeg: 0,
      headingBasis: 'north default',
    });
  });
  it.each(['ready', 'running', 'paused', 'ended'] as const)(
    'shows %s lifecycle without moving the supplied pose',
    (state) => {
      const h = setup();
      h.frame.interactive!.state = state;
      expect(h.sync().status.toLowerCase()).toContain(state);
      expect(h.sync().phase).toBe(state);
      expect(h.sync().interpolating).toBe(state === 'running');
      expect(h.sync().pose?.position).toEqual(h.track.latest.position);
    },
  );
  it.each(['stale', 'disconnected'] as const)(
    'freezes the last complete pose during %s',
    (state) => {
      const h = setup();
      const pose = structuredClone(h.sync().pose);
      h.track.latest.position = {
        ...h.track.latest.position,
        longitudeDeg: 42,
      };
      if (state === 'stale') h.track.state = 'stale';
      else h.input.connection = 'disconnected';
      expect(h.sync().status.toLowerCase()).toContain(state);
      expect(h.sync().phase).toBe(state);
      expect(h.sync().pose).toEqual(pose);
      expect(h.sync().interpolating).toBe(false);
      h.track.state = 'tracking';
      h.input.connection = 'connected';
      expect(h.sync().pose?.position.longitudeDeg).toBe(42);
    },
  );
  it('retains NON-OP outcome pose distinctly from stale, disconnected and End', () => {
    const h = setup();
    h.sync();
    h.frame.entities[h.id].condition = 'non-operational';
    h.track.latest.position = { ...h.track.latest.position, longitudeDeg: 43 };
    h.input.connection = 'disconnected';
    h.track.state = 'ended';
    expect(h.sync().status).toBe('NON-OP · frozen simulated viewpoint');
    expect(h.sync().phase).toBe('non-op');
    expect(h.sync().pose?.position.longitudeDeg).toBe(43);
  });
  it.each(['mission', 'recording', 'run', 'authoring'] as const)(
    'clears binding and following on %s context change',
    (kind) => {
      const h = setup();
      h.select('F-01');
      h.owner.follow(true);
      h.sync();
      if (kind === 'mission') h.session.missionId = 'another';
      if (kind === 'recording') h.frame.recordingId = 'another';
      if (kind === 'run') h.frame.interactive!.runId = 'another';
      if (kind === 'authoring') h.input.authoring = true;
      expect(h.sync()).toMatchObject({
        followSelection: false,
        status: 'View unavailable',
      });
      expect(h.sync().binding).toBeUndefined();
    },
  );
  it('accepts a valid same-run recovered paused epoch without autonomous motion', () => {
    const h = setup();
    h.sync();
    h.frame.interactive!.executorEpoch = 'new';
    h.frame.interactive!.state = 'paused';
    expect(h.sync().binding?.entityId).toBe(h.id);
    expect(h.sync().interpolating).toBe(false);
    expect(h.sync().status).toContain('Paused');
  });
  it('uses only a complete recorded frame; seeking never manufactures a pose', () => {
    const h = setup();
    h.input.presentation.mode = 'replay';
    expect(h.sync().status).toContain('Recorded');
    h.input.presentation.frame = undefined;
    expect(h.sync().pose).toBeUndefined();
  });
  it('bounds look offsets, resets them on rebind, and leaves supplied heading unchanged', () => {
    const h = setup(),
      before = JSON.stringify(h.frame);
    h.owner.look(180, -90);
    expect(h.sync()).toMatchObject({ yaw: 90, pitch: -45 });
    h.owner.open(h.input, h.entity('F-02').id);
    expect(h.sync()).toMatchObject({ yaw: 0, pitch: 0 });
    expect(JSON.stringify(h.frame)).toBe(before);
    const p = h.sync().pose!;
    expect(
      cockpitOrientation({
        ...p,
        missionId: h.frame.mission.id,
        bindingKey: 'test',
        yaw: 1000,
        pitch: -1000,
      })?.roll,
    ).toBe(0);
  });
  it('samples exactly the shared displayed Track without extrapolation or another clock', () => {
    const h = setup();
    let now = 0;
    const motion = createMotionPresentation(() => now);
    h.frame.interactive!.state = 'running';
    h.track.latest.velocity = { speedMps: 40, headingTrueDeg: 90 };
    for (const [id, t] of Object.entries(h.frame.tracks))
      if (t.entityId === h.id && id !== h.track.id) delete h.frame.tracks[id];
    motion.update(
      { ...h.input.presentation, frame: structuredClone(h.frame) },
      true,
      false,
    );
    h.frame.frameId += ':next';
    h.frame.sequence++;
    h.frame.interactive!.tick++;
    h.track.latest.position.longitudeDeg += 0.001;
    now = 200;
    motion.update(h.input.presentation, true, false);
    now = 300;
    const shown = motion
      .project(createScene(h.input.presentation, h.session))
      .objects.find((o) => o.trackId === h.track.id)!;
    expect(
      motion.sampleTrack(h.frame.frameId, h.track.id, h.track.latest.position),
    ).toEqual(shown.position);
    now = 5000;
    expect(
      motion.sampleTrack(h.frame.frameId, h.track.id, h.track.latest.position),
    ).toEqual(h.track.latest.position);
    motion.dispose();
  });
});
