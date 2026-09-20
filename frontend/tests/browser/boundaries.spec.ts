import {
  openAuthoringTab,
  openScenarioFile,
  openUnitsSettings,
} from './authoringActions';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rtsOrigin, readWorld, endDemo, fleetSelect } from './rtsActions';
import type { ScenarioRevision } from '../../src/contracts/generated';
import type { CameraIntent } from '../../src/renderers/contracts';
import { unchangedCamera } from './cameraAssertions';
const evidence = resolve('test-results/browser/boundaries');
const units = (p: Page) => p.locator('[data-view="orchestrator"]');
const map = (p: Page, id = 'tactical') =>
  p.locator(`.tactical-view[data-view-id="${id}"]`);
async function open(p: Page) {
  await p.goto(rtsOrigin);
  expect(
    (await (await p.request.get(`${rtsOrigin}/api/interactive/entry`)).json())
      .enabled,
  ).toBe(true);
  await openAuthoringTab(p, 'Units');
  await p
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await expect(map(p)).toHaveAttribute('data-context', 'authoring');
}
async function unit(p: Page, lon = '103.85', lat = '1.29') {
  await units(p)
    .getByRole('button', { name: /^Friendly/ })
    .click();
  await units(p)
    .locator('.units-subtypes')
    .getByRole('button', { name: /^Quadcopter \/ strike/ })
    .click();
  await units(p).locator('.units-numeric summary').click();
  await units(p)
    .getByRole('textbox', { name: 'Placement longitude', exact: true })
    .fill(lon);
  await units(p)
    .getByRole('textbox', { name: 'Placement latitude', exact: true })
    .fill(lat);
  await units(p)
    .getByRole('button', { name: 'Place at coordinates', exact: true })
    .click();
}
const rectangle = [
  [103.854, 1.289],
  [103.856, 1.289],
  [103.856, 1.291],
  [103.854, 1.291],
];
async function numeric(p: Page, name: string, vertices = rectangle) {
  await openUnitsSettings(p);
  await units(p)
    .getByRole('button', { name: 'Draw boundary', exact: true })
    .focus();
  await p.keyboard.press('Enter');
  await expect(
    units(p).getByRole('textbox', { name: 'Boundary name', exact: true }),
  ).toBeFocused();
  await p.keyboard.press('ControlOrMeta+A');
  await p.keyboard.type(name);
  for (let i = 0; i < vertices.length; i++) {
    await units(p)
      .getByRole('button', { name: 'Add numeric vertex', exact: true })
      .focus();
    await p.keyboard.press('Enter');
    await expect(
      units(p).getByRole('textbox', {
        name: `Vertex ${i + 1} longitude`,
        exact: true,
      }),
    ).toBeFocused();
    await p.keyboard.type(String(vertices[i][0]));
    await p.keyboard.press('Tab');
    await p.keyboard.type(String(vertices[i][1]));
  }
  await units(p)
    .getByRole('button', { name: 'Finish boundary', exact: true })
    .focus();
  await p.keyboard.press('Enter');
  await expect(
    units(p).getByRole('button', { name: 'Draw boundary', exact: true }),
  ).toBeFocused();
}
async function save(p: Page, name: string): Promise<ScenarioRevision> {
  await units(p)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(units(p).locator('.units-save-status')).toContainText('saved');
  const list = await (await p.request.get(`${rtsOrigin}/api/scenarios`)).json();
  return list.scenarios.find((s: ScenarioRevision) => s.content.name === name);
}
async function inspect(p: Page, id = 'tactical', threeD = false) {
  return p.evaluate(
    ({ id, threeD }) => {
      const w = window as unknown as Record<
        string,
        {
          inspect(id: string): {
            ready: boolean;
            camera: CameraIntent;
            zoneIds: string[];
          };
        }
      >;
      return w[threeD ? '__sentinelCesiumTest' : '__sentinelMapTest']?.inspect(
        id,
      );
    },
    { id, threeD },
  );
}
test.use({ actionTimeout: 12000 });
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});
test.afterEach(async ({ page }) => {
  const state = page.locator('.simulation-run-state');
  if ((await state.count()) && (await state.textContent()) === 'Running')
    await endDemo(page);
});

