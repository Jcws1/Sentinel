import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  { tag: 'keyboard-layout', frontendPort: 5321, backendPort: 8121 },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    const report = { checks: [], errors: [] };
    page.setDefaultTimeout(20000);
    page.on('pageerror', (e) => report.errors.push(e.name));
    const cockpit = page.locator('.cockpit-pane');
    const action = async (name) => {
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const verify = async (label) => {
      const rects = await cockpit.evaluate((e) => {
        const viewport = e.closest('.workspace-scroll').getBoundingClientRect();
        return {
          viewport: {
            left: viewport.left,
            right: viewport.right,
            bottom: viewport.bottom,
          },
          nodes: [
            '.cockpit-heading>strong',
            '.cockpit-subject>span',
            '.cockpit-state',
          ].map((s) => {
            const range = e.ownerDocument.createRange();
            range.selectNodeContents(e.querySelector(s));
            const r = range.getBoundingClientRect();
            return {
              left: r.left,
              right: r.right,
              top: r.top,
              bottom: r.bottom,
            };
          }),
          active: e.ownerDocument.activeElement?.getAttribute('aria-label'),
        };
      });
      for (const r of rects.nodes) {
        expect(r.left).toBeGreaterThanOrEqual(rects.viewport.left - 1);
        expect(r.right).toBeLessThanOrEqual(rects.viewport.right + 1);
        expect(r.top).toBeGreaterThanOrEqual(0);
        expect(r.bottom).toBeLessThanOrEqual(rects.viewport.bottom + 1);
      }
      report.checks.push({ label, ...rects });
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
        .getByRole('button', { name: 'Inspect F-01', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () => globalThis.__sentinelCesiumTest?.inspect('cockpit')?.ready,
          ),
        )
        .toBe(true);
      await cockpit
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await page
        .getByRole('tab', { name: 'Tactical Map', exact: true })
        .click({ button: 'right' });
      await page
        .getByRole('menuitem', { name: 'New Tactical pane', exact: true })
        .click();
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(
            () => globalThis.__sentinelRendererPoolTest?.inspect().active,
          ),
        )
        .toBe(3);
      for (const [width, height] of [
        [760, 800],
        [820, 900],
        [900, 900],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(250);
        const options = cockpit.locator('details');
        if ((await options.getAttribute('open')) === null)
          await options.locator('summary').click();
        for (const name of [
          'Place Video Feed beside map',
          'Follow selection',
          'Video Feed environment',
          'Video Feed look yaw',
          'Video Feed look pitch',
          'Reset view',
        ]) {
          const element =
            name === 'Follow selection'
              ? cockpit.getByRole('checkbox')
              : name === 'Video Feed environment'
                ? cockpit.getByLabel(name, { exact: true })
                : name.startsWith('Cockpit look')
                  ? cockpit.getByRole('slider', { name, exact: true })
                  : cockpit.getByRole('button', { name, exact: true });
          await element.focus();
          if (name.startsWith('Cockpit look'))
            await page.keyboard.press('Home');
          await verify(`${width} focus ${name}`);
        }
        await cockpit
          .locator('.cockpit-body')
          .evaluate((e) => (e.scrollTop = e.scrollHeight));
        await verify(`${width} body scrolled bottom`);
        await page
          .locator('.workspace-scroll')
          .evaluate((e) => (e.scrollLeft = e.scrollWidth));
        await cockpit
          .getByRole('slider', { name: 'Video Feed look pitch', exact: true })
          .focus();
        await verify(`${width} return from horizontal workspace scroll`);
        await cockpit
          .getByRole('button', { name: 'Reset view', exact: true })
          .click();
        await page.screenshot({ path: resolve(output, `layout-${width}.png`) });
      }
      await page.setViewportSize({ width: 760, height: 800 });
      await page.waitForTimeout(250);
      const fleet = page.locator('[data-activity-view="fleet"]');
      if ((await fleet.getAttribute('aria-expanded')) !== 'true')
        await fleet.click();
      await cockpit
        .getByRole('slider', { name: 'Video Feed look pitch', exact: true })
        .focus();
      await verify('760 Fleet open focus pitch');
      await cockpit
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .focus();
      await verify('760 Fleet open focus placement');
      await page.screenshot({ path: resolve(output, '760-fleet-open.png') });
      await action('End demo');
      await page
        .locator('[data-run-state="ended"]')
        .first()
        .waitFor({ state: 'attached' });
      report.passed = true;
    } catch (e) {
      report.failure = String(e.message)
        .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
        .slice(0, 1000);
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
      console.log(
        JSON.stringify({
          passed: report.passed,
          checks: report.checks.length,
          errors: report.errors,
          failure: report.failure,
        }),
      );
    }
  },
);
