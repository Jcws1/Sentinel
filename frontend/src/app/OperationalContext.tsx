import { createContext, useContext } from 'react';
import type { ApplicationRuntime } from './runtime';

/** Only the application entry point supplies a runtime. The workspace harness does not. */
export const OperationalContext = createContext<ApplicationRuntime | null>(
  null,
);
export const useOperationalRuntime = () => useContext(OperationalContext);
