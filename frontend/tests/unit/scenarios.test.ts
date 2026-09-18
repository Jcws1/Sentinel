import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createScenarioClient,
  unitEditFields,
} from '../../src/services/scenarioClient';
import { createRuntime } from '../../src/app/runtime';
import { scenarioScene } from '../../src/world/scenarioDraft';
import { initialSession } from '../../src/state/sessionStore';
import {
  decodeScenarioWrite,
  decodeScenarioReceipt,
  decodeScenarioReview,
  withinScenarioExtent,
} from '../../src/contracts/scenarios';
import { validateFrame } from '../../src/contracts/decode';
import raw from '../../../contracts/sentinel/v1.11/demo.world.json';
import type {
  ScenarioContent,
  ScenarioReceipt,
  ScenarioRevision,
  ScenarioWrite,
} from '../../src/contracts/generated';

const content: ScenarioContent = {
  name: 'Harbour',
  units: [
    {
      id: 'a',
      label: 'Observer',
      category: 'friendly',
      commandRole: 'observation',
      position: {
        longitudeDeg: 103.85,
        latitudeDeg: 1.29,
        altitude: { metres: 172.25, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
      headingTrueDeg: 39.125,
    },
  ],
};
function revision(body: ScenarioWrite): ScenarioRevision {
  return {
    schemaVersion: '1.0',
    definitionId: 'definition-a',
    revision: body.expectedRevision + 1,
    contentHash: 'a'.repeat(64),
    createdAt: '2026-09-17T00:00:00.000Z',
    content: structuredClone(body.content),
  };
}
function accepted(body: ScenarioWrite): ScenarioReceipt {
  return {
    schemaVersion: '1.0',
    requestId: body.requestId,
    accepted: true,
    code: 'OK',
    message: 'Saved',
    result: revision(body),
  };
}
const response = (value: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(value), { status }));
const cleanup: (() => void)[] = [];
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  vi.useRealTimers();
});

it('persists the exact save before dispatch, restores after lost response, and retries one immutable request', async () => {
  let saved: ScenarioReceipt | undefined;
  const requests: ScenarioWrite[] = [];
  let drop = true;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as ScenarioWrite;
        expect(
          JSON.parse(sessionStorage.getItem('sentinel.scenario.pending.v1')!)
            .body,
        ).toEqual(body);
        requests.push(body);
        saved ??= accepted(body);
        if (drop) throw new Error('lost response');
        return new Response(JSON.stringify(saved));
      }
      if (String(input).includes('/creations?'))
        return new Response(JSON.stringify(saved));
      return new Response(
        JSON.stringify({
          schemaVersion: '1.0',
          scenarios: saved?.result ? [saved.result] : [],
        }),
      );
    },
  );
  const one = createScenarioClient({
    base: '/api',
    fetcher,
    publish: () => {},
  });
  one.enter();
  one.update(structuredClone(content));
  await one.save();
  expect(one.get().pending?.body).toEqual(requests[0]);
  one.update({ name: 'Must not replace pending content', units: [] });
  expect(one.get().draft).toEqual(content);
  one.dispose();
  const restored = createScenarioClient({
    base: '/api',
    fetcher,
    publish: () => {},
  });
  cleanup.push(restored.dispose);
  expect(restored.get().pending?.body).toEqual(requests[0]);
  drop = false;
  await restored.reconcile(true);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual(requests[0]);
  expect(restored.get().saved?.content).toEqual(content);
  expect(restored.get().pending).toBeUndefined();
  expect(sessionStorage.getItem('sentinel.scenario.pending.v1')).toBeNull();
});

