import { test, expect, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { resolve } from 'node:path';
import {
  newDemo,
  fleetSelect,
  directClick,
  readWorld,
  endDemo,
} from './rtsActions';

const evidence = resolve('test-results/browser/compact-demo');
test.use({ trace: 'off' });
test.afterEach(async ({ page }) => {
  // Keep each real UI scenario independent if an assertion fails mid-demo.
  const simulation = page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first();
  if (await simulation.isVisible()) {
    await page.keyboard.press('Escape');
    await simulation.click();
    const end = page.getByRole('menuitem', { name: 'End demo', exact: true });
    if ((await end.count()) && (await end.isEnabled())) await end.click();
  }
});

test('compact chrome preserves direct commands, measured cruise, partial groups and accessible attention', async ({
  page,
  context,
}) => {
  test.setTimeout(80000);
  await page.setViewportSize({ width: 1600, height: 960 });
  await newDemo(page);
  await expect(page.locator('.simulation-run-state')).toHaveText('Running');
  await fleetSelect(page, ['F-01']);
  const details = page.locator('.selection-details');
  await expect(
    details.getByRole('heading', { name: 'F-01', exact: true }),
  ).toBeVisible();
  await expect(details.locator('.telemetry-grid')).toContainText('0 m/s');
  await expect(page.locator('.status-bar, .map-footer')).toHaveCount(0);
  expect(
    await page
      .locator('.workbench-body')
      .evaluate((e) => e.getBoundingClientRect().y),
  ).toBe(32);
  expect(await page.evaluate(() => document.fonts.check('12px Inter'))).toBe(
    true,
  );
  const run = await readWorld(page);
  expect(run.schemaVersion).toBe('1.10');
  expect(run.interactive?.templateId).toBe('singapore-local-v2');
  await directClick(page, 0.76, 0.3);
  await expect
    .poll(
      async () => (await readWorld(page)).interactive!.executions?.[0]?.state,
    )
    .toBe('Running');
  const moving = (await readWorld(page)).interactive!.executions![0];
  expect(moving.speedMps).toBe(155 / 3.6);
  await expect(details.locator('.telemetry-grid')).toContainText('155');
  await expect(details.locator('.details-state')).toHaveText('Moving');
  await expect(page.locator('.operational-attention')).toHaveCount(0);
  await page.screenshot({ path: resolve(evidence, 'desktop-moving.png') });

  await page
    .locator('.fleet-sidebar')
    .getByRole('button', { name: 'Stop selected', exact: true })
    .click();
  await expect
    .poll(async () => (await readWorld(page)).interactive!.executions![0].state)
    .toBe('Cancelled');
  await expect(details.locator('.telemetry-grid')).toContainText('0 m/s');
  await page.screenshot({ path: resolve(evidence, 'cancelled.png') });
  await fleetSelect(page, ['F-04', 'F-02']);
  await directClick(page, 0.72, 0.25);
  await expect
    .poll(
      async () =>
        (await readWorld(page)).interactive!.executions!.filter(
          (e) => e.state === 'Running',
        ).length,
    )
    .toBe(2);
  const attention = page.locator('.operational-attention');
  await expect(attention.getByRole('button')).toHaveAccessibleName(/1 skipped/);
  await attention.getByRole('button').click();
  await expect(page.getByRole('menu')).toContainText('1 skipped');
  await page.screenshot({
    path: resolve(evidence, 'group-skipped-attention.png'),
  });
  await page.keyboard.press('Escape');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await details.getByText('Technical details', { exact: true }).click();
  const copy = details.getByRole('button', {
    name: 'Copy Entity ID',
    exact: true,
  });
  await copy.focus();
  await page.keyboard.press('Enter');
  const entityId = await details.getAttribute('data-entity-id');
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(entityId);
  await details.getByText('Technical details', { exact: true }).click();
  await details.evaluate((e) => (e.scrollTop = 0));
  await details
    .getByRole('button', { name: 'Close Details', exact: true })
    .click();
  await expect(details).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Open Activity', exact: true })
    .click();
  await expect(page.locator('.movement-pane')).toContainText('1 skipped');
  await page.getByRole('button', { name: 'Open Details', exact: true }).click();
  await expect(details).toHaveAttribute('data-entity-id', entityId!);
  await expect(
    details.getByRole('heading', { name: 'F-01', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 820, height: 900 });
  await expect(page.locator('.views-sidebar')).toHaveCount(0);
  await expect(details.locator('.telemetry-section')).toBeInViewport();
  await page.screenshot({ path: resolve(evidence, 'narrow-details.png') });
  await page.locator('[data-activity-view="fleet"]').click();
  await page.screenshot({
    path: resolve(evidence, 'narrow-fleet-details.png'),
  });
  const shortcut = page.getByRole('button', {
    name: 'Keyboard shortcuts',
    exact: true,
  });
  await shortcut.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText(
    'Right-click destination',
  );
  await page.keyboard.press('Escape');
  await expect(shortcut).toBeFocused();
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  await endDemo(page);
});

test('connection failure stays noticeable with contextual panels closed and header alert restores keyboard focus', async ({
  page,
}) => {
  let connection: WebSocketRoute | undefined,
    blocked = false;
  await page.routeWebSocket('**/api/missions/*/stream', (ws) => {
    if (blocked) {
      ws.close({ code: 1011, reason: 'Test outage' });
      return;
    }
    connection = ws;
    ws.connectToServer();
  });
  await newDemo(page);
  await fleetSelect(page, ['F-01']);
  await page
    .getByRole('button', { name: 'Close Details', exact: true })
    .click();
  await page.getByRole('button', { name: 'Close navigation sidebar' }).click();
  blocked = true;
  connection!.close({ code: 1011, reason: 'Test outage' });
  const alert = page.locator('.attention-trigger');
  await expect(alert).toContainText('Connection lost');
  await alert.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toContainText(
    'Last committed state retained',
  );
  await page.screenshot({
    path: resolve(evidence, 'connection-attention.png'),
  });
  await page.keyboard.press('Escape');
  await expect(alert).toBeFocused();
  blocked = false;
  await page
    .getByRole('button', { name: 'Retry', exact: true })
    .first()
    .click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await endDemo(page);
});
