import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';

await withD5Runtime(
  { phase: 'd6', tag: 'recorded', frontendPort: 5362, backendPort: 8162 },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage(),
      u = d6UI(page, frontend);
    const r = { cases: [], errors: [], recommendationRequests: 0 };
    page.setDefaultTimeout(15000);
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('request', (req) => {
      if (req.url().endsWith('/recommendations')) r.recommendationRequests++;
    });
    try {
      await u.scenario({ friendly: 2, hostile: 0 });
      await u.action('Pause');
      await u.select('D6 Friendly 01');
      await u.review();
      const mid = (await u.world()).mission.id;
      await u.action('End demo');
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      const requestsAtEnd = r.recommendationRequests;
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      const showViews = page.getByRole('button', {
        name: 'Show Views list',
        exact: true,
      });
      if (await showViews.isVisible()) await showViews.click();
      await page
        .getByRole('button', {
          name: 'Open Suggestions from Views',
          exact: true,
        })
        .click();
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      await expect(u.pane.getByRole('button', { name: /^Apply / })).toHaveCount(
        0,
      );
      expect(r.recommendationRequests).toBe(requestsAtEnd);
      expect((await u.world(mid)).interactive.state).toBe('ended');
      await page.screenshot({ path: resolve(output, 'recorded-readonly.png') });
      r.cases.push(
        'Ended run reopened from Previous demos: read-only, no advisory request or Apply',
      );
      await u.action('New demo');
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await u.select('F-01');
      await u.review();
      await expect(u.pane).not.toContainText('D6 Friendly');
      await page.screenshot({ path: resolve(output, 'new-mission.png') });
      r.cases.push(
        'New mission: old identities/options cleared; explicit review uses current run',
      );
      await u.action('End demo');
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
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
