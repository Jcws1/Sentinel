import { beforeEach, expect, it, vi } from 'vitest';
import remote from '../fixtures/scenario-location/remote.json';
import defaultContent from '../fixtures/scenario-location/default.json';
import legacyWorld from '../../../contracts/sentinel/v1.13/demo.world.json';
import { validateFrame } from '../../src/contracts/decode';
import forty from '../fixtures/scenario-location/remote-20v20.json';
import timings from '../fixtures/scenario-location/remote-timing.json';
import {
  decodeScenarioWrite,
  decodeScenarioRevision,
} from '../../src/contracts/scenarios';
import {
  insideExtent,
  locationGeometry,
  locationConflicts,
  operatingCorners,
  sameGeometry,
} from '../../src/world/localGeometry';
import { scriptPlan } from '../../src/world/scriptPlan';
import { createScenarioClient } from '../../src/services/scenarioClient';
import { scenarioScene } from '../../src/world/scenarioDraft';
import { initialSession } from '../../src/state/sessionStore';
import { translatedEndpoints } from '../../src/world/movement';
import type { ScenarioContent } from '../../src/contracts/generated';
import type { Fetcher } from '../../src/services/api';

const body = (content: unknown) => ({
  requestId: 'located-request',
  expectedRevision: 0,
  content,
});
beforeEach(() => sessionStorage.clear());
it('rejects new nullable geometry on historical world/run and scenario wire versions without altering valid bytes', () => {
  const bytes = JSON.stringify(legacyWorld);
  expect(validateFrame(legacyWorld).schemaVersion).toBe('1.10');
  const invalid = structuredClone(legacyWorld);
  Object.assign(invalid.interactive, { localGeometry: null });
  expect(() => validateFrame(invalid)).toThrow('Legacy runs');
  expect(JSON.stringify(legacyWorld)).toBe(bytes);
  const content = structuredClone(defaultContent) as Partial<
    typeof defaultContent
  >;
  delete content.localGeometry;
  const old = {
    schemaVersion: '1.4',
    definitionId: 'old',
    revision: 1,
    contentHash: 'a'.repeat(64),
    createdAt: '2026-09-19T00:00:00.000Z',
    content,
  };
  expect(decodeScenarioRevision(old).content.localGeometry).toBeUndefined();
  expect(() =>
    decodeScenarioRevision({
      ...old,
      content: { ...content, localGeometry: null },
    }),
  ).toThrow('Legacy scenario');
});
it('compares frozen geometry by values across JSON property ordering without mutating payloads', () => {
  const a = locationGeometry(151.1772, -33.9461);
  const b = {
    halfExtentMetres: 5000 as const,
    origin: { latitudeDeg: -33.9461, longitudeDeg: 151.1772 },
    modelId: 'local-horizontal-v2' as const,
  };
  const bytes = JSON.stringify(b);
  expect(
    sameGeometry({ interactive: { localGeometry: a } }, { localGeometry: b }),
  ).toBe(true);
  expect(sameGeometry(a, locationGeometry(151.1782, -33.9461))).toBe(false);
  expect(sameGeometry(undefined, a)).toBe(false);
  expect(sameGeometry(undefined, { localGeometry: null })).toBe(true);
  expect(JSON.stringify(b)).toBe(bytes);
});
it('matches backend nominal start/completion ticks at a remote latitude, including dependent return legs', () => {
  const content = decodeScenarioWrite(body(remote)).content;
  expect(
    scriptPlan(content).map((l) => ({
      id: l.action.id,
      state: l.state,
      consumedTick: l.startTick,
      terminalTick: l.endTick,
    })),
  ).toEqual(timings);
  expect(scriptPlan(decodeScenarioWrite(body(forty)).content)).toHaveLength(80);
});
it.each([
  [103.85, 1.29],
  [103.91, 1.36],
  [151.1772, -33.9461],
  [-0.1276, 51.5072],
  [0, 80],
  [0, -80],
])('uses inclusive square corners at %s / %s', (lon, lat) => {
  const geometry = locationGeometry(lon, lat);
  for (const [longitudeDeg, latitudeDeg] of operatingCorners(geometry)) {
    expect(
      insideExtent(
        {
          longitudeDeg: Number(longitudeDeg.toFixed(9)),
          latitudeDeg: Number(latitudeDeg.toFixed(9)),
        },
        geometry,
      ),
    ).toBe(true);
    expect(
      insideExtent(
        {
          longitudeDeg: longitudeDeg + Math.sign(longitudeDeg - lon) * 0.000001,
          latitudeDeg,
        },
        geometry,
      ),
    ).toBe(false);
  }
});
it.each([
  [180, 0],
  [-180, 0],
  [179.99, 80],
  [0, 80.001],
  [NaN, 0],
  [0, Infinity],
])('rejects unsupported footprints and invalid numbers', (lon, lat) => {
  expect(() => locationGeometry(lon, lat)).toThrow();
});
it('requires owning geometry, rejects legacy version smuggling and preserves explicit fields', () => {
  expect(decodeScenarioWrite(body(remote)).content).toEqual(remote);
  const absent = structuredClone(remote);
  delete (absent as Partial<typeof absent>).localGeometry;
  expect(() => decodeScenarioWrite(body(absent))).toThrow();
  const revision = {
    schemaVersion: '1.6',
    definitionId: 'remote',
    revision: 1,
    contentHash: 'a'.repeat(64),
    createdAt: '2026-09-19T00:00:00.000Z',
    content: remote,
  };
  expect(decodeScenarioRevision(revision).content.localGeometry).toEqual(
    remote.localGeometry,
  );
  expect(() =>
    decodeScenarioRevision({ ...revision, schemaVersion: '1.4' }),
  ).toThrow();
  expect(() =>
    decodeScenarioWrite(
      body({
        ...remote,
        localGeometry: {
          ...remote.localGeometry,
          modelId: 'local-horizontal-v3',
        },
      }),
    ),
  ).toThrow();
});
it('previews failures without mutation, cancels, and applies a fitting origin without relocating any content', () => {
  const client = createScenarioClient({
    base: '/api',
    fetcher: vi.fn(
      async () =>
        new Response(JSON.stringify({ schemaVersion: '1.5', scenarios: [] })),
    ),
    publish: vi.fn(),
  });
  client.enter();
  client.update(decodeScenarioWrite(body(remote)).content);
  const original = structuredClone(client.get().draft);
  client.beginLocation('tactical');
  client.pickLocation(0, 0, 'tactical');
  expect(client.get().draft).toEqual(original);
  expect(locationConflicts(original, locationGeometry(0, 0))).toHaveLength(
    original.units.length +
      original.actions!.length +
      original.boundaries!.length,
  );
  expect(client.applyLocation()).toBe(false);
  expect(client.get().draft).toEqual(original);
  client.cancelLocation();
  client.beginLocation();
  client.editLocation({
    longitude: String(remote.localGeometry.origin.longitudeDeg + 0.001),
  });
  expect(client.applyLocation()).toBe(true);
  const result = client.get().draft;
  expect(result.units).toEqual(original.units);
  expect(result.actions).toEqual(original.actions);
  expect(result.boundaries).toEqual(original.boundaries);
  expect(client.get().dirty).toBe(true);
  expect(client.get().review).toBeUndefined();
  const scene = scenarioScene(client.get(), initialSession());
  expect(scene.localHome!.center).toEqual(result.localGeometry!.origin);
  expect(scene.locationGuides).toHaveLength(1);
  expect(scene.zones).toHaveLength(2);
  client.dispose();
});
it('restores a preview without rearming map clicks and reconciles exact pending bytes before edits', async () => {
  const fetcher = vi.fn<Fetcher>(async () => {
    throw Error('lost response');
  });
  const client = createScenarioClient({
    base: '/api',
    fetcher,
    publish: vi.fn(),
  });
  client.enter();
  client.update(decodeScenarioWrite(body(remote)).content);
  client.beginLocation('tactical');
  client.editLocation({ longitude: '151.1782' });
  const restored = createScenarioClient({
    base: '/api',
    fetcher,
    publish: vi.fn(),
  });
  expect(restored.get().locationEdit?.longitude).toBe('151.1782');
  expect(restored.get().locationEdit?.viewId).toBeUndefined();
  restored.dispose();
  client.applyLocation();
  await client.save();
  const raw = sessionStorage.getItem('sentinel.scenario.pending.v1')!;
  const pending = createScenarioClient({
    base: '/api',
    fetcher,
    publish: vi.fn(),
  });
  expect(pending.beginLocation()).toBe(false);
  await pending.reconcile(true);
  expect(sessionStorage.getItem('sentinel.scenario.pending.v1')).toBe(raw);
  expect(
    fetcher.mock.calls
      .map((c) => (c[1] as RequestInit | undefined)?.body)
      .filter(Boolean)
      .at(-1),
  ).toBe(JSON.stringify(JSON.parse(raw).body));
  client.dispose();
  pending.dispose();
});
it('keeps group translation spacing and height at the owning latitude', () => {
  const content = remote as ScenarioContent;
  const origins = content.units.slice(0, 2).map((u) => u.position);
  const anchor = { longitudeDeg: 151.18, latitudeDeg: -33.95 };
  const result = translatedEndpoints(origins, anchor, content);
  expect(result[1].latitudeDeg - result[0].latitudeDeg).toBeCloseTo(
    origins[1].latitudeDeg - origins[0].latitudeDeg,
    8,
  );
  expect(result.map((p) => p.altitude)).toEqual(origins.map((p) => p.altitude));
  expect(result.every((p) => insideExtent(p, content))).toBe(true);
  expect(() => translatedEndpoints(origins, anchor)).toThrow();
});
