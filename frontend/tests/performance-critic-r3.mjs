// Third independent critic: real provider display pacing and lifecycle challenge.
/* global document, innerWidth, innerHeight, devicePixelRatio */
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';

const sourceFiles = Object.keys(
  JSON.parse(
    readFileSync('../docs/performance-stability/baseline-source.json'),
  ),
).filter((p) => p.startsWith('backend/app/') || p.startsWith('frontend/src/'));
sourceFiles.push('backend/app/domain/capacity.py');
const hashes = () =>
  Object.fromEntries(
    sourceFiles.map((p) => [
      p,
      createHash('sha256')
        .update(readFileSync(resolve('..', p)))
        .digest('hex'),
    ]),
  );
const quantiles = (values) => {
  const ordered = [...values].sort((a, b) => a - b);
  const at = (p) =>
    ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * p))] ??
    null;
  return { median: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) };
};
const changed = (a, b) =>
  Object.values(a.tracks).filter(
    (t) =>
      JSON.stringify(t.latest.position) !==
      JSON.stringify(b.tracks[t.id].latest.position),
  );

await withD5Runtime(
  {
    phase: 'd6',
    tag: process.env.PERF_TAG ?? 'perf-critic-r3',
    frontendPort: 5382,
    backendPort: 8182,
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
    const ui = d6UI(page, frontend);
    const result = {
      browser: browser.version(),
      headed: true,
      measurementOwnedRAF: false,
      cpuProfiler: false,
      videoRecordingDuringMeasurement: false,
      provider: 'Cesium standard map and Google photorealistic Video',
      sourceBefore: hashes(),
      errors: [],
      networkFailures: [],
      httpErrors: [],
      cases: [],
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
    const inspect = () =>
      page.evaluate(() => ({
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
        stats: globalThis.__sentinelCesiumTest?.stats(),
        visible: document.visibilityState,
        focused: document.hasFocus(),
        viewport: {
          width: innerWidth,
          height: innerHeight,
          dpr: devicePixelRatio,
        },
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
    page.on('pageerror', (error) =>
      result.errors.push(
        error.name +
          ': ' +
          error.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 200),
      ),
    );
    page.on('requestfailed', (request) =>
      result.networkFailures.push({
        host: new URL(request.url()).hostname,
        reason: request.failure()?.errorText,
      }),
    );
    page.on('response', (response) => {
      if (response.status() >= 400)
        result.httpErrors.push({
          host: new URL(response.url()).hostname,
          status: response.status(),
        });
    });
    const command = async (label, action) => {
      const wait = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === action,
      );
      const started = Date.now();
      await ui.action(label);
      const receipt = await (await wait).json();
      expect(receipt.accepted).toBe(true);
      result.cases.push({
        command: action,
        ackMsIncludingMenu: Date.now() - started,
        receipt,
      });
      return receipt;
    };
    try {
      const start = Date.now();
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
      const ready3D = async () => {
        await expect
          .poll(
            async () => {
              const s = (await inspect()).threeD?.spatial;
              if (
                s?.displayedBase === 'standard' &&
                s.imagery === 'ready' &&
                s.terrain === 'ready' &&
                s.buildings === 'ready'
              )
                return 'ready';
              if (
                await page
                  .getByRole('button', { name: 'Retry renderer', exact: true })
                  .isVisible()
              )
                return 'failed';
              return 'loading';
            },
            { timeout: 60000 },
          )
          .not.toBe('loading');
        return !(await page
          .getByRole('button', { name: 'Retry renderer', exact: true })
          .isVisible());
      };
      if (!(await ready3D())) {
        result.initial3DStartup = {
          elapsedMs: Date.now() - start,
          state: await inspect(),
        };
        await page.screenshot({
          path: resolve(output, 'cold-start-failure.png'),
        });
        await page
          .getByRole('button', { name: 'Retry renderer', exact: true })
          .click();
        expect(await ready3D()).toBe(true);
        result.retryRecovered = {
          elapsedMs: Date.now() - start,
          state: await inspect(),
        };
      }
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
      const aimNorth = async () => {
        let p = (await inspect()).video?.cockpit;
        // Do not let a scripted turn reverse the sampled camera in the 12-second window.
        if (
          p?.headingTrueDeg < 180 &&
          (103.875 - p.position.longitudeDeg) * 111000 < 25 * 22.23
        ) {
          await expect
            .poll(
              async () => (await inspect()).video?.cockpit?.headingTrueDeg,
              { timeout: 35000 },
            )
            .toBeGreaterThan(180);
          p = (await inspect()).video.cockpit;
        }
        const options = video.locator('.cockpit-options');
        if ((await options.getAttribute('open')) === null)
          await options.locator('summary').click();
        const slider = video.getByRole('slider', {
          name: 'Video Feed look yaw',
          exact: true,
        });
        await slider.focus();
        await slider.press(p.headingTrueDeg < 180 ? 'Home' : 'End');
        await slider.press(p.headingTrueDeg < 180 ? 'ArrowRight' : 'ArrowLeft');
        await options.locator('summary').click();
      };
      await aimNorth();
      await expect
        .poll(
          async () => (await inspect()).video?.environment.photorealisticLoaded,
          { timeout: 60000 },
        )
        .toBe(true);
      await aimNorth();
      await expect
        .poll(
          async () => (await inspect()).video?.videoOverlay.labels.length ?? 0,
        )
        .toBeGreaterThan(0);
      await page.waitForTimeout(2000);
      result.loadingMs = Date.now() - start;
      await page.screenshot({
        path: resolve(output, '01-loaded-provider-before.png'),
      });
      await page.waitForTimeout(1000);
      await page.bringToFront();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Performance.enable');
      const metrics = async () =>
        Object.fromEntries(
          (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
            m.name,
            m.value,
          ]),
        );
      const worldA = await ui.world(result.missionId),
        stateA = await inspect();
      const assertLoaded = (s) => {
        expect(s.threeD.spatial.displayedBase).toBe('standard');
        expect(s.threeD.spatial.imagery).toBe('ready');
        expect(s.threeD.spatial.terrain).toBe('ready');
        expect(s.threeD.spatial.buildings).toBe('ready');
        expect(s.video.spatial.displayedBase).toBe('photorealistic');
        expect(s.video.spatial.photorealistic).toBe('ready');
        expect(s.video.environment.photoVisibleTiles).toBeGreaterThan(0);
        expect(s.video.environment.photorealisticCollision).toBe(false);
        expect(s.video.cockpit.collisionEnabled).toBe(false);
        expect(s.video.cockpit.actualPosition.height).toBeCloseTo(180, 5);
        expect(s.video.cockpit.actualPosition.longitudeDeg).toBeCloseTo(
          s.video.cockpit.position.longitudeDeg,
          7,
        );
        expect(s.video.cockpit.actualPosition.latitudeDeg).toBeCloseTo(
          s.video.cockpit.position.latitudeDeg,
          7,
        );
        expect(s.video.videoOverlay.points.length).toBeGreaterThan(0);
        expect(s.video.videoOverlay.labels.length).toBeGreaterThan(0);
        expect(s.visible).toBe('visible');
        expect(s.focused).toBe(true);
      };
      assertLoaded(stateA);
      const events = [],
        collect = (event) => events.push(...event.value);
      cdp.on('Tracing.dataCollected', collect);
      await cdp.send('Tracing.start', {
        categories:
          'devtools.timeline,benchmark,cc,viz,disabled-by-default-devtools.timeline.frame',
        transferMode: 'ReportEvents',
      });
      const a = await metrics();
      // Timed interval: no screenshot, RAF counter, probe polling, input or CPU sampling.
      await page.waitForTimeout(12000);
      const b = await metrics();
      const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
      await cdp.send('Tracing.end');
      await done;
      cdp.off('Tracing.dataCollected', collect);
      const frames = events
        .filter(
          (e) =>
            e.name === 'Display::FrameDisplayed' &&
            e.ts >= a.Timestamp * 1e6 &&
            e.ts <= b.Timestamp * 1e6,
        )
        .map((e) => ({
          name: e.name,
          ts: e.ts,
          pid: e.pid,
          tid: e.tid,
          ph: e.ph,
        }));
      const times = frames.map((e) => e.ts / 1000).sort((x, y) => x - y);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const stateB = await inspect(),
        worldB = await ui.world(result.missionId);
      result.sample = {
        windowMs: (b.Timestamp - a.Timestamp) * 1000,
        fps: ((times.length - 1) * 1000) / (times.at(-1) - times[0]),
        frames: times.length,
        intervalMs: quantiles(gaps),
        over16_9Ms: gaps.filter((x) => x > 16.9).length,
        stallsOver50Ms: gaps.filter((x) => x > 50).length,
        missed144HzSlots: gaps.reduce(
          (n, x) => n + Math.max(0, Math.round(x / (1000 / 144)) - 1),
          0,
        ),
        taskMs: (b.TaskDuration - a.TaskDuration) * 1000,
        layoutMs: (b.LayoutDuration - a.LayoutDuration) * 1000,
        movingTracks: changed(worldA, worldB).length,
        stateA,
        stateB,
      };
      result.performanceTargetMet =
        result.sample.fps >= 60 && result.sample.intervalMs.p95 <= 16.9;
      writeFileSync(
        resolve(output, 'display-events.json'),
        JSON.stringify(frames),
      );
      save();
      assertLoaded(stateB);
      expect(stateB.video.cockpit.headingTrueDeg).toBe(
        stateA.video.cockpit.headingTrueDeg,
      );
      expect(result.sample.movingTracks).toBe(40);
      await page.screenshot({
        path: resolve(output, '02-loaded-provider-after.png'),
      });
      await page.setViewportSize({ width: 820, height: 900 });
      await page.waitForTimeout(1200);
      result.narrow = await inspect();
      expect(result.narrow.overflow).toBe(false);
      await page.screenshot({ path: resolve(output, '03-width-820.png') });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForTimeout(800);
      await command('Pause', 'pause');
      const paused = await ui.world(result.missionId);
      await page.waitForTimeout(800);
      expect(changed(paused, await ui.world(result.missionId))).toHaveLength(0);
      await command('Resume', 'resume');
      await expect
        .poll(async () => (await inspect()).threeD?.retainable, {
          timeout: 30000,
        })
        .toBe(true);
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      await page
        .getByRole('button', { name: 'Show Views list', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Open Tracks from Views', exact: true })
        .click();
      await page.waitForTimeout(300);
      const hiddenA = await inspect();
      await page.waitForTimeout(1000);
      const hiddenB = await inspect();
      result.hidden = { before: hiddenA, after: hiddenB };
      expect(hiddenB.threeD.active).toBe(false);
      expect(hiddenB.threeD.environment.renderedFrames).toBe(
        hiddenA.threeD.environment.renderedFrames,
      );
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      await expect.poll(async () => (await inspect()).threeD.active).toBe(true);
      await page.screenshot({ path: resolve(output, '04-reopened-3d.png') });
      result.endReceipt = await command('End demo', 'end');
      const entry = await (
        await page.request.get(`${frontend}/api/interactive/entry`)
      ).json();
      expect(entry.activeMissionId).toBeFalsy();
      expect(result.errors).toEqual([]);
      result.functionalPassed = true;
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
      result.sourceAfter = hashes();
      result.sourceUnchanged =
        JSON.stringify(result.sourceBefore) ===
        JSON.stringify(result.sourceAfter);
      await context.close();
      await browser.close();
      save();
      globalThis.console.log(
        JSON.stringify({
          functionalPassed: result.functionalPassed,
          performanceTargetMet: result.performanceTargetMet,
          sourceUnchanged: result.sourceUnchanged,
          sample: result.sample && {
            fps: result.sample.fps,
            intervalMs: result.sample.intervalMs,
            taskMs: result.sample.taskMs,
            movingTracks: result.sample.movingTracks,
          },
          failure: result.failure,
        }),
      );
    }
  },
);
