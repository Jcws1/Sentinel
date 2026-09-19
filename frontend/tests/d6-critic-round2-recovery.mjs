// Independent round-2 continuation: own UI, isolated runtime, exact retry and recorded inspection.
import { chromium, expect } from '@playwright/test';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
await withD5Runtime(
  {
    phase: 'd6',
    tag: 'critic-round2-recovery',
    frontendPort: 5364,
    backendPort: 8164,
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      }),
      page = await context.newPage(),
      u = d6UI(page, frontend);
    page.setDefaultTimeout(25000);
    const r = { cases: [], errors: [], audited: [] };
    let lost = false,
      hold = false;
    const sha = (x) => createHash('sha256').update(x).digest('hex');
    const sourceFiles = Object.keys(
      JSON.parse(
        readFileSync(
          resolve('../docs/d6/critic-round2/functional-result.json'),
          'utf8',
        ),
      ).sourceBefore,
    );
    const hashes = () =>
      Object.fromEntries(
        sourceFiles.map((f) => [f, sha(readFileSync(resolve('..', f)))]),
      );
    r.sourceBefore = hashes();
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('request', (req) => {
      if (
        req.method() === 'POST' &&
        req.url().endsWith('/commands') &&
        req.postDataJSON()?.intent?.recommendation
      )
        r.audited.push({
          id: req.postDataJSON().commandId,
          hash: sha(req.postData()),
        });
    });
    await page.route('**/api/interactive/*/receipts?**', (route) =>
      hold ? route.abort() : route.continue(),
    );
    await page.route('**/api/interactive/*/commands', async (route) => {
      if (lost && route.request().postDataJSON()?.intent?.recommendation) {
        lost = false;
        const response = await route.fetch();
        expect((await response.json()).accepted).toBe(true);
        await route.abort();
      } else await route.continue();
    });
    const shot = (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    const check = (s) => {
      r.cases.push(s);
      globalThis.console.log(s);
    };
    try {
      await u.scenario({
        friendly: 2,
        hostile: 2,
        name: `D6 critic recovery ${Date.now()}`,
      });
      await u.action('Pause');
      await u.tab('Conductor', 'Close view');
      await u.select('D6 Friendly 01', 'D6 Friendly 02');
      await u.review();
      lost = true;
      await u.pane
        .getByRole('button', { name: /^Apply Enable Intercept/ })
        .click();
      await expect(u.pane).toContainText('Outcome unknown');
      await shot('01-unknown');
      hold = true;
      await page.reload();
      await page.getByRole('button', { name: /^Attention:/ }).click();
      await page
        .getByRole('menuitem', { name: 'Retry saved request', exact: true })
        .click();
      await expect.poll(() => r.audited.length).toBe(2);
      expect(r.audited[0]).toEqual(r.audited[1]);
      await expect
        .poll(() =>
          page.evaluate(() =>
            globalThis.sessionStorage.getItem(
              'sentinel.interactive.pending.v1',
            ),
          ),
        )
        .toBe(null);
      hold = false;
      check(
        'Real command committed, HTTP response deliberately lost; reload and explicit Retry retained the exact identity and immutable payload.',
      );
      await u.action('Return to active demo');
      await u.select('D6 Friendly 01');
      await u.review();
      await restartBackend();
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0, {
        timeout: 30000,
      });
      await u.action('Take control');
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }).first(),
      ).toBeEnabled();
      await u.pane
        .getByRole('button', { name: /^(Refresh options|Get suggestions)$/ })
        .click();
      await expect
        .poll(
          async () =>
            (await u.pane.locator('.suggestion-card').count()) > 0 ||
            (await u.pane.innerText()).includes(
              'Situation changed while reviewing',
            ),
        )
        .toBe(true);
      if (
        (await u.pane.innerText()).includes('Situation changed while reviewing')
      ) {
        r.recoveryRefreshGuard = true;
        await u.refresh();
      }
      await expect(u.pane).not.toContainText('Acquire or reclaim');
      await shot('02-restart-recovered');
      check(
        'Actual sole-backend restart cleared epoch-bound cards; recovered source stayed paused and explicit Take control restored legitimate options.',
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
      const views = page.getByRole('button', {
        name: 'Show Views list',
        exact: true,
      });
      if (await views.isVisible()) await views.click();
      await page
        .getByRole('button', {
          name: 'Open Suggestions from Views',
          exact: true,
        })
        .click();
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      expect((await u.world(mid)).interactive.state).toBe('ended');
      await shot('03-recorded');
      await u.action('New demo');
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await u.select('F-01');
      await u.review();
      await expect(u.pane).not.toContainText('D6 Friendly');
      await shot('04-new-run');
      await u.action('End demo');
      check(
        'Explicit Previous demos selection and Views reopening retain read-only recorded inspection; new demo clears prior cards and uses only current selected identities.',
      );
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 2000);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      r.sourceAfter = hashes();
      r.sourceUnchanged =
        JSON.stringify(r.sourceBefore) === JSON.stringify(r.sourceAfter);
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          passed: r.passed,
          cases: r.cases.length,
          failure: r.failure,
          errors: r.errors,
          sourceUnchanged: r.sourceUnchanged,
        }),
      );
    }
  },
);
