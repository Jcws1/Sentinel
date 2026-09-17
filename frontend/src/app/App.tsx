import {
  useRef,
  useEffect,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import {
  Check,
  Columns2,
  Ellipsis,
  Keyboard,
  PanelLeft,
  Plus,
  X,
  Info,
  Drone,
} from 'lucide-react';
import { WorkspaceHost } from '../features/workspace/WorkspaceHost';
import {
  viewIds,
  viewRegistry,
  viewKind,
  type ViewId,
} from '../features/workspace/viewRegistry';
import type { WorkspaceBridge } from '../features/workspace/workspaceBridge';
import type { PaneHooks } from '../features/workspace/PaneHost';
import { WallClock } from './WallClock';
import { modules, moduleForView } from './moduleRegistry';
import {
  MissionControls,
  MissionStatus,
} from '../features/mission/MissionControls';
import { FleetSidebar } from '../features/entities/FleetSidebar';
import { OperationalChrome } from '../features/entities/OperationalChrome';

function ViewMenu({
  id,
  bridge,
  open,
}: {
  id: ViewId;
  bridge: WorkspaceBridge;
  open: boolean;
}) {
  const title = bridge.getViewTitle(id);
  const actionChosen = useRef(false);
  const actionTarget = useRef<ViewId | undefined>(undefined);
  const trigger = useRef<HTMLButtonElement>(null);
  function choose(action: () => void) {
    actionChosen.current = true;
    action();
  }
  return (
    <Menu.Root>
      <Menu.Trigger
        ref={trigger}
        className="icon-button view-menu"
        aria-label={`${title} options`}
      >
        <Ellipsis size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="menu-content"
          side="right"
          align="start"
          sideOffset={8}
          onCloseAutoFocus={(event) => {
            if (!actionChosen.current) return;
            actionChosen.current = false;
            event.preventDefault();
            const snapshot = bridge.getSnapshot();
            const preferred = actionTarget.current ?? id;
            actionTarget.current = undefined;
            const target = snapshot.views.some((view) => view.id === preferred)
              ? preferred
              : snapshot.activeViewId;
            // A completed command transfers focus to its view. Escape still returns to the menu trigger.
            if (target) bridge.focus(target);
            else trigger.current?.focus();
          }}
        >
          <Menu.Label className="menu-label">{title}</Menu.Label>
          <Menu.Item
            className="menu-item"
            onSelect={() => choose(() => bridge.open(id))}
          >
            <Plus size={15} />
            {open ? 'Focus view' : 'Open view'}
          </Menu.Item>
          <Menu.Item
            className="menu-item"
            onSelect={() => choose(() => bridge.openToSide(id))}
          >
            <Columns2 size={15} />
            Open to Side
          </Menu.Item>
          {['tactical', 'three-d'].includes(viewKind(id)) && (
            <Menu.Item
              className="menu-item"
              onSelect={() =>
                choose(() => {
                  actionTarget.current = bridge.openAnotherMap(id);
                })
              }
            >
              <Plus size={15} />
              New Tactical pane
            </Menu.Item>
          )}
          {open && (
            <>
              <Menu.Separator className="menu-separator" />
              <Menu.Item
                className="menu-item"
                onSelect={() => choose(() => bridge.close(id))}
              >
                <X size={15} />
                Close view
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
function Shortcuts() {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        className="icon-button keyboard-button"
        aria-label="Keyboard shortcuts"
        title="Keyboard shortcuts"
      >
        <Keyboard size={14} />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Title>Workspace shortcuts</Dialog.Title>
          <Dialog.Description>
            Move between views using the keyboard.
          </Dialog.Description>
          <dl className="shortcuts">
            <div>
              <dt>Move selected drones</dt>
              <dd>Right-click destination</dd>
            </div>
            <div>
              <dt>Pan temporarily</dt>
              <dd>Space + drag</dd>
            </div>
            <div>
              <dt>Review map symbols / select</dt>
              <dd>[ or ] / Enter</dd>
            </div>
            <div>
              <dt>Map pan / zoom</dt>
              <dd>Arrow keys / + or −</dd>
            </div>
            <div>
              <dt>Move focus between controls</dt>
              <dd>Tab / Shift + Tab</dd>
            </div>
            <div>
              <dt>Move through tabs or the Activity Bar</dt>
              <dd>Arrow keys</dd>
            </div>
            <div>
              <dt>Activate a focused tab or view</dt>
              <dd>Enter / Space</dd>
            </div>
            <div>
              <dt>Close a focused workspace tab</dt>
              <dd>Ctrl + Delete</dd>
            </div>
            <div>
              <dt>Open actions for the focused tab</dt>
              <dd>Shift + F10 / Menu</dd>
            </div>
            <div>
              <dt>Switch between tab and view content</dt>
              <dd>F6</dd>
            </div>
            <div>
              <dt>Resize a focused divider</dt>
              <dd>Arrow keys</dd>
            </div>
          </dl>
          <p className="dialog-note">
            Reopen any closed view from the Activity Bar or Views list. Use a
            view’s options menu to open it to the side.
          </p>
          <Dialog.Close
            className="dialog-close icon-button"
            aria-label="Close keyboard shortcuts"
          >
            <X size={18} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function App({
  bridge,
  ...hooks
}: PaneHooks & { bridge: WorkspaceBridge }) {
  const workspace = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const showViews = workspace.sidebarOpen;
  useEffect(() => {
    const resize = () => bridge.setViewportWidth(window.innerWidth);
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [bridge]);
  const openedCredits = useRef(false);
  const activeModule = moduleForView(workspace.activeViewId);
  function navigateActivity(event: KeyboardEvent<HTMLElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[data-activity-view]:not(:disabled)',
      ),
    );
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    if (current === -1) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
            buttons.length;
    buttons[next]?.focus();
  }
  function moduleButton(item: (typeof modules)[number]) {
    const Icon = item.icon;
    const view = item.view;
    if (item.id === 'settings')
      return (
        <div className="activity-item" key={item.id}>
          <Menu.Root>
            <Menu.Trigger
              className="activity-button"
              data-activity-view="settings"
              aria-label="Settings"
            >
              <Icon size={17} strokeWidth={1.5} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content
                className="menu-content"
                side="right"
                align="end"
                sideOffset={6}
                onCloseAutoFocus={(event) => {
                  if (openedCredits.current) {
                    openedCredits.current = false;
                    event.preventDefault();
                    bridge.focus('credits');
                  }
                }}
              >
                <Menu.Label className="menu-label">Settings</Menu.Label>
                <Menu.Item
                  className="menu-item"
                  onSelect={() => {
                    openedCredits.current = true;
                    bridge.open('credits');
                  }}
                >
                  <Info size={15} />
                  Credits
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
          <span className="activity-tooltip" role="tooltip">
            Settings<span>Credits</span>
          </span>
        </div>
      );
    return (
      <div className="activity-item" key={item.id}>
        <button
          data-activity-view={item.id}
          className="activity-button"
          disabled={!view}
          aria-label={
            view ? `Open ${item.label}` : `${item.label} - not implemented`
          }
          aria-pressed={view ? activeModule === item.id : undefined}
          onClick={() => {
            if (view) bridge.open(view);
          }}
        >
          <Icon size={17} strokeWidth={1.5} />
          {!view && (
            <span className="unavailable-mark" aria-hidden="true">
              N/A
            </span>
          )}
        </button>
        <span className="activity-tooltip" role="tooltip">
          {item.label}
          <span>
            {view
              ? item.id === 'tracks'
                ? 'Entities and demo controls'
                : 'View only'
              : 'Not implemented'}
          </span>
        </span>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-logo" aria-hidden="true">
            <img src="/sentinel-logo.png" alt="" draggable={false} />
          </span>
          <span>
            Sentinel <span className="version">v3</span>
          </span>
        </div>
        <MissionControls />
        <OperationalChrome bridge={bridge} />
        <WallClock />
        <span className="sr-only">
          <MissionStatus />
        </span>
      </header>
      <div className="workbench-body">
        <nav
          className="activity-bar"
          aria-label="Activity Bar"
          onKeyDown={navigateActivity}
        >
          <div className="activity-views">
            <button
              className="activity-button fleet-activity"
              data-activity-view="fleet"
              aria-label="Fleet"
              aria-expanded={showViews && workspace.sidebarMode === 'fleet'}
              onClick={() =>
                bridge.setSidebar(
                  'fleet',
                  !(showViews && workspace.sidebarMode === 'fleet'),
                )
              }
            >
              <Drone size={19} />
              <span>Fleet</span>
            </button>
            {modules.filter((item) => item.id !== 'settings').map(moduleButton)}
          </div>
          <div className="activity-bottom">
            <Shortcuts />
            <button
              className="icon-button"
              aria-label={
                showViews && workspace.sidebarMode === 'views'
                  ? 'Hide Views list'
                  : 'Show Views list'
              }
              title="Views"
              aria-expanded={showViews && workspace.sidebarMode === 'views'}
              onClick={() =>
                bridge.setSidebar(
                  'views',
                  !(showViews && workspace.sidebarMode === 'views'),
                )
              }
            >
              <PanelLeft size={17} />
            </button>
            {modules.filter((item) => item.id === 'settings').map(moduleButton)}
          </div>
        </nav>
        {showViews && (
          <aside className="views-sidebar" aria-label="Workspace navigation">
            <div className="sidebar-heading">
              <button
                className="text-control"
                aria-pressed={workspace.sidebarMode === 'views'}
                onClick={() => bridge.setSidebar('views')}
              >
                Views
              </button>
              <button
                className="text-control"
                aria-pressed={workspace.sidebarMode === 'fleet'}
                onClick={() => bridge.setSidebar('fleet')}
              >
                Fleet
              </button>
              <button
                className="icon-button sidebar-close"
                aria-label="Close navigation sidebar"
                onClick={() => {
                  bridge.setSidebar(workspace.sidebarMode, false);
                  requestAnimationFrame(() =>
                    document
                      .querySelector<HTMLButtonElement>(
                        workspace.sidebarMode === 'fleet'
                          ? '[data-activity-view="fleet"]'
                          : '[title="Views"]',
                      )
                      ?.focus(),
                  );
                }}
              >
                <X size={14} />
              </button>
            </div>
            {workspace.sidebarMode === 'fleet' ? (
              <FleetSidebar bridge={bridge} />
            ) : (
              <div className="view-list">
                {viewIds
                  .filter((id) => id !== 'credits' && id !== 'inspector')
                  .map((id) => {
                    const view = viewRegistry[id];
                    const title = bridge.getViewTitle(id);
                    const Icon = view.icon;
                    const isOpen = workspace.views.some(
                      (item) => viewKind(item.id) === id,
                    );
                    return (
                      <div
                        key={id}
                        className="view-row"
                        data-active={
                          workspace.activeViewId !== undefined &&
                          viewKind(workspace.activeViewId) === id
                        }
                      >
                        <button
                          className="view-launcher"
                          aria-label={`Open ${title} from Views`}
                          onClick={() => bridge.open(id)}
                        >
                          <Icon size={15} strokeWidth={1.5} />
                          <span>{title}</span>
                          {isOpen && (
                            <Check
                              className="open-marker"
                              size={11}
                              aria-label="Open"
                            />
                          )}
                        </button>
                        <ViewMenu
                          id={id}
                          bridge={bridge}
                          open={workspace.views.some((item) => item.id === id)}
                        />
                      </div>
                    );
                  })}
              </div>
            )}
          </aside>
        )}
        <main className="workspace" aria-label="Operational workspace">
          <div className="layout-host">
            <WorkspaceHost bridge={bridge} {...hooks} />
            {workspace.views.length === 0 && (
              <div className="empty-workspace">
                <h1>No open views</h1>
                <button
                  className="primary-button"
                  onClick={() => bridge.open('tactical')}
                >
                  <Plus size={14} />
                  Open Tactical Map
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
