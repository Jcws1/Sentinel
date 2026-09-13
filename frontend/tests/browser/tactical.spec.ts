import { advanceFixture, closeTab, unloadMission, tabAction } from './actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { WorldFrame } from '../../src/contracts/generated';
import type { CameraIntent } from '../../src/renderers/contracts';

const product = 'http://127.0.0.1:5181';
const verification = 'http://127.0.0.1:5182';
const evidence = resolve('../docs/chrome-refinement/evidence');
const fixture = 'fixture-tactical';
const failures = new WeakMap<Page, string[]>();
const entityId = (suffix: string) => `${fixture}-${suffix}`;
type MapSnapshot = {
  renderer: { active: boolean; renderedFrames: number; sceneDraws: number };
  missionId?: string;
  frameId?: string;
  sequence?: number;
  entityIds: string[];
  zoneIds: string[];
  selectedId?: string;
  camera: CameraIntent;
  points: {
    id: string;
    x: number;
    y: number;
    affiliation: string;
    stale: boolean;
  }[];
  ready: boolean;
};
type ProbeWindow = Window & {
  __sentinelMapTest: {
    inspect(id: string): MapSnapshot;
    stats(): { created: number; disposed: number; active: number };
    setProvider(id: string, styleUrl: string): void;
  };
};
const mapPane = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
const inspect = (page: Page, id = 'tactical') =>
  page.evaluate(
    (viewId) =>
      (window as unknown as ProbeWindow).__sentinelMapTest.inspect(viewId),
    id,
  );
const stats = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as ProbeWindow).__sentinelMapTest.stats(),
  );
