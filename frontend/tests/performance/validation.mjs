/* global document, performance, MutationObserver */
// Exact-revision foreground validation latency. No provider or operator storage.
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { validateSavedScenario } from './support.mjs';

const tag = process.argv[2] ?? 'validation-current';
await withIsolatedRuntime(
  {
    tag,
    frontendPort: 5431,
    backendPort: 8231,
    previewDir: 'dist-test-performance-closure',
    evidenceRoot: 'test-results/performance-closure',
    ...(process.env.PERF_BACKEND_DIRECTORY
      ? { backendDirectory: process.env.PERF_BACKEND_DIRECTORY }
      : {}),
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const result = {
      browser: browser.version(),
      samples: [],
      providerRequests: 0,
    };
    try {
      for (const fixture of [
        'tests/fixtures/scenario-20v20.json',
        'tests/fixtures/scenario-location/remote-20v20.json',
      ]) {
        const context = await browser.newContext({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: 1,
        });
        const page = await context.newPage();
        page.on('request', (request) => {
          if (!request.url().startsWith(frontend)) result.providerRequests++;
        });
        await page.addInitScript(() => {
          globalThis.__validationProbe = [];
          document.addEventListener('pointerdown', (event) => {
            if (event.target.closest('button')?.textContent === 'Validate') {
              const sample = { input: performance.now() };
              globalThis.__validationProbe.push(sample);
              const observer = new MutationObserver(() => {
                const heading = document.querySelector(
                  '.scenario-run-review h2',
                );
                if (heading?.textContent?.includes('Ready to run')) {
                  sample.reviewDom = performance.now();
                  observer.disconnect();
                }
              });
              observer.observe(document, { subtree: true, childList: true });
            }
          });
        });
        const content = JSON.parse(readFileSync(resolve(fixture), 'utf8'));
        const response = await page.request.post(`${frontend}/api/scenarios`, {
          data: { requestId: randomUUID(), expectedRevision: 0, content },
        });
        expect(response.ok()).toBe(true);
        const saved = (await response.json()).result;
        await page.goto(frontend);
        await page.bringToFront();
        await page
          .getByRole('button', { name: 'Load mission', exact: true })
          .click();
        await page
          .getByRole('menuitem', {
            name: new RegExp(`${content.name} · r1.*Saved plan`),
          })
          .click();
        const panel = page.locator('[data-view="orchestrator"]');
        for (let index = 0; index < 4; index++) {
          if (index) {
            await panel
              .getByRole('tab', { name: 'Units', exact: true })
              .click();
          }
          const responsePromise = page.waitForResponse(
            (r) =>
              r.url().endsWith('/api/scenarios/validate') &&
              r.request().method() === 'POST',
          );
          const sample = await validateSavedScenario(page, saved);
          const validationResponse = await responsePromise;
          const timing = validationResponse.request().timing();
          result.samples.push({
            fixture,
            index,
            sampleKind: index ? 'repeated' : 'cold-context',
            ...sample,
            requestTiming: timing,
            bodyBytes: (await validationResponse.body()).length,
            browser: await page.evaluate(() => ({
              visibility: document.visibilityState,
              focused: document.hasFocus(),
              probe: globalThis.__validationProbe.at(-1),
              resources: performance
                .getEntriesByType('resource')
                .filter((e) => e.name.endsWith('/api/scenarios/validate'))
                .map((e) => ({
                  startTime: e.startTime,
                  requestStart: e.requestStart,
                  responseStart: e.responseStart,
                  responseEnd: e.responseEnd,
                  transferSize: e.transferSize,
                })),
            })),
          });
        }
        await page.screenshot({
          path: resolve(
            output,
            fixture.includes('remote')
              ? 'sydney-review.png'
              : 'default-review.png',
          ),
        });
        if (fixture.includes('remote') && process.env.PERF_INSPECT === '1') {
          globalThis.console.log(
            'Non-measured 45-second foreground inspection slot',
          );
          await page.waitForTimeout(45000);
        }
        await context.close();
      }
    } finally {
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
      await browser.close();
    }
  },
);
