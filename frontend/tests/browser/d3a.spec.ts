import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rtsOrigin, readWorld, endDemo } from './rtsActions';
import type { ScenarioRevision } from '../../src/contracts/generated';
const evidence = resolve(
  '../docs/d4-refinement/regressions/d4/regressions/d3a-workflow',
);
const units = (p: Page) => p.locator('[data-view="units"]');
const conductor = (p: Page) => p.locator('[data-view="conductor"]');
const map = (p: Page) => p.locator('.tactical-view[data-view-id="tactical"]');
test.use({ actionTimeout: 12000 });
test.beforeAll(() => mkdir(evidence, { recursive: true }).then(() => {}));
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    await page.screenshot({ path: resolve(evidence, 'workflow-failure.png') });
    console.log(
      'Visible error:',
      await page.getByRole('alert').allTextContents(),
    );
  }
});
async function addUnit(
  page: Page,
  category: string,
  lon: string,
  lat: string,
  observer = false,
) {
  const card = units(page).getByRole('button', {
    name: new RegExp(`^${category}`),
  });
  if ((await card.getAttribute('aria-expanded')) !== 'true') await card.click();
  if (category !== 'Unknown entity')
    await units(page)
      .getByLabel(
        `${category.startsWith('Friendly') ? 'friendly' : 'hostile'} unit types`,
      )
      .getByRole('button', {
        name: category.startsWith('Friendly')
          ? /^STING interceptor/
          : /^Quadcopter \/ strike/,
      })
      .click();
  await units(page).locator('.units-numeric summary').click();
  await units(page)
    .getByLabel('Placement longitude', { exact: true })
    .fill(lon);
  await units(page).getByLabel('Placement latitude', { exact: true }).fill(lat);
  await units(page)
    .getByLabel('Placement altitude', { exact: true })
    .fill('217.125');
  if (observer)
    await units(page)
      .getByLabel('Placement command role', { exact: true })
      .selectOption('observation');
  await units(page)
    .getByRole('button', { name: 'Place at coordinates', exact: true })
    .click();
}
async function open(page: Page, name: string) {
  await page.goto(rtsOrigin);
  const entry = await (
    await page.request.get(`${rtsOrigin}/api/interactive/entry`)
  ).json();
  expect(entry.enabled).toBe(true);
  expect(entry.activeMissionId).toBeFalsy();
  await page
    .getByRole('button', { name: 'Open Units', exact: true })
    .first()
    .click();
  await units(page)
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  await units(page).getByLabel('Arrangement name', { exact: true }).fill(name);
}
async function inspect(page: Page, threeD = false) {
  return page.evaluate(
    ({ threeD }) => {
      const probe = (
        window as unknown as Record<
          string,
          {
            inspect(id: string): {
              ready: boolean;
              destinations: unknown[];
              destinationImagesReady?: boolean;
              camera: unknown;
            };
          }
        >
      )[threeD ? '__sentinelCesiumTest' : '__sentinelMapTest'];
      return probe?.inspect('tactical');
    },
    { threeD },
  );
}
async function numericBoundary(page: Page, name: string, vertices: number[][]) {
  await map(page)
    .getByRole('button', { name: 'Draw zone/boundary', exact: true })
    .click();
  const panel = map(page).getByLabel('Live boundary tools', { exact: true });
  await panel.getByLabel('Boundary name', { exact: true }).fill(name);
  for (let i = 0; i < vertices.length; i++) {
    await panel
      .getByRole('button', { name: 'Add numeric vertex', exact: true })
      .click();
    await panel
      .getByLabel(`Vertex ${i + 1} longitude`, { exact: true })
      .fill(String(vertices[i][0]));
    await panel
      .getByLabel(`Vertex ${i + 1} latitude`, { exact: true })
      .fill(String(vertices[i][1]));
  }
  await panel
    .getByRole('button', { name: 'Finish boundary', exact: true })
    .click();
  await expect(panel).toContainText('PROVISIONAL');
  return panel;
}