async function frame(page: Page, missionId = fixture): Promise<WorldFrame> {
  const response = await page.request.get(
    `${verification}/api/missions/${missionId}/world`,
  );
  expect(response.ok()).toBe(true);
  return response.json();
}
async function load(page: Page, name = 'Synthetic Tactical') {
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
}
async function ready(page: Page, id = 'tactical') {
  try {
    await expect.poll(async () => (await inspect(page, id))?.ready).toBe(true);
  } catch (error) {
    await writeFile(
      resolve(evidence, 'map-readiness-failure.json'),
      JSON.stringify(
        {
          viewId: id,
          snapshot: await inspect(page, id),
          stats: await stats(page),
        },
        null,
        2,
      ),
    );
    throw error;
  }
}
async function advance(page: Page): Promise<WorldFrame> {
  const previous = await frame(page);
  await advanceFixture(page, fixture);
  await expect(mapPane(page)).toHaveAttribute(
    'data-sequence',
    String(previous.sequence + 1),
  );
  return frame(page);
}
async function stage(page: Page, target: number) {
  let current = await frame(page);
  for (
    let attempts = 0;
    current.sequence % 3 !== target && attempts < 3;
    attempts++
  ) {
    current = await advance(page);
  }
  expect(current.sequence % 3).toBe(target);
  await expect
    .poll(async () => (await inspect(page)).frameId)
    .toBe(current.frameId);
  return current;
}
async function pick(page: Page, suffix: string, viewId = 'tactical') {
  const id = entityId(suffix);
  await expect
    .poll(async () =>
      (await inspect(page, viewId)).points.some((point) => point.id === id),
    )
    .toBe(true);
  const point = (await inspect(page, viewId)).points.find(
    (item) => item.id === id,
  )!;
  const canvas = mapPane(page, viewId).locator('canvas');
  const canvasBox = (await canvas.boundingBox())!;
  const summary = mapPane(page, viewId).locator('.map-selection');
  const summaryBox = (await summary.isVisible())
    ? await summary.boundingBox()
    : null;
  if (
    summaryBox &&
    canvasBox.x + point.x >= summaryBox.x &&
    canvasBox.x + point.x <= summaryBox.x + summaryBox.width &&
    canvasBox.y + point.y >= summaryBox.y &&
    canvasBox.y + point.y <= summaryBox.y + summaryBox.height
  ) {
    await mapPane(page, viewId)
      .getByRole('button', { name: 'Clear selection', exact: true })
      .click();
  }
  await mapPane(page, viewId)
    .locator('canvas')
    .click({ position: { x: point.x, y: point.y } });
  await expect(mapPane(page, viewId)).toHaveAttribute('data-selection', id);
}
async function anotherMap(page: Page) {
  await tabAction(page, 'Tactical Map', 'New Tactical pane');
  await ready(page, 'tactical:2');
  await expect(
    page.getByRole('tab', { name: 'Tactical Map 2', exact: true }),
  ).toBeFocused();
  for (const id of ['tactical', 'tactical:2']) {
    await mapPane(page, id)
      .getByRole('button', { name: 'Recenter', exact: true })
      .click();
    await ready(page, id);
  }
}
async function commandToSide(page: Page) {
  await page
    .getByRole('button', { name: 'Command Picture options', exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
  await expect(page.locator('[data-readout="command"]')).toBeVisible();
  await mapPane(page)
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  await ready(page);
}
async function toggleLayer(page: Page, name: string, id = 'tactical') {
  await mapPane(page, id)
    .getByRole('button', { name: 'Map layers', exact: true })
    .click();
  await page.getByRole('menuitemcheckbox', { name, exact: true }).click();
  await page.keyboard.press('Escape');
}
async function assertFrame(page: Page, expected: WorldFrame, id = 'tactical') {
  await expect
    .poll(async () => (await inspect(page, id)).frameId)
    .toBe(expected.frameId);
  const rendered = await inspect(page, id);
  const positioned = Object.values(expected.tracks)
    .map((track) => track.entityId)
    .sort();
  expect(rendered.entityIds.slice().sort()).toEqual(positioned);
  expect(rendered.zoneIds).toEqual(Object.keys(expected.zones));
  expect(rendered.missionId).toBe(expected.mission.id);
  expect(rendered.sequence).toBe(expected.sequence);
  expect(rendered.points.map((point) => point.id).sort()).toEqual(positioned);
  for (const point of rendered.points) {
    expect(point.affiliation).toBe(expected.entities[point.id].affiliation);
  }
}
function sameCamera(
  actual: CameraIntent,
  expected: CameraIntent,
  spanTolerance = 0.03,
) {
  expect(actual.center.longitudeDeg).toBeCloseTo(
    expected.center.longitudeDeg,
    4,
  );
  expect(actual.center.latitudeDeg).toBeCloseTo(expected.center.latitudeDeg, 4);
  expect(actual.headingTrueDeg).toBeCloseTo(expected.headingTrueDeg, 3);
  expect(Math.abs(actual.groundSpanM / expected.groundSpanM - 1)).toBeLessThan(
    spanTolerance,
  );
}
test.beforeEach(async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));

test('production Tactical view supports keyboard selection without exposing verification controls', async ({
  page,
}) => {
  await page.goto(product);
  expect(await page.evaluate(() => '__sentinelMapTest' in window)).toBe(false);
  await load(page);
  await expect(mapPane(page).locator('canvas')).toBeVisible();
  await expect(mapPane(page).locator('.map-status')).toContainText(
    'LOCAL GRID',
  );
  await expect(mapPane(page).locator('.map-status')).toContainText(
    'CREDENTIAL REQUIRED',
  );
  const canvas = mapPane(page).locator('canvas');
  await canvas.focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    /fixture-tactical-/,
  );
  await expect(page.locator('.app-header')).toContainText('UTC+8');
  await expect(
    page
      .locator('.app-header')
      .getByRole('button', { name: 'Load mission', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Next fixture frame', exact: true }),
  ).toHaveCount(0);
});

test('committed additions, changes and removals preserve camera and stable Entity picking', async ({
  page,
}) => {
  await page.goto(verification);
  await load(page);
  await ready(page);
  await commandToSide(page);
  const first = await stage(page, 0);
  await assertFrame(page, first);
  const before = await inspect(page);
  expect(before.entityIds).not.toContain(entityId('unlocated-01'));
  await pick(page, 'friendly-01');
  await expect(
    page.locator('[data-readout="command"] [data-field="selection"]'),
  ).toHaveText(entityId('friendly-01'));
  const changed = await advance(page);
  await assertFrame(page, changed);
  const after = await inspect(page);
  expect(after.entityIds).toContain(entityId('friendly-02'));
  expect(
    after.points.find((point) => point.id === entityId('friendly-01')),
  ).not.toMatchObject(
    before.points.find((point) => point.id === entityId('friendly-01'))!,
  );
  sameCamera(after.camera, before.camera);
  await pick(page, 'friendly-02');
  await pick(page, 'friendly-01');
  await pick(page, 'unknown-01');
  const removedPoint = (await inspect(page)).points.find(
    (point) => point.id === entityId('unknown-01'),
  )!;
  const removed = await advance(page);
  await assertFrame(page, removed);
  expect((await inspect(page)).entityIds).not.toContain(entityId('unknown-01'));
  expect((await inspect(page)).entityIds).not.toContain(
    entityId('friendly-01'),
  );
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('unknown-01'),
  );
  await expect(mapPane(page)).toContainText('Unavailable');
  await expect(page.locator('[data-readout="command"]')).toContainText(
    'Unavailable in this frame',
  );
  await pick(page, 'hostile-01');
  // The new quick summary occupies this corner; dismiss it before testing the
  // former symbol's empty geographic location through the actual canvas.
  await mapPane(page)
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await mapPane(page)
    .locator('canvas')
    .click({ position: { x: removedPoint.x, y: removedPoint.y } });
  await expect(mapPane(page)).not.toHaveAttribute(
    'data-selection',
    entityId('unknown-01'),
  );
  await page
    .locator('[data-readout="command"]')
    .getByRole('button', { name: 'Select F-01', exact: true })
    .click();
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('friendly-01'),
  );
  await expect(mapPane(page)).toContainText('No position');
  await page
    .locator('[data-readout="command"]')
    .getByRole('button', { name: 'Select No position', exact: true })
    .click();
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('unlocated-01'),
  );
  await expect(mapPane(page)).toContainText('No position');
  await pick(page, 'hostile-01');
  await expect(
    page.locator('[data-readout="command"] [data-field="selection"]'),
  ).toHaveText(entityId('hostile-01'));
  await page.screenshot({
    path: resolve(evidence, 'tactical-shared-selection.png'),
  });
  await writeFile(
    resolve(evidence, 'tactical-frame-updates.json'),
    JSON.stringify({ before, after, final: await inspect(page) }, null, 2),
  );
});

