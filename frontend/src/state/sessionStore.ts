import { createStore } from 'zustand/vanilla';
import type { Entity } from '../contracts/types';

export type ObjectRef = {
  kind: 'entity' | 'track' | 'asset' | 'sensor' | 'zone' | 'task' | 'event';
  id: string;
};
export type TimeState =
  | { mode: 'live'; followLatest: true }
  | {
      mode: 'replay';
      recordingId: string;
      requestedAt: string;
      resolvedFrameId?: string;
      seekGeneration: number;
      playing: boolean;
      rate: number;
    };
export interface SelectionState {
  missionId?: string;
  items: readonly ObjectRef[];
  primary?: ObjectRef;
  revision: number;
}
export interface FilterState {
  search?: string;
  observationStates?: readonly ('tracking' | 'stale' | 'ended' | 'unlocated')[];
  affiliations: readonly Entity['affiliation'][];
  classificationCodes: readonly string[];
  sourceIds: readonly string[];
  zoneIds: readonly string[];
  showUnobserved: boolean;
  showRemoved: boolean;
}
export interface SessionState {
  missionId?: string;
  selection: SelectionState;
  time: TimeState;
  filters: FilterState;
  overlays: {
    zones: boolean;
    history?: boolean;
    historyWindowSeconds?: number;
  };
}
export function initialSession(missionId?: string): SessionState {
  return {
    missionId,
    selection: { missionId, items: [], revision: 0 },
    time: { mode: 'live', followLatest: true },
    overlays: { zones: true },
    filters: {
      affiliations: [],
      classificationCodes: [],
      sourceIds: [],
      zoneIds: [],
      showUnobserved: true,
      showRemoved: false,
    },
  };
}
export function createSessionStore() {
  return createStore<SessionState>(() => initialSession());
}
