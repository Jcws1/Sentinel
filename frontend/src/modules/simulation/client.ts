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
  /** The read operation whose failure is shown; its next success clears it. */
  errorScope?: 'catalog' | 'run' | 'commands' | 'command';
  message?: string;
  blocked?: boolean;
  commands?: readonly SimulationCommandSummary[];
  commandsAfter?: number;
  /** Run being loaded, so the picker keeps showing the operator's choice. */
  inspecting?: string;
}

/** The authority did not answer (network failure or timeout): outcome unknown. */
class AuthorityUnreachable extends Error {}
const OUTCOME_UNKNOWN =
  'Your exact command is saved; retry it when the authority is available.';
function readFailure(error: unknown, what: string) {
  return error instanceof AuthorityUnreachable
    ? `${what} unavailable: the authority is unreachable. Try again when it is available.`
    : error instanceof Error
      ? error.message
      : `${what} unavailable.`;
}
/** A failed read names what failed and, for a server error, that the authority is down. */
function unavailable(what: string, status: number) {
  return status >= 500
    ? `${what} unavailable: the authority answered HTTP ${status}. Try again when it is available.`
    : `${what} unavailable (HTTP ${status}).`;
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
      error: `The saved Simulation session in this browser could not be read, so it is left untouched and nothing can be sent. To start again, copy the browser-storage entry "${simulationStorageKey}" if you need it, then remove it (for example in the browser's developer tools) and reload.`,
    };
  }
  snapshot = immutableCopy(state);
  function publish() {
    if (disposed) return;
    snapshot = immutableCopy(state);
    for (const listener of listeners) listener();
  }
  /**
   * Truthful operator text when browser storage refuses to protect a command.
   * A control body is small, so its refusal names the saved draft instead.
   */
  function refusal(error: unknown, control?: 'HOLD' | 'ABORT') {
    if (!(error instanceof DOMException && error.name === 'QuotaExceededError'))
      return readFailure(error, 'Recorded command input');
    return control
      ? `Browser storage is full: the saved draft leaves no room to protect this ${control} command across reload. It has not been sent. Shorten or clear the draft, then retry ${control}.`
      : 'Browser storage is full: this request is too large to protect across reload with its exact pending copy. It has not been sent. Submit a smaller batch or use the HTTP API.';
  }
  /** A control that could not be prepared was never sent: say so, and why. */
  function controlFailure(error: unknown, control: 'HOLD' | 'ABORT') {
    if (error instanceof DOMException && error.name === 'QuotaExceededError')
      return refusal(error, control);
    const reason =
      error instanceof AuthorityUnreachable
        ? `${error.message} Try again when it is available.`
        : error instanceof Error
          ? error.message
          : 'Its recorded input could not be read.';
    return reason.includes('has not been sent')
      ? reason
      : `${control} not sent. ${reason}`;
  }
  /** Clear a read failure once the same operation succeeds again. */
  function recovered(scope: SimulationState['errorScope']) {
    return state.errorScope === scope
      ? { error: undefined, errorScope: undefined }
      : {};
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
    } catch (error) {
      throw new AuthorityUnreachable(
        controller.signal.aborted
          ? 'The authority did not answer in time.'
          : 'The authority is unreachable.',
        { cause: error },
      );
    } finally {
      clearTimeout(timer);
      controllers.delete(controller);
    }
  }
  /** Reload the run catalog; true only when this call's result was applied. */
  async function refresh() {
    const generation = ++catalogGeneration;
    let applied = false;
    try {
      const response = await request('/runs');
      if (!response.ok)
        throw new Error(unavailable('Simulation run catalog', response.status));
      const values: unknown = await response.json();
      if (!Array.isArray(values))
        throw new Error('Invalid simulation run catalog.');
      const runs = values.map(decodeRun);
      if (disposed || generation !== catalogGeneration) return;
      state = {
        ...state,
        ...recovered('catalog'),
        runs,
        selected: state.selected
          ? (runs.find((r) => r.missionId === state.selected!.missionId) ??
            state.selected)
          : undefined,
      };
      applied = true;
    } catch (error) {
      if (!disposed && generation === catalogGeneration)
        state = {
          ...state,
          error: readFailure(error, 'Simulation run catalog'),
          errorScope: 'catalog',
        };
    }
    publish();
    return applied;
  }
  async function inspect(missionId: string) {
    const generation = ++selectionGeneration;
    state = {
      ...state,
      loading: true,
      inspecting: missionId,
      selected: undefined,
      result: undefined,
      resultCommandId: undefined,
      commands: undefined,
      commandsAfter: undefined,
      ...(state.errorScope ? { error: undefined, errorScope: undefined } : {}),
    };
    publish();
    try {
      const response = await request(`/runs/${encodeURIComponent(missionId)}`);
      if (!response.ok)
        throw new Error(unavailable('Simulation run', response.status));
      const run = decodeRun(await response.json());
      if (run.missionId !== missionId)
        throw new Error('Simulation run identity mismatch.');
      let result: SimulationResponse | undefined;
      if (run.phase === 'ready') {
        const receipt = await request(
          `/command-result?command_id=${encodeURIComponent(run.commandId)}`,
        );
        if (!receipt.ok)
          throw new Error(
            unavailable('Recorded simulation result', receipt.status),
          );
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
          error: readFailure(error, 'Recorded run'),
          errorScope: 'run',
        };
    } finally {
      if (!disposed && generation === selectionGeneration) {
        state = { ...state, loading: false, inspecting: undefined };
        publish();
      }
    }
  }
  async function loadCommands(after = 0) {
    const run = state.selected;
    if (!run || state.loading) return;
    const generation = selectionGeneration;
    state = { ...state, loading: true };
    publish();
    try {
      const response = await request(
        `/runs/${encodeURIComponent(run.missionId)}/commands?after=${after}&limit=100`,
      );
      if (!response.ok)
        throw new Error(unavailable('Recorded commands', response.status));
      const body: unknown = await response.json();
      if (!Array.isArray(body))
        throw new Error('Invalid recorded command list.');
      const commands = body.map(decodeCommand);
      if (!disposed && generation === selectionGeneration)
        state = {
          ...state,
          ...recovered('commands'),
          commands,
          commandsAfter: after,
        };
    } catch (error) {
      if (!disposed && generation === selectionGeneration)
        state = {
          ...state,
          error: readFailure(error, 'Recorded commands'),
          errorScope: 'commands',
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
    let reload: number | undefined;
    try {
      persist({ version: 1, draft: state.draft, pending: raw });
    } catch (error) {
      state = { ...state, error: refusal(error) };
      publish();
      return;
    }
    const generation = selectionGeneration;
    state = {
      ...state,
      pending: raw,
      busy: true,
      error: undefined,
      errorScope: undefined,
      message: 'Waiting for authoritative commit…',
    };
    publish();
    try {
      const response = await request('/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: raw,
      });
      let value: unknown;
      try {
        value = JSON.parse(await response.text());
      } catch {
        value = undefined;
      }
      if (disposed) return;
      if ([400, 409, 422].includes(response.status)) {
        const envelope = value as
          | {
              error?: { code?: string; message?: string; path?: string };
              command_ack?: {
                error_code?: string;
                error_message?: string;
                error_path?: string;
              };
            }
          | undefined;
        const message =
          envelope?.error?.message ?? envelope?.command_ack?.error_message;
        if (typeof message !== 'string')
          throw new Error(
            `The authority's rejection could not be read; outcome unknown. ${OUTCOME_UNKNOWN}`,
          );
        const code = envelope?.error?.code ?? envelope?.command_ack?.error_code;
        const path = envelope?.error?.path ?? envelope?.command_ack?.error_path;
        persist({ version: 1, draft: state.draft });
        state = {
          ...state,
          pending: undefined,
          error: `${code ? `${code}: ` : ''}${message}${path ? ` (at ${path})` : ''}`,
          message:
            'Command rejected by the authority. No run was created or changed.',
        };
      } else {
        if (!response.ok)
          throw new Error(
            `Authority unavailable (HTTP ${response.status}); outcome unknown. ${OUTCOME_UNKNOWN}`,
          );
        let result: SimulationResponse;
        try {
          result = decodeResponse(value);
        } catch {
          throw new Error(
            `The acknowledgement could not be read; outcome unknown. ${OUTCOME_UNKNOWN}`,
          );
        }
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
        const id = result.command_ack.command_id,
          action = input.command.action;
        state = {
          ...state,
          pending: undefined,
          message: `${id}: ${action} committed · ${result.command_ack.run_status}`,
          ...(generation === selectionGeneration
            ? { result, resultCommandId: id }
            : {}),
        };
        const fresh = await refresh();
        if (disposed) return;
        const current = state.runs.find(
          (run) => run.externalMissionId === result.mission_id,
        );
        // An identical earlier command returns its stored result (idempotency):
        // say so, and name the run's actual current state. Only a freshly
        // loaded catalog can tell; a stale one keeps the commit wording.
        if (
          fresh &&
          current &&
          current.phase === 'ready' &&
          current.commandId !== id
        )
          state = {
            ...state,
            message: `${id}: already recorded. The stored ${action} result was returned; no new command was created. Current run state: ${current.state ?? 'RECEIVED'}.`,
          };
        if (generation === selectionGeneration) {
          // A loaded command list belongs to one run: another run's list never
          // stays under the new selection, and the same run's list gains the
          // command just committed.
          const same =
            !!current && current.missionId === state.selected?.missionId;
          if (same && state.commands) reload = state.commandsAfter ?? 0;
          state = {
            ...state,
            selected: current,
            ...(same ? {} : { commands: undefined, commandsAfter: undefined }),
          };
        }
      }
    } catch (error) {
      if (!disposed)
        state = {
          ...state,
          error:
            error instanceof AuthorityUnreachable
              ? `${error.message} Outcome unknown. ${OUTCOME_UNKNOWN}`
              : error instanceof Error
                ? error.message
                : `Command outcome unknown. ${OUTCOME_UNKNOWN}`,
          message: 'Pending identity and body retained.',
        };
    } finally {
      if (!disposed) {
        state = { ...state, busy: false };
        publish();
      }
    }
    if (reload !== undefined && !disposed) await loadCommands(reload);
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
            'Draft could not be saved to browser storage, so the previous draft is retained. Batches too large for browser storage can be submitted through the HTTP API.',
        };
      }
      publish();
    },
    submit,
    refresh,
    inspect,
    commands: loadCommands,
    async inspectCommand(commandId: string) {
      const run = state.selected;
      if (!run) return;
      // A newer choice supersedes an in-flight one (generation), so the picker
      // stays usable while a result loads.
      const generation = ++selectionGeneration;
      state = {
        ...state,
        loading: true,
        result: undefined,
        resultCommandId: commandId,
      };
      publish();
      try {
        const response = await request(
          `/command-result?command_id=${encodeURIComponent(commandId)}`,
        );
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? 'This command has no committed result.'
              : unavailable('Recorded command result', response.status),
          );
        const result = decodeResponse(await response.json());
        if (
          result.mission_id !== run.externalMissionId ||
          result.command_ack.command_id !== commandId
        )
          throw new Error('Recorded command identity mismatch.');
        if (!disposed && generation === selectionGeneration)
          state = {
            ...state,
            ...recovered('command'),
            result,
            resultCommandId: commandId,
          };
      } catch (error) {
        if (!disposed && generation === selectionGeneration)
          state = {
            ...state,
            error: readFailure(error, 'Recorded command result'),
            errorScope: 'command',
          };
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
      state = { ...state, busy: true, error: undefined, errorScope: undefined };
      publish();
      try {
        const response = await request(
          `/runs/${encodeURIComponent(run.missionId)}/input`,
        );
        if (!response.ok)
          throw new Error(
            response.status >= 500
              ? `The authority is unavailable (HTTP ${response.status}). Try again when it is available.`
              : `The run's recorded input could not be read (HTTP ${response.status}).`,
          );
        const raw = await response.text();
        const input = previewRequest(raw);
        if (!input || input.mission_id !== run.externalMissionId)
          throw new Error('The recorded input does not match this run.');
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
        if (!disposed)
          state = { ...state, error: controlFailure(error, action) };
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