it('retains local content and the prior revision on conflict; Save as new uses a new global identity', async () => {
  const requests: { url: string; body: ScenarioWrite }[] = [];
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (input, init) => {
      if (init?.method !== 'POST')
        return response({ schemaVersion: '1.0', scenarios: [] });
      const body = JSON.parse(String(init.body)) as ScenarioWrite;
      requests.push({ url: String(input), body });
      return response(
        requests.length === 2
          ? {
              schemaVersion: '1.0',
              requestId: body.requestId,
              accepted: false,
              code: 'REVISION_CONFLICT',
              message: 'Another author saved.',
            }
          : accepted(body),
      );
    },
  });
  cleanup.push(client.dispose);
  client.enter();
  client.update(structuredClone(content));
  await client.save();
  client.update({ ...structuredClone(content), name: 'My changes' });
  await client.save();
  expect(client.get().draft.name).toBe('My changes');
  expect(client.get().saved?.content.name).toBe('Harbour');
  expect(client.get().dirty).toBe(true);
  await client.save(true);
  expect(requests[2].url).toBe('/api/scenarios');
  expect(requests[2].body.expectedRevision).toBe(0);
  expect(new Set(requests.map((r) => r.body.requestId)).size).toBe(3);
});

it('rejects mismatched immutable receipts without clearing reconciliation evidence', async () => {
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (_input, init) => {
      if (init?.method !== 'POST')
        return response({ schemaVersion: '1.0', scenarios: [] });
      const body = JSON.parse(String(init.body)) as ScenarioWrite;
      const value = accepted(body);
      value.result!.content.name = 'Wrong content';
      return response(value);
    },
  });
  cleanup.push(client.dispose);
  client.enter();
  client.update(structuredClone(content));
  await client.save();
  expect(client.get().pending).toBeDefined();
  expect(client.get().saved).toBeUndefined();
});

it('a definition load finishing after navigation cannot restore authoring context over a live view', async () => {
  let resolve!: (r: Response) => void;
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: (input) =>
      String(input).endsWith('/definition-a')
        ? new Promise((yes) => {
            resolve = yes;
          })
        : response({ schemaVersion: '1.0', scenarios: [] }),
  });
  cleanup.push(client.dispose);
  client.enter();
  const load = client.load('definition-a');
  client.leave();
  resolve(
    new Response(
      JSON.stringify(
        revision({ content, requestId: 'load', expectedRevision: 0 }),
      ),
    ),
  );
  await load;
  expect(client.get().active).toBe(false);
  expect(client.get().saved?.content).toEqual(content);
});

it('storage corruption blocks new authoring mutations instead of replacing unknown request identities', async () => {
  sessionStorage.setItem('sentinel.scenario.pending.v1', '{broken');
  const fetcher = vi.fn();
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher,
  });
  cleanup.push(client.dispose);
  expect(client.get().blocked).toBe(true);
  await client.save();
  expect(fetcher).not.toHaveBeenCalled();
  expect(sessionStorage.getItem('sentinel.scenario.pending.v1')).toBe(
    '{broken',
  );
});

it('validates role, extent, identity, receipt evidence and run binding beyond JSON schema', () => {
  const body = {
    content: structuredClone(content),
    expectedRevision: 0,
    requestId: 'request',
  };
  expect(decodeScenarioWrite(body)).toEqual(body);
  body.content.units[0].category = 'hostile';
  body.content.units[0].commandRole = 'sentinel';
  expect(() => decodeScenarioWrite(body)).toThrow();
  expect(withinScenarioExtent(180, 90)).toBe(false);
  expect(withinScenarioExtent(NaN, 1.29)).toBe(false);
  expect(() =>
    decodeScenarioReceipt({
      schemaVersion: '1.0',
      requestId: 'r',
      accepted: false,
      code: 'OK',
      message: 'bad',
    }),
  ).toThrow();
  const frame = structuredClone(raw);
  expect(() =>
    validateFrame({
      ...frame,
      scenario: {
        definitionId: 'a',
        revision: 1,
        contentHash: 'a'.repeat(64),
        name: 'Bad',
        entityIds: { a: 'missing' },
      },
    }),
  ).toThrow(/scenario/);
});

