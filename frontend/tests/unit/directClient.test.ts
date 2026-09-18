import { afterEach, expect, it, vi } from 'vitest';
import { createInteractiveClient } from '../../src/services/interactiveClient';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';
import type {
  DirectMoveIntent,
  DirectMoveRequest,
  Receipt,
  InteractiveRun,
} from '../../src/contracts/generated';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((f) => f());
  sessionStorage.clear();
  vi.useRealTimers();
});
const intent: Omit<DirectMoveIntent, 'order'> = {
  missionId: 'mission',
  runId: 'run',
  executorEpoch: 'epoch',
  sourceId: 'source',
  grantId: 'grant',
  grantRevision: 0,
  reviewedFrameId: 'frame',
  deadline: '2026-09-16T00:00:30.000Z',
  anchor: { longitudeDeg: 103.852, latitudeDeg: 1.29 },
  members: [
    {
      assetId: 'asset',
      entityId: 'entity',
      executorId: 'executor',
      sourceId: 'source',
      controlTrackId: 'track',
      grantId: 'grant',
      bindingRevision: 0,
    },
  ],
};
function receipt(body: DirectMoveRequest): Receipt {
  return {
    schemaVersion: '1.6',
    requestId: body.commandId,
    operation: 'direct-move',
    accepted: true,
    code: 'OK',
    message: 'Committed',
    recordedAt: '2026-09-16T00:00:01.000Z',
    missionId: 'mission',
    runId: 'run',
    recordingId: 'recording',
    frameId: `frame-${body.direct.order}`,
    sequence: body.direct.order,
    executionIds: [`execution-${body.direct.order}`],
    directOrder: body.direct.order,
    memberOutcomes: [
      {
        assetId: 'asset',
        entityId: 'entity',
        outcome: 'accepted',
        code: 'OK',
        reason: 'Accepted',
        executionId: `execution-${body.direct.order}`,
      },
    ],
  };
}
const entry = {
  schemaVersion: '1.1',
  enabled: true,
  templateId: 'singapore-local-v2',
};
it('persists each rapid order before sending; reordered replies cannot restore the older feedback', async () => {
  const sent: DirectMoveRequest[] = [],
    replies: ((r: Response) => void)[] = [];
  const client = createInteractiveClient({
    base: '/api',
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
    fetcher: async (url, init) => {
      if (!url.endsWith('/direct-moves')) return Response.json(entry);
      const body = JSON.parse(init!.body as string) as DirectMoveRequest;
      sent.push(body);
      const credential = new Headers(init?.headers).get('X-Sentinel-Control')!;
      expect(
        sessionStorage.getItem('sentinel.interactive.direct.v1'),
      ).toContain(body.commandId);
      expect(
        sessionStorage.getItem('sentinel.interactive.direct.v1'),
      ).not.toContain(credential);
      expect(JSON.stringify(client.get())).not.toContain(credential);
      return new Promise<Response>((resolve) => replies.push(resolve));
    },
  });
  cleanup.push(client.dispose);
  client.setMission('mission');
  const first = client.submitDirect(intent),
    second = client.submitDirect({
      ...intent,
      anchor: { longitudeDeg: 103.853, latitudeDeg: 1.29 },
    });
  expect(sent).toHaveLength(2);
  expect(sent[1].direct.order).toBeGreaterThan(sent[0].direct.order);
  replies[1](Response.json(receipt(sent[1])));
  await second;
  replies[0](Response.json(receipt(sent[0])));
  await first;
  expect(client.get().directReceipt?.requestId).toBe(sent[1].commandId);
  expect(client.get().directFeedback?.longitudeDeg).toBe(103.853);
  expect(client.get().directPending).toHaveLength(0);
  expect(client.get().directReceipts).toHaveLength(2);
});
it('reload reconciles the original identity using canonical query lookup without another move', async () => {
  let body: DirectMoveRequest | undefined,
    sends = 0;
  const fetcher = async (url: string, init?: RequestInit) => {
    if (url.endsWith('/direct-moves')) {
      sends++;
      body = JSON.parse(init!.body as string) as DirectMoveRequest;
      throw new Error('reply lost');
    }
    if (url.includes('/receipts?identity=')) {
      expect(url).toContain(encodeURIComponent(body!.commandId));
      return Response.json(receipt(body!));
    }
    return Response.json(entry);
  };
  const create = () =>
    createInteractiveClient({
      base: '/api',
      publish: () => {},
      loadMission: () => {},
      storage: sessionStorage,
      fetcher,
    });
  const first = create();
  first.setMission('mission');
  await first.submitDirect(intent);
  first.dispose();
  const saved = sessionStorage.getItem('sentinel.interactive.direct.v1');
  const second = create();
  cleanup.push(second.dispose);
  second.setMission('mission');
  expect(JSON.stringify(second.get().directPending)).toBe(saved);
  await second.reconcileDirect();
  expect(sends).toBe(1);
  expect(second.get().directPending).toHaveLength(0);
});
it('retry after a missing receipt preserves the complete payload, original deadline and order', async () => {
  const bodies: string[] = [];
  const client = createInteractiveClient({
    base: '/api',
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
    fetcher: async (url, init) => {
      if (url.endsWith('/direct-moves')) {
        bodies.push(init!.body as string);
        if (bodies.length === 1) throw new Error('delivery unknown');
        return Response.json(
          receipt(JSON.parse(bodies[0]) as DirectMoveRequest),
        );
      }
      if (url.includes('/receipts?identity='))
        return Response.json(
          { code: 'NOT_FOUND', message: 'No receipt' },
          { status: 404 },
        );
      return Response.json(entry);
    },
  });
  cleanup.push(client.dispose);
  client.setMission('mission');
  await client.submitDirect(intent);
  await client.reconcileDirect();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
});
it('does not send when pending storage cannot retain a new order', async () => {
  const send = vi.fn(async (url: string) => {
    void url;
    return Response.json(entry);
  });
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage full');
    },
  } as unknown as Storage;
  const client = createInteractiveClient({
    base: '/api',
    publish: () => {},
    loadMission: () => {},
    storage,
    fetcher: send,
  });
  cleanup.push(client.dispose);
  client.setMission('mission');
  await client.submitDirect(intent);
  expect(
    send.mock.calls.some((c) =>
      (c[0] as string | undefined)?.endsWith('/direct-moves'),
    ),
  ).toBe(false);
  expect(client.get().directFeedback?.message).toContain('Storage full');
});

