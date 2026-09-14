import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import rawFixture from '../../../contracts/sentinel/v1.1/fixture.world.json';
import { createRuntime, type ApplicationRuntime } from '../../src/app/runtime';
import { decodeCatalog, validateFrame } from '../../src/contracts/decode';
import type { DeltaMessage, WorldFrame } from '../../src/contracts/types';
import type { StreamSocket } from '../../src/services/worldStream';
import { createHistoryCache } from '../../src/world/historyCache';
import { immutableCopy } from '../../src/world/immutable';
import { derivePresentation } from '../../src/world/presentation';
import { initialSession } from '../../src/state/sessionStore';

function frameAt(sequence = 0, missionId = 'fixture-alpha'): WorldFrame {
  const frame = validateFrame(
    JSON.parse(
      JSON.stringify(rawFixture).replaceAll('fixture-alpha', missionId),
    ),
  );
  frame.sequence = sequence;
  frame.frameId = `frame-${missionId}-${sequence}`;
  frame.effectiveAt = new Date(
    Date.parse(frame.effectiveAt) + sequence * 1000,
  ).toISOString();
  return frame;
}
function snapshot(frame: WorldFrame) {
  return {
    type: 'snapshot',
    schemaVersion: '1.1',
    missionId: frame.mission.id,
    streamEpoch: frame.streamEpoch,
    sequence: frame.sequence,
    frame,
  };
}
function deltaFrom(
  frame: WorldFrame,
  sequence = frame.sequence + 1,
): DeltaMessage {
  return {
    type: 'delta',
    schemaVersion: '1.1',
    missionId: frame.mission.id,
    streamEpoch: frame.streamEpoch,
    sequence,
    previousSequence: sequence - 1,
    frameId: `frame-${frame.mission.id}-${sequence}`,
    recordingId: frame.recordingId,
    effectiveAt: new Date(Date.parse(frame.effectiveAt) + 1000).toISOString(),
    recordedAt: frame.recordedAt,
    changes: {
      mission: frame.mission,
      entities: { upserts: {}, removes: [] },
      tracks: { upserts: {}, removes: [] },
      assets: { upserts: {}, removes: [] },
      sensors: { upserts: {}, removes: [] },
      zones: { upserts: {}, removes: [] },
      tasks: { upserts: {}, removes: [] },
      events: [],
    },
  };
}
class FakeSocket implements StreamSocket {
  onmessage: StreamSocket['onmessage'] = null;
  onerror: StreamSocket['onerror'] = null;
  onclose: StreamSocket['onclose'] = null;
  closed = false;
  close() {
    this.closed = true;
  }
  send(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const instances: ApplicationRuntime[] = [];
function setup(
  fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          fixtureAdvanceEnabled: true,
          missions: [frameAt().mission],
        }),
      ),
  ),
) {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const runtime = createRuntime({
    fetcher,
    pageUrl: 'http://localhost:5180/',
    reconnectDelayMs: 100,
    heartbeatTimeoutMs: 1000,
    requestTimeoutMs: 2000,
    createSocket: (url) => {
      const socket = new FakeSocket();
      sockets.push(socket);
      urls.push(url);
      return socket;
    },
  });
  instances.push(runtime);
  return { runtime, sockets, urls, fetcher };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const runtime of instances.splice(0)) runtime.dispose();
  vi.useRealTimers();
});

