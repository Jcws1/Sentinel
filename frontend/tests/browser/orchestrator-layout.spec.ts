import { test, expect } from '@playwright/test';
import { closeTab } from './actions';

test('legacy Units and Conductor layout opens one Orchestrator in the active location, retaining adjacent panes and reopen state', async ({
  page,
}) => {
  await page.goto(
    'http://127.0.0.1:5182/tests/harness/index.html?legacy-authoring',
  );
  await expect(
    page.getByRole('tab', { name: 'Orchestrator', exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole('tab', { name: 'Orchestrator', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('tab', { name: 'Units', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('tab', { name: 'Conductor', exact: true }),
  ).toHaveCount(0);
  const before = await page.evaluate(() => window.__workspaceTest.snapshot());
  expect(before.workspace.orchestratorTab).toBe('conductor');
  expect(before.workspace.views.map((v) => v.id)).toEqual(
    expect.arrayContaining(['tactical', 'command', 'details', 'orchestrator']),
  );
  // FlexLayout omits its default selected:-1 when serializing a closed border.
  expect(before.layout.borders?.[0].selected ?? -1).toBe(-1);
  expect(
    before.workspace.views.find((v) => v.id === 'details')?.selectedInPane,
  ).toBe(false);
  await expect(
    page.getByRole('region', { name: 'Details view', exact: true }),
  ).toBeHidden();
  expect(before.layout.layout.children?.[1]).toMatchObject({
    id: 'legacy-editor-group',
    selected: 1,
    children: [{ id: 'command' }, { id: 'orchestrator' }],
  });
  await closeTab(page, 'Orchestrator');
  await page
    .getByRole('button', { name: 'Open Orchestrator', exact: true })
    .first()
    .click();
  await expect(
    page.getByRole('tab', { name: 'Orchestrator', exact: true }),
  ).toHaveCount(1);
  expect(
    (await page.evaluate(() => window.__workspaceTest.snapshot())).workspace
      .orchestratorTab,
  ).toBe('conductor');
});
