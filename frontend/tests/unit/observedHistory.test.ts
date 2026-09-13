import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../../../contracts/sentinel/v1/fixture.world.json';
import {
  decodeObservedHistory,
  validateFrame,
} from '../../src/contracts/decode';
import type { ObservedHistory } from '../../src/contracts/generated';
import { createObservedHistory } from '../../src/world/observedHistory';
import { immutableCopy } from '../../src/world/immutable';
import { createScene } from '../../src/renderers/scene';
import { initialSession } from '../../src/state/sessionStore';

function fixture() {
  const frame = validateFrame(structuredClone(raw));
  const track = Object.values(frame.tracks)[0];
  const history: ObservedHistory = {
    schemaVersion: '1.0',
    missionId: frame.mission.id,
    entityId: track.entityId,
    recordingId: frame.recordingId,
    streamEpoch: frame.streamEpoch,
    throughFrameId: frame.frameId,
    throughSequence: frame.sequence,
    throughAt: frame.effectiveAt,
    fromAt: new Date(Date.parse(frame.effectiveAt) - 60000).toISOString(),
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
            frameId: frame.frameId,
            sequence: frame.sequence,
            frameEffectiveAt: frame.effectiveAt,
            recordedAt: frame.recordedAt,
            sample: track.latest,
          },
        ],
      },
    ],
  };
  return { frame: immutableCopy(frame), history, entityId: track.entityId };
}
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
afterEach(() => vi.useRealTimers());

describe('shared bounded observed history', () => {
  it('deduplicates pane demand, freezes responses and reuses exact immutable anchors', async () => {
    const { frame, history, entityId } = fixture(),
      loader = vi.fn(async () => history),
      changed = vi.fn();
    const cache = createObservedHistory(loader, changed);
    for (let i = 0; i < 10; i++) cache.sync(frame, entityId, true);
    await flush();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cache.get().status).toBe('ready');
    expect(
      Object.isFrozen(cache.get().data?.segments[0].points[0].sample.position),
    ).toBe(true);
    history.segments.length = 0;
    expect(cache.get().data?.segments).toHaveLength(1);
    cache.sync(frame, undefined, true);
    cache.sync(frame, entityId, true);
    expect(loader).toHaveBeenCalledTimes(1);
    cache.clear();
  });
  it('isolates mission, selection and frame changes even when an obsolete response ignores abort', async () => {
    const { frame, history, entityId } = fixture();
    const requests: {
      resolve: (v: ObservedHistory) => void;
      signal: AbortSignal;
    }[] = [];
    const cache = createObservedHistory(
      (_m, _e, _f, _w, signal) =>
        new Promise((resolve) => requests.push({ resolve, signal })),
      () => {},
    );
    cache.sync(frame, entityId, true);
    cache.sync(frame, 'another-entity', true);
    expect(requests[0].signal.aborted).toBe(true);
    requests[0].resolve(history);
    await flush();
    expect(cache.get().status).toBe('loading');
    cache.sync(
      { ...frame, mission: { ...frame.mission, id: 'different' } },
      entityId,
      true,
    );
    requests[1].resolve({ ...history, entityId: 'another-entity' });
    await flush();
    expect(cache.get().data).toBeUndefined();
    cache.sync({ ...frame, frameId: 'new-frame' }, entityId, true);
    expect(requests[2].signal.aborted).toBe(true);
    cache.clear();
    requests[3].resolve({ ...history, throughFrameId: 'new-frame' });
    await flush();
    expect(cache.get().status).toBe('idle');
  });
  it('times out independently of abort support, rejects mismatched anchors and permits explicit recovery', async () => {
    vi.useFakeTimers();
    const { frame, history, entityId } = fixture();
    const loader = vi
      .fn()
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ ...history, throughSequence: 99 })
      .mockResolvedValueOnce(history);
    const changed = vi.fn(),
      cache = createObservedHistory(loader, changed, 100);
    cache.sync(frame, entityId, true);
    await vi.advanceTimersByTimeAsync(101);
    expect(cache.get().status).toBe('error');
    expect(cache.get().error).toContain('timed out');
    cache.retry();
    cache.sync(frame, entityId, true);
    await flush();
    expect(cache.get().error).toContain('anchor mismatch');
    cache.retry();
    cache.sync(frame, entityId, true);
    await flush();
    expect(cache.get().status).toBe('ready');
    cache.clear();
  });
  it('evicts old anchors after eight responses', async () => {
    const { frame, history, entityId } = fixture();
    const loader = vi.fn(async (_m, _e, f) => ({
      ...history,
      throughFrameId: f,
    }));
    const cache = createObservedHistory(loader, () => {});
    for (let i = 0; i < 9; i++) {
      cache.sync({ ...frame, frameId: `f${i}` }, entityId, true);
      await flush();
    }
    cache.sync({ ...frame, frameId: 'f1' }, entityId, true);
    expect(loader).toHaveBeenCalledTimes(9);
    cache.sync({ ...frame, frameId: 'f0' }, entityId, true);
    await flush();
    expect(loader).toHaveBeenCalledTimes(10);
    cache.clear();
  });
});

