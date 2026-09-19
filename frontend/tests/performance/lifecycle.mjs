/* global document, performance, requestAnimationFrame, MutationObserver, getComputedStyle */
import { chromium, expect } from '@playwright/test';
import { writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { loadPerformanceScenario } from './support.mjs';

const perSide = Number(process.env.PERF_COUNT ?? 20);
await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'perf-lifecycle',
    frontendPort: 5372,
    backendPort: 8172,
    configured: process.env.PERF_CONFIGURED === '1',
    evidenceRoot: 'test-results/performance',
    previewDir: process.env.PERF_BUILD ?? 'dist-performance',
    ...(process.env.PERF_BACKEND_DIRECTORY
      ? {
          backendDirectory: process.env.PERF_BACKEND_DIRECTORY,
        }
      : {}),
  },
  async ({ frontend, output, pids, database }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage(),
      u = operatorUI(page, frontend);
    page.setDefaultTimeout(25000);
    const r = {
      cases: [],
      errors: [],
      input: [],
      layouts: [],
      resources: [],
      commands: [],
    };
    page.on('pageerror', (e) =>
      r.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 200),
      ),
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const inspect = () =>
      page.evaluate(() => ({
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
        map: globalThis.__sentinelMapTest?.inspect('tactical'),
        mapCounts: globalThis.__sentinelMapTest?.stats(),
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        cesiumCounts: globalThis.__sentinelCesiumTest?.stats(),
      }));
    const resource = async (label, gc = false) => {
      if (gc) await cdp.send('HeapProfiler.collectGarbage');
      const metrics = Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
      r.resources.push({
        label,
        at: Date.now(),
        gc,
        heap: metrics.JSHeapUsedSize,
        nodes: metrics.Nodes,
        listeners: metrics.JSEventListeners,
        state: await inspect(),
        services: JSON.parse(
          execFileSync(
            'powershell.exe',
            [
              '-NoProfile',
              '-Command',
              `$owned = @(${pids.join(',')}); $listener = netstat -ano -p tcp | Select-String '127\\.0\\.0\\.1:8172\\s+.*LISTENING'; foreach ($row in $listener) { $owned += [int](($row.Line.Trim() -split '\\s+')[-1]) }; $owned = @($owned | Select-Object -Unique); @(Get-Process -Id $owned -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64,PrivateMemorySize64) | ConvertTo-Json -Compress`,
            ],
            { windowsHide: true, encoding: 'utf8', timeout: 15000 },
          ),
        ),
        recordingBytes: ['', '-wal', '-shm'].reduce((bytes, suffix) => {
          try {
            return bytes + statSync(database + suffix).size;
          } catch {
            return bytes;
          }
        }, 0),
      });
    };
    const command = async (
      label,
      operation,
      callback = () => u.action(label),
    ) => {
      const begin = performance.now();
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === operation,
      );
      await callback();
      const receipt = await (await response).json();
      expect(receipt.accepted).toBe(true);
      r.commands.push({
        operation,
        elapsedMs: performance.now() - begin,
        accepted: receipt.accepted,
        affected: receipt.controlOutcomes?.length,
      });
    };
    try {
      await loadPerformanceScenario(page, frontend, perSide);
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
      const world = await u.world();
      r.missionId = world.mission.id;
      expect(Object.keys(world.entities)).toHaveLength(perSide * 2);
      await page.waitForTimeout(1000);
      const moving = await u.world();
      expect(
        Object.values(world.tracks).filter(
          (t) =>
            JSON.stringify(t.latest.position) !==
            JSON.stringify(moving.tracks[t.id].latest.position),
        ),
      ).toHaveLength(perSide * 2);
      r.cases.push(
        `${perSide * 2} entities move through saved-plan API, validation, Conductor Run, transport and live renderers`,
      );
      // Visible selection latency, measured from the actual pointer event until Details changed,
      // followed by two animation frames. This is a DOM/paint opportunity proxy, not a photodiode measurement.
      for (const label of [
        'Friendly 02',
        'Friendly 03',
        'Friendly 04',
        'Friendly 01',
      ]) {
        await page.evaluate((label) => {
          globalThis.__selectionMeasure = new Promise((resolve) => {
            document.addEventListener(
              'pointerdown',
              () => {
                const start = performance.now();
                const observer = new MutationObserver(() => {
                  if (
                    !document
                      .querySelector('.entity-details')
                      ?.textContent?.includes(label)
                  )
                    return;
                  observer.disconnect();
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() =>
                      resolve(performance.now() - start),
                    ),
                  );
                });
                observer.observe(document.body, {
                  subtree: true,
                  childList: true,
                  characterData: true,
                });
              },
              { once: true, capture: true },
            );
          });
        }, label);
        await u.fleet
          .getByRole('button', { name: `Inspect ${label}`, exact: true })
          .click();
        r.input.push({
          label,
          visibleDetailsMs: await page.evaluate(
            () => globalThis.__selectionMeasure,
          ),
        });
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
      const yaw = video.getByRole('slider', { name: 'Video Feed look yaw' });
      await video.locator('.cockpit-options > summary').click();
      await yaw.focus();
      await yaw.press('Home');
      await yaw.press('ArrowRight');
      await page.waitForTimeout(2500);
      for (const width of [760, 820, 900, 1440, 2560, 3840]) {
        await page.setViewportSize({
          width,
          height: width >= 2560 ? (width === 3840 ? 2160 : 1440) : 900,
        });
        await page.waitForTimeout(400);
        const layout = await page.evaluate(async () => {
          const sizes = new Set(),
            hidden = [];
          for (let i = 0; i < 20; i++) {
            await new Promise(requestAnimationFrame);
            const e = document.querySelector('.cockpit-scene'),
              b = e.getBoundingClientRect();
            sizes.add(JSON.stringify([b.x, b.y, b.width, b.height]));
            hidden.push(getComputedStyle(e).visibility);
          }
          return {
            sceneBounds: [...sizes],
            sceneVisibility: [...new Set(hidden)],
            documentWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          };
        });
        expect(layout.sceneBounds).toHaveLength(1);
        expect(layout.scrollWidth).toBeLessThanOrEqual(width + 1);
        r.layouts.push({ width, ...layout });
        await page.screenshot({ path: resolve(output, `layout-${width}.png`) });
      }
      await page.setViewportSize({ width: 1440, height: 900 });
      const map = page.locator('[data-view-id="tactical"]');
      await map.getByRole('button', { name: '3D', exact: true }).click();
      await page.waitForTimeout(3000);
      await resource('warm-before-reopen', true);
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      await page
        .getByRole('button', { name: 'Show Views list', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Open Tracks from Views', exact: true })
        .click();
      await page.getByRole('tab', { name: '3D Map', exact: true }).click();
      for (let i = 0; i < 5; i++) {
        await expect
          .poll(async () => (await inspect()).threeD?.retainable)
          .toBe(true);
        await page.getByRole('tab', { name: 'Tracks', exact: true }).click();
        await page.waitForTimeout(150);
        const before = await inspect();
        expect(before.threeD?.active ?? false).toBe(false);
        await page.waitForTimeout(500);
        const after = await inspect();
        expect(after.threeD?.environment.renderedFrames).toBe(
          before.threeD?.environment.renderedFrames,
        );
        await page.getByRole('tab', { name: '3D Map', exact: true }).click();
        await page.waitForTimeout(300);
      }
      await resource('after-five-hide-reopen', true);
      r.cases.push(
        'Hidden 3D render count stays fixed; repeated reopening retains bounded renderer ownership',
      );
      // Two minute foreground moving workload; coarse checkpoints do not busy-poll renderers.
      for (let i = 0; i < 4; i++) {
        await page.waitForTimeout(30000);
        await resource(`soak-${(i + 1) * 30}s`);
      }
      await resource('soak-final-collected', true);
      expect(r.resources.at(-1).state.pool.alive).toBeLessThanOrEqual(4);
      await command('Pause', 'pause');
      const paused = await u.world();
      await page.waitForTimeout(700);
      expect((await u.world()).tracks).toEqual(paused.tracks);
      await command('Resume', 'resume');
      await u.select(
        ...Array.from(
          { length: perSide },
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
      for (const t of Object.values(stopped.tracks)) {
        const friendly =
          stopped.entities[t.entityId].affiliation === 'friendly';
        expect(
          JSON.stringify(later.tracks[t.id].latest.position) ===
            JSON.stringify(t.latest.position),
        ).toBe(friendly);
      }
      await command('Return to script', 'return-to-script', () =>
        u.fleet
          .getByRole('button', { name: 'Return to script', exact: true })
          .click(),
      );
      r.cases.push(
        `Pause freezes authoritative tracks; Resume; Stop all ${perSide} Friendly leaves ${perSide} Hostile moving; Return to script accepted`,
      );
      await command('End demo', 'end');
      expect((await u.world(r.missionId)).interactive.state).toBe('ended');
      await page.screenshot({ path: resolve(output, 'ended.png') });
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1600);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          passed: r.passed,
          failure: r.failure,
          cases: r.cases,
          errors: r.errors,
        }),
      );
    }
  },
);
