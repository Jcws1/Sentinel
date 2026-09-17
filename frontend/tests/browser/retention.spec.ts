import { loadFixture } from './actions';
import { test, expect, type Page } from '@playwright/test';
import { advanceFixture, closeTab, tabAction } from './actions';
import type { CameraIntent, MapMode } from '../../src/renderers/contracts';

const origin = 'http://127.0.0.1:5182';
const pane = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
type Snapshot = {
  ready: boolean;
  retainable: boolean;
  frameId: string;
  sequence: number;
  missionId: string;
  selectedId?: string;
  selectionId?: string;
  camera: CameraIntent;
  rendererRunning?: boolean;
  renderer?: { active: boolean; renderedFrames: number; sceneDraws: number };
  environment?: { renderedFrames: number };
};
type Probes = {
  __sentinelMapTest: {
    inspect(id: string): Snapshot;
    stats(): { created: number; active: number };
  };
  __sentinelCesiumTest: {
    inspect(id: string): Snapshot;
    stats(): { created: number; active: number };
  };
  __sentinelRendererPoolTest: {
    inspect(): {
      alive: number;
      active: number;
      hidden: number;
      accountedHiddenBytes: number;
    };
  };
};
const inspect = (page: Page, mode: MapMode = 'tactical', id = 'tactical') =>
  page.evaluate(
    ({ mode, id }) => {
      const probes = window as unknown as Probes;
      return (
        mode === 'tactical'
          ? probes.__sentinelMapTest
          : probes.__sentinelCesiumTest
      )?.inspect(id);
    },
    { mode, id },
  );
const pool = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Probes).__sentinelRendererPoolTest.inspect(),
  );
async function ready(page: Page, mode: MapMode = 'tactical', id = 'tactical') {
  await expect
    .poll(async () => (await inspect(page, mode, id))?.ready)
    .toBe(true);
  // These are warm-retention cases. Provider/terrain refinement must have
  // settled as well as the operational frame before hiding the renderer.
  await expect
    .poll(async () => (await inspect(page, mode, id))?.retainable)
    .toBe(true);
}
async function load(page: Page, name = 'Tactical') {
  await loadFixture(page, name);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
}

test('twenty warm tab/mode changes reuse viewers, suspend hidden work and resume the latest shared frame', async ({
  page,
}) => {
  test.setTimeout(60000);
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto(origin);
  await load(page);
  await ready(page);
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await ready(page, 'three-d');
  const initial = await inspect(page, 'three-d');
  const counts = await page.evaluate(() => {
    const p = window as unknown as Probes;
    return {
      tactical: p.__sentinelMapTest.stats().created,
      cesium: p.__sentinelCesiumTest.stats().created,
    };
  });
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await expect.poll(async () => (await pool(page)).active).toBe(0);
  await expect
    .poll(async () => (await inspect(page, 'three-d')).rendererRunning)
    .toBe(false);
  const hiddenRenders = (await inspect(page, 'three-d')).environment!
    .renderedFrames;
  await advanceFixture(page, 'fixture-tactical');
  const readout = page.locator('[data-readout="command"]');
  await expect(readout).not.toHaveAttribute('data-frame-id', initial.frameId);
  await readout
    .getByRole('button', { name: /^Select / })
    .first()
    .click();
  const selected = (
    await page.request
      .get(`${origin}/api/missions/fixture-tactical/world`)
      .then((r) => r.json())
  ).entities;
  const selectedId = Object.values(selected).find(
    (e) => (e as { label: string }).label === 'F-01',
  ) as { id: string };
  const frame = await readout.getAttribute('data-frame-id');
  await page.waitForTimeout(350);
  expect((await inspect(page, 'three-d')).environment!.renderedFrames).toBe(
    hiddenRenders,
  );
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page, 'three-d');
  expect((await inspect(page, 'three-d')).frameId).toBe(frame);
  expect((await inspect(page, 'three-d')).selectionId).toBe(selectedId.id);
  expect(
    (await inspect(page, 'three-d')).camera.center.longitudeDeg,
  ).toBeCloseTo(initial.camera.center.longitudeDeg, 6);
  for (let i = 0; i < 10; i++) {
    await pane(page)
      .getByRole('button', { name: 'Tactical', exact: true })
      .click();
    await ready(page);
    await pane(page).getByRole('button', { name: '3D', exact: true }).click();
    await ready(page, 'three-d');
  }
  expect(
    await page.evaluate(() => {
      const p = window as unknown as Probes;
      return {
        tactical: p.__sentinelMapTest.stats().created,
        cesium: p.__sentinelCesiumTest.stats().created,
      };
    }),
  ).toEqual(counts);
  expect(await pool(page)).toMatchObject({ alive: 2, active: 1, hidden: 1 });
  expect(streams).toBe(1);
  await closeTab(page, '3D Map');
  await expect.poll(async () => (await pool(page)).alive).toBe(0);
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page, 'three-d');
  expect((await inspect(page, 'three-d')).selectionId).toBe(selectedId.id);
  expect(
    await page.evaluate(
      () => (window as unknown as Probes).__sentinelCesiumTest.stats().created,
    ),
  ).toBe(counts.cesium + 1);
});

test('hidden mission changes reconcile before a retained renderer becomes current', async ({
  page,
}) => {
  await page.goto(origin);
  await load(page);
  await ready(page);
  const created = await page.evaluate(
    () => (window as unknown as Probes).__sentinelMapTest.stats().created,
  );
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await load(page, 'Bravo');
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page);
  expect((await inspect(page)).missionId).toBe('fixture-bravo');
  expect(
    await page.evaluate(
      () => (window as unknown as Probes).__sentinelMapTest.stats().created,
    ),
  ).toBe(created);
  await expect(pane(page)).not.toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
});

test('visible renderer capacity is explicit and closing a pane permits recovery without another backend stream', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto(origin);
  await load(page);
  await ready(page);
  for (let index = 2; index <= 5; index++) {
    await tabAction(
      page,
      index === 2 ? 'Tactical Map' : `Tactical Map ${index - 1}`,
      'New Tactical pane',
    );
    if (index < 5) await ready(page, 'tactical', `tactical:${index}`);
  }
  await expect(pane(page, 'tactical:5')).toContainText('Map capacity reached');
  expect(await pool(page)).toMatchObject({ alive: 4, active: 4, hidden: 0 });
  await closeTab(page, 'Tactical Map 4');
  await pane(page, 'tactical:5')
    .getByRole('button', { name: 'Retry after closing or hiding a map' })
    .click();
  await ready(page, 'tactical', 'tactical:5');
  expect(await pool(page)).toMatchObject({ alive: 4, active: 4 });
  expect(streams).toBe(1);
  for (const title of [
    'Tactical Map 5',
    'Tactical Map 3',
    'Tactical Map 2',
    'Tactical Map',
  ])
    await closeTab(page, title);
  await expect.poll(async () => (await pool(page)).alive).toBe(0);
});
