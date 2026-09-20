import { afterEach, expect, it, vi } from 'vitest';
import { createInteractiveClient } from '../../src/services/interactiveClient';
import {
  decodeIntent,
  decodeReceipt,
  decodeRunRead,
} from '../../src/contracts/interactive';
import { validateFrame } from '../../src/contracts/decode';
import rawFrame from '../../../contracts/sentinel/v1.11/fixture.world.json';
import demo from '../../../contracts/sentinel/v1.11/demo.world.json';
import type {
  CommandRequest,
  InteractiveRun,
} from '../../src/contracts/generated';

const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  sessionStorage.clear();
  vi.useRealTimers();
});
const received = (id: string, operation = 'create') => ({
  schemaVersion: '1.0',
  requestId: id,
  operation,
  accepted: true,
  code: 'OK',
  message: 'Committed',
  recordedAt: '2026-09-14T00:00:00.000Z',
  missionId: 'mid',
  runId: 'run',
  recordingId: 'rec',
  frameId: 'frame',
  sequence: 0,
});
const evidence = {
  id: 'intent',
  missionId: 'mid',
  runId: 'run',
  executorEpoch: 'epoch',
  sourceId: 'source',
  grantId: 'grant',
  grantRevision: 1,
  runRevision: 0,
  leaseRevision: 1,
  action: 'start',
  issuedAt: '2026-09-14T00:00:00.000Z',
  expiresAt: '2026-09-14T00:00:30.000Z',
};
const entry = {
  schemaVersion: '1.1',
  enabled: true,
  templateId: 'singapore-local-v2',
};

it.each(['switch', 'dispose'] as const)(
  'an in-flight old status read cannot drop the next mission refresh (%s)',
  async (transition) => {
    vi.useFakeTimers();
    const statusUrls: string[] = [],
      publishedMissions: (string | undefined)[] = [];
    let finishOld!: (value: Response) => void;
    const status = (missionId: string) => ({
      schemaVersion: '1.7',
      run: {
        ...structuredClone(demo.interactive!),
        missionId,
        lease: {
          holderId: 'other-operator',
          revision: 1,
          expiresAt: '2026-09-14T01:00:00.000Z',
        },
      },
      serverTime: evidence.issuedAt,
      frameId: 'frame',
      sequence: 1,
      ownsControl: false,
      leaseState: 'held',
    });
    expect(() => decodeRunRead(status('old'))).not.toThrow();
    expect(() => decodeRunRead(status('new'))).not.toThrow();
    const client = createInteractiveClient({
      base: '/api',
      storage: sessionStorage,
      loadMission: () => {},
      publish: () => {
        publishedMissions.push(client.get().current?.run.missionId);
      },
      fetcher: async (url) => {
        if (url.endsWith('/entry')) return Response.json(entry);
        statusUrls.push(url);
        if (url.endsWith('/old/status'))
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        if (url.endsWith('/new/status')) return Response.json(status('new'));
        throw Error('Unexpected route');
      },
    });
    cleanup.push(client.dispose);
    client.setMission('old');
    await vi.advanceTimersByTimeAsync(0);
    expect(statusUrls).toEqual(['/api/interactive/old/status']);
    client.setMission('new');
    const refreshed = client.refresh();
    if (transition === 'dispose') client.dispose();
    finishOld(Response.json(status('old')));
    await refreshed;
    await vi.advanceTimersByTimeAsync(0);
    expect(publishedMissions).not.toContain('old');
    if (transition === 'switch') {
      expect(client.get().current?.run.missionId).toBe('new');
      expect(statusUrls).toEqual([
        '/api/interactive/old/status',
        '/api/interactive/new/status',
      ]);
    } else {
      expect(client.get().current).toBeUndefined();
      expect(statusUrls).toEqual(['/api/interactive/old/status']);
    }
    // No periodic timer has run: correct authority is available immediately
    // after the old read settles, without advancing the five-second poll clock.
  },
);

it('coalesces overlapping authority refreshes and awaits the fresh status after a committed revision changes', async () => {
  vi.useFakeTimers();
  let finishFirst!: (value: Response) => void,
    statusReads = 0;
  const status = (revision: number) => ({
    schemaVersion: '1.7',
    run: {
      ...structuredClone(demo.interactive!),
      missionId: 'mid',
      runRevision: revision,
      lease: {
        holderId: 'other-operator',
        revision: 1,
        expiresAt: '2026-09-14T01:00:00.000Z',
      },
    },
    serverTime: evidence.issuedAt,
    frameId: 'frame',
    sequence: revision,
    ownsControl: false,
    leaseState: 'held',
  });
  expect(() => decodeRunRead(status(1))).not.toThrow();
  expect(() => decodeRunRead(status(2))).not.toThrow();
  const client = createInteractiveClient({
    base: '/api',
    storage: sessionStorage,
    publish: () => {},
    loadMission: () => {},
    fetcher: async (url) => {
      if (url.endsWith('/entry')) return Response.json(entry);
      if (url.endsWith('/status')) {
        statusReads++;
        if (statusReads === 1)
          return new Promise<Response>((resolve) => {
            finishFirst = resolve;
          });
        return Response.json(status(2));
      }
      throw Error('No command may be sent by a status refresh');
    },
  });
  cleanup.push(client.dispose);
  client.setMission('mid');
  await vi.advanceTimersByTimeAsync(0);
  const waiting = [client.refresh(), client.refresh(), client.refresh()];
  finishFirst(Response.json(status(1)));
  await Promise.all(waiting);
  await vi.advanceTimersByTimeAsync(0);
  expect(client.get().current?.run.runRevision).toBe(2);
  expect(statusReads).toBe(2);
});

