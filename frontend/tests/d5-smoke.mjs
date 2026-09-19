import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { withD5Runtime } from './d5-runtime.mjs';
import process from 'node:process';
await withD5Runtime(
  { tag: process.argv[2] ?? 'smoke', configured: true },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const report = { errors: [], requests: {} };
    let page;
    try {
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      page = await context.newPage();
      page.setDefaultTimeout(30000);
      page.on('pageerror', (e) => report.errors.push(e.name));
      page.on('requestfailed', (r) => {
        const host = new globalThis.URL(r.url()).hostname;
        const code =
          r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED';
        if (host !== '127.0.0.1') {
          const key = `${host} ${code}`;
          report.requests[key] = (report.requests[key] ?? 0) + 1;
        }
      });
      page.on('response', (r) => {
        const host = new globalThis.URL(r.url()).hostname;
        if (host !== '127.0.0.1') {
          const key = `${host} HTTP ${r.status()}`;
          report.requests[key] = (report.requests[key] ?? 0) + 1;
        }
      });
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
      await expect
        .poll(
          () =>
            page.evaluate(
              () => globalThis.__sentinelCesiumTest?.inspect('cockpit')?.ready,
            ),
          { timeout: 45000 },
        )
        .toBe(true);
      await page.waitForTimeout(10000);
      report.standard = await page.evaluate(() =>
        globalThis.__sentinelCesiumTest.inspect('cockpit'),
      );
      await page.screenshot({ path: resolve(output, '01-standard.png') });
      await page
        .getByLabel('Cockpit environment', { exact: true })
        .selectOption('photorealistic');
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                globalThis.__sentinelCesiumTest?.inspect('cockpit')?.environment
                  .photoVisibleTiles,
            ),
          { timeout: 60000 },
        )
        .toBeGreaterThan(0);
      await page.waitForTimeout(6000);
      report.google = await page.evaluate(() =>
        globalThis.__sentinelCesiumTest.inspect('cockpit'),
      );
      await page.screenshot({ path: resolve(output, '02-google.png') });
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page
        .getByRole('menuitem', { name: 'End demo', exact: true })
        .click();
      await page.locator('[data-run-state="ended"]').first().waitFor();
      report.ended = true;
    } catch (e) {
      report.failure = {
        name: e.name,
        message: e.message
          .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
          .slice(0, 1000),
      };
      if (page) {
        await page
          .screenshot({ path: resolve(output, 'failure.png') })
          .catch(() => {});
        report.final = await page
          .evaluate(() => globalThis.__sentinelCesiumTest?.inspect('cockpit'))
          .catch(() => undefined);
      }
      process.exitCode = 1;
    } finally {
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      globalThis.console.log(
        JSON.stringify({
          ended: report.ended,
          errors: report.errors,
          failure: report.failure,
          standard: report.standard?.spatial,
          google: report.google?.spatial,
        }),
      );
    }
  },
);
