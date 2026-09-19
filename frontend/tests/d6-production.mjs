import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
await withD5Runtime(
  {
    phase: 'd6',
    tag: process.argv[2] ?? 'production',
    frontendPort: 5365,
    backendPort: 8165,
    previewDir: 'dist-d6',
    viteConfig: '.cache/d6-preview.mjs',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      }),
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(20000);
    const u = d6UI(page, frontend),
      r = { errors: [], checks: [] };
    page.on('pageerror', (e) => r.errors.push(e.name));
    try {
      await u.scenario();
      await u.action('Pause');
      await u.select('D6 Friendly 01', 'D6 Friendly 02');
      await u.review();
      await expect(
        u.pane.getByRole('heading', {
          name: 'Enable Intercept · 2',
          exact: true,
        }),
      ).toBeVisible();
      await u.pane
        .getByRole('button', {
          name: 'Apply Enable Intercept · 2',
          exact: true,
        })
        .click();
      await expect(u.pane).toContainText('2 members accepted');
      expect(
        await page.evaluate(
          () =>
            !!globalThis.__sentinelCesiumTest ||
            !!globalThis.__sentinelMapTest ||
            !!globalThis.__sentinelRendererPoolTest,
        ),
      ).toBe(false);
      r.checks.push(
        'Credential-free production bundle operates actual Suggestions → ordinary audited Apply; verification globals absent',
      );
      for (const asset of [
        '/cesium/Assets/approximateTerrainHeights.json',
        '/cesium/Assets/IAU2006_XYS/IAU2006_XYS_0.json',
        '/edge-map/manifest.json',
      ]) {
        const reply = await page.request.get(frontend + asset);
        expect(reply.ok()).toBe(true);
        expect(reply.headers()['content-type']).not.toContain('text/html');
      }
      await page.screenshot({
        path: resolve(output, 'production-suggestions.png'),
      });
      await u.action('End demo');
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1400);
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
