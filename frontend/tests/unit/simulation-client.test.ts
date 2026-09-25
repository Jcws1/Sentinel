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

  it('explains a browser storage quota refusal and sends nothing', async () => {
    const fetcher = vi.fn();
    const store = storage();
    const limited = {
      ...store,
      setItem(key: string, value: string) {
        if (JSON.parse(value).pending)
          throw new DOMException('Exceeded the quota', 'QuotaExceededError');
        store.setItem(key, value);
      },
    };
    const client = createSimulationClient({
      base: '/api',
      fetcher,
      storage: limited,
    });
    client.edit(input);
    await client.submit();
    expect(fetcher).not.toHaveBeenCalled();
    expect(client.getSnapshot().error).toContain(
      'too large to protect across reload',
    );
    expect(client.getSnapshot().error).toContain('It has not been sent.');
    expect(client.getSnapshot().pending).toBeUndefined();
    expect(client.getSnapshot().draft).toBe(input);
    client.dispose();
  });

  it('names the saved draft when storage refuses a small control command', async () => {
    const store = storage();
    const limited = {
      ...store,
      setItem(key: string, value: string) {
        if (JSON.parse(value).pending)
          throw new DOMException('Exceeded the quota', 'QuotaExceededError');
        store.setItem(key, value);
      },
    };
    let posted = false;
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === 'POST') posted = true;
      if (url.endsWith('/input')) return new Response(input);
      if (url.endsWith('/runs')) return response([run]);
      if (url.includes('/runs/')) return response(run);
      return response(goldenResponse);
    };
    const client = createSimulationClient({
      base: '/api',
      storage: limited,
      fetcher,
    });
    client.edit(input);
    await client.inspect(run.missionId);
    await client.control('HOLD');
    const { error, pending, draft } = client.getSnapshot();
    expect(error).toContain(
      'the saved draft leaves no room to protect this HOLD command',
    );
    expect(error).toContain('It has not been sent.');
    expect(error).not.toContain('too large');
    expect(posted).toBe(false);
    expect(pending).toBeUndefined();
    expect(draft).toBe(input);
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
    // The operator learns which entry blocks the pane and a safe next step.
    expect(client.getSnapshot().error).toContain(simulationStorageKey);
    expect(client.getSnapshot().error).toContain('left untouched');
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
            {
              error: {
                code: 'EXAMPLE_CODE',
                message: 'Rejected',
                path: '/command',
              },
            },
            status,
          ),
      });
      client.edit(input);
      await client.submit();
      expect(client.getSnapshot().pending).toBeUndefined();
      expect(client.getSnapshot().error).toBe(
        'EXAMPLE_CODE: Rejected (at /command)',
      );
      // A rejection never creates or changes a run, whether or not one exists.
      expect(client.getSnapshot().message).toBe(
        'Command rejected by the authority. No run was created or changed.',
      );
      client.dispose();
    },
  );

  it.each([
    [
      'network failure',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'The authority is unreachable. Outcome unknown.',
    ],
    [
      'empty 502',
      () => Promise.resolve(new Response('', { status: 502 })),
      'Authority unavailable (HTTP 502); outcome unknown.',
    ],
    [
      'unreadable acknowledgement',
      () => Promise.resolve(new Response('{', { status: 200 })),
      'The acknowledgement could not be read; outcome unknown.',
    ],
  ] as const)(
    'explains an unknown outcome after a %s and keeps the exact command',
    async (_, post, expected) => {
      const client = createSimulationClient({
        base: '/api',
        storage: storage(),
        fetcher: () => post(),
      });
      client.edit(input);
      await client.submit();
      const { error, pending } = client.getSnapshot();
      expect(error).toContain(expected);
      expect(error).toContain('Your exact command is saved');
      expect(error).not.toMatch(/Failed to fetch|JSON|^Error:/);
      expect(pending).toBe(input);
      client.dispose();
    },
  );

  it('says when an identical earlier command returned its stored result', async () => {
    const aborted = { ...run, commandId: 'ABORT-1', state: 'ABORTED' };
    const fetcher: Fetcher = async (url) =>
      url.endsWith('/runs') ? response([aborted]) : response(goldenResponse);
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    client.edit(input);
    await client.submit();
    const { message, selected } = client.getSnapshot();
    expect(message).toContain('already recorded');
    expect(message).toContain('no new command was created');
    expect(message).toContain('Current run state: ABORTED');
    expect(message).not.toContain('committed');
    expect(selected?.state).toBe('ABORTED');
    client.dispose();
  });

  it('names a fresh commit with its action and recorded run state', async () => {
    const fetcher: Fetcher = async (url) =>
      url.endsWith('/runs') ? response([run]) : response(goldenResponse);
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    client.edit(input);
    await client.submit();
    expect(client.getSnapshot().message).toBe(
      `${goldenRequest.command.command_id}: START committed · ${goldenResponse.command_ack.run_status}`,
    );
    client.dispose();
  });

  it('keeps the commit wording when the catalog cannot be refreshed after a commit', async () => {
    const stale = { ...run, commandId: 'EARLIER-1', state: 'RUNNING' };
    let catalogUp = true;
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === 'POST') {
        catalogUp = false;
        return response(goldenResponse);
      }
      return url.endsWith('/runs') && catalogUp
        ? response([stale])
        : new Response('', { status: 502 });
    };
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    await client.refresh();
    client.edit(input);
    await client.submit();
    expect(client.getSnapshot().message).toContain('START committed');
    expect(client.getSnapshot().message).not.toContain('already recorded');
    client.dispose();
  });

  it('clears a read failure when that read next succeeds, and only then', async () => {
    let catalogUp = false;
    const fetcher: Fetcher = async (_url, init) => {
      if (init?.method === 'POST')
        return response(
          { error: { code: 'INVALID_JSON', message: 'Bad', path: '' } },
          400,
        );
      return catalogUp ? response([run]) : new Response('', { status: 502 });
    };
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    await client.refresh();
    expect(client.getSnapshot().error).toBe(
      'Simulation run catalog unavailable: the authority answered HTTP 502. Try again when it is available.',
    );
    catalogUp = true;
    await client.refresh();
    expect(client.getSnapshot().error).toBeUndefined();
    client.edit(input);
    await client.submit();
    expect(client.getSnapshot().error).toBe('INVALID_JSON: Bad');
    await client.refresh();
    expect(client.getSnapshot().error).toBe('INVALID_JSON: Bad');
    client.dispose();
  });

  it('keeps the chosen run visible while it loads', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetcher: Fetcher = async (url) => {
      if (url.includes('/runs/')) {
        await gate;
        return response(run);
      }
      return response(goldenResponse);
    };
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    const loading = client.inspect(run.missionId);
    expect(client.getSnapshot().inspecting).toBe(run.missionId);
    expect(client.getSnapshot().loading).toBe(true);
    release();
    await loading;
    expect(client.getSnapshot().inspecting).toBeUndefined();
    expect(client.getSnapshot().selected?.missionId).toBe(run.missionId);
    client.dispose();
  });

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

  const summary = (commandId: string, sequence: number, action = 'START') => ({
    action,
    commandId,
    sequence,
    state: 'completed',
    receivedAt: '2026-09-20T00:00:00.000Z',
    completedAt: '2026-09-20T00:00:01.000Z',
  });

  it("drops another run's command list when a submission selects a different run", async () => {
    const other = {
      ...run,
      missionId: 'other',
      externalMissionId: 'OTHER',
      commandId: 'OTHER-CMD',
    };
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === 'POST')
        return response({
          ...goldenResponse,
          mission_id: 'OTHER',
          command_ack: {
            ...goldenResponse.command_ack,
            command_id: 'OTHER-CMD',
          },
        });
      if (url.endsWith('/runs')) return response([run, other]);
      if (url.includes('/commands?'))
        return response([summary(run.commandId, 1)]);
      if (url.includes('/runs/')) return response(run);
      return response(goldenResponse);
    };
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    await client.inspect(run.missionId);
    await client.commands();
    expect(client.getSnapshot().commands).toHaveLength(1);
    client.edit(
      JSON.stringify({
        ...goldenRequest,
        mission_id: 'OTHER',
        command: { ...goldenRequest.command, command_id: 'OTHER-CMD' },
      }),
    );
    await client.submit();
    const state = client.getSnapshot();
    expect(state.selected?.missionId).toBe('other');
    expect(state.result?.mission_id).toBe('OTHER');
    expect(state.commands).toBeUndefined();
    client.dispose();
  });

  it('reloads a loaded command list after a command for the same run commits', async () => {
    let holdId = '';
    const fetcher: Fetcher = async (url, init) => {
      if (init?.method === 'POST') {
        holdId = JSON.parse(String(init.body)).command.command_id;
        return response({
          ...goldenResponse,
          command_ack: {
            ...goldenResponse.command_ack,
            command_id: holdId,
            run_status: 'HELD',
          },
          results_by_timestamp: {},
        });
      }
      if (url.endsWith('/input')) return new Response(input);
      if (url.endsWith('/runs'))
        return response([
          holdId ? { ...run, state: 'HELD', commandId: holdId } : run,
        ]);
      if (url.includes('/commands?'))
        return response(
          holdId
            ? [summary(run.commandId, 1), summary(holdId, 2, 'HOLD')]
            : [summary(run.commandId, 1)],
        );
      if (url.includes('/runs/')) return response(run);
      return response(goldenResponse);
    };
    const client = createSimulationClient({
      base: '/api',
      storage: storage(),
      fetcher,
    });
    await client.inspect(run.missionId);
    await client.commands();
    expect(client.getSnapshot().commands?.map((c) => c.action)).toEqual([
      'START',
    ]);
    await client.control('HOLD');
    expect(client.getSnapshot().message).toContain('HOLD committed · HELD');
    expect(client.getSnapshot().commands?.map((c) => c.action)).toEqual([
      'START',
      'HOLD',
    ]);
    client.dispose();
  });

  it.each([
    [
      'answers HTTP 502',
      () => Promise.resolve(new Response('', { status: 502 })),
      'HOLD not sent. The authority is unavailable (HTTP 502). Try again when it is available.',
    ],
    [
      'is unreachable',
      () => Promise.reject(new TypeError('Failed to fetch')),
      'HOLD not sent. The authority is unreachable. Try again when it is available.',
    ],
  ] as const)(
    'says a control was not sent when the authority %s',
    async (_, readInput, expected) => {
      let posted = false;
      const fetcher: Fetcher = async (url, init) => {
        if (init?.method === 'POST') posted = true;
        if (url.endsWith('/input')) return readInput();
        if (url.includes('/runs/')) return response(run);
        return response(goldenResponse);
      };
      const client = createSimulationClient({
        base: '/api',
        storage: storage(),
        fetcher,
      });
      await client.inspect(run.missionId);
      await client.control('HOLD');
      expect(client.getSnapshot().error).toBe(expected);
      expect(client.getSnapshot().pending).toBeUndefined();
      expect(posted).toBe(false);
      client.dispose();
    },
  );

  it('explains a refused draft save and points large batches to the HTTP API', () => {
    const client = createSimulationClient({
      base: '/api',
      fetcher: vi.fn(),
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException('Quota', 'QuotaExceededError');
        },
      },
    });
    client.edit(input);
    const { error, draft } = client.getSnapshot();
    expect(error).toContain('could not be saved to browser storage');
    expect(error).toContain('HTTP API');
    expect(draft).toBe('');
    client.dispose();
  });

  it('rejects malformed projections and leaves validation completeness at the backend', () => {
    expect(previewRequest(input)?.mission_id).toBe(goldenRequest.mission_id);
    expect(previewRequest('{}')).toBeUndefined();
    expect(() => decodeRun({ ...run, policyId: 'unrecognised' })).toThrow();
    expect(() => decodeResponse({ ...goldenResponse, extra: 1 })).toThrow();
  });
});
