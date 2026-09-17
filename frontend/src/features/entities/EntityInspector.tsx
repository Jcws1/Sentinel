import type { ViewId } from '../workspace/viewRegistry';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { EntityDetails } from './EntityDetails';

export function EntityInspector({
  id,
  bridge,
}: {
  id: ViewId;
  bridge: WorkspaceBridge;
}) {
  return <EntityDetails id={id} bridge={bridge} />;
}
