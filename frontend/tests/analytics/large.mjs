/* global performance, requestAnimationFrame, window, document */
import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { foregroundIdentity } from './foreground-identity.mjs';
import {
  captureBrowserSurface,
  launchForegroundBrowser,
} from './foreground-browser.mjs';
import { openCommand } from '../support/analytics-ui.mjs';

await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'phase6-large',
    frontendPort: 5413,
    backendPort: 8213,
    configured: false,
    previewDir: 'dist-verification-phase6',
    backendDirectory: '../backend/tests/fixtures',
    backendModule: 'analytics_fixture:app',
    evidenceRoot: 'test-results/phase6-command-picture',
    reportStorage: true,
  },
  async ({ frontend, output }) => {
    const foregroundBrowser = await launchForegroundBrowser();
    const { browser, context } = foregroundBrowser;
    const report = {
      synthetic: true,
      browser: browser.version(),
      entities: 10000,
      events: 10000,
      externalRequests: [],
      errors: [],
      views: [],
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
    try {
      const page = await foregroundBrowser.newPage();
      const cdp = await context.newCDPSession(page);
      report.focusEmulationDisabled = true;
      page.on('pageerror', (e) => report.errors.push(e.message));
      await context.route('**/*', (route) => {
        const u = new URL(route.request().url());
        if (
          !['127.0.0.1', 'localhost'].includes(u.hostname) &&
          !['data:', 'blob:'].includes(u.protocol)
        ) {
          report.externalRequests.push(u.hostname);
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(frontend);
      report.foreground = await foregroundIdentity(browser, page);
      report.environment = await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      }));
      const source = await page.request.get(
        `${frontend}/api/missions/fixture-analytics-large/world`,
      );
      report.sourceBytes = Number(source.headers()['content-length']);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Developer fixtures', exact: true })
        .focus();
      await page.keyboard.press('ArrowRight');
      const start = performance.now();
      await page
        .getByRole('menuitem', {
          name: 'Synthetic analytics 10000',
          exact: true,
        })
        .click();
      const pane = await openCommand(page);
      await expect(
        pane.getByText('10000 filtered / 10000 mission entities'),
      ).toBeVisible();
      report.loadAndOverviewMs = performance.now() - start;
      for (const lens of ['Overview', 'Statistics', 'Vertical profile']) {
        const began = performance.now();
        await pane.getByRole('button', { name: lens, exact: true }).click();
        if (lens === 'Statistics')
          await expect(pane.getByText(/Complete range summary/)).toContainText(
            '10000 rows',
          );
        await pane.locator('.analytic-chart').first().scrollIntoViewIfNeeded();
        const readyMs = performance.now() - began;
        const sample = await page.evaluate(
          () =>
            new Promise((resolve) => {
              const stamps = [],
                losses = [],
                started = performance.now();
              let finished = false;
              const blur = () =>
                losses.push({ at: performance.now(), reason: 'blur' });
              const hidden = () => {
                if (document.hidden)
                  losses.push({ at: performance.now(), reason: 'hidden' });
              };
              window.addEventListener('blur', blur);
              document.addEventListener('visibilitychange', hidden);
              const finish = (timedOut) => {
                if (finished) return;
                finished = true;
                window.clearTimeout(timer);
                window.removeEventListener('blur', blur);
                document.removeEventListener('visibilitychange', hidden);
                resolve({
                  stamps,
                  losses,
                  timedOut,
                  focused: document.hasFocus(),
                  visibility: document.visibilityState,
                  charts: globalThis.__sentinelChartsTest.inspect(),
                  runtime: globalThis.__sentinelAnalyticsTest.inspect(),
                });
              };
              const timer = window.setTimeout(() => finish(true), 15000);
              const tick = (at) => {
                if (finished) return;
                stamps.push(at);
                if (at - started < 12000) requestAnimationFrame(tick);
                else finish(false);
              };
              requestAnimationFrame(tick);
            }),
        );
        const measured = { lens, readyMs, sample };
        report.views.push(measured);
        save(); // Retain the complete diagnostic even if foreground was lost.
        measured.afterForeground = await foregroundIdentity(browser, page);
        expect(sample.timedOut).toBe(false);
        expect(sample.losses).toEqual([]);
        expect(sample.focused && sample.visibility === 'visible').toBe(true);
        await cdp.send('HeapProfiler.collectGarbage');
        measured.heap = await cdp.send('Runtime.getHeapUsage');
        await captureBrowserSurface(page, {
          path: resolve(
            output,
            lens.toLowerCase().replaceAll(' ', '-') + '.png',
          ),
        });
        save();
      }
      expect(report.externalRequests).toEqual([]);
      expect(report.errors).toEqual([]);
      await cdp.detach();
      report.passed = true;
    } catch (error) {
      report.failure = String(error);
      throw error;
    } finally {
      save();
      await foregroundBrowser.close();
    }
  },
);
