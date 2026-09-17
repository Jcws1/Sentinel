import console from 'node:console';
import { chromium, expect } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 960 },
  });
  await page.goto('http://127.0.0.1:5190');
  await page
    .getByRole('button', { name: 'New demo', exact: true })
    .first()
    .click();
  await page.locator('[data-run-state="running"]').first().waitFor();
  await page.locator('[data-activity-view="fleet"]').click();
  await page
    .getByRole('checkbox', { name: 'Select F-01', exact: true })
    .check();
  await page
    .locator('.entity-details h1')
    .filter({ hasText: 'F-01' })
    .waitFor();
  await expect(page.locator('.status-bar, .map-footer')).toHaveCount(0);
  await expect(page.locator('.workbench-body')).toHaveCSS('height', '928px');
  const canvas = page.locator('.tactical-view canvas').first();
  const box = await canvas.boundingBox();
  await canvas.click({
    button: 'right',
    position: { x: box.width * 0.64, y: box.height * 0.6 },
  });
  await expect(page.locator('.telemetry-grid')).toContainText('155');
  await page.screenshot({
    path: '../docs/compact-demo/evidence/after-desktop.png',
  });
  await page.locator('.profile-details > summary').click();
  await page.locator('.profile-details').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: '../docs/compact-demo/evidence/after-profile.png',
  });
  await page.locator('.profile-details > summary').click();
  await page.locator('.entity-details').evaluate((e) => (e.scrollTop = 0));
  await page.setViewportSize({ width: 820, height: 900 });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: '../docs/compact-demo/evidence/after-narrow.png',
  });
  await page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'End demo', exact: true }).click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'ended',
  );
  console.log(
    'New profile moved at 155 km/h; desktop/profile/narrow screenshots saved.',
  );
} finally {
  await browser.close();
}
