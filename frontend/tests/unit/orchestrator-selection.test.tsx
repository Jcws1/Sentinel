import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { OperationalContext } from '../../src/app/OperationalContext';
import { createRuntime } from '../../src/app/runtime';
import { WorkspaceBridge } from '../../src/features/workspace/workspaceBridge';
import { UnitsPane } from '../../src/features/units/UnitsPane';
import fixture from '../fixtures/scenario-location/remote-20v20.json';
import type { ScenarioContent } from '../../src/contracts/generated';

const disposals: (() => void)[] = [];
beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  disposals.splice(0).forEach((fn) => fn());
});
async function setup() {
  const runtime = createRuntime({
    fetcher: async () =>
      new Response(JSON.stringify({ schemaVersion: '1.0', scenarios: [] })),
  });
  const bridge = new WorkspaceBridge();
  disposals.push(
    () => runtime.dispose(),
    () => bridge.dispose(),
  );
  const content = structuredClone(fixture) as ScenarioContent;
  content.actions = [];
  content.units = content.units.slice(0, 3);
  await act(async () => {
    runtime.enterAuthoring();
    runtime.updateScenario(content);
  });
  render(
    <OperationalContext.Provider value={runtime}>
      <UnitsPane bridge={bridge} targetMap="tactical" visible />
    </OperationalContext.Provider>,
  );
  return runtime;
}

it('checkbox and bulk selection do not insert a unit editor; explicit Edit selected opens it', async () => {
  const runtime = await setup();
  fireEvent.click(screen.getByLabelText('Select unit Friendly 01'));
  expect(runtime.getSnapshot().session.selection.items).toHaveLength(1);
  expect(screen.queryByLabelText('Unit label')).toBeNull();
  fireEvent.click(screen.getByLabelText('Select unit Friendly 02'));
  expect(runtime.getSnapshot().session.selection.items).toHaveLength(2);
  expect(screen.queryByLabelText('Unit label')).toBeNull();
  fireEvent.click(screen.getByLabelText('Select unit Friendly 02'));
  fireEvent.click(screen.getByRole('button', { name: /^Edit selected$/ }));
  expect((screen.getByLabelText('Unit label') as HTMLInputElement).value).toBe(
    'Friendly 01',
  );
  expect(document.activeElement).toBe(screen.getByLabelText('Unit label'));
});

it('a changed draft invalidates an open deletion review even when target identities remain', async () => {
  const runtime = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Select all shown (3)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected (3)' }));
  expect(
    screen.getByRole('region', { name: 'Review unit deletion' }),
  ).toBeTruthy();
  act(() =>
    runtime.updateScenario({
      ...structuredClone(runtime.getSnapshot().scenario.draft),
      name: 'Replaced draft',
    } as ScenarioContent),
  );
  expect(
    screen.queryByRole('region', { name: 'Review unit deletion' }),
  ).toBeNull();
  expect(runtime.getSnapshot().scenario.draft.units).toHaveLength(3);
});
