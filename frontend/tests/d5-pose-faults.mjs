import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  { tag: 'pose-faults', frontendPort: 5323, backendPort: 8123 },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const report = {
      cases: [],
      errors: [],
      deliveryFixture:
        'Read-only browser stream fault injection; backend stored frames are unchanged',
    };
    try {
      const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
        }),
        page = await context.newPage();
      let fault = 'none';
      await page.routeWebSocket('**/api/missions/*/stream', (client) => {
        const server = client.connectToServer();
        server.onMessage((raw) => {
          const data = JSON.parse(String(raw)),
            tracks =
              data.type === 'snapshot'
                ? data.frame.tracks
                : data.type === 'delta'
                  ? data.changes.tracks.upserts
                  : {};
          for (const t of Object.values(tracks))
            if (t.id.endsWith(':F-01:control')) {
              if (fault === 'missing-heading') delete t.latest.velocity;
              if (fault === 'supplied-heading')
                t.latest.velocity = {
                  ...t.latest.velocity,
                  headingTrueDeg: 42,
                };
              if (fault === 'msl')
                t.latest.position.altitude = {
                  metres: 150,
                  reference: 'MSL',
                  datumId: 'EGM96',
                };
              if (fault === 'datum')
                t.latest.position.altitude = {
                  metres: 150,
                  reference: 'ELLIPSOID',
                  datumId: 'unsupported-datum',
                };
            }
          client.send(JSON.stringify(data));
        });
      });
      page.on('pageerror', (e) => report.errors.push(e.name));
      await page.goto(frontend);
      fault = 'missing-heading';
      await page
        .getByRole('button', { name: 'New demo', exact: true })
        .first()
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      await page.locator('[data-activity-view="fleet"]').click();
      await page
        .locator('.fleet-sidebar')
        .getByRole('checkbox', { name: 'Select F-01', exact: true })
        .check();
      await page
        .getByRole('button', { name: 'Simulated cockpit', exact: true })
        .click();
      const c = page.locator('.cockpit-pane');
      await expect(c).toContainText('north default');
      report.cases.push(
        'Missing heading opens with explicitly labelled north default',
      );
      fault = 'supplied-heading';
      await expect(c).toContainText('42° true · supplied');
      fault = 'missing-heading';
      await expect(c).toContainText('42° true · last valid');
      report.cases.push(
        'Missing heading retains last supplied 42° for same binding',
      );
      await page.screenshot({ path: resolve(output, 'missing-heading.png') });
      fault = 'msl';
      await expect(c).toHaveAttribute('data-state', 'View unavailable');
      await expect(c).toContainText(
        'Unsupported cockpit altitude: MSL / EGM96',
      );
      await page.screenshot({ path: resolve(output, 'unsupported-msl.png') });
      fault = 'datum';
      await expect(c).toContainText('ELLIPSOID / unsupported-datum');
      report.cases.push(
        'Unsupported MSL and ellipsoid datum show unavailable instead of invented height',
      );
      fault = 'none';
      await expect(c).toHaveAttribute(
        'data-state',
        'Running · simulated viewpoint',
      );
      await page
        .getByRole('button', { name: 'Pause', exact: true })
        .first()
        .click();
      await expect(c).toHaveAttribute(
        'data-state',
        'Paused · frozen viewpoint',
      );
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                globalThis.__sentinelCesiumTest?.inspect('cockpit')?.retainable,
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      const hiddenAt = Date.now();
      const pool = () =>
        page.evaluate(() => globalThis.__sentinelRendererPoolTest.inspect());
      await expect
        .poll(
          async () =>
            (await pool()).leases.find((l) => l.role === 'cockpit')?.active,
        )
        .toBe(false);
      const before = await page.evaluate(
        () =>
          globalThis.__sentinelCesiumTest.inspect('cockpit').environment
            .renderedFrames,
      );
      await page.waitForTimeout(2000);
      expect(
        await page.evaluate(
          () =>
            globalThis.__sentinelCesiumTest.inspect('cockpit').environment
              .renderedFrames,
        ),
      ).toBe(before);
      await expect
        .poll(
          async () => (await pool()).leases.some((l) => l.role === 'cockpit'),
          { timeout: 125000, intervals: [5000] },
        )
        .toBe(false);
      report.actualExpiryWaitMs = Date.now() - hiddenAt;
      report.cases.push(
        'Real wall-time hidden suspension and 120-second expiry dispose cockpit',
      );
      await page
        .getByRole('tab', { name: 'Simulated cockpit', exact: true })
        .click();
      await expect
        .poll(
          () =>
            page.evaluate(
              () => globalThis.__sentinelCesiumTest.inspect('cockpit')?.ready,
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page
        .getByRole('menuitem', { name: 'End demo', exact: true })
        .click();
      await page.locator('[data-run-state="ended"]').first().waitFor();
      await context.close();
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
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      globalThis.console.log(JSON.stringify(report));
    }
  },
);
