import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { detailsClosure } from '../support/details-closure.mjs';

await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'details-foreground',
    frontendPort: 5433,
    backendPort: 8233,
    previewDir: 'dist-verification-d7-details-final',
    evidenceRoot: 'test-results/performance',
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
    const result = { browser: browser.version(), providerRequests: 0 };
    page.on('request', (request) => {
      if (!request.url().startsWith(frontend)) result.providerRequests++;
    });
    try {
      Object.assign(result, await detailsClosure(page, frontend, output));
    } catch (error) {
      result.failure = String(error).slice(0, 3000);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
    }
  },
);
