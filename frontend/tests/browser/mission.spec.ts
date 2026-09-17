import { formatSgt } from '../../src/world/time';
import { loadFixture } from './actions';
import { advanceFixture, closeTab, unloadMission } from './actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const product = 'http://127.0.0.1:5181';
const evidence = resolve(
  '../docs/d2/regressions/evidence/regressions/regressions/regressions',
);
async function load(page: Page, missionId: string) {
  const catalog = await (
    await page.request.get(`${product}/api/missions`)
  ).json();
  const mission = catalog.missions.find(
    (item: { id: string }) => item.id === missionId,
  );
  await loadFixture(page, mission.name);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
}
async function split(page: Page, title: string) {
  await page
    .getByRole('button', { name: `${title} options`, exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
}
test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});

test('backend committed frame and selection are shared without pane subscriptions', async ({
  page,
}) => {
  let streams = 0;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('websocket', (socket) => {
    if (socket.url().includes('/api/missions/')) streams++;
  });
  await page.goto(product);
  expect(streams).toBe(0);
  await load(page, 'fixture-alpha');
  const backendFrame = await (
    await page.request.get(`${product}/api/missions/fixture-alpha/world`)
  ).json();
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await split(page, 'Timeline');
  const panes = page.locator('[data-readout]:visible');
  await expect(panes).toHaveCount(2);
  for (const pane of await panes.all()) {
    await expect(pane.locator('[data-field="frame"] dd span')).toHaveText(
      backendFrame.frameId,
    );
    await expect(pane.locator('[data-field="effective-time"]')).toHaveText(
      formatSgt(backendFrame.effectiveAt, { date: true }),
    );
    await expect(pane.locator('[data-field="entity-count"]')).toHaveText(
      String(Object.keys(backendFrame.entities).length),
    );
  }
  const entity = Object.values(backendFrame.entities)[0] as {
    id: string;
    label: string;
  };
  await panes
    .first()
    .getByRole('button', { name: `Select ${entity.label}`, exact: true })
    .click();
  await expect(panes.locator('[data-field="selection"]')).toHaveText([
    entity.label,
    entity.label,
  ]);
  await advanceFixture(page, 'fixture-alpha');
  await expect(panes.locator('[data-field="sequence"] dd span')).toHaveText([
    String(backendFrame.sequence + 1),
    String(backendFrame.sequence + 1),
  ]);
  const updated = await (
    await page.request.get(`${product}/api/missions/fixture-alpha/world`)
  ).json();
  await expect(panes.locator('[data-field="frame"] dd span')).toHaveText([
    updated.frameId,
    updated.frameId,
  ]);
  await closeTab(page, 'Timeline');
  await page
    .getByRole('button', {
      name: 'Open Timeline from Views',
      exact: true,
    })
    .click();
  await expect(
    page.locator('[data-readout="timeline"] [data-field="selection"]'),
  ).toHaveText(entity.label);
  expect(streams).toBe(1);
  await load(page, 'fixture-bravo');
  await expect(
    page.locator('[data-readout]:visible [data-field="selection"]'),
  ).toHaveText('None');
  const bravo = await (
    await page.request.get(`${product}/api/missions/fixture-bravo/world`)
  ).json();
  await expect(
    page.locator('[data-readout]:visible [data-field="frame"] dd span'),
  ).toHaveText(bravo.frameId);
  expect(streams).toBe(2);
  await unloadMission(page);
  await expect(page.locator('[data-readout]')).toHaveCount(0);
  await expect(page.locator('.mission-status')).toContainText(
    'No mission loaded',
  );
  expect(errors).toEqual([]);
});

test('connection failure keeps a visibly stale complete frame; retry obtains a fresh snapshot', async ({
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
  await page.goto(product);
  await load(page, 'fixture-alpha');
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await split(page, 'Timeline');
  const before = await page
    .locator('[data-readout="command"]')
    .getAttribute('data-frame-id');
  blocked = true;
  current!.close({ code: 1011, reason: 'Injected backend outage' });
  await expect(page.locator('.stale-notice')).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: 'Next fixture frame', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('[data-readout="command"]')).toHaveAttribute(
    'data-frame-id',
    before!,
  );
  await page.screenshot({ path: resolve(evidence, 'stale-connection.png') });
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(page.locator('.stale-notice')).toHaveCount(0);
  await advanceFixture(page, 'fixture-alpha');
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
});

test('catalog failure is visible and recoverable before a mission is loaded', async ({
  page,
}) => {
  await page.route('**/api/missions', (route) =>
    route.fulfill({
      status: 503,
      body: '{"detail":"unavailable"}',
      contentType: 'application/json',
    }),
  );
  await page.goto(product);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await expect(
    page.getByText('Backend unavailable', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mission-error')).toBeVisible();
  await page.unroute('**/api/missions');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.mission-error')).toHaveCount(0);
  await load(page, 'fixture-alpha');
});

test('Retry recovers the failed operation when a mission is already loaded', async ({
  page,
}) => {
  await page.goto(product);
  await load(page, 'fixture-alpha');
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  const before = await page
    .locator('[data-readout="command"]')
    .getAttribute('data-sequence');
  await page.route('**/api/missions', (route) =>
    route.fulfill({
      status: 503,
      body: '{"detail":"catalog offline"}',
      contentType: 'application/json',
    }),
  );
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await expect(
    page.getByText('Backend unavailable', { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await page.unroute('**/api/missions');
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.mission-error')).toHaveCount(0);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');

  await expect(page.locator('[data-readout="command"]')).toHaveAttribute(
    'data-sequence',
    before!,
  );
  await advanceFixture(page, 'fixture-alpha');
  await expect(page.locator('[data-readout="command"]')).toHaveAttribute(
    'data-sequence',
    String(Number(before) + 1),
  );
});

for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]) {
  test(`approved shell with real fixture readouts at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(product);
    await load(page, 'fixture-alpha');
    await page
      .getByRole('button', { name: 'Open Command Picture', exact: true })
      .click();
    await split(page, 'Timeline');
    await page.locator('[data-readout="command"] tbody button').first().click();
    await expect(
      page
        .locator('.app-header')
        .getByRole('button', { name: 'Load mission', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.wall-clock')).toContainText('SGT');
    await expect(page.locator('.mission-controls')).not.toContainText(
      'SYNTHETIC',
    );
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth === innerWidth &&
          document.documentElement.scrollHeight === innerHeight,
      ),
    ).toBe(true);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await writeFile(
      resolve(evidence, `accessibility-fixture-${viewport.width}.json`),
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
      path: resolve(evidence, `fixture-split-${viewport.width}.png`),
    });
  });
}
