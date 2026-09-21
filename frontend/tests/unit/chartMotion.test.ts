import { expect, it, vi } from 'vitest';
import { createChartMotion } from '../../src/features/analytics/chartMotion';

function fixture() {
  let next = 0,
    now = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const owner = {
    performance: { now: () => now } as Performance,
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      pending.set(++next, callback);
      return next;
    },
    cancelAnimationFrame: (id: number) => {
      pending.delete(id);
    },
  };
  const paint = vi.fn(),
    motion = createChartMotion(owner, paint);
  const tick = (at: number, timestamp = at) => {
    now = at;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach((callback) => callback(timestamp));
  };
  return { motion, paint, pending, tick };
}

it.each([144, 120, 60])(
  'sustains the chart scheduling target on a %i Hz display without duplicate paints',
  (hz) => {
    const { motion, paint, pending, tick } = fixture();
    for (let i = 0; i <= hz; i++) {
      motion.update();
      motion.update(); // Shared subscribers can notify more than once in a frame.
      expect(pending.size).toBe(1);
      tick((i * 1000) / hz);
      motion.update(); // Another notification after this frame's paint.
      expect(pending.size).toBe(1);
    }
    for (let i = hz + 1; i <= hz + 4; i++) tick((i * 1000) / hz);
    const times = paint.mock.calls.map(([at]) => at as number);
    const firstSecond = times.filter((at) => at < 1000);
    expect(firstSecond.length).toBeGreaterThanOrEqual(Math.min(hz, 120) - 1);
    expect(firstSecond.length).toBeLessThanOrEqual(Math.min(hz, 120) + 1);
    expect(new Set(times).size).toBe(times.length);
    expect(times.at(-1)).toBeGreaterThanOrEqual(1000);
    expect(pending.size).toBe(0);
    const settled = paint.mock.calls.length;
    tick(2000);
    expect(paint).toHaveBeenCalledTimes(settled);
  },
);

it('samples the actual owner clock for a trailing paint, not the older rAF or request timestamp', () => {
  const { motion, paint, tick, pending } = fixture();
  motion.update();
  tick(0);
  motion.update();
  tick(7, 6);
  expect(paint.mock.calls).toEqual([[0]]);
  tick(14, 12);
  expect(paint.mock.calls).toEqual([[0], [14]]);
  expect(pending.size).toBe(0);
});

it('skips missed deadlines after a long stall without catch-up paints', () => {
  const { motion, paint, tick, pending } = fixture();
  motion.update();
  tick(0);
  motion.update();
  tick(5005);
  expect(paint.mock.calls).toEqual([[0], [5005]]);
  expect(pending.size).toBe(0);
  motion.update();
  tick(5006);
  expect(paint).toHaveBeenCalledTimes(2);
  tick(5012);
  expect(paint.mock.calls).toEqual([[0], [5005], [5012]]);
  expect(pending.size).toBe(0);
});

it('rejects queued old-projection callbacks after reset and disposal', () => {
  const { motion, paint, pending, tick } = fixture();
  motion.update();
  tick(0);
  motion.update();
  const late = [...pending.values()][0];
  motion.reset();
  late(20);
  expect(paint.mock.calls).toEqual([[0]]);
  motion.update();
  tick(7);
  expect(paint.mock.calls).toEqual([[0], [7]]);
  motion.update();
  const afterDispose = [...pending.values()][0];
  motion.dispose();
  afterDispose(30);
  motion.update();
  tick(50);
  expect(pending.size).toBe(0);
  expect(paint.mock.calls).toEqual([[0], [7]]);
});
