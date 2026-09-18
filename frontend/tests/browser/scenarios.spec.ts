import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  rtsOrigin,
  readWorld,
  endDemo,
  fleetSelect,
  directClick,
} from './rtsActions';

const evidence = resolve(
  '../docs/d4-refinement/regressions/d4/regressions/scenarios',
);
test.use({ actionTimeout: 10000 });
const pane = (page: Page) => page.locator('.units-pane');
const map = (page: Page) =>
  page.locator('.tactical-view[data-view-id="tactical"]');
async function editor(page: Page) {
  await page
    .getByRole('button', { name: 'Open Units', exact: true })
    .first()
    .click();
  const open = page.getByRole('button', {
    name: 'Open scenario editor',
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  await expect(map(page)).toHaveAttribute('data-context', 'authoring');
}
async function place(page: Page, category: string, x = 0.5, y = 0.5) {
  await pane(page)
    .getByRole('button', { name: new RegExp(`^${category}`) })
    .click();
  const canvas = map(page).locator('canvas').first();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * x, y: box.height * y } });
  await expect(
    pane(page).getByRole('heading', { name: 'Edit selected unit' }),
  ).toBeVisible();
}
async function pose(
  page: Page,
  label: string,
  longitude: string,
  role = 'observation',
) {
  await pane(page).getByLabel('Unit label', { exact: true }).fill(label);
  const roleField = pane(page).getByRole('combobox', { name: 'Command role' });
  if (await roleField.isEnabled()) await roleField.selectOption(role);
  for (const [key, value] of Object.entries({
    longitude,
    latitude: '1.290125',
    altitude: '217.25',
    heading: '37.125',
  }))
    await pane(page)
      .getByRole('textbox', { name: `Unit ${key}`, exact: true })
      .fill(value);
  await pane(page)
    .getByRole('button', { name: 'Apply changes', exact: true })
    .click();
  await expect(
    pane(page)
      .getByRole('button', { name: new RegExp(`^.+${label}|^${label}`) })
      .first(),
  ).toBeVisible();
}
async function save(page: Page) {
  await pane(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(pane(page).locator('.units-save-status')).toContainText('saved');
}
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});

test.afterEach(async ({ page }) => {
  // A failed assertion must not leave an active run for the next UI case.
  const simulation = page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first();
  if (await simulation.isVisible()) {
    await page.keyboard.press('Escape');
    await simulation.click();
    const end = page.getByRole('menuitem', { name: 'End demo', exact: true });
    if ((await end.count()) && (await end.isEnabled())) await end.click();
  }
});

