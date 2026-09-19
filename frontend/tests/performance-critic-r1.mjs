// Independent reviewer harness. Production code is unchanged.
/* global window, document, performance, requestAnimationFrame */
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';

const q = (input) => {
  const values = [...input].sort((a, b) => a - b);
  const at = (p) =>
    values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? null;
  return {
    count: values.length,
    median: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: at(1),
  };
};
const sha = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const sourceFiles = Object.keys(
  JSON.parse(
    readFileSync('../docs/performance-stability/baseline-source.json', 'utf8'),
  ),
).filter((f) => f.startsWith('frontend/src/') || f.startsWith('backend/app/'));
sourceFiles.push('backend/app/domain/capacity.py');
const hashes = () =>
  Object.fromEntries(sourceFiles.map((f) => [f, sha(resolve('..', f))]));
const continuation = process.env.CRITIC_CONTINUATION === '1';

await withD5Runtime(
  {
    phase: 'd6',
    tag:
      process.env.CRITIC_TAG ??
      (continuation ? 'perf-critic-r1-continuation' : 'perf-critic-r1'),
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
      deviceScaleFactor: 1,
    });
    const page = await context.newPage(),
      u = d6UI(page, frontend);
    page.setDefaultTimeout(25000);
    const report = {
      browser: browser.version(),
      headed: true,
      measurementOwnedRAF: false,
      viewport: { width: 1440, height: 900 },
      provider: 'blank grid',
      cases: [],
      errors: [],
      samples: [],
      commands: [],
      layouts: [],
      sourceBefore: hashes(),
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
    const shot = (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    const check = (text) => {
      report.cases.push(text);
      globalThis.console.log(text);
      save();
    };
    page.on('pageerror', (e) =>
      report.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 220),
      ),
    );
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      globalThis.__criticArrival = undefined;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', (e) => {
            try {
              const value = JSON.parse(e.data);
              if (value.type !== 'heartbeat')
                globalThis.__criticArrival = {
                  at: performance.now(),
                  sequence: value.sequence,
                  frameId: value.frameId ?? value.frame?.frameId,
                  missionId: value.missionId,
                };
            } catch {
              /* Diagnostics never alter transport. */
            }
          });
        }
      };
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
        map: globalThis.__sentinelMapTest?.inspect('tactical'),
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
        arrival: globalThis.__criticArrival,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
      }));
    const measure = async (label, duration = 10000) => {
      if (continuation && !label.includes('visible-overlay')) return;
      await page.bringToFront();
      const startState = await inspect(),
        events = [];
      const listener = (event) => events.push(...event.value);
      cdp.on('Tracing.dataCollected', listener);
      await cdp.send('Tracing.start', {
        categories:
          'devtools.timeline,benchmark,cc,viz,disabled-by-default-devtools.timeline.frame',
        transferMode: 'ReportEvents',
      });
      const before = await metrics();
      // No evaluation/RAF, renderer probe, screenshot or input inside this window.
      await page.waitForTimeout(duration);
      const after = await metrics();
      const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
      await cdp.send('Tracing.end');
      await done;
      cdp.off('Tracing.dataCollected', listener);
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
      const endState = await inspect();
      const sample = {
        label,
        windowMs: (after.Timestamp - before.Timestamp) * 1000,
        compositor: {
          count: times.length,
          fps:
            times.length > 1
              ? ((times.length - 1) * 1000) / (times.at(-1) - times[0])
              : null,
          intervals: q(intervals),
          over16_7Ms: intervals.filter((x) => x > 16.9).length,
          stallsOver50Ms: intervals.filter((x) => x > 50).length,
        },
        taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        heapBefore: before.JSHeapUsedSize,
        heapAfter: after.JSHeapUsedSize,
        startState,
        endState,
      };
      report.samples.push(sample);
      save();
      writeFileSync(
        resolve(output, `${label}-display-events.json`),
        JSON.stringify(frames),
      );
      globalThis.console.log(
        JSON.stringify({
          label,
          compositor: sample.compositor,
          taskMs: sample.taskMs,
        }),
      );
    };
    const command = async (
      label,
      operation,
      callback = () => u.action(label),
    ) => {
      const started = performance.now();
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === operation,
      );
      await callback();
      const receipt = await (await response).json();
      expect(receipt.accepted).toBe(true);
      report.commands.push({
        operation,
        elapsedMs: performance.now() - started,
        accepted: receipt.accepted,
        sequence: receipt.sequence,
        affected:
          receipt.controlOutcomes?.length ?? receipt.behaviorOutcomes?.length,
      });
      save();
      return receipt;
    };
    try {
      await loadPerformanceScenario(page, frontend, 20);
      await u.tab('Conductor', 'Close view');
      await u.select('Friendly 01');
      await page.evaluate(() =>
        globalThis.__sentinelMapTest.setCamera('tactical', {
          center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
          groundSpanM: 3500,
          headingTrueDeg: 0,
          pitchFromNadirDeg: 0,
        }),
      );
      const first = await u.world();
      report.missionId = first.mission.id;
      await page.waitForTimeout(700);
      const moving = await u.world();
      const changed = Object.values(first.tracks).filter(
        (t) =>
          JSON.stringify(t.latest.position) !==
          JSON.stringify(moving.tracks[t.id].latest.position),
      );
      expect(changed).toHaveLength(40);
      expect(moving.interactive.controls).toHaveLength(20);
      check(
        'Own Conductor validation/Run loaded 20 Friendly plus 20 Hostile; all 40 authoritative tracks moved and only 20 Friendly controls exist.',
      );
      await page.waitForTimeout(2000);
      await measure('20v20-tactical');
      await shot('01-tactical');
      report.motion = await page.evaluate(async () => {
        const rows = [],
          start = performance.now();
        await new Promise((done) => {
          const tick = () => {
            const state = globalThis.__sentinelMapTest.inspect('tactical'),
              arrival = globalThis.__criticArrival;
            const p =
              state.renderedPoints.find((p) => p.id === state.selectedId) ??
              state.renderedPoints[0];
            rows.push({
              at: performance.now(),
              appliedSequence: state.sequence,
              arrivalSequence: arrival?.sequence,
              domSequence: document
                .querySelector('[data-view-id="tactical"]')
                ?.getAttribute('data-sequence'),
              sourceLoaded: state.renderer.sourceLoaded,
              renderedFrames: state.renderer.renderedFrames,
              point: p,
            });
            if (performance.now() - start < 4000) requestAnimationFrame(tick);
            else done();
          };
          requestAnimationFrame(tick);
        });
        return rows;
      });
      save();
      await command('Pause', 'pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      const paused = await u.world();
      await page.waitForTimeout(700);
      expect((await u.world()).tracks).toEqual(paused.tracks);
      await measure('paused-tactical-negative-control', 5000);
      check(
        'Pause froze every authoritative track; independent paused compositor window provides an idle negative control.',
      );
      await command('Resume', 'resume');
      const map = page.locator('[data-view-id="tactical"]');
      await map.getByRole('button', { name: '3D', exact: true }).click();
      await page.waitForTimeout(3000);
      await measure('20v20-3d');
      await shot('02-3d');
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
      await page.waitForTimeout(3000);
      await measure('20v20-3d-video');
      await shot('03-3d-video');
      if (continuation) {
        await video.locator('.cockpit-options > summary').click();
        const yaw = video.getByRole('slider', { name: 'Video Feed look yaw' });
        await yaw.focus();
        await yaw.press('Home');
        await yaw.press('ArrowRight');
        await video.locator('.cockpit-options > summary').click();
        await expect
          .poll(async () => (await inspect()).video.videoOverlay.points.length)
          .toBeGreaterThan(0);
        await expect
          .poll(async () => (await inspect()).video.videoOverlay.labels.length)
          .toBeGreaterThan(0);
        await measure('20v20-3d-video-visible-overlay');
        expect(
          (await inspect()).video.videoOverlay.points.length,
        ).toBeGreaterThan(0);
        await shot('03b-visible-overlay');
      }
      await video
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .uncheck();
      await expect(page.locator('.video-entity-overlay > g')).toHaveCount(0);
      await video
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .check();
      check(
        'Opened actual 3D and Video Feed beside it; overlay toggle removes and restores the layer.',
      );
      for (const width of [760, 820, 900]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(350);
        const layout = await page.evaluate(() => {
          const b = document
            .querySelector('.cockpit-scene')
            .getBoundingClientRect();
          return {
            documentWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            scene: { x: b.x, y: b.y, width: b.width, height: b.height },
          };
        });
        expect(layout.scrollWidth).toBeLessThanOrEqual(width + 1);
        expect(layout.scene.height).toBeGreaterThan(0);
        report.layouts.push({ width, ...layout });
        await shot(`layout-${width}`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('tab', { name: /^(Tactical Map|3D Map)$/ }).click();
      await page
        .getByRole('button', { name: 'Show Views list', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Open Tracks from Views', exact: true })
        .click();
      await page.waitForTimeout(400);
      const hiddenBefore = await inspect();
      await page.waitForTimeout(1200);
      const hiddenAfter = await inspect();
      expect(hiddenAfter.threeD.active).toBe(false);
      expect(hiddenAfter.threeD.environment.renderedFrames).toBe(
        hiddenBefore.threeD.environment.renderedFrames,
      );
      report.hidden = { before: hiddenBefore, after: hiddenAfter };
      await page.getByRole('tab', { name: /^(Tactical Map|3D Map)$/ }).click();
      await page.waitForTimeout(500);
      expect((await inspect()).threeD.active).toBe(true);
      check(
        'Hidden 3D render count remained fixed and reopened renderer was active; 760/820/900 layouts stayed within document width.',
      );
      await u.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await command('Stop selected', 'stop', () =>
        u.fleet
          .getByRole('button', { name: 'Stop selected', exact: true })
          .click(),
      );
      const stopped = await u.world();
      await page.waitForTimeout(700);
      const later = await u.world();
      for (const track of Object.values(stopped.tracks))
        expect(
          JSON.stringify(track.latest.position) ===
            JSON.stringify(later.tracks[track.id].latest.position),
        ).toBe(stopped.entities[track.entityId].affiliation === 'friendly');
      await u.behavior('intercept');
      const intercepted = await u.world();
      expect(intercepted.fleetBehavior.members).toHaveLength(20);
      expect(
        intercepted.fleetBehavior.members.every(
          (m) => intercepted.entities[m.entityId].affiliation === 'friendly',
        ),
      ).toBe(true);
      check(
        'Stop selected affected all 20 Friendly while all 20 Hostile kept moving; existing Intercept accepted for 20 Friendly only.',
      );
      await command('Pause', 'pause');
      await restartBackend();
      await expect
        .poll(
          async () => {
            try {
              return (await u.world(report.missionId)).interactive.state;
            } catch {
              return undefined;
            }
          },
          { timeout: 30000 },
        )
        .toBe('paused');
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }).first(),
      ).toBeEnabled({ timeout: 30000 });
      report.afterRestart = await u.world(report.missionId);
      expect(Object.keys(report.afterRestart.entities)).toHaveLength(40);
      check(
        'Sole backend restarted on owned database; 40-entity recording recovered paused and control reconciled.',
      );
      await command('End demo', 'end');
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      await page.locator('[data-run-state="ended"]').first().waitFor();
      const ended = await u.world(report.missionId);
      expect(Object.keys(ended.entities)).toHaveLength(40);
      expect(ended.interactive.state).toBe('ended');
      await shot('04-recording-reopened');
      check(
        'End was acknowledged; Previous demos reopened the saved 40-entity recording after page reload.',
      );
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (error) {
      report.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1800);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      report.sourceAfter = hashes();
      report.sourceUnchanged =
        JSON.stringify(report.sourceBefore) ===
        JSON.stringify(report.sourceAfter);
      await context.close();
      await browser.close();
      save();
      globalThis.console.log(
        JSON.stringify({
          passed: report.passed,
          failure: report.failure,
          cases: report.cases.length,
          sourceUnchanged: report.sourceUnchanged,
        }),
      );
    }
  },
);
