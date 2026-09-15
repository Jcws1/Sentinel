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
import {
  isViewId,
  viewKind,
  viewTitle,
  inspectorId,
  type ViewId,
} from './viewRegistry';
import {
  defaultMapPresentation,
  type CameraIntent,
  type MapMode,
  type MapPresentation,
} from '../../renderers/contracts';
import { RendererPool } from '../../renderers/rendererPool';

export class WorkspaceBridge {
  /** Ephemeral resources; never included in FlexLayout JSON or workspace metadata. */
  readonly renderers = new RendererPool();
  private readonly metadata = createWorkspaceMetadata();
  private disposed = false;
  private nextMapInstance = 2;
  private readonly inspectorLabels = new Map<ViewId, string>();
  // Retain a closed view's presentation preference, like its camera bookmark.
  private readonly mapModes = new Map<ViewId, MapMode>();
  private readonly mapPresentations = new Map<ViewId, MapPresentation>();
  private readonly mapPitches = new Map<string, number>();
  /** Monotonic UI-only request observed by the currently mounted map pane. */
  private readonly mapRecenterRequests = new Map<ViewId, number>();
  /** Per-view bookmarks only. No engine objects or domain state enter layout metadata. */
  private readonly mapCameras = new Map<
    ViewId,
    { missionId: string; camera: CameraIntent }
  >();
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
    if (import.meta.env.MODE === 'verification')
      Object.assign(window, {
        __sentinelRendererPoolTest: { inspect: () => this.renderers.inspect() },
      });
  }
  getSnapshot = () => this.metadata.getState();
  subscribe = (listener: () => void) => this.metadata.subscribe(listener);
  private tab(id: ViewId): IJsonTabNode {
    return {
      type: 'tab',
      id,
      name: this.getViewTitle(id),
      component: viewKind(id),
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
    this.renderers.closeView(id);
    this.layoutModel.doAction(Actions.deleteTab(id));
    const workspace = this.getSnapshot();
    // Removing the active tabset can leave FlexLayout without an active tabset.
    // Retain a still-active view, otherwise activate one of the remaining selected
    // tabs before scheduling DOM focus after the layout's next React commit.
    const next =
      workspace.activeViewId ??
      workspace.views.find(
        (view) => view.location === 'main' && view.selectedInPane,
      )?.id ??
      workspace.views.find((view) => view.selectedInPane)?.id;
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
  openAnotherMap(relativeTo?: ViewId): ViewId | undefined {
    if (this.disposed) return;
    let id: ViewId;
    do {
      id = `tactical:${this.nextMapInstance++}`;
    } while (this.layoutModel.getNodeById(id));
    this.openToSide(id, relativeTo);
    return id;
  }
  getMapCamera(id: ViewId, missionId: string): CameraIntent | undefined {
    const bookmark = this.mapCameras.get(id);
    return bookmark?.missionId === missionId
      ? {
          ...bookmark.camera,
          center: { ...bookmark.camera.center },
          projection: this.getMapMode(id),
          pitchFromNadirDeg: this.mapPitches.get(
            `${id}:${missionId}:${this.getMapMode(id)}`,
          ),
        }
      : undefined;
  }
  getMapMode(id: ViewId): MapMode {
    return this.mapModes.get(id) ?? (id === 'three-d' ? 'three-d' : 'tactical');
  }
  getMapPresentation(id: ViewId): Readonly<MapPresentation> {
    return this.mapPresentations.get(id) ?? defaultMapPresentation;
  }
  setMapPresentation(id: ViewId, change: Partial<MapPresentation>) {
    if (this.disposed) return;
    this.mapPresentations.set(id, {
      ...this.getMapPresentation(id),
      ...change,
    });
    this.publish();
  }
  getMapRecenterRevision(id: ViewId) {
    return this.mapRecenterRequests.get(id) ?? 0;
  }
  recenterMap(id: ViewId) {
    if (this.disposed) return;
    this.mapRecenterRequests.set(id, this.getMapRecenterRevision(id) + 1);
    this.publish();
  }
  getViewTitle(id: ViewId): string {
    if (this.inspectorLabels.has(id))
      return `Details · ${this.inspectorLabels.get(id)}`;
    if (!['tactical', 'three-d'].includes(viewKind(id))) return viewTitle(id);
    const suffix = id.startsWith('tactical:') ? ` ${id.split(':')[1]}` : '';
    const noun = id === 'three-d' ? 'View' : 'Map';
    return this.getMapMode(id) === 'three-d'
      ? `3D ${noun}${suffix}`
      : `Tactical ${noun}${suffix}`;
  }
  setMapMode(id: ViewId, mode: MapMode) {
    if (this.disposed || !this.layoutModel.getNodeById(id)) return;
    this.mapModes.set(id, mode);
    this.layoutModel.doAction(
      Actions.updateNodeAttributes(id, {
        name: this.getViewTitle(id),
      }),
    );
  }
  openInspector(missionId: string, entityId: string, label: string) {
    const id = inspectorId(missionId, entityId);
    this.inspectorLabels.set(id, label);
    this.open(id);
    return id;
  }
  setMapCamera(id: ViewId, missionId: string, camera: CameraIntent) {
    if (this.disposed) return;
    if (camera.projection && camera.pitchFromNadirDeg !== undefined)
      this.mapPitches.set(
        `${id}:${missionId}:${camera.projection}`,
        camera.pitchFromNadirDeg,
      );
    this.mapCameras.set(id, {
      missionId,
      camera: { ...camera, center: { ...camera.center } },
    });
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
    this.renderers.dispose();
    this.disposed = true;
    this.mapCameras.clear();
    this.mapModes.clear();
    this.mapPresentations.clear();
    this.mapPitches.clear();
    this.mapRecenterRequests.clear();
    this.layoutModel.removeChangeListener(this.publish);
  }
}
