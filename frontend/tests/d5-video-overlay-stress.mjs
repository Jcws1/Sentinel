import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    tag: process.argv[2] ?? 'video-overlay-stress',
    frontendPort: 5353,
    backendPort: 8153,
    configured: true,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const report = {
      measurements: [],
      cases: [],
      errors: [],
      network: {},
      applicationStreams: 0,
    };
    let phase = 'setup';
    page.on('pageerror', (e) => report.errors.push(e.name));
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) report.applicationStreams++;
    });
    page.on('request', (r) => {
      const u = new globalThis.URL(r.url());
      const key = `${phase} ${u.hostname === '127.0.0.1' ? (u.pathname.startsWith('/api/') ? 'application API' : 'local assets') : u.hostname}`;
      report.network[key] = (report.network[key] ?? 0) + 1;
    });
    report.providerFailures = {};
    page.on('requestfailed', (r) => {
      const host = new globalThis.URL(r.url()).hostname;
      if (host === '127.0.0.1') return;
      const code =
        r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED';
      const key = `${host} ${code}`;
      report.providerFailures[key] = (report.providerFailures[key] ?? 0) + 1;
    });
    const c = () => page.locator('.cockpit-pane');
    const inspect = () =>
      page.evaluate(() => ({
        cockpit: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        map: globalThis.__sentinelCesiumTest?.inspect('tactical:2'),
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
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
    const measure = async (label) => {
      phase = label;
      const before = await metrics(),
        start = await inspect();
      const pacing = await page.evaluate(async () => {
        const begun = globalThis.performance.now(),
          ticks = [];
        await new Promise((done) => {
          const step = (t) => {
            ticks.push(t);
            if (t - begun < 6000) globalThis.requestAnimationFrame(step);
            else done();
          };
          globalThis.requestAnimationFrame(step);
        });
        const spans = ticks
          .slice(1)
          .map((t, i) => t - ticks[i])
          .sort((a, b) => a - b);
        return {
          durationMs: globalThis.performance.now() - begun,
          callbacks: ticks.length,
          medianMs: spans[Math.floor(spans.length * 0.5)],
          p95Ms: spans[Math.floor(spans.length * 0.95)],
          maxMs: Math.max(...spans),
        };
      });
      const after = await metrics(),
        end = await inspect();
      const range = (times) => {
        const t = (times ?? []).filter(
          (t) =>
            t >=
            ((end.cockpit ?? end.map)?.environment.renderTimes?.at(-1) ?? 0) -
              6000,
        );
        const d = t
          .slice(1)
          .map((v, i) => v - t[i])
          .sort((a, b) => a - b);
        return {
          count: t.length,
          medianIntervalMs: d[Math.floor(d.length * 0.5)],
          p95IntervalMs: d[Math.floor(d.length * 0.95)],
        };
      };
      const record = {
        label,
        pacing,
        mapDraws:
          end.map.environment.renderedFrames -
          start.map.environment.renderedFrames,
        cockpitDraws: end.cockpit
          ? end.cockpit.environment.renderedFrames -
            (start.cockpit?.environment.renderedFrames ?? 0)
          : 0,
        cockpitRenderIntervals: range(end.cockpit?.environment.renderTimes),
        pool: end.pool,
        heapBefore: before.JSHeapUsedSize,
        heapAfter: after.JSHeapUsedSize,
        taskTimeSeconds: after.TaskDuration - before.TaskDuration,
        layoutTimeSeconds: after.LayoutDuration - before.LayoutDuration,
      };
      report.measurements.push(record);
      phase = 'between';
      return record;
    };
    try {
      const name = `D5 bounded patrol ${Date.now()}`;
      const unit = (id, lon, profile) => ({
        id,
        label: id,
        category: 'friendly',
        commandRole: 'sentinel',
        profileId: profile,
        headingTrueDeg: 0,
        position: {
          longitudeDeg: lon,
          latitudeDeg: 1.29,
          altitude: { metres: 150, reference: 'ELLIPSOID', datumId: 'WGS84' },
        },
      });
      expect(
        (
          await page.request.post(`${frontend}/api/scenarios`, {
            data: {
              requestId: globalThis.crypto.randomUUID(),
              expectedRevision: 0,
              content: {
                name,
                boundaryRuleVersion: 'local-boundary-v1',
                units: [
                  unit('Sting', 103.85, 'sting-v1'),
                  unit('Hornet', 103.851, 'hornet-10-v1'),
                  ...Array.from({ length: 20 }, (_, i) => ({
                    ...unit(
                      `Observation ${i + 1}`,
                      103.847 + (i % 5) * 0.0015,
                      'hornet-10-v1',
                    ),
                    id: `observation-${i}`,
                    category: i % 2 ? 'unknown' : 'hostile',
                    commandRole: 'observation',
                    profileId: null,
                    position: {
                      longitudeDeg: 103.847 + (i % 5) * 0.0015,
                      latitudeDeg: 1.3 + Math.floor(i / 5) * 0.001,
                      altitude: {
                        metres: 150,
                        reference: 'ELLIPSOID',
                        datumId: 'WGS84',
                      },
                    },
                  })),
                ],
                boundaries: [
                  {
                    id: 'patrol',
                    name: 'D5 patrol',
                    type: 'patrol',
                    vertices: [
                      [103.848, 1.288],
                      [103.854, 1.288],
                      [103.854, 1.294],
                      [103.848, 1.294],
                    ],
                  },
                ],
              },
            },
          })
        ).ok(),
      ).toBe(true);
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
        .click();
      const conductor = page.locator('[data-view="conductor"]');
      await conductor
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(conductor).toContainText('Ready to run');
      await conductor
        .getByRole('button', { name: 'Run saved revision 1', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      await tab('Conductor', 'Close view');
      await page.locator('[data-activity-view="fleet"]').click();
      await page
        .locator('.fleet-sidebar')
        .getByRole('checkbox', { name: 'Select Sting', exact: true })
        .check();
      await tab('Tactical Map', 'New Tactical pane');
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).map?.ready, { timeout: 30000 })
        .toBe(true);

      await page.waitForTimeout(3000);

      const opened = globalThis.performance.now();
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).cockpit?.ready, { timeout: 30000 })
        .toBe(true);
      report.openToRendererMs = globalThis.performance.now() - opened;
      await c()
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('photorealistic');
      await expect
        .poll(
          async () => (await inspect()).cockpit?.environment.photoVisibleTiles,
          { timeout: 60000 },
        )
        .toBeGreaterThan(0);
      report.openToServicesMs = globalThis.performance.now() - opened;
      await page.waitForTimeout(4000);
      await action('Pause');
      await c()
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await c().locator('summary').click();
      await c()
        .getByRole('slider', { name: 'Video Feed look yaw', exact: true })
        .focus();
      for (const [label, enabled] of [
        ['crowd-off-1', false],
        ['crowd-on-1', true],
        ['crowd-on-2', true],
        ['crowd-off-2', false],
      ]) {
        await c()
          .getByRole('checkbox', { name: 'Simulated entities', exact: true })
          .setChecked(enabled);
        await c()
          .getByRole('slider', { name: 'Video Feed look yaw', exact: true })
          .focus();
        const drive = async () => {
          for (let i = 0; i < 30; i++) {
            await page.keyboard.press(i % 10 < 5 ? 'ArrowRight' : 'ArrowLeft');
            await page.waitForTimeout(100);
          }
        };
        await Promise.all([measure(label), drive()]);
        const current = (await inspect()).cockpit;
        (report.overlayCounters ??= []).push({
          label,
          overlay: current.videoOverlay,
        });
        if (enabled)
          expect(current.videoOverlay.points.length).toBeGreaterThan(10);
      }
      await c()
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .check();
      await c().locator('summary').click();
      await c()
        .locator('.cockpit-body')
        .evaluate((e) => (e.scrollTop = 0));
      await page.screenshot({
        path: resolve(output, 'crowded-look-around.png'),
      });
      const memory = async () => {
        await cdp.send('HeapProfiler.collectGarbage');
        return {
          metrics: await metrics(),
          dom: await cdp.send('Memory.getDOMCounters'),
          stats: await page.evaluate(() =>
            globalThis.__sentinelCesiumTest.stats(),
          ),
          overlay: (await inspect()).cockpit.videoOverlay,
        };
      };
      report.memoryBefore = await memory();
      for (let i = 0; i < 12; i++) {
        await c()
          .getByRole('checkbox', { name: 'Simulated entities', exact: true })
          .uncheck();
        await c()
          .getByRole('checkbox', { name: 'Simulated entities', exact: true })
          .check();
      }
      await page.waitForTimeout(500);
      report.memoryAfter = await memory();
      expect(report.memoryAfter.overlay.nodes).toBe(
        report.memoryBefore.overlay.nodes,
      );
      expect(report.memoryAfter.stats.created).toBe(
        report.memoryBefore.stats.created,
      );
      expect(report.memoryAfter.stats.active).toBe(
        report.memoryBefore.stats.active,
      );
      report.cases.push(
        'Matched paused camera keyboard look-around with 20 projected observations; off/on/on/off; 12 toggle cycles with post-GC heap/DOM and no viewer rebuild',
      );
      await action('End demo');
      await page.locator('[data-run-state="ended"]').first().waitFor();
      report.passed = true;
    } catch (e) {
      report.final = await inspect().catch(() => undefined);
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
      globalThis.console.log(
        JSON.stringify({
          passed: report.passed,
          cases: report.cases,
          measurements: report.measurements,
          failure: report.failure,
          errors: report.errors,
        }),
      );
    }
  },
);