test('keyboard boundaries, invalid edit recovery, exact copies, validated run and hidden enforcement', async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const name = 'D2 protected crossing';
  await units(page)
    .getByRole('textbox', { name: 'Arrangement name' })
    .fill(name);
  await unit(page);
  await numeric(page, 'Transit exclusion');
  const untyped = await save(page, name);
  // Newly authored scenarios explicitly own their default geometry.
  expect(untyped.schemaVersion).toBe('1.6');
  expect(untyped.content.localGeometry?.origin).toEqual({
    longitudeDeg: 103.85,
    latitudeDeg: 1.29,
  });
  expect(untyped.content.boundaries![0]!.vertices).toEqual(rectangle);
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).locator('.units-review')).toContainText(
    'annotation',
  );
  await expect(
    units(page).getByRole('button', {
      name: 'Run saved revision 1',
      exact: true,
    }),
  ).toBeDisabled();
  await units(page).getByRole('tab', { name: 'Units', exact: true }).click();
  await units(page)
    .getByRole('combobox', { name: 'Type of Transit exclusion' })
    .selectOption('restricted');
  await units(page)
    .getByRole('button', { name: 'Edit Transit exclusion', exact: true })
    .click();
  await units(page)
    .getByRole('textbox', { name: 'Vertex 1 longitude', exact: true })
    .fill('105');
  await units(page)
    .getByRole('button', { name: 'Apply boundary', exact: true })
    .click();
  await expect(units(page).getByRole('alert')).toContainText('5 km');
  await expect(units(page).getByRole('alert')).toBeFocused();
  await expect(
    units(page).getByRole('button', { name: 'Save revision', exact: true }),
  ).toBeDisabled();
  await page.reload();
  await openAuthoringTab(page, 'Units');
  await page
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await expect(
    units(page).getByRole('textbox', {
      name: 'Vertex 1 longitude',
      exact: true,
    }),
  ).toHaveValue('105');
  await expect(units(page)).toContainText('Map input paused');
  await units(page)
    .getByRole('button', { name: 'Cancel boundary', exact: true })
    .click();
  const saved = await save(page, name);
  expect(saved.content.boundaries![0]!.vertices).toEqual(rectangle);
  let copied: ScenarioRevision | undefined;
  await page.route('**/api/scenarios', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    copied = (await response.json()).result;
    await route.abort('failed');
  });
  await openScenarioFile(page);
  await units(page)
    .getByRole('button', { name: 'Save as new', exact: true })
    .click();
  await units(page)
    .getByRole('button', { name: 'Check save', exact: true })
    .click();
  await expect(units(page).locator('.units-save-status')).toContainText(
    'saved',
  );
  await page.unroute('**/api/scenarios');
  expect(copied!.definitionId).not.toBe(saved.definitionId);
  expect(copied!.content.boundaries![0]!.id).not.toBe(
    saved.content.boundaries![0]!.id,
  );
  expect(copied!.content.units[0].id).not.toBe(saved.content.units[0].id);
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).locator('.units-review')).toContainText(
    '1 boundaries',
  );
  await page.screenshot({ path: resolve(evidence, 'validated.png') });
  const creationBodies: string[] = [],
    createdMissions: string[] = [];
  await page.route('**/api/interactive/runs', async (route) => {
    creationBodies.push(route.request().postData()!);
    const response = await route.fetch();
    createdMissions.push((await response.json()).missionId);
    if (creationBodies.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await units(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect.poll(() => createdMissions.length).toBeGreaterThan(0);
  const retry = units(page).getByRole('button', {
    name: 'Retry Run request',
    exact: true,
  });
  if (await retry.isVisible()) await retry.click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
  await page.unroute('**/api/interactive/runs');
  expect(new Set(creationBodies).size).toBe(1);
  expect(new Set(createdMissions).size).toBe(1);
  console.info('D2 workflow: run started');
  const first = await readWorld(page);
  expect(first.boundaryRules?.ruleVersion).toBe('local-boundary-v1');
  expect(first.scenario!.definitionId).toBe(copied!.definitionId);
  await fleetSelect(page, ['Friendly 1']);
  console.info('D2 workflow: selected controlled asset');
  await page
    .getByRole('button', { name: 'Activity', exact: true })
    .first()
    .click();
  await page.locator('.movement-draft summary').click();
  console.info('D2 workflow: movement editor open');
  const move = async (lon: string, lat: string) => {
    await page
      .getByRole('textbox', { name: 'Destination longitude', exact: true })
      .fill(lon);
    await page
      .getByRole('textbox', { name: 'Destination latitude', exact: true })
      .fill(lat);
    await page
      .getByRole('button', { name: 'Move selected', exact: true })
      .click();
  };
  await move('103.858', '1.29');
  console.info('D2 workflow: crossing submitted');
  await expect(page.locator('.movement-pane')).toContainText(
    'Transit exclusion',
  );
  expect((await readWorld(page)).interactive!.executions).toHaveLength(0);
  await move('103.85', '1.30');
  console.info('D2 workflow: allowed move submitted');
  await expect
    .poll(async () => (await readWorld(page)).interactive!.executions!.length)
    .toBe(1);
  const old = (await readWorld(page)).interactive!.executions![0].id;
  // Presentation-only overlay toggle cannot relax the backend's rule.
  await map(page)
    .getByRole('button', { name: 'Map layers', exact: true })
    .click();
  await page
    .getByRole('menuitemcheckbox', { name: 'Zones', exact: true })
    .click();
  await page.keyboard.press('Escape');
  await move('103.855', '1.29');
  await expect(page.locator('.movement-pane')).toContainText(
    'Transit exclusion',
  );
  expect((await readWorld(page)).interactive!.executions![0].id).toBe(old);
  expect((await readWorld(page)).interactive!.executions![0].state).not.toBe(
    'Cancelled',
  );
  await page.screenshot({ path: resolve(evidence, 'blocked-live.png') });
  await endDemo(page);
  const ended = await readWorld(page, first.mission.id);
  await openAuthoringTab(page, 'Units');
  await page
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await units(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running');
  const rerun = await readWorld(page);
  expect(rerun.recordingId).not.toBe(ended.recordingId);
  expect(rerun.interactive!.runId).not.toBe(ended.interactive!.runId);
  expect(Object.keys(rerun.boundaryRules!.zones)[0]).not.toBe(
    Object.keys(ended.boundaryRules!.zones)[0],
  );
  expect(await readWorld(page, first.mission.id)).toEqual(ended);
  await endDemo(page);
  expect(errors).toEqual([]);
});

test('both-map drawing, double-click final vertex, overlapping menu, edits and independent camera gestures', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await page
    .getByRole('tab', { name: 'Tactical Map', exact: true })
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'New Tactical pane', exact: true })
    .click();
  await map(page, 'tactical:2')
    .getByRole('button', { name: '3D', exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page, 'tactical:2', true))?.ready, {
      timeout: 20000,
    })
    .toBe(true);
  const secondCamera = (await inspect(page, 'tactical:2', true)).camera;
  for (const [id, threeD] of [
    ['tactical', false],
    ['tactical:2', true],
  ] as const) {
    await openScenarioFile(page);
    await units(page)
      .getByRole('combobox', { name: 'Authoring map', exact: true })
      .selectOption(id);
    const pane = map(page, id),
      canvas = pane.locator('canvas').first();
    await pane
      .getByRole('button', { name: 'Draw zone/boundary', exact: true })
      .click();
    await units(page)
      .getByRole('textbox', { name: 'Boundary name', exact: true })
      .fill(`Boundary ${id}`);
    const box = (await canvas.boundingBox())!;
    const a = { x: box.width * 0.35, y: box.height * 0.42 },
      b = { x: box.width * 0.65, y: box.height * 0.42 },
      c = { x: box.width * 0.5, y: box.height * 0.65 };
    const before = (await inspect(page, id, threeD)).camera;
    await canvas.click({ position: a });
    await canvas.click({ position: b });
    await canvas.dblclick({ position: c });
    await expect(
      units(page).getByRole('button', { name: 'Finish boundary', exact: true }),
    ).toHaveCount(0);
    unchangedCamera((await inspect(page, id, threeD)).camera, before);
    await canvas.click({
      position: { x: box.width * 0.5, y: box.height * 0.5 },
      button: 'right',
    });
    await expect(
      pane.getByRole('dialog', { name: 'Boundary actions' }),
    ).toBeVisible();
    const choose = pane.getByRole('button', {
      name: `Boundary ${id}`,
      exact: true,
    });
    if (await choose.count()) await choose.click();
    await pane
      .getByRole('button', { name: /Friendly.*NO ENGAGEMENT/i })
      .click();
    await units(page)
      .getByRole('button', { name: `Edit Boundary ${id}`, exact: true })
      .click();
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(3);
    const original = await units(page)
      .getByRole('textbox', { name: 'Vertex 1 longitude', exact: true })
      .inputValue();
    await page.mouse.move(box.x + a.x, box.y + a.y);
    await page.mouse.down();
    await page.mouse.move(box.x + a.x - 15, box.y + a.y - 15, { steps: 6 });
    await page.mouse.up();
    await expect(
      units(page).getByRole('textbox', {
        name: 'Vertex 1 longitude',
        exact: true,
      }),
    ).not.toHaveValue(original);
    await units(page)
      .getByRole('button', { name: 'Cancel boundary', exact: true })
      .click();
    await pane
      .getByRole('button', { name: 'Draw zone/boundary', exact: true })
      .click();
    await canvas.click({ position: a });
    await pane.getByRole('button', { name: 'Pan', exact: true }).click();
    await expect(units(page)).toContainText('Map input paused');
    await canvas.focus();
    await page.keyboard.press('Escape');
    await expect(
      units(page).getByRole('button', { name: 'Cancel boundary', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: resolve(evidence, `draw-${threeD ? '3d' : 'tactical'}.png`),
    });
  }
  unchangedCamera(
    (await inspect(page, 'tactical:2', true)).camera,
    secondCamera,
  );
});

