/* global window, screen, document, devicePixelRatio */
import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { foregroundIdentity } from './foreground-identity.mjs';
import {
  captureBrowserSurface,
  launchForegroundBrowser,
} from './foreground-browser.mjs';
import { loadPerformanceScenario } from '../performance/support.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { analyticViews, openCommand } from '../support/analytics-ui.mjs';
import {
  externalFixture,
  submitSimulation,
} from '../support/simulation-ui.mjs';

const tag = process.argv[2] ?? 'phase6-foreground';
await withIsolatedRuntime(
  {
    tag,
    frontendPort: 5411,
    backendPort: 8211,
    configured: false,
    previewDir: process.env.PHASE6_BUILD,
    evidenceRoot: 'test-results/phase6-command-picture',
  },
  async ({ frontend, output }) => {
    const foregroundBrowser = await launchForegroundBrowser({
      viewport: { width: 1280, height: 700 },
    });
    const { browser, context } = foregroundBrowser;
    const page = await foregroundBrowser.newPage();
    const report = {
      focusEmulationDisabled: true,
      cases: [],
      screenshots: [],
      errors: [],
      externalRequests: [],
      browser: browser.version(),
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
    const shot = async (name) => {
      await captureBrowserSurface(page, {
        path: resolve(output, name + '.png'),
      });
      report.screenshots.push(name + '.png');
      save();
    };
    page.on('pageerror', (e) => report.errors.push(e.message));
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) &&
        !['data:', 'blob:'].includes(url.protocol)
      ) {
        report.externalRequests.push(url.hostname);
        return route.abort();
      }
      return route.continue();
    });
    try {
      await page.goto(frontend);
      await page.bringToFront();
      report.environment = await page.evaluate(() => ({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: { width: screen.width, height: screen.height },
        dpr: devicePixelRatio,
        visible: document.visibilityState,
        focused: document.hasFocus(),
      }));
      writeFileSync(
        resolve(output, 'ready.json'),
        JSON.stringify({ frontend, title: await page.title() }),
      );
      report.foreground = await foregroundIdentity(browser, page);
      await loadPerformanceScenario(page, frontend, 20, {
        routeHalfSpanDeg: 0.035,
        location: 'sydney',
      });
      report.cases.push('Sydney moving 20v20 via Orchestrator');
      const ui = operatorUI(page, frontend);
      const first = await ui.world();
      await sleep(500);
      const second = await ui.world();
      report.moving = Object.keys(first.tracks).filter(
        (id) =>
          JSON.stringify(first.tracks[id].latest.position) !==
          JSON.stringify(second.tracks[id].latest.position),
      ).length;
      expect(report.moving).toBe(40);
      await analyticViews(page, shot);
      report.cases.push(
        'Every lens, selection/Details, profile origin/history and split',
      );
      for (const width of [760, 820, 900, 1440]) {
        await foregroundBrowser.resize(page, { width, height: 700 });
        await shot('layout-' + width);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
      await ui.action('Pause');
      await ui.action('Resume');
      await ui.action('End demo');
      const pane = await openCommand(page);
      await pane
        .getByRole('button', { name: 'Recorded activity', exact: true })
        .click();
      await expect(pane.getByText(/Complete range summary/)).toBeVisible();
      await shot('ended-recording');
      report.cases.push('Pause, Resume, End and recorded audit');
      const external = externalFixture('remote40');
      await submitSimulation(page, external);
      await page
        .getByRole('button', { name: 'Inspect mapped mission', exact: true })
        .click();
      await expect(page.locator('.mission-name')).toContainText(
        external.mission_id,
      );
      await openCommand(page);
      await pane
        .getByRole('button', { name: 'Vertical profile', exact: true })
        .click();
      await expect(pane.getByText(/Axis:/)).toContainText('MSL');
      await shot('external-msl');
      report.cases.push(
        'External 40 visualization isolated from interactive recording',
      );
      expect(report.externalRequests).toEqual([]);
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (error) {
      report.failure = String(error);
      await shot('failure');
      throw error;
    } finally {
      save();
      await foregroundBrowser.close();
    }
  },
);
