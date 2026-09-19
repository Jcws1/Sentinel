import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';
import { syntheticScene } from './performance-geometry-fixture.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'perf-geometry-final-2',
    frontendPort: 5376,
    backendPort: 8176,
    evidenceRoot: '../docs/performance-stability',
    previewDir: 'dist-performance-after',
    viteConfig: '.cache/performance-preview.mjs',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage(),
      ui = d6UI(page, frontend),
      r = { errors: [] };
    page.on('pageerror', (e) => r.errors.push(e.name));
    const mesh = syntheticScene(frontend);
    await page.route('https://tile.googleapis.com/**', (route) =>
      route.fulfill({ json: mesh.root }),
    );
    await page.route('**/synthetic-recovery/scene.gltf*', (route) =>
      route.fulfill({ json: mesh.gltf, contentType: 'model/gltf+json' }),
    );
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelCesiumTest.inspect('cockpit'));
    try {
      await loadPerformanceScenario(page, frontend);
      await ui.action('Pause');
      await ui.tab('Conductor', 'Close view');
      await ui.select('Friendly 01');
      r.worldBefore = await ui.world();
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
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              Boolean(globalThis.__sentinelCesiumTest?.inspect('cockpit')),
            ),
          { timeout: 20000 },
        )
        .toBe(true);
      await page.evaluate(() => {
        globalThis.__sentinelCesiumTest.setPresentation('cockpit', {
          environment: 'photorealistic',
          daylight: true,
          terrain: true,
          buildings: true,
          hillshade: false,
        });
        globalThis.__sentinelCesiumTest.setProvider('cockpit', {
          googleKey: 'synthetic-task-only',
        });
      });
      await expect
        .poll(async () => (await inspect()).environment.photorealisticLoaded, {
          timeout: 30000,
        })
        .toBe(true);
      await expect
        .poll(async () => (await inspect()).cockpit.intersects, {
          timeout: 15000,
        })
        .toBe(true);
      await expect(video).toContainText(
        'Scene geometry intersects the supplied viewpoint.',
      );
      r.video = await inspect();
      expect(r.video.environment.photorealisticCollision).toBe(false);
      expect(r.video.cockpit.position.altitude.metres).toBe(180);
      expect(r.video.cockpit.actualPosition.height).toBeCloseTo(180, 2);
      expect(r.video.cockpit.collisionEnabled).toBe(false);
      expect(r.video.cameraClearance.surfaceHeightM).toBeGreaterThan(290);
      expect(r.video.cameraClearance.corrected).toBe(false);
      expect((await ui.world()).tracks).toEqual(r.worldBefore.tracks);
      await page.screenshot({
        path: resolve(output, 'intersection-preserved.png'),
      });
      await page
        .locator('[data-view-id="tactical"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await page.evaluate(() => {
        globalThis.__sentinelCesiumTest.setPresentation('tactical', {
          environment: 'photorealistic',
          daylight: true,
          terrain: true,
          buildings: true,
          hillshade: false,
        });
        globalThis.__sentinelCesiumTest.setProvider('tactical', {
          googleKey: 'synthetic-task-only',
        });
      });
      await expect
        .poll(
          () =>
            page.evaluate(
              () =>
                globalThis.__sentinelCesiumTest.inspect('tactical').environment
                  .photorealisticCollision,
            ),
          { timeout: 15000 },
        )
        .toBe(true);
      r.map = await page.evaluate(() =>
        globalThis.__sentinelCesiumTest.inspect('tactical'),
      );
      await ui.action('End demo');
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
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1400);
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
          errors: r.errors,
        }),
      );
    }
  },
);
