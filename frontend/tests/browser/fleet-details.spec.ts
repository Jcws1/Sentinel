import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tabAction, advanceFixture } from './actions';
test.use({ trace: 'off' });
const origin = 'http://127.0.0.1:5182',
  evidence = resolve(
    '../docs/d4-refinement/regressions/d4/regressions/fleet-details',
  );
const details = (p: Page) => p.locator('.selection-details');
const fleet = (p: Page) => p.locator('.fleet-sidebar');
async function load(p: Page, name = 'Observations') {
  await p.getByRole('button', { name: 'Load mission', exact: true }).click();
  await p
    .getByRole('menuitem', { name: 'Developer fixtures', exact: true })
    .hover();
  await p.getByRole('menuitem', { name, exact: true }).click();
  await expect(p.locator('.connection-state')).toHaveText('CONNECTED');
}
async function action(p: Page, name: string) {
  await p.getByRole('button', { name: 'Simulation', exact: true }).click();
  const item = p.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeEnabled({ timeout: 15000 });
  await item.click();
  if (name === 'End demo')
    await expect(p.locator('[data-run-state]')).toHaveAttribute(
      'data-run-state',
      'ended',
    );
  if (name === 'New demo')
    await expect(p.locator('[data-run-state]')).toHaveAttribute(
      'data-run-state',
      'running',
      { timeout: 15000 },
    );
}
async function pick(
  p: Page,
  suffix: string,
  mode = 'tactical',
  id = 'tactical',
) {
  const readPoint = () =>
    p.evaluate(
      ({ suffix, mode, id }) => {
        const w = window as unknown as Record<
          string,
          {
            inspect: (id: string) => {
              points: { id: string; x: number; y: number }[];
            };
          }
        >;
        return w[
          mode === 'tactical' ? '__sentinelMapTest' : '__sentinelCesiumTest'
        ]
          ?.inspect(id)
          ?.points.find((p) => p.id.endsWith(suffix));
      },
      { suffix, mode, id },
    );
  const canvas = p.locator(`[data-view-id="${id}"] canvas`);
  const visiblePoint = async () => {
    const point = await readPoint(),
      bounds = await canvas.boundingBox();
    return point &&
      bounds &&
      point.x >= 8 &&
      point.y >= 8 &&
      point.x <= bounds.width - 8 &&
      point.y <= bounds.height - 8
      ? point
      : undefined;
  };
  if (!(await visiblePoint())) {
    await p
      .locator(`[data-view-id="${id}"]`)
      .getByRole('button', { name: 'Map layers', exact: true })
      .click();
    await p.getByRole('menuitem', { name: 'Overview', exact: true }).click();
    await expect.poll(async () => !!(await visiblePoint())).toBe(true);
  }
  const point = await visiblePoint();
  expect(point).toBeTruthy();
  await canvas.click({ position: { x: point!.x, y: point!.y } });
}
test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});
test('Fleet keyboard selection, one reusable Details, exact copying, close/reopen and unmanaged inspection', async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  let streams = 0;
  page.on('websocket', () => streams++);
  await page.goto(origin);
  await action(page, 'New demo');
  await page.locator('[data-activity-view="fleet"]').click();
  await expect(fleet(page).locator('.fleet-list > li')).toHaveCount(4);
  await expect(fleet(page)).toContainText('F-03');
  await expect(fleet(page)).toContainText('No position');
  await expect(fleet(page)).toContainText('No response');
  const checkbox = fleet(page).getByRole('checkbox', {
    name: 'Select F-01',
    exact: true,
  });
  await checkbox.focus();
  await page.keyboard.press('Space');
  await expect(checkbox).toBeFocused();
  await fleet(page)
    .getByRole('checkbox', { name: 'Select F-02', exact: true })
    .check();
  await expect(details(page)).toContainText('Follows selection · 2 selected');
  await expect(details(page).getByRole('heading', { level: 1 })).toHaveText(
    'F-01',
  );
  await expect(page.locator('[data-view^="inspector:"]')).toHaveCount(0);
  await expect(page.locator('.entity-summary')).toHaveCount(0);
  await expect(page.locator('.map-selection')).toHaveCount(0);
  await page.screenshot({ path: resolve(evidence, 'group-details.png') });
  const second = fleet(page).getByRole('checkbox', {
    name: 'Select F-02',
    exact: true,
  });
  await second.focus();
  await details(page)
    .getByRole('button', { name: 'Close Details', exact: true })
    .click();
  await expect(second).toBeFocused();
  await page.waitForTimeout(2400);
  await expect(
    page.getByRole('tab', { name: 'Details', exact: true }),
  ).toHaveCount(0);
  await expect(second).toBeChecked();
  await page.getByRole('button', { name: 'Open Details', exact: true }).click();
  await expect(details(page)).toContainText('2 selected');
  await details(page).getByText('Technical details', { exact: true }).click();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await details(page)
    .getByRole('button', { name: 'Copy Entity ID', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(details(page)).toContainText('Entity ID copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await details(page).getAttribute('data-entity-id'),
  );
  await details(page).getByText('Technical details', { exact: true }).click();
  await pick(page, ':O-01');
  await expect(details(page).getByRole('heading', { level: 1 })).toHaveText(
    'O-01',
  );
  await expect(details(page)).toContainText('Unmanaged');
  await expect(fleet(page).locator('.fleet-list > li')).toHaveCount(4);
  await page.screenshot({ path: resolve(evidence, 'unmanaged-details.png') });
  expect(streams).toBe(1);
  await action(page, 'End demo');
});
test('closing Details restores a visible tab when the original selection control is now hidden', async ({
  page,
}) => {
  await page.goto(origin);
  await load(page);
  await page.getByRole('button', { name: 'Open Tracks', exact: true }).click();
  await page
    .locator('.tracks-table tbody tr')
    .filter({ hasText: 'F-01' })
    .click();
  await expect(details(page).getByRole('heading', { level: 1 })).toHaveText(
    'F-01',
  );
  const mapTab = page.getByRole('tab', { name: 'Tactical Map', exact: true });
  await mapTab.click();
  await page.getByRole('tab', { name: 'Details', exact: true }).focus();
  await page.keyboard.press('Control+Delete');
  await expect(
    page.getByRole('tab', { name: 'Details', exact: true }),
  ).toHaveCount(0);
  await expect(mapTab).toBeFocused();
  await expect(page.locator('.tactical-view')).toHaveAttribute(
    'data-selection',
    /friendly-01$/,
  );
  await page.screenshot({
    path: resolve(evidence, 'close-from-hidden-origin.png'),
  });
});

test('Details reserves space beside both maps, collapses navigation first and docks below at 800 px', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(origin);
  await load(page);
  await page.locator('[data-activity-view="fleet"]').click();
  await fleet(page)
    .getByRole('button', { name: 'Inspect F-01', exact: true })
    .click();
  await tabAction(page, 'Tactical Map', 'New Tactical pane');
  await page
    .locator('[data-view-id="tactical:2"]')
    .getByRole('button', { name: '3D', exact: true })
    .click();
  await expect(
    page.locator('[data-view-id="tactical:2"] .map-status'),
  ).toContainText(/LOCAL GLOBE|CESIUM/, { timeout: 25000 });
  await page.waitForTimeout(1000);
  await pick(page, 'hostile-01', 'three-d', 'tactical:2');
  await expect(details(page).getByRole('heading', { level: 1 })).toHaveText(
    'H-01',
  );
  await expect(
    page.getByRole('tab', { name: 'Details', exact: true }),
  ).toHaveCount(1);
  const boxes = await page
    .locator('.tactical-view:visible')
    .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().right));
  expect((await details(page).boundingBox())!.x).toBeGreaterThanOrEqual(
    Math.max(...boxes),
  );
  await page.screenshot({ path: resolve(evidence, 'both-maps.png') });
  await tabAction(page, '3D Map 2', 'Close view');
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(
    page.getByRole('complementary', { name: 'Workspace navigation' }),
  ).toHaveCount(0);
  await page.screenshot({ path: resolve(evidence, 'narrow-right.png') });
  await page.setViewportSize({ width: 900, height: 800 });
  await expect
    .poll(() => details(page).evaluate((e) => e.scrollWidth <= e.clientWidth))
    .toBe(true);
  await expect(
    details(page).getByText('Speed', { exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: resolve(evidence, 'boundary-900.png') });
  await page.setViewportSize({ width: 800, height: 800 });
  await expect
    .poll(async () => {
      const d = await details(page).boundingBox(),
        m = await page.locator('.tactical-view').boundingBox();
      return d!.y >= m!.y + m!.height;
    })
    .toBe(true);
  await expect(
    details(page).getByRole('heading', { name: /^Telemetry/ }),
  ).toBeInViewport();
  await expect(
    details(page).getByText('Altitude', { exact: true }),
  ).toBeInViewport();
  await page.screenshot({ path: resolve(evidence, 'narrow-bottom.png') });
  const divider = page.getByRole('separator', { name: 'Resize', exact: true });
  await expect(divider).toHaveAttribute('aria-valuenow', /\d+/);
  const oldHeight = (await details(page).boundingBox())!.height;
  await divider.focus();
  await page.keyboard.press('ArrowUp');
  await expect
    .poll(async () => (await details(page).boundingBox())!.height)
    .toBeGreaterThan(oldHeight);
  const a11y = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(a11y.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth === innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 760, height: 800 });
  await page.locator('[data-activity-view="fleet"]').click();
  await expect(fleet(page)).toBeVisible();
  await expect
    .poll(() => details(page).evaluate((e) => e.scrollWidth <= e.clientWidth))
    .toBe(true);
  await details(page)
    .getByText('Speed', { exact: true })
    .scrollIntoViewIfNeeded();
  await expect(
    details(page).getByText('Speed', { exact: true }),
  ).toBeInViewport();
  await page.screenshot({
    path: resolve(evidence, 'narrow-fleet-reopened.png'),
  });
});
test('filtered, unlocated, missing, empty and disconnected states remain discoverable when panels close', async ({
  page,
}) => {
  let socket: WebSocketRoute | undefined,
    blocked = false;
  await page.routeWebSocket('**/api/missions/*/stream', (r) => {
    if (blocked) r.close();
    else {
      socket = r;
      r.connectToServer();
    }
  });
  await page.goto(origin);
  await load(page);
  await page.locator('[data-activity-view="fleet"]').click();
  await fleet(page)
    .getByRole('button', { name: 'Inspect F-01', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open Tracks', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search entities in all views' })
    .fill('no match');
  await expect(details(page)).toContainText('Hidden by shared filters');
  await expect(fleet(page)).toContainText('Filtered');
  await details(page).getByRole('button', { name: 'Reset filters' }).click();
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await page.getByRole('tab', { name: 'Tracks', exact: true }).click();
  await page
    .locator('.tracks-table tbody tr')
    .filter({ hasText: 'No position' })
    .first()
    .click();
  await expect(details(page)).toContainText('No position supplied');
  await details(page)
    .getByRole('button', { name: 'Clear selection', exact: true })
    .click();
  await expect(details(page)).toContainText('Select an entity in Fleet');
  await load(page, 'Alpha');
  await page.getByRole('button', { name: 'Open Tracks', exact: true }).click();
  if (
    !(await page
      .locator('.tracks-table tr[data-entity-id="fixture-alpha-object-04"]')
      .count())
  )
    await advanceFixture(page, 'fixture-alpha');
  await page
    .locator('.tracks-table tr[data-entity-id="fixture-alpha-object-04"]')
    .click();
  await advanceFixture(page, 'fixture-alpha');
  await expect(details(page)).toContainText('missing from the presented frame');
  await details(page).getByRole('button', { name: 'Close Details' }).click();
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  blocked = true;
  socket!.close();
  await expect(page.locator('.operational-attention')).toContainText(
    'Last committed state retained',
  );
  await page.screenshot({
    path: resolve(evidence, 'disconnected-panels-closed.png'),
  });
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(
    page.getByRole('tab', { name: 'Details', exact: true }),
  ).toHaveCount(0);
});