it('the shared runtime authors without any operational frame, command or extra socket', async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ schemaVersion: '1.0', scenarios: [] })),
  );
  const createSocket = vi.fn(() => ({
    close: vi.fn(),
    onmessage: null,
    onclose: null,
    onerror: null,
  }));
  const runtime = createRuntime({ fetcher, createSocket });
  cleanup.push(runtime.dispose);
  runtime.enterAuthoring();
  for (const category of ['friendly', 'hostile', 'unknown'] as const) {
    runtime.armPlacement({ category });
    runtime.placeScenarioUnit(103.85, 1.29);
  }
  const state = runtime.getSnapshot();
  expect(state.scenario.draft.units).toHaveLength(3);
  expect(state.session.selection.primary?.kind).toBe('scenario-unit');
  expect(state.presentation.frame).toBeUndefined();
  expect(state.observed.status).toBe('idle');
  const scene = scenarioScene(state.scenario, state.session);
  expect(scene.context).toBe('authoring');
  expect(scene.frameId).toBeUndefined();
  expect(scene.objects).toHaveLength(3);
  expect(createSocket).not.toHaveBeenCalled();
  expect(
    fetcher.mock.calls.every(
      (c) =>
        !(c as unknown[])[1] ||
        ((c as unknown[])[1] as RequestInit).method !== 'POST',
    ),
  ).toBe(true);
  runtime.loadMission('another-mission');
  expect(runtime.getSnapshot().scenario.active).toBe(false);
  expect(runtime.getSnapshot().session.selection).toEqual(
    initialSession('another-mission').selection,
  );
  expect(createSocket).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot().scenario.draft.units).toHaveLength(3);
});

it('unapplied role and pose edits persist, block saves and retargeting, and apply only after validation', async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ schemaVersion: '1.0', scenarios: [] })),
  );
  const client = createScenarioClient({
    base: '/api',
    fetcher,
    publish: () => {},
  });
  client.enter();
  client.update(structuredClone(content));
  client.editUnit({
    ...unitEditFields(content.units[0]),
    commandRole: 'sentinel',
    heading: '400',
  });
  const calls = fetcher.mock.calls.length;
  await client.save();
  await client.load('anything');
  client.newDraft();
  client.arm({ category: 'hostile' });
  expect(fetcher.mock.calls).toHaveLength(calls);
  expect(client.get().draft).toEqual(content);
  expect(client.get().placement).toBeUndefined();
  client.dispose();
  const restored = createScenarioClient({
    base: '/api',
    fetcher,
    publish: () => {},
  });
  cleanup.push(restored.dispose);
  expect(restored.get().edit?.heading).toBe('400');
  restored.applyEdit();
  expect(restored.get().edit).toBeDefined();
  expect(restored.get().draft).toEqual(content);
  restored.enter();
  restored.editUnit({ ...restored.get().edit!, heading: '188.125' });
  restored.applyEdit();
  expect(restored.get().edit).toBeUndefined();
  expect(restored.get().draft.units[0].commandRole).toBe('sentinel');
  expect(restored.get().draft.units[0].headingTrueDeg).toBe(188.125);
  expect(restored.get().dirty).toBe(true);
  restored.editUnit({ ...unitEditFields(content.units[0]), heading: '' });
  restored.discardEdit();
  expect(restored.get().draft.units[0].headingTrueDeg).toBe(188.125);
});

it('a local draft-write failure after accepted save retains the request until reconciliation is durable', async () => {
  let fail = false;
  let receipt: ScenarioReceipt | undefined;
  const storage: Storage = {
    get length() {
      return sessionStorage.length;
    },
    key: (index) => sessionStorage.key(index),
    clear: () => sessionStorage.clear(),
    getItem: (key) => sessionStorage.getItem(key),
    removeItem: (key) => sessionStorage.removeItem(key),
    setItem: (key, value) => {
      if (fail && key === 'sentinel.scenario.draft.v1')
        throw new Error('quota');
      sessionStorage.setItem(key, value);
    },
  };
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        receipt = accepted(JSON.parse(String(init.body)));
        fail = true;
        return new Response(JSON.stringify(receipt));
      }
      return new Response(
        JSON.stringify(
          String(input).includes('/creations?')
            ? receipt
            : { schemaVersion: '1.0', scenarios: [] },
        ),
      );
    },
  );
  const client = createScenarioClient({
    base: '/api',
    fetcher,
    storage,
    publish: () => {},
  });
  client.enter();
  client.update(structuredClone(content));
  await client.save();
  expect(client.get().pending?.body.requestId).toBe(receipt?.requestId);
  expect(sessionStorage.getItem('sentinel.scenario.pending.v1')).not.toBeNull();
  client.dispose();
  fail = false;
  const restored = createScenarioClient({
    base: '/api',
    fetcher,
    storage,
    publish: () => {},
  });
  cleanup.push(restored.dispose);
  await restored.reconcile();
  expect(restored.get().saved).toEqual(receipt?.result);
  expect(restored.get().pending).toBeUndefined();
  expect(
    fetcher.mock.calls.filter(([, init]) => init?.method === 'POST'),
  ).toHaveLength(1);
});

