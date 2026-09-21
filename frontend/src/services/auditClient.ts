import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import schema from '../../../contracts/sentinel/v1.16/analytics.schema.json';
import type { AuditPage, AuditQuery } from '../contracts/generated';
import type { Fetcher } from './api';

const ajv = new Ajv2020({
  strict: false,
  strictNumbers: true,
  ownProperties: true,
});
addFormats(ajv);
const valid = ajv.compile<AuditPage>({
  $defs: schema.$defs,
  $ref: '#/$defs/AuditPage',
});
export interface AuditState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: AuditPage;
  error?: string;
}
export function createAuditClient(base: string, fetcher: Fetcher) {
  let state: AuditState = { status: 'idle' },
    missionId: string | undefined;
  let controller: AbortController | undefined,
    generation = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((f) => f());
  const cancel = () => {
    generation++;
    controller?.abort();
    controller = undefined;
  };
  return {
    get: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          cancel();
          state = { status: 'idle' };
        }
      };
    },
    sync(id?: string) {
      if (missionId !== id) {
        cancel();
        missionId = id;
        state = { status: 'idle' };
        notify();
      }
    },
    invalidate() {
      cancel();
      state = { status: 'idle' };
      notify();
    },
    async query(id: string, query: AuditQuery) {
      cancel();
      missionId = id;
      const token = generation,
        abort = new AbortController();
      controller = abort;
      const timer = setTimeout(() => {
        if (token !== generation) return;
        cancel();
        state = { status: 'error', error: 'Audit read timed out.' };
        notify();
      }, 10000);
      state = { status: 'loading' };
      notify();
      try {
        const response = await fetcher(
          `${base}/missions/${encodeURIComponent(id)}/audit-query`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(query),
            signal: abort.signal,
          },
        );
        if (!response.ok) throw Error(`Audit unavailable (${response.status})`);
        const data: unknown = await response.json();
        if (
          !valid(data) ||
          data.missionId !== id ||
          data.frameId !== query.frameId ||
          data.fromAt !== query.fromAt ||
          data.toAt !== query.toAt
        )
          throw Error('Audit recording anchor mismatch');
        if (token !== generation) return;
        state = { status: 'ready', data };
      } catch (error) {
        if (token !== generation) return;
        state = {
          status: 'error',
          error: error instanceof Error ? error.message : 'Audit unavailable',
        };
      } finally {
        clearTimeout(timer);
        if (token === generation) {
          controller = undefined;
          notify();
        }
      }
    },
    dispose() {
      cancel();
      listeners.clear();
      state = { status: 'idle' };
    },
  };
}
