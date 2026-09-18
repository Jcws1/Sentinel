import { expect, it } from 'vitest';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';
import { createMotionPresentation } from '../../src/world/motionPresentation';
import { createScene } from '../../src/renderers/scene';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';

function setup() {
  let now = 0;
  const motion = createMotionPresentation(() => now);
  const frame = validateFrame(structuredClone(demo));
  frame.interactive!.state = 'running';
  const track = frame.tracks[frame.interactive!.controls[0].controlTrackId!];
  for (const [id, t] of Object.entries(frame.tracks))
    if (t.entityId === track.entityId && id !== track.id)
      delete frame.tracks[id];
  track.latest.velocity = { speedMps: 40, headingTrueDeg: 90 };
  const presentation = () => ({
    frame,
    status: 'current' as const,
    mode: 'live' as const,
  });
  const feed = () =>
    motion.update(
      { ...presentation(), frame: structuredClone(frame) },
      true,
      false,
    );
  const scene = () =>
    motion.project(
      createScene(presentation(), initialSession(frame.mission.id)),
    );
  const advance = (ms = 200) => {
    now += ms;
    frame.frameId += `:${now}`;
    frame.sequence++;
    frame.interactive!.tick++;
    track.latest.position.longitudeDeg += 0.0001;
  };
  feed();
  return {
    motion,
    frame,
    track,
    feed,
    scene,
    advance,
    time: (v: number) => {
      now = v;
    },
  };
}
it('interpolates only displayed poses and leaves committed history inputs unchanged', () => {
  const h = setup(),
    start = h.track.latest.position.longitudeDeg;
  h.advance();
  h.feed();
  h.time(300);
  const committed = h.track.latest.position.longitudeDeg;
  const object = h.scene().objects.find((o) => o.trackId === h.track.id)!;
  expect(object.position.longitudeDeg).toBeCloseTo((start + committed) / 2, 9);
  expect(h.track.latest.position.longitudeDeg).toBe(committed);
  h.motion.dispose();
});
it.each([
  'pause',
  'disconnect',
  'replay',
  'non-op',
  'stale',
  'missing',
  'stop',
  'gap',
] as const)('clears old motion on %s', (kind) => {
  const h = setup();
  h.advance();
  h.feed();
  h.time(250);
  if (kind === 'pause') h.frame.interactive!.state = 'paused';
  if (kind === 'non-op')
    h.frame.entities[h.track.entityId].condition = 'non-operational';
  if (kind === 'stale') h.track.state = 'stale';
  if (kind === 'stop') h.track.latest.velocity!.speedMps = 0;
  if (kind === 'missing') delete h.frame.tracks[h.track.id];
  if (kind === 'gap') h.advance(2000);
  h.frame.frameId += ':terminal';
  h.motion.update(
    {
      frame: h.frame,
      status: 'current',
      mode: kind === 'replay' ? 'replay' : 'live',
    },
    kind !== 'disconnect',
    false,
  );
  const before = h.scene().objects.map((o) => o.position);
  h.time(10000);
  expect(h.scene().objects.map((o) => o.position)).toEqual(before);
  h.motion.dispose();
});
