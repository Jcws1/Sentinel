import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  PaneVisibilityContext,
  useOperationalSnapshot,
} from '../../src/app/OperationalContext';
import type {
  ApplicationRuntime,
  RuntimeSnapshot,
} from '../../src/app/runtime';

afterEach(cleanup);
it('suspends hidden pane notifications and resumes from the latest snapshot', () => {
  const listeners = new Set<() => void>();
  let snapshot = { missionId: 'one' } as RuntimeSnapshot;
  let renders = 0;
  const runtime = {
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    getSnapshot: () => snapshot,
  } as ApplicationRuntime;
  function Pane() {
    const state = useOperationalSnapshot(runtime);
    renders++;
    return <p>{state.missionId}</p>;
  }
  const view = (visible: boolean) => (
    <PaneVisibilityContext.Provider value={visible}>
      <Pane />
    </PaneVisibilityContext.Provider>
  );
  const { rerender, unmount } = render(view(true));
  expect(listeners.size).toBe(1);
  rerender(view(false));
  const hiddenRenders = renders;
  expect(listeners.size).toBe(0);
  act(() => {
    snapshot = { missionId: 'two' } as RuntimeSnapshot;
    listeners.forEach((fn) => fn());
  });
  expect(renders).toBe(hiddenRenders);
  rerender(view(true));
  expect(screen.getByText('two')).toBeTruthy();
  expect(listeners.size).toBe(1);
  unmount();
  expect(listeners.size).toBe(0);
});
