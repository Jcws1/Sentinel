import { loadFixture } from './actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { advanceFixture, tabAction, closeTab } from './actions';
import type { CameraIntent } from '../../src/renderers/contracts';

const origin = 'http://127.0.0.1:5182',
  mid = 'fixture-observations',
  eid = mid + '-friendly-01';
const evidence = resolve(
  '../docs/d2/regressions/evidence/regressions/regressions/regressions',
);
const pane = (page: Page, id = 'tactical') =>
  page.locator(`.tactical-view[data-view-id="${id}"]`);
type Probe = {
  ready: boolean;
  frameId: string;
  camera: CameraIntent;
  entityIds: string[];
  trails: { trackId: string; sourceId: string; times: string[] }[];
  renderedTrailSegments: number;
  renderedTrailPoints: number;
  points: { id: string; x: number; y: number }[];
};
type Probes = {
  __sentinelMapTest: {
    inspect: (id: string) => Probe;
    stats: () => { created: number; active: number };
  };
  __sentinelCesiumTest: {
    inspect: (id: string) => Probe;
    stats: () => { created: number; active: number };
  };
};
async function inspect(page: Page, mode = 'tactical', id = 'tactical') {
  return page.evaluate(
    ({ mode, id }) => {
      const w = window as unknown as Probes;
      return (
        mode === 'tactical' ? w.__sentinelMapTest : w.__sentinelCesiumTest
      )?.inspect(id);
    },
    { mode, id },
  );
}
async function load(page: Page, name = 'Synthetic Observations') {
  await loadFixture(page, name);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
}
async function tracks(page: Page) {
  await page
    .getByRole('navigation', { name: 'Activity Bar' })
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .click();
  await expect(page.locator('.tracks-table')).toBeVisible();
}
async function select(page: Page, label = 'F-01') {
  await tracks(page);
  await page
    .getByRole('searchbox', { name: 'Search entities in all views' })
    .fill(label);
  const row = page.locator('.tracks-table tbody tr').first();
  await row.focus();
  await page.keyboard.press('Enter');
  return row;
}
async function ready(page: Page, mode = 'tactical', id = 'tactical') {
  await expect
    .poll(async () => (await inspect(page, mode, id))?.ready)
    .toBe(true);
}
async function pick(
  page: Page,
  suffix: string,
  mode = 'tactical',
  id = 'tactical',
) {
  const p = (await inspect(page, mode, id)).points.find((p) =>
    p.id.endsWith(suffix),
  )!;
  expect(p).toBeTruthy();
  await pane(page, id)
    .locator('canvas')
    .click({ position: { x: p.x, y: p.y } });
  await expect(pane(page, id)).toHaveAttribute('data-selection', p.id);
}
test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});

