/* global devicePixelRatio, innerWidth, document, chrome */
// Exercise genuine browser zoom through a task-only extension in an isolated
// persistent profile. CDP keyboard accelerators do not change Edge's zoom.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { loadPerformanceScenario } from './support.mjs';

const extension = resolve('.cache/performance-zoom-extension');
mkdirSync(extension, { recursive: true });
writeFileSync(
  resolve(extension, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Task-only Sentinel zoom verification',
    version: '1.0',
    permissions: ['tabs'],
    host_permissions: ['http://127.0.0.1:5375/*'],
    background: { service_worker: 'worker.js' },
  }),
);
writeFileSync(
  resolve(extension, 'worker.js'),
  'chrome.runtime.onInstalled.addListener(() => {});',
);
await withIsolatedRuntime(
  {
    tag: 'perf-browser-zoom',
    frontendPort: 5375,
    backendPort: 8175,
    evidenceRoot: 'test-results/performance',
    previewDir: 'dist-performance',
  },
  async ({ frontend, output }) => {
    const profile = resolve(`.cache/performance-zoom-profile-${process.pid}`);
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'msedge',
      headless: false,
      viewport: null,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        '--window-size=1440,1000',
      ],
    });
    const page = context.pages()[0] ?? (await context.newPage());
    const ui = operatorUI(page, frontend),
      r = { profile, extension, samples: [], errors: [] };
    page.on('pageerror', (e) => r.errors.push(e.name));
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 10000 }));
      await loadPerformanceScenario(page, frontend);
      await ui.tab('Orchestrator', 'Close view');
      await ui.select('Friendly 01');
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await page
        .locator('.cockpit-pane')
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      for (const zoom of [1, 1.25, 0.8, 1]) {
        const confirmed = await worker.evaluate(
          async ({ frontend, zoom }) => {
            const tabs = await chrome.tabs.query({ url: `${frontend}/*` });
            if (tabs.length !== 1) throw Error('Expected exactly one task tab');
            await chrome.tabs.setZoom(tabs[0].id, zoom);
            return chrome.tabs.getZoom(tabs[0].id);
          },
          { frontend, zoom },
        );
        expect(confirmed).toBe(zoom);
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => ({
          dpr: devicePixelRatio,
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          scene: (() => {
            const b = document
              .querySelector('.cockpit-scene')
              .getBoundingClientRect();
            return { x: b.x, y: b.y, width: b.width, height: b.height };
          })(),
        }));
        expect(state.scrollWidth).toBeLessThanOrEqual(state.width + 1);
        expect(state.scene.height).toBeGreaterThan(0);
        r.samples.push({ zoom, confirmed, ...state });
        await page.screenshot({ path: resolve(output, `zoom-${zoom}.png`) });
      }
      expect(r.samples[1].dpr).toBeGreaterThan(r.samples[0].dpr);
      expect(r.samples[2].dpr).toBeLessThan(r.samples[0].dpr);
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
      r.passed = r.errors.length === 0;
    } catch (error) {
      r.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1200);
      process.exitCode = 1;
    } finally {
      await context.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
