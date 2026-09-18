import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { newDemo, readWorld, endDemo } from './rtsActions';
import { closeTab, tabAction } from './actions';
import type { CameraIntent } from '../../src/renderers/contracts';

test.use({ trace: 'off' });
const evidence = resolve(
  '../docs/d4-refinement/regressions/d4/regressions/rts-gestures',
);
type Mode = 'tactical' | 'three-d';
type Probe = {
  ready: boolean;
  selectedIds: string[];
  camera: CameraIntent;
  points: {
    id: string;
    x: number;
    y: number;
    managed?: boolean;
    unavailable?: string;
  }[];
  lastSurfacePick?: {
    kind: string;
    longitudeDeg: number;
    latitudeDeg: number;
    heightM: number;
  };
};
const pane = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
const canvas = (page: Page, id = 'tactical') =>
  pane(page, id).locator('canvas').first();
async function inspect(page: Page, mode: Mode, id = 'tactical') {
  return page.evaluate(
    ({ mode, id }) => {
      const w = window as unknown as {
        __sentinelMapTest: { inspect(id: string): Probe };
        __sentinelCesiumTest: { inspect(id: string): Probe };
      };
      return (
        mode === 'tactical' ? w.__sentinelMapTest : w.__sentinelCesiumTest
      )?.inspect(id);
    },
    { mode, id },
  );
}
async function camera(
  page: Page,
  mode: Mode,
  value: CameraIntent,
  id = 'tactical',
) {
  await page.evaluate(
    ({ mode, value, id }) => {
      const w = window as unknown as {
        __sentinelMapTest: { setCamera(id: string, value: CameraIntent): void };
        __sentinelCesiumTest: {
          setCamera(id: string, value: CameraIntent): void;
        };
      };
      (mode === 'tactical'
        ? w.__sentinelMapTest
        : w.__sentinelCesiumTest
      ).setCamera(id, value);
    },
    { mode, value, id },
  );
}
async function clickEntity(
  page: Page,
  mode: Mode,
  suffix: string,
  additive = false,
) {
  const point = (await inspect(page, mode)).points.find((p) =>
    p.id.endsWith(suffix),
  )!;
  await canvas(page).click({
    position: { x: point.x, y: point.y },
    modifiers: additive ? ['Shift'] : [],
  });
  await expect
    .poll(async () =>
      (await inspect(page, mode)).selectedIds.some((id) => id.endsWith(suffix)),
    )
    .toBe(true);
}
async function drag(
  page: Page,
  start: { x: number; y: number },
  end: { x: number; y: number },
  button: 'left' | 'right' = 'left',
) {
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down({ button });
  await page.mouse.move(box.x + end.x, box.y + end.y, { steps: 12 });
  await page.mouse.up({ button });
}
async function overview(page: Page) {
  await pane(page)
    .getByRole('button', { name: 'Map layers', exact: true })
    .click();
  await page.getByRole('menuitem', { name: 'Overview', exact: true }).click();
}