test('responsive keyboard feedback and accessible boundary controls', async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page);
  await numeric(page, 'Keyboard boundary');
  await units(page)
    .getByRole('combobox', { name: 'Type of Keyboard boundary' })
    .selectOption('annotation');
  await units(page)
    .getByRole('button', { name: 'Edit Keyboard boundary', exact: true })
    .click();
  await units(page)
    .getByRole('textbox', { name: 'Vertex 2 longitude', exact: true })
    .fill('103.854');
  for (const [width, height] of [
    [760, 800],
    [820, 800],
    [900, 800],
    [1440, 900],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await page.setViewportSize({ width, height });
    await units(page)
      .getByRole('button', { name: 'Apply boundary', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(units(page).getByRole('alert')).toBeFocused();
    await expect(units(page).getByRole('alert')).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await map(page).boundingBox())!.width).toBeGreaterThan(
      width <= 900 ? 220 : 650,
    );
    const audit = await new AxeBuilder({ page })
      .include('.orchestrator-pane')
      .analyze();
    expect(
      audit.violations.filter((v) =>
        ['serious', 'critical'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
    await page.screenshot({ path: resolve(evidence, `keyboard-${width}.png`) });
  }
  await page.keyboard.press('Escape');
  await expect(
    units(page).getByRole('button', { name: 'Draw boundary', exact: true }),
  ).toBeFocused();
});

test('overlapping chooser is stable, type errors retain geometry, and restricted occupants cannot run', async ({
  page,
}) => {
  await open(page);
  await unit(page);
  const name = 'D2 overlapping protected origin';
  await units(page)
    .getByRole('textbox', { name: 'Arrangement name' })
    .fill(name);
  const aroundOrigin = [
    [103.849, 1.289],
    [103.851, 1.289],
    [103.851, 1.291],
    [103.849, 1.291],
  ];
  await numeric(page, 'First footprint', aroundOrigin);
  await numeric(page, 'Second footprint', aroundOrigin);
  const pane = map(page),
    canvas = pane.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    button: 'right',
    position: { x: box.width / 2, y: box.height / 2 },
  });
  const menu = pane.getByRole('dialog', { name: 'Boundary actions' });
  await expect(menu).toContainText('Choose overlapping boundary');
  const ordering = await menu.getByRole('button').allTextContents();
  await menu
    .getByRole('button', { name: 'First footprint', exact: true })
    .click();
  await menu.getByRole('button', { name: /RESTRICTED/ }).click();
  await canvas.click({
    button: 'right',
    position: { x: box.width / 2, y: box.height / 2 },
  });
  expect(await menu.getByRole('button').allTextContents()).toEqual(ordering);
  await menu
    .getByRole('button', { name: 'Second footprint', exact: true })
    .click();
  await menu.getByRole('button', { name: /FRIENDLY/ }).click();
  await save(page, name);
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).locator('.units-review')).toContainText(
    'Friendly 1',
  );
  await expect(units(page).locator('.units-review')).toContainText(
    'Reposition',
  );
  await expect(
    units(page).getByRole('button', {
      name: 'Run saved revision 1',
      exact: true,
    }),
  ).toBeDisabled();
  await page.screenshot({ path: resolve(evidence, 'restricted-occupant.png') });
  await units(page).getByRole('tab', { name: 'Units', exact: true }).click();
  await units(page)
    .getByRole('button', { name: 'Edit Second footprint', exact: true })
    .click();
  await units(page)
    .getByRole('textbox', { name: 'Boundary name', exact: true })
    .fill('Concave footprint');
  await units(page)
    .getByRole('textbox', { name: 'Vertex 2 longitude', exact: true })
    .fill('103.8495');
  await units(page)
    .getByRole('textbox', { name: 'Vertex 2 latitude', exact: true })
    .fill('1.2905');
  await units(page)
    .getByRole('button', { name: 'Apply boundary', exact: true })
    .click();
  await units(page)
    .getByRole('combobox', { name: 'Type of Concave footprint' })
    .selectOption('patrol');
  await expect(units(page).getByRole('alert')).toContainText('convex');
  await expect(
    units(page).getByRole('combobox', { name: 'Type of Concave footprint' }),
  ).toHaveValue('friendly');
  await units(page)
    .getByRole('button', { name: 'Delete Concave footprint', exact: true })
    .click();
  await expect(
    units(page).getByRole('button', {
      name: 'Edit Concave footprint',
      exact: true,
    }),
  ).toHaveCount(0);
});

