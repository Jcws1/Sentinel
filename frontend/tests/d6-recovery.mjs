import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: process.argv[2] ?? 'recovery',
    frontendPort: 5362,
    backendPort: 8162,
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const u = d6UI(page, frontend),
      r = { cases: [], errors: [], auditedCommands: [] };
    let socket,
      blocked = false,
      lose = false,
      holdReceipts = false;
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        req.url().endsWith('/commands') &&
        req.postDataJSON()?.intent?.recommendation
      )
        r.auditedCommands.push({
          id: req.postDataJSON().commandId,
          hash: createHash('sha256').update(req.postData()).digest('hex'),
        });
    });
    await page.routeWebSocket('**/api/missions/*/stream', (s) => {
      if (blocked) s.close();
      else {
        socket = s;
        s.connectToServer();
      }
    });
    await page.route('**/api/missions/*/world', (route) =>
      blocked ? route.abort() : route.continue(),
    );
    await page.route('**/api/interactive/*/receipts?**', (route) =>
      holdReceipts ? route.abort() : route.continue(),
    );
    await page.route('**/api/interactive/*/commands', async (route) => {
      if (lose && route.request().postDataJSON()?.intent?.recommendation) {
        lose = false;
        const reply = await route.fetch();
        expect((await reply.json()).accepted).toBe(true);
        await route.abort();
      } else await route.continue();
    });
    const shot = async (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    try {
      await u.scenario({ hostile: 10 });
      await u.action('Pause');
      await u.select(
        ...Array.from(
          { length: 10 },
          (_, i) => `D6 Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await u.review();
      await expect(
        u.pane.getByRole('heading', {
          name: 'Enable Intercept · 10',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        u.pane.getByRole('heading', { name: /leave others unchanged/ }),
      ).toHaveCount(0);
      r.cases.push(
        'Actual 10-friendly/10-hostile review; no redundant smaller group',
      );
      await u.behavior('intercept');
      await expect(u.pane).toContainText('Out of date');
      await u.refresh();
      r.cases.push('Ordinary Fleet policy change invalidates open cards');
      lose = true;
      await u.pane
        .getByRole('button', { name: /^Apply Stop selected/ })
        .click();
      await expect(u.pane).toContainText('Outcome unknown');
      await shot('01-lost-response');
      holdReceipts = true;
      await page.reload();
      await page.getByRole('button', { name: /^Attention:/ }).click();
      await page
        .getByRole('menuitem', { name: 'Retry saved request', exact: true })
        .click();
      await expect.poll(() => r.auditedCommands.length).toBe(2);
      expect(r.auditedCommands[0]).toEqual(r.auditedCommands[1]);
      await expect
        .poll(() =>
          page.evaluate(() =>
            globalThis.sessionStorage.getItem(
              'sentinel.interactive.pending.v1',
            ),
          ),
        )
        .toBe(null);
      holdReceipts = false;
      r.cases.push(
        'Lost HTTP response after real commit; reload and explicit retry retain exact command identity and immutable payload',
      );
      await u.action('Return to active demo');
      await u.select('D6 Friendly 01');
      await u.review();
      await page.route('**/api/interactive/*/recommendations', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            detail: { message: 'Isolated advisory fault' },
          }),
        }),
      );
      await u.pane
        .getByRole('button', { name: 'Refresh options', exact: true })
        .click();
      await expect(u.pane.getByRole('status')).toContainText(
        /fault|503|unavailable/i,
      );
      await expect(
        u.fleet.getByRole('button', { name: 'Apply', exact: true }),
      ).toBeEnabled();
      await page.unroute('**/api/interactive/*/recommendations');
      await u.refresh();
      r.cases.push(
        'Advisory failure is recoverable and ordinary Fleet controls stay usable',
      );
      blocked = true;
      socket.close();
      await expect(u.pane).toContainText('Wait for a connected');
      await shot('02-disconnected');
      blocked = false;
      await expect(
        u.pane.getByRole('button', { name: 'Refresh options', exact: true }),
      ).toBeEnabled({ timeout: 30000 });
      await expect(u.pane).toContainText('Out of date');
      await u.refresh();
      r.cases.push(
        'Transport loss disables Apply; reconnect requires explicit refresh',
      );
      await restartBackend();
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0, {
        timeout: 30000,
      });
      await u.action('Take control');
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }).first(),
      ).toBeEnabled();
      await u.refresh();
      await expect(u.pane).not.toContainText('Acquire or reclaim');
      r.cases.push(
        'Actual sole-backend restart clears epoch-bound cards; paused recovery and explicit control acquisition',
      );
      await u.pane
        .getByRole('button', { name: /^Apply Enable Intercept/ })
        .click();
      await expect(u.pane).toContainText('Command accepted');
      await u.action('Resume');
      await expect
        .poll(
          async () =>
            Object.values((await u.world()).entities).some(
              (e) => e.condition === 'non-operational',
            ),
          { timeout: 20000 },
        )
        .toBe(true);
      await u.action('Pause');
      await u.refresh();
      await expect(u.pane).toContainText('NON-OP');
      await shot('03-non-op');
      expect(
        await u.pane.getByRole('button', { name: /^Apply / }).count(),
      ).toBe(0);
      r.cases.push(
        'Running Intercept resolves via existing atomic NON-OP behavior; unavailable selection receives no action',
      );
      const mid = (await u.world()).mission.id;
      await u.action('End demo');
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
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
      r.ended = (await u.world(mid)).interactive.state;
      await u.action('New demo');
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await u.select('F-01');
      await u.review();
      await expect(u.pane).not.toContainText('D6 Friendly');
      await u.action('End demo');
      r.cases.push(
        'Ended recording reopens read-only; next mission contains no old cards or identities',
      );
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1600);
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