it('keeps lease renewal and status polling responsive with a stalled receipt backlog', async () => {
  vi.useFakeTimers();
  const run = structuredClone(demo.interactive!) as InteractiveRun;
  run.missionId = 'mission';
  run.state = 'running';
  const serverTime = '2026-09-16T00:00:00.000Z';
  run.lease = {
    holderId: 'operator',
    revision: 1,
    expiresAt: '2026-09-16T00:00:15.000Z',
  };
  const sent = new Map<string, DirectMoveRequest>();
  const stalled: { body: DirectMoveRequest; reply: (r: Response) => void }[] =
    [];
  let renewals = 0,
    statuses = 0;
  const client = createInteractiveClient({
    base: '/api',
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
    fetcher: async (url, init) => {
      if (url.endsWith('/entry')) return Response.json(entry);
      if (url.endsWith('/status')) {
        statuses++;
        return Response.json({
          schemaVersion: '1.7',
          run,
          serverTime,
          frameId: 'frame',
          sequence: 1,
          ownsControl: true,
          leaseState: 'held',
        });
      }
      if (url.endsWith('/direct-moves')) {
        const body = JSON.parse(String(init?.body)) as DirectMoveRequest;
        sent.set(body.commandId, body);
        throw Error('Response lost');
      }
      if (url.includes('/receipts?')) {
        const id = new URL(url, 'http://local').searchParams.get('identity')!;
        return new Promise<Response>((reply) =>
          stalled.push({ body: sent.get(id)!, reply }),
        );
      }
      if (url.endsWith('/intents'))
        return Response.json({
          ...JSON.parse(String(init?.body)),
          id: 'renew',
          missionId: 'mission',
          runId: run.runId,
          executorEpoch: run.executorEpoch,
          sourceId: run.sourceId,
          grantId: run.grantId,
          grantRevision: run.grantRevision,
          runRevision: run.runRevision,
          leaseRevision: 1,
          issuedAt: serverTime,
          expiresAt: '2026-09-16T00:00:30.000Z',
        });
      if (url.endsWith('/commands')) {
        const body = JSON.parse(String(init?.body));
        expect(body.intent.action).toBe('renew');
        renewals++;
        run.lease.expiresAt = '2026-09-16T00:00:30.000Z';
        return Response.json({
          schemaVersion: '1.6',
          requestId: body.commandId,
          operation: 'renew',
          accepted: true,
          code: 'OK',
          message: 'Renewed',
          recordedAt: serverTime,
          missionId: 'mission',
          runId: run.runId,
          recordingId: 'recording',
          frameId: 'renewed',
          sequence: 2,
        });
      }
      throw Error(`Unexpected test route ${url}`);
    },
  });
  cleanup.push(client.dispose);
  client.setMission('mission');
  for (let i = 0; i < 8; i++) await client.submitDirect(intent);
  client.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(stalled).toHaveLength(4);
  expect(renewals).toBe(1);
  const before = statuses;
  await vi.advanceTimersByTimeAsync(5000);
  expect(statuses).toBeGreaterThan(before);
  expect(stalled).toHaveLength(4);
  expect(client.get().directPending).toHaveLength(8);
  stalled
    .splice(0)
    .forEach(({ body, reply }) => reply(Response.json(receipt(body))));
  await vi.advanceTimersByTimeAsync(0);
  expect(client.get().directPending).toHaveLength(4);
  await vi.advanceTimersByTimeAsync(5000);
  expect(stalled).toHaveLength(4);
  stalled
    .splice(0)
    .forEach(({ body, reply }) => reply(Response.json(receipt(body))));
  await vi.advanceTimersByTimeAsync(0);
  expect(client.get().directPending).toHaveLength(0);
});