test('double-click drift, early Space release, failed sky completion and menu dismissal are guarded', async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page);
  for (const threeD of [false, true]) {
    const pane = map(page);
    await pane
      .getByRole('button', { name: threeD ? '3D' : 'Tactical', exact: true })
      .click();
    await expect
      .poll(async () => (await inspect(page, 'tactical', threeD))?.ready, {
        timeout: 20000,
      })
      .toBe(true);
    const canvas = pane.locator('canvas').first(),
      box = (await canvas.boundingBox())!;
    await pane
      .getByRole('button', { name: 'Draw zone/boundary', exact: true })
      .click();
    await units(page)
      .getByRole('textbox', { name: 'Boundary name', exact: true })
      .fill(`Guarded ${threeD ? '3D' : 'Tactical'}`);
    await canvas.focus();
    await page.keyboard.down('Space');
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width * 0.4 + 3,
      box.y + box.height * 0.45,
    );
    await page.keyboard.up('Space');
    await page.mouse.up();
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(0);
    await canvas.click({
      position: { x: box.width * 0.32, y: box.height * 0.37 },
    });
    await canvas.click({
      position: { x: box.width * 0.62, y: box.height * 0.37 },
    });
    const before = (await inspect(page, 'tactical', threeD)).camera;
    await page.mouse.click(box.x + box.width * 0.47, box.y + box.height * 0.6, {
      clickCount: 1,
    });
    // Send the second native press, not mouse.click(clickCount:2), which
    // generates another pair of presses and would make this a triple click.
    await page.mouse.move(
      box.x + box.width * 0.47 + 1,
      box.y + box.height * 0.6,
    );
    await page.mouse.down({ clickCount: 2 });
    await page.mouse.up({ clickCount: 2 });
    await expect(
      units(page).getByRole('button', { name: 'Finish boundary', exact: true }),
    ).toHaveCount(0);
    unchangedCamera((await inspect(page, 'tactical', threeD)).camera, before);
    await units(page)
      .getByRole('button', {
        name: `Edit Guarded ${threeD ? '3D' : 'Tactical'}`,
        exact: true,
      })
      .click();
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(3);
    await units(page)
      .getByRole('button', { name: 'Cancel boundary', exact: true })
      .click();
    const menu = pane.getByRole('dialog', { name: 'Boundary actions' });
    for (const dismissal of ['canvas', 'Pan', 'projection']) {
      await canvas.click({
        button: 'right',
        position: { x: box.width * 0.47, y: box.height * 0.47 },
      });
      await expect(menu).toBeVisible();
      if (dismissal === 'canvas')
        await canvas.click({ position: { x: 30, y: 50 } });
      else
        await pane
          .getByRole('button', {
            name: dismissal === 'Pan' ? 'Pan' : threeD ? 'Tactical' : '3D',
            exact: true,
          })
          .click();
      await expect(menu).toHaveCount(0);
    }
    await page.screenshot({
      path: resolve(
        evidence,
        `corrected-gestures-${threeD ? '3d' : 'tactical'}.png`,
      ),
    });
  }
  const pane = map(page);
  await pane.getByRole('button', { name: '3D', exact: true }).click();
  await expect
    .poll(async () => (await inspect(page, 'tactical', true))?.ready, {
      timeout: 20000,
    })
    .toBe(true);
  await openUnitsSettings(page);
  await units(page)
    .getByRole('button', { name: 'Draw boundary', exact: true })
    .click();
  for (const [i, v] of [
    [103.848, 1.289],
    [103.852, 1.289],
    [103.85, 1.292],
  ].entries()) {
    await units(page)
      .getByRole('button', { name: 'Add numeric vertex', exact: true })
      .click();
    await units(page)
      .getByRole('textbox', { name: `Vertex ${i + 1} longitude`, exact: true })
      .fill(String(v[0]));
    await units(page)
      .getByRole('textbox', { name: `Vertex ${i + 1} latitude`, exact: true })
      .fill(String(v[1]));
  }
  await page.evaluate(() => {
    const w = window as unknown as {
      __sentinelCesiumTest: { setCamera(id: string, value: unknown): void };
    };
    w.__sentinelCesiumTest.setCamera('tactical', {
      center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
      groundSpanM: 1100,
      headingTrueDeg: 0,
      pitchFromNadirDeg: 85,
      focusHeightM: 0,
    });
  });
  const canvas = pane.locator('canvas').first(),
    box = (await canvas.boundingBox())!;
  await canvas.dblclick({ position: { x: box.width / 2, y: 4 } });
  await expect(units(page).locator('.boundary-vertices li')).toHaveCount(3);
  await expect(
    units(page).getByRole('button', { name: 'Finish boundary', exact: true }),
  ).toBeVisible();
  await expect(pane).toContainText('No map surface here');
  await page.screenshot({ path: resolve(evidence, 'corrected-sky-pick.png') });
  await canvas.focus();
  await page.keyboard.press('Enter');
  await expect(
    units(page).getByRole('button', { name: 'Finish boundary', exact: true }),
  ).toHaveCount(0);
});

