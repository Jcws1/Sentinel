import { describe, expect, it } from 'vitest';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';
import {
  createCockpitPresentation,
  type CockpitInput,
} from '../../src/world/cockpit';
import { videoOverlayFrame } from '../../src/world/videoOverlay';
import {
  layoutVideoLabels,
  overlayWindowPoint,
} from '../../src/renderers/cesium/videoOverlayLayout';
import {
  readVideoOverlays,
  saveVideoOverlays,
  videoOverlaysKey,
} from '../../src/features/cockpit/presentation';

function setup() {
  const frame = validateFrame(structuredClone(demo)),
    session = initialSession(frame.mission.id);
  const input: CockpitInput = {
    presentation: { frame, status: 'current', mode: 'live' },
    session,
    connection: 'connected',
    authoring: false,
  };
  const owner = createCockpitPresentation();
  const id = Object.values(frame.entities).find((e) => e.label === 'F-01')!.id;
  owner.open(input, id);
  const state = owner.sync(input);
  const read = () => videoOverlayFrame(state, input.presentation, session);
  return { frame, session, input, owner, state, read, id };
}
describe('simulated video annotations', () => {
  it('excludes own subject, respects display filters and keeps exact displayed Track', () => {
    const h = setup();
    const initial = h.read()!;
    expect(initial.objects.length).toBeGreaterThan(0);
    expect(initial.objects.some((o) => o.ref.id === h.id)).toBe(false);
    h.session.filters.affiliations = ['unknown'];
    expect(h.read()!.objects.every((o) => o.affiliation === 'unknown')).toBe(
      true,
    );
    h.session.filters.sourceIds = ['no-such-source'];
    expect(h.read()!.objects).toEqual([]);
  });
  it.each(['unavailable', 'non-op', 'ended', 'stale', 'disconnected'] as const)(
    'hides annotations for %s',
    (phase) => {
      const h = setup();
      expect(
        videoOverlayFrame(
          { ...h.state, phase },
          h.input.presentation,
          h.session,
        ),
      ).toBeUndefined();
    },
  );
  it.each(['frame', 'recording', 'run', 'mission', 'seeking'] as const)(
    'fences a different %s',
    (change) => {
      const h = setup();
      if (change === 'frame') h.frame.frameId += 'other';
      if (change === 'recording') h.frame.recordingId += 'other';
      if (change === 'run') h.frame.interactive!.runId += 'other';
      if (change === 'mission') h.session.missionId = 'other';
      if (change === 'seeking') h.input.presentation.status = 'seeking';
      expect(h.read()).toBeUndefined();
    },
  );
  it('uses only the same recorded frame and leaves it unchanged', () => {
    const h = setup();
    h.input.presentation.mode = 'replay';
    const s = h.owner.sync(h.input),
      before = JSON.stringify(h.frame);
    const result = videoOverlayFrame(s, h.input.presentation, h.session)!;
    expect(result.frameId).toBe(h.frame.frameId);
    for (const o of result.objects)
      expect(o.position).toEqual(h.frame.tracks[o.trackId].latest.position);
    expect(JSON.stringify(h.frame)).toBe(before);
  });
  it('rejects unsupported altitudes and non-simulated sources without selecting alternatives', () => {
    const h = setup();
    const o = h.read()!.objects[0];
    for (const t of Object.values(h.frame.tracks).filter(
      (t) => t.entityId === o.ref.id,
    ))
      t.latest.position.altitude.reference = 'MSL';
    expect(h.read()!.objects.some((x) => x.ref.id === o.ref.id)).toBe(false);
    const another = h.read()!.objects[0];
    h.frame.tracks[another.trackId].source.mode = 'live';
    expect(h.read()!.objects.some((x) => x.ref.id === another.ref.id)).toBe(
      false,
    );
  });
  it('preserves condition labels and committed stale positions', () => {
    const h = setup();
    const o = h.read()!.objects[0];
    h.frame.entities[o.ref.id].condition = 'non-operational';
    const outcome = h.read()!.objects.find((x) => x.ref.id === o.ref.id)!;
    expect(outcome.unavailable).toBe('NON-OP');
    expect(outcome.position).toEqual(
      h.frame.tracks[outcome.trackId].latest.position,
    );
  });
  it('persists only explicit overlay choice and tolerates unavailable storage', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
    };
    expect(readVideoOverlays(storage)).toBe(true);
    expect(data.size).toBe(0);
    saveVideoOverlays(false, storage);
    expect(data.get(videoOverlaysKey)).toBe('false');
    expect(readVideoOverlays(storage)).toBe(false);
    expect(
      readVideoOverlays({
        getItem: () => {
          throw Error();
        },
        setItem: () => {
          throw Error();
        },
      }),
    ).toBe(true);
  });
});
describe('actual homogeneous camera clip coordinates', () => {
  it('maps centre and corners without clamping or offscreen arrows', () => {
    expect(overlayWindowPoint({ x: 0, y: 0, z: 0, w: 2 }, 800, 400)).toEqual({
      x: 400,
      y: 200,
    });
    expect(overlayWindowPoint({ x: -2, y: 2, z: 1, w: 2 }, 800, 400)).toEqual({
      x: 0,
      y: 0,
    });
  });
  it.each([
    { x: 3, y: 0, z: 0, w: 2 },
    { x: 0, y: -3, z: 0, w: 2 },
    { x: 0, y: 0, z: 3, w: 2 },
    { x: 0, y: 0, z: 0, w: -1 },
    { x: NaN, y: 0, z: 0, w: 1 },
  ])('culls unsupported/outside/behind %j', (p) =>
    expect(overlayWindowPoint(p, 800, 400)).toBeUndefined(),
  );
  it('limits dense labels, avoids overlaps and keeps short placement offsets', () => {
    const points = Array.from({ length: 32 }, (_, i) => ({
      id: String(i).padStart(2, '0'),
      x: 80 + i * 9,
      y: 150 + (i % 3) * 9,
      width: 80,
      secondaryWidth: 110,
      selected: i === 2,
    }));
    const labels = layoutVideoLabels(points, 440, 280, new Map());
    expect(labels.size).toBeGreaterThan(0);
    expect(labels.size).toBeLessThan(10);
    const all = [...labels.values()];
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i],
          b = all[j];
        expect(
          a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y,
        ).toBe(false);
      }
    expect(layoutVideoLabels(points, 440, 280, labels)).toEqual(labels);
  });
  it('keeps a valid label slot when a small pan makes the preferred slot available', () => {
    const p = {
      id: 'a',
      x: 120,
      y: 34,
      width: 80,
      secondaryWidth: 80,
      selected: true,
    };
    const first = layoutVideoLabels([p], 400, 300, new Map());
    const second = layoutVideoLabels([{ ...p, y: 35.2 }], 400, 300, first);
    expect(first.get('a')!.offsetY).toBe(8);
    expect(second.get('a')!.y - first.get('a')!.y).toBeCloseTo(1.2);
    // A resize that makes the retained slot invalid still relocates it into view.
    const resized = layoutVideoLabels([{ ...p, y: 60 }], 400, 80, second);
    expect(resized.get('a')!.y + resized.get('a')!.height).toBeLessThanOrEqual(
      75,
    );
  });
});
