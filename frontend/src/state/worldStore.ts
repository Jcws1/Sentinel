import { createStore } from 'zustand/vanilla';
import type { ImmutableFrame } from '../contracts/types';

export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'stale' | 'disconnected';
export interface WorldCache {
  live?: ImmutableFrame;
  connection: ConnectionStatus;
  error?: string;
}

/** Private backend replica. The application runtime owns the returned writer. */
export function createWorldStore() {
  return createStore<WorldCache>(() => ({ connection: 'idle' }));
}