test('a later lifecycle acknowledgement stays visible after Move while the world is delayed', async ({
  page,
}) => {
  let hold = false,
    deliveredSequence = 0;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket('**/api/missions/*/stream', (socket) => {
    sockets.push(socket);
    const server = socket.connectToServer();
    server.onMessage((data) => {
      const message = JSON.parse(String(data));
      if (!hold) {
        if (typeof message.sequence === 'number')
          deliveredSequence = message.sequence;
        socket.send(data);
      } else if (message.type === 'heartbeat') {
        // Delay world updates without manufacturing newer presented state.
        socket.send(
          JSON.stringify({ ...message, sequence: deliveredSequence }),
        );
      }
    });
  });
  await page.goto(origin);
  await action(page, 'New demo');
  await page.locator('[data-activity-view="fleet"]').click();
  await fleet(page)
    .getByRole('button', { name: 'Inspect F-01', exact: true })
    .click();
  await expect(fleet(page).locator('.movement-toolbar')).toContainText(
    '1 selected \u00b7 1 available',
  );
  await expect(
    fleet(page).getByRole('button', { name: 'Move', exact: true }),
  ).toBeEnabled({ timeout: 15000 });
  const surface = page.locator('[data-view-id="tactical"] .map-canvas');
  const bounds = await surface.boundingBox();
  await surface.click({
    button: 'right',
    position: { x: bounds!.width * 0.62, y: bounds!.height * 0.58 },
  });
  await expect(
    page.getByRole('tab', { name: 'Activity', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Open Activity', exact: true })
    .click();
  const move = page.locator('[data-view="movement"]');
  await expect(move.locator('[data-execution-state="Running"]')).toHaveCount(1);
  await page.route('**/api/interactive/*/commands', async (route) => {
    if (route.request().postDataJSON().intent.action === 'pause') hold = true;
    await route.continue();
  });
  await action(page, 'Pause');
  await expect(page.locator('.operational-attention')).toContainText(
    'Received, awaiting world synchronization.',
  );
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await page.screenshot({
    path: resolve(evidence, 'lifecycle-awaiting-world.png'),
  });
  hold = false;
  sockets.forEach((socket) => socket.close());
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'paused',
    { timeout: 15000 },
  );
  await expect(
    page.getByText('Received, awaiting world synchronization.', {
      exact: true,
    }),
  ).toHaveCount(0);
  await action(page, 'End demo');
});