function reviewFor(saved: ScenarioRevision) {
  return {
    schemaVersion: '1.4',
    boundaryCount: 0,
    actionCount: 0,
    scriptDurationMs: 0,
    reference: {
      definitionId: saved.definitionId,
      revision: saved.revision,
      contentHash: saved.contentHash,
    },
    name: saved.content.name,
    checkedAt: '2026-09-17T00:00:00.000Z',
    counts: {
      total: 1,
      friendly: 1,
      hostile: 0,
      unknown: 0,
      controlled: 0,
      observationOnly: 1,
    },
    motionPreset: {
      templateId: 'singapore-local-v2',
      modelId: 'local-horizontal-v1',
      speedMps: 155 / 3.6,
    },
    issues: [],
    canRun: true,
  };
}

it('Locate is consumed in the shared owner and stale acknowledgments cannot erase newer requests', () => {
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async () => response({ schemaVersion: '1.0', scenarios: [] }),
  });
  cleanup.push(client.dispose);
  client.enter();
  client.update(structuredClone(content));
  client.locate('a', 'tactical');
  const first = client.get().locate!;
  client.locate('a', 'three-d');
  const next = client.get().locate!;
  client.completeLocate(first.serial);
  expect(client.get().locate).toEqual(next);
  client.completeLocate(next.serial);
  expect(client.get().locate).toBeUndefined();
  client.locate('a', 'tactical');
  client.update(structuredClone(content));
  expect(client.get().locate).toBeUndefined();
  client.locate('a', 'tactical');
  client.leave();
  expect(client.get().locate).toBeUndefined();
});

it('review is pinned, invalidates on edits and ignores an obsolete reply after navigation', async () => {
  let saved!: ScenarioRevision;
  let resolveReview!: (value: Response) => void;
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (input, init) => {
      if (String(input).endsWith('/validate'))
        return new Promise<Response>((yes) => {
          resolveReview = yes;
        });
      if (init?.method === 'POST') {
        const receipt = accepted(JSON.parse(String(init.body)));
        saved = receipt.result!;
        return response(receipt);
      }
      return response({ schemaVersion: '1.0', scenarios: [] });
    },
  });
  cleanup.push(client.dispose);
  client.enter();
  client.update(structuredClone(content));
  await client.save();
  let validation = client.validate();
  resolveReview(new Response(JSON.stringify(reviewFor(saved))));
  await validation;
  expect(client.get().review?.canRun).toBe(true);
  client.editUnit({ ...unitEditFields(content.units[0]), heading: '28' });
  expect(client.get().review).toBeUndefined();
  client.discardEdit();
  validation = client.validate();
  client.leave();
  resolveReview(new Response(JSON.stringify(reviewFor(saved))));
  await validation;
  expect(client.get().review).toBeUndefined();
  expect(client.get().active).toBe(false);
  expect(client.get().reviewing).toBe(false);
});