test('find → select → summary → pinned details → recorded trail agrees across Tactical and Cesium', async ({
  page,
}) => {
  let streams = 0,
    histories = 0;
  const errors: string[] = [];
  page.on('websocket', (s) => {
    if (s.url().includes('/stream')) streams++;
  });
  page.on('request', (r) => {
    if (r.url().includes('/observed-history')) histories++;
  });
  page.on('pageerror', (e) => errors.push(e.name));
  await page.goto(origin);
  await load(page);
  await ready(page);
  await tracks(page);
  await expect(page.locator('[data-field="total-entities"]')).toHaveText('6');
  await expect(page.locator('.entity-scope')).toContainText(
    '6 source tracks total',
  );
  await page.locator('.tracks-table tbody tr').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.tracks-table tbody tr').nth(1)).toBeFocused();
  const row = await select(page);
  await expect(row).toHaveAttribute('aria-selected', 'true');
  await expect(
    page.getByRole('article', { name: 'Selected entity details' }),
  ).toContainText('150 m MSL');
  await expect(
    page.getByRole('article', { name: 'Selected entity details' }),
  ).toContainText('12 m/s');
  await page
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  const inspector = page.locator('.entity-inspector');
  await expect(inspector).toHaveAttribute('data-entity-id', eid);
  if (
    !(await page
      .locator('.entity-inspector')
      .getByRole('button', { name: 'Show observed trail', exact: true })
      .isVisible())
  )
    await page
      .locator('.entity-inspector')
      .getByText('Observed trail', { exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Show observed trail', exact: true })
    .click();
  await expect(page.locator('.entity-inspector .trail-readout')).toContainText(
    '8 observations · 3 segments',
  );
  await tabAction(page, 'Pinned · F-01', 'Open to Side');
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await ready(page);
  await expect.poll(async () => (await inspect(page)).trails?.length).toBe(3);
  await expect
    .poll(async () => (await inspect(page)).renderedTrailPoints)
    .toBe(8);
  const tactical = await inspect(page);
  await pane(page)
    .getByRole('button', { name: 'Map layers', exact: true })
    .click();
  await expect(page.locator('.map-scope')).toContainText(
    'Mission · 1 unlocated',
  );
  await page.keyboard.press('Escape');
  expect(tactical.trails.map((t) => t.times.length)).toEqual([3, 2, 3]);
  await page.screenshot({ path: resolve(evidence, 'workflow-tactical.png') });
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await ready(page, 'three-d');
  await expect
    .poll(async () => (await inspect(page, 'three-d')).renderedTrailSegments)
    .toBe(3);
  await expect
    .poll(async () => (await inspect(page, 'three-d')).renderedTrailPoints)
    .toBe(8);
  expect((await inspect(page, 'three-d')).trails).toEqual(tactical.trails);
  await expect(pane(page).locator('.map-trail-status')).toContainText(
    'dashed height approximate',
  );
  await pane(page)
    .getByRole('button', { name: 'Reset shared map filters', exact: true })
    .click();
  await pick(page, 'hostile-01', 'three-d');
  await expect(inspector).toHaveAttribute('data-entity-id', eid);
  await expect(page.locator('.selection-details')).toBeVisible();
  await expect(page.locator('.selection-details')).toContainText('H-01');
  await page.getByRole('tab', { name: 'Pinned · F-01', exact: true }).click();
  await inspector
    .getByRole('button', { name: 'Select entity', exact: true })
    .click();
  await page
    .locator('.selection-details')
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  await expect(
    page.getByRole('tab', { name: 'Pinned · F-01', exact: true }),
  ).toHaveCount(1);
  await page.screenshot({ path: resolve(evidence, 'workflow-cesium.png') });
  await tracks(page);
  await page.getByRole('button', { name: 'Shared entity filters' }).click();
  const sourceMenu = page.getByRole('menuitem', {
    name: 'Source',
    exact: true,
  });
  await sourceMenu.focus();
  await page.keyboard.press('ArrowRight');
  await page
    .getByRole('menuitemcheckbox', {
      name: 'Import · simulated 3',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(inspector.locator('.trail-readout')).toContainText(
    '0 observations · 0 segments',
  );
  await expect(page.locator('.tracks-table tbody')).toContainText('Ended');
  expect(streams).toBe(1);
  expect(histories).toBe(2);
  expect(errors).toEqual([]);
});

test('550 ms recorded reads make progress during 5 Hz commits, expose their through time and converge after updates settle', async ({
  page,
}) => {
  let inFlight = 0,
    peak = 0,
    requests = 0;
  const seen: string[] = [];
  await page.route('**/observed-history?**', async (route) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    requests++;
    try {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 550));
      await route.fulfill({ response });
    } finally {
      inFlight--;
    }
  });
  await page.goto(origin);
  await load(page, 'Synthetic Alpha');
  await tracks(page);
  await page.locator('.tracks-table tbody tr').first().click();
  await page
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  if (
    !(await page
      .locator('.entity-inspector')
      .getByRole('button', { name: 'Show observed trail', exact: true })
      .isVisible())
  )
    await page
      .locator('.entity-inspector')
      .getByText('Observed trail', { exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Show observed trail', exact: true })
    .click();
  for (let i = 0; i < 8; i++) {
    await advanceFixture(page, 'fixture-alpha');
    await page.waitForTimeout(200);
    seen.push(
      await page.locator('.entity-inspector .trail-readout').innerText(),
    );
  }
  expect(seen.some((s) => s.includes('observations'))).toBe(true);
  expect(seen.some((s) => s.includes('Refreshing · trail through'))).toBe(true);
  await expect(
    page.locator('.entity-inspector .trail-readout'),
  ).not.toContainText('Refreshing');
  await expect(page.locator('.entity-inspector .trail-readout')).toContainText(
    'observations',
  );
  expect(peak).toBe(1);
  expect(requests).toBeLessThan(9);
});

test('filters, source choice, unknown measurements, unlocated discovery and neutral selection remain coordinated', async ({
  page,
}) => {
  await page.goto(origin);
  await load(page);
  await select(page, 'F-01');
  await tabAction(page, 'Tracks', 'Open to Side');
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await ready(page);
  const camera = (await inspect(page)).camera;
  await page
    .getByRole('searchbox', { name: 'Search entities in all views' })
    .fill('No position');
  await expect(page.locator('.selection-details')).toContainText(
    'Hidden by shared filters',
  );
  await expect(page.locator('[data-field="filtered-entities"]')).toHaveText(
    '1',
  );
  await expect.poll(async () => (await inspect(page)).entityIds.length).toBe(0);
  await page.locator('.tracks-table tbody tr').click();
  await expect(page.locator('.selection-details')).toContainText(
    'No position supplied',
  );
  await expect(page.locator('.tracks-table tbody')).toContainText(
    'Unavailable',
  );
  await page
    .locator('.entity-toolbar')
    .getByRole('button', { name: 'Reset all filters' })
    .click();
  await expect(page.locator('.tracks-table tbody')).toContainText('0 m/s');
  await expect(page.locator('.tracks-table tbody tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Shared entity filters' }).click();
  await page.getByRole('menuitem', { name: 'Source', exact: true }).hover();
  const sourceChoice = page.getByRole('menuitemcheckbox', {
    name: 'Import · simulated 3',
    exact: true,
  });
  const choiceBounds = (await sourceChoice.boundingBox())!;
  // Real pointer movement lets the submenu's directional grace region operate.
  await page.mouse.move(
    choiceBounds.x + choiceBounds.width / 2,
    choiceBounds.y + choiceBounds.height / 2,
    { steps: 12 },
  );
  await sourceChoice.click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.locator('.tracks-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.tracks-table tbody')).toContainText('Ended');
  await expect.poll(async () => (await inspect(page)).entityIds).toEqual([eid]);
  expect((await inspect(page)).camera).toEqual(camera);
  await page
    .locator('.entity-toolbar')
    .getByRole('button', { name: 'Reset all filters' })
    .click();
  await page
    .locator('.tracks-table th button')
    .filter({ hasText: 'Speed' })
    .click();
  await expect(
    page.locator('.tracks-table th').filter({ hasText: 'Speed' }),
  ).toHaveAttribute('aria-sort', 'descending');
});

test('narrow splits retain complete copyable values, keyboard menus, scrolling and accessible controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto(origin);
  await load(page);
  await select(page);
  await page
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  const tab = page.getByRole('tab', { name: 'Pinned · F-01', exact: true });
  await tab.focus();
  await page.keyboard.press('Shift+F10');
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Tracks', exact: true }).click();
  const inspector = page.locator('.entity-inspector');
  expect(
    await inspector.evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  const timestamp = inspector.locator('time').first();
  expect(
    await timestamp.evaluate((el) => getComputedStyle(el).whiteSpace),
  ).toBe('nowrap');
  expect(
    await timestamp.evaluate((el) => getComputedStyle(el).userSelect),
  ).toBe('text');
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: resolve(evidence, 'tracks-inspector-narrow.png'),
  });
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth === innerWidth &&
        document.documentElement.scrollHeight === innerHeight,
    ),
  ).toBe(true);
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await ready(page);
  await pane(page).getByRole('button', { name: '3D', exact: true }).click();
  await ready(page, 'three-d');
  await page.screenshot({
    path: resolve(evidence, 'cesium-inspector-narrow.png'),
  });
  const details = page.locator('.entity-inspector'),
    surface = pane(page).locator('.map-surface');
  const a = (await details.boundingBox())!,
    b = (await surface.boundingBox())!;
  expect(a.x).toBeGreaterThanOrEqual(b.x + b.width);
  await expect(page.locator('.map-selection')).toHaveCount(0);
});

