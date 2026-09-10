import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import type { TabNode } from 'flexlayout-react';
import { Columns2, PanelBottomClose, X } from 'lucide-react';
import type { WorkspaceBridge } from './workspaceBridge';
import { viewRegistry, type ViewId } from './viewRegistry';

export type PaneLifecycleEvent =
  | { type: 'mount' | 'dispose'; viewId: ViewId }
  | { type: 'visibility'; viewId: ViewId; visible: boolean }
  | { type: 'resize'; viewId: ViewId; width: number; height: number };
export interface PaneHooks {
  onPaneEvent?: (event: PaneLifecycleEvent) => void;
  renderExtension?: (id: ViewId) => ReactNode;
}

export function PaneHost({
  id,
  node,
  bridge,
  onPaneEvent,
  renderExtension,
}: PaneHooks & {
  id: ViewId;
  node: TabNode;
  bridge: WorkspaceBridge;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const owner = element.ownerDocument.defaultView!;
    onPaneEvent?.({ type: 'mount', viewId: id });
    onPaneEvent?.({
      type: 'visibility',
      viewId: id,
      visible: node.isVisible(),
    });
    node.setEventListener('visibility', ({ visible }: { visible: boolean }) => {
      onPaneEvent?.({ type: 'visibility', viewId: id, visible });
    });
    let frame = 0;
    let previous = '';
    const Observer = (owner as Window & typeof globalThis).ResizeObserver;
    const observer = new Observer(() => {
      owner.cancelAnimationFrame(frame);
      frame = owner.requestAnimationFrame(() => {
        const { width, height } = element.getBoundingClientRect();
        const size = `${width}:${height}`;
        if (size !== previous) {
          previous = size;
          onPaneEvent?.({ type: 'resize', viewId: id, width, height });
        }
      });
    });
    observer.observe(element);
    return () => {
      owner.cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener('visibility');
      onPaneEvent?.({ type: 'dispose', viewId: id });
    };
  }, [id, node, onPaneEvent]);
  const view = viewRegistry[id];
  const workspace = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const detached = workspace.views.some(
    (view) => view.id === id && view.location !== 'main',
  );
  return (
    <section
      ref={host}
      className="pane"
      data-view={id}
      aria-label={`${view.title} view`}
      onKeyDown={(event) => {
        // FlexLayout portals do not bubble React events through their DOM tabpanel ancestor.
        // Handle the content-to-tab half here; Layout handles the tab-to-content half.
        if (
          event.key === 'F6' &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.metaKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          bridge.focus(id);
        }
      }}
    >
      <div className="pane-toolbar">
        <span className="constraint-tag">NOT IMPLEMENTED</span>
        <div className="flex items-center gap-1">
          {detached && (
            <button className="return-button" onClick={() => bridge.redock(id)}>
              <PanelBottomClose size={16} />
              Return to workspace
            </button>
          )}
          <button
            className="icon-button"
            aria-label={`Open ${view.title} to side`}
            title="Open to Side"
            onClick={() => bridge.openToSide(id)}
          >
            <Columns2 size={16} />
          </button>
          <button
            className="icon-button"
            aria-label={`Close ${view.title} view`}
            title="Close view"
            onClick={() => bridge.close(id)}
          >
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="placeholder">
        <div className="placeholder-content">
          <h1>{view.title}</h1>
          <p className="placeholder-description">{view.unavailable}</p>
        </div>
        {renderExtension?.(id)}
      </div>
    </section>
  );
}
