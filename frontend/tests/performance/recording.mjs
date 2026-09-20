/* global devicePixelRatio, innerWidth */
import { chromium, expect } from '@playwright/test';
import { writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { loadPerformanceScenario } from './support.mjs';

// Short UI demonstration. Video encoding is deliberately excluded from FPS runs.
const configured = process.env.PERF_CONFIGURED !== '0';
await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'perf-ui-recording',
    frontendPort: 5374,
    backendPort: 8174,
    configured,
    evidenceRoot: 'test-results/performance',
    previewDir: configured ? 'dist-performance-configured' : 'dist-performance',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      recordVideo: { dir: output, size: { width: 960, height: 600 } },
    });
    const page = await context.newPage(),
      u = operatorUI(page, frontend),
      r = { errors: [], layouts: [], networkFailures: [] };
    page.setDefaultTimeout(25000);
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('requestfailed', (req) =>
      r.networkFailures.push({
        host: new URL(req.url()).hostname,
        reason: req.failure()?.errorText,
      }),
    );
    try {
      await loadPerformanceScenario(page, frontend);
      await u.tab('Orchestrator', 'Close view');
      await u.select('Friendly 01');
      await page.waitForTimeout(1200);
      const surface = page.locator('[data-view-id="tactical"] .map-canvas');
      const b = await surface.boundingBox();
      await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.65);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.58, {
        steps: 12,
      });
      await page.mouse.up({ button: 'middle' });
      await page.mouse.wheel(0, -150);
      await page.waitForTimeout(500);
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
      await expect
        .poll(() =>
          page.evaluate(() =>
            Boolean(globalThis.__sentinelCesiumTest?.inspect('cockpit')),
          ),
        )
        .toBe(true);
      if (configured)
        await expect
          .poll(
            async () =>
              page.evaluate(
                () =>
                  globalThis.__sentinelCesiumTest.inspect('cockpit').environment
                    .photorealisticLoaded,
              ),
            { timeout: 30000 },
          )
          .toBe(true);
      else await page.waitForTimeout(2500);
      r.provider = await page.evaluate(() => {
        const state = globalThis.__sentinelCesiumTest.inspect('cockpit');
        return {
          spatial: state.spatial,
          environment: {
            loaded: state.environment.photorealisticLoaded,
            tiles: state.environment.photoVisibleTiles,
            bytes: state.environment.photorealisticBytes,
          },
          overlays: {
            points: state.videoOverlay.points.length,
            labels: state.videoOverlay.labels.length,
          },
        };
      });
      for (const key of [
        'ArrowRight',
        'ArrowRight',
        'ArrowLeft',
        'ArrowLeft',
      ]) {
        await yaw.press(key);
        await page.waitForTimeout(600);
      }
      const pitch = video.getByRole('slider', {
        name: 'Video Feed look pitch',
      });
      await pitch.focus();
      await pitch.press('ArrowUp');
      await page.waitForTimeout(700);
      await pitch.press('ArrowDown');
      await video.locator('.cockpit-options > summary').click();
      for (const width of [760, 820, 900, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(900);
        await page.locator('.cockpit-body').evaluate((e) => (e.scrollTop = 0));
        await page.screenshot({ path: resolve(output, `width-${width}.png`) });
      }
      await page
        .locator('.cockpit-body')
        .evaluate((e) => (e.scrollTop = e.scrollHeight));
      await page.waitForTimeout(500);
      // Attempt a real browser keyboard zoom and retain observed DPR, rather than claiming
      // that a viewport resize or CSS transform is browser zoom.
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      r.zoomBefore = await page.evaluate(() => ({
        dpr: devicePixelRatio,
        width: innerWidth,
      }));
      await page.keyboard.press('Control+Equal');
      await page.waitForTimeout(800);
      r.zoomAfter = await page.evaluate(() => ({
        dpr: devicePixelRatio,
        width: innerWidth,
      }));
      r.actualBrowserZoomObserved = r.zoomAfter.dpr !== r.zoomBefore.dpr;
      await page.screenshot({ path: resolve(output, 'zoom-attempt.png') });
      await page.keyboard.press('Control+Digit0');
      await u.action('Pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await page.waitForTimeout(1000);
      await u.action('Resume');
      await page.waitForTimeout(1000);
      await u.action('End demo');
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
      await page.waitForTimeout(700);
      r.passed = r.errors.length === 0;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1000);
      process.exitCode = 1;
    } finally {
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      const recording = page.video(),
        original = await recording.path();
      await context.close();
      await recording.saveAs(resolve(output, 'moving-40-layout.webm'));
      unlinkSync(original);
      await browser.close();
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
