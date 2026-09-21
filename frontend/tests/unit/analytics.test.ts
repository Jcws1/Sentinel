import { describe, expect, it, vi } from 'vitest';
import raw from '../../../contracts/sentinel/v1.16/fixture.world.json';
import { validateFrame } from '../../src/contracts/decode';
import { initialSession } from '../../src/state/sessionStore';
import type { RuntimeSnapshot } from '../../src/app/runtime';
import {
  createAnalyticProjection,
  projectCurrent,
  altitudeGroup,
  radialKm,
  missionOrigin,
  capturedOrigin,
  profilePoints,
} from '../../src/features/analytics/projections';
import { createAuditClient } from '../../src/services/auditClient';
import type { AuditPage, AuditQuery } from '../../src/contracts/generated';

function fixture() {
  const frame = validateFrame(structuredClone(raw));
  const session = initialSession(frame.mission.id);
  const state = {
    presentation: { frame, status: 'current', mode: 'live' },
    session,
  } as unknown as RuntimeSnapshot;
  return { frame, session, state };
}
describe('Command Picture authoritative projection', () => {
  it('mission observation totals retain unfiltered source arbitration', () => {
    const { state, frame, session } = fixture(),
      track = Object.values(frame.tracks)[0];
    const baseline = projectCurrent(state)!.missionObserved;
    frame.tracks.alternate = {
      ...structuredClone(track),
      id: 'alternate',
      state: 'stale',
      source: { ...track.source, id: 'older-source' },
    };
    frame.tracks.alternate.latest.timestamp = new Date(
      Date.parse(track.latest.timestamp) - 1000,
    ).toISOString();
    session.filters.sourceIds = ['older-source'];
    const p = projectCurrent(state)!;
    expect(p.visible).toHaveLength(1);
    expect(p.observed.stale).toBe(1);
    expect(p.missionObserved).toEqual(baseline);
  });
  it('counts entities once, separates mission totals and preserves unknown/unlocated/stale', () => {
    const { frame, session, state } = fixture(),
      tracks = Object.values(frame.tracks);
    const a = tracks[0],
      b = tracks[1];
    frame.tracks.alternate = { ...a, id: 'alternate' };
    frame.entities[a.entityId].presence = 'unobserved';
    delete frame.tracks[b.id];
    session.filters.search = frame.entities[b.entityId].label;
    const p = projectCurrent(state)!;
    expect(p.total).toBe(Object.keys(frame.entities).length);
    expect(p.visible).toHaveLength(1);
    expect(p.observed).toEqual({ current: 0, stale: 0, unlocated: 1 });
    expect(p.missionObserved.stale).toBe(1);
    expect(p.missionObserved.unlocated).toBe(1);
    expect(
      p.missionObserved.current +
        p.missionObserved.stale +
        p.missionObserved.unlocated,
    ).toBe(p.total);
  });
  it('never infers management from friendly affiliation or control from assets', () => {
    const { frame, state } = fixture();
    frame.assets = {};
    for (const e of Object.values(frame.entities)) e.affiliation = 'friendly';
    const p = projectCurrent(state)!;
    expect(p.affiliations).toEqual([['friendly', p.total]]);
    expect(p.assetTotal).toBe(0);
    expect(p.managedTotal).toBe(0);
    expect(p.controls).toBeUndefined();
    expect(p.assignments).toBeUndefined();
  });
  it('shares one projection across panes and ignores selection/camera changes', () => {
    const { state, session, frame } = fixture(),
      owner = createAnalyticProjection();
    const p = owner.get(state);
    expect(
      owner.get({
        ...state,
        session: {
          ...session,
          selection: { ...session.selection, revision: 4 },
        },
      }),
    ).toBe(p);
    expect(owner.diagnostics().computations).toBe(1);
    expect(
      owner.get({
        ...state,
        session: {
          ...session,
          filters: { ...session.filters, search: 'absent' },
        },
      })?.visible,
    ).toHaveLength(0);
    expect(
      owner.get({
        ...state,
        presentation: {
          ...state.presentation,
          frame: { ...frame, frameId: 'new', sequence: 1 },
        },
      })?.frame.frameId,
    ).toBe('new');
    expect(owner.diagnostics()).toEqual({ computations: 3, cachedFrames: 1 });
  });
  it('uses the supported non-default fixed mission reference and excludes foreign origins', () => {
    const { state, frame } = fixture();
    frame.mission.referencePoint = {
      longitudeDeg: 151.1772,
      latitudeDeg: -33.9461,
      altitude: { reference: 'ELLIPSOID', metres: 0 },
    };
    const origin = missionOrigin(frame)!;
    expect(origin.longitudeDeg).toBe(151.1772);
    expect(radialKm(origin, origin)).toBe(0);
    expect(
      radialKm(
        { longitudeDeg: 179.999, latitudeDeg: 0 },
        { longitudeDeg: -179.999, latitudeDeg: 0 },
      ),
    ).toBeCloseTo(0.22239, 4);
    expect(
      profilePoints(projectCurrent(state)!, {
        ...origin,
        missionId: 'foreign',
      }),
    ).toEqual([]);
  });
  it('preserves native altitude references and never uses the MSL visual approximation', () => {
    expect(
      altitudeGroup({ reference: 'AGL', metres: 10 }, 'source'),
    ).toBeUndefined();
    expect(
      altitudeGroup(
        { reference: 'ELLIPSOID', metres: 10, datumId: 'WGS-84' },
        'a',
      ),
    ).toBe('ELLIPSOID · WGS84');
    expect(
      altitudeGroup({ reference: 'MSL', metres: 10, datumId: 'EGM96' }, 'a'),
    ).toBe('MSL · datum EGM96');
    expect(
      altitudeGroup(
        {
          reference: 'MSL',
          metres: 10,
          datumId: 'unspecified datum · source one',
        },
        'a',
      ),
    ).not.toBe(altitudeGroup({ reference: 'MSL', metres: 10 }, 'one'));
    expect(altitudeGroup({ reference: 'MSL', metres: 10 }, 'a')).not.toBe(
      altitudeGroup({ reference: 'MSL', metres: 10 }, 'b'),
    );
    expect(
      altitudeGroup(
        { reference: 'ELLIPSOID', metres: 10, datumId: 'other' },
        'a',
      ),
    ).not.toBe('ELLIPSOID · WGS84');
  });
  it('captures a fixed reference with a no-future-history floor and refuses stale origins', () => {
    const { state } = fixture(),
      p = projectCurrent(state)!,
      row = p.visible.find((r) => r.track)!;
    const origin = capturedOrigin(p.frame, row)!;
    expect(origin.notBefore).toBe(row.track!.latest.timestamp);
    expect(
      capturedOrigin(p.frame, { ...row, observation: 'stale' }),
    ).toBeUndefined();
    const points = profilePoints(p, {
      ...origin,
      notBefore: '2099-01-01T00:00:00.000Z',
    });
    expect(points.every((p) => p.beforeOrigin)).toBe(true);
  });
});

