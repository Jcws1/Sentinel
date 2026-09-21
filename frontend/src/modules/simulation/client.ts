import type {
  SimulationCommandSummary,
  SimulationRunStatus,
} from '../../contracts/generated';
import type { Fetcher } from '../../services/api';
import { immutableCopy } from '../../world/immutable';
import {
  decodeCommand,
  decodeResponse,
  decodeRun,
  previewRequest,
} from './contracts';
import type { SimulationResponse } from './response.generated';

export const simulationStorageKey = 'sentinel.simulation.session.v1';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
interface Saved {
  version: 1;
  draft: string;
  pending?: string;
}
export interface SimulationState {
  draft: string;
  pending?: string;
  busy: boolean;
  loading: boolean;
  runs: readonly SimulationRunStatus[];
  selected?: SimulationRunStatus;
  result?: SimulationResponse;
  resultCommandId?: string;
  error?: string;
  message?: string;
  blocked?: boolean;
  commands?: readonly SimulationCommandSummary[];
  commandsAfter?: number;
}

function localStore(): Store | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return;
  }
}

export function createSimulationClient(options: {
  base: string;
  fetcher: Fetcher;
  storage?: Store | null;
  timeoutMs?: number;
}) {
  const storage =
    options.storage === undefined ? localStore() : options.storage;
  const listeners = new Set<() => void>();
  let state: SimulationState = {
    draft: '',
    busy: false,
    loading: false,
    runs: [],
  };
  let snapshot = immutableCopy(state);
  let disposed = false;
  let selectionGeneration = 0;
  let catalogGeneration = 0;
  const controllers = new Set<AbortController>();
  try {
    const raw = storage?.getItem(simulationStorageKey);
    if (raw) {
      const saved: Saved = JSON.parse(raw);
      if (
        saved.version !== 1 ||
        typeof saved.draft !== 'string' ||
        (saved.pending !== undefined && typeof saved.pending !== 'string') ||
        Object.keys(saved).some(
          (k) => !['version', 'draft', 'pending'].includes(k),
        )
      )
        throw new Error('Invalid saved simulation session.');
      state = {
        ...state,
        draft: saved.draft,
        pending: saved.pending,
        message: saved.pending
          ? 'Uncertain command recovered. Retry its exact saved body.'
          : undefined,
      };
    }
  } catch {
    state = {
      ...state,
      blocked: true,
      error:
        'Saved simulation session could not be read. Existing browser data has been preserved.',
    };
  }
  snapshot = immutableCopy(state);
  function publish() {
    if (disposed) return;
    snapshot = immutableCopy(state);
    for (const listener of listeners) listener();
  }
  function persist(next: Saved) {
    if (!storage)
      throw new Error(
        'Durable browser storage is unavailable. The command has not been sent.',
      );
    storage.setItem(simulationStorageKey, JSON.stringify(next));
  }
  async function request(path: string, init?: RequestInit) {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 30_000,
    );
    try {
      const response = await options.fetcher(
        `${options.base}/simulation/v1${path}`,
        { ...init, signal: controller.signal },
      );
      const body = await response.arrayBuffer();
      if (controller.signal.aborted) throw new Error('Request timed out.');
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  async function refresh() {
    const generation = ++catalogGeneration;
    try {
      const response = await request('/runs');
      if (!response.ok) throw new Error('Simulation run catalog unavailable.');
      const values: unknown = await response.json();
      if (!Array.isArray(values))
        throw new Error('Invalid simulation run catalog.');
      const runs = values.map(decodeRun);
      if (disposed || generation !== catalogGeneration) return;
      state = {
        ...state,
        runs,
        selected: state.selected
          ? (runs.find((r) => r.missionId === state.selected!.missionId) ??
            state.selected)
          : undefined,
      };
    } catch (error) {
      if (!disposed && generation === catalogGeneration)
        state = {
          ...state,
          error:
            error instanceof Error
              ? error.message
              : 'Simulation runs unavailable.',
        };
    }
    publish();
  }
  async function inspect(missionId: string) {
    const generation = ++selectionGeneration;
    state = {
      ...state,
      loading: true,
      selected: undefined,
      result: undefined,
      resultCommandId: undefined,
      commands: undefined,
      commandsAfter: undefined,
      error: undefined,
    };
    publish();
    try {
      const response = await request(`/runs/${encodeURIComponent(missionId)}`);
      if (!response.ok) throw new Error('Simulation run unavailable.');
      const run = decodeRun(await response.json());
      if (run.missionId !== missionId)
        throw new Error('Simulation run identity mismatch.');
      let result: SimulationResponse | undefined;
      if (run.phase === 'ready') {
        const receipt = await request(
          `/command-result?command_id=${encodeURIComponent(run.commandId)}`,
        );
        if (!receipt.ok)
          throw new Error('Recorded simulation result unavailable.');
        result = decodeResponse(await receipt.json());
        if (
          result.command_ack.command_id !== run.commandId ||
          result.mission_id !== run.externalMissionId
        )
          throw new Error('Recorded simulation identity mismatch.');
      }
      if (disposed || generation !== selectionGeneration) return;
      state = {
        ...state,
        selected: run,
        result,
        resultCommandId: result ? run.commandId : undefined,
      };
    } catch (error) {
      if (!disposed && generation === selectionGeneration)
        state = {
          ...state,
          error:
            error instanceof Error
              ? error.message
              : 'Recorded result unavailable.',
        };
    } finally {
      if (!disposed && generation === selectionGeneration) {
        state = { ...state, loading: false };
        publish();
      }
    }
  }
  async function submit(retry = false) {
    if (disposed || state.busy || state.blocked || (state.pending && !retry))
      return;
    const raw = retry ? state.pending : state.draft;
    if (!raw?.trim()) return;
    try {
      persist({ version: 1, draft: state.draft, pending: raw });
    } catch (error) {
      state = { ...state, error: String(error) };
      publish();
      return;
    }
    const generation = selectionGeneration;
    state = {
      ...state,
      pending: raw,
      busy: true,
      error: undefined,
      message: 'Waiting for authoritative commit…',
    };
    publish();
    try {
      const response = await request('/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      });
      const value: unknown = await response.json();
      if (disposed) return;
      if ([400, 409, 422].includes(response.status)) {
        const envelope = value as {
          error?: { message?: string; path?: string };
          command_ack?: { error_message?: string; error_path?: string };
        };
        const message =
          envelope.error?.message ?? envelope.command_ack?.error_message;
        if (typeof message !== 'string')
          throw new Error('Invalid rejection; preserve pending identity.');
        persist({ version: 1, draft: state.draft });
        state = {
          ...state,
          pending: undefined,
          error: `${message} ${envelope.error?.path ?? envelope.command_ack?.error_path ?? ''}`,
          message:
            'Command rejected by the authority. Prior committed run remains unchanged.',
        };
      } else {
        if (!response.ok)
          throw new Error(
            'Authority unavailable; outcome may have committed. Retry the exact saved command.',
          );
        const result = decodeResponse(value);
        const input = previewRequest(raw);
        if (
          !input ||
          result.command_ack.status !== 'SUCCEEDED' ||
          result.mission_id !== input.mission_id ||
          result.command_ack.command_id !== input.command.command_id ||
          result.calibration.profile_id !==
            input.calibration_profile.profile_id ||
          result.calibration.version !== input.calibration_profile.version
        )
          throw new Error(
            'Acknowledgement identity mismatch; retain pending request.',
          );
        persist({ version: 1, draft: state.draft });
        state = {
          ...state,
          pending: undefined,
          message: `${result.command_ack.command_id}: committed · ${result.command_ack.run_status}`,
          ...(generation === selectionGeneration
            ? { result, resultCommandId: result.command_ack.command_id }
            : {}),
        };
        await refresh();
        if (!disposed && generation === selectionGeneration) {
          state = {
            ...state,
            selected: state.runs.find(
              (run) => run.externalMissionId === result.mission_id,
            ),
          };
        }
      }
    } catch (error) {
      if (!disposed)
        state = {
          ...state,
          error:
            error instanceof Error
              ? error.message
              : 'Command outcome uncertain. Retry the exact request.',
          message: 'Pending identity and body retained.',
        };
    } finally {
      if (!disposed) {
        state = { ...state, busy: false };
        publish();
      }
    }
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    edit(draft: string) {
      if (disposed || state.busy || state.pending || state.blocked) return;
      try {
        persist({ version: 1, draft });
        state = { ...state, draft, error: undefined, message: undefined };
      } catch {
        state = {
          ...state,
          error:
            'Draft could not be saved to browser storage. Existing draft retained.',
        };
      }
      publish();
    },
    submit,
    refresh,
    inspect,
    async commands(after = 0) {
      const run = state.selected;
      if (!run || state.loading) return;
      const generation = selectionGeneration;
      state = { ...state, loading: true };
      publish();
      try {
        const response = await request(
          `/runs/${encodeURIComponent(run.missionId)}/commands?after=${after}&limit=100`,
        );
        if (!response.ok) throw new Error('Recorded commands unavailable.');
        const body: unknown = await response.json();
        if (!Array.isArray(body))
          throw new Error('Invalid recorded command list.');
        const commands = body.map(decodeCommand);
        if (!disposed && generation === selectionGeneration)
          state = { ...state, commands, commandsAfter: after };
      } catch (error) {
        if (!disposed && generation === selectionGeneration)
          state = { ...state, error: String(error) };
      } finally {
        if (!disposed && generation === selectionGeneration) {
          state = { ...state, loading: false };
          publish();
        }
      }
    },
    async inspectCommand(commandId: string) {
      const run = state.selected;
      if (!run || state.loading) return;
      const generation = ++selectionGeneration;
      state = {
        ...state,
        loading: true,
        result: undefined,
        resultCommandId: undefined,
      };
      publish();
      try {
        const response = await request(
          `/command-result?command_id=${encodeURIComponent(commandId)}`,
        );
        if (!response.ok)
          throw new Error('This command has no committed result.');
        const result = decodeResponse(await response.json());
        if (
          result.mission_id !== run.externalMissionId ||
          result.command_ack.command_id !== commandId
        )
          throw new Error('Recorded command identity mismatch.');
        if (!disposed && generation === selectionGeneration)
          state = { ...state, result, resultCommandId: commandId };
      } catch (error) {
        if (!disposed && generation === selectionGeneration)
          state = { ...state, error: String(error) };
      } finally {
        if (!disposed && generation === selectionGeneration) {
          state = { ...state, loading: false };
          publish();
        }
      }
    },
    async control(action: 'HOLD' | 'ABORT') {
      const run = state.selected;
      if (
        !run ||
        run.phase !== 'ready' ||
        !['RUNNING', 'HELD'].includes(run.state ?? '') ||
        state.pending ||
        state.busy ||
        state.blocked
      )
        return;
      const generation = selectionGeneration;
      state = { ...state, busy: true, error: undefined };
      publish();
      try {
        const response = await request(
          `/runs/${encodeURIComponent(run.missionId)}/input`,
        );
        if (!response.ok)
          throw new Error('Recorded command input unavailable.');
        const raw = await response.text();
        const input = previewRequest(raw);
        if (!input || input.mission_id !== run.externalMissionId)
          throw new Error('Recorded input identity mismatch.');
        if (disposed || generation !== selectionGeneration) return;
        const now = new Date().toISOString();
        const body = JSON.stringify(
          {
            ...input,
            command: {
              ...input.command,
              action,
              command_id: crypto.randomUUID(),
              issued_at: now,
              execute_at: now,
            },
            samples_by_timestamp: {},
          },
          null,
          2,
        );
        // Controls are explicit user actions; the exact derived body persists first.
        persist({ version: 1, draft: state.draft, pending: body });
        state = { ...state, pending: body, busy: false };
        await submit(true);
      } catch (error) {
        if (!disposed) state = { ...state, error: String(error) };
      } finally {
        if (!disposed) {
          state = { ...state, busy: false };
          publish();
        }
      }
    },
    resultUrl(commandId: string) {
      return `${options.base}/simulation/v1/command-result?command_id=${encodeURIComponent(commandId)}`;
    },
    dispose() {
      disposed = true;
      selectionGeneration++;
      catalogGeneration++;
      for (const controller of controllers) controller.abort();
      listeners.clear();
    },
  };
}