test('simultaneous maps share selection and layers without creating backend subscriptions', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto(verification);
  await load(page);
  await ready(page);
  await stage(page, 0);
  await anotherMap(page);
  expect(streams).toBe(1);
  await expect.poll(async () => (await stats(page)).active).toBe(2);
  await pick(page, 'hostile-01', 'tactical:2');
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('hostile-01'),
  );
  expect((await inspect(page, 'tactical:2')).frameId).toBe(
    (await inspect(page)).frameId,
  );
  await toggleLayer(page, 'Zones');
  await expect.poll(async () => (await inspect(page)).zoneIds.length).toBe(0);
  await expect
    .poll(async () => (await inspect(page, 'tactical:2')).zoneIds.length)
    .toBe(0);
  await toggleLayer(page, 'Zones', 'tactical:2');
  await expect.poll(async () => (await inspect(page)).zoneIds.length).toBe(1);
  await pick(page, 'stale-01');
  expect(
    (await inspect(page)).points.find(
      (point) => point.id === entityId('stale-01'),
    )?.stale,
  ).toBe(true);
  await toggleLayer(page, 'Last known observations', 'tactical:2');
  await expect
    .poll(async () =>
      (await inspect(page)).entityIds.includes(entityId('stale-01')),
    )
    .toBe(false);
  await expect
    .poll(async () =>
      (await inspect(page, 'tactical:2')).entityIds.includes(
        entityId('stale-01'),
      ),
    )
    .toBe(false);
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('stale-01'),
  );
  await expect(mapPane(page)).toContainText('Hidden by shared filters');
  await mapPane(page, 'tactical:2')
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await expect(mapPane(page)).not.toHaveAttribute('data-selection', /.+/);
  await page.screenshot({ path: resolve(evidence, 'tactical-two-maps.png') });
  const counts = await stats(page);
  expect(counts.created - counts.disposed).toBe(counts.active);
  expect(streams).toBe(1);
});

