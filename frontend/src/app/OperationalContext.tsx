import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ApplicationRuntime } from './runtime';

/** Only the application entry point supplies a runtime. The workspace harness does not. */
export const OperationalContext = createContext<ApplicationRuntime | null>(
  null,
);
export const useOperationalRuntime = () => useContext(OperationalContext);

/** Hidden dock tabs retain local editing state but do not process live telemetry. */
export const PaneVisibilityContext = createContext(true);
const dormant = () => () => {};
export function useOperationalSnapshot(runtime: ApplicationRuntime) {
  const visible = useContext(PaneVisibilityContext);
  // Switching back subscribes and reads the current snapshot before paint. The
  // shared owner continues transport, command reconciliation and recording.
  return useSyncExternalStore(
    visible ? runtime.subscribe : dormant,
    runtime.getSnapshot,
  );
}
