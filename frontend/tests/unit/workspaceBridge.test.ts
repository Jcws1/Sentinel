import { afterEach, describe, expect, it } from 'vitest';
import { Actions, DockLocation, TabNode } from 'flexlayout-react';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';

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
