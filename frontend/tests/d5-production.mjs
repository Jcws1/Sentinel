import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    tag: 'production',
    frontendPort: 5325,
    backendPort: 8125,
    previewDir: 'dist-d5-production',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      }),
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      }),
      page = await context.newPage();
    const report = { errors: [], cases: [] };
    page.on('pageerror', (e) => report.errors.push(e.name));
    try {
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'New demo', exact: true })
        .first()
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      await page
        .getByRole('button', { name: 'Pause', exact: true })
        .first()
        .click();
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await page.locator('[data-activity-view="fleet"]').click();
      await page
        .locator('.fleet-sidebar')
        .getByRole('checkbox', { name: 'Select F-01', exact: true })
        .check();
      await page
        .getByRole('button', { name: 'Simulated cockpit', exact: true })
        .click();
      await expect(page.locator('.cockpit-pane canvas')).toBeVisible();
      await expect(page.locator('.cockpit-state')).toHaveText(
        'Paused · frozen viewpoint',
      );
      expect(
        await page.evaluate(
          () =>
            !!globalThis.__sentinelCesiumTest ||
            !!globalThis.__sentinelMapTest ||
            !!globalThis.__sentinelRendererPoolTest,
        ),
      ).toBe(false);
      report.cases.push(
        'Built production cockpit operates; verification hooks absent',
      );
      await page.locator('.cockpit-options summary').click();
      await page.getByRole('slider', { name: 'Cockpit look pitch' }).focus();
      await page.keyboard.press('Home');
      await expect(
        page.getByText('SIMULATED VIEW · no video feed', { exact: true }),
      ).toBeInViewport();
      await page.screenshot({
        path: resolve(output, 'production-cockpit.png'),
      });
      for (const asset of [
        '/cesium/Assets/approximateTerrainHeights.json',
        '/cesium/Assets/IAU2006_XYS/IAU2006_XYS_0.json',
        '/edge-map/manifest.json',
      ]) {
        const r = await page.request.get(frontend + asset);
        report[asset] = {
          status: r.status(),
          contentType: r.headers()['content-type'],
        };
        expect(r.ok()).toBe(true);
        expect(r.headers()['content-type']).not.toContain('text/html');
      }
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page
        .getByRole('menuitem', { name: 'End demo', exact: true })
        .click();
      await page.locator('[data-run-state="ended"]').first().waitFor();
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      const fleetToggle = page.locator('[data-activity-view="fleet"]');
      if ((await fleetToggle.getAttribute('aria-expanded')) !== 'true')
        await fleetToggle.click();
      await page
        .locator('.fleet-sidebar')
        .getByRole('checkbox', { name: 'Select F-01', exact: true })
        .check();
      await page
        .getByRole('button', { name: 'Simulated cockpit', exact: true })
        .click();
      await expect(page.locator('.cockpit-state')).toHaveText(
        'Ended · frozen simulated viewpoint',
      );
      await expect(page.locator('.cockpit-pane canvas')).toBeVisible();
      report.cases.push(
        'Cold page reload → Previous demos → exact ended run → explicit cockpit rebind reads recorded pose',
      );
      await page.screenshot({
        path: resolve(output, 'recorded-ended-cockpit.png'),
      });
      report.passed = true;
    } catch (e) {
      report.failure = {
        name: e.name,
        message: e.message
          .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
          .slice(0, 1000),
      };
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      globalThis.console.log(JSON.stringify(report));
    }
  },
);
