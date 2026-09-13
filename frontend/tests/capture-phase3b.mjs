/* global window, console, process, URL, document, innerWidth */
import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const dir = resolve('../docs/phase3b/evidence/final');
await mkdir(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const result = {
  production: true,
  streams: 0,
  histories: 0,
  pageErrors: [],
  providerErrors: [],
  providerStates: {},
};
page.on('websocket', (s) => {
  if (s.url().includes('/stream')) result.streams++;
});
page.on('request', (r) => {
  if (r.url().includes('/observed-history')) result.histories++;
});
page.on('pageerror', (e) => result.pageErrors.push(e.name));
page.on('response', (r) => {
  if (r.status() >= 400)
    result.providerErrors.push({
      host: new URL(r.url()).hostname,
      status: r.status(),
    });
});
const map = () => page.locator('.tactical-view:visible');
const capture = (name) =>
  page.screenshot({ path: resolve(dir, `${name}.png`) });
try {
  await page.goto(process.env.SENTINEL_CAPTURE_URL ?? 'http://127.0.0.1:5232');
  expect(await page.evaluate(() => '__sentinelMapTest' in window)).toBe(false);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Synthetic Observations', exact: true })
    .click();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
  await expect(map().locator('.map-status')).toContainText('LOCAL VECTOR', {
    timeout: 45000,
  });
  await page
    .getByRole('navigation', { name: 'Activity Bar' })
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .click();
  await expect(page.locator('.tracks-table tbody tr')).toHaveCount(6);
  await capture('tracks');
  await page
    .getByRole('searchbox', { name: 'Search entities in all views' })
    .fill('F-01');
  await page.locator('.tracks-table tbody tr').first().focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.entity-summary:visible')).toContainText(
    '150 m MSL',
  );
  await capture('tracks-summary');
  await page.getByRole('button', { name: 'Open Details', exact: true }).click();
  await page
    .getByRole('button', { name: 'Show observed trail', exact: true })
    .click();
  await expect(page.locator('.trail-readout')).toContainText(
    '8 observations · 3 segments',
  );
  await capture('inspector');
  await page
    .getByRole('tab', { name: 'Details · F-01', exact: true })
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
  await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
  await expect(map().locator('.map-status')).toContainText('LOCAL VECTOR', {
    timeout: 45000,
  });
  await page.waitForTimeout(4500);
  await expect(map().locator('.map-trail-status')).toContainText(
    '8 recorded observations',
  );
  result.providerStates.tactical = await map()
    .locator('.map-status')
    .innerText();
  await capture('tactical-details');
  await map().getByRole('button', { name: '3D', exact: true }).click();
  await expect(map().locator('.map-status')).toContainText(
    'CESIUM ION · STANDARD',
    { timeout: 60000 },
  );
  await page.waitForTimeout(8000);
  result.providerStates.standard = await map()
    .locator('.map-status')
    .innerText();
  await expect(map().locator('.map-trail-status')).toContainText(
    '8 recorded observations',
  );
  await capture('cesium-standard-details');
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.waitForTimeout(1500);
  await capture('cesium-standard-narrow');
  await page.setViewportSize({ width: 1680, height: 1050 });
  await map().getByRole('button', { name: 'Map layers', exact: true }).click();
  const google = page.getByRole('menuitemradio', {
    name: /Google photorealistic/,
  });
  result.googleAvailable = await google.isEnabled();
  if (result.googleAvailable) {
    await google.click();
    await page.keyboard.press('Escape');
    await expect(map().locator('.map-status')).toContainText(
      'GOOGLE PHOTOREALISTIC',
      { timeout: 60000 },
    );
    await page.waitForTimeout(12000);
    result.providerStates.google = await map()
      .locator('.map-status')
      .innerText();
    await capture('cesium-google-details');
    await expect(map()).toHaveAttribute(
      'data-selection',
      'fixture-observations-friendly-01',
    );
    await expect(map().locator('.map-trail-status')).toContainText(
      '8 recorded observations',
    );
    await page.setViewportSize({ width: 1100, height: 760 });
    await page.waitForTimeout(2000);
    await capture('cesium-google-narrow');
  } else await page.keyboard.press('Escape');
  expect(result.streams).toBe(1);
  expect(result.histories).toBe(1);
  expect(result.pageErrors).toEqual([]);
  result.documentOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  expect(result.documentOverflow).toBe(false);
  result.completed = true;
} catch (error) {
  result.completed = false;
  result.failure = error.name;
  await capture('failure');
  throw error;
} finally {
  await writeFile(
    resolve(dir, 'production-checks.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
  await browser.close();
}
