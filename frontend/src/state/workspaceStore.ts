import { createStore } from 'zustand/vanilla';
import type { ViewId } from '../features/workspace/viewRegistry';

export interface ViewPlacement {
  id: ViewId;
  location: 'main' | 'float' | 'window';
  selectedInPane: boolean;
}
export interface WorkspaceSnapshot {
  views: readonly ViewPlacement[];
  activeViewId?: ViewId;
  revision: number;
  sidebarMode: 'views' | 'fleet';
  sidebarOpen: boolean;
}
/** Derived workspace metadata. Only WorkspaceBridge writes it. No domain or GPU state. */
export function createWorkspaceMetadata() {
  return createStore<WorkspaceSnapshot>(() => ({
    views: [],
    revision: 0,
    sidebarMode: 'views',
    sidebarOpen: true,
  }));
}
