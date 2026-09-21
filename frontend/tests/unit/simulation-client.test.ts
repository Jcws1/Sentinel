import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createSimulationClient,
  simulationStorageKey,
} from '../../src/modules/simulation/client';
import {
  decodeResponse,
  decodeRun,
  previewRequest,
} from '../../src/modules/simulation/contracts';
import goldenRequest from '../../../contracts/simulation/fixtures/golden.request.json';
import goldenResponse from '../../../contracts/simulation/fixtures/golden.response.json';
import type { Fetcher } from '../../src/services/api';
import { polygonIntegrity } from '../../src/contracts/integrity';

const input = JSON.stringify(goldenRequest, null, 3);
const run = {
  schemaVersion: '1.0',
  policyId: 'sentinel-simulation-v1-local-1',
  missionId: 'mapped-mission',
  externalMissionId: goldenRequest.mission_id,
  runId: 'run-1',
  state: 'RUNNING',
  phase: 'ready',
  commandId: goldenRequest.command.command_id,
  sourceMode: 'SIMULATED',
  calibration: {
    profileId: 'NOTIONAL-UNIT-TEST',
    version: '1.0.0',
    evidenceStatus: 'NOTIONAL',
  },
  receivedAt: '2026-09-20T00:00:00.000Z',
  completedAt: '2026-09-20T00:00:01.000Z',
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}
afterEach(() => vi.restoreAllMocks());

