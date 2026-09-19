// Foreground application regression/measurement harness. Never attaches to operator contexts.
/* global PerformanceObserver, performance, document, requestAnimationFrame, innerWidth, innerHeight, screen, devicePixelRatio, getComputedStyle, crypto */
import { URL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { performanceScenario } from './performance-scenario.mjs';

const tag = process.argv[2] ?? 'before';
const configured = process.argv.includes('--configured');
const previewDir = process.env.PERF_BUILD;
const duration = Number(process.env.PERF_WINDOW_MS ?? 12000);
const counts = (process.env.PERF_COUNTS ?? '1,10,20').split(',').map(Number);
const extra = process.env.PERF_EXTENDED === '1';
const viewport = {
  width: Number(process.env.PERF_WIDTH ?? 1440),
  height: Number(process.env.PERF_HEIGHT ?? 900),
};
const quantiles = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  return {
    count: values.length,
    median: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: q(1),
  };
};
await withD5Runtime(
  {
    phase: 'd6',
    tag: `perf-${tag}`,
    frontendPort: 5370,
    backendPort: 8170,
    configured,
    evidenceRoot: '../docs/performance-stability',
    ...(previewDir
      ? { previewDir, viteConfig: '.cache/performance-preview.mjs' }
      : {}),
    ...(process.env.PERF_BASELINE_BACKEND
      ? {
          backendDirectory:
            '../.cache/performance-stability/baseline-source/backend',
        }
      : {}),
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport,
      deviceScaleFactor: Number(process.env.PERF_DPR ?? 1),
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const u = d6UI(page, frontend);
    const r = {
      browser: browser.version(),
      configured,
      hardware:
        'i7-10700K, RTX 3060 driver 32.0.16.1088; physical 2560x1440 144 Hz; viewport/screen values below are browser emulation',
      mode: `foreground headed Edge; ${previewDir ?? 'development'} verification bundle`,
      providerReadinessCriterion:
        process.env.PERF_VISIBLE_PROVIDER === '1'
          ? 'ready displayed provider with resident bytes and visible tiles; moving tile requests may remain pending'
          : 'tilesLoaded checkpoint before each visible-overlay window; streaming may continue during measurement',
      samples: [],
      errors: [],
      capacity: [],
      network: {},
      commands: [],
      loading: [],
      networkFailures: [],
      overlaySetup: [],
    };
    const browserSession = await browser.newBrowserCDPSession();
    const systemInfo = await browserSession.send('SystemInfo.getInfo');
    r.gpu = {
      devices: systemInfo.gpu.devices,
      featureStatus: systemInfo.gpu.featureStatus,
      renderer: systemInfo.gpu.auxAttributes?.glRenderer,
    };
    let phase = 'loading';
    let providerRequests = 0;
    const providerRequestLimit = Number(
      process.env.PERF_MAX_PROVIDER_REQUESTS ?? Infinity,
    );
    page.on('pageerror', (e) =>
      r.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 220),
      ),
    );
    page.on('request', (req) => {
      const url = new URL(req.url());
      const key = `${phase} ${url.hostname === '127.0.0.1' ? 'local' : url.hostname}`;
      r.network[key] = (r.network[key] ?? 0) + 1;
      if (
        url.hostname !== '127.0.0.1' &&
        ++providerRequests > providerRequestLimit &&
        !r.providerBudgetExceeded
      ) {
        r.providerBudgetExceeded = {
          limit: providerRequestLimit,
          observed: providerRequests,
        };
        void page.close().catch(() => {});
      }
    });
    page.on('requestfailed', (req) => {
      r.networkFailures.push({
        phase,
        host: new URL(req.url()).hostname,
        reason: req.failure()?.errorText,
      });
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
    const inspect = () =>
      page.evaluate(() => ({
        tactical: globalThis.__sentinelMapTest?.inspect('tactical'),
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
      }));
    await page.addInitScript(() => {
      globalThis.__perf = {
        frames: [],
        longTasks: [],
        arrivals: [],
        input: [],
      };
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          globalThis.__perf.longTasks.push({
            start: e.startTime,
            duration: e.duration,
          });
      }).observe({ type: 'longtask', buffered: true });
      const OriginalSocket = globalThis.WebSocket;
      globalThis.WebSocket = class extends OriginalSocket {
        constructor(...args) {
          super(...args);
          if (String(args[0]).includes('/api/missions/'))
            this.addEventListener('message', (event) => {
              const at = performance.now();
              const value = JSON.parse(event.data);
              const f = value.frame ?? value;
              globalThis.__perf.arrivals.push({
                at,
                wall: Date.now(),
                type: value.type,
                sequence: value.sequence,
                serverTime: value.serverTime,
                recordedAt: f.recordedAt,
                effectiveAt: f.effectiveAt,
                bytes: event.data.length,
              });
            });
        }
      };
      document.addEventListener(
        'pointerdown',
        () => {
          const at = performance.now();
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              globalThis.__perf.input.push(performance.now() - at),
            ),
          );
        },
        true,
      );
    });
    const measure = async (label) => {
      phase = label;
      await page.bringToFront();
      const requiresOverlay =
        process.env.PERF_LOOK_NORTH === '1' &&
        label.includes('video') &&
        !label.includes('no-overlays');
      if (requiresOverlay) {
        let pose = (await inspect()).video?.cockpit;
        // The supported schedule reverses on its second leg. Look toward the
        // formation using the real yaw control; never alter an entity or clock.
        // If a turn is imminent, wait for it before the measured window.
        const imminentTurn =
          pose?.headingTrueDeg < 180 &&
          (103.875 - pose.position.longitudeDeg) * 111000 <
            (duration / 1000 + 3) * 22.23;
        if (imminentTurn) {
          await expect
            .poll(
              async () => (await inspect()).video?.cockpit?.headingTrueDeg,
              {
                timeout: 35000,
              },
            )
            .toBeGreaterThan(180);
          pose = (await inspect()).video.cockpit;
        }
        const video = page.locator('.cockpit-pane');
        const options = video.locator('.cockpit-options');
        const yaw = video.getByRole('slider', {
          name: 'Video Feed look yaw',
          includeHidden: true,
        });
        if (
          Number(await yaw.inputValue()) !==
          (pose.headingTrueDeg < 180 ? -85 : 85)
        ) {
          if ((await options.getAttribute('open')) === null)
            await options.locator('summary').click();
          await yaw.focus();
          await yaw.press(pose.headingTrueDeg < 180 ? 'Home' : 'End');
          await yaw.press(
            pose.headingTrueDeg < 180 ? 'ArrowRight' : 'ArrowLeft',
          );
          await options.locator('summary').click();
        }
        await expect
          .poll(async () => (await inspect()).video?.videoOverlay.labels.length)
          .toBeGreaterThan(0);
        r.overlaySetup.push({
          label,
          heading: pose.headingTrueDeg,
          waitedForTurn: imminentTurn,
        });
        if (configured) {
          const loadingStarted = performance.now();
          await expect
            .poll(
              async () => {
                const v = (await inspect()).video;
                return process.env.PERF_VISIBLE_PROVIDER === '1'
                  ? v?.spatial.photorealistic === 'ready' &&
                      v.environment.photoVisibleTiles > 0 &&
                      v.environment.photorealisticBytes > 0
                  : v?.environment.photorealisticLoaded;
              },
              {
                timeout:
                  process.env.PERF_VISIBLE_PROVIDER === '1' ? 15000 : 45000,
              },
            )
            .toBe(true);
          r.loading.push({
            workload: label,
            providerReadyWaitMs: performance.now() - loadingStarted,
            provider: 'Google photorealistic 3D',
          });
        }
        await page.waitForTimeout(700);
      }
      const start = await inspect();
      if (requiresOverlay) {
        expect(start.video?.videoOverlay.points.length).toBeGreaterThan(0);
        expect(start.video?.videoOverlay.labels.length).toBeGreaterThan(0);
      }
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.start');
      const trace = [];
      const traceListener = (event) => trace.push(...event.value);
      cdp.on('Tracing.dataCollected', traceListener);
      await cdp.send('Tracing.start', {
        categories:
          'devtools.timeline,benchmark,cc,viz,disabled-by-default-devtools.timeline.frame',
        transferMode: 'ReportEvents',
      });
      const before = await metrics();
      const pacing = await page.evaluate(async (ms) => {
        const begin = performance.now(),
          times = [];
        await new Promise((done) => {
          const tick = (at) => {
            times.push(at);
            if (at - begin < ms) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });
        return {
          begin,
          end: performance.now(),
          times,
          visibility: document.visibilityState,
          focused: document.hasFocus(),
          resolution: [innerWidth, innerHeight],
          screen: [screen.width, screen.height],
          dpr: devicePixelRatio,
          longTasks: globalThis.__perf.longTasks.filter(
            (t) => t.start >= begin,
          ),
          arrivals: globalThis.__perf.arrivals.filter((t) => t.at >= begin),
        };
      }, duration);
      const after = await metrics();
      const traceComplete = new Promise((ok) =>
        cdp.once('Tracing.tracingComplete', ok),
      );
      await cdp.send('Tracing.end');
      await traceComplete;
      cdp.off('Tracing.dataCollected', traceListener);
      const profile = (await cdp.send('Profiler.stop')).profile;
      const end = await inspect();
      if (requiresOverlay) {
        expect(end.video?.videoOverlay.points.length).toBeGreaterThan(0);
        expect(end.video?.videoOverlay.labels.length).toBeGreaterThan(0);
        expect(end.video?.cockpit.headingTrueDeg).toBe(
          start.video?.cockpit.headingTrueDeg,
        );
      }
      const safe = (value) =>
        JSON.stringify(value).replace(/(https?:[^"\s?]*)[?][^"\s]*/g, '$1');
      writeFileSync(resolve(output, `${label}-cpu.json`), safe(profile));
      // Retain only presentation/frame timing events, never resource URLs or trace screenshots.
      const frameEvents = trace.filter((e) =>
        /FramePresented|FrameDisplayed|DrawFrame|Display::DrawAndSwap|PipelineReporter|FrameSequenceTracker|SubmitCompositorFrame|BeginFrame|DroppedFrame/.test(
          e.name,
        ),
      );
      writeFileSync(resolve(output, `${label}-frames.json`), safe(frameEvents));
      const intervals = pacing.times
        .slice(1)
        .map((t, i) => t - pacing.times[i]);
      const presented = frameEvents
        .filter(
          (e) =>
            e.name === 'Display::FrameDisplayed' &&
            e.ts >= before.Timestamp * 1e6 &&
            e.ts <= after.Timestamp * 1e6,
        )
        .map((e) => e.ts / 1000)
        .sort((a, b) => a - b);
      const presentedIntervals = presented
        .slice(1)
        .map((at, i) => at - presented[i]);
      const record = {
        label,
        pacing: {
          ...pacing,
          times: undefined,
          arrivals: undefined,
          intervals: quantiles(intervals),
          over16_7Ms: intervals.filter((t) => t > 16.9).length,
          stallsOver50Ms: intervals.filter((t) => t > 50).length,
        },
        arrivalIntervals: quantiles(
          pacing.arrivals
            .filter((a) => a.type !== 'heartbeat')
            .slice(1)
            .map(
              (a, i) =>
                a.at -
                pacing.arrivals.filter((a) => a.type !== 'heartbeat')[i].at,
            ),
        ),
        incoming: pacing.arrivals,
        taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        compositor: {
          count: presented.length,
          fps:
            ((presented.length - 1) * 1000) / (presented.at(-1) - presented[0]),
          intervals: quantiles(presentedIntervals),
          estimatedMissed144HzSlots: presentedIntervals.reduce(
            (sum, dt) => sum + Math.max(0, Math.round(dt / (1000 / 144)) - 1),
            0,
          ),
          over16_7Ms: presentedIntervals.filter((t) => t > 16.9).length,
          stallsOver50Ms: presentedIntervals.filter((t) => t > 50).length,
        },
        publicationAgeMs: quantiles(
          pacing.arrivals
            .filter((a) => a.recordedAt)
            .map((a) => a.wall - Date.parse(a.recordedAt)),
        ),
        simulationClockAgeMs: quantiles(
          pacing.arrivals
            .filter((a) => a.effectiveAt)
            .map((a) => a.wall - Date.parse(a.effectiveAt)),
        ),
        heapBefore: before.JSHeapUsedSize,
        heapAfter: after.JSHeapUsedSize,
        nodesBefore: before.Nodes,
        nodesAfter: after.Nodes,
        before: start,
        after: end,
        traceEventCounts: Object.fromEntries(
          [...new Set(frameEvents.map((e) => e.name))].map((name) => [
            name,
            frameEvents.filter((e) => e.name === name).length,
          ]),
        ),
      };
      r.samples.push(record);
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          label,
          intervals: record.pacing.intervals,
          taskMs: record.taskMs,
          layoutMs: record.layoutMs,
          traceEvents: record.traceEventCounts,
        }),
      );
      phase = 'between';
    };
    const diagnoseMotion = async (label) => {
      // Separate diagnostic: queries add overhead, so these are not the FPS run.
      r.samples.at(-1).motionDiagnostic = await page.evaluate(async () => {
        const begin = performance.now(),
          changes = [],
          ages = [],
          bounds = new Set(),
          hidden = [];
        let prior = '';
        await new Promise((done) => {
          const tick = () => {
            const map = globalThis.__sentinelMapTest?.inspect('tactical');
            if (map?.renderer.active) {
              const p =
                map.renderedPoints?.find((p) => p.id === map.selectedId) ??
                map.renderedPoints?.[0];
              const value = JSON.stringify(p);
              if (value !== prior) {
                changes.push(performance.now());
                prior = value;
              }
              const sent = globalThis.__perf.arrivals.findLast(
                (a) => a.sequence === map.sequence,
              );
              if (sent) ages.push(performance.now() - sent.at);
            }
            const e = document.querySelector('.cockpit-scene'),
              root = document.querySelector('.video-entity-overlay');
            if (e) {
              const b = e.getBoundingClientRect();
              bounds.add(JSON.stringify([b.x, b.y, b.width, b.height]));
              if (root && getComputedStyle(root).visibility === 'hidden')
                hidden.push(performance.now());
            }
            if (performance.now() - begin < 3000) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });
        return {
          durationMs: performance.now() - begin,
          geometryChangeTimes: changes,
          appliedFrameArrivalAges: ages,
          uniqueSceneBounds: bounds.size,
          overlayHiddenSamples: hidden.length,
        };
      });
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          diagnostic: label,
          changes: r.samples.at(-1).motionDiagnostic.geometryChangeTimes.length,
          hidden: r.samples.at(-1).motionDiagnostic.overlayHiddenSamples,
        }),
      );
    };
    const acknowledgedAction = async (label, target) => {
      const begin = performance.now();
      const reply = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          response.url().endsWith('/commands') &&
          response.request().postDataJSON()?.intent?.action === target,
      );
      await u.action(label);
      const receipt = await (await reply).json();
      r.commands.push({
        operation: target,
        latencyMs: performance.now() - begin,
        accepted: receipt.accepted,
      });
      expect(receipt.accepted).toBe(true);
    };
    try {
      for (const n of counts) {
        const setupStarted = performance.now();
        const label = n ? `${n}v${n}` : 'existing-demo-6';
        if (n) {
          const content = performanceScenario(n);
          const reply = await page.request.post(frontend + '/api/scenarios', {
            data: {
              requestId: crypto.randomUUID(),
              expectedRevision: 0,
              content,
            },
          });
          r.capacity.push({ perSide: n, status: reply.status() });
          if (!reply.ok()) continue;
          await page.goto(frontend);
          await page
            .getByRole('button', { name: 'Load mission', exact: true })
            .click();
          await page
            .getByRole('menuitem', {
              name: new RegExp(`${content.name} · r1.*Saved plan`),
            })
            .click();
          const conductor = page.locator('[data-view="conductor"]');
          await conductor
            .getByRole('button', {
              name: 'Validate saved revision',
              exact: true,
            })
            .click();
          await expect(conductor).toContainText('Ready to run');
          await conductor
            .getByRole('button', { name: 'Run saved revision 1', exact: true })
            .click();
          await page.locator('[data-run-state="running"]').first().waitFor();
          await u.tab('Conductor', 'Close view');
          await u.select('Friendly 01');
        } else {
          r.capacity.push({ template: 'singapore-local-v2', status: 200 });
          await page.goto(frontend);
          await u.action('New demo');
          await page.locator('[data-run-state="running"]').first().waitFor();
          await u.select('F-01', 'F-02');
        }
        await page.evaluate(
          ({ n, wide }) =>
            globalThis.__sentinelMapTest.setCamera('tactical', {
              center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
              groundSpanM: n ? (wide ? 7000 : 3500) : 12000,
              headingTrueDeg: 0,
              pitchFromNadirDeg: 0,
            }),
          { n, wide: process.env.PERF_LAYOUT_ONLY === '1' },
        );
        if (!n) {
          const surface = page.locator('[data-view-id="tactical"] .map-canvas');
          const box = await surface.boundingBox();
          const response = page.waitForResponse(
            (r) =>
              r.url().endsWith('/direct-moves') &&
              r.request().method() === 'POST',
          );
          await surface.click({
            button: 'right',
            position: { x: box.width * 0.85, y: box.height * 0.6 },
          });
          expect((await (await response).json()).accepted).toBe(true);
        }
        await page.waitForTimeout(2500);
        r.loading.push({
          workload: label,
          setupToWarmTacticalMs: performance.now() - setupStarted,
          navigation: await page.evaluate(() => {
            const entry = performance.getEntriesByType('navigation')[0];
            return {
              responseEnd: entry.responseEnd,
              domContentLoaded: entry.domContentLoadedEventEnd,
              loadEventEnd: entry.loadEventEnd,
            };
          }),
          state: await inspect(),
          note: 'Fresh context navigation; setup includes saved-plan/new-demo UI and 2.5 second warmup. Provider warmup after 3D/Video is separate.',
        });
        if (process.env.PERF_LAYOUT_ONLY !== '1') {
          await measure(`${label}-tactical`);
          await diagnoseMotion(`${label}-tactical`);
        }
        await page.screenshot({
          path: resolve(output, `${label}-tactical.png`),
        });
        const map = page.locator('[data-view-id="tactical"]');
        await map.getByRole('button', { name: '3D', exact: true }).click();
        await page.waitForTimeout(configured ? 12000 : 3500);
        if (process.env.PERF_LAYOUT_ONLY !== '1') await measure(`${label}-3d`);
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
        if (process.env.PERF_LOOK_NORTH === '1') {
          await video.locator('.cockpit-options > summary').click();
          const yaw = video.getByRole('slider', {
            name: 'Video Feed look yaw',
          });
          await yaw.focus();
          await yaw.press('Home');
          await yaw.press('ArrowRight');
          await video.locator('.cockpit-options > summary').click();
        }
        await page.waitForTimeout(configured ? 12000 : 3000);
        if (process.env.PERF_LAYOUT_ONLY !== '1') {
          await measure(`${label}-3d-video`);
          await diagnoseMotion(`${label}-3d-video`);
        }
        await page.screenshot({
          path: resolve(output, `${label}-3d-video.png`),
        });
        if (process.env.PERF_LAYOUT_WINDOWS && n === 20) {
          for (const width of process.env.PERF_LAYOUT_WINDOWS.split(',').map(
            Number,
          )) {
            const height = width === 3840 ? 2160 : width === 2560 ? 1440 : 900;
            await page.setViewportSize({ width, height });
            await page.waitForTimeout(1500);
            await measure(`${label}-${width}x${height}-3d-video`);
            await page.screenshot({
              path: resolve(output, `${label}-${width}x${height}.png`),
            });
          }
          await page.setViewportSize(viewport);
        }
        if (extra) {
          await video
            .getByRole('checkbox', { name: 'Simulated entities', exact: true })
            .uncheck();
          await measure(`${label}-3d-video-no-overlays`);
          await video
            .getByRole('checkbox', { name: 'Simulated entities', exact: true })
            .check();
          await map
            .getByRole('button', { name: 'Tactical', exact: true })
            .click();
          // The later pane window occurs after the group has spread along its
          // supported route. Keep both groups in this matched measured view.
          await page.evaluate(() =>
            globalThis.__sentinelMapTest.setCamera('tactical', {
              center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
              groundSpanM: 7000,
              headingTrueDeg: 0,
              pitchFromNadirDeg: 0,
            }),
          );
          await page.waitForTimeout(2000);
          await measure(`${label}-tactical-video`);
          await u.tab('Tactical Map', 'Close view');
          await page.waitForTimeout(1000);
          await measure(`${label}-video`);
        }
        const first = await u.world();
        await page.waitForTimeout(600);
        const last = await u.world();
        const moving = Object.values(first.tracks).filter((t) => {
          const b = last.tracks[t.id]?.latest.position;
          return (
            b &&
            (b.longitudeDeg !== t.latest.position.longitudeDeg ||
              b.latitudeDeg !== t.latest.position.latitudeDeg)
          );
        });
        r.capacity.at(-1).movingTracks = moving.length;
        await acknowledgedAction('Pause', 'pause');
        await page.locator('[data-run-state="paused"]').first().waitFor();
        await acknowledgedAction('Resume', 'resume');
        await page.locator('[data-run-state="running"]').first().waitFor();
        await acknowledgedAction('End demo', 'end');
        await expect
          .poll(
            async () =>
              (
                await (
                  await page.request.get(frontend + '/api/interactive/entry')
                ).json()
              ).activeMissionId,
          )
          .toBeFalsy();
      }
      r.passed = r.errors.length === 0;
    } catch (error) {
      r.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1500);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      mkdirSync(output, { recursive: true });
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          passed: r.passed,
          failure: r.failure,
          capacity: r.capacity,
          errors: r.errors,
        }),
      );
    }
  },
);
