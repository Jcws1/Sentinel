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
import type {
  ScenarioRevision,
  WorldFrame,
} from '../../src/contracts/generated';
const evidence = resolve(
  '../docs/d4-refinement/regressions/d4/regressions/conductor',
);
const units = (p: Page) => p.locator('[data-view="units"]');
const conductor = (p: Page) => p.locator('[data-view="conductor"]');
const map = (p: Page, id = 'tactical') =>
  p.locator(`.tactical-view[data-view-id="${id}"]`);
test.use({ actionTimeout: 10000 });
test.beforeAll(async () => {
  await mkdir(evidence, { recursive: true });
});
test.afterEach(async ({ page }) => {
  await page.keyboard.press('Escape');
  const state = page.locator('.simulation-run-state');
  if (
    (await state.count()) &&
    ['Running', 'Paused'].includes(await state.first().innerText())
  )
    await endDemo(page);
});
async function open(p: Page, name: string) {
  await p.goto(rtsOrigin);
  expect(
    (await (await p.request.get(`${rtsOrigin}/api/interactive/entry`)).json())
      .enabled,
  ).toBe(true);
  await p
    .getByRole('button', { name: 'Open Units', exact: true })
    .first()
    .click();
  await units(p)
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await units(p).getByLabel('Arrangement name', { exact: true }).fill(name);
}
async function unit(
  p: Page,
  category: string,
  lon: string,
  lat = '1.296',
  observer = false,
) {
  await units(p)
    .getByRole('button', { name: new RegExp(`^${category}`) })
    .click();
  await units(p).locator('.units-numeric summary').click();
  await units(p)
    .getByRole('textbox', { name: 'Placement longitude', exact: true })
    .fill(lon);
  await units(p)
    .getByRole('textbox', { name: 'Placement latitude', exact: true })
    .fill(lat);
  await units(p)
    .getByRole('textbox', { name: 'Placement altitude', exact: true })
    .fill('231.125');
  if (observer)
    await units(p)
      .getByRole('combobox', { name: 'Placement command role', exact: true })
      .selectOption('observation');
  await units(p)
    .getByRole('button', { name: 'Place at coordinates', exact: true })
    .click();
}
async function toConductor(p: Page) {
  await p
    .getByRole('button', { name: 'Open Conductor', exact: true })
    .first()
    .click();
}
async function action(
  p: Page,
  label: string,
  time: string,
  lon = '103.866',
  lat = '1.305',
) {
  await conductor(p)
    .getByRole('button', { name: 'Add action', exact: true })
    .click();
  const actor = conductor(p).getByRole('combobox', {
    name: 'Script actor',
    exact: true,
  });
  const option = actor.locator('option').filter({ hasText: label });
  await actor.selectOption((await option.getAttribute('value'))!);
  await conductor(p)
    .getByRole('textbox', { name: 'Action time after Start', exact: true })
    .fill(time);
  await conductor(p)
    .getByRole('textbox', { name: 'Script destination longitude', exact: true })
    .fill(lon);
  await conductor(p)
    .getByRole('textbox', { name: 'Script destination latitude', exact: true })
    .fill(lat);
  await conductor(p)
    .getByRole('button', { name: 'Apply action', exact: true })
    .click();
}
async function saved(p: Page, name: string) {
  const list = await (await p.request.get(`${rtsOrigin}/api/scenarios`)).json();
  return list.scenarios.find(
    (s: ScenarioRevision) => s.content.name === name,
  ) as ScenarioRevision;
}
async function reviewRun(p: Page) {
  await conductor(p)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(conductor(p).locator('.conductor-context')).toContainText(
    'Saved revision',
  );
  await conductor(p)
    .getByRole('button', { name: 'Validate → Run review', exact: true })
    .click();
  await expect(
    conductor(p).getByLabel('Scenario validation review'),
  ).toContainText('Ready to run');
  await conductor(p)
    .getByRole('button', { name: /^Run saved revision/ })
    .click();
  await expect(p.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
}
function state(world: WorldFrame, unit: string, time: number) {
  return world.scenarioSchedule!.actions.find(
    (e) =>
      world.entities[e.entityId].label === unit && e.action.offsetMs === time,
  )!;
}

test('raw name recovery and repeated validation stay usable with readable primary states', async ({
  page,
}) => {
  test.setTimeout(90000);
  await open(page, 'Name editing regression');
  await unit(page, 'Friendly drone', '103.851');
  const name = units(page).getByLabel('Arrangement name', { exact: true });
  await name.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await expect(name).toHaveValue('');
  await expect(name).toBeFocused();
  await page.reload();
  await page
    .getByRole('button', { name: 'Open Units', exact: true })
    .first()
    .click();
  await units(page)
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await expect(name).toHaveValue('');
  await expect(
    units(page).getByRole('button', { name: 'Save revision', exact: true }),
  ).toBeDisabled();
  await name.fill('Recovered name');
  await toConductor(page);
  await conductor(page)
    .getByRole('button', { name: 'Add action', exact: true })
    .click();
  await conductor(page)
    .getByLabel('Action time after Start', { exact: true })
    .fill('601');
  const apply = conductor(page).getByRole('button', {
    name: 'Apply action',
    exact: true,
  });
  const error = conductor(page).getByRole('alert');
  const checks = [];
  for (const [width, height] of [
    [760, 820],
    [820, 900],
    [900, 900],
    [1440, 900],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await page.setViewportSize({ width, height });
    await apply.click();
    await expect(error).toBeFocused();
    await expect(error).toContainText('0 to 600 seconds');
    await apply.click();
    await expect(error).toBeFocused();
    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(error).toBeFocused();
    const body = (await conductor(page)
      .locator('.conductor-body')
      .boundingBox())!;
    const box = (await error.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(body.y);
    expect(box.y + box.height).toBeLessThanOrEqual(body.y + body.height + 1);
    await apply.hover();
    await expect(apply).toHaveCSS('color', 'rgb(18, 33, 32)');
    const contrast = await apply.evaluate((button) => {
      const style = getComputedStyle(button);
      const light = (color: string) => {
        const rgb = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number)
          .map((n) => n / 255)
          .map((n) =>
            n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
          );
        return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      };
      const a = light(style.color),
        b = light(style.backgroundColor);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({
      path: resolve(evidence, `corrected-validation-${width}.png`),
    });
    checks.push({
      width,
      height,
      contrast,
      repeatedPointerAndKeyboardErrorFocused: true,
    });
  }
  await writeFile(
    resolve(evidence, 'corrected-validation.json'),
    JSON.stringify(checks, null, 2),
  );
  await conductor(page)
    .getByRole('button', { name: 'Cancel action edit', exact: true })
    .click();
  await expect(
    conductor(page).getByRole('button', { name: 'Add action', exact: true }),
  ).toBeFocused();
});

test('Conductor keyboard editing, two-map picks, recovery, exact copy and layout boundaries', async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, 'D3 authoring review');
  await unit(page, 'Friendly drone', '103.85');
  await unit(page, 'Hostile drone', '103.853');
  await page
    .getByRole('tab', { name: 'Tactical Map', exact: true })
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'New Tactical pane', exact: true })
    .click();
  await map(page, 'tactical:2')
    .getByRole('button', { name: '3D', exact: true })
    .click();
  await toConductor(page);
  await conductor(page)
    .getByRole('button', { name: 'Add action', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    conductor(page).getByRole('combobox', {
      name: 'Script actor',
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    conductor(page).getByLabel('Movement timing mode'),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('0.31');
  await page.keyboard.press('Tab');
  await expect(
    conductor(page).getByRole('textbox', {
      name: 'Action time after Start',
      exact: true,
    }),
  ).toHaveValue('0.4');
  await conductor(page)
    .getByRole('combobox', { name: 'Script destination map', exact: true })
    .selectOption('tactical:2');
  await conductor(page)
    .getByRole('button', { name: 'Pick scripted destination', exact: true })
    .click();
  await expect(map(page, 'tactical:2')).toContainText(
    'Pick scripted destination',
  );
  const other = map(page).locator('canvas').first(),
    box = (await other.boundingBox())!;
  const original = await conductor(page)
    .getByRole('textbox', { name: 'Script destination longitude', exact: true })
    .inputValue();
  await other.click({ position: { x: box.width * 0.45, y: box.height * 0.5 } });
  await expect(
    conductor(page).getByRole('textbox', {
      name: 'Script destination longitude',
      exact: true,
    }),
  ).toHaveValue(original);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __sentinelCesiumTest?: {
                  inspect(id: string): { ready: boolean };
                };
              }
            ).__sentinelCesiumTest?.inspect('tactical:2')?.ready,
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  const canvas = map(page, 'tactical:2').locator('canvas').first(),
    three = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: three.width * 0.6, y: three.height * 0.52 },
  });
  await expect(
    conductor(page).getByRole('textbox', {
      name: 'Script destination longitude',
      exact: true,
    }),
  ).not.toHaveValue(original);
  await expect(
    conductor(page).getByRole('textbox', {
      name: 'Script destination longitude',
      exact: true,
    }),
  ).toBeFocused();
  await page.screenshot({
    path: resolve(evidence, 'two-map-script-preview.png'),
  });
  await page.reload();
  await toConductor(page);
  await conductor(page)
    .getByRole('button', { name: 'Open Conductor editor', exact: true })
    .click();
  await expect(
    conductor(page).getByRole('textbox', {
      name: 'Action time after Start',
      exact: true,
    }),
  ).toHaveValue('0.4');
  await expect(
    conductor(page).getByRole('button', {
      name: 'Cancel destination pick',
      exact: true,
    }),
  ).toHaveCount(0);
  await conductor(page)
    .getByRole('textbox', { name: 'Script destination longitude', exact: true })
    .fill('103.862');
  await conductor(page)
    .getByRole('textbox', { name: 'Script destination latitude', exact: true })
    .fill('1.305');
  await conductor(page)
    .getByRole('button', { name: 'Apply action', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    conductor(page).getByRole('button', { name: 'Add action', exact: true }),
  ).toBeFocused();
  await action(page, 'Hostile 2', '0.4');
  await conductor(page)
    .getByRole('button', { name: 'Earlier at same tick', exact: true })
    .click();
  await expect(conductor(page).locator('tbody tr').first()).toContainText(
    'Hostile 2',
  );
  await conductor(page)
    .getByRole('button', { name: 'Duplicate action', exact: true })
    .click();
  await conductor(page)
    .getByRole('textbox', { name: 'Action time after Start', exact: true })
    .fill('0.4');
  await conductor(page)
    .getByRole('button', { name: 'Apply action', exact: true })
    .click();
  await expect(conductor(page).getByRole('alert')).toContainText(
    'one movement start',
  );
  await conductor(page)
    .getByRole('textbox', { name: 'Action time after Start', exact: true })
    .fill('2');
  await conductor(page)
    .getByRole('button', { name: 'Apply action', exact: true })
    .click();
  for (const [width, height] of [
    [760, 820],
    [820, 900],
    [899, 900],
    [900, 900],
    [1440, 900],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      conductor(page).getByRole('button', {
        name: 'Save revision',
        exact: true,
      }),
    ).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: resolve(evidence, `conductor-${width}.png`),
    });
  }
  const accessibility = await new AxeBuilder({ page })
    .include('[data-view="conductor"]')
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  let lost = '',
    writes = 0;
  await page.route('**/api/scenarios', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    lost = route.request().postData()!;
    await route.fetch();
    await route.abort();
  });
  await conductor(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(
    conductor(page).getByRole('button', { name: 'Check save', exact: true }),
  ).toBeVisible();
  await expect(
    conductor(page).getByRole('button', { name: 'Check save', exact: true }),
  ).toBeEnabled();
  await page.unroute('**/api/scenarios');
  await conductor(page)
    .getByRole('button', { name: 'Check save', exact: true })
    .click();
  await expect(conductor(page).locator('.conductor-context')).toContainText(
    'Saved revision 1',
  );
  expect(writes).toBe(1);
  const originalRevision = await saved(page, 'D3 authoring review');
  expect(originalRevision.content.actions).toHaveLength(3);
  expect(originalRevision.content).toEqual(JSON.parse(lost).content);
  await conductor(page)
    .getByRole('button', { name: 'Units', exact: true })
    .click();
  await units(page)
    .getByRole('button', { name: 'Save as new', exact: true })
    .click();
  await expect(units(page).locator('.units-save-status')).toContainText(
    'saved',
  );
  const all = await (
    await page.request.get(`${rtsOrigin}/api/scenarios`)
  ).json();
  const copy = all.scenarios.find(
    (s: ScenarioRevision) =>
      s.content.name === 'D3 authoring review' &&
      s.definitionId !== originalRevision.definitionId,
  ) as ScenarioRevision;
  expect(
    copy.content.actions?.every(
      (a) =>
        copy.content.units.some((u) => u.id === a.unitId) &&
        !originalRevision.content.actions?.some((o) => o.id === a.id),
    ),
  ).toBe(true);
  expect(
    await (
      await page.request.get(
        `${rtsOrigin}/api/scenarios/${originalRevision.definitionId}?revision=1`,
      )
    ).json(),
  ).toEqual(originalRevision);
  expect(errors).toEqual([]);
});

