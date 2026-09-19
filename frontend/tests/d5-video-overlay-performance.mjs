import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    tag: process.argv[2] ?? 'video-overlay-performance',
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
    const stop = async () => {
      const r = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === 'stop',
      );
      const t = globalThis.performance.now();
      await page
        .getByRole('button', { name: 'Stop selected', exact: true })
        .first()
        .click();
      const receipt = await (await r).json();
      expect(receipt.accepted).toBe(true);
      return globalThis.performance.now() - t;
    };
    const patrol = async () => {
      const f = page.locator('.fleet-sidebar');
      await f.getByLabel('Behavior', { exact: true }).selectOption('patrol');
      const r = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/commands'),
      );
      const t = globalThis.performance.now();
      await f.getByRole('button', { name: 'Apply', exact: true }).click();
      expect((await (await r).json()).accepted).toBe(true);
      return globalThis.performance.now() - t;
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
                      103.8485 + (i % 5) * 0.001,
                      'hornet-10-v1',
                    ),
                    id: `observation-${i}`,
                    category: i % 2 ? 'unknown' : 'hostile',
                    commandRole: 'observation',
                    profileId: null,
                    position: {
                      longitudeDeg: 103.8485 + (i % 5) * 0.001,
                      latitudeDeg: 1.289 + Math.floor(i / 5) * 0.001,
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
      await patrol();
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
      report.toggleLatencyMs = [];
      for (const [label, enabled] of [
        ['off-1', false],
        ['on-1', true],
        ['on-2', true],
        ['off-2', false],
      ]) {
        const t = globalThis.performance.now();
        await c()
          .getByRole('checkbox', { name: 'Simulated entities', exact: true })
          .setChecked(enabled);
        await expect
          .poll(async () => (await inspect()).cockpit?.videoOverlay.enabled)
          .toBe(enabled);
        report.toggleLatencyMs.push({
          label,
          ms: globalThis.performance.now() - t,
        });
        await page.waitForTimeout(800);
        await measure(label);
        (report.overlayCounters ??= []).push({
          label,
          overlay: (await inspect()).cockpit.videoOverlay,
        });
        (report.commandResponseMs ??= []).push({ label, ms: await stop() });
        await patrol();
      }
      await c()
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .check();
      await page.screenshot({
        path: resolve(output, 'three-views-patrol.png'),
      });
      const beforeHide = (await inspect()).cockpit;
      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      await page.waitForTimeout(1000);
      const hiddenStart = (await inspect()).cockpit;
      await page.waitForTimeout(1500);
      const hiddenEnd = (await inspect()).cockpit;
      report.hidden = {
        before: beforeHide.videoOverlay,
        start: hiddenStart?.videoOverlay,
        end: hiddenEnd?.videoOverlay,
        pool: (await inspect()).pool,
      };
      if (hiddenEnd) {
        expect(hiddenEnd.active).toBe(false);
        expect(hiddenEnd.videoOverlay.updates).toBe(
          hiddenStart.videoOverlay.updates,
        );
      }
      await page.getByRole('tab', { name: 'Video Feed', exact: true }).click();
      await expect
        .poll(async () => (await inspect()).cockpit?.active)
        .toBe(true);
      report.cases.push(
        'Two maps plus real Google Video Feed; warmed sequential Patrol workloads, overlays off/on/on/off; bounded 20-observation density; hidden work suspended or disposed',
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
