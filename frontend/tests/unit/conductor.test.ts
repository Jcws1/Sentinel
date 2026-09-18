import { beforeEach, afterEach, expect, it } from 'vitest';
import {
  createScenarioClient,
  orderedActions,
} from '../../src/services/scenarioClient';
import {
  decodeScenarioRevision,
  decodeScenarioWrite,
} from '../../src/contracts/scenarios';
import { scenarioScene } from '../../src/world/scenarioDraft';
import { initialSession } from '../../src/state/sessionStore';
import type {
  ScenarioContent,
  ScenarioWrite,
  ScenarioReceipt,
  ScenarioRevision,
} from '../../src/contracts/generated';

const content: ScenarioContent = {
  name: 'D3 script',
  units: [
    {
      id: 'friendly',
      label: 'F-01',
      category: 'friendly',
      commandRole: 'sentinel',
      position: {
        longitudeDeg: 103.85,
        latitudeDeg: 1.29,
        altitude: { metres: 217.125, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
      headingTrueDeg: 37,
    },
    {
      id: 'observer',
      label: 'Observer',
      category: 'friendly',
      commandRole: 'observation',
      position: {
        longitudeDeg: 103.851,
        latitudeDeg: 1.29,
        altitude: { metres: 231.125, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
      headingTrueDeg: 12,
    },
    {
      id: 'hostile',
      label: 'H-01',
      category: 'hostile',
      commandRole: 'observation',
      position: {
        longitudeDeg: 103.852,
        latitudeDeg: 1.29,
        altitude: { metres: 198, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
      headingTrueDeg: 0,
    },
    {
      id: 'unknown',
      label: 'U-01',
      category: 'unknown',
      commandRole: 'observation',
      position: {
        longitudeDeg: 103.853,
        latitudeDeg: 1.29,
        altitude: { metres: 150, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
      headingTrueDeg: 0,
    },
  ],
};
const clients: ReturnType<typeof createScenarioClient>[] = [];
beforeEach(() => sessionStorage.clear());
afterEach(() => clients.splice(0).forEach((c) => c.dispose()));
function client(
  fetcher: Parameters<typeof createScenarioClient>[0]['fetcher'] = async () =>
    Response.json({ schemaVersion: '1.2', scenarios: [] }),
) {
  const c = createScenarioClient({
    base: '/api',
    fetcher,
    storage: sessionStorage,
    publish: () => {},
  });
  clients.push(c);
  c.enter();
  return c;
}
function action(
  c: ReturnType<typeof client>,
  unitId = 'friendly',
  seconds = '0',
) {
  c.beginAction();
  c.editAction({ unitId, seconds, longitude: '103.86', latitude: '1.295' });
  expect(c.applyAction()).toBe(true);
}
it('snaps time visibly, protects the draft and preserves map-pick edits through reload', () => {
  const c = client();
  c.update(structuredClone(content));
  c.beginAction();
  c.editAction({
    seconds: '1.31',
    longitude: '103.859123456',
    latitude: '1.292345678',
  });
  c.snapActionTime();
  expect(c.get().actionEdit?.seconds).toBe('1.4');
  c.arm({ category: 'hostile', viewId: 'tactical' });
  expect(c.get().placement).toBeUndefined();
  c.beginBoundary('tactical');
  expect(c.get().boundaryEdit).toBeUndefined();
  c.update({ name: 'discard illegally', units: [] });
  expect(c.get().draft).toEqual(content);
  c.armAction('three-d');
  expect(c.actionDestination(103.86, 1.29, 'tactical')).toBe(false);
  const preview = scenarioScene(c.get(), initialSession());
  expect(preview.destinations?.[0].position.altitude.metres).toBe(217.125);
  expect(preview.destinations?.[0].intentOrigin).toEqual(
    content.units[0].position,
  );
  c.dispose();
  const reloaded = client();
  expect(reloaded.get().actionEdit?.seconds).toBe('1.4');
  expect(reloaded.get().actionEdit?.viewId).toBeUndefined();
  reloaded.armAction('tactical');
  expect(reloaded.actionDestination(103.858, 1.294, 'tactical')).toBe(true);
  expect(reloaded.get().actionEdit?.viewId).toBeUndefined();
  expect(reloaded.applyAction()).toBe(true);
  expect(reloaded.get().draft.actions?.[0]).toMatchObject({
    offsetMs: 1400,
    destination: { longitudeDeg: 103.858, latitudeDeg: 1.294 },
  });
});
it('rejects duplicate actor ticks, Unknown motion and dangling references without replacing valid edits', () => {
  const c = client();
  c.update(structuredClone(content));
  action(c);
  const saved = structuredClone(c.get().draft);
  c.beginAction();
  c.editAction({ unitId: 'friendly', seconds: '0' });
  expect(c.applyAction()).toBe(false);
  expect(c.get().error).toContain('one movement start');
  expect(c.get().draft).toEqual(saved);
  c.editAction({ unitId: 'unknown' });
  expect(c.applyAction()).toBe(false);
  c.cancelAction();
  c.update({
    ...structuredClone(saved),
    units: saved.units.filter((u) => u.id !== 'friendly'),
  } as ScenarioContent);
  expect(c.get().draft).toEqual(saved);
  expect(() =>
    decodeScenarioWrite({
      requestId: 'invalid',
      expectedRevision: 0,
      content: { ...saved, actions: [{ ...saved.actions![0], offsetMs: 201 }] },
    }),
  ).toThrow();
});
it('keeps duplicate action identities fresh and reorders different actors at one tick', () => {
  const c = client();
  c.update(structuredClone(content));
  action(c, 'friendly');
  action(c, 'observer');
  action(c, 'hostile');
  const actions = c.get().draft.actions!;
  c.reorderAction(actions[2].id, -1);
  expect(c.get().draft.actions?.map((a) => a.unitId)).toEqual([
    'friendly',
    'hostile',
    'observer',
  ]);
  c.beginAction(actions[0].id, true);
  expect(c.get().actionEdit?.id).not.toBe(actions[0].id);
  expect(c.get().actionEdit?.seconds).toBe('0.2');
  expect(c.applyAction()).toBe(true);
  expect(new Set(c.get().draft.actions?.map((a) => a.id)).size).toBe(4);
  c.deleteAction(actions[0].id);
  expect(c.get().draft.actions).toHaveLength(3);
});
it('pins copy remapping once before a lost Save and reconciles exact action references', async () => {
  const requests: ScenarioWrite[] = [];
  let receipt: ScenarioReceipt | undefined,
    drop = true;
  const fetcher: Parameters<typeof client>[0] = async (url, init) => {
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as ScenarioWrite;
      requests.push(body);
      receipt ??= {
        schemaVersion: '1.2',
        requestId: body.requestId,
        accepted: true,
        code: 'OK',
        message: 'Saved',
        result: {
          schemaVersion: '1.2',
          definitionId: 'copied',
          revision: 1,
          contentHash: 'a'.repeat(64),
          createdAt: '2026-09-18T00:00:00.000Z',
          content: body.content,
        },
      };
      expect(
        JSON.parse(sessionStorage.getItem('sentinel.scenario.pending.v1')!)
          .body,
      ).toEqual(body);
      if (drop) throw new Error('Lost reply');
      return Response.json(receipt);
    }
    if (String(url).includes('creations?')) return Response.json(receipt);
    return Response.json({
      schemaVersion: '1.2',
      scenarios: receipt?.result ? [receipt.result] : [],
    });
  };
  const c = client(fetcher);
  c.update(structuredClone(content));
  action(c, 'observer');
  const original = structuredClone(c.get().draft);
  await c.save(true);
  const request = c.get().pending!.body;
  expect(
    request.content.units.every(
      (u) => !original.units.some((o) => o.id === u.id),
    ),
  ).toBe(true);
  const copied = request.content.actions![0];
  expect(copied.id).not.toBe(original.actions![0].id);
  expect(request.content.units.find((u) => u.id === copied.unitId)?.label).toBe(
    'Observer',
  );
  expect(c.get().draft).toEqual(original);
  c.dispose();
  drop = false;
  const restored = client(fetcher);
  await restored.reconcile(true);
  expect(requests[1]).toEqual(requests[0]);
  expect(restored.get().saved?.content).toEqual(request.content);
  expect(restored.get().pending).toBeUndefined();
});
it('rejects new schedule fields in historical scenario versions', () => {
  const old: ScenarioRevision = {
    schemaVersion: '1.0',
    definitionId: 'old',
    revision: 1,
    contentHash: 'b'.repeat(64),
    createdAt: '2026-09-18T00:00:00.000Z',
    content,
  };
  expect(decodeScenarioRevision(old)).toEqual(old);
  expect(() =>
    decodeScenarioRevision({ ...old, content: { ...content, actions: null } }),
  ).toThrow();
  const boundary = {
    ...old,
    schemaVersion: '1.1',
    content: {
      ...content,
      boundaries: [],
      boundaryRuleVersion: 'local-boundary-v1',
    },
  };
  expect(decodeScenarioRevision(boundary).schemaVersion).toBe('1.1');
  expect(() =>
    decodeScenarioRevision({
      ...boundary,
      content: { ...boundary.content, actions: [] },
    }),
  ).toThrow();
});

it('preserves raw empty name editing on reload without admitting an unnamed Save', async () => {
  let writes = 0;
  const c = client(async (_url, init) => {
    if (init?.method === 'POST') writes++;
    return Response.json({ schemaVersion: '1.2', scenarios: [] });
  });
  c.update(structuredClone(content));
  action(c);
  c.update({ ...structuredClone(c.get().draft), name: '' } as ScenarioContent);
  expect(c.get().draft.name).toBe('');
  expect(c.get().error).toBeUndefined();
  await c.save();
  expect(c.get().error).toBe('Enter an arrangement name before saving.');
  expect(c.get().pending).toBeUndefined();
  expect(writes).toBe(0);
  c.dispose();
  const restored = client();
  expect(restored.get().draft.name).toBe('');
  expect(restored.get().blocked).toBeUndefined();
  expect(restored.get().draft.actions).toHaveLength(1);
  restored.update({
    ...structuredClone(restored.get().draft),
    name: 'Renamed',
  } as ScenarioContent);
  expect(restored.get().draft.name).toBe('Renamed');
});

it('orders tied action IDs by Unicode code points, matching backend dispatch', () => {
  const ids = ['\u{1f600}', 'é', 'a', '\ue000', 'Z'];
  const actions = ids.map((id) => ({
    id,
    unitId: id,
    kind: 'move' as const,
    offsetMs: 0,
    ordinal: 0,
    destination: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
  }));
  expect(orderedActions(actions).map((a) => a.id)).toEqual([
    'Z',
    'a',
    'é',
    '\ue000',
    '\u{1f600}',
  ]);
});
