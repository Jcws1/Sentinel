/* global document, devicePixelRatio -- evaluated only inside the browser page. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve('../docs/chrome-refinement');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const measurements = [];
try {
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto('http://127.0.0.1:5191');
    await page
      .getByRole('button', { name: 'Load mission', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: 'Synthetic Tactical', exact: true })
      .click();
    await page
      .locator('.connection-state')
      .filter({ hasText: 'CONNECTED' })
      .waitFor();
    await page.locator('.map-canvas canvas').waitFor();
    await page.waitForTimeout(1500);
    const bounds = await page.evaluate(() => {
      const box = (selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const { x, y, width, height } = element.getBoundingClientRect();
        return { x, y, width, height };
      };
      return {
        header: box('.app-header'),
        activity: box('.activity-bar'),
        mission: box('.mission-controls'),
        paneToolbar: box('.pane-toolbar'),
        canvas: box('.map-canvas canvas'),
        tabs: box('[role="tablist"]'),
        dpr: devicePixelRatio,
      };
    });
    measurements.push({ viewport, ...bounds });
    await page.screenshot({
      path: resolve(evidence, `before-${viewport.width}.png`),
    });
    await page.close();
  }
  await writeFile(
    resolve(evidence, 'before-geometry.json'),
    JSON.stringify(measurements, null, 2),
  );
} finally {
  await browser.close();
}
