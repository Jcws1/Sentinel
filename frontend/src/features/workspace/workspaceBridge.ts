import {
  Actions,
  DockLocation,
  Model,
  TabNode,
  TabSetNode,
  type IJsonTabNode,
} from 'flexlayout-react';
import {
  createWorkspaceMetadata,
  type ViewPlacement,
} from '../../state/workspaceStore';
import { isViewId, viewRegistry, type ViewId } from './viewRegistry';

export class WorkspaceBridge {
  private readonly metadata = createWorkspaceMetadata();
  private disposed = false;
  /** The sole layout authority, consumed by the FlexLayout host. Never copied into a store. */
  readonly layoutModel: Model;
  readonly allowPopout: boolean;
  constructor(
    options: { allowPopout?: boolean; initialViews?: ViewId[] } = {},
  ) {
    this.allowPopout = options.allowPopout ?? false;
    this.layoutModel = Model.fromJson({
      global: {
        tabEnableRename: false,
        tabEnablePopout: this.allowPopout,
        // Empty tabsets are removed only when both close and delete-when-empty are enabled.
        tabSetEnableMaximize: false,
        tabSetEnableClose: true,
        tabSetEnableDeleteWhenEmpty: true,
        tabSetMinWidth: 260,
        tabSetMinHeight: 180,
      },
      layout: {
        type: 'row',
        children: [
          {
            type: 'tabset',
            selected: 0,
            active: true,
            children: (options.initialViews ?? ['tactical', 'command']).map(
              (id) => this.tab(id),
            ),
          },
        ],
      },
    });
    this.layoutModel.setSplitterSize(8);
    this.layoutModel.addChangeListener(this.publish);
    this.publish();
  }
  getSnapshot = () => this.metadata.getState();
  subscribe = (listener: () => void) => this.metadata.subscribe(listener);
  private tab(id: ViewId): IJsonTabNode {
    return {
      type: 'tab',
      id,
      name: viewRegistry[id].title,
      component: id,
      enableWindowReMount: true,
    };
  }
  private mainTarget() {
    return (
      this.layoutModel.getActiveTabset(Model.MAIN_LAYOUT_ID) ??
      this.layoutModel.getFirstTabSet(
        this.layoutModel.getRootRow(Model.MAIN_LAYOUT_ID),
      ) ??
      this.layoutModel.getRootRow(Model.MAIN_LAYOUT_ID)!
    );
  }
  private publish = () => {
    if (this.disposed) return;
    const views: ViewPlacement[] = [];
    const layouts = this.layoutModel.toJson().subLayouts;
    let activeViewId: ViewId | undefined;
    this.layoutModel.visitNodes((node) => {
      if (!(node instanceof TabNode) || !isViewId(node.getId())) return;
      const id = node.getId() as ViewId;
      const layoutId = node.getLayoutId();
      views.push({
        id,
        location:
          layoutId === Model.MAIN_LAYOUT_ID
            ? 'main'
            : layouts?.[layoutId]?.type === 'window'
              ? 'window'
              : 'float',
        selectedInPane: node.isSelected(),
      });
      if (
        node.isSelected() &&
        node.getParent() instanceof TabSetNode &&
        (node.getParent() as TabSetNode).isActive() &&
        layoutId === Model.MAIN_LAYOUT_ID
      )
        activeViewId = id;
    });
    this.metadata.setState((previous) => ({
      views,
      activeViewId,
      revision: previous.revision + 1,
    }));
  };
  open(id: ViewId) {
    if (this.disposed) return;
    if (!this.layoutModel.getNodeById(id)) {
      this.layoutModel.doAction(
        Actions.addNode(
          this.tab(id),
          this.mainTarget().getId(),
          DockLocation.CENTER,
          -1,
          true,
        ),
      );
    }
    this.focus(id);
  }
  focus(id: ViewId) {
    const node = this.layoutModel.getNodeById(id);
    if (this.disposed || !(node instanceof TabNode)) return;
    this.layoutModel.doAction(Actions.selectTab(id));
    // The host may need one frame to mount a newly opened tab, including a new window.
    const owner = node.getWindow();
    owner?.requestAnimationFrame(() => {
      if (this.disposed || !this.layoutModel.getNodeById(id)) return;
      const tab = node
        .getDocument()
        ?.getElementById(`workspace-tab-${id}`)
        ?.closest<HTMLElement>('[role="tab"]');
      tab?.focus();
    });
  }
  close(id: ViewId) {
    if (this.disposed || !this.layoutModel.getNodeById(id)) return;
    this.layoutModel.doAction(Actions.deleteTab(id));
    const next = this.getSnapshot().activeViewId;
    if (next) this.focus(next);
  }
  openToSide(id: ViewId, relativeTo?: ViewId) {
    if (this.disposed) return;
    const existing = this.layoutModel.getNodeById(id);
    const relative = relativeTo
      ? this.layoutModel.getNodeById(relativeTo)?.getParent()
      : undefined;
    const target = relative ?? this.mainTarget();
    // Moving the only tab beside itself has no useful result; keep its identity intact.
    if (existing?.getParent() === target && target.getChildren().length === 1) {
      this.focus(id);
      return;
    }
    this.layoutModel.doAction(
      existing
        ? Actions.moveNode(id, target.getId(), DockLocation.RIGHT, -1, true)
        : Actions.addNode(
            this.tab(id),
            target.getId(),
            DockLocation.RIGHT,
            -1,
            true,
          ),
    );
    this.focus(id);
  }
  popOut(id: ViewId) {
    if (!this.allowPopout || this.disposed || !this.layoutModel.getNodeById(id))
      return;
    this.layoutModel.doAction(Actions.popoutTab(id, 'window'));
  }
  redock(id: ViewId) {
    if (this.disposed || !this.layoutModel.getNodeById(id)) return;
    this.layoutModel.doAction(
      Actions.moveNode(
        id,
        this.mainTarget().getId(),
        DockLocation.CENTER,
        -1,
        true,
      ),
    );
    this.focus(id);
  }
  dispose() {
    this.disposed = true;
    this.layoutModel.removeChangeListener(this.publish);
  }
}