test('pan, recenter, resizing and warm hidden tabs preserve context; closed renderers dispose', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto(verification);
  await load(page);
  await ready(page);
  await stage(page, 0);
  await pick(page, 'hostile-01');
  const initial = await inspect(page);
  await mapPane(page).getByRole('button', { name: 'Pan', exact: true }).click();
  const canvas = mapPane(page).locator('canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.6 + 100,
    box.y + box.height * 0.65 + 70,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await inspect(page)).camera.center.longitudeDeg)
    .not.toBe(initial.camera.center.longitudeDeg);
  let lastCamera = '';
  await expect
    .poll(
      async () => {
        const camera = JSON.stringify((await inspect(page)).camera);
        const settled = camera === lastCamera;
        lastCamera = camera;
        return settled;
      },
      { intervals: [100] },
    )
    .toBe(true);
  const panned = await inspect(page);
  const beforeHide = await stats(page);
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('hostile-01'),
  );
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await expect.poll(async () => (await stats(page)).active).toBe(1);
  await expect
    .poll(async () => (await inspect(page)).renderer.active)
    .toBe(false);
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page);
  expect((await stats(page)).created).toBe(beforeHide.created);
  sameCamera((await inspect(page)).camera, panned.camera);
  await expect(
    mapPane(page).getByRole('button', { name: 'Pan', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  const unselectedPoint = (await inspect(page)).points.find(
    (point) => point.id === entityId('friendly-01'),
  )!;
  await mapPane(page)
    .locator('canvas')
    .click({ position: { x: unselectedPoint.x, y: unselectedPoint.y } });
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('hostile-01'),
  );
  await closeTab(page, 'Tactical Map');
  await expect.poll(async () => (await stats(page)).active).toBe(0);
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page);
  sameCamera((await inspect(page)).camera, panned.camera);
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('hostile-01'),
  );
  await mapPane(page)
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  await mapPane(page)
    .getByRole('button', { name: 'Select', exact: true })
    .click();
  sameCamera((await inspect(page)).camera, initial.camera);
  await anotherMap(page);
  const divider = page.getByRole('separator');
  const dividerBox = (await divider.boundingBox())!;
  const beforeWidth = (await mapPane(page).boundingBox())!.width;
  await page.mouse.move(
    dividerBox.x + dividerBox.width / 2,
    dividerBox.y + dividerBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    dividerBox.x - 120,
    dividerBox.y + dividerBox.height / 2,
    { steps: 10 },
  );
  await page.mouse.up();
  await expect
    .poll(async () => (await mapPane(page).boundingBox())!.width)
    .not.toBe(beforeWidth);
  await expect.poll(async () => (await inspect(page)).ready).toBe(true);
  await mapPane(page)
    .getByRole('button', { name: 'Recenter', exact: true })
    .click();
  await ready(page);
  await pick(page, 'friendly-01');
  await closeTab(page, 'Tactical Map 2');
  await expect.poll(async () => (await stats(page)).active).toBe(1);
  const counts = await stats(page);
  expect(counts.created - counts.disposed).toBe(counts.active);
  expect(streams).toBe(1);
  await closeTab(page, 'Tactical Map');
  await closeTab(page, 'Command Picture');
  await expect(
    page.getByRole('heading', { name: 'No open views', exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await stats(page)).active).toBe(0);
  await page
    .getByRole('button', { name: 'Open Tactical Map', exact: true })
    .click();
  await ready(page);
  await assertFrame(page, await frame(page));
  expect(streams).toBe(1);
  await writeFile(
    resolve(evidence, 'tactical-lifecycle.json'),
    JSON.stringify({ initial, panned, counts, streams }, null, 2),
  );
});

