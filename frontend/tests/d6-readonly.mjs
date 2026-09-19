import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
await withD5Runtime(
  {
    phase: 'd6',
    tag: process.argv[2] ?? 'readonly',
    frontendPort: 5361,
    backendPort: 8161,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
        channel: 'msedge',
        headless: true,
      }),
      context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      page = await context.newPage();
    page.setDefaultTimeout(15000);
    const u = d6UI(page, frontend),
      r = { checks: [], commands: [], errors: [] };
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/commands'))
        r.commands.push(req.postDataJSON().intent.action);
    });
    const shot = (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    try {
      const creation = await page.request.post(
        `${frontend}/api/interactive/runs`,
        {
          data: {
            creationId: globalThis.crypto.randomUUID(),
            templateId: 'singapore-local-v2',
          },
        },
      );
      expect(creation.ok()).toBe(true);
      await page.goto(frontend);
      await u.action('Return to active demo');
      await u.select('F-01', 'F-03');
      await expect(
        page.getByRole('button', { name: 'Start demo', exact: true }).first(),
      ).toBeEnabled();
      const beforeReview = r.commands.length;
      await u.review();
      await expect(u.pane).toContainText('Start the demo');
      expect(
        await u.pane.getByRole('button', { name: /^Apply / }).count(),
      ).toBe(0);
      expect(r.commands.length).toBe(beforeReview);
      expect((await u.world()).interactive.state).toBe('ready');
      await shot('01-ready-readonly');
      r.checks.push(
        'Ready review makes no additional command and does not start source; existing mission-load authority acquisition precedes review',
      );
      await u.action('Start demo');
      await page.locator('[data-run-state="running"]').first().waitFor();
      await u.action('Pause');
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }).first(),
      ).toBeEnabled();
      await u.refresh();
      await expect(u.pane).toContainText('No eligible unassigned targets');
      await u.pane
        .getByText('Selection and exclusions', { exact: true })
        .click();
      await expect(u.pane).toContainText('F-03');
      await expect(u.pane).toContainText('Controlled asset is unavailable');
      await shot('02-unavailable-and-no-eligible-targets');
      r.checks.push(
        'Natural quick-demo unavailable asset explicitly excluded; no reachable eligible target produces no fabricated Intercept option',
      );
      await page.locator('[data-activity-view="tracks"]').click();
      const tracks = page.locator('.tracks-browser');
      await tracks
        .getByRole('checkbox', { name: 'Select F-05', exact: true })
        .check();
      await tracks
        .getByRole('checkbox', { name: 'Select O-01', exact: true })
        .check();
      await u.review();
      await u.pane
        .getByText('Selection and exclusions', { exact: true })
        .click();
      await expect(u.pane).toContainText('Observation only');
      await expect(u.pane).toContainText('Only explicitly controlled friendly');
      await shot('03-mixed-selection-exclusions');
      r.checks.push(
        'Mixed controlled, missing-pose, friendly observation-only and hostile selection; no source observation promoted into command authority',
      );
      await u.action('End demo');
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      r.passed = true;
      expect(r.errors).toEqual([]);
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1800);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