test('three hostile ticks, two friendlies, observation-only motion, manual override and long paused Stop/Return', async ({
  page,
}) => {
  test.setTimeout(210000);
  await open(page, 'D3 complete operator run');
  await unit(page, 'Friendly drone', '103.847');
  await unit(page, 'Friendly drone', '103.848');
  await unit(page, 'Friendly drone', '103.849', '1.296', true);
  for (const lon of ['103.850', '103.851', '103.852'])
    await unit(page, 'Hostile drone', lon, '1.298');
  await unit(page, 'Unknown entity', '103.854', '1.292');
  await toConductor(page);
  for (const [label, time] of [
    ['Friendly 1', '0'],
    ['Friendly 2', '0'],
    ['Friendly 3', '0'],
    ['Hostile 4', '0'],
    ['Hostile 5', '1'],
    ['Hostile 6', '2'],
    ['Friendly 1', '8'],
    ['Friendly 1', '25'],
  ])
    await action(page, label, time);
  const lost = new Map<string, string>();
  await page.route('**/api/interactive/**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON(),
      kind = body.creationId ? 'create' : body.intent?.action;
    if (!['create', 'start', 'end', 'stop'].includes(kind) || lost.has(kind))
      return route.continue();
    const response = await route.fetch();
    if (response.ok()) {
      lost.set(kind, body.commandId ?? body.creationId);
      await route.abort();
    } else await route.fulfill({ response });
  });
  await reviewRun(page);
  let world = await readWorld(page);
  const first = world.mission.id,
    originalRecording = world.recordingId;
  await expect
    .poll(
      async () => state(await readWorld(page), 'Hostile 6', 2000).consumedTick,
    )
    .toBe(10);
  world = await readWorld(page);
  expect(world.interactive?.controls).toHaveLength(2);
  expect(state(world, 'Friendly 1', 0).motion?.acceptedTick).toBe(0);
  expect(state(world, 'Friendly 2', 0).motion?.acceptedTick).toBe(0);
  expect(state(world, 'Friendly 3', 0).motion).toBeTruthy();
  expect(
    world.scenarioSchedule?.actions.some(
      (e) => world.entities[e.entityId].label === 'Unknown 7',
    ),
  ).toBe(false);
  await fleetSelect(page, ['Friendly 1']);
  await page
    .locator('.fleet-sidebar')
    .getByRole('button', { name: 'Stop selected', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readWorld(page)).scenarioSchedule?.manualOverrides?.length,
    )
    .toBe(1);
  await expect
    .poll(async () => state(await readWorld(page), 'Friendly 1', 8000).state, {
      timeout: 15000,
    })
    .toBe('Skipped');
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .click();
  await toConductor(page);
  await expect(conductor(page)).toContainText('PAUSED');
  // Capture the committed Pause, not the source tick while its request is in flight.
  const paused = await readWorld(page);
  expect(paused.interactive?.state).toBe('paused');
  await expect(conductor(page)).toContainText('Skipped');
  await conductor(page)
    .getByRole('button', {
      name: 'Select action Friendly 1 25.0s after Start',
      exact: true,
    })
    .click();
  await expect(conductor(page)).toContainText('MANUAL OVERRIDE');
  await page.screenshot({
    path: resolve(evidence, 'paused-committed-script.png'),
  });
  // Deliberately exceed the 30-second live intent lifetime; source time stays frozen.
  await page.waitForTimeout(32000);
  const afterPause = await readWorld(page);
  expect(afterPause.interactive?.tick).toBe(paused.interactive?.tick);
  expect(afterPause.tracks).toEqual(paused.tracks);
  const stop = page
    .locator('.fleet-sidebar')
    .getByRole('button', { name: 'Stop selected', exact: true });
  await expect(stop).toBeEnabled();
  await stop.click();
  const resumeScript = page
    .locator('.fleet-sidebar')
    .getByRole('button', { name: 'Return to script', exact: true });
  await expect(resumeScript).toBeEnabled();
  await resumeScript.click();
  await expect
    .poll(
      async () =>
        (await readWorld(page)).scenarioSchedule?.manualOverrides?.length,
    )
    .toBe(0);
  await page
    .getByRole('button', { name: 'Resume', exact: true })
    .first()
    .click();
  await expect
    .poll(async () => state(await readWorld(page), 'Friendly 1', 25000).state, {
      timeout: 25000,
    })
    .toBe('Running');
  expect(state(await readWorld(page), 'Friendly 1', 8000).state).toBe(
    'Skipped',
  );
  // A recorded Stop result must stay visibly historical after a later live Move.
  await stop.click();
  const lastControl = page
    .locator('.fleet-sidebar')
    .getByRole('status', { name: 'Last selected-control receipt' });
  await expect(lastControl).toContainText(
    /Last Stop receipt · order \d+ · accepted/,
  );
  await expect
    .poll(async () => state(await readWorld(page), 'Friendly 1', 25000).state)
    .toBe('Cancelled');
  // A live map order independently establishes override and cancels current script work.
  await directClick(page, 0.6, 0.6);
  await expect
    .poll(async () =>
      (await readWorld(page)).interactive?.executions?.some(
        (e) => e.state === 'Running',
      ),
    )
    .toBe(true);
  // A later lifecycle renewal may retire the shared receipt. If still shown,
  // its immutable holding reason must remain explicitly historical.
  expect(
    (await lastControl.allTextContents()).every((text) =>
      /Last Stop receipt · order \d+ · accepted/.test(text),
    ),
  ).toBe(true);
  await expect(page.locator('.fleet-sidebar')).toContainText(
    'Manual override · Moving',
  );
  await page.screenshot({
    path: resolve(evidence, 'recorded-stop-after-live-move.png'),
  });
  await expect
    .poll(
      async () =>
        (await readWorld(page)).scenarioSchedule?.manualOverrides?.length,
    )
    .toBe(1);
  await endDemo(page);
  await page.unroute('**/api/interactive/**');
  const ended = await readWorld(page, first);
  expect(
    ended.scenarioSchedule?.actions.every(
      (e) => !['Pending', 'Accepted', 'Running'].includes(e.state),
    ),
  ).toBe(true);
  for (const kind of ['create', 'start', 'stop', 'end'])
    expect(lost.has(kind)).toBe(true);
  await toConductor(page);
  await page
    .getByRole('button', { name: 'Open Units', exact: true })
    .first()
    .click();
  await units(page)
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await units(page)
    .getByRole('button', { name: /^Run saved revision/ })
    .click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
  const fresh = await readWorld(page);
  expect(fresh.mission.id).not.toBe(first);
  expect(fresh.recordingId).not.toBe(originalRecording);
  expect(await readWorld(page, first)).toEqual(ended);
  await writeFile(
    resolve(evidence, 'committed-run-summary.json'),
    JSON.stringify(
      {
        first,
        originalRecording,
        actionStates: ended.scenarioSchedule?.actions.map((e) => ({
          id: e.action.id,
          state: e.state,
          reason: e.reason,
          consumedTick: e.consumedTick,
        })),
        rerun: fresh.mission.id,
        lostResponses: [...lost.keys()],
        pausedTick: paused.interactive?.tick,
      },
      null,
      2,
    ),
  );
});
