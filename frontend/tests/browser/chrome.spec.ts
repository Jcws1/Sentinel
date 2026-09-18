import { loadFixture } from './actions';
import {
  test,
  expect,
  type Locator,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { closeTab, tabAction, unloadMission } from './actions';

const product = 'http://127.0.0.1:5181';
const evidence = resolve(
  '../docs/d4-refinement/regressions/d4/regressions/chrome',
);
const tab = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true });

async function load(page: Page, name = 'Synthetic Tactical') {
  await loadFixture(page, name);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(page.locator('.map-canvas canvas')).toBeVisible();
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector)!;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    };
    return {
      header: box('.app-header'),
      activity: box('.activity-bar'),
      mission: box('.mission-controls'),
      canvas: box('.map-canvas canvas'),
      tabs: box('[role="tablist"]'),
      clock: box('.wall-clock'),
      toolbar: box('.map-tools'),
      dpr: devicePixelRatio,
      overflow:
        document.documentElement.scrollWidth > innerWidth ||
        document.documentElement.scrollHeight > innerHeight,
    };
  });
}

async function reachable(control: Locator) {
  await expect(control).toBeVisible();
  await expect
    .poll(() =>
      control.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const clipped =
          bounds.left < 0 ||
          bounds.top < 0 ||
          bounds.right > innerWidth ||
          bounds.bottom > innerHeight;
        const hit = document.elementFromPoint(
          bounds.left + bounds.width / 2,
          bounds.top + bounds.height / 2,
        );
        return !clipped && !!hit && (hit === element || element.contains(hit));
      }),
    )
    .toBe(true);
}

async function shortcutsAreUsable(page: Page) {
  const button = page.getByRole('button', {
    name: 'Keyboard shortcuts',
    exact: true,
  });
  await reachable(button);
  const measured = await button.evaluate((element) => ({
    rail: element.closest('nav')!.getBoundingClientRect().toJSON(),
    bounds: element.getBoundingClientRect().toJSON(),
  }));
  expect(measured.bounds.bottom).toBeLessThanOrEqual(measured.rail.bottom);
  expect(measured.bounds.top).toBeGreaterThanOrEqual(measured.rail.top);
  expect(measured.bounds.right).toBeLessThanOrEqual(measured.rail.right);
  await button.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  return measured;
}

test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});

test('compact header reclaims map space with a single mission breadcrumb and no pane heading', async ({
  page,
}) => {
  const baseline = JSON.parse(
    await readFile(
      resolve(
        '../docs/d4-refinement/regressions/chrome-refinement/before-geometry.json',
      ),
      'utf8',
    ),
  );
  const measurements = [];
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(product);
    await load(page);
    await expect(page.locator('.pane-toolbar')).toHaveCount(0);
    await expect(page.locator('.mission-controls')).toHaveCount(1);
    await expect(page.locator('.app-header .mission-controls')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Next fixture frame', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.app-header')).toContainText('Missions');
    await expect(page.locator('.app-header')).not.toContainText('SYNTHETIC');
    const current = await geometry(page);
    const before = baseline.find(
      (entry: { viewport: { width: number } }) =>
        entry.viewport.width === viewport.width,
    );
    expect(current.header.height).toBeLessThan(before.header.height);
    expect(current.activity.width).toBeLessThan(before.activity.width);
    expect(current.canvas.height - before.canvas.height).toBeGreaterThanOrEqual(
      70,
    );
    expect(current.canvas.y).toBeLessThan(before.canvas.y - 65);
    expect(
      current.toolbar.y - (current.tabs.y + current.tabs.height),
    ).toBeLessThan(4);
    expect(current.mission.y + current.mission.height).toBeLessThanOrEqual(
      current.header.height,
    );
    expect(current.mission.x + current.mission.width).toBeLessThanOrEqual(
      current.clock.x,
    );
    expect(current.overflow).toBe(false);
    measurements.push({
      viewport,
      ...current,
      mapHeightGain: current.canvas.height - before.canvas.height,
    });
    await page.screenshot({
      path: resolve(evidence, `after-${viewport.width}.png`),
    });
  }
  await writeFile(
    resolve(evidence, 'after-geometry.json'),
    JSON.stringify(measurements, null, 2),
  );
});