describe('one authoritative application subscription', () => {
  it('shares filter and overlay intent without replacing a committed frame or reconnecting', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    runtime.selectEntity('fixture-alpha-object-01');
    const committed = runtime.getPresentationFrame().frame;
    const sources = ['fixture-source'];
    runtime.setFilters({ sourceIds: sources, showUnobserved: false });
    runtime.setZonesVisible(false);
    sources.push('later-mutation');
    expect(runtime.getSnapshot().session.filters.sourceIds).toEqual([
      'fixture-source',
    ]);
    expect(runtime.getSnapshot().session.overlays.zones).toBe(false);
    expect(runtime.getSnapshot().session.selection.primary?.id).toBe(
      'fixture-alpha-object-01',
    );
    expect(runtime.getPresentationFrame().frame).toBe(committed);
    expect(sockets).toHaveLength(1);
    runtime.loadMission('fixture-bravo');
    expect(runtime.getSnapshot().session.overlays.zones).toBe(true);
    expect(runtime.getSnapshot().session.filters.sourceIds).toEqual([]);
  });

  it('does no network work until requested and shares one frame across arbitrarily many pane subscribers', () => {
    const { runtime, sockets, fetcher, urls } = setup();
    const callbacks = Array.from({ length: 8 }, () => vi.fn());
    const stop = callbacks.map((callback) => runtime.subscribe(callback));
    expect(sockets).toHaveLength(0);
    expect(fetcher).not.toHaveBeenCalled();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    expect(urls).toEqual([
      'ws://localhost:5180/api/missions/fixture-alpha/stream',
    ]);
    expect(runtime.getSnapshot().connection).toBe('connected');
    const frame = runtime.getPresentationFrame();
    expect(runtime.getPresentationFrame()).toBe(frame);
    runtime.loadMission('fixture-alpha');
    stop.forEach((dispose) => dispose());
    runtime.subscribe(() => {});
    expect(sockets).toHaveLength(1);
    expect(callbacks.every((callback) => callback.mock.calls.length >= 2)).toBe(
      true,
    );
  });

  it('publishes one complete delta after reference checks; source mutation cannot affect saved frames', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    const before = runtime.getPresentationFrame().frame!;
    const updates: number[][] = [];
    runtime.subscribe(() => {
      const frame = runtime.getPresentationFrame().frame!;
      updates.push([
        frame.sequence,
        Object.keys(frame.entities).length,
        Object.keys(frame.tracks).length,
      ]);
    });
    const next = deltaFrom(initial);
    const entity = {
      ...initial.entities['fixture-alpha-object-03'],
      id: 'new-entity',
    };
    const track = {
      ...initial.tracks['fixture-alpha-object-03-track'],
      id: 'new-track',
      entityId: 'new-entity',
    };
    next.changes.entities.upserts[entity.id] = entity;
    next.changes.tracks.upserts[track.id] = track;
    sockets[0].send(next);
    expect(updates).toEqual([[1, 4, 4]]);
    entity.label = 'mutated input';
    expect(
      runtime.getPresentationFrame().frame!.entities['new-entity'].label,
    ).not.toBe('mutated input');
    expect(before.sequence).toBe(0);
    expect(Object.keys(before.entities)).toHaveLength(3);
    expect(
      Object.isFrozen(before.entities['fixture-alpha-object-01'].provenance),
    ).toBe(true);
    expect(() => {
      (before.entities as unknown as Record<string, unknown>).new = {};
    }).toThrow();
  });

  it('ignores exact duplicates and delayed older messages without republishing', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    const first = deltaFrom(initial);
    sockets[0].send(first);
    const second = deltaFrom(frameAt(1));
    sockets[0].send(second);
    const listener = vi.fn();
    runtime.subscribe(listener);
    const frame = runtime.getPresentationFrame();
    sockets[0].send(second);
    sockets[0].send(first);
    expect(listener).not.toHaveBeenCalled();
    expect(runtime.getPresentationFrame()).toBe(frame);
    expect(runtime.getSnapshot().connection).toBe('connected');
  });

  it.each([
    'gap',
    'epoch',
    'conflicting-duplicate',
    'heartbeat-gap',
    'resync',
    'before-snapshot',
  ])('resnapshots on %s and never mixes partial state', (failure) => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    if (failure !== 'before-snapshot') sockets[0].send(snapshot(initial));
    let message: unknown = deltaFrom(initial);
    if (failure === 'gap') message = deltaFrom(initial, 3);
    if (failure === 'epoch')
      message = { ...deltaFrom(initial), streamEpoch: 'different-epoch' };
    if (failure === 'conflicting-duplicate')
      message = {
        ...deltaFrom(initial),
        sequence: 0,
        frameId: 'different-frame',
      };
    if (failure === 'heartbeat-gap')
      message = {
        type: 'heartbeat',
        schemaVersion: '1.1',
        missionId: initial.mission.id,
        streamEpoch: initial.streamEpoch,
        sequence: 9,
        serverTime: initial.recordedAt,
      };
    if (failure === 'resync')
      message = {
        type: 'resync-required',
        schemaVersion: '1.1',
        missionId: initial.mission.id,
        reason: 'slow-subscriber',
      };
    sockets[0].send(message);
    expect(sockets[0].closed).toBe(true);
    expect(runtime.getSnapshot().connection).toBe(
      failure === 'before-snapshot' ? 'disconnected' : 'stale',
    );
    expect(runtime.getPresentationFrame().frame?.sequence).toBe(
      failure === 'before-snapshot' ? undefined : 0,
    );
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(2);
    sockets[1].send(snapshot(frameAt(4)));
    expect(runtime.getSnapshot().connection).toBe('connected');
    expect(runtime.getPresentationFrame().frame?.sequence).toBe(4);
  });

  it('marks stream stalls and close failures stale; an explicit retry cleans timers and recovers', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    vi.advanceTimersByTime(1000);
    expect(runtime.getSnapshot().connection).toBe('stale');
    expect(runtime.getSnapshot().error).toContain('timed out');
    runtime.retry();
    sockets[1].send(snapshot(frameAt()));
    expect(runtime.getSnapshot().connection).toBe('connected');
    sockets[1].onclose?.();
    expect(runtime.getPresentationFrame().status).toBe('stale');
    runtime.unloadMission();
    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(2);
    expect(runtime.getPresentationFrame().status).toBe('empty');
  });

  it('valid heartbeats keep an unchanged fixture current without mutating wall/mission time', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    const frame = runtime.getPresentationFrame();
    for (let count = 0; count < 4; count++) {
      vi.advanceTimersByTime(900);
      sockets[0].send({
        type: 'heartbeat',
        schemaVersion: '1.1',
        missionId: initial.mission.id,
        streamEpoch: initial.streamEpoch,
        sequence: initial.sequence,
        serverTime: initial.recordedAt,
      });
    }
    expect(runtime.getPresentationFrame()).toBe(frame);
    expect(runtime.getSnapshot().session.time).toEqual({
      mode: 'live',
      followLatest: true,
    });
    expect(sockets).toHaveLength(1);
  });

  it('isolates mission switches from late socket callbacks and clears only mission-specific context', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    runtime.selectEntity('fixture-alpha-object-01');
    const late = sockets[0].onmessage!;
    runtime.loadMission('fixture-bravo');
    expect(runtime.getPresentationFrame().frame).toBeUndefined();
    expect(runtime.getSnapshot().session.selection.items).toEqual([]);
    late({ data: JSON.stringify(snapshot(frameAt(9))) });
    expect(runtime.getPresentationFrame().frame).toBeUndefined();
    sockets[1].send(snapshot(frameAt(0, 'fixture-bravo')));
    expect(runtime.getPresentationFrame().frame?.mission.id).toBe(
      'fixture-bravo',
    );
    expect(sockets.filter((socket) => !socket.closed)).toHaveLength(1);
  });

  it('keeps a removed selection as an unavailable reference, rather than silently clearing it', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    runtime.selectEntity('fixture-alpha-object-03');
    const next = deltaFrom(initial);
    next.changes.entities.removes = ['fixture-alpha-object-03'];
    next.changes.tracks.removes = ['fixture-alpha-object-03-track'];
    sockets[0].send(next);
    expect(runtime.getSnapshot().session.selection.primary?.id).toBe(
      'fixture-alpha-object-03',
    );
    expect(
      runtime.getPresentationFrame().frame?.entities['fixture-alpha-object-03'],
    ).toBeUndefined();
    runtime.selectEntity();
    expect(runtime.getSnapshot().session.selection.items).toEqual([]);
  });

  it('rejects invalid aggregate deltas atomically and leaves the last committed frame visibly stale', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    const original = runtime.getPresentationFrame().frame;
    const next = deltaFrom(initial);
    next.changes.entities.removes = ['fixture-alpha-object-01'];
    sockets[0].send(next);
    expect(runtime.getPresentationFrame().frame).toBe(original);
    expect(runtime.getPresentationFrame().status).toBe('stale');
    expect(runtime.getSnapshot().error).toContain('Dangling');
  });

  it.each(['json', 'version', 'mission', 'calendar'])(
    'rejects malformed %s stream data before publication',
    (kind) => {
      const { runtime, sockets } = setup();
      runtime.loadMission('fixture-alpha');
      sockets[0].send(snapshot(frameAt()));
      const original = runtime.getPresentationFrame().frame;
      const invalid = snapshot(frameAt(1));
      if (kind === 'version') invalid.schemaVersion = '2.0';
      if (kind === 'mission') invalid.missionId = 'another-mission';
      if (kind === 'calendar')
        invalid.frame.effectiveAt = '2026-02-30T00:00:00.000Z';
      sockets[0].onmessage?.({
        data: kind === 'json' ? '{ malformed' : JSON.stringify(invalid),
      });
      expect(runtime.getPresentationFrame().frame).toBe(original);
      expect(runtime.getPresentationFrame().status).toBe('stale');
    },
  );

  it('checks all delta events before truncation and enforces recording identity/time', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    const next = deltaFrom(initial);
    next.changes.events = Array.from({ length: 101 }, (_, index) => ({
      ...initial.recentEvents[0],
      id: `appended-${index}`,
      sequence: index + 1,
      missionId: index === 0 ? 'wrong-mission' : initial.mission.id,
    }));
    sockets[0].send(next);
    expect(runtime.getPresentationFrame().status).toBe('stale');
    expect(runtime.getSnapshot().error).toContain('Event belongs');
    runtime.retry();
    sockets[1].send(snapshot(initial));
    const reused = deltaFrom(initial);
    reused.frameId = initial.frameId;
    sockets[1].send(reused);
    expect(runtime.getSnapshot().error).toContain('reused a frame');
  });

  it('treats opaque prototype-like IDs as ordinary own keys without prototype mutation', () => {
    const { runtime, sockets } = setup();
    runtime.loadMission('fixture-alpha');
    const initial = frameAt();
    sockets[0].send(snapshot(initial));
    const next = deltaFrom(initial);
    next.changes.entities.upserts = JSON.parse(
      JSON.stringify({
        constructor: {
          ...initial.entities['fixture-alpha-object-01'],
          id: 'constructor',
        },
      }),
    );
    Object.defineProperty(next.changes.entities.upserts, '__proto__', {
      enumerable: true,
      value: {
        ...initial.entities['fixture-alpha-object-01'],
        id: '__proto__',
      },
    });
    sockets[0].send(next);
    const entities = runtime.getPresentationFrame().frame!.entities;
    expect(Object.getPrototypeOf(entities)).toBeNull();
    expect(Object.hasOwn(entities, '__proto__')).toBe(true);
    expect(entities['constructor'].id).toBe('constructor');
    runtime.selectEntity('__proto__');
    expect(runtime.getSnapshot().session.selection.primary?.id).toBe(
      '__proto__',
    );
    expect(Object.prototype).not.toHaveProperty('id');
  });

  it('does not trust fixture REST acknowledgements as world updates and prevents overlapping requests', async () => {
    const pending = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: '1.0',
            fixtureAdvanceEnabled: true,
            missions: [frameAt().mission],
          }),
        ),
      )
      .mockReturnValueOnce(pending.promise);
    const { runtime, sockets } = setup(fetcher);
    await runtime.loadMissions();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    const first = runtime.advanceFixture();
    const second = runtime.advanceFixture();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().advancing).toBe(true);
    pending.resolve(new Response(JSON.stringify(frameAt(1))));
    await Promise.all([first, second]);
    expect(runtime.getPresentationFrame().frame?.sequence).toBe(0);
    expect(runtime.getSnapshot().advancing).toBe(false);
    sockets[0].send(deltaFrom(frameAt()));
    expect(runtime.getPresentationFrame().frame?.sequence).toBe(1);
  });

  it('ignores delayed catalog and fixture responses after mission switch and disposal', async () => {
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    const { runtime, sockets } = setup(fetcher);
    const loading = runtime.loadMissions();
    runtime.loadMission('fixture-bravo');
    pending.resolve(
      new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          fixtureAdvanceEnabled: true,
          missions: [frameAt().mission],
        }),
      ),
    );
    await loading;
    expect(runtime.getSnapshot().catalog.status).toBe('idle');
    const late = sockets[0].onmessage!;
    runtime.dispose();
    late({ data: JSON.stringify(snapshot(frameAt(0, 'fixture-bravo'))) });
    vi.advanceTimersByTime(10_000);
    expect(sockets[0].closed).toBe(true);
    expect(runtime.getPresentationFrame().frame).toBeUndefined();
    expect(sockets).toHaveLength(1);
  });

  it('exposes failed catalog/fixture requests and never advances a backend without fixture capability', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 503 }));
    const { runtime, sockets } = setup(fetcher);
    await runtime.loadMissions();
    expect(runtime.getSnapshot().catalog.status).toBe('error');
    expect(runtime.getSnapshot().catalog.error).toContain('503');
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    await runtime.advanceFixture();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('cancels old fixture requests on mission switch without contaminating the new mission', async () => {
    const pending = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: '1.0',
            fixtureAdvanceEnabled: true,
            missions: [frameAt().mission],
          }),
        ),
      )
      .mockReturnValueOnce(pending.promise);
    const { runtime, sockets } = setup(fetcher);
    await runtime.loadMissions();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    const advancing = runtime.advanceFixture();
    runtime.loadMission('fixture-bravo');
    sockets[1].send(snapshot(frameAt(0, 'fixture-bravo')));
    pending.reject(new Error('Old backend request failed'));
    await advancing;
    expect(runtime.getSnapshot().advanceError).toBeUndefined();
    expect(runtime.getSnapshot().advancing).toBe(false);
    expect(runtime.getPresentationFrame().frame?.mission.id).toBe(
      'fixture-bravo',
    );
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
  });

  it('rejects late timed-out catalog results even if an injected fetch ignores abort', async () => {
    const pending = deferred<Response>();
    const { runtime } = setup(vi.fn(() => pending.promise));
    const loading = runtime.loadMissions();
    vi.advanceTimersByTime(2000);
    pending.resolve(
      new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          fixtureAdvanceEnabled: true,
          missions: [frameAt().mission],
        }),
      ),
    );
    await loading;
    expect(runtime.getSnapshot().catalog.status).toBe('error');
    expect(runtime.getSnapshot().catalog.error).toContain('timed out');
  });

  it('retry reconciles an uncertain fixture request by resnapshot without resubmitting it', async () => {
    const pending = deferred<Response>();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: '1.0',
            fixtureAdvanceEnabled: true,
            missions: [frameAt().mission],
          }),
        ),
      )
      .mockReturnValueOnce(pending.promise);
    const { runtime, sockets } = setup(fetcher);
    await runtime.loadMissions();
    runtime.loadMission('fixture-alpha');
    sockets[0].send(snapshot(frameAt()));
    const advancing = runtime.advanceFixture();
    runtime.retry();
    sockets[1].send(snapshot(frameAt(1)));
    pending.reject(new Error('The aborted request response arrived late'));
    await advancing;
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(runtime.getSnapshot().advanceError).toBeUndefined();
    expect(runtime.getSnapshot().advancing).toBe(false);
    expect(runtime.getPresentationFrame().frame?.sequence).toBe(1);
  });
});

