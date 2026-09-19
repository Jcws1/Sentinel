// Independent configured-provider measurement; no measurement RAF or CPU profiler.
/* global document, performance, devicePixelRatio, innerWidth, innerHeight */
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';

const files = Object.keys(
  JSON.parse(
    readFileSync('../docs/performance-stability/baseline-source.json', 'utf8'),
  ),
).filter((p) => p.startsWith('backend/app/') || p.startsWith('frontend/src/'));
files.push('backend/app/domain/capacity.py');
const hashes = () =>
  Object.fromEntries(
    files.map((p) => [
      p,
      createHash('sha256')
        .update(readFileSync(resolve('..', p)))
        .digest('hex'),
    ]),
  );
const quantiles = (items) => {
  const sorted = [...items].sort((a, b) => a - b);
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  return {
    count: sorted.length,
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: at(1),
  };
};

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'perf-critic-r2-provider',
    frontendPort: 5381,
    backendPort: 8181,
    configured: true,
    evidenceRoot: '../docs/performance-stability',
    previewDir: 'dist-performance-after-configured',
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
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const ui = d6UI(page, frontend),
      result = {
        browser: browser.version(),
        headed: true,
        provider: 'Cesium standard 3D map plus Google photorealistic Video',
        measurementOwnedRAF: false,
        cpuProfiler: false,
        cases: [],
        errors: [],
        networkFailures: [],
        sourceBefore: hashes(),
      };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
    page.on('pageerror', (e) =>
      result.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 200),
      ),
    );
    page.on('requestfailed', (request) =>
      result.networkFailures.push({
        host: new URL(request.url()).hostname,
        reason: request.failure()?.errorText,
      }),
    );
    const inspect = () =>
      page.evaluate(() => ({
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
        visible: document.visibilityState,
        focused: document.hasFocus(),
        viewport: {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        },
      }));
    const command = async (label, operation) => {
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === operation,
      );
      await ui.action(label);
      const receipt = await (await response).json();
      expect(receipt.accepted).toBe(true);
      return receipt;
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
    try {
      const loadingStarted = performance.now();
      await loadPerformanceScenario(page, frontend, 20);
      await ui.tab('Conductor', 'Close view');
      await ui.select('Friendly 01');
      result.missionId = (await ui.world()).mission.id;
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
        .poll(
          async () => {
            const s = (await inspect()).threeD?.spatial;
            return (
              s?.displayedBase === 'standard' &&
              s.imagery === 'ready' &&
              s.terrain === 'ready' &&
              s.buildings === 'ready'
            );
          },
          { timeout: 60000 },
        )
        .toBe(true);
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      const video = page.locator('.cockpit-pane');
      await video
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await video
        .getByRole('combobox', { name: 'Video Feed environment', exact: true })
        .selectOption('photorealistic');
      const aim = async () => {
        let pose = (await inspect()).video?.cockpit;
        if (
          pose?.headingTrueDeg < 180 &&
          (103.875 - pose.position.longitudeDeg) * 111000 < 20 * 22.23
        ) {
          await expect
            .poll(
              async () => (await inspect()).video?.cockpit?.headingTrueDeg,
              { timeout: 30000 },
            )
            .toBeGreaterThan(180);
          pose = (await inspect()).video.cockpit;
        }
        const options = video.locator('.cockpit-options');
        if ((await options.getAttribute('open')) === null)
          await options.locator('summary').click();
        const yaw = video.getByRole('slider', { name: 'Video Feed look yaw' });
        await yaw.focus();
        await yaw.press(pose.headingTrueDeg < 180 ? 'Home' : 'End');
        await yaw.press(pose.headingTrueDeg < 180 ? 'ArrowRight' : 'ArrowLeft');
        await options.locator('summary').click();
      };
      await aim();
      await expect
        .poll(
          async () => (await inspect()).video?.environment.photorealisticLoaded,
          { timeout: 60000 },
        )
        .toBe(true);
      result.loadedOnce = await inspect();
      await aim();
      await expect
        .poll(
          async () => (await inspect()).video?.videoOverlay.points.length ?? 0,
        )
        .toBeGreaterThan(0);
      await expect
        .poll(
          async () => (await inspect()).video?.videoOverlay.labels.length ?? 0,
        )
        .toBeGreaterThan(0);
      await page.waitForTimeout(2000);
      result.loadingMs = performance.now() - loadingStarted;
      await page.screenshot({ path: resolve(output, 'configured-before.png') });
      await page.waitForTimeout(1000);
      await page.bringToFront();
      const worldBefore = await ui.world(result.missionId),
        startState = await inspect();
      expect(startState.threeD.spatial.displayedBase).toBe('standard');
      expect(startState.threeD.spatial.imagery).toBe('ready');
      expect(startState.threeD.spatial.terrain).toBe('ready');
      expect(startState.threeD.spatial.buildings).toBe('ready');
      expect(startState.video.spatial.displayedBase).toBe('photorealistic');
      expect(startState.video.spatial.photorealistic).toBe('ready');
      expect(startState.video.environment.photoVisibleTiles).toBeGreaterThan(0);
      expect(startState.video.videoOverlay.points.length).toBeGreaterThan(0);
      expect(startState.video.videoOverlay.labels.length).toBeGreaterThan(0);
      const events = [],
        collect = (event) => events.push(...event.value);
      cdp.on('Tracing.dataCollected', collect);
      await cdp.send('Tracing.start', {
        categories:
          'devtools.timeline,benchmark,cc,viz,disabled-by-default-devtools.timeline.frame',
        transferMode: 'ReportEvents',
      });
      const before = await metrics();
      // No measurement-owned RAF, input, screenshots, probe or CPU profiler here.
      await page.waitForTimeout(12000);
      const after = await metrics();
      const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
      await cdp.send('Tracing.end');
      await done;
      cdp.off('Tracing.dataCollected', collect);
      const frames = events
        .filter(
          (e) =>
            e.name === 'Display::FrameDisplayed' &&
            e.ts >= before.Timestamp * 1e6 &&
            e.ts <= after.Timestamp * 1e6,
        )
        .map((e) => ({
          name: e.name,
          ts: e.ts,
          pid: e.pid,
          tid: e.tid,
          ph: e.ph,
        }));
      const times = frames.map((e) => e.ts / 1000).sort((a, b) => a - b),
        intervals = times.slice(1).map((t, i) => t - times[i]);
      const endState = await inspect(),
        worldAfter = await ui.world(result.missionId);
      const movingTracks = Object.values(worldBefore.tracks).filter(
        (t) =>
          JSON.stringify(t.latest.position) !==
          JSON.stringify(worldAfter.tracks[t.id].latest.position),
      ).length;
      result.sample = {
        name: '20v20-standard-3d-visible-google-video',
        windowMs: (after.Timestamp - before.Timestamp) * 1000,
        movingTracks,
        presentation: {
          frames: frames.length,
          fps:
            times.length > 1
              ? ((times.length - 1) * 1000) / (times.at(-1) - times[0])
              : null,
          intervalMs: quantiles(intervals),
          over16_9Ms: intervals.filter((n) => n > 16.9).length,
          missed144HzSlots: intervals.reduce(
            (sum, n) => sum + Math.max(0, Math.round(n / (1000 / 144)) - 1),
            0,
          ),
          stallsOver50Ms: intervals.filter((n) => n > 50).length,
        },
        taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        startState,
        endState,
      };
      writeFileSync(
        resolve(output, 'configured-display-events.json'),
        JSON.stringify(frames),
      );
      save();
      expect(movingTracks).toBe(40);
      expect(endState.threeD.spatial.displayedBase).toBe('standard');
      expect(endState.threeD.spatial.imagery).toBe('ready');
      expect(endState.threeD.spatial.terrain).toBe('ready');
      expect(endState.threeD.spatial.buildings).toBe('ready');
      expect(endState.video.spatial.displayedBase).toBe('photorealistic');
      expect(endState.video.spatial.photorealistic).toBe('ready');
      expect(endState.video.environment.photoVisibleTiles).toBeGreaterThan(0);
      expect(endState.video.videoOverlay.points.length).toBeGreaterThan(0);
      expect(endState.video.videoOverlay.labels.length).toBeGreaterThan(0);
      expect(endState.video.cockpit.headingTrueDeg).toBe(
        startState.video.cockpit.headingTrueDeg,
      );
      await page.screenshot({ path: resolve(output, 'configured-after.png') });
      result.endReceipt = await command('End demo', 'end');
      result.cases.push(
        'Loaded ordinary 3D imagery/terrain/buildings plus Google photorealistic Video, with nonzero visible overlays and forty moving tracks at unchanged heading.',
      );
      result.cases.push(
        'End accepted through actual UI; source hashes unchanged; own runtime/context cleanup follows.',
      );
      expect(result.errors).toEqual([]);
      result.passed = true;
    } catch (error) {
      result.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1600);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
      process.exitCode = 1;
    } finally {
      result.sourceAfter = hashes();
      result.sourceUnchanged =
        JSON.stringify(result.sourceBefore) ===
        JSON.stringify(result.sourceAfter);
      await context.close();
      await browser.close();
      save();
      globalThis.console.log(
        JSON.stringify({
          passed: result.passed,
          failure: result.failure,
          sourceUnchanged: result.sourceUnchanged,
          movingTracks: result.sample?.movingTracks,
          presentation: result.sample?.presentation,
          taskMs: result.sample?.taskMs,
        }),
      );
    }
  },
);
