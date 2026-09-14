/* global process, console */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const folder = resolve('../docs/m1.1/evidence/production');
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const result = { streams: 0, pageErrors: [], checks: [] };
page.on('websocket', (socket) => {
  if (socket.url().endsWith('/stream')) result.streams++;
});
page.on('pageerror', (error) => result.pageErrors.push(error.name));
async function action(name) {
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  const item = page.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeEnabled({ timeout: 12_000 });
  await item.focus();
  await page.keyboard.press('Enter');
}
const capture = (name) =>
  page.screenshot({ path: resolve(folder, name + '.png') });
try {
  await page.goto(process.env.SENTINEL_CAPTURE_URL ?? 'http://127.0.0.1:5183');
  await page
    .getByRole('navigation', { name: 'Activity Bar' })
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .click();
  await action('New demo run');
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ready',
  );
  await action('Acquire control');
  await action('Start');
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await page.waitForTimeout(1500);
  await action('Pause');
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'paused',
  );
  await page.getByRole('button', { name: 'Fleet', exact: true }).click();
  await page.locator('.tracks-table tbody tr').first().focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('tab', { name: 'Tactical Map', exact: true })
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
  await expect(
    page.locator('.tactical-view:visible .map-status'),
  ).toContainText('LOCAL VECTOR', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await capture('desktop-fleet-map');
  result.checks.push(
    'Production local vector map, Fleet, selection and committed paused state',
  );
  await page.setViewportSize({ width: 1100, height: 800 });
  await capture('narrow-fleet-map');
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  await capture('narrow-simulation-menu');
  await page.keyboard.press('Escape');
  await action('Resume');
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await action('End');
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ended',
  );
  result.checks.push(
    'Resume and End through keyboard menu; recording retained',
  );
  expect(result.streams).toBe(1);
  expect(result.pageErrors).toEqual([]);
  console.log(
    'Production operator captures verified; one stream, no page errors.',
  );
} finally {
  await writeFile(
    resolve(folder, 'checks.json'),
    JSON.stringify(result, null, 2),
  );
  await browser.close();
}
