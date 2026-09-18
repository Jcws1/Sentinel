import { beforeEach, afterEach, expect, it } from 'vitest';
import { createInteractiveClient } from '../../src/services/interactiveClient';
import { decodeIntent, decodeReceipt } from '../../src/contracts/interactive';
import type {
  CommandRequest,
  DirectMoveMember,
  DirectMoveIntent,
  Receipt,
} from '../../src/contracts/generated';
type IntentRequest = Pick<
  CommandRequest['intent'],
  'action' | 'members' | 'order'
>;
const member: DirectMoveMember = {
  assetId: 'asset',
  entityId: 'entity',
  executorId: 'executor',
  sourceId: 'source',
  controlTrackId: 'track',
  grantId: 'grant',
  bindingRevision: 1,
};
const entry = {
  schemaVersion: '1.1',
  enabled: true,
  templateId: 'singapore-local-v2',
};
const evidence = {
  id: 'fresh-intent',
  missionId: 'mission',
  runId: 'run',
  executorEpoch: 'epoch',
  sourceId: 'source',
  grantId: 'grant',
  grantRevision: 0,
  runRevision: 1,
  leaseRevision: 1,
  issuedAt: '2026-09-18T00:01:00.000Z',
  expiresAt: '2026-09-18T00:01:30.000Z',
};
const clients: ReturnType<typeof createInteractiveClient>[] = [];
beforeEach(() => sessionStorage.clear());
afterEach(() => clients.splice(0).forEach((c) => c.dispose()));
function receipt(body: CommandRequest): Receipt {
  return {
    schemaVersion: '1.6',
    requestId: body.commandId,
    operation: body.intent.action,
    accepted: true,
    code: 'OK',
    message: 'Committed',
    recordedAt: evidence.issuedAt,
    missionId: 'mission',
    runId: 'run',
    recordingId: 'recording',
    frameId: 'stopped-frame',
    sequence: 50,
    controlOrder: body.intent.order,
    controlOutcomes: [
      {
        assetId: 'asset',
        entityId: 'entity',
        outcome: 'accepted',
        code: 'OK',
        reason: 'Holding committed position; Manual override.',
      },
    ],
  };
}
it('shares the direct-order counter and journals one exact nonpositional Stop through response loss and reload', async () => {
  const bodies: CommandRequest[] = [],
    intentRequests: IntentRequest[] = [];
  let committed: Receipt | undefined;
  const fetcher = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/direct-moves'))
      throw new Error('Earlier movement response lost');
    if (url.endsWith('/intents')) {
      const request = JSON.parse(String(init?.body));
      intentRequests.push(request);
      return Response.json({ ...evidence, ...request });
    }
    if (url.endsWith('/commands')) {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      committed ??= receipt(body);
      expect(
        JSON.parse(sessionStorage.getItem('sentinel.interactive.pending.v1')!)
          .body,
      ).toEqual(body);
      throw new Error('Stop committed; reply lost');
    }
    if (url.includes('/receipts?identity=')) return Response.json(committed);
    return Response.json(entry);
  };
  function create() {
    const c = createInteractiveClient({
      base: '/api',
      fetcher,
      publish: () => {},
      loadMission: () => {},
      storage: sessionStorage,
    });
    clients.push(c);
    c.setMission('mission');
    return c;
  }
  const c = create();
  const direct: Omit<DirectMoveIntent, 'order'> = {
    modelId: 'local-horizontal-v1',
    missionId: 'mission',
    runId: 'run',
    executorEpoch: 'epoch',
    sourceId: 'source',
    grantId: 'grant',
    grantRevision: 0,
    reviewedFrameId: 'old-frame',
    deadline: '2026-09-18T00:00:30.000Z',
    anchor: { longitudeDeg: 103.86, latitudeDeg: 1.3 },
    members: [member],
  };
  await c.submitDirect(direct);
  const older = c.get().directPending[0].body.direct.order;
  await c.selectedControl('stop', [member]);
  expect(bodies).toHaveLength(1);
  expect(bodies[0].intent.order).toBeGreaterThan(older);
  expect(intentRequests[0]).toEqual({
    action: 'stop',
    members: [member],
    order: older + 1,
  });
  expect(bodies[0].intent).not.toHaveProperty('anchor');
  expect(bodies[0].intent).not.toHaveProperty('deadline');
  c.dispose();
  const reload = create();
  expect(reload.get().pending?.body).toEqual(bodies[0]);
  await reload.reconcile();
  expect(reload.get().pending).toBeUndefined();
  expect(reload.get().receipt?.requestId).toBe(bodies[0].commandId);
  expect(bodies).toHaveLength(1);
});
it('rejects altered selected-control receipts and preserves the pending identity for reconciliation', async () => {
  let body: CommandRequest | undefined;
  const c = createInteractiveClient({
    base: '/api',
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
    fetcher: async (url, init) => {
      if (url.endsWith('/intents'))
        return Response.json({
          ...evidence,
          ...JSON.parse(String(init?.body)),
        });
      if (url.endsWith('/commands')) {
        body = JSON.parse(String(init?.body));
        return Response.json({ ...receipt(body!), controlOrder: 99 });
      }
      return Response.json(entry);
    },
  });
  clients.push(c);
  c.setMission('mission');
  await c.selectedControl('stop', [member]);
  expect(c.get().pending?.body).toEqual(body);
  expect(c.get().error).toContain('Outcome unknown');
});
it('requires selected control evidence and forbids fabricated Stop motion outcomes', () => {
  expect(() => decodeIntent({ ...evidence, action: 'stop' })).toThrow();
  expect(() =>
    decodeIntent({
      ...evidence,
      action: 'resume',
      members: [member],
      order: 1,
    }),
  ).toThrow();
  expect(
    decodeIntent({ ...evidence, action: 'stop', members: [member], order: 1 })
      .order,
  ).toBe(1);
  const r = receipt({
    commandId: 'stop',
    holderId: 'holder',
    intent: { ...evidence, action: 'stop', members: [member], order: 1 },
  });
  expect(decodeReceipt(r)).toEqual(r);
  expect(() => decodeReceipt({ ...r, executionIds: ['fabricated'] })).toThrow();
  expect(() => decodeReceipt({ ...r, controlOutcomes: [] })).toThrow();
});
