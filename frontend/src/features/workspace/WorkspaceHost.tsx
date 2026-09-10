import { memo, useCallback } from 'react';
import { Layout, type ITabRenderValues, type TabNode } from 'flexlayout-react';
import { PaneHost, type PaneHooks } from './PaneHost';
import { isViewId } from './viewRegistry';
import type { WorkspaceBridge } from './workspaceBridge';

function identifyTab(node: TabNode, values: ITabRenderValues) {
  // FlexLayout owns tab semantics and keyboard behaviour. Stable IDs support focus restoration.
  values.content = (
    <span id={`workspace-tab-${node.getId()}`}>{node.getName()}</span>
  );
}
export const WorkspaceHost = memo(function WorkspaceHost({
  bridge,
  ...hooks
}: PaneHooks & { bridge: WorkspaceBridge }) {
  const { onPaneEvent, renderExtension } = hooks;
  const factory = useCallback(
    (node: TabNode) => {
      const id = node.getId();
      return isViewId(id) ? (
        <PaneHost
          id={id}
          node={node}
          bridge={bridge}
          onPaneEvent={onPaneEvent}
          renderExtension={renderExtension}
        />
      ) : null;
    },
    [bridge, onPaneEvent, renderExtension],
  );
  return (
    <Layout
      model={bridge.layoutModel}
      factory={factory}
      onRenderTab={identifyTab}
      supportsPopout={bridge.allowPopout}
      popoutURL="/popout.html"
      realtimeResize
      keyMap={{ focusTabToggle: 'F6' }}
      invalidateTabContentOnParentRender={false}
    />
  );
});