test('mixed timing preserves authoring leg identifiers and removes live previews on both maps', async ({
  page,
}) => {
  test.setTimeout(90000);
  const name = `D3a stable legs ${Date.now()}`;
  await open(page, name);
  await addUnit(page, 'Hostile drone', '103.85', '1.29');
  await page
    .getByRole('button', { name: 'Open Conductor', exact: true })
    .first()
    .click();
  const c = conductor(page);
  for (const [seconds, longitude] of [
    ['0', '103.85015'],
    ['60', '103.854'],
  ] as const) {
    await c.getByRole('button', { name: 'Add action', exact: true }).click();
    await c
      .getByLabel('Action time after Start', { exact: true })
      .fill(seconds);
    await c
      .getByLabel('Script destination longitude', { exact: true })
      .fill(longitude);
    await c
      .getByLabel('Script destination latitude', { exact: true })
      .fill('1.29');
    await c.getByRole('button', { name: 'Apply action', exact: true }).click();
  }
  await c.getByRole('button', { name: 'Add action', exact: true }).click();
  await c
    .getByLabel('Movement timing mode', { exact: true })
    .selectOption('after');
  await c
    .getByLabel('Previous movement', { exact: true })
    .selectOption({ index: 1 });
  await c.getByLabel('Completion delay', { exact: true }).fill('2.2');
  await c
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.8503');
  await c
    .getByLabel('Script destination latitude', { exact: true })
    .fill('1.29');
  await c.getByRole('button', { name: 'Apply action', exact: true }).click();
  await expect(c.locator('.conductor-selection')).toContainText('Leg 3');
  await c.getByLabel('Script label density').selectOption('all');
  await c.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(c).toContainText('Revision 1 saved');
  const saved = (
    await (await page.request.get(`${rtsOrigin}/api/scenarios`)).json()
  ).scenarios.find(
    (s: ScenarioRevision) => s.content.name === name,
  ) as ScenarioRevision;
  const dependent = saved.content.actions!.find((a) => a.afterActionId)!;
  const checkLabel = async (live: boolean, threeD: boolean) => {
    if (live) {
      await expect
        .poll(async () => (await inspect(page, threeD))?.destinations?.length)
        .toBe(0);
      await expect(c.getByLabel('Script label density')).toHaveCount(0);
      return;
    }
    await expect
      .poll(async () => {
        const destinations = (await inspect(page, threeD))?.destinations as
          { id: string; label: string }[] | undefined;
        return destinations?.find(
          (d) => d.id === `${live ? 'script:' : ''}${dependent.id}`,
        )?.label;
      })
      .toContain('leg 3');
  };
  await checkLabel(false, false);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  await c
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await c
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 15000 },
  );
  try {
    await expect
      .poll(
        async () =>
          (await readWorld(page)).scenarioSchedule?.actions.find(
            (e) => e.action.id === dependent.id,
          )?.state,
      )
      .toBe('Completed');
    await page
      .getByRole('button', { name: 'Pause', exact: true })
      .first()
      .click();
    await c
      .getByRole('button', {
        name: 'Select action Hostile 1 After previous + 2.2s',
        exact: true,
      })
      .click();
    await expect(c.locator('.conductor-selection')).toContainText('Leg 3');
    await checkLabel(true, false);
    await map(page).getByRole('button', { name: '3D', exact: true }).click();
    await checkLabel(true, true);
    await page.screenshot({
      path: resolve(evidence, 'stable-leg-identifiers.png'),
    });
  } finally {
    await endDemo(page);
  }
});

