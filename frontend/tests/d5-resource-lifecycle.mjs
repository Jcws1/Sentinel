import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  { tag: 'resource-lifecycle', frontendPort: 5324, backendPort: 8124 },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const report = { cases: [], errors: [] };
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => report.errors.push(e.name));
    const inspect = () =>
      page.evaluate(() => ({
        cockpit: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
      }));
    const action = async (name) => {
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const tab = async (name, act) => {
      await page
        .getByRole('tab', { name, exact: true })
        .click({ button: 'right' });
      await page.getByRole('menuitem', { name: act, exact: true }).click();
    };
    const world = async () => {
      try {
        const r = await page.request.get(`${frontend}/api/interactive/entry`);
        if (!r.ok()) return;
        const entry = await r.json();
        if (!entry.activeMissionId) return;
        const response = await page.request.get(
          `${frontend}/api/missions/${entry.activeMissionId}/world`,
        );
        return response.ok() ? await response.json() : undefined;
      } catch {
        return;
      }
    };
    try {
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'New demo', exact: true })
        .first()
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      await action('Pause');
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
        .poll(async () => (await inspect()).cockpit?.ready)
        .toBe(true);
      const before = await world(),
        anchor = (await inspect()).cockpit.cockpit.actualPosition;
      await restartBackend();
      await expect
        .poll(async () => (await world())?.interactive.executorEpoch, {
          timeout: 30000,
        })
        .not.toBe(before.interactive.executorEpoch);
      await expect
        .poll(async () => !!(await world())?.interactive.executorEpoch, {
          timeout: 30000,
        })
        .toBe(true);
      await expect(page.locator('.connection-state')).toHaveText('CONNECTED', {
        timeout: 30000,
      });
      await expect(page.locator('.cockpit-pane')).toHaveAttribute(
        'data-state',
        'Paused · frozen viewpoint',
      );
      expect((await inspect()).cockpit.cockpit.actualPosition).toEqual(anchor);
      expect((await world()).interactive.state).toBe('paused');
      report.cases.push(
        'Backend restart: valid new executor epoch, same exact paused anchor, no camera travel',
      );
      await page.screenshot({ path: resolve(output, 'restart-paused.png') });
      await tab('Simulated cockpit', 'Close view');
      await page.setViewportSize({ width: 3840, height: 2160 });
      for (let index = 2; index <= 4; index++) {
        await tab(
          index === 2 ? 'Tactical Map' : `Tactical Map ${index - 1}`,
          'New Tactical pane',
        );
        await expect
          .poll(() =>
            page.evaluate(
              (id) => globalThis.__sentinelMapTest?.inspect(id)?.ready,
              `tactical:${index}`,
            ),
          )
          .toBe(true);
      }
      expect((await inspect()).pool).toMatchObject({
        alive: 4,
        active: 4,
        hidden: 0,
      });
      await page
        .getByRole('button', { name: 'Open Details', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Simulated cockpit', exact: true })
        .click();
      await expect(page.locator('.cockpit-pane')).toContainText(
        'Renderer capacity reached',
      );
      expect((await inspect()).pool).toMatchObject({ alive: 4, active: 4 });
      await page.screenshot({
        path: resolve(output, 'four-visible-capacity.png'),
      });
      await page
        .locator('.cockpit-pane')
        .getByRole('button', { name: 'Close Tactical Map 4', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).cockpit?.ready)
        .toBe(true);
      expect((await inspect()).pool).toMatchObject({ alive: 4, active: 4 });
      report.cases.push(
        'Four visible map slots remain intact; cockpit requires explicit close, then occupies released slot',
      );
      await action('End demo');
      await page.locator('[data-run-state="ended"]').first().waitFor();
      report.passed = true;
    } catch (e) {
      report.failure = {
        name: e.name,
        message: e.message
          .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
          .slice(0, 1400),
      };
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
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
