import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import {
  Layout,
  Actions,
  TabNode,
  type ITabRenderValues,
  type ILayoutProps,
  type ILayoutApi,
} from 'flexlayout-react';
import { PaneHost, type PaneHooks } from './PaneHost';
import { isViewId } from './viewRegistry';
import type { WorkspaceBridge } from './workspaceBridge';
import {
  TabContextMenu,
  TabHeading,
  type TabMenuTarget,
} from './TabContextMenu';

export const WorkspaceHost = memo(function WorkspaceHost({
  bridge,
  ...hooks
}: PaneHooks & { bridge: WorkspaceBridge }) {
  const { onPaneEvent, renderExtension } = hooks;
  const scroll = useRef<HTMLDivElement>(null);
  const layout = useRef<ILayoutApi>(null);
  const [overflow, setOverflow] = useState({
    x: false,
    y: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });
  useEffect(() => {
    const element = scroll.current;
    if (!element) return;
    const owner = element.ownerDocument.defaultView!;
    let frame = 0;
    let observedRow: Element | null = null;
    const observer = new ResizeObserver(() => schedule());
    function measure() {
      const row = element!.querySelector('.flexlayout__row');
      if (row !== observedRow) {
        if (observedRow) observer.unobserve(observedRow);
        if (row) observer.observe(row);
        observedRow = row;
      }
      const maxX = element!.scrollWidth - element!.clientWidth;
      const maxY = element!.scrollHeight - element!.clientHeight;
      // A newly reoriented FlexLayout row is initially rendered before its rect
      // is measured. Re-render that measured layout so its native separator
      // publishes the real ARIA value; never synthesize a second resize model.
      if (
        element!.querySelector('.flexlayout__splitter:not([aria-valuenow])') &&
        element!.clientHeight > 0
      )
        layout.current?.redraw();
      const next = {
        x: maxX > 1,
        y: maxY > 1,
        left: element!.scrollLeft > 1,
        right: element!.scrollLeft < maxX - 1,
        up: element!.scrollTop > 1,
        down: element!.scrollTop < maxY - 1,
      };
      setOverflow((previous) =>
        Object.entries(next).every(
          ([key, value]) => previous[key as keyof typeof next] === value,
        )
          ? previous
          : next,
      );
    }
    function schedule() {
      owner.cancelAnimationFrame(frame);
      frame = owner.requestAnimationFrame(measure);
    }
    observer.observe(element);
    element.addEventListener('scroll', schedule, { passive: true });
    const unsubscribe = bridge.subscribe(schedule);
    schedule();
    return () => {
      owner.cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener('scroll', schedule);
      unsubscribe();
    };
  }, [bridge]);
  function scrollWorkspace(x: number, y: number) {
    const element = scroll.current;
    if (element)
      element.scrollBy({
        left: x * element.clientWidth * 0.75,
        top: y * element.clientHeight * 0.75,
        behavior: 'instant',
      });
  }
  const [menu, setMenu] = useState<TabMenuTarget>();
  const identifyTab = useCallback((node: TabNode, values: ITabRenderValues) => {
    const id = node.getId();
    if (isViewId(id))
      values.content = (
        <TabHeading id={id} name={node.getName()} onMenu={setMenu} />
      );
  }, []);
  const onContextMenu = useCallback<NonNullable<ILayoutProps['onContextMenu']>>(
    (node, event) => {
      const id = node.getId();
      if (!(node instanceof TabNode) || !isViewId(id)) return;
      const tab = event.currentTarget.closest<HTMLElement>('[role="tab"]');
      if (!tab) return;
      event.preventDefault();
      event.stopPropagation();
      setMenu({ id, tab, x: event.clientX, y: event.clientY });
    },
    [],
  );
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
    <>
      <div className="workspace-scroll-shell">
        <div
          ref={scroll}
          className="workspace-scroll"
          role="region"
          aria-label="Workspace panes"
          tabIndex={overflow.x || overflow.y ? 0 : -1}
          aria-description="Additional panes are reachable by scrolling or focusing their tabs and controls."
          onFocusCapture={(event) => {
            const viewport = event.currentTarget;
            const target = event.target;
            // Native focus scrolling can leave a partly visible control clipped.
            // Reveal the entire target within this scroll region, without moving
            // renderer cameras or responding to menus portalled outside it.
            if (target === viewport || !viewport.contains(target)) return;
            const visible = viewport.getBoundingClientRect();
            const focused = target.getBoundingClientRect();
            const left =
              focused.left < visible.left
                ? focused.left - visible.left
                : focused.right > visible.left + viewport.clientWidth
                  ? Math.min(
                      focused.right - visible.left - viewport.clientWidth,
                      focused.left - visible.left,
                    )
                  : 0;
            const top =
              focused.top < visible.top
                ? focused.top - visible.top
                : focused.bottom > visible.top + viewport.clientHeight
                  ? Math.min(
                      focused.bottom - visible.top - viewport.clientHeight,
                      focused.top - visible.top,
                    )
                  : 0;
            if (left || top)
              viewport.scrollBy({ left, top, behavior: 'instant' });
          }}
        >
          <Layout
            ref={layout}
            model={bridge.layoutModel}
            onAction={(action) => {
              if (
                action.type === Actions.DELETE_TAB &&
                action.data.node === 'details'
              ) {
                bridge.close('details');
                return undefined;
              }
              return action;
            }}
            factory={factory}
            onRenderTab={identifyTab}
            onContextMenu={onContextMenu}
            supportsPopout={bridge.allowPopout}
            popoutURL="/popout.html"
            realtimeResize
            keyMap={{ focusTabToggle: 'F6' }}
            invalidateTabContentOnParentRender={false}
          />
        </div>
        {(overflow.x || overflow.y) && (
          <div
            className="workspace-scroll-controls"
            role="group"
            aria-label="Workspace scroll controls"
          >
            <span>Scroll workspace</span>
            {overflow.x && (
              <>
                <button
                  className="icon-button"
                  aria-label="Scroll workspace left"
                  disabled={!overflow.left}
                  onClick={() => scrollWorkspace(-1, 0)}
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Scroll workspace right"
                  disabled={!overflow.right}
                  onClick={() => scrollWorkspace(1, 0)}
                >
                  <ArrowRight size={14} />
                </button>
              </>
            )}
            {overflow.y && (
              <>
                <button
                  className="icon-button"
                  aria-label="Scroll workspace up"
                  disabled={!overflow.up}
                  onClick={() => scrollWorkspace(0, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Scroll workspace down"
                  disabled={!overflow.down}
                  onClick={() => scrollWorkspace(0, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {menu && (
        <TabContextMenu
          key={`${menu.id}:${menu.x}:${menu.y}`}
          target={menu}
          bridge={bridge}
          onClose={() => setMenu(undefined)}
        />
      )}
    </>
  );
});