describe('boundary and recording representation', () => {
  it.each([
    [
      'invalid calendar',
      (frame: WorldFrame) => {
        frame.effectiveAt = '2026-02-30T00:00:00.000Z';
      },
    ],
    [
      'key/ID mismatch',
      (frame: WorldFrame) => {
        frame.entities['fixture-alpha-object-01'].id = 'wrong';
      },
    ],
    [
      'mission membership',
      (frame: WorldFrame) => {
        frame.entities['fixture-alpha-object-01'].missionId = 'another';
      },
    ],
    [
      'dangling reference',
      (frame: WorldFrame) => {
        frame.tracks['fixture-alpha-object-01-track'].entityId = 'missing';
      },
    ],
    [
      'unsafe sequence',
      (frame: WorldFrame) => {
        frame.sequence = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'invalid altitude',
      (frame: WorldFrame) => {
        frame.tracks[
          'fixture-alpha-object-01-track'
        ].latest.position.altitude.metres = Infinity;
      },
    ],
    [
      'unknown domain field',
      (frame: WorldFrame) => {
        Object.assign(frame.entities['fixture-alpha-object-01'], {
          health: 100,
        });
      },
    ],
    [
      'event order',
      (frame: WorldFrame) => {
        frame.recentEvents.push({ ...frame.recentEvents[0], id: 'event-two' });
      },
    ],
  ] as const)('rejects %s at runtime', (_label, mutate) => {
    const frame = frameAt();
    mutate(frame);
    expect(() => validateFrame(frame)).toThrow();
  });

  it('validates paired assignments, geometry and altitude reference consistency', () => {
    const frame = frameAt();
    const provenance = frame.entities['fixture-alpha-object-01'].provenance;
    frame.tasks.task = {
      id: 'task',
      missionId: frame.mission.id,
      type: 'inspection',
      status: 'proposed',
      assetIds: ['fixture-alpha-resource-01'],
      subjectEntityIds: [],
      zoneIds: [],
      provenance,
    };
    expect(() => validateFrame(frame)).toThrow(/associations/);
    frame.assets['fixture-alpha-resource-01'].taskIds = ['task'];
    expect(() => validateFrame(frame)).not.toThrow();
    frame.zones.zone = {
      id: 'zone',
      missionId: frame.mission.id,
      label: 'Fixture bounds',
      purpose: 'test',
      provenance,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
      altitudeBand: {
        lower: { metres: 0, reference: 'MSL' },
        upper: { metres: 100, reference: 'ELLIPSOID' },
      },
    };
    expect(() => validateFrame(frame)).toThrow(/Altitude band/);
    frame.zones.zone.altitudeBand!.upper.reference = 'MSL';
    expect(() => validateFrame(frame)).not.toThrow();
    frame.zones.zone.geometry.coordinates[0][4] = [1, 0];
    expect(() => validateFrame(frame)).toThrow(/closed/);
  });

  it('allows event sequence independent of frame sequence and rejects duplicate catalog mission IDs', () => {
    const frame = frameAt();
    frame.recentEvents[0].sequence = 900;
    expect(() => validateFrame(frame)).not.toThrow();
    expect(() =>
      decodeCatalog({
        schemaVersion: '1.0',
        fixtureAdvanceEnabled: false,
        missions: [frame.mission, frame.mission],
      }),
    ).toThrow(/Duplicate mission/);
  });

  it('keeps bounded historical entries and live frames separate, choosing only complete frames', () => {
    const historical = createHistoryCache(2);
    const first = frameAt();
    historical.put(first);
    first.entities['fixture-alpha-object-01'].label = 'later mutation';
    const live = immutableCopy(frameAt(3));
    const session = initialSession('fixture-alpha');
    expect(
      derivePresentation({ connection: 'connected', live }, session, historical)
        .frame,
    ).toBe(live);
    session.time = {
      mode: 'replay',
      recordingId: first.recordingId,
      requestedAt: first.effectiveAt,
      resolvedFrameId: first.frameId,
      seekGeneration: 1,
      playing: false,
      rate: 1,
    };
    const presentation = derivePresentation(
      { connection: 'connected', live },
      session,
      historical,
    );
    expect(presentation.frame?.sequence).toBe(0);
    expect(
      presentation.frame?.entities['fixture-alpha-object-01'].label,
    ).not.toBe('later mutation');
    expect(live.sequence).toBe(3);
    historical.put(frameAt(1));
    historical.put(frameAt(2));
    expect(historical.size).toBe(2);
    expect(
      derivePresentation({ connection: 'connected', live }, session, historical)
        .status,
    ).toBe('seeking');
    session.missionId = 'fixture-bravo';
    expect(
      derivePresentation({ connection: 'connected', live }, session, historical)
        .frame,
    ).toBeUndefined();
  });
});
