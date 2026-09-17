import console from 'node:console';
import { chromium } from '@playwright/test';
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
  const canvas = page.locator('.tactical-view canvas').first();
  const box = await canvas.boundingBox();
  await canvas.click({
    button: 'right',
    position: { x: box.width * 0.64, y: box.height * 0.6 },
  });
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: '../docs/compact-demo/evidence/before-desktop.png',
  });
  await page.setViewportSize({ width: 820, height: 900 });
  await page.waitForTimeout(800);
  await page.screenshot({
    path: '../docs/compact-demo/evidence/before-narrow.png',
  });
  await page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first()
    .click();
  await page.getByRole('menuitem', { name: 'End demo', exact: true }).click();
  console.log('Captured desktop and narrow baseline; isolated demo ended.');
} finally {
  await browser.close();
}
