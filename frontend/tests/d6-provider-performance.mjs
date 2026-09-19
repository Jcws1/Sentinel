import { chromium, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: process.argv[2] ?? 'providers-performance',
    frontendPort: 5363,
    backendPort: 8163,
    configured: true,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(25000);
    const u = d6UI(page, frontend),
      c = page.locator('.cockpit-pane'),
      r = {
        checks: [],
        errors: [],
        network: {},
        providerFailures: {},
        measurements: [],
        generationMs: [],
        commandMs: [],
        streams: 0,
      };
    let phase = 'setup';
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) r.streams++;
    });
    page.on('request', (req) => {
      const url = new globalThis.URL(req.url());
      const kind =
        url.hostname === '127.0.0.1'
          ? url.pathname.endsWith('/recommendations')
            ? 'suggestions'
            : url.pathname.startsWith('/api/')
              ? 'API'
              : 'local assets'
          : url.hostname;
      r.network[`${phase} ${kind}`] = (r.network[`${phase} ${kind}`] ?? 0) + 1;
    });
    page.on('requestfailed', (req) => {
      const host = new globalThis.URL(req.url()).hostname;
      if (host !== '127.0.0.1') {
        const kind = `${host} ${req.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED'}`;
        r.providerFailures[kind] = (r.providerFailures[kind] ?? 0) + 1;
      }
    });
    const inspect = () =>
      page.evaluate(() => ({
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        map: globalThis.__sentinelCesiumTest?.inspect('tactical:2'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
      }));
    const shot = (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
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
        const intervals = ticks
          .slice(1)
          .map((t, i) => t - ticks[i])
          .sort((a, b) => a - b);
        return {
          durationMs: globalThis.performance.now() - begun,
          callbacks: ticks.length,
          medianMs: intervals[Math.floor(intervals.length * 0.5)],
          p95Ms: intervals[Math.floor(intervals.length * 0.95)],
          maxMs: Math.max(...intervals),
        };
      });
      const after = await metrics(),
        end = await inspect();
      r.measurements.push({
        label,
        pacing,
        taskSeconds: after.TaskDuration - before.TaskDuration,
        layoutSeconds: after.LayoutDuration - before.LayoutDuration,
        heapBefore: before.JSHeapUsedSize,
        heapAfter: after.JSHeapUsedSize,
        videoDraws:
          end.video.environment.renderedFrames -
          start.video.environment.renderedFrames,
        mapDraws:
          end.map.environment.renderedFrames -
          start.map.environment.renderedFrames,
        rendererLeases: end.pool.leases.length,
      });
      phase = 'between';
    };
    const generated = async () => {
      const start = globalThis.performance.now();
      await u.refresh();
      r.generationMs.push(globalThis.performance.now() - start);
    };
    const stop = async (advisory) => {
      const reply = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          res.url().endsWith('/commands') &&
          res.request().postDataJSON()?.intent?.action === 'stop',
      );
      const start = globalThis.performance.now();
      if (advisory)
        await u.pane
          .getByRole('button', { name: /^Apply Stop selected/ })
          .click();
      else
        await u.fleet
          .getByRole('button', { name: 'Stop selected', exact: true })
          .click();
      const receipt = await (await reply).json();
      expect(receipt.accepted).toBe(true);
      r.commandMs.push({ advisory, ms: globalThis.performance.now() - start });
    };
    try {
      await u.scenario({ friendly: 2, hostile: 0, patrol: true });
      await u.action('Pause');
      await u.tab('Conductor', 'Close view');
      await u.select('D6 Friendly 01');
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect(
        c.getByLabel('Video Feed environment', { exact: true }),
      ).toHaveValue('photorealistic');
      await expect
        .poll(
          async () => (await inspect()).video?.environment.photoVisibleTiles,
          { timeout: 60000 },
        )
        .toBeGreaterThan(0);
      await page.waitForTimeout(3000);
      r.google = (await inspect()).video;
      await shot('01-google');
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('standard');
      await expect
        .poll(async () => (await inspect()).video?.spatial, { timeout: 60000 })
        .toMatchObject({
          imagery: 'ready',
          terrain: 'ready',
          buildings: 'ready',
          displayedBase: 'standard',
        });
      await page.waitForTimeout(2500);
      r.standard = (await inspect()).video;
      await shot('02-standard');
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('photorealistic');
      await expect
        .poll(
          async () => (await inspect()).video?.environment.photoVisibleTiles,
          { timeout: 60000 },
        )
        .toBeGreaterThan(0);
      await u.review();
      await page.getByRole('tab', { name: 'Video Feed', exact: true }).click();
      await c
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await u.tab('Tactical Map', 'New Tactical pane');
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).map?.spatial, { timeout: 60000 })
        .toMatchObject({
          imagery: 'ready',
          terrain: 'ready',
          buildings: 'ready',
          displayedBase: 'standard',
        });
      await u.review();
      await shot('03-suggestions-with-three-views');
      const first = await inspect();
      r.attribution = await c.evaluate((el) => ({
        canvas: el
          .querySelector('.cesium-widget canvas')
          .getBoundingClientRect()
          .toJSON(),
        credits: el
          .querySelector('.cesium-widget-credits')
          .getBoundingClientRect()
          .toJSON(),
      }));
      expect(r.attribution.credits.top).toBeGreaterThanOrEqual(
        r.attribution.canvas.bottom - 1,
      );
      expect(first.pool.leases.length).toBeLessThanOrEqual(4);
      await c.locator('summary').click();
      await c
        .getByRole('slider', { name: 'Video Feed look yaw', exact: true })
        .fill('20');
      expect((await inspect()).map.camera).toEqual(first.map.camera);
      await c.getByRole('button', { name: 'Reset view', exact: true }).click();
      await c.locator('summary').click();
      r.checks.push(
        'Actual visible Google tiles and standard imagery/terrain/buildings; credits below image; Tactical, standard 3D, Video Feed and Suggestions together; independent look-around',
      );
      await u.action('Resume');
      await u.behavior('patrol');
      await page.waitForTimeout(3000);
      for (const [label, on] of [
        ['off-1', false],
        ['on-1', true],
        ['on-2', true],
        ['off-2', false],
      ]) {
        if (on) {
          await page
            .getByRole('tab', { name: 'Suggestions', exact: true })
            .click();
          await generated();
        } else
          await page.getByRole('tab', { name: 'Details', exact: true }).click();
        await page.waitForTimeout(500);
        await measure(label);
        await stop(on);
        await u.behavior('patrol');
      }
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
      await generated();
      await cdp.send('HeapProfiler.collectGarbage');
      const memoryBefore = await metrics();
      for (let i = 0; i < 12; i++) await generated();
      await cdp.send('HeapProfiler.collectGarbage');
      const memoryAfter = await metrics();
      r.resourceCycle = {
        heapBefore: memoryBefore.JSHeapUsedSize,
        heapAfter: memoryAfter.JSHeapUsedSize,
        nodesBefore: memoryBefore.Nodes,
        nodesAfter: memoryAfter.Nodes,
        pool: (await inspect()).pool,
      };
      phase = 'hidden';
      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      await page.waitForTimeout(2500);
      expect(r.network['hidden suggestions'] ?? 0).toBe(0);
      phase = 'capture';
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
      await generated();
      const dynamic = resolve(output, 'dynamic');
      mkdirSync(dynamic, { recursive: true });
      r.dynamic = [];
      for (let i = 0; i < 12; i++) {
        r.dynamic.push({ index: i, elapsedMs: globalThis.performance.now() });
        await page.screenshot({
          path: resolve(dynamic, `${String(i).padStart(3, '0')}.jpg`),
          type: 'jpeg',
          quality: 68,
        });
        await page.waitForTimeout(350);
      }
      const encoded = spawnSync(
        'C:/ProgramData/chocolatey/lib/ffmpeg-full/tools/ffmpeg/bin/ffmpeg.exe',
        [
          '-y',
          '-loglevel',
          'error',
          '-framerate',
          '2',
          '-i',
          resolve(dynamic, '%03d.jpg'),
          '-vf',
          'scale=1280:-2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          resolve(output, 'patrol-suggestions-sampled.mp4'),
        ],
        { windowsHide: true, timeout: 30000 },
      );
      r.videoEncoded = encoded.status === 0;
      await u.action('Pause');
      await generated();
      await shot('04-final-paused');
      expect(r.streams).toBe(1);
      expect(r.errors).toEqual([]);
      await u.action('End demo');
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1600);
      r.final = await inspect().catch(() => null);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          passed: r.passed,
          checks: r.checks,
          measurements: r.measurements,
          generationMs: r.generationMs,
          commandMs: r.commandMs,
          failure: r.failure,
          providerFailures: r.providerFailures,
        }),
      );
    }
  },
);
