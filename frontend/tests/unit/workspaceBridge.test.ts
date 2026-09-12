import { afterEach, describe, expect, it } from 'vitest';
import { Actions, DockLocation, TabNode } from 'flexlayout-react';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';
import {
  isViewId,
  viewKind,
  viewTitle,
} from '../../src/features/workspace/viewRegistry';
import { moduleForView } from '../../src/app/moduleRegistry';

const instances: WorkspaceBridge[] = [];
function create() {
  const bridge = new WorkspaceBridge();
  instances.push(bridge);
  return bridge;
}
afterEach(() => instances.splice(0).forEach((bridge) => bridge.dispose()));

describe('workspace layout authority', () => {
  it('opens or focuses one stable view identity', () => {
    const bridge = create();
    bridge.open('inspector');
    bridge.open('inspector');
    expect(bridge.getSnapshot().views.map((view) => view.id)).toEqual([
      'tactical',
      'command',
      'inspector',
    ]);
    expect(bridge.getSnapshot().activeViewId).toBe('inspector');
  });
  it('recovers after every tab and its original tabset have been removed', () => {
    const bridge = create();
    bridge.close('tactical');
    bridge.close('command');
    expect(bridge.getSnapshot().views).toHaveLength(0);
    bridge.open('timeline');
    expect(bridge.getSnapshot().activeViewId).toBe('timeline');
    expect(bridge.layoutModel.getNodeById('timeline')).toBeInstanceOf(TabNode);
  });
  it('focuses a remaining selected tab after the active split is removed', () => {
    const bridge = create();
    bridge.openToSide('command', 'command');
    expect(bridge.getSnapshot().activeViewId).toBe('command');
    bridge.close('command');
    expect(bridge.getSnapshot().activeViewId).toBe('tactical');
  });
  it('closing an inactive tab preserves the other active view', () => {
    const bridge = create();
    bridge.open('command');
    bridge.close('tactical');
    expect(bridge.getSnapshot().activeViewId).toBe('command');
    bridge.close('command');
    expect(bridge.getSnapshot().activeViewId).toBeUndefined();
    expect(bridge.getSnapshot().views).toHaveLength(0);
  });
  it('opens to side, moves an existing view, and preserves singleton identity', () => {
    const bridge = create();
    bridge.openToSide('timeline', 'tactical');
    const parent = bridge.layoutModel.getNodeById('timeline')?.getParent();
    expect(parent).not.toBe(
      bridge.layoutModel.getNodeById('tactical')?.getParent(),
    );
    bridge.openToSide('timeline', 'timeline');
    expect(bridge.layoutModel.getNodeById('timeline')?.getParent()).toBe(
      parent,
    );
    bridge.redock('timeline');
    expect(
      bridge.getSnapshot().views.filter((view) => view.id === 'timeline'),
    ).toHaveLength(1);
  });
  it('observes native model actions without a competing store layout', () => {
    const bridge = create();
    const target = bridge.layoutModel.getNodeById('tactical')!.getParent()!;
    bridge.layoutModel.doAction(
      Actions.moveNode('command', target.getId(), DockLocation.CENTER, 0),
    );
    expect(bridge.getSnapshot().views.map((view) => view.id)).toEqual([
      'command',
      'tactical',
    ]);
    bridge.layoutModel.doAction(Actions.deleteTab('command'));
    expect(bridge.getSnapshot().views.map((view) => view.id)).toEqual([
      'tactical',
    ]);
  });
  it('splits an inactive target from its own pane without moving the unrelated active pane', () => {
    const bridge = create();
    const originalParent = bridge.layoutModel
      .getNodeById('tactical')!
      .getParent();
    bridge.openToSide('inspector', 'tactical');
    const unrelatedParent = bridge.layoutModel
      .getNodeById('inspector')!
      .getParent();
    expect(bridge.getSnapshot().activeViewId).toBe('inspector');
    bridge.openToSide('command', 'command');
    expect(bridge.layoutModel.getNodeById('tactical')!.getParent()).toBe(
      originalParent,
    );
    expect(bridge.layoutModel.getNodeById('inspector')!.getParent()).toBe(
      unrelatedParent,
    );
    expect(bridge.layoutModel.getNodeById('command')!.getParent()).not.toBe(
      originalParent,
    );
    expect(bridge.layoutModel.getNodeById('command')!.getParent()).not.toBe(
      unrelatedParent,
    );
    expect(bridge.getSnapshot().activeViewId).toBe('command');
  });
  it('opens simultaneous map instances while navigation retains the primary identity', () => {
    const bridge = create();
    const second = bridge.openAnotherMap('tactical')!;
    const third = bridge.openAnotherMap(second)!;
    expect(second).toBe('tactical:2');
    expect(third).toBe('tactical:3');
    expect(bridge.getSnapshot().activeViewId).toBe(third);
    expect(bridge.layoutModel.getNodeById(second)?.getParent()).not.toBe(
      bridge.layoutModel.getNodeById('tactical')?.getParent(),
    );
    expect(bridge.layoutModel.getNodeById(third)?.getParent()).not.toBe(
      bridge.layoutModel.getNodeById(second)?.getParent(),
    );
    bridge.open('tactical');
    expect(bridge.getSnapshot().activeViewId).toBe('tactical');
    expect(bridge.getSnapshot().views).toHaveLength(4);
    bridge.close(second);
    expect(bridge.layoutModel.getNodeById(third)).toBeInstanceOf(TabNode);
    expect(bridge.openAnotherMap()).toBe('tactical:4');
  });
  it('validates view identities and resolves navigation by view kind', () => {
    expect(isViewId('tactical:2')).toBe(true);
    for (const invalid of [
      'tactical:0',
      'tactical:1',
      'tactical:-2',
      'tactical:2.1',
      'tactical:02',
      'command:2',
      'tactical:9007199254740992',
    ]) {
      expect(isViewId(invalid)).toBe(false);
    }
    expect(viewKind('tactical:2')).toBe('tactical');
    expect(viewTitle('tactical:2')).toBe('Tactical Map 2');
    expect(moduleForView('tactical:2')).toBe('map');
  });
  it('preserves mission-scoped camera bookmarks across close without publishing them as layout state', () => {
    const bridge = create();
    const snapshot = bridge.getSnapshot();
    const camera = {
      center: { longitudeDeg: 103, latitudeDeg: 1 },
      groundSpanM: 5000,
      headingTrueDeg: 0,
    };
    bridge.setMapCamera('tactical', 'alpha', camera);
    camera.center.longitudeDeg = 104;
    expect(bridge.getSnapshot()).toBe(snapshot);
    expect(bridge.getMapCamera('tactical', 'alpha')?.center.longitudeDeg).toBe(
      103,
    );
    expect(bridge.getMapCamera('tactical', 'bravo')).toBeUndefined();
    bridge.close('tactical');
    bridge.open('tactical');
    const restored = bridge.getMapCamera('tactical', 'alpha')!;
    expect(restored.center.longitudeDeg).toBe(103);
    restored.center.longitudeDeg = 105;
    expect(bridge.getMapCamera('tactical', 'alpha')?.center.longitudeDeg).toBe(
      103,
    );
    bridge.dispose();
    expect(bridge.getMapCamera('tactical', 'alpha')).toBeUndefined();
    expect(bridge.openAnotherMap()).toBeUndefined();
  });
  it('disables product popouts and detaches its subscription on disposal', () => {
    const bridge = create();
    bridge.popOut('tactical');
    expect(
      bridge.getSnapshot().views.every((view) => view.location === 'main'),
    ).toBe(true);
    const before = bridge.getSnapshot();
    bridge.dispose();
    bridge.open('timeline');
    bridge.layoutModel.doAction(Actions.deleteTab('command'));
    expect(bridge.getSnapshot()).toBe(before);
  });
});