describe('external simulation command ownership', () => {
  it.each(['.', '..', 'a/../b', 'a?b#c', '%2E'])(
    'looks up opaque command %s without URL path normalization',
    async (commandId) => {
      const urls: string[] = [];
      const receipt = {
        ...goldenResponse,
        command_ack: { ...goldenResponse.command_ack, command_id: commandId },
      };
      const client = createSimulationClient({
        base: '/api',
        storage: storage(),
        fetcher: async (url) => {
          urls.push(url);
          return response(
            url.includes('/runs/') ? { ...run, commandId } : receipt,
          );
        },
      });
      await client.inspect(run.missionId);
      await client.inspectCommand(commandId);
      expect(client.getSnapshot().error).toBeUndefined();
      expect(client.getSnapshot().result).toEqual(receipt);
      const expected = `/api/simulation/v1/command-result?command_id=${encodeURIComponent(commandId)}`;
      expect(urls.slice(1)).toEqual([expected, expected]);
      expect(client.resultUrl(commandId)).toBe(expected);
      expect(
        new URL(expected, 'http://localhost').searchParams.get('command_id'),
      ).toBe(commandId);
      client.dispose();
    },
  );

  it('validates tiny source polygons without underflow or changing the source', () => {
    const d = 1e-170;
    const rings = [
      [
        [0, 0],
        [d, 0],
        [d, d],
        [0, d],
        [0, 0],
      ],
    ];
    const original = JSON.stringify(rings);
    expect(() => polygonIntegrity(rings)).not.toThrow();
    expect(JSON.stringify(rings)).toBe(original);
    expect(() =>
      polygonIntegrity([
        [
          [0, 0],
          [3e-100, 3e-100],
          [0, 3e-100],
          [2e-100, 0],
          [0, 0],
        ],
      ]),
    ).toThrow('intersects');
    expect(() =>
      polygonIntegrity([
        [
          [0, 0],
          [d, d],
          [0, d],
          [d, 0],
          [0, 0],
        ],
      ]),
    ).toThrow();
    expect(() =>
      polygonIntegrity([
        [
          [0, 0],
          [d, d],
          [d * 2, d * 2],
          [0, 0],
        ],
      ]),
    ).toThrow();
  });

  it('preserves exact lost-response body through reload and retry', async () => {
    const store = storage(),
      bodies: unknown[] = [];
    const fetcher: Fetcher = async (url, options) => {
      if (url.endsWith('/runs')) return response([run]);
      bodies.push(options?.body);
      if (bodies.length === 1) throw new Error('Lost response after commit');
      return response(goldenResponse);
    };
    const first = createSimulationClient({
      base: '/api',
      fetcher,
      storage: store,
    });
    first.edit(input);
    await first.submit();
    expect(first.getSnapshot().pending).toBe(input);
    first.edit('replacement');
    expect(first.getSnapshot().draft).toBe(input);
    first.dispose();
    const second = createSimulationClient({
      base: '/api',
      fetcher,
      storage: store,
    });
    expect(second.getSnapshot().pending).toBe(input);
    await second.submit(true);
    expect(bodies).toEqual([input, input]);
    expect(second.getSnapshot().pending).toBeUndefined();
    expect(second.getSnapshot().selected?.missionId).toBe(run.missionId);
    expect(second.getSnapshot().result).toEqual(goldenResponse);
    second.dispose();
  });

  it('persists before sending and refuses unavailable durable storage', async () => {
    const fetcher = vi.fn();
    const unavailable = createSimulationClient({
      base: '/api',
      fetcher,
      storage: null,
    });
    unavailable.edit(input);
    await unavailable.submit();
    expect(fetcher).not.toHaveBeenCalled();
    const store = storage();
    const client = createSimulationClient({
      base: '/api',
      storage: store,
      fetcher: async (_, init) => {
        expect(
          JSON.parse(store.values.get(simulationStorageKey)!).pending,
        ).toBe(init?.body);
        throw new Error('Lost');
      },
    });
    client.edit(input);
    await client.submit();
    expect(client.getSnapshot().pending).toBe(input);
    unavailable.dispose();
    client.dispose();
  });

  it('preserves corrupt storage without overwriting it', () => {
    const store = storage();
    store.setItem(simulationStorageKey, '{broken');
    const client = createSimulationClient({
      base: '/api',
      fetcher: vi.fn(),
      storage: store,
    });
    expect(client.getSnapshot().blocked).toBe(true);
    client.edit(input);
    expect(store.values.get(simulationStorageKey)).toBe('{broken');
    client.dispose();
  });

  it.each([400, 409, 422])(
    'clears pending only after authoritative rejection %s',
    async (status) => {
      const client = createSimulationClient({
        base: '/api',
        storage: storage(),
        fetcher: async () =>
          response(
            { error: { message: 'Rejected', path: '/command' } },
            status,
          ),
      });
      client.edit(input);
      await client.submit();
      expect(client.getSnapshot().pending).toBeUndefined();
      expect(client.getSnapshot().error).toBe('Rejected /command');
      client.dispose();
    },
  );

  it.each(['uncommitted', 'identity', 'malformed', 'unavailable'])(
    'retains pending for %s acknowledgements',
    async (kind) => {
      const result = structuredClone(goldenResponse);
      if (kind === 'uncommitted') result.command_ack.status = 'ACCEPTED';
      if (kind === 'identity') result.command_ack.command_id = 'another';
      const client = createSimulationClient({
        base: '/api',
        storage: storage(),
        fetcher: async () =>
          response(
            kind === 'malformed' ? {} : result,
            kind === 'unavailable' ? 503 : 200,
          ),
      });
      client.edit(input);
      await client.submit();
      expect(client.getSnapshot().pending).toBe(input);
      client.dispose();
    },
  );

  it('retains duplicate JSON members in the sent body for authoritative parsing', async () => {
    const raw = input.replace(
      '"schema_version": "1.0"',
      '"schema_version": "1.0", "schema_version": "1.0"',
    );
    let sent: unknown;
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher: async (_, init) => {
        sent = init?.body;
        return response({ error: { message: 'Duplicate member' } }, 400);
      },
    });
    client.edit(raw);
    await client.submit();
    expect(sent).toBe(raw);
    client.dispose();
  });

  it('ignores late old-run inspection after selecting another run', async () => {
    let release!: (value: Response) => void;
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher: async (url) => {
        if (url.endsWith('/runs/old'))
          return new Promise((resolve) => {
            release = resolve;
          });
        if (url.endsWith('/runs/new'))
          return response({
            ...run,
            missionId: 'new',
            externalMissionId: 'NEW',
            commandId: 'NEW-CMD',
          });
        return response({
          ...goldenResponse,
          mission_id: 'NEW',
          command_ack: { ...goldenResponse.command_ack, command_id: 'NEW-CMD' },
        });
      },
    });
    const old = client.inspect('old');
    await client.inspect('new');
    release(response({ ...run, missionId: 'old', phase: 'interrupted' }));
    await old;
    expect(client.getSnapshot().selected?.missionId).toBe('new');
    expect(client.getSnapshot().result?.mission_id).toBe('NEW');
    client.dispose();
  });

  it('does not replace a newly selected result when an old submission finishes', async () => {
    let release!: (value: Response) => void;
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher: async (url, init) => {
        if (init?.method === 'POST')
          return new Promise((resolve) => {
            release = resolve;
          });
        if (url.endsWith('/runs'))
          return response([
            run,
            {
              ...run,
              missionId: 'new',
              externalMissionId: 'NEW',
              commandId: 'NEW-CMD',
            },
          ]);
        if (url.endsWith('/runs/new'))
          return response({
            ...run,
            missionId: 'new',
            externalMissionId: 'NEW',
            commandId: 'NEW-CMD',
          });
        return response({
          ...goldenResponse,
          mission_id: 'NEW',
          command_ack: { ...goldenResponse.command_ack, command_id: 'NEW-CMD' },
        });
      },
    });
    client.edit(input);
    const posting = client.submit();
    await client.inspect('new');
    release(response(goldenResponse));
    await posting;
    expect(client.getSnapshot().selected?.missionId).toBe('new');
    expect(client.getSnapshot().result?.mission_id).toBe('NEW');
    expect(client.getSnapshot().pending).toBeUndefined();
    client.dispose();
  });

  it('HOLD sends one distinct durable command with no samples and preserves the draft', async () => {
    const store = storage();
    let sent = '';
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === 'POST') {
        sent = String(init.body);
        const body = JSON.parse(sent);
        return response({
          ...goldenResponse,
          command_ack: {
            ...goldenResponse.command_ack,
            command_id: body.command.command_id,
            run_status: 'HELD',
          },
          results_by_timestamp: {},
        });
      }
      if (url.endsWith('/input')) return new Response(input);
      if (url.endsWith('/runs')) return response([run]);
      if (url.includes('/runs/')) return response(run);
      return response(goldenResponse);
    };
    const client = createSimulationClient({
      base: '/api',
      storage: store,
      fetcher,
    });
    client.edit(input);
    await client.inspect(run.missionId);
    await Promise.all([client.control('HOLD'), client.control('HOLD')]);
    expect(JSON.parse(sent).command.action).toBe('HOLD');
    expect(JSON.parse(sent).command.command_id).not.toBe(
      goldenRequest.command.command_id,
    );
    expect(JSON.parse(sent).samples_by_timestamp).toEqual({});
    expect(client.getSnapshot().draft).toBe(input);
    client.dispose();
  });

  it('rejects malformed projections and leaves validation completeness at the backend', () => {
    expect(previewRequest(input)?.mission_id).toBe(goldenRequest.mission_id);
    expect(previewRequest('{}')).toBeUndefined();
    expect(() => decodeRun({ ...run, policyId: 'unrecognised' })).toThrow();
    expect(() => decodeResponse({ ...goldenResponse, extra: 1 })).toThrow();
  });
});