test('both projections share click/rectangle gestures, direct picking and independent close cameras', async ({
  page,
}) => {
  test.setTimeout(120000);
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await newDemo(page);
  const initial = await inspect(page, 'tactical');
  expect(initial.camera.groundSpanM).toBeGreaterThanOrEqual(600);
  expect(initial.camera.groundSpanM).toBeLessThan(2000);
  const results: Record<string, unknown> = {};
  for (const mode of ['tactical', 'three-d'] as const) {
    await pane(page)
      .getByRole('button', {
        name: mode === 'tactical' ? 'Tactical' : '3D',
        exact: true,
      })
      .click();
    await expect
      .poll(async () => (await inspect(page, mode))?.ready, { timeout: 20000 })
      .toBe(true);
    await overview(page);
    await pane(page).getByRole('button', { name: 'Pan', exact: true }).click();
    await clickEntity(page, mode, ':F-01');
    // Selecting may reserve Details space, but does not change the world camera focus.
    const selectedCamera = (await inspect(page, mode)).camera;
    const selected = (await inspect(page, mode)).selectedIds;
    const point = (await inspect(page, mode)).points.find((p) =>
      p.id.endsWith(':F-02'),
    )!;
    await drag(page, point, { x: point.x - 80, y: point.y + 30 });
    expect((await inspect(page, mode)).selectedIds).toEqual(selected);
    expect((await inspect(page, mode)).camera.center).not.toEqual(
      selectedCamera.center,
    );
    await overview(page);
    await pane(page)
      .getByRole('button', { name: 'Select', exact: true })
      .click();
    const rect = (await canvas(page).boundingBox())!;
    await drag(
      page,
      { x: 10, y: 10 },
      { x: rect.width - 10, y: rect.height - 35 },
    );
    const group = (await inspect(page, mode)).selectedIds.map((id) =>
      id.split(':').at(-1),
    );
    expect(group).toEqual(expect.arrayContaining(['F-01', 'F-02', 'F-04']));
    expect(group).not.toContain('O-01');
    expect(group).not.toContain('F-05');
    expect(group).not.toContain('F-03');
    await page.screenshot({
      path: resolve(evidence, `${mode}-rectangle-group.png`),
    });
    const beforeOrbit = [
      ...new Set(
        (await readWorld(page)).interactive!.executions!.map(
          (execution) => execution.commandId,
        ),
      ),
    ];
    await drag(
      page,
      { x: rect.width * 0.5, y: rect.height * 0.5 },
      { x: rect.width * 0.65, y: rect.height * 0.6 },
      'right',
    );
    expect([
      ...new Set(
        (await readWorld(page)).interactive!.executions!.map(
          (execution) => execution.commandId,
        ),
      ),
    ]).toEqual(beforeOrbit);
    expect(
      (await inspect(page, mode)).selectedIds.map((id) => id.split(':').at(-1)),
    ).toEqual(group);
    await pane(page)
      .getByRole('button', { name: 'Recenter', exact: true })
      .click();
    // Keyboard direct Move is the same surface path and does not open Activity.
    await pane(page)
      .getByRole('button', { name: 'Move selected members', exact: true })
      .click();
    // Temporary camera ownership survives releasing Space before the mouse.
    // A sub-threshold gesture must not send the armed live move.
    const moveBox = (await canvas(page).boundingBox())!;
    await canvas(page).focus();
    await page.keyboard.down('Space');
    await page.mouse.move(
      moveBox.x + moveBox.width * 0.5,
      moveBox.y + moveBox.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      moveBox.x + moveBox.width * 0.5 + 3,
      moveBox.y + moveBox.height * 0.5,
    );
    await page.keyboard.up('Space');
    await page.mouse.up();
    expect([
      ...new Set(
        (await readWorld(page)).interactive!.executions!.map(
          (e) => e.commandId,
        ),
      ),
    ]).toEqual(beforeOrbit);
    await expect(
      pane(page).getByRole('button', { name: 'Cancel picking', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect
      .poll(async () => (await readWorld(page)).interactive!.executions!.length)
      .toBeGreaterThan(beforeOrbit.length);
    if (mode === 'three-d')
      expect((await inspect(page, mode)).lastSurfacePick?.kind).toBe(
        'standard-surface',
      );
    await expect(page.locator('[data-view="movement"]')).toHaveCount(0);
    await page.screenshot({
      path: resolve(evidence, `${mode}-direct-move.png`),
    });
    // Street/block zoom is fine, cursor-centred and stable after input stops.
    await camera(page, mode, {
      center: { longitudeDeg: 103.852, latitudeDeg: 1.292 },
      groundSpanM: 300,
      headingTrueDeg: 0,
      pitchFromNadirDeg: 0,
      focusHeightM: 0,
    });
    const closeBox = (await canvas(page).boundingBox())!;
    await page.mouse.move(
      closeBox.x + closeBox.width * 0.55,
      closeBox.y + closeBox.height * 0.55,
    );
    const beforeZoom = (await inspect(page, mode)).camera;
    await page.mouse.wheel(0, -100);
    await expect
      .poll(async () => (await inspect(page, mode)).camera.groundSpanM)
      .toBeLessThan(beforeZoom.groundSpanM * 0.95);
    const street = (await inspect(page, mode)).camera;
    expect(street.groundSpanM).toBeGreaterThan(beforeZoom.groundSpanM * 0.75);
    await page.screenshot({ path: resolve(evidence, `${mode}-street.png`) });
    for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -100);
    const building = (await inspect(page, mode)).camera;
    expect(building.groundSpanM).toBeGreaterThanOrEqual(49.9);
    expect(building.groundSpanM).toBeLessThan(150);
    await page.screenshot({ path: resolve(evidence, `${mode}-building.png`) });
    await page
      .getByRole('button', { name: 'Open Details', exact: true })
      .click();
    const beforeClose = (await inspect(page, mode)).camera;
    await closeTab(page, 'Details');
    await expect
      .poll(async () => (await inspect(page, mode)).camera.center.longitudeDeg)
      .toBeCloseTo(beforeClose.center.longitudeDeg, 5);
    results[mode] = {
      group,
      beforeZoom,
      street,
      building,
      surface: (await inspect(page, mode)).lastSurfacePick,
    };
  }
  // A sky click has no position and creates no movement, even with selected drones.
  await camera(page, 'three-d', {
    center: { longitudeDeg: 103.852, latitudeDeg: 1.292 },
    groundSpanM: 1100,
    headingTrueDeg: 0,
    pitchFromNadirDeg: 85,
    focusHeightM: 0,
  });
  const beforeSky = (await readWorld(page)).interactive!.executions!.map(
    (execution) => execution.commandId,
  );
  const skyBox = (await canvas(page).boundingBox())!;
  await canvas(page).click({
    button: 'right',
    position: { x: skyBox.width * 0.5, y: 4 },
  });
  expect((await inspect(page, 'three-d')).lastSurfacePick?.kind).toBe(
    'unresolved',
  );
  expect(
    (await readWorld(page)).interactive!.executions!.map(
      (execution) => execution.commandId,
    ),
  ).toEqual(beforeSky);
  await pane(page)
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  await tabAction(page, '3D Map', 'New Tactical pane');
  await expect(pane(page, 'tactical:2')).toBeVisible();
  await expect
    .poll(async () => (await inspect(page, 'tactical', 'tactical:2'))?.ready)
    .toBe(true);
  const independent = (await inspect(page, 'three-d')).camera;
  await pane(page, 'tactical:2')
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  expect((await inspect(page, 'three-d')).camera).toEqual(independent);
  // Counts moved from the removed map footer to Fleet. Availability remains
  // distinct from run permission, and both renderers retain the same group.
  await page.locator('[data-activity-view="fleet"]').click();
  const fleet = page.locator('.fleet-sidebar');
  await expect(fleet.getByLabel('Movement selection count')).toHaveText(
    '3 selected · 2 available',
  );
  await expect(
    fleet.getByRole('button', { name: 'Move', exact: true }),
  ).toBeEnabled();
  for (const [mode, id] of [
    ['three-d', 'tactical'],
    ['tactical', 'tactical:2'],
  ] as const)
    expect((await inspect(page, mode, id)).selectedIds).toHaveLength(3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(fleet.getByLabel('Movement selection count')).toHaveText(
    '3 selected · 2 available',
  );
  await expect(
    fleet.getByRole('button', { name: 'Move', exact: true }),
  ).toBeDisabled();
  await expect(fleet.locator('.movement-context')).toHaveText(
    'Resume the demo to move drones.',
  );
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(
    fleet.getByRole('button', { name: 'Move', exact: true }),
  ).toBeEnabled();
  for (const [mode, id] of [
    ['three-d', 'tactical'],
    ['tactical', 'tactical:2'],
  ] as const)
    expect((await inspect(page, mode, id)).selectedIds).toHaveLength(3);
  await page.screenshot({ path: resolve(evidence, 'simultaneous-maps.png') });
  await page.setViewportSize({ width: 900, height: 780 });
  await page.screenshot({ path: resolve(evidence, 'narrow-maps.png') });
  expect(errors).toEqual([]);
  await endDemo(page);
  await writeFile(
    resolve(evidence, 'gesture-camera-checks.json'),
    JSON.stringify({ results, errors }, null, 2),
  );
});
