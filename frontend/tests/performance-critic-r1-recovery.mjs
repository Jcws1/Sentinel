// Independent review continuation: wait for the owned backend to become ready.
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'perf-critic-r1-recovery',
    frontendPort: 5380,
    backendPort: 8180,
    configured: false,
    evidenceRoot: '../docs/performance-stability',
    previewDir: 'dist-performance-after',
    viteConfig: '.cache/performance-preview.mjs',
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage(),
      ui = d6UI(page, frontend),
      report = { cases: [], errors: [] };
    page.setDefaultTimeout(25000);
    page.on('pageerror', (error) => report.errors.push(error.name));
    const action = async (label, operation) => {
      const reply = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === operation,
      );
      await ui.action(label);
      const receipt = await (await reply).json();
      expect(receipt.accepted).toBe(true);
      return receipt;
    };
    try {
      await loadPerformanceScenario(page, frontend, 20);
      await ui.tab('Conductor', 'Close view');
      await ui.select('Friendly 01');
      await action('Pause', 'pause');
      const prior = await ui.world();
      report.missionId = prior.mission.id;
      await restartBackend();
      await expect
        .poll(
          async () => {
            try {
              const reply = await page.request.get(
                `${frontend}/api/missions/${report.missionId}/world`,
              );
              if (!reply.ok()) return false;
              const world = await reply.json();
              const recovered =
                world.interactive.executorEpoch !==
                  prior.interactive.executorEpoch &&
                world.interactive.state === 'paused';
              if (recovered) report.afterRestart = world;
              return recovered && !!world.interactive.lease.holderId;
            } catch {
              return false;
            }
          },
          { timeout: 30000 },
        )
        .toBe(true);
      expect(Object.keys(report.afterRestart.entities)).toHaveLength(40);
      report.cases.push(
        'Sole backend restart recovered all 40 entities, changed executor epoch, stayed paused, and re-established legitimate session control.',
      );
      report.endReceipt = await action('End demo', 'end');
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      await page.locator('[data-run-state="ended"]').first().waitFor();
      const ended = await ui.world(report.missionId);
      expect(Object.keys(ended.entities)).toHaveLength(40);
      expect(ended.interactive.state).toBe('ended');
      await page.screenshot({
        path: resolve(output, 'recording-reopened.png'),
      });
      report.cases.push(
        'End receipt accepted and Previous demos reopened ended 40-entity recording after reload.',
      );
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (error) {
      report.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1500);
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
      globalThis.console.log(
        JSON.stringify({
          passed: report.passed,
          failure: report.failure,
          cases: report.cases,
          errors: report.errors,
        }),
      );
    }
  },
);