it.each(['accepted', 'lost', 'mission changed'] as const)(
  'serializes a foreground End behind background renewal (%s)',
  async (outcome) => {
    vi.useFakeTimers();
    const run = structuredClone(demo.interactive!) as InteractiveRun;
    run.missionId = 'mid';
    run.runId = 'run';
    run.state = 'running';
    run.lease = {
      holderId: 'operator',
      revision: 1,
      expiresAt: '2026-09-14T00:00:15.000Z',
    };
    const commands: CommandRequest[] = [];
    let finish!: (value: Response) => void;
    let fail!: (reason: Error) => void;
    const client = createInteractiveClient({
      base: '/api',
      storage: sessionStorage,
      publish: () => {},
      loadMission: () => {},
      fetcher: async (url, init) => {
        if (url.endsWith('/entry')) return Response.json(entry);
        if (url.endsWith('/status'))
          return Response.json({
            schemaVersion: '1.7',
            run,
            serverTime: evidence.issuedAt,
            frameId: 'frame',
            sequence: 1,
            ownsControl: true,
            leaseState: 'held',
          });
        if (url.endsWith('/intents'))
          return Response.json({
            ...evidence,
            ...JSON.parse(String(init?.body)),
            leaseRevision: run.lease.revision,
          });
        if (url.endsWith('/commands')) {
          const body = JSON.parse(String(init?.body)) as CommandRequest;
          commands.push(body);
          if (body.intent.action === 'renew')
            return new Promise<Response>((resolve, reject) => {
              finish = resolve;
              fail = reject;
            });
          return Response.json(received(body.commandId, body.intent.action));
        }
        throw Error('Unexpected route');
      },
    });
    cleanup.push(client.dispose);
    client.setMission('mid');
    client.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(commands.map((c) => c.intent.action)).toEqual(['renew']);
    expect(client.get().renewing).toBe(true);
    const end = client.perform('end');
    expect(commands).toHaveLength(1);
    if (outcome === 'mission changed') client.setMission('another');
    if (outcome === 'lost') fail(Error('Reply lost'));
    else {
      run.lease.revision = 2;
      run.lease.expiresAt = '2026-09-14T00:00:30.000Z';
      finish(Response.json(received(commands[0].commandId, 'renew')));
    }
    await end;
    if (outcome === 'accepted') {
      expect(commands.map((c) => c.intent.action)).toEqual(['renew', 'end']);
      expect(commands[1].intent.leaseRevision).toBe(2);
      expect(client.get().receipt?.operation).toBe('end');
    } else {
      expect(commands).toHaveLength(1);
      expect(client.get().pending?.body).toEqual(commands[0]);
      expect(
        sessionStorage.getItem('sentinel.interactive.pending.v1'),
      ).toContain(commands[0].commandId);
    }
  },
);

it('saves creation identity before send, reconciles lost reply after reload, never recreates', async () => {
  let creation = '',
    sent = 0;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/runs')) {
      sent++;
      creation = JSON.parse(init!.body as string).creationId;
      expect(
        sessionStorage.getItem('sentinel.interactive.pending.v1'),
      ).toContain(creation);
      throw new Error('Lost response after commit');
    }
    if (url.includes('/creations?identity='))
      return Response.json(received(creation));
    return Response.json(entry);
  });
  const load = vi.fn();
  const first = createInteractiveClient({
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: load,
    storage: sessionStorage,
  });
  cleanup.push(first.dispose);
  await first.perform('create');
  expect(first.get().pending).toBeDefined();
  expect(first.get().error).toContain('Outcome unknown');
  await first.perform('create');
  expect(sent).toBe(1);
  first.dispose();
  const second = createInteractiveClient({
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: load,
    storage: sessionStorage,
  });
  cleanup.push(second.dispose);
  expect(second.get().pending).toBeDefined();
  await second.reconcile();
  expect(second.get().pending).toBeUndefined();
  expect(load).toHaveBeenCalledWith('mid');
  expect(sent).toBe(1);
});

it('an actual request timeout retains its identity and only explicit retry resends', async () => {
  vi.useFakeTimers();
  const bodies: string[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.endsWith('/runs')) return Response.json(entry);
    bodies.push(init!.body as string);
    if (bodies.length > 1)
      return Response.json(received(JSON.parse(bodies[0]).creationId));
    return await new Promise<Response>((_, reject) => {
      init!.signal!.addEventListener('abort', () =>
        reject(new Error('Timed out')),
      );
    });
  });
  const client = createInteractiveClient({
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
    timeoutMs: 1000,
  });
  cleanup.push(client.dispose);
  const sending = client.perform('create');
  await vi.advanceTimersByTimeAsync(1001);
  await sending;
  expect(client.get().pending).toBeDefined();
  expect(client.get().error).toContain('Outcome unknown');
  await vi.advanceTimersByTimeAsync(60_000);
  await client.perform('create');
  expect(bodies).toHaveLength(1);
  await client.reconcile(true);
  expect(bodies[1]).toBe(bodies[0]);
  expect(client.get().pending).toBeUndefined();
});

