import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TabHeading } from '../../src/features/workspace/TabContextMenu';

afterEach(cleanup);

describe('workspace tab context access', () => {
  it('opens the menu for a focused inactive tab with either context-menu shortcut', () => {
    const onMenu = vi.fn();
    render(
      <div
        role="tab"
        aria-selected={false}
        tabIndex={-1}
        aria-keyshortcuts="F6 Control+Delete"
      >
        <TabHeading id="command" name="Command Picture" onMenu={onMenu} />
      </div>,
    );
    const tab = screen.getByRole('tab');
    tab.focus();
    fireEvent.keyDown(tab, { key: 'F10', shiftKey: true });
    fireEvent.keyDown(tab, { key: 'ContextMenu' });
    expect(onMenu).toHaveBeenCalledTimes(2);
    expect(onMenu.mock.calls[0][0]).toMatchObject({
      id: 'command',
      tab,
      x: 8,
      y: 0,
    });
    expect(tab.getAttribute('aria-selected')).toBe('false');
    expect(tab.getAttribute('aria-haspopup')).toBe('menu');
    expect(tab.getAttribute('aria-keyshortcuts')).toBe(
      'F6 Control+Delete Shift+F10 ContextMenu',
    );
  });

  it('leaves ordinary tab activation, closure and unrelated modified keys to FlexLayout', () => {
    const onMenu = vi.fn();
    render(
      <div role="tab" tabIndex={0}>
        <TabHeading id="tactical" name="Tactical Map" onMenu={onMenu} />
        <button>Close</button>
      </div>,
    );
    const tab = screen.getByRole('tab');
    for (const key of ['F6', 'Enter', 'ArrowRight', 'Delete', 'F10']) {
      expect(fireEvent.keyDown(tab, { key })).toBe(true);
    }
    fireEvent.keyDown(tab, { key: 'F10', shiftKey: true, ctrlKey: true });
    fireEvent.keyDown(screen.getByRole('button'), { key: 'ContextMenu' });
    expect(onMenu).not.toHaveBeenCalled();
  });

  it('cleans up listeners and restores FlexLayout shortcut metadata on removal', () => {
    const onMenu = vi.fn();
    const { rerender } = render(
      <div role="tab" aria-keyshortcuts="F6" tabIndex={0}>
        <TabHeading id="tactical:2" name="Tactical Map 2" onMenu={onMenu} />
      </div>,
    );
    const tab = screen.getByRole('tab');
    rerender(<div role="tab" aria-keyshortcuts="F6" tabIndex={0} />);
    fireEvent.keyDown(tab, { key: 'ContextMenu' });
    expect(onMenu).not.toHaveBeenCalled();
    expect(tab.getAttribute('aria-keyshortcuts')).toBe('F6');
    expect(tab.hasAttribute('aria-haspopup')).toBe(false);
  });
});
