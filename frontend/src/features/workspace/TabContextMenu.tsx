import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import * as Menu from '@radix-ui/react-dropdown-menu';
import {
  Columns2,
  ExternalLink,
  PanelBottomClose,
  Plus,
  X,
} from 'lucide-react';
import { viewKind, type ViewId } from './viewRegistry';
import type { WorkspaceBridge } from './workspaceBridge';

export interface TabMenuTarget {
  id: ViewId;
  tab: HTMLElement;
  x: number;
  y: number;
}

/** Adds context access to FlexLayout's actual tab, without replacing its focus/drag semantics. */
export function TabHeading({
  id,
  name,
  onMenu,
}: {
  id: ViewId;
  name: string;
  onMenu: (target: TabMenuTarget) => void;
}) {
  const heading = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const tab = heading.current?.closest<HTMLElement>('[role="tab"]');
    if (!tab) return;
    const previousShortcuts = tab.getAttribute('aria-keyshortcuts');
    tab.setAttribute('aria-haspopup', 'menu');
    tab.setAttribute(
      'aria-keyshortcuts',
      [previousShortcuts, 'Shift+F10', 'ContextMenu'].filter(Boolean).join(' '),
    );
    function handleKey(event: KeyboardEvent) {
      if (
        event.target !== tab ||
        !(
          event.key === 'ContextMenu' ||
          (event.key === 'F10' && event.shiftKey)
        ) ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = tab!.getBoundingClientRect();
      onMenu({ id, tab: tab!, x: bounds.left + 8, y: bounds.bottom });
    }
    tab.addEventListener('keydown', handleKey);
    return () => {
      tab.removeEventListener('keydown', handleKey);
      tab.removeAttribute('aria-haspopup');
      if (previousShortcuts)
        tab.setAttribute('aria-keyshortcuts', previousShortcuts);
      else tab.removeAttribute('aria-keyshortcuts');
    };
  }, [id, onMenu]);
  return (
    <span ref={heading} id={`workspace-tab-${id}`}>
      {name}
    </span>
  );
}

export function TabContextMenu({
  target,
  bridge,
  onClose,
}: {
  target: TabMenuTarget;
  bridge: WorkspaceBridge;
  onClose: () => void;
}) {
  const action = useRef<{ focus?: ViewId } | undefined>(undefined);
  const outside = useRef(false);
  const title = bridge.getViewTitle(target.id);
  const placement = bridge
    .getSnapshot()
    .views.find((view) => view.id === target.id);
  function choose(run: () => ViewId | undefined) {
    action.current = { focus: run() };
  }
  return createPortal(
    <Menu.Root
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Menu.Trigger asChild>
        <span
          aria-hidden="true"
          style={{
            position: 'fixed',
            left: target.x,
            top: target.y,
            width: 0,
            height: 0,
            pointerEvents: 'none',
          }}
        />
      </Menu.Trigger>
      <Menu.Portal container={target.tab.ownerDocument.body}>
        <Menu.Content
          className="menu-content tab-context-menu"
          aria-label={`${title} tab actions`}
          aria-labelledby={undefined}
          align="start"
          sideOffset={0}
          collisionPadding={6}
          onFocus={(event) => {
            // The dropdown is mounted by a context gesture, so Radix has no trigger
            // key event from which to infer keyboard entry. Start on the first action.
            if (event.target === event.currentTarget)
              event.currentTarget
                .querySelector<HTMLElement>('[role="menuitem"]')
                ?.focus();
          }}
          onInteractOutside={() => {
            outside.current = true;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (action.current) {
              const preferred = action.current.focus;
              const workspace = bridge.getSnapshot();
              const focus =
                preferred &&
                workspace.views.some((view) => view.id === preferred)
                  ? preferred
                  : workspace.activeViewId;
              if (focus) bridge.focus(focus);
              else
                target.tab.ownerDocument
                  .querySelector<HTMLButtonElement>(
                    '[data-activity-view="map"]',
                  )
                  ?.focus();
            } else if (!outside.current && target.tab.isConnected) {
              // Escape restores keyboard focus without activating an inactive invocation tab.
              target.tab.focus();
            }
          }}
        >
          <Menu.Label className="menu-label">{title}</Menu.Label>
          <Menu.Item
            className="menu-item"
            onSelect={() =>
              choose(() => {
                bridge.openToSide(target.id, target.id);
                return target.id;
              })
            }
          >
            <Columns2 size={14} />
            Open to Side
          </Menu.Item>
          {['tactical', 'three-d'].includes(viewKind(target.id)) && (
            <Menu.Item
              className="menu-item"
              onSelect={() => choose(() => bridge.openAnotherMap(target.id))}
            >
              <Plus size={14} />
              New Tactical pane
            </Menu.Item>
          )}
          {bridge.allowPopout && placement?.location === 'main' && (
            <Menu.Item
              className="menu-item"
              onSelect={() =>
                choose(() => {
                  bridge.popOut(target.id);
                  return target.id;
                })
              }
            >
              <ExternalLink size={14} />
              Pop out view
            </Menu.Item>
          )}
          {placement && placement.location !== 'main' && (
            <Menu.Item
              className="menu-item"
              onSelect={() =>
                choose(() => {
                  bridge.redock(target.id);
                  return target.id;
                })
              }
            >
              <PanelBottomClose size={14} />
              Return to workspace
            </Menu.Item>
          )}
          <Menu.Separator className="menu-separator" />
          <Menu.Item
            className="menu-item"
            onSelect={() =>
              choose(() => {
                bridge.close(target.id);
                return bridge.getSnapshot().activeViewId;
              })
            }
          >
            <X size={14} />
            Close view
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>,
    target.tab.ownerDocument.body,
  );
}
