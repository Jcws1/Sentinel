import { afterEach, expect, it, vi } from 'vitest';
import raw from '../../../contracts/sentinel/v1.7/fixture.world.json';
import { validateFrame } from '../../src/contracts/decode';
import type { ObservedHistory } from '../../src/contracts/generated';
import {
  createObservedHistory,
  historyFitsFrame,
} from '../../src/world/observedHistory';
import { observedSegments } from '../../src/world/observedSegments';
import { entityRows } from '../../src/world/entityRows';
import { initialSession } from '../../src/state/sessionStore';

const base = validateFrame(structuredClone(raw));
const track = Object.values(base.tracks)[0];
const frameAt = (seq: number) => ({
  ...base,
  sequence: seq,
  frameId: `progress-${seq}`,
  effectiveAt: new Date(Date.parse(base.effectiveAt) + seq * 200).toISOString(),
});
function result(seq: number): ObservedHistory {
  const f = frameAt(seq);
  return {
    schemaVersion: '1.0',
    missionId: f.mission.id,
    entityId: track.entityId,
    recordingId: f.recordingId,
    streamEpoch: f.streamEpoch,
    throughSequence: f.sequence,
    throughFrameId: f.frameId,
    throughAt: f.effectiveAt,
    fromAt: new Date(Date.parse(f.effectiveAt) - 60000).toISOString(),
    windowSeconds: 60,
    maxGapSeconds: 30,
    inspectedFrames: 1,
    truncated: false,
    segments: [
      {
        trackId: track.id,
        historySeriesId: track.historySeriesId,
        source: track.source,
        breakReason: 'window-start',
        points: [
          {
            frameId: f.frameId,
            sequence: seq,
            recordedAt: f.recordedAt,
            frameEffectiveAt: f.effectiveAt,
            sample: track.latest,
          },
        ],
      },
    ],
  };
}
afterEach(() => vi.useRealTimers());
it('makes bounded history progress at 5 Hz when each request takes 550 ms, without cancellation or future data', async () => {
  vi.useFakeTimers();
  let active = 0,
    maximum = 0,
    calls = 0,
    aborts = 0;
  const delivered: number[] = [];
  const cache = createObservedHistory(
    (_m, _e, frame, _w, signal) =>
      new Promise((resolve) => {
        active++;
        calls++;
        maximum = Math.max(maximum, active);
        signal.addEventListener('abort', () => aborts++);
        setTimeout(() => {
          active--;
          resolve(result(Number(frame.split('-')[1])));
        }, 550);
      }),
    () => {
      if (cache.get().data) delivered.push(cache.get().data!.throughSequence);
    },
  );
  for (let i = 0; i < 15; i++) {
    cache.sync(frameAt(i), track.entityId, true);
    await vi.advanceTimersByTimeAsync(200);
  }
  expect(delivered.length).toBeGreaterThan(3);
  expect(cache.get().status).toBe('ready');
  expect(cache.get().data!.throughSequence).toBeLessThanOrEqual(14);
  expect(maximum).toBe(1);
  expect(aborts).toBe(0);
  expect(calls).toBeLessThan(10);
  await vi.advanceTimersByTimeAsync(1200);
  expect(cache.get().data!.throughFrameId).toBe('progress-14');
  expect(cache.get().refreshing).not.toBe(true);
  cache.clear();
});
it('rejects future/foreign/backwards-time data and trims the current window without merging segment boundaries', () => {
  const h = result(0),
    frame = frameAt(5),
    filters = initialSession(frame.mission.id).filters;
  expect(historyFitsFrame(h, frame)).toBe(true);
  expect(
    historyFitsFrame(h, { ...frame, effectiveAt: '2026-09-09T00:00:00.000Z' }),
  ).toBe(false);
  expect(historyFitsFrame(h, { ...frame, streamEpoch: 'foreign' })).toBe(false);
  expect(
    historyFitsFrame(h, { ...frame, sequence: 0, frameId: 'conflicting' }),
  ).toBe(false);
  const row = entityRows(frame, filters).find(
    (r) => r.entity.id === track.entityId,
  )!;
  expect(observedSegments(frame, filters, row, h)).toHaveLength(1);
  const alternate = {
    ...track,
    id: 'other',
    source: { ...track.source, id: 'other' },
  };
  const alternateRow = { ...row, track: alternate };
  expect(
    observedSegments(
      frame,
      { ...filters, sourceIds: ['other'] },
      alternateRow,
      h,
    ),
  ).toEqual([]);
  expect(
    observedSegments(frame, filters, { ...row, visible: false }, h),
  ).toEqual([]);
});
