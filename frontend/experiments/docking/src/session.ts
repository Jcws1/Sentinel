// UI-only probe state. There is no mission backend or world state in this experiment.
export interface ProbeState { selection: string; time: number; revision: number }
export interface ProbeSession {
  get: () => ProbeState;
  subscribe: (listener: () => void) => () => void;
  change: (patch: Partial<Pick<ProbeState, 'selection' | 'time'>>) => void;
}
function createSession(): ProbeSession {
  let state: ProbeState = { selection: 'ENTITY-A', time: 0, revision: 0 };
  const listeners = new Set<() => void>();
  return { get: () => state, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    change: patch => { state = { ...state, ...patch, revision: state.revision + 1 }; listeners.forEach(fn => fn()); } };
}
declare global { interface Window { probeSession: ProbeSession; probe: { layout: () => unknown; engine: string } } }
// Golden's independent document explicitly joins the parent-owned UI session.
// This intentionally does not claim independent-window survival or backend synchronization.
export const session: ProbeSession = window.opener?.probeSession ?? createSession();
window.probeSession = session;