describe('runtime history contract and scene projection', () => {
  it('validates exact supplied samples and rejects future, duplicate, discontinuous or incompatible points', () => {
    const { history } = fixture();
    expect(decodeObservedHistory(history)).toBe(history);
    const cases: ((h: ObservedHistory) => void)[] = [
      (h) => {
        h.segments[0].points[0].sequence = 99;
      },
      (h) => {
        h.segments[0].points[0].sample.timestamp = '2026-02-30T00:00:00.000Z';
      },
      (h) => {
        h.segments.push(structuredClone(h.segments[0]));
      },
      (h) => {
        h.fromAt = h.throughAt;
      },
      (h) => {
        const p = structuredClone(h.segments[0].points[0]);
        p.sample.timestamp = new Date(
          Date.parse(p.sample.timestamp) - 1000,
        ).toISOString();
        h.segments[0].points.unshift(p);
        h.segments[0].points[1].sample.discontinuity = true;
      },
      (h) => {
        const p = structuredClone(h.segments[0].points[0]);
        p.sample.timestamp = new Date(
          Date.parse(p.sample.timestamp) - 1000,
        ).toISOString();
        p.sample.position.altitude.reference = 'AGL';
        h.segments[0].points.unshift(p);
      },
      (h) => {
        const p = structuredClone(h.segments[0].points[0]);
        p.sample.timestamp = new Date(
          Date.parse(p.sample.timestamp) - 31000,
        ).toISOString();
        h.segments[0].points.unshift(p);
      },
    ];
    for (const change of cases) {
      const corrupt = structuredClone(history);
      change(corrupt);
      expect(() => decodeObservedHistory(corrupt)).toThrow();
    }
  });
  it('draws only the selected visible displayed track at the exact presented frame without inventing samples', () => {
    const { frame, history, entityId } = fixture(),
      session = initialSession(frame.mission.id);
    session.selection.primary = { kind: 'entity', id: entityId };
    session.overlays.history = true;
    const observed = { status: 'ready' as const, data: immutableCopy(history) };
    const present = {
      status: 'current' as const,
      mode: 'live' as const,
      frame,
    };
    const scene = createScene(present, session, observed);
    expect(scene.paths).toHaveLength(1);
    expect(scene.paths?.[0].points).toEqual(observed.data.segments[0].points);
    session.filters.search = 'no-match';
    expect(createScene(present, session, observed).paths).toEqual([]);
    expect(createScene(present, session, observed).selection.status).toBe(
      'filtered',
    );
    session.filters.search = '';
    expect(
      createScene(present, session, {
        ...observed,
        data: { ...observed.data, throughFrameId: 'obsolete' },
      }).paths,
    ).toEqual([]);
  });
});