it('retries the same command body and keeps credential outside snapshots and pending content', async () => {
  const bodies: string[] = [],
    headers: Headers[] = [];
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/intents')) return Response.json(evidence);
    if (url.endsWith('/commands')) {
      bodies.push(init!.body as string);
      headers.push(new Headers(init?.headers));
      if (bodies.length === 1) throw new Error('HTTP reply lost');
      return Response.json(received(JSON.parse(bodies[0]).commandId, 'start'));
    }
    return Response.json(entry);
  });
  const client = createInteractiveClient({
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
  });
  cleanup.push(client.dispose);
  client.setMission('mid');
  await client.perform('start');
  const credential = headers[0].get('X-Sentinel-Control')!;
  expect(credential.length).toBe(64);
  expect(JSON.stringify(client.get())).not.toContain(credential);
  expect(
    sessionStorage.getItem('sentinel.interactive.pending.v1'),
  ).not.toContain(credential);
  await client.reconcile(true);
  expect(bodies[1]).toBe(bodies[0]);
  expect(headers[1].get('X-Sentinel-Control')).toBe(credential);
});

it('blocks sends if durable session storage cannot retain request identity', async () => {
  const fetcher = vi.fn();
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage full');
    },
  } as unknown as Storage;
  const client = createInteractiveClient({
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: () => {},
    storage,
  });
  cleanup.push(client.dispose);
  await client.perform('create');
  expect(fetcher).not.toHaveBeenCalled();
  expect(client.get().error).toContain('Storage full');
});

it('does not adopt obsolete mission replies and preserves pending identity for explicit reconciliation', async () => {
  let reply!: (response: Response) => void;
  let sent: CommandRequest | undefined;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/intents')) return Response.json(evidence);
    if (url.endsWith('/commands')) {
      sent = JSON.parse(init!.body as string);
      return await new Promise<Response>((resolve) => {
        reply = resolve;
      });
    }
    return Response.json(entry);
  });
  const client = createInteractiveClient({
    base: '/api',
    fetcher,
    publish: () => {},
    loadMission: () => {},
    storage: sessionStorage,
  });
  cleanup.push(client.dispose);
  client.setMission('mid');
  const running = client.perform('start');
  await vi.waitFor(() => expect(sent).toBeDefined());
  client.setMission('another');
  reply(Response.json(received(sent!.commandId, 'start')));
  await running;
  expect(client.get().receipt).toBeUndefined();
  expect(client.get().pending?.missionId).toBe('mid');
});

it('rejects malformed time, receipt success/reference mismatch and strict old-version ingress', () => {
  expect(() =>
    decodeIntent({ ...evidence, expiresAt: '2026-09-14T00:00:40.000Z' }),
  ).toThrow(/lifetime/);
  expect(() =>
    decodeReceipt({ ...received('a'), code: 'INTENT_EXPIRED' }),
  ).toThrow(/mismatch/);
  expect(() => decodeReceipt({ ...received('a'), frameId: undefined })).toThrow(
    /references/,
  );
  expect(() => decodeRunRead({})).toThrow(/contract/);
  expect(() => validateFrame({ ...rawFrame, schemaVersion: '1.0' })).toThrow(
    /world frame/,
  );
});

it.each(
  (['create', 'start'] as const).flatMap((operation) =>
    ['opaque/ ?#% /id', '.', '..', 'a/../b', 'unicode-é/+ &= %2E'].map(
      (id) => ({ operation, id }),
    ),
  ),
)(
  'reconciles opaque $operation identity $id through query lookup without URL normalization',
  async ({ operation, id }) => {
    const pending =
      operation === 'create'
        ? { body: { creationId: id, templateId: 'singapore-local-v1' } }
        : {
            missionId: 'mid',
            body: { commandId: id, holderId: 'operator', intent: evidence },
          };
    sessionStorage.setItem(
      'sentinel.interactive.pending.v1',
      JSON.stringify(pending),
    );
    const paths: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      paths.push(url);
      return Response.json(
        url.endsWith('/entry') ? entry : received(id, operation),
      );
    });
    const client = createInteractiveClient({
      base: '/api',
      fetcher,
      publish: () => {},
      loadMission: () => {},
      storage: sessionStorage,
    });
    cleanup.push(client.dispose);
    await client.reconcile();
    expect(paths[0]).toBe(
      `/api/interactive/${operation === 'create' ? 'creations' : 'mid/receipts'}?identity=${encodeURIComponent(id)}`,
    );
    expect(
      new URL(paths[0], 'http://localhost').searchParams.get('identity'),
    ).toBe(id);
    expect(client.get().pending).toBeUndefined();
  },
);