test('mission switching clears old map objects and selection while both panes retain one shared runtime', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto(verification);
  await load(page);
  await ready(page);
  await stage(page, 0);
  await anotherMap(page);
  await pick(page, 'hostile-01');
  await load(page, 'Synthetic Bravo');
  const bravo = await frame(page, 'fixture-bravo');
  await assertFrame(page, bravo);
  await assertFrame(page, bravo, 'tactical:2');
  await expect(mapPane(page)).not.toHaveAttribute('data-selection', /.+/);
  expect(
    (await inspect(page)).entityIds.every((id) => !id.startsWith(fixture)),
  ).toBe(true);
  expect(streams).toBe(2);
  await unloadMission(page);
  await expect.poll(async () => (await inspect(page)).entityIds.length).toBe(0);
  await expect
    .poll(async () => (await inspect(page, 'tactical:2')).zoneIds.length)
    .toBe(0);
  await expect(mapPane(page)).toContainText('Load a mission');
});

test('map retains the complete stale frame and selection, then consumes a verified recovery snapshot', async ({
  page,
}) => {
  let current: WebSocketRoute | undefined;
  let blocked = false;
  await page.routeWebSocket('**/api/missions/*/stream', (route) => {
    if (blocked) {
      route.close({ code: 1011, reason: 'Injected backend outage' });
      return;
    }
    current = route;
    route.connectToServer();
  });
  await page.goto(verification);
  await load(page);
  await ready(page);
  await stage(page, 0);
  await pick(page, 'hostile-01');
  const before = await inspect(page);
  blocked = true;
  current!.close({ code: 1011, reason: 'Injected backend outage' });
  await expect(mapPane(page).locator('.map-stale')).toBeVisible();
  await expect(page.locator('.connection-state')).toHaveText('STALE');
  expect((await inspect(page)).frameId).toBe(before.frameId);
  expect((await inspect(page)).entityIds).toEqual(before.entityIds);
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('hostile-01'),
  );
  await page.screenshot({ path: resolve(evidence, 'tactical-stale.png') });
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(mapPane(page).locator('.map-stale')).toHaveCount(0);
  await assertFrame(page, await frame(page));
  await pick(page, 'neutral-01');
});

test('provider loading and failure preserve operational context and explicitly recover through fallback', async ({
  page,
}) => {
  await page.goto(verification);
  await load(page);
  await ready(page);
  await stage(page, 0);
  await pick(page, 'hostile-01');
  const before = await inspect(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let fail = true;
  await page.route('**/test-style.json', async (route) => {
    await held;
    if (fail)
      await route.fulfill({
        status: 503,
        body: 'Injected unavailable provider',
      });
    else
      await route.fulfill({
        json: {
          version: 8,
          sources: {},
          layers: [
            {
              id: 'test-background',
              type: 'background',
              paint: { 'background-color': '#080c11' },
            },
          ],
        },
      });
  });
  await page.evaluate(() =>
    (window as unknown as ProbeWindow).__sentinelMapTest.setProvider(
      'tactical',
      '/test-style.json',
    ),
  );
  await expect(mapPane(page).locator('.map-status')).toContainText(/loading/i);
  const changed = await advance(page);
  release();
  await expect(mapPane(page)).toContainText('Basemap unavailable');
  await ready(page);
  await assertFrame(page, changed);
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('hostile-01'),
  );
  sameCamera((await inspect(page)).camera, before.camera);
  await pick(page, 'friendly-02');
  await page.screenshot({
    path: resolve(evidence, 'tactical-provider-fallback.png'),
  });
  fail = false;
  await mapPane(page)
    .getByRole('button', { name: 'Retry basemap', exact: true })
    .click();
  await ready(page);
  await expect(mapPane(page)).not.toContainText('Basemap unavailable');
  await assertFrame(page, changed);
  await expect(mapPane(page)).toHaveAttribute(
    'data-selection',
    entityId('friendly-02'),
  );
  await pick(page, 'neutral-01');
});

