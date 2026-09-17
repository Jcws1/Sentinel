import type { ApplicationRuntime } from '../../app/runtime';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';

/** UI intent only. The runtime remains the selection/history authority. */
export function selectForDetails(
  runtime: ApplicationRuntime,
  bridge: WorkspaceBridge,
  id?: string,
  additive = false,
) {
  runtime.selectEntity(id, additive);
  if (id && runtime.getSnapshot().session.selection.primary?.kind === 'entity')
    bridge.revealDetails();
}