const q: AuditQuery = {
  frameId: 'f',
  fromAt: '2026-09-10T00:00:00.000Z',
  toAt: '2026-09-10T00:00:00.000Z',
};
const data: AuditPage = {
  schemaVersion: '1.0',
  missionId: 'm',
  recordingId: 'r',
  frameId: 'f',
  throughSequence: 1,
  throughRecordedAt: q.toAt,
  sourceAt: q.toAt,
  fromAt: q.fromAt,
  toAt: q.toAt,
  receiptCeiling: 0,
  rows: [],
};
it('audit rejects late callbacks after mission/filter switches and hidden cleanup', async () => {
  const pending: { resolve: (r: Response) => void; signal: AbortSignal }[] = [];
  const client = createAuditClient(
    '/api',
    (_u, init) =>
      new Promise((resolve) =>
        pending.push({ resolve, signal: init!.signal as AbortSignal }),
      ),
  );
  const unsub = client.subscribe(() => {});
  const old = client.query('m', q);
  client.sync('other');
  expect(pending[0].signal.aborted).toBe(true);
  pending[0].resolve(new Response(JSON.stringify(data)));
  await old;
  expect(client.get().data).toBeUndefined();
  const filter = client.query('m', q);
  client.invalidate();
  pending[1].resolve(new Response(JSON.stringify(data)));
  await filter;
  expect(client.get().status).toBe('idle');
  const hidden = client.query('m', q);
  unsub();
  pending[2].resolve(new Response(JSON.stringify(data)));
  await hidden;
  expect(client.get().status).toBe('idle');
  expect(pending[2].signal.aborted).toBe(true);
});
it('audit validates anchor and times out even when a fetcher ignores abort', async () => {
  vi.useFakeTimers();
  let resolve!: (v: Response) => void;
  const client = createAuditClient(
    '/api',
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const job = client.query('m', q);
  await vi.advanceTimersByTimeAsync(10000);
  expect(client.get().error).toContain('timed out');
  resolve(new Response(JSON.stringify(data)));
  await job;
  expect(client.get().data).toBeUndefined();
  client.dispose();
  vi.useRealTimers();
  const invalid = createAuditClient(
    '/api',
    async () => new Response(JSON.stringify({ ...data, frameId: 'other' })),
  );
  await invalid.query('m', q);
  expect(invalid.get().error).toContain('anchor');
  invalid.dispose();
});