it('mismatched or inconsistent validation evidence never enables Run', async () => {
  const saved = revision({ content, expectedRevision: 0, requestId: 'r' });
  const bad = reviewFor(saved);
  bad.counts.controlled = 1;
  expect(() => decodeScenarioReview(bad)).toThrow();
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (input, init) => {
      if (String(input).endsWith('/validate'))
        return response({
          ...reviewFor(saved),
          reference: { ...reviewFor(saved).reference, revision: 2 },
        });
      if (init?.method === 'POST')
        return response(accepted(JSON.parse(String(init.body))));
      return response({ schemaVersion: '1.0', scenarios: [] });
    },
  });
  cleanup.push(client.dispose);
  client.enter();
  client.update(structuredClone(content));
  await client.save();
  await client.validate();
  expect(client.get().review).toBeUndefined();
  expect(client.get().error).toContain('does not match');
});

it('Save as new remaps placement identities once and retries the identical copy after a lost response', async () => {
  const requests: ScenarioWrite[] = [];
  let copy: ScenarioReceipt | undefined;
  const client = createScenarioClient({
    base: '/api',
    publish: () => {},
    fetcher: async (_input, init) => {
      if (init?.method !== 'POST')
        return response({ schemaVersion: '1.0', scenarios: [] });
      const body = JSON.parse(String(init.body)) as ScenarioWrite;
      requests.push(body);
      if (requests.length === 1) return response(accepted(body));
      if (!copy) {
        copy = accepted(body);
        copy.result!.definitionId = 'definition-copy';
        throw new Error('lost copy response');
      }
      return response(copy);
    },
  });
  cleanup.push(client.dispose);
  client.enter();
  client.update(structuredClone(content));
  await client.save();
  const original = structuredClone(client.get().saved!);
  await client.save(true);
  expect(client.get().saved).toEqual(original);
  expect(client.get().draft.units[0].id).toBe('a');
  expect(requests[1].content.units[0].id).not.toBe('a');
  await client.reconcile(true);
  expect(requests[2]).toEqual(requests[1]);
  expect(client.get().saved?.definitionId).toBe('definition-copy');
  expect(client.get().draft.units[0]).toEqual({
    ...content.units[0],
    id: requests[1].content.units[0].id,
  });
  expect(original.content).toEqual(content);
});

it('numeric placement and duplicate use validated poses, new identities and one owning map without operational state', () => {
  const runtime = createRuntime({
    fetcher: async () =>
      new Response(JSON.stringify({ schemaVersion: '1.0', scenarios: [] })),
  });
  cleanup.push(runtime.dispose);
  runtime.enterAuthoring();
  runtime.armPlacement({ category: 'friendly', viewId: 'three-d' });
  expect(runtime.getSnapshot().scenario.placement?.viewId).toBe('three-d');
  expect(
    runtime.placeScenarioUnit(103.85, 1.29, {
      altitude: 199.25,
      heading: 35.5,
      commandRole: 'observation',
    }),
  ).toBe(true);
  const original = structuredClone(
    runtime.getSnapshot().scenario.draft.units[0],
  );
  runtime.armPlacement({
    category: 'friendly',
    duplicateId: original.id,
    viewId: 'tactical',
  });
  expect(runtime.placeScenarioUnit(103.85, 1.29)).toBe(false);
  expect(runtime.getSnapshot().scenario.draft.units).toHaveLength(1);
  expect(runtime.placeScenarioUnit(103.851, 1.291)).toBe(true);
  const duplicate = runtime.getSnapshot().scenario.draft.units[1];
  expect(duplicate.id).not.toBe(original.id);
  expect(duplicate.commandRole).toBe('observation');
  expect(duplicate.headingTrueDeg).toBe(original.headingTrueDeg);
  expect(duplicate.position.altitude).toEqual(original.position.altitude);
  expect(runtime.getSnapshot().scenario.draft.units[0]).toEqual(original);
  runtime.armPlacement({ category: 'hostile' });
  runtime.placeScenarioUnit(103.85, 1.29, {
    altitude: 150,
    heading: 0,
    commandRole: 'sentinel',
  });
  expect(runtime.getSnapshot().scenario.draft.units).toHaveLength(2);
  expect(runtime.getSnapshot().presentation.frame).toBeUndefined();
});
