import { formatSgt } from '../../src/world/time';
import { loadFixture } from './actions';
import { advanceFixture, closeTab, unloadMission } from './actions';
import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { WorldFrame } from '../../src/contracts/generated';

const product = 'http://127.0.0.1:5181';
const evidence = resolve('test-results/browser/mission');
const command = (page: Page) => page.locator('[data-view="command"]');
async function assertCommandFrame(page: Page, frame: WorldFrame) {
  await expect(command(page).locator('[data-analytic-frame]')).toHaveAttribute(
    'data-analytic-frame',
    frame.frameId,
  );
  await expect(command(page).locator('.analytic-context')).toContainText(
    `As of source ${frame.effectiveAt} · recorded ${frame.recordedAt} · frame ${frame.sequence}`,
  );
  await expect(
    command(page).getByText(
      `${Object.keys(frame.entities).length} filtered / ${Object.keys(frame.entities).length} mission entities`,
      { exact: true },
    ),
  ).toBeVisible();
}
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
  const timeline = page.locator('[data-readout="timeline"]');
  await expect(timeline).toBeVisible();
  await assertCommandFrame(page, backendFrame);
  {
    const pane = timeline;
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
  await command(page)
    .getByRole('button', { name: 'Comparison', exact: true })
    .click();
  await command(page).getByLabel('Add to comparison').selectOption(entity.id);
  await command(page)
    .getByRole('button', { name: entity.label, exact: true })
    .click();
  await expect(timeline.locator('[data-field="selection"]')).toHaveText(
    entity.label,
  );
  await expect(
    command(page).getByRole('table').last().locator('tbody tr'),
  ).toHaveCount(1);
  await expect(command(page).getByRole('table').last()).toContainText(
    entity.label,
  );
  await expect(page.locator('.selection-details')).toContainText(entity.label);
  await advanceFixture(page, 'fixture-alpha');
  await expect(timeline.locator('[data-field="sequence"] dd span')).toHaveText(
    String(backendFrame.sequence + 1),
  );
  const updated = await (
    await page.request.get(`${product}/api/missions/fixture-alpha/world`)
  ).json();
  await expect(timeline.locator('[data-field="frame"] dd span')).toHaveText(
    updated.frameId,
  );
  await assertCommandFrame(page, updated);
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
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await assertCommandFrame(page, bravo);
  await expect(
    command(page).getByText(
      'Select entities from the maps, Fleet or the chooser above.',
    ),
  ).toBeVisible();
  await unloadMission(page);
  // Both inactive panes suspend subscriptions. Reveal each to check that it
  // catches up to the unload rather than expecting hidden work.
  await page
    .getByRole('button', { name: 'Open Timeline from Views', exact: true })
    .click();
  await expect(page.locator('[data-readout]')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .click();
  await expect(page.locator('[data-readout]')).toHaveCount(0);
  await expect(command(page).locator('[data-analytic-frame]')).toHaveCount(0);
  await expect(command(page)).toContainText(
    'Load a mission to inspect committed observations.',
  );
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
    .locator('[data-view="command"] [data-analytic-frame]')
    .getAttribute('data-analytic-frame');
  blocked = true;
  current!.close({ code: 1011, reason: 'Injected backend outage' });
  await expect(
    page.locator('[data-readout="timeline"] .stale-notice'),
  ).toBeVisible();
  await expect(command(page).locator('.analytic-context')).toContainText(
    '· stale',
  );
  await expect(
    page.getByRole('button', { name: 'Next fixture frame', exact: true }),
  ).toHaveCount(0);
  await expect(command(page).locator('[data-analytic-frame]')).toHaveAttribute(
    'data-analytic-frame',
    before!,
  );
  await page.screenshot({ path: resolve(evidence, 'stale-connection.png') });
  blocked = false;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(page.locator('.stale-notice')).toHaveCount(0);
  await expect(command(page).locator('.analytic-context')).toContainText(
    '· current',
  );
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
  const before: WorldFrame = await (
    await page.request.get(`${product}/api/missions/fixture-alpha/world`)
  ).json();
  await assertCommandFrame(page, before);
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

  await assertCommandFrame(page, before);
  await advanceFixture(page, 'fixture-alpha');
  const after: WorldFrame = await (
    await page.request.get(`${product}/api/missions/fixture-alpha/world`)
  ).json();
  expect(after.sequence).toBe(before.sequence + 1);
  await assertCommandFrame(page, after);
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
    await command(page)
      .getByRole('button', { name: 'Comparison', exact: true })
      .click();
    const choice = command(page).getByLabel('Add to comparison');
    await choice.selectOption({ index: 1 });
    await command(page)
      .getByRole('table')
      .last()
      .locator('tbody button')
      .first()
      .click();
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