test('author both maps, exact poses and roles, reconcile save and Run, move only controlled units and rerun a pinned revision', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(rtsOrigin);
  await editor(page);
  await pane(page)
    .getByRole('textbox', { name: 'Arrangement name' })
    .fill('Harbour exercise');
  await place(page, 'Friendly drone', 0.43, 0.45);
  await pose(page, 'Controlled One', '103.849125', 'sentinel');
  await place(page, 'Friendly drone', 0.58, 0.45);
  await pose(page, 'Observer One', '103.853125');
  await map(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as {
              __sentinelCesiumTest?: {
                inspect(id: string): { ready: boolean };
              };
            }
          ).__sentinelCesiumTest?.inspect('tactical')?.ready,
      ),
    )
    .toBe(true);
  await place(page, 'Hostile drone', 0.52, 0.55);
  await pose(page, 'Hostile One', '103.851125');
  await place(page, 'Unknown entity', 0.62, 0.56);
  await pose(page, 'Unknown One', '103.847125');
  await page.screenshot({ path: resolve(evidence, 'authoring-3d.png') });
  await pane(page)
    .getByRole('button', { name: 'Reposition', exact: true })
    .click();
  await map(page)
    .locator('canvas')
    .first()
    .click({ position: { x: 450, y: 260 } });
  await pose(page, 'Unknown One', '103.847125');
  await place(page, 'Unknown entity', 0.5, 0.6);
  await pane(page)
    .getByRole('button', { name: 'Delete selected unit' })
    .click();
  await expect(pane(page).locator('.units-arrangement li')).toHaveCount(4);
  await map(page)
    .getByRole('button', { name: 'Tactical', exact: true })
    .click();
  await expect(map(page).locator('canvas').first()).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'authoring-tactical.png') });
  let savedId = '';
  await page.route('**/api/scenarios', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    savedId = (await response.json()).result.definitionId;
    await route.abort('failed');
  });
  await pane(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(
    pane(page).getByRole('button', { name: 'Check save', exact: true }),
  ).toBeEnabled();
  await pane(page)
    .getByRole('button', { name: 'Check save', exact: true })
    .click();
  await expect(pane(page).locator('.units-save-status')).toContainText(
    'Revision 1 saved',
  );
  await page.unroute('**/api/scenarios');
  const saved = await (
    await page.request.get(`${rtsOrigin}/api/scenarios/${savedId}?revision=1`)
  ).json();
  expect(
    saved.content.units.map((u: { category: string; commandRole: string }) => [
      u.category,
      u.commandRole,
    ]),
  ).toEqual([
    ['friendly', 'sentinel'],
    ['friendly', 'observation'],
    ['hostile', 'observation'],
    ['unknown', 'observation'],
  ]);
  expect(
    saved.content.units.map(
      (u: { headingTrueDeg: number; position: unknown }) => u.headingTrueDeg,
    ),
  ).toEqual([37.125, 37.125, 37.125, 37.125]);
  await page.reload();
  await editor(page);
  await pane(page)
    .getByRole('button', { name: 'Load latest', exact: true })
    .click();
  await expect(pane(page).locator('.units-arrangement li')).toHaveCount(4);
  const accessibility = await new AxeBuilder({ page })
    .include('.units-pane')
    .analyze();
  await writeFile(
    resolve(evidence, 'units-accessibility.json'),
    JSON.stringify(accessibility.violations, null, 2),
  );
  expect(accessibility.violations).toEqual([]);
  const createBodies: string[] = [];
  let createdMid = '';
  await page.route('**/api/interactive/runs', async (route) => {
    createBodies.push(route.request().postData()!);
    const response = await route.fetch();
    createdMid = (await response.json()).missionId;
    if (createBodies.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await pane(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(
    pane(page).getByText('Ready to run', { exact: true }),
  ).toBeVisible();
  await pane(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect.poll(() => createdMid).not.toBe('');
  const retry = pane(page).getByRole('button', {
    name: 'Retry Run request',
    exact: true,
  });
  if (await retry.isVisible()) await retry.click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
  await page.unroute('**/api/interactive/runs');
  await expect(map(page)).toHaveAttribute('data-context', 'operational');
  const world = await readWorld(page, createdMid);
  expect(world.scenario?.contentHash).toBe(saved.contentHash);
  expect(world.interactive?.controls).toHaveLength(1);
  expect(new Set(createBodies).size).toBe(1);
  for (const u of saved.content.units) {
    const entityId = world.scenario!.entityIds[u.id];
    const track = Object.values(world.tracks).find(
      (t) => t.entityId === entityId,
    )!;
    expect(track.latest?.position).toEqual(u.position);
    expect(track.latest?.velocity?.headingTrueDeg).toBe(u.headingTrueDeg);
  }
  const beforeMissions = (
    await (await page.request.get(`${rtsOrigin}/api/missions`)).json()
  ).missions;
  expect(
    beforeMissions.filter((m: { id: string }) => m.id === createdMid),
  ).toHaveLength(1);
  await fleetSelect(page, ['Controlled One']);
  await directClick(page, 0.7, 0.5);
  await expect
    .poll(async () =>
      (await readWorld(page)).interactive!.executions?.some(
        (e) => e.state === 'Running',
      ),
    )
    .toBe(true);
  await page.screenshot({ path: resolve(evidence, 'custom-run-moving.png') });
  await endDemo(page);
  const ended = await readWorld(page, createdMid);
  await editor(page);
  await pane(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(
    pane(page).getByText('Ready to run', { exact: true }),
  ).toBeVisible();
  await pane(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
  const rerun = await readWorld(page);
  expect(rerun.mission.id).not.toBe(createdMid);
  expect(rerun.recordingId).not.toBe(ended.recordingId);
  expect(rerun.interactive?.runId).not.toBe(ended.interactive?.runId);
  expect(rerun.scenario?.contentHash).toBe(ended.scenario?.contentHash);
  expect(await readWorld(page, createdMid)).toEqual(ended);
  await endDemo(page);
  expect(errors).toEqual([]);
});

test('conflicting saves retain both immutable revisions and keep local edits recoverable', async ({
  page,
}) => {
  await page.goto(rtsOrigin);
  await editor(page);
  await pane(page)
    .getByRole('textbox', { name: 'Arrangement name' })
    .fill('Concurrent authoring');
  await place(page, 'Friendly drone');
  await save(page);
  const catalog = await (
    await page.request.get(`${rtsOrigin}/api/scenarios`)
  ).json();
  const rev = catalog.scenarios.find(
    (r: { content: { name: string } }) =>
      r.content.name === 'Concurrent authoring',
  );
  const another = await page.request.post(
    `${rtsOrigin}/api/scenarios/${rev.definitionId}/revisions`,
    {
      data: {
        requestId: crypto.randomUUID(),
        expectedRevision: 1,
        content: { ...rev.content, name: 'Other author wins' },
      },
    },
  );
  expect((await another.json()).accepted).toBe(true);
  await pane(page)
    .getByRole('textbox', { name: 'Arrangement name' })
    .fill('My retained edits');
  await pane(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(pane(page).getByRole('alert')).toContainText('Scenario changed');
  await expect(
    pane(page).getByRole('textbox', { name: 'Arrangement name' }),
  ).toHaveValue('My retained edits');
  expect(
    (
      await (
        await page.request.get(
          `${rtsOrigin}/api/scenarios/${rev.definitionId}?revision=1`,
        )
      ).json()
    ).content.name,
  ).toBe('Concurrent authoring');
  expect(
    (
      await (
        await page.request.get(
          `${rtsOrigin}/api/scenarios/${rev.definitionId}?revision=2`,
        )
      ).json()
    ).content.name,
  ).toBe('Other author wins');
  await page.screenshot({ path: resolve(evidence, 'revision-conflict.png') });
  await pane(page)
    .getByRole('button', { name: 'Save as new', exact: true })
    .click();
  await expect(pane(page).locator('.units-save-status')).toHaveText(
    'Revision 1 saved',
  );
  await page.setViewportSize({ width: 1100, height: 720 });
  await page.screenshot({ path: resolve(evidence, 'units-narrow.png') });
});

test('unapplied role and pose edits cannot silently Save or Run; reload retains them and Escape cancels from the palette', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto(rtsOrigin);
  await editor(page);
  await pane(page)
    .getByRole('button', { name: /^Friendly drone/ })
    .click();
  await expect(
    pane(page).getByRole('button', { name: 'Cancel placement · Esc' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(
    pane(page).getByRole('button', { name: 'Cancel placement · Esc' }),
  ).toHaveCount(0);
  await place(page, 'Friendly drone');
  await save(page);
  await pane(page)
    .getByRole('combobox', { name: 'Command role' })
    .selectOption('observation');
  await pane(page)
    .getByRole('textbox', { name: 'Unit heading', exact: true })
    .fill('188.125');
  await expect(
    pane(page).getByRole('button', { name: 'Save revision', exact: true }),
  ).toBeDisabled();
  await expect(
    pane(page).getByRole('button', {
      name: 'Run saved revision 1',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(pane(page).locator('.units-revision')).toContainText(
    'Unapplied unit edits',
  );
  await page.screenshot({
    path: resolve(evidence, 'unapplied-edits-guarded.png'),
  });
  await page.reload();
  await editor(page);
  await expect(
    pane(page).getByRole('combobox', { name: 'Command role' }),
  ).toHaveValue('observation');
  await expect(
    pane(page).getByRole('textbox', { name: 'Unit heading', exact: true }),
  ).toHaveValue('188.125');
  await pane(page)
    .getByRole('button', { name: 'Apply changes', exact: true })
    .click();
  await save(page);
  await pane(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(
    pane(page).getByText('Ready to run', { exact: true }),
  ).toBeVisible();
  await pane(page)
    .getByRole('button', { name: 'Run saved revision 2', exact: true })
    .click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
  const frame = await readWorld(page);
  expect(frame.interactive?.controls).toHaveLength(0);
  expect(Object.values(frame.tracks)[0].latest?.velocity?.headingTrueDeg).toBe(
    188.125,
  );
  await map(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect(map(page)).toHaveAttribute('data-context', 'operational');
  await expect(map(page).locator('.scenario-map-running')).toContainText(
    'revision 2',
  );
  await page.screenshot({
    path: resolve(evidence, 'custom-observation-run-3d.png'),
  });
  await endDemo(page);
});