test('blocked map worker reports reload requirement and recovers after a deliberate application reload', async ({
  page,
}) => {
  const workerPattern = '**/maplibre-gl-worker-*.js';
  await page.route(workerPattern, (route) => route.abort('failed'));
  await page.goto(verification);
  await load(page);
  const expected = await frame(page);
  await expect(mapPane(page).locator('.map-status')).toContainText(
    'Map resources unavailable',
    { timeout: 12000 },
  );
  await expect(mapPane(page).locator('.map-status')).toContainText(
    'STARTUP TIMEOUT',
  );
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(mapPane(page)).toHaveAttribute(
    'data-frame-id',
    expected.frameId,
  );
  expect((await inspect(page)).ready).toBe(false);
  expect((await inspect(page)).entityIds).toEqual([]);
  await page.screenshot({
    path: resolve(evidence, 'tactical-worker-failure.png'),
  });
  await page.unroute(workerPattern);
  await Promise.all([
    page.waitForEvent('domcontentloaded'),
    mapPane(page)
      .getByRole('button', { name: 'Reload application', exact: true })
      .click(),
  ]);
  // A document reload starts a fresh application session; mission reload is explicit.
  await expect(page.locator('.status-bar')).toContainText('No mission loaded');
  await expect(mapPane(page)).not.toHaveAttribute('data-frame-id', /.+/);
  await load(page);
  await ready(page);
  await assertFrame(page, expected);
  await pick(page, 'hostile-01');
  await expect(mapPane(page).locator('.map-status')).not.toContainText(
    'STARTUP TIMEOUT',
  );
  await page.screenshot({
    path: resolve(evidence, 'tactical-worker-reloaded.png'),
  });
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]) {
  test(`Tactical operator console at ${viewport.width} with keyboard focus and narrow split`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(verification);
    await load(page);
    await ready(page);
    await stage(page, 0);
    await pick(page, 'hostile-01');
    await mapPane(page)
      .getByRole('button', { name: 'Select', exact: true })
      .focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(
      mapPane(page).getByRole('button', { name: 'Recenter', exact: true }),
    ).toBeFocused();
    const focus = await mapPane(page)
      .getByRole('button', { name: 'Recenter', exact: true })
      .evaluate((button) => ({
        style: getComputedStyle(button).outlineStyle,
        width: getComputedStyle(button).outlineWidth,
      }));
    expect(focus.style).toBe('solid');
    expect(parseFloat(focus.width)).toBeGreaterThan(0);
    await page.screenshot({
      path: resolve(evidence, `tactical-${viewport.width}.png`),
    });
    await anotherMap(page);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await writeFile(
      resolve(evidence, `accessibility-tactical-${viewport.width}.json`),
      JSON.stringify(
        {
          violations: result.violations,
          incomplete: result.incomplete.map((item) => item.id),
        },
        null,
        2,
      ),
    );
    expect(result.violations).toEqual([]);
    await page.screenshot({
      path: resolve(evidence, `tactical-split-${viewport.width}.png`),
    });
    const separator = page.getByRole('separator');
    const dividerBox = (await separator.boundingBox())!;
    const mapBox = (await mapPane(page).boundingBox())!;
    await page.mouse.move(
      dividerBox.x + dividerBox.width / 2,
      dividerBox.y + dividerBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      mapBox.x + 280,
      dividerBox.y + dividerBox.height / 2,
      { steps: 12 },
    );
    await page.mouse.up();
    await expect
      .poll(async () => (await mapPane(page).boundingBox())!.width)
      .toBeLessThan(340);
    await expect(
      mapPane(page).getByRole('button', { name: 'Recenter', exact: true }),
    ).toBeVisible();
    await expect(
      mapPane(page).getByRole('button', { name: 'Map layers', exact: true }),
    ).toBeVisible();
    await mapPane(page)
      .getByRole('button', { name: 'Map layers', exact: true })
      .click();
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Zones', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth === innerWidth &&
          document.documentElement.scrollHeight === innerHeight,
      ),
    ).toBe(true);
    await page.screenshot({
      path: resolve(evidence, `tactical-narrow-${viewport.width}.png`),
    });
  });
}