test('inactive tab context commands and keyboard menu focus target the requested view', async ({
  page,
}) => {
  await page.goto(product);
  const tactical = tab(page, 'Tactical Map');
  const command = tab(page, 'Command Picture');
  await expect(tactical).toHaveAttribute('aria-selected', 'true');
  await command.click({ button: 'right' });
  await expect(
    page.getByRole('menu', {
      name: 'Command Picture tab actions',
      exact: true,
    }),
  ).toBeVisible();
  await expect(command).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('Escape');
  await expect(command).toBeFocused();
  await expect(tactical).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Shift+F10');
  await expect(
    page.getByRole('menuitem', { name: 'Open to Side', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tablist')).toHaveCount(2);
  await expect(command).toBeFocused();
  await expect(
    page.getByRole('region', { name: 'Command Picture view', exact: true }),
  ).toBeVisible();
  await command.press('ContextMenu');
  await expect(
    page.getByRole('menu', {
      name: 'Command Picture tab actions',
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'tab-context-keyboard.png'),
  });
  await page.getByRole('menuitem', { name: 'Close view', exact: true }).click();
  await expect(command).toHaveCount(0);
  await expect(tactical).toBeFocused();
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await expect(command).toHaveAttribute('aria-selected', 'true');
  await closeTab(page, 'Tactical Map');
  await expect(tactical).toHaveCount(0);
  await expect(command).toBeFocused();
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await expect(tactical).toBeFocused();
  await expect(tactical.getByTitle('Close')).toBeVisible();
});

test('long backend mission names remain accessible without clock collision or overflow', async ({
  page,
}) => {
  const longName =
    'Synthetic Tactical — Northern Maritime Coordination and Contingency Operations — extended mission label for layout verification';
  let blocked = false;
  let connection: WebSocketRoute | undefined;
  await page.route('**/api/missions', async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    catalog.missions.find(
      (mission: { id: string }) => mission.id === 'fixture-tactical',
    ).name = longName;
    await route.fulfill({ response, json: catalog });
  });
  await page.routeWebSocket(
    '**/api/missions/fixture-tactical/stream',
    (route) => {
      if (blocked) {
        route.close({ code: 1011, reason: 'Deliberate narrow-layout outage' });
        return;
      }
      connection = route;
      const server = route.connectToServer();
      server.onMessage((raw) => {
        const message = JSON.parse(String(raw));
        if (message.type === 'snapshot') message.frame.mission.name = longName;
        route.send(JSON.stringify(message));
      });
    },
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(product);
  await load(page, longName);
  const trigger = page.getByRole('button', {
    name: 'Load mission',
    exact: true,
  });
  await expect(trigger).toHaveAccessibleDescription(
    new RegExp('Northern Maritime Coordination'),
  );
  const dimensions = await geometry(page);
  expect(dimensions.mission.x + dimensions.mission.width).toBeLessThanOrEqual(
    dimensions.clock.x,
  );
  expect(dimensions.overflow).toBe(false);
  await trigger.click();
  await page
    .getByRole('menuitem', { name: 'Developer fixtures', exact: true })
    .focus();
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('menuitem', { name: longName, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve(evidence, 'long-mission-menu-1024.png'),
  });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 760, height: 760 });
  const connectedFooter = await shortcutsAreUsable(page);
  await page.screenshot({
    path: resolve(evidence, 'long-mission-footer-760.png'),
  });
  blocked = true;
  connection!.close({ code: 1011, reason: 'Deliberate narrow-layout outage' });
  await expect(page.locator('.connection-state')).toHaveText('STALE');
  const staleFooter = await shortcutsAreUsable(page);
  const staleGeometry = await geometry(page);
  expect(
    staleGeometry.mission.x + staleGeometry.mission.width,
  ).toBeLessThanOrEqual(staleGeometry.clock.x);
  await page.screenshot({
    path: resolve(evidence, 'long-mission-stale-footer-760.png'),
  });
  await writeFile(
    resolve(evidence, 'footer-reachability-760.json'),
    JSON.stringify({ connectedFooter, staleFooter }, null, 2),
  );
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await unloadMission(page);
  await expect(page.locator('.app-header')).toContainText('No mission');
  await expect(page.locator('.app-header')).not.toContainText('SYNTHETIC');
  await expect(page.locator('.mission-status')).toContainText(
    'No mission loaded',
  );
});

test('shrinking three existing panes to 760px keeps every map control reachable and session context intact', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto('http://127.0.0.1:5182');
  await load(page);
  await tabAction(page, 'Tactical Map', 'Open to Side');
  await tabAction(page, 'Tactical Map', 'New Tactical pane');
  const maps = page.locator('.tactical-view');
  await expect(page.getByRole('tablist')).toHaveCount(3);
  await expect(maps).toHaveCount(2);
  const inspect = () =>
    page.evaluate(() => {
      const probe = (
        window as unknown as {
          __sentinelMapTest: {
            inspect(id: string): {
              ready: boolean;
              frameId?: string;
              camera: { center: { longitudeDeg: number; latitudeDeg: number } };
              points: { id: string; x: number; y: number }[];
            };
            stats(): { active: number };
          };
        }
      ).__sentinelMapTest;
      return {
        maps: ['tactical', 'tactical:2'].map((id) => probe.inspect(id)),
        stats: probe.stats(),
      };
    });
  await expect
    .poll(async () => (await inspect()).maps.every((map) => map.ready))
    .toBe(true);
  await maps.first().locator('canvas').focus();
  await page.keyboard.press(']');
  await page.keyboard.press('Enter');
  const selected = await maps.first().getAttribute('data-selection');
  expect(selected).toMatch(/^fixture-tactical-/);
  const before = await inspect();
  await page.setViewportSize({ width: 760, height: 760 });
  await expect
    .poll(async () => (await inspect()).maps.every((map) => map.ready))
    .toBe(true);
  const narrow = await inspect();
  expect(narrow.stats.active).toBe(2);
  expect(streams).toBe(1);
  for (const map of await maps.all())
    await expect(map).toHaveAttribute('data-selection', selected!);
  const workspaceScroll = page.getByRole('region', {
    name: 'Workspace panes',
    exact: true,
  });
  await expect(workspaceScroll).toHaveAttribute('tabindex', '0');
  await workspaceScroll.focus();
  const scrollBefore = await workspaceScroll.evaluate((element) => ({
    left: element.scrollLeft,
    maximum: element.scrollWidth - element.clientWidth,
  }));
  expect(scrollBefore.maximum).toBeGreaterThan(0);
  await page.keyboard.press(
    scrollBefore.left < scrollBefore.maximum / 2 ? 'ArrowRight' : 'ArrowLeft',
  );
  await expect
    .poll(() => workspaceScroll.evaluate((element) => element.scrollLeft))
    .not.toBe(scrollBefore.left);
  for (let index = 0; index < 2; index++) {
    expect(narrow.maps[index].frameId).toBe(before.maps[index].frameId);
    expect(narrow.maps[index].camera.center.longitudeDeg).toBeCloseTo(
      before.maps[index].camera.center.longitudeDeg,
      5,
    );
    expect(narrow.maps[index].camera.center.latitudeDeg).toBeCloseTo(
      before.maps[index].camera.center.latitudeDeg,
      5,
    );
    const map = maps.nth(index);
    for (const name of ['Select', 'Pan', 'Recenter', 'Map layers']) {
      const control = map.getByRole('button', { name, exact: true });
      await control.focus();
      await expect(control).toBeFocused();
      await reachable(control);
    }
    await map.getByRole('button', { name: 'Recenter', exact: true }).click();
    const layers = map.getByRole('button', { name: 'Map layers', exact: true });
    await layers.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Zones', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(layers).toBeFocused();
    const id = `fixture-tactical-${index === 0 ? 'hostile' : 'neutral'}-01`;
    // Clear from the shared Details pane; the map surface stays unobscured.
    await page
      .locator('.selection-details')
      .getByRole('button', { name: 'Clear selection', exact: true })
      .click();
    // Details can scroll the overflowing workbench; reveal this canvas before picking.
    await map.locator('canvas').scrollIntoViewIfNeeded();
    await expect
      .poll(async () => (await inspect()).maps[index].ready)
      .toBe(true);
    const point = (await inspect()).maps[index].points.find(
      (point) => point.id === id,
    )!;
    await map.locator('canvas').click({ position: { x: point.x, y: point.y } });
    for (const shared of await maps.all())
      await expect(shared).toHaveAttribute('data-selection', id);
    await page.screenshot({
      path: resolve(evidence, `three-panes-760-map-${index + 1}.png`),
    });
  }
  await page.screenshot({ path: resolve(evidence, 'three-panes-760.png') });
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const map of await maps.all())
    await reachable(
      map.getByRole('button', { name: 'Map layers', exact: true }),
    );
  expect(streams).toBe(1);
  await writeFile(
    resolve(evidence, 'three-pane-reachability.json'),
    JSON.stringify({ before, narrow, streams }, null, 2),
  );
});