test('one history request and backend stream serve simultaneous maps; tab changes and frame updates retain cameras and resources', async ({
  page,
}) => {
  let streams = 0,
    histories = 0;
  page.on('websocket', (s) => {
    if (s.url().includes('/stream')) streams++;
  });
  page.on('request', (r) => {
    if (r.url().includes('/observed-history')) histories++;
  });
  await page.goto(origin);
  await load(page);
  await select(page);
  await page
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  if (
    !(await page
      .locator('.entity-inspector')
      .getByRole('button', { name: 'Show observed trail', exact: true })
      .isVisible())
  )
    await page
      .locator('.entity-inspector')
      .getByText('Observed trail', { exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Show observed trail', exact: true })
    .click();
  await expect(page.locator('.entity-inspector .trail-readout')).toContainText(
    '8 observations',
  );
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await ready(page);
  await tabAction(page, 'Tactical Map', 'New Tactical pane');
  await ready(page, 'tactical', 'tactical:2');
  await pane(page, 'tactical:2')
    .getByRole('button', { name: '3D', exact: true })
    .click();
  await ready(page, 'three-d', 'tactical:2');
  const a = await inspect(page),
    b = await inspect(page, 'three-d', 'tactical:2');
  expect(a.trails).toEqual(b.trails);
  expect(a.frameId).toBe(b.frameId);
  const before = await page.evaluate(() => {
    const w = window as unknown as Probes;
    return {
      a: w.__sentinelMapTest.stats().created,
      b: w.__sentinelCesiumTest.stats().created,
    };
  });
  for (let i = 0; i < 3; i++) {
    await page.getByRole('tab', { name: 'Tracks', exact: true }).click();
    await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  }
  await ready(page);
  expect((await inspect(page)).camera).toEqual(a.camera);
  const resumed = (await inspect(page, 'three-d', 'tactical:2')).camera;
  expect(resumed.center.longitudeDeg).toBeCloseTo(
    b.camera.center.longitudeDeg,
    7,
  );
  expect(resumed.center.latitudeDeg).toBeCloseTo(
    b.camera.center.latitudeDeg,
    7,
  );
  expect(resumed.groundSpanM).toBeCloseTo(b.camera.groundSpanM, 3);
  expect(resumed.headingTrueDeg).toBeCloseTo(b.camera.headingTrueDeg, 7);
  expect(resumed.pitchFromNadirDeg).toBeCloseTo(b.camera.pitchFromNadirDeg!, 7);
  expect(
    await page.evaluate(() => {
      const w = window as unknown as Probes;
      return {
        a: w.__sentinelMapTest.stats().created,
        b: w.__sentinelCesiumTest.stats().created,
      };
    }),
  ).toEqual(before);
  await closeTab(page, '3D Map 2');
  await closeTab(page, 'Tactical Map');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as Probes;
        return (
          w.__sentinelCesiumTest.stats().active +
          w.__sentinelMapTest.stats().active
        );
      }),
    )
    .toBe(0);
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await ready(page);
  await expect(pane(page)).toHaveAttribute('data-selection', eid);
  expect(streams).toBe(1);
  expect(histories).toBe(1);
});

