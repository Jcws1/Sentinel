import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    tag: 'performance',
    frontendPort: 5321,
    backendPort: 8121,
    configured: true,
  },
  async ({ frontend, output, restartBackend }) => {
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
    const world = async () => {
      const e = await (
        await page.request.get(`${frontend}/api/interactive/entry`)
      ).json();
      return (
        await page.request.get(
          `${frontend}/api/missions/${e.activeMissionId}/world`,
        )
      ).json();
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
      await measure('maps-only-1');
      report.commandWithoutMs = await stop();
      await patrol();
      const opened = globalThis.performance.now();
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).cockpit?.ready, { timeout: 30000 })
        .toBe(true);
      report.openToRendererMs = globalThis.performance.now() - opened;
      await expect
        .poll(
          async () => {
            const s = (await inspect()).cockpit?.spatial;
            return (
              s?.imagery === 'ready' &&
              s?.terrain === 'ready' &&
              s?.buildings === 'ready'
            );
          },
          { timeout: 60000 },
        )
        .toBe(true);
      report.openToServicesMs = globalThis.performance.now() - opened;
      await page.waitForTimeout(4000);
      await measure('with-cockpit-1');
      report.commandWithMs = await stop();
      await patrol();
      await page.screenshot({
        path: resolve(output, 'three-views-patrol.png'),
      });
      await tab('Video Feed', 'Close view');
      await page
        .getByRole('button', { name: 'Open Details', exact: true })
        .click();
      await measure('maps-only-2');
      const reopen = globalThis.performance.now();
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).cockpit?.ready)
        .toBe(true);
      report.reopenMs = globalThis.performance.now() - reopen;
      await page.waitForTimeout(2500);
      await measure('with-cockpit-2');
      report.cases.push(
        'Actual Patrol with standard Cesium cockpit; matched sequential maps-only/cockpit workloads',
      );
      // Separate low-rate evidence recording, deliberately outside performance windows.
      phase = 'video';
      const encoder = spawn(
        'C:/ProgramData/chocolatey/lib/ffmpeg-full/tools/ffmpeg/bin/ffmpeg.exe',
        [
          '-y',
          '-loglevel',
          'error',
          '-f',
          'image2pipe',
          '-framerate',
          '5',
          '-i',
          'pipe:0',
          '-vf',
          'scale=1280:-2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          resolve(output, 'patrol-sampled.mp4'),
        ],
        { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
      );
      const times = [];
      for (let i = 0; i < 25; i++) {
        times.push(Date.now());
        encoder.stdin.write(
          await page.screenshot({ type: 'jpeg', quality: 65 }),
        );
        await page.waitForTimeout(200);
      }
      encoder.stdin.end();
      await new Promise((done) => encoder.on('exit', done));
      report.videoSampleTimes = times;
      if (process.env.D5_PERFORMANCE_ONLY === '1') {
        await action('End demo');
        await page.locator('[data-run-state="ended"]').first().waitFor();
        report.passed = true;
        return;
      }
      await action('Pause');
      await expect(c()).toHaveAttribute(
        'data-state',
        'Paused · frozen viewpoint',
      );
      const preRestart = await world(),
        anchor = (await inspect()).cockpit.cockpit.actualPosition;
      await restartBackend();
      await expect
        .poll(async () => (await world()).interactive.executorEpoch, {
          timeout: 30000,
        })
        .not.toBe(preRestart.interactive.executorEpoch);
      await expect(page.locator('.connection-state')).toHaveText('CONNECTED', {
        timeout: 30000,
      });
      await expect(c()).toHaveAttribute(
        'data-state',
        'Paused · frozen viewpoint',
      );
      expect((await inspect()).cockpit.cockpit.actualPosition).toEqual(anchor);
      report.cases.push(
        'Owned backend restart changes epoch, recovers paused same-run camera without movement',
      );
      await tab('Video Feed', 'Close view');
      await page.setViewportSize({ width: 3840, height: 2160 });
      for (const [title, id] of [
        ['3D Map 2', 'tactical:3'],
        ['Tactical Map 3', 'tactical:4'],
      ]) {
        await tab(title, 'New Tactical pane');
        await expect
          .poll(() =>
            page.evaluate(
              (id) => globalThis.__sentinelMapTest?.inspect(id)?.ready,
              id,
            ),
          )
          .toBe(true);
      }
      expect((await inspect()).pool).toMatchObject({ alive: 4, active: 4 });
      await page
        .getByRole('button', { name: 'Open Details', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect(c()).toContainText('Renderer capacity reached');
      expect((await inspect()).pool).toMatchObject({ alive: 4, active: 4 });
      await page.screenshot({ path: resolve(output, 'capacity.png') });
      await c()
        .getByRole('button', { name: 'Close Tactical Map 4', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).cockpit?.ready)
        .toBe(true);
      expect((await inspect()).pool).toMatchObject({ alive: 4, active: 4 });
      report.cases.push(
        'Four visible renderers preserved at capacity; explicit close releases a slot for cockpit',
      );
      await action('End demo');
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