test('a refused 33rd final vertex preserves the full draft until explicit Finish in both maps', async ({
  page,
}) => {
  test.setTimeout(120000);
  await open(page);
  for (const threeD of [false, true]) {
    const pane = map(page);
    await pane
      .getByRole('button', { name: threeD ? '3D' : 'Tactical', exact: true })
      .click();
    await expect
      .poll(async () => (await inspect(page, 'tactical', threeD))?.ready, {
        timeout: 20000,
      })
      .toBe(true);
    await openUnitsSettings(page);
    await units(page)
      .getByRole('button', { name: 'Draw boundary', exact: true })
      .click();
    await units(page)
      .getByRole('textbox', { name: 'Boundary name', exact: true })
      .fill(`Capacity ${threeD ? '3D' : 'Tactical'}`);
    const vertices = Array.from({ length: 32 }, (_, i) => [
      103.85 + 0.002 * Math.cos((i * Math.PI) / 16),
      1.29 + 0.002 * Math.sin((i * Math.PI) / 16),
    ]);
    for (const [i, v] of vertices.entries()) {
      await units(page)
        .getByRole('button', { name: 'Add numeric vertex', exact: true })
        .click();
      await units(page)
        .getByRole('textbox', {
          name: `Vertex ${i + 1} longitude`,
          exact: true,
        })
        .fill(String(v[0]));
      await units(page)
        .getByRole('textbox', { name: `Vertex ${i + 1} latitude`, exact: true })
        .fill(String(v[1]));
    }
    const canvas = pane.locator('canvas').first(),
      box = (await canvas.boundingBox())!;
    await canvas.dblclick({
      position: { x: box.width * 0.76, y: box.height * 0.38 },
    });
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(32);
    await expect(units(page).getByRole('alert')).toContainText('32');
    await expect(
      units(page).getByRole('button', { name: 'Finish boundary', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: resolve(
        evidence,
        `capacity-preserved-${threeD ? '3d' : 'tactical'}.png`,
      ),
    });
    await units(page)
      .getByRole('button', { name: 'Finish boundary', exact: true })
      .click();
    await units(page)
      .getByRole('button', {
        name: `Edit Capacity ${threeD ? '3D' : 'Tactical'}`,
        exact: true,
      })
      .click();
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(32);
    for (const [i, v] of vertices.entries()) {
      await expect(
        units(page).getByRole('textbox', {
          name: `Vertex ${i + 1} longitude`,
          exact: true,
        }),
      ).toHaveValue(String(v[0]));
      await expect(
        units(page).getByRole('textbox', {
          name: `Vertex ${i + 1} latitude`,
          exact: true,
        }),
      ).toHaveValue(String(v[1]));
    }
    await units(page)
      .getByRole('button', { name: 'Cancel boundary', exact: true })
      .click();
  }
});

test('selected-vertex Delete is scoped to the editor, respects the minimum and preserves input editing', async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page);
  const vertices = [
    [103.849, 1.289],
    [103.851, 1.289],
    [103.852, 1.29],
    [103.85, 1.292],
    [103.848, 1.29],
  ];
  for (const threeD of [false, true]) {
    const pane = map(page),
      name = `Delete ${threeD ? '3D' : 'Tactical'}`;
    await pane
      .getByRole('button', { name: threeD ? '3D' : 'Tactical', exact: true })
      .click();
    await expect
      .poll(async () => (await inspect(page, 'tactical', threeD))?.ready, {
        timeout: 20000,
      })
      .toBe(true);
    await numeric(page, name, vertices);
    await units(page)
      .getByRole('button', { name: `Edit ${name}`, exact: true })
      .click();
    await units(page)
      .getByRole('button', { name: 'Select vertex 4', exact: true })
      .click();
    await pane.locator('canvas').first().focus();
    await page.keyboard.press('Delete');
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(4);
    await units(page)
      .getByRole('button', { name: 'Apply boundary', exact: true })
      .click();
    await units(page)
      .getByRole('button', { name: `Edit ${name}`, exact: true })
      .click();
    await units(page)
      .getByRole('button', { name: 'Select vertex 4', exact: true })
      .click();
    await page.keyboard.press('Delete');
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(3);
    await pane.locator('canvas').first().focus();
    await page.keyboard.press('Delete');
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(3);
    const input = units(page).getByRole('textbox', {
      name: 'Vertex 1 longitude',
      exact: true,
    });
    await input.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
    await expect(input).toHaveValue('');
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(3);
    await units(page)
      .getByRole('button', { name: 'Apply boundary', exact: true })
      .click();
    await expect(units(page).getByRole('alert')).toBeFocused();
    await page.screenshot({
      path: resolve(evidence, `delete-edit-${threeD ? '3d' : 'tactical'}.png`),
    });
    await units(page)
      .getByRole('button', { name: 'Cancel boundary', exact: true })
      .click();
    await units(page)
      .getByRole('button', { name: `Edit ${name}`, exact: true })
      .click();
    await expect(units(page).locator('.boundary-vertices li')).toHaveCount(4);
    await units(page)
      .getByRole('button', { name: 'Cancel boundary', exact: true })
      .click();
  }
});