test('late history responses, errors and retry cannot contaminate another mission or pinned identity', async ({
  page,
}) => {
  let release: () => void = () => {},
    arrived = false;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/observed-history?**', async (route) => {
    arrived = true;
    const response = await route.fetch();
    await pending;
    await route.fulfill({ response });
  });
  await page.goto(origin);
  await load(page);
  await select(page);
  await page
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  if (
    !(await page
      .locator('.entity-inspector')
      .getByRole('button', { name: 'Show observed trail', exact: true })
      .isVisible())
  )
    await page
      .locator('.entity-inspector')
      .getByText('Observed trail', { exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Show observed trail', exact: true })
    .click();
  await expect.poll(() => arrived).toBe(true);
  await load(page, 'Synthetic Bravo');
  release();
  await expect(
    page.getByRole('heading', { name: 'Mission not active' }),
  ).toBeVisible();
  await expect(page.locator('.entity-inspector')).toHaveAttribute(
    'data-mission-id',
    mid,
  );
  await page.unroute('**/observed-history?**');
  await load(page);
  await expect(page.locator('.entity-inspector')).toHaveAttribute(
    'data-entity-id',
    eid,
  );
  await page.route('**/observed-history?**', (route) =>
    route.fulfill({
      status: 503,
      json: { detail: 'Injected recording outage' },
    }),
  );
  if (
    !(await page
      .locator('.entity-inspector')
      .getByRole('button', { name: 'Show observed trail', exact: true })
      .isVisible())
  )
    await page
      .locator('.entity-inspector')
      .getByText('Observed trail', { exact: true })
      .click();
  await page
    .getByRole('button', { name: 'Show observed trail', exact: true })
    .click();
  await expect(page.locator('.entity-inspector .trail-readout')).toContainText(
    '503',
  );
  await page.unroute('**/observed-history?**');
  await page
    .getByRole('button', { name: 'Retry history', exact: true })
    .click();
  await expect(page.locator('.entity-inspector .trail-readout')).toContainText(
    '8 observations',
  );
});

test('committed removals and stale/reconnect preserve selection, inspector identity and camera', async ({
  page,
}) => {
  let current: WebSocketRoute | undefined,
    blocked = false;
  await page.routeWebSocket('**/api/missions/*/stream', (route) => {
    if (blocked) {
      route.close({ code: 1011, reason: 'Injected outage' });
      return;
    }
    current = route;
    route.connectToServer();
  });
  await page.goto(origin);
  await load(page);
  await select(page);
  await page
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  await tabAction(page, 'Pinned · F-01', 'Open to Side');
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await ready(page);
  const before = await inspect(page);
  await advanceFixture(page, mid);
  await expect(page.locator('.entity-inspector')).toContainText(
    'No position supplied',
  );
  expect((await inspect(page)).camera).toEqual(before.camera);
  blocked = true;
  current!.close({ code: 1011, reason: 'Injected outage' });
  await expect(page.locator('.entity-inspector')).toContainText('Stale frame');
  await expect(pane(page)).toContainText('STALE');
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await pane(page)
    .getByRole('button', { name: 'Reset shared map filters', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open Details', exact: true }).click();
  await page
    .locator('.selection-details')
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await pick(page, 'unknown-01');
  await page
    .locator('.selection-details')
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  await advanceFixture(page, mid);
  await expect(
    page.getByRole('heading', { name: 'Entity unavailable' }),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await expect(page.locator('.selection-details')).toContainText(
    'missing from the presented frame',
  );
  await expect(pane(page)).toHaveAttribute(
    'data-selection',
    mid + '-unknown-01',
  );
});
