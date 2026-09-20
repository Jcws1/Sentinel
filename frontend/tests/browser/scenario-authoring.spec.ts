import {
  armPlacement,
  openAuthoringTab,
  openScenarioFile,
} from './authoringActions';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rtsOrigin, readWorld, endDemo } from './rtsActions';
import type { CameraIntent } from '../../src/renderers/contracts';
const evidence = resolve('test-results/browser/scenario-authoring');
const units = (page: Page) => page.locator('[data-view="orchestrator"]');
const map = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
async function open(page: Page) {
  await page.goto(rtsOrigin);
  await openAuthoringTab(page, 'Units');
  await page
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await expect(map(page)).toHaveAttribute('data-context', 'authoring');
}
async function numeric(
  page: Page,
  longitude: string,
  latitude: string,
  observer = false,
) {
  const summary = units(page).locator('.units-numeric summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(
    units(page).getByRole('textbox', {
      name: 'Placement longitude',
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.type(longitude);
  await page.keyboard.press('Tab');
  await page.keyboard.type(latitude);
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('231.125');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('42.25');
  if (observer) {
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
  }
  const submit = units(page).getByRole('button', {
    name: 'Place at coordinates',
    exact: true,
  });
  await submit.focus();
  await page.keyboard.press('Enter');
}
async function save(page: Page) {
  await units(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(units(page).locator('.units-save-status')).toContainText(
    'saved',
  );
}
async function probe(page: Page, id: string, threeD = false) {
  return page.evaluate(
    ({ id, threeD }) => {
      const w = window as unknown as {
        __sentinelMapTest?: {
          inspect(id: string): { ready: boolean; camera: CameraIntent };
        };
        __sentinelCesiumTest?: {
          inspect(id: string): { ready: boolean; camera: CameraIntent };
        };
      };
      return (threeD ? w.__sentinelCesiumTest : w.__sentinelMapTest)?.inspect(
        id,
      );
    },
    { id, threeD },
  );
}
test.beforeAll(async () => mkdir(evidence, { recursive: true }).then(() => {}));
test.afterEach(async ({ page }) => {
  await page.keyboard.press('Escape');
  const menu = page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first();
  if (await menu.isVisible()) {
    await menu.click();
    const end = page.getByRole('menuitem', { name: 'End demo', exact: true });
    if ((await end.count()) && (await end.isEnabled())) await end.click();
  }
});

test('keyboard placement, explicit-position duplication, remapped copy recovery and authoritative review/run', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await units(page)
    .getByRole('textbox', { name: 'Arrangement name' })
    .fill('D1b keyboard composition');
  const friendly = units(page)
    .locator('.units-palette')
    .getByRole('button', { name: /^Friendly/ });
  await friendly.focus();
  await page.keyboard.press('Enter');
  const profile = units(page)
    .locator('.units-subtypes')
    .getByRole('button', { name: /^Quadcopter \/ strike/ });
  await profile.focus();
  await page.keyboard.press('Enter');
  await numeric(page, '103.85', '1.29', true);
  await expect(units(page).locator('.units-arrangement li')).toHaveCount(1);
  await expect(
    units(page).getByRole('combobox', { name: 'Command role', exact: true }),
  ).toHaveValue('observation');
  await units(page)
    .getByRole('button', { name: 'Duplicate unit', exact: true })
    .click();
  await expect(units(page).locator('.units-arrangement li')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(
    units(page).getByRole('button', { name: 'Duplicate unit', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await numeric(page, '103.85', '1.29');
  await expect(units(page).getByRole('alert')).toContainText(
    'different position',
  );
  await expect(units(page).getByRole('alert')).toBeFocused();
  await expect(units(page).getByRole('alert')).toBeInViewport();
  await units(page)
    .getByRole('textbox', { name: 'Placement longitude', exact: true })
    .fill('103.852');
  await units(page)
    .getByRole('button', { name: 'Place at coordinates' })
    .click();
  await expect(units(page).locator('.units-arrangement li')).toHaveCount(2);
  await save(page);
  const catalog = await (
    await page.request.get(`${rtsOrigin}/api/scenarios`)
  ).json();
  const original = catalog.scenarios.find(
    (s: { content: { name: string } }) =>
      s.content.name === 'D1b keyboard composition',
  );
  expect(original.content.units[0].id).not.toBe(original.content.units[1].id);
  expect(
    original.content.units.map((u: { commandRole: string }) => u.commandRole),
  ).toEqual(['observation', 'observation']);
  let copiedId = '';
  let copiedBody = '';
  await page.route('**/api/scenarios', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    copiedBody = route.request().postData()!;
    const response = await route.fetch();
    copiedId = (await response.json()).result.definitionId;
    await route.abort('failed');
  });
  await openScenarioFile(page);
  await units(page)
    .getByRole('button', { name: 'Save as new', exact: true })
    .click();
  await expect(
    units(page).getByRole('button', { name: 'Check save', exact: true }),
  ).toBeEnabled();
  await page.reload();
  await openAuthoringTab(page, 'Units');
  await units(page)
    .getByRole('button', { name: 'Check save', exact: true })
    .click();
  await expect(units(page).locator('.units-save-status')).toContainText(
    'saved',
  );
  await page.unroute('**/api/scenarios');
  const copy = await (
    await page.request.get(`${rtsOrigin}/api/scenarios/${copiedId}?revision=1`)
  ).json();
  expect(copy.definitionId).not.toBe(original.definitionId);
  expect(copy.content).toEqual(JSON.parse(copiedBody).content);
  expect(
    copy.content.units.every(
      (u: { id: string }) =>
        !original.content.units.some((o: { id: string }) => o.id === u.id),
    ),
  ).toBe(true);
  expect(
    await (
      await page.request.get(
        `${rtsOrigin}/api/scenarios/${original.definitionId}?revision=1`,
      )
    ).json(),
  ).toEqual(original);
  const run = units(page).getByRole('button', {
    name: 'Run saved revision 1',
    exact: true,
  });
  await expect(run).toBeDisabled();
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).locator('.units-review')).toContainText(
    '0 controlled · 2 observation only',
  );
  await expect(units(page).locator('.units-review')).toContainText(
    'per unit profile',
  );
  await expect(
    units(page).getByLabel('Scenario validation review'),
  ).toBeFocused();
  await page.screenshot({ path: resolve(evidence, 'validated-copy.png') });
  await run.click();
  await expect(page.locator('.simulation-run-state')).toHaveText('Running', {
    timeout: 20000,
  });
  const world = await readWorld(page);
  expect(world.scenario?.definitionId).toBe(copiedId);
  expect(world.interactive?.controls).toHaveLength(0);
  expect(
    Object.values(world.unitProfiles ?? {}).map((profile) => profile.id),
  ).toEqual(['hornet-10-v1', 'hornet-10-v1']);
  expect(
    Object.values(world.unitProfiles ?? {}).map((profile) => profile.cruiseMps),
  ).toEqual([80 / 3.6, 80 / 3.6]);
  await endDemo(page);
  expect(errors).toEqual([]);
});

test('two-map ownership, preview, Locate isolation, projection cancellation and responsive keyboard validation', async ({
  page,
}) => {
  test.setTimeout(150000);
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
    .poll(async () => (await probe(page, 'tactical:2', true))?.ready, {
      timeout: 20000,
    })
    .toBe(true);
  await openScenarioFile(page);
  await units(page)
    .getByRole('combobox', { name: 'Authoring map' })
    .selectOption('tactical:2');
  await units(page)
    .getByRole('button', { name: /^Unknown entity/ })
    .click();
  const other = map(page).locator('canvas').first();
  const otherBox = (await other.boundingBox())!;
  await other.click({
    position: { x: otherBox.width * 0.5, y: otherBox.height * 0.5 },
  });
  await expect(units(page).locator('.units-arrangement li')).toHaveCount(0);
  const owned = map(page, 'tactical:2').locator('canvas').first();
  const ownedBox = (await owned.boundingBox())!;
  await page.mouse.move(
    ownedBox.x + ownedBox.width * 0.55,
    ownedBox.y + ownedBox.height * 0.55,
  );
  await expect(
    map(page, 'tactical:2').locator('.scenario-placement-preview'),
  ).toContainText('PREVIEW');
  await page.screenshot({ path: resolve(evidence, 'owned-3d-preview.png') });
  await owned.click({
    position: { x: ownedBox.width * 0.55, y: ownedBox.height * 0.55 },
  });
  await expect(units(page).locator('.units-arrangement li')).toHaveCount(1);
  const firstBefore = (await probe(page, 'tactical'))!.camera;
  await units(page)
    .getByRole('button', { name: 'Locate', exact: true })
    .click();
  await expect
    .poll(
      async () => (await probe(page, 'tactical:2', true))?.camera.groundSpanM,
    )
    .toBeLessThanOrEqual(1201);
  expect((await probe(page, 'tactical'))!.camera.center).toEqual(
    firstBefore.center,
  );
  await armPlacement(units(page), 'Hostile');
  await map(page, 'tactical:2')
    .getByRole('button', { name: 'Tactical', exact: true })
    .click();
  await expect(
    units(page).getByRole('button', {
      name: 'Cancel placement · Esc',
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole('tab', { name: 'Tactical Map 2', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close view', exact: true }).click();
  await save(page);
  const results = [];
  for (const [width, height] of [
    [760, 800],
    [820, 800],
    [900, 800],
    [1440, 900],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await page.setViewportSize({ width, height });
    await openAuthoringTab(page, 'Units');
    await expect
      .poll(() => units(page).evaluate((e) => e.scrollWidth <= e.clientWidth))
      .toBe(true);
    const validate = units(page).getByRole('button', {
      name: 'Validate saved revision',
      exact: true,
    });
    await expect(validate).toBeInViewport();
    // Exercise real editor access at the bottom/right-pane breakpoint;
    // a pixel-height threshold does not prove fields can be used.
    if (width <= 900) {
      await units(page).locator('.units-arrangement li button').first().click();
      const heading = units(page).getByRole('textbox', {
        name: 'Unit heading',
        exact: true,
      });
      await heading.focus();
      await expect(heading).toBeInViewport();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.type('271.25');
      await expect(heading).toBeFocused();
      await expect(validate).toBeDisabled();
      const discard = units(page).getByRole('button', {
        name: 'Discard edits',
        exact: true,
      });
      await discard.focus();
      await expect(discard).toBeInViewport();
      await page.keyboard.press('Enter');
      await expect(heading).toHaveValue('0');
      await expect(validate).toBeEnabled();
    }
    await validate.focus();
    await page.keyboard.press('Enter');
    await expect(
      units(page).getByLabel('Scenario validation review'),
    ).toBeFocused();
    await expect(
      units(page).getByRole('button', {
        name: 'Run saved revision 1',
        exact: true,
      }),
    ).toBeEnabled();
    await page.screenshot({ path: resolve(evidence, `layout-${width}.png`) });
    const a11y = await new AxeBuilder({ page })
      .include('.orchestrator-pane')
      .analyze();
    expect(a11y.violations).toEqual([]);
    results.push({ width, height, violations: a11y.violations });
    await units(page)
      .getByRole('button', { name: 'Back to Units', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      units(page).getByRole('tab', { name: 'Units', exact: true }),
    ).toBeFocused();
  }
  await writeFile(
    resolve(evidence, 'responsive-accessibility.json'),
    JSON.stringify(results, null, 2),
  );
});

test('Locate is one-time and both map cameras survive pan then close and reopen', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await units(page)
    .getByRole('button', { name: /^Unknown entity/ })
    .click();
  await numeric(page, '103.853', '1.292');
  for (const threeD of [false, true]) {
    if (threeD)
      await map(page).getByRole('button', { name: '3D', exact: true }).click();
    await expect
      .poll(async () => (await probe(page, 'tactical', threeD))?.ready)
      .toBe(true);
    await units(page)
      .getByRole('button', { name: 'Locate', exact: true })
      .click();
    await expect
      .poll(
        async () => (await probe(page, 'tactical', threeD))?.camera.groundSpanM,
      )
      .toBeLessThanOrEqual(1201);
    const located = (await probe(page, 'tactical', threeD))!.camera;
    await map(page).getByRole('button', { name: 'Pan', exact: true }).click();
    const box = (await map(page).locator('canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.66, box.y + box.height * 0.63, {
      steps: 10,
    });
    await page.mouse.up();
    // Preserve the settled bookmark, after the SDK's normal pan inertia ends.
    let previousCamera = '';
    await expect
      .poll(
        async () => {
          const current = JSON.stringify(
            (await probe(page, 'tactical', threeD))?.camera,
          );
          const settled = current === previousCamera;
          previousCamera = current;
          return settled;
        },
        { intervals: [100] },
      )
      .toBe(true);
    const panned = (await probe(page, 'tactical', threeD))!.camera;
    expect(panned.center).not.toEqual(located.center);
    await page
      .getByRole('tab', {
        name: threeD ? '3D Map' : 'Tactical Map',
        exact: true,
      })
      .click({ button: 'right' });
    await page
      .getByRole('menuitem', { name: 'Close view', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: threeD
          ? 'Open 3D Map from Views'
          : 'Open Tactical Map from Views',
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await probe(page, 'tactical', threeD))?.ready)
      .toBe(true);
    const reopened = (await probe(page, 'tactical', threeD))!.camera;
    expect(reopened.center.longitudeDeg).toBeCloseTo(
      panned.center.longitudeDeg,
      8,
    );
    expect(reopened.center.latitudeDeg).toBeCloseTo(
      panned.center.latitudeDeg,
      8,
    );
    expect(reopened.groundSpanM).toBeCloseTo(panned.groundSpanM, 3);
    await page.screenshot({
      path: resolve(
        evidence,
        `locate-reopen-${threeD ? '3d' : 'tactical'}.png`,
      ),
    });
  }
});

test('narrow invalid edits and numeric placement keep one focused visible error and allow correction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 800 });
  await open(page);
  await armPlacement(units(page), 'Friendly');
  await numeric(page, '103.85', '1.29', true);
  const height = units(page).getByRole('textbox', {
    name: 'Unit altitude',
    exact: true,
  });
  await height.focus();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('6001');
  const apply = units(page).getByRole('button', {
    name: 'Apply changes',
    exact: true,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(units(page).getByRole('alert')).toBeFocused();
    await expect(units(page).getByRole('alert')).toBeInViewport();
    await expect(units(page).getByRole('alert')).toContainText('0–5000');
  }
  await height.fill('250.125');
  await apply.focus();
  await page.keyboard.press('Enter');
  await expect(units(page).getByRole('alert')).toHaveCount(0);
  await expect(height).toHaveValue('250.125');
  await page.setViewportSize({ width: 760, height: 800 });
  await armPlacement(units(page), 'Hostile');
  await units(page).locator('.units-numeric summary').focus();
  await page.keyboard.press('Enter');
  const longitude = units(page).getByRole('textbox', {
    name: 'Placement longitude',
    exact: true,
  });
  await longitude.fill('NaN');
  await units(page)
    .getByRole('textbox', { name: 'Placement latitude', exact: true })
    .fill('1.29');
  const place = units(page).getByRole('button', {
    name: 'Place at coordinates',
    exact: true,
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    await place.focus();
    await page.keyboard.press('Enter');
    await expect(units(page).getByRole('alert')).toHaveCount(1);
    await expect(units(page).getByRole('alert')).toBeFocused();
    await expect(units(page).getByRole('alert')).toBeInViewport();
    await expect(units(page).getByRole('alert')).toContainText('finite');
  }
  await longitude.fill('104');
  await place.focus();
  await page.keyboard.press('Enter');
  await expect(units(page).getByRole('alert')).toHaveCount(1);
  await expect(units(page).getByRole('alert')).toBeFocused();
  await expect(units(page).getByRole('alert')).toBeInViewport();
  await expect(units(page).getByRole('alert')).toContainText('5 km');
  await page.screenshot({
    path: resolve(evidence, 'narrow-placement-validation.png'),
  });
  const a11y = await new AxeBuilder({ page })
    .include('.orchestrator-pane')
    .analyze();
  expect(a11y.violations).toEqual([]);
  await longitude.fill('103.854');
  await place.focus();
  await page.keyboard.press('Enter');
  await expect(units(page).getByRole('alert')).toHaveCount(0);
  await expect(units(page).locator('.units-arrangement li')).toHaveCount(2);
});

test('empty revision and failed validation are actionable and cannot create a run', async ({
  page,
}) => {
  await open(page);
  await save(page);
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).getByRole('alert')).toContainText(
    'Place at least one',
  );
  await expect(
    units(page).getByRole('button', {
      name: 'Run saved revision 1',
      exact: true,
    }),
  ).toBeDisabled();
  await page.route('**/api/scenarios/validate', (route) =>
    route.abort('failed'),
  );
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).getByRole('alert')).toBeVisible();
  await expect(units(page).getByRole('alert')).toBeFocused();
  await expect(units(page).getByRole('alert')).toBeInViewport();
  await expect(units(page).locator('.units-review')).toHaveCount(0);
  await expect(
    units(page).getByRole('button', {
      name: 'Run saved revision 1',
      exact: true,
    }),
  ).toBeDisabled();
});
