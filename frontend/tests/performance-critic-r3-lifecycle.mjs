// Independent functional continuation after the provider trace. No FPS claims.
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';

const changed = (a, b) =>
  Object.values(a.tracks).filter(
    (t) =>
      JSON.stringify(t.latest.position) !==
      JSON.stringify(b.tracks[t.id].latest.position),
  );
await withD5Runtime(
  {
    phase: 'd6',
    tag: process.env.PERF_TAG || 'perf-critic-r3-lifecycle',
    frontendPort: 5382,
    backendPort: 8182,
    evidenceRoot: '../docs/performance-stability',
    previewDir: 'dist-performance-after',
    viteConfig: '.cache/performance-preview.mjs',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage(),
      ui = d6UI(page, frontend);
    page.setDefaultTimeout(30000);
    const result = {
      browser: browser.version(),
      provider: 'Local grid/fallback',
      errors: [],
      receipts: [],
    };
    page.on('pageerror', (e) => result.errors.push(e.name));
    const inspect = () =>
      page.evaluate(() => ({
        map: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        stats: globalThis.__sentinelCesiumTest?.stats(),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
      }));
    const command = async (action, click) => {
      const received = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === action,
      );
      await click();
      const receipt = await (await received).json();
      expect(receipt.accepted).toBe(true);
      result.receipts.push(receipt);
      return receipt;
    };
    try {
      await loadPerformanceScenario(page, frontend, 20);
      await ui.tab('Conductor', 'Close view');
      await ui.select('Friendly 01');
      result.missionId = (await ui.world()).mission.id;
      const first = await ui.world();
      await page.waitForTimeout(650);
      result.initialMoving = changed(first, await ui.world()).length;
      expect(result.initialMoving).toBe(40);
      await page.evaluate(() =>
        globalThis.__sentinelMapTest.setCamera('tactical', {
          center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
          groundSpanM: 3500,
          headingTrueDeg: 0,
          pitchFromNadirDeg: 0,
        }),
      );
      await page
        .locator('[data-view-id="tactical"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).map?.retainable, { timeout: 30000 })
        .toBe(true);
      result.beforeFault = await inspect();
      // This is an explicit existing verification fixture, not the initial timeout's unknown cause.
      await page.evaluate(() =>
        globalThis.__sentinelCesiumTest.failRenderer(
          'tactical',
          'context-lost',
        ),
      );
      await page
        .getByRole('button', { name: 'Retry renderer', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).map?.retainable, { timeout: 30000 })
        .toBe(true);
      result.afterRetry = await inspect();
      expect(result.afterRetry.stats.created).toBeGreaterThan(
        result.beforeFault.stats.created,
      );
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      await page
        .getByRole('button', { name: 'Show Views list', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Open Tracks from Views', exact: true })
        .click();
      await page.waitForTimeout(300);
      result.hiddenBefore = await inspect();
      await page.waitForTimeout(1200);
      result.hiddenAfter = await inspect();
      expect(result.hiddenAfter.map.active).toBe(false);
      expect(result.hiddenAfter.map.environment.renderedFrames).toBe(
        result.hiddenBefore.map.environment.renderedFrames,
      );
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      await expect.poll(async () => (await inspect()).map?.active).toBe(true);
      await ui.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      const receipt = await command('stop', () =>
        ui.fleet
          .getByRole('button', { name: 'Stop selected', exact: true })
          .click(),
      );
      expect(receipt.controlOutcomes).toHaveLength(20);
      const stopped = await ui.world();
      expect(stopped.scenarioSchedule.manualOverrides).toHaveLength(20);
      await page.waitForTimeout(650);
      const remaining = changed(stopped, await ui.world());
      result.afterStopMoving = remaining.map((t) => ({
        id: t.id,
        affiliation: stopped.entities[t.entityId].affiliation,
      }));
      expect(remaining).toHaveLength(20);
      expect(
        result.afterStopMoving.every((t) => t.affiliation === 'hostile'),
      ).toBe(true);
      await page.screenshot({
        path: resolve(output, 'stop-twenty-friendly.png'),
      });
      await command('return-to-script', () =>
        ui.fleet
          .getByRole('button', { name: 'Return to script', exact: true })
          .click(),
      );
      const returned = await ui.world();
      expect(returned.scenarioSchedule.manualOverrides).toEqual([]);
      result.returnedFriendlyActions = returned.scenarioSchedule.actions
        .filter((a) => returned.entities[a.entityId].affiliation === 'friendly')
        .map((a) => ({ actionId: a.action.id, state: a.state }));
      expect(
        result.returnedFriendlyActions.filter((a) => a.state === 'Cancelled'),
      ).toHaveLength(20);
      expect(
        result.returnedFriendlyActions.filter((a) => a.state === 'Skipped'),
      ).toHaveLength(40);
      await page.waitForTimeout(650);
      // Return clears the override; it does not replay cancelled or dependency-skipped actions.
      expect(changed(returned, await ui.world())).toHaveLength(20);
      await command('end', () => ui.action('End demo'));
      expect((await ui.world(result.missionId)).interactive.state).toBe(
        'ended',
      );
      expect(
        (
          await (
            await page.request.get(`${frontend}/api/interactive/entry`)
          ).json()
        ).activeMissionId,
      ).toBeFalsy();
      await page.screenshot({ path: resolve(output, 'ended.png') });
      expect(result.errors).toEqual([]);
      result.passed = true;
    } catch (error) {
      result.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1500);
      result.failureState = await inspect().catch(() => undefined);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
      globalThis.console.log(
        JSON.stringify({
          passed: result.passed,
          failure: result.failure,
          initialMoving: result.initialMoving,
        }),
      );
    }
  },
);