for (const scale of [1.25, 2]) {
  test(`compact controls and source logo remain legible at device scale ${scale}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: scale,
    });
    const page = await context.newPage();
    await page.goto(product);
    await load(page);
    await tabAction(page, 'Tactical Map', 'New Tactical pane');
    await expect(page.locator('.map-canvas canvas')).toHaveCount(2);
    const dims = await geometry(page);
    expect(dims.dpr).toBe(scale);
    expect(dims.overflow).toBe(false);
    const logo = await page.locator('.brand-logo img').evaluate((image) => {
      const element = image as HTMLImageElement;
      return {
        loaded: element.complete,
        naturalWidth: element.naturalWidth,
        displayed: element.getBoundingClientRect().width,
        source: element.currentSrc,
      };
    });
    expect(logo.loaded).toBe(true);
    expect(logo.naturalWidth).toBeGreaterThanOrEqual(logo.displayed * scale);
    const map = page.locator('.tactical-view').first();
    await map.getByRole('button', { name: 'Map layers', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('menuitemcheckbox', { name: 'Zones', exact: true }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      map.getByRole('button', { name: 'Map layers', exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: resolve(evidence, `display-scale-${scale}.png`),
    });
    await writeFile(
      resolve(evidence, `display-scale-${scale}.json`),
      JSON.stringify({ dimensions: dims, logo }, null, 2),
    );
    await context.close();
  });
}
