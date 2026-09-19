// Independent round-two review harness. Never modifies production source/data.
/* global document, performance */
import { chromium, expect } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { performanceScenario } from './performance-scenario.mjs';

const sourceFiles = Object.keys(
  JSON.parse(
    readFileSync('../docs/performance-stability/baseline-source.json', 'utf8'),
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
const changedTracks = (a, b) =>
  Object.values(a.tracks).filter(
    (t) =>
      JSON.stringify(t.latest.position) !==
      JSON.stringify(b.tracks[t.id].latest.position),
  );

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'perf-critic-r2',
    frontendPort: 5381,
    backendPort: 8181,
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
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const ui = d6UI(page, frontend);
    const result = {
      browser: browser.version(),
      headed: true,
      provider: 'blank grid',
      viewport: { width: 1440, height: 900, dpr: 1 },
      measurementOwnedRAF: false,
      cases: [],
      samples: [],
      commands: [],
      layouts: [],
      errors: [],
      sourceBefore: hashes(),
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
    const check = (text) => {
      result.cases.push(text);
      save();
      globalThis.console.log(text);
    };
    const shot = (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    page.on('pageerror', (e) =>
      result.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 200),
      ),
    );
    const inspect = () =>
      page.evaluate(() => ({
        map: globalThis.__sentinelMapTest?.inspect('tactical'),
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
        visible: document.visibilityState,
        focused: document.hasFocus(),
      }));
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
    const measure = async (name, duration, active = true, overlays = false) => {
      await page.bringToFront();
      const worldBefore = await ui.world(result.missionId),
        startState = await inspect();
      if (overlays) {
        expect(startState.video.videoOverlay.points.length).toBeGreaterThan(0);
        expect(startState.video.videoOverlay.labels.length).toBeGreaterThan(0);
      }
      const events = [];
      const collect = (event) => events.push(...event.value);
      cdp.on('Tracing.dataCollected', collect);
      await cdp.send('Tracing.start', {
        categories:
          'devtools.timeline,benchmark,cc,viz,disabled-by-default-devtools.timeline.frame',
        transferMode: 'ReportEvents',
      });
      const before = await metrics();
      // No input, screenshots, RAF sampler, CPU profile, or renderer polling here.
      await page.waitForTimeout(duration);
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
      const times = frames.map((f) => f.ts / 1000).sort((a, b) => a - b);
      const intervals = times.slice(1).map((t, i) => t - times[i]);
      const endState = await inspect(),
        worldAfter = await ui.world(result.missionId);
      const moving = changedTracks(worldBefore, worldAfter).length;
      expect(moving).toBe(active ? 40 : 0);
      if (overlays) {
        expect(endState.video.videoOverlay.points.length).toBeGreaterThan(0);
        expect(endState.video.videoOverlay.labels.length).toBeGreaterThan(0);
      }
      const sample = {
        name,
        active,
        actualMovingTracks: moving,
        windowMs: (after.Timestamp - before.Timestamp) * 1000,
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
      result.samples.push(sample);
      writeFileSync(
        resolve(output, `${name}-display-events.json`),
        JSON.stringify(frames),
      );
      save();
      globalThis.console.log(
        JSON.stringify({ name, moving, presentation: sample.presentation }),
      );
    };
    const command = async (
      label,
      operation,
      perform = () => ui.action(label),
    ) => {
      const begin = performance.now();
      const pending = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === operation,
      );
      await perform();
      const receipt = await (await pending).json();
      expect(receipt.accepted).toBe(true);
      result.commands.push({
        operation,
        ms: performance.now() - begin,
        accepted: receipt.accepted,
        sequence: receipt.sequence,
        members:
          receipt.controlOutcomes?.length ?? receipt.behaviorOutcomes?.length,
      });
      save();
      return receipt;
    };
    try {
      const content = {
        ...performanceScenario(20),
        name: 'Independent critic round 2 20v20',
      };
      const response = await page.request.post(`${frontend}/api/scenarios`, {
        data: { requestId: randomUUID(), expectedRevision: 0, content },
      });
      expect(response.ok()).toBe(true);
      const saved = await response.json();
      expect(saved.schemaVersion).toBe('1.5');
      expect(saved.result.content.units).toHaveLength(40);
      let corruptedLists = 0;
      await page.route('**/api/scenarios', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const reply = await route.fetch();
        const body = await reply.json();
        body.schemaVersion = '1.4';
        corruptedLists++;
        await route.fulfill({ response: reply, json: body });
      });
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await expect.poll(() => corruptedLists).toBeGreaterThan(0);
      await page.waitForTimeout(500);
      await expect(
        page.getByRole('menuitem', {
          name: /Independent critic round 2 20v20/,
        }),
      ).toHaveCount(0);
      await shot('01-legacy-catalog-rejected');
      await page.unroute('**/api/scenarios');
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', {
          name: /Independent critic round 2 20v20.*Saved plan/,
        })
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
      check(
        'Actual optimized frontend rejects 1.4 catalog wrapping 1.5/40-unit data; restored 1.5 catalog loads, validates and runs through Conductor.',
      );
      await ui.tab('Conductor', 'Close view');
      await ui.select('Friendly 01');
      await page.evaluate(() =>
        globalThis.__sentinelMapTest.setCamera('tactical', {
          center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
          groundSpanM: 3500,
          headingTrueDeg: 0,
          pitchFromNadirDeg: 0,
        }),
      );
      const initial = await ui.world();
      result.missionId = initial.mission.id;
      expect(Object.keys(initial.entities)).toHaveLength(40);
      expect(initial.interactive.controls).toHaveLength(20);
      await page.waitForTimeout(2000);
      await measure('20v20-tactical', 12000);
      await shot('02-tactical-moving');
      await command('Pause', 'pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await measure('paused-negative-control', 4000, false);
      await command('Resume', 'resume');
      check(
        'Forty authoritative entities move; Pause freezes every track and the paused compositor control is measured separately.',
      );
      await page
        .locator('[data-view-id="tactical"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await page.waitForTimeout(2500);
      await measure('20v20-3d', 12000);
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
      await video.locator('.cockpit-options > summary').click();
      const yaw = video.getByRole('slider', { name: 'Video Feed look yaw' });
      await yaw.focus();
      await yaw.press('Home');
      await yaw.press('ArrowRight');
      await video.locator('.cockpit-options > summary').click();
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
      await page.waitForTimeout(1500);
      await measure('20v20-3d-visible-video', 12000, true, true);
      await shot('03-visible-overlays');
      await video
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .uncheck();
      await expect(page.locator('.video-entity-overlay > g')).toHaveCount(0);
      await video
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .check();
      await expect
        .poll(
          async () => (await inspect()).video?.videoOverlay.points.length ?? 0,
        )
        .toBeGreaterThan(0);
      check(
        'Visible Video overlay workload has nonzero markers and labels at both measurement endpoints; toggle clears and restores its content.',
      );
      for (const width of [760, 820, 900]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(400);
        const geometry = await page.evaluate(() => {
          const b = document
            .querySelector('.cockpit-scene')
            .getBoundingClientRect();
          return {
            documentWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            scene: { x: b.x, y: b.y, width: b.width, height: b.height },
          };
        });
        expect(geometry.scrollWidth).toBeLessThanOrEqual(width + 1);
        expect(geometry.scene.height).toBeGreaterThan(0);
        result.layouts.push({ width, ...geometry });
        await shot(`layout-${width}`);
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
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
      result.hidden = { before: hiddenBefore, after: hiddenAfter };
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      await expect.poll(async () => (await inspect()).threeD.active).toBe(true);
      check(
        'Narrow 760/820/900 layouts stay within document width; hidden 3D renderer does not advance, then resumes on reopening.',
      );
      await ui.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      const stoppedReceipt = await command('Stop selected', 'stop', () =>
        ui.fleet
          .getByRole('button', { name: 'Stop selected', exact: true })
          .click(),
      );
      expect(stoppedReceipt.controlOutcomes).toHaveLength(20);
      const stopped = await ui.world();
      await page.waitForTimeout(650);
      const later = await ui.world();
      expect(changedTracks(stopped, later)).toHaveLength(20);
      expect(
        changedTracks(stopped, later).every(
          (t) => stopped.entities[t.entityId].affiliation === 'hostile',
        ),
      ).toBe(true);
      await ui.behavior('intercept');
      const policy = await ui.world();
      expect(policy.fleetBehavior.members).toHaveLength(20);
      expect(
        policy.fleetBehavior.members.every(
          (m) => policy.entities[m.entityId].affiliation === 'friendly',
        ),
      ).toBe(true);
      check(
        'Stop selected halts all 20 Friendly while 20 Hostile keep moving; existing Intercept policy enrolls only the 20 Friendly.',
      );
      await command('Pause', 'pause');
      const epoch = (await ui.world()).interactive.executorEpoch;
      await restartBackend();
      await expect
        .poll(
          async () => {
            try {
              return (await ui.world(result.missionId)).interactive
                .executorEpoch;
            } catch {
              return epoch;
            }
          },
          { timeout: 30000 },
        )
        .not.toBe(epoch);
      await expect
        .poll(async () => (await ui.world(result.missionId)).interactive.state)
        .toBe('paused');
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }).first(),
      ).toBeEnabled({ timeout: 30000 });
      const recovered = await ui.world(result.missionId);
      expect(Object.keys(recovered.entities)).toHaveLength(40);
      result.recovery = {
        changedEpoch: recovered.interactive.executorEpoch !== epoch,
        entityCount: Object.keys(recovered.entities).length,
        state: recovered.interactive.state,
      };
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
      const ended = await ui.world(result.missionId);
      expect(ended.interactive.state).toBe('ended');
      expect(Object.keys(ended.entities)).toHaveLength(40);
      await shot('04-ended-recording');
      check(
        'Own sole-backend restart changes epoch and recovers forty entities paused; legitimate control returns, End is accepted, and Previous demos reopens the ended recording.',
      );
      // Separate short approach keeps outcome verification independent of the long
      // pacing run's position along its route. Simulation timing is unchanged.
      const outcomeContent = performanceScenario(20);
      outcomeContent.name = 'Independent critic outcome 20v20';
      for (const unit of outcomeContent.units)
        unit.position.longitudeDeg =
          unit.category === 'friendly' ? 103.848 : 103.852;
      const outcomeSave = await page.request.post(`${frontend}/api/scenarios`, {
        data: {
          requestId: randomUUID(),
          expectedRevision: 0,
          content: outcomeContent,
        },
      });
      expect(outcomeSave.ok()).toBe(true);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', {
          name: /Independent critic outcome 20v20.*Saved plan/,
        })
        .click();
      await conductor
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(conductor).toContainText('Ready to run');
      await conductor
        .getByRole('button', { name: 'Run saved revision 1', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      await command('Pause', 'pause');
      await ui.tab('Conductor', 'Close view');
      await ui.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await ui.behavior('intercept');
      const outcomeMid = (await ui.world()).mission.id;
      await command('Resume', 'resume');
      const outcomeStart = await ui.world(outcomeMid);
      await page.waitForTimeout(700);
      expect(
        changedTracks(outcomeStart, await ui.world(outcomeMid)),
      ).toHaveLength(40);
      await expect
        .poll(
          async () =>
            Object.values((await ui.world(outcomeMid)).entities).filter(
              (e) => e.condition === 'non-operational',
            ).length,
          { timeout: 45000, intervals: [500, 1000] },
        )
        .toBe(40);
      const outcomeWorld = await ui.world(outcomeMid);
      expect(outcomeWorld.fleetBehavior.outcomes).toHaveLength(20);
      result.outcomes = {
        missionId: outcomeMid,
        movingBeforeResolution: 40,
        outcomeCount: outcomeWorld.fleetBehavior.outcomes.length,
        nonOperational: Object.values(outcomeWorld.entities).filter(
          (e) => e.condition === 'non-operational',
        ).length,
      };
      await command('Pause', 'pause');
      await shot('05-forty-non-operational');
      await command('End demo', 'end');
      const recordedOutcomes = await ui.world(outcomeMid);
      expect(
        Object.values(recordedOutcomes.entities).every(
          (e) => e.condition === 'non-operational',
        ),
      ).toBe(true);
      expect(recordedOutcomes.interactive.state).toBe('ended');
      check(
        'Separate actual Conductor 20v20 run verified all forty moving before existing Intercept resolved twenty outcomes and forty NON-OP entities; End preserved the terminal outcomes.',
      );
      expect(result.errors).toEqual([]);
      result.passed = true;
    } catch (error) {
      result.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 2200);
      await shot('failure').catch(() => {});
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
          cases: result.cases.length,
          failure: result.failure,
          sourceUnchanged: result.sourceUnchanged,
        }),
      );
    }
  },
);