test('Missions loads a saved group script, actual completion dependencies execute, live edits are authoritative and reruns stay fresh', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  const name = `D3a operator ${Date.now()}`;
  await open(page, name);
  for (let i = 0; i < 4; i++)
    await addUnit(
      page,
      'Hostile drone',
      String(103.85 + i * 0.0002),
      String(1.29 + i * 0.0001),
    );
  await addUnit(page, 'Friendly drone', '103.849', '1.289', true);
  await addUnit(page, 'Unknown entity', '103.848', '1.288');
  await page
    .getByRole('button', { name: 'Open Conductor', exact: true })
    .first()
    .click();
  await conductor(page).locator('.conductor-actor-picker summary').click();
  await conductor(page)
    .getByRole('button', { name: 'Clear actor selection', exact: true })
    .click();
  for (let i = 1; i <= 4; i++)
    await conductor(page)
      .getByLabel(`Script select Hostile ${i}`, { exact: true })
      .check();
  await conductor(page)
    .getByRole('button', {
      name: 'Add movement for 4 selected actors',
      exact: true,
    })
    .click();
  await conductor(page)
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.854');
  await conductor(page)
    .getByLabel('Script destination latitude', { exact: true })
    .fill('1.29015');
  await expect(
    conductor(page).locator('.conductor-batch-preview'),
  ).toContainText('Hostile 4');
  await conductor(page)
    .getByRole('button', { name: 'Apply complete batch', exact: true })
    .click();
  await expect(conductor(page).locator('tbody tr')).toHaveCount(4);
  await expect
    .poll(async () => (await inspect(page))?.destinations.length)
    .toBe(4);
  await conductor(page)
    .getByRole('button', {
      name: 'Add movement for 4 selected actors',
      exact: true,
    })
    .click();
  await conductor(page)
    .getByLabel('Movement timing mode', { exact: true })
    .selectOption('after');
  await conductor(page)
    .getByLabel('Completion delay', { exact: true })
    .fill('0.33');
  await conductor(page)
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.857');
  await expect(
    conductor(page).getByLabel('Completion delay', { exact: true }),
  ).toHaveValue('0.4');
  await conductor(page)
    .getByLabel('Script destination latitude', { exact: true })
    .fill('1.29015');
  await conductor(page)
    .getByRole('button', { name: 'Apply complete batch', exact: true })
    .click();
  await expect(conductor(page).locator('tbody tr')).toHaveCount(8);
  await conductor(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(conductor(page).locator('.conductor-context')).toContainText(
    'Saved revision 1',
  );
  const saved = (
    await (await page.request.get(`${rtsOrigin}/api/scenarios`)).json()
  ).scenarios.find(
    (s: ScenarioRevision) => s.content.name === name,
  ) as ScenarioRevision;
  expect(saved.schemaVersion).toBe('1.4');
  expect(saved.content.actions).toHaveLength(8);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page.getByRole('menuitem', { name: new RegExp(name) }).click();
  await expect(page.locator('.mission-picker')).toContainText('Saved r1');
  await conductor(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(
    conductor(page).getByLabel('Scenario validation review', { exact: true }),
  ).toContainText('Ready to run');
  await page.screenshot({
    path: resolve(evidence, 'saved-missions-review.png'),
  });
  await map(page).getByRole('button', { name: '3D', exact: true }).click();
  await expect
    .poll(async () => (await inspect(page, true))?.ready, { timeout: 20000 })
    .toBe(true);
  await expect
    .poll(async () => (await inspect(page, true))?.destinations.length)
    .toBe(8);
  await page.screenshot({ path: resolve(evidence, 'all-plans-3d.png') });
  await map(page)
    .getByRole('button', { name: 'Tactical', exact: true })
    .click();
  let lost = true,
    creations = 0;
  await page.route('**/api/interactive/runs', async (route) => {
    creations++;
    const response = await route.fetch();
    if (lost) {
      lost = false;
      await route.abort();
    } else await route.fulfill({ response });
  });
  await conductor(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(
    conductor(page).getByRole('button', {
      name: 'Retry saved Run request',
      exact: true,
    }),
  ).toBeVisible();
  await conductor(page)
    .getByRole('button', { name: 'Retry saved Run request', exact: true })
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 15000 },
  );
  await expect
    .poll(
      async () =>
        (await readWorld(page)).scenarioSchedule?.actions.filter(
          (e) => e.state === 'Completed',
        ).length,
      { timeout: 40000 },
    )
    .toBe(8);
  const first = await readWorld(page);
  expect(creations).toBe(2);
  expect(first.scenario?.revision).toBe(1);
  expect(first.scenarioSchedule!.actions[4].motion!.acceptedTick).toBe(
    first.scenarioSchedule!.actions[0].terminalTick! + 2,
  );
  expect(first.interactive!.controls).toHaveLength(0);
  await page.unroute('**/api/interactive/runs');
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  await expect(
    conductor(page).getByLabel('Saved scenario launch'),
  ).toContainText('Active demo:');
  await expect(page.locator('.mission-picker')).not.toContainText('No mission');
  await conductor(page)
    .getByRole('button', { name: 'Return to active demo', exact: true })
    .click();
  await endDemo(page);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  await conductor(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await conductor(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 15000 },
  );
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .click();
  const before = await readWorld(page);
  expect(before.recordingId).not.toBe(first.recordingId);
  expect(before.interactive!.runId).not.toBe(first.interactive!.runId);
  const panel = await numericBoundary(page, 'Live crossing', [
    [103.852, 1.285],
    [103.8524, 1.285],
    [103.8524, 1.295],
    [103.852, 1.295],
  ]);
  await panel
    .getByRole('combobox', { name: 'Type of Live crossing', exact: true })
    .selectOption('restricted');
  await expect(panel).toContainText('Accepted · effective boundary revision 1');
  const after = await readWorld(page);
  expect(after.liveBoundaries?.revision).toBe(1);
  expect(after.interactive!.tick).toBe(before.interactive!.tick);
  expect(
    after.scenarioSchedule?.actions.some((e) => e.state === 'Failed'),
  ).toBe(true);
  expect(
    (
      await (
        await page.request.get(
          `${rtsOrigin}/api/scenarios/${saved.definitionId}`,
        )
      ).json()
    ).contentHash,
  ).toBe(saved.contentHash);
  await panel
    .getByRole('button', { name: 'Edit Live crossing', exact: true })
    .click();
  await panel
    .getByLabel('Boundary name', { exact: true })
    .fill('Renamed live rule');
  await panel
    .getByRole('button', { name: 'Apply boundary', exact: true })
    .click();
  await expect(panel).toContainText('Accepted · effective boundary revision 2');
  await panel
    .getByRole('button', { name: 'Delete Renamed live rule', exact: true })
    .click();
  await expect(panel).toContainText('Accepted · effective boundary revision 3');
  await map(page)
    .getByRole('button', { name: 'Close live boundary tools', exact: true })
    .click();
  for (const [width, height] of [
    [760, 820],
    [820, 900],
    [900, 900],
    [1440, 900],
    [2560, 1440],
    [3840, 2160],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(
      map(page).getByRole('button', {
        name: 'Draw zone/boundary',
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({ path: resolve(evidence, `live-${width}.png`) });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .include('[data-view="conductor"]')
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(errors).toEqual([]);
  await endDemo(page);
});

test('batch edits preserve destination offsets, individual changes remain independent, invalid batches keep the plan', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const name = `D3a batch edit ${Date.now()}`;
  await open(page, name);
  for (let i = 0; i < 4; i++)
    await addUnit(
      page,
      'Hostile drone',
      String(103.85 + i * 0.0002),
      String(1.29 + i * 0.0001),
    );
  await page
    .getByRole('button', { name: 'Open Conductor', exact: true })
    .first()
    .click();
  const c = conductor(page);
  await c.locator('.conductor-actor-picker summary').click();
  await c
    .getByRole('button', { name: 'Clear actor selection', exact: true })
    .click();
  for (let i = 1; i <= 4; i++)
    await c.getByLabel(`Script select Hostile ${i}`, { exact: true }).check();
  await c
    .getByRole('button', {
      name: 'Add movement for 4 selected actors',
      exact: true,
    })
    .click();
  await c
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.854');
  await c
    .getByRole('button', { name: 'Apply complete batch', exact: true })
    .click();
  for (let i = 3; i <= 4; i++)
    await c
      .getByLabel(`Select for batch Hostile ${i} 0.0s after Start`, {
        exact: true,
      })
      .uncheck();
  await c
    .getByRole('button', { name: 'Edit 2 selected movements', exact: true })
    .click();
  await expect(c.getByLabel('Movement timing mode')).toHaveValue('keep');
  await c
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.855');
  await c
    .getByRole('button', { name: 'Apply complete batch', exact: true })
    .click();
  await c
    .getByRole('button', {
      name: 'Select action Hostile 1 0.0s after Start',
      exact: true,
    })
    .click();
  await c.getByRole('button', { name: 'Edit action', exact: true }).click();
  await c
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.856');
  await c.getByRole('button', { name: 'Apply action', exact: true }).focus();
  await page.keyboard.press('Enter');
  await c
    .getByRole('button', {
      name: 'Add movement for 4 selected actors',
      exact: true,
    })
    .click();
  await c
    .getByRole('button', { name: 'Apply complete batch', exact: true })
    .click();
  await expect(c.getByRole('alert')).toContainText('Only one movement start');
  await expect(c.locator('tbody tr')).toHaveCount(4);
  await c
    .getByRole('button', { name: 'Cancel action edit', exact: true })
    .click();
  await c.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(c.locator('.conductor-context')).toContainText(
    'Saved revision 1',
  );
  const saved = (
    await (await page.request.get(`${rtsOrigin}/api/scenarios`)).json()
  ).scenarios.find(
    (s: ScenarioRevision) => s.content.name === name,
  ) as ScenarioRevision;
  const actions = saved.content.actions!;
  expect(actions).toHaveLength(4);
  const byLabel = (label: string) =>
    actions.find(
      (a) =>
        a.unitId === saved.content.units.find((u) => u.label === label)!.id,
    )!;
  expect(byLabel('Hostile 1').destination.longitudeDeg).toBe(103.856);
  expect(byLabel('Hostile 2').destination.longitudeDeg).toBeCloseTo(
    103.8551,
    8,
  );
  expect(byLabel('Hostile 3').destination.longitudeDeg).toBeCloseTo(
    103.8541,
    8,
  );
  await c
    .getByRole('button', { name: 'Clear actor selection', exact: true })
    .click();
  await c.getByLabel('Script plan filter').selectOption('selected');
  await expect
    .poll(async () => (await inspect(page))?.destinations.length)
    .toBe(1);
  await c.getByLabel('Script plan filter').selectOption('all');
  await expect
    .poll(async () => (await inspect(page))?.destinations.length)
    .toBe(4);
  // Wait through a real idle/image-retention pass; projected data alone is insufficient.
  await expect.poll(async () => (await inspect(page))?.ready).toBe(true);
  expect((await inspect(page)).destinationImagesReady).toBe(true);
  await page.screenshot({
    path: resolve(evidence, 'batch-and-individual-edit.png'),
  });
  const missionsBefore = (
    await (await page.request.get(`${rtsOrigin}/api/missions`)).json()
  ).missions.length;
  await page
    .getByRole('button', { name: 'Open Units', exact: true })
    .first()
    .click();
  await units(page)
    .getByLabel('Arrangement name', { exact: true })
    .fill('Unsaved retained arrangement');
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  const confirm = page.getByRole('alertdialog', {
    name: 'Replace unsaved arrangement?',
  });
  await expect(confirm).toBeVisible();
  await expect(
    confirm.getByRole('button', { name: 'Keep editing', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(
    confirm.getByRole('button', { name: 'Keep editing', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    units(page).getByLabel('Arrangement name', { exact: true }),
  ).toHaveValue('Unsaved retained arrangement');
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  await confirm
    .getByRole('button', { name: 'Discard changes and load', exact: true })
    .click();
  await expect(c.locator('.conductor-context')).toContainText(
    'Saved revision 1',
  );
  expect(
    (await (await page.request.get(`${rtsOrigin}/api/missions`)).json())
      .missions.length,
  ).toBe(missionsBefore);
  const actorPicker = c.locator('.conductor-actor-picker');
  if (
    !(await actorPicker.evaluate(
      (element) => (element as HTMLDetailsElement).open,
    ))
  )
    await actorPicker.locator('summary').click();
  await expect(
    c.getByRole('button', { name: 'Clear actor selection', exact: true }),
  ).toBeDisabled();
  await c.getByLabel('Script select Hostile 1', { exact: true }).check();
  await c
    .getByRole('button', {
      name: 'Add movement for 1 selected actor',
      exact: true,
    })
    .click();
  await c.getByLabel('Movement timing mode').selectOption('after');
  await c.getByLabel('Completion delay').fill('0.4');
  await c
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.857');
  await expect(c.locator('.conductor-batch-preview')).toContainText(
    'after leg 1',
  );
  await c
    .getByRole('button', { name: 'Apply complete batch', exact: true })
    .click();
  await expect(c.locator('tbody tr')).toHaveCount(5);
  await c.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(c.locator('.conductor-context')).toContainText(
    'Saved revision 2',
  );
  const revised = (await (
    await page.request.get(`${rtsOrigin}/api/scenarios/${saved.definitionId}`)
  ).json()) as ScenarioRevision;
  expect(revised.content.actions?.find((a) => a.afterActionId)).toMatchObject({
    afterActionId: byLabel('Hostile 1').id,
    delayMs: 400,
  });
});

test('normal Tactical and 3D live drawing, paused lost-response retry and occupied restriction rejection', async ({
  page,
}) => {
  test.setTimeout(150000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page, `D3a live tools ${Date.now()}`);
  await addUnit(page, 'Friendly drone', '103.85', '1.29');
  await units(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(units(page).locator('.units-save-status')).toContainText(
    'saved',
  );
  await units(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(units(page).locator('.units-review')).toContainText(
    'Ready to run',
  );
  await units(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'paused',
  );
  const initial = await readWorld(page);
  let panel = await numericBoundary(page, 'Occupied footprint', [
    [103.849, 1.289],
    [103.851, 1.289],
    [103.851, 1.291],
    [103.849, 1.291],
  ]);
  await panel
    .getByLabel('Type of Occupied footprint')
    .selectOption('restricted');
  await expect(panel.getByRole('alert')).toContainText('inside/on');
  expect((await readWorld(page)).liveBoundaries).toBeUndefined();
  await panel
    .getByRole('button', { name: 'Delete Occupied footprint', exact: true })
    .click();
  await map(page)
    .getByRole('button', { name: 'Close live boundary tools', exact: true })
    .click();
  // Real pause exceeds the ordinary positional command expiry. Boundary intents remain fresh.
  await page.waitForTimeout(31000);
  let lost = false,
    boundaryPosts = 0;
  await page.route('**/api/interactive/**/commands', async (route) => {
    const body = route.request().postDataJSON();
    if (body.intent?.action !== 'boundary-edit') {
      await route.continue();
      return;
    }
    boundaryPosts++;
    const response = await route.fetch();
    if (!lost) {
      lost = true;
      await route.abort();
    } else await route.fulfill({ response });
  });
  for (const mode of ['Tactical', '3D']) {
    await map(page).getByRole('button', { name: mode, exact: true }).click();
    await expect
      .poll(async () => (await inspect(page, mode === '3D'))?.ready, {
        timeout: 20000,
      })
      .toBe(true);
    await map(page)
      .getByRole('button', { name: 'Draw zone/boundary', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    panel = map(page).getByLabel('Live boundary tools', { exact: true });
    await expect(
      panel.getByLabel('Boundary name', { exact: true }),
    ).toBeFocused();
    await panel
      .getByLabel('Boundary name', { exact: true })
      .fill(`${mode} footprint`);
    const canvas = map(page).locator('canvas').first(),
      box = (await canvas.boundingBox())!;
    const camera = (await inspect(page, mode === '3D')).camera;
    await canvas.click({
      position: { x: box.width * 0.15, y: box.height * 0.38 },
    });
    await canvas.click({
      position: { x: box.width * 0.4, y: box.height * 0.38 },
    });
    await canvas.dblclick({
      position: { x: box.width * 0.28, y: box.height * 0.63 },
    });
    await expect(
      panel.getByRole('button', { name: 'Finish boundary', exact: true }),
    ).toHaveCount(0);
    expect((await inspect(page, mode === '3D')).camera).toEqual(camera);
    await panel
      .getByLabel(`Type of ${mode} footprint`, { exact: true })
      .selectOption('friendly');
    if (mode === 'Tactical') {
      await expect(
        panel.getByRole('button', {
          name: 'Retry saved boundary request',
          exact: true,
        }),
      ).toBeVisible();
      await panel
        .getByRole('button', {
          name: 'Retry saved boundary request',
          exact: true,
        })
        .click();
    }
    const revision = mode === 'Tactical' ? 1 : 2;
    await expect(panel).toContainText(
      `Accepted · effective boundary revision ${revision}`,
    );
    const world = await readWorld(page);
    expect(world.interactive!.tick).toBe(initial.interactive!.tick);
    const zone = Object.values(world.zones).find(
      (z) => z.label === `${mode} footprint`,
    )!;
    expect(zone.geometry.coordinates[0]).toHaveLength(4);
    await panel
      .getByRole('button', { name: `Edit ${mode} footprint`, exact: true })
      .click();
    await expect(panel.locator('.boundary-vertices li')).toHaveCount(3);
    await panel
      .getByRole('button', { name: 'Cancel boundary', exact: true })
      .click();
    expect(
      await map(page)
        .locator('.map-tools')
        .evaluate(
          (el) =>
            el.getBoundingClientRect().top >=
            el.closest('.flexlayout__tab')!.getBoundingClientRect().top,
        ),
    ).toBe(true);
    await page.screenshot({ path: resolve(evidence, `live-draw-${mode}.png`) });
    await map(page)
      .getByRole('button', { name: 'Close live boundary tools', exact: true })
      .click();
    await expect(canvas).toBeFocused();
  }
  expect(boundaryPosts).toBe(3);
  await page.unroute('**/api/interactive/**/commands');
  await endDemo(page);
});
