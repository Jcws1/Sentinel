/* global document */
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { loadPerformanceScenario } from './support.mjs';

await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'perf-recovery',
    frontendPort: 5373,
    backendPort: 8173,
    evidenceRoot: 'test-results/performance',
    previewDir: process.env.PERF_BUILD ?? 'dist-performance',
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const u = operatorUI(page, frontend),
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
      await loadPerformanceScenario(page, frontend, 20, {
        location: process.env.PERF_LOCATION ?? 'default',
      });
      await page.evaluate(() => {
        document.title = 'Sentinel D7 closure recovery';
      });
      const initial = await u.world();
      await expect
        .poll(async () => {
          const current = await u.world();
          return Object.values(initial.tracks).filter(
            (t) =>
              JSON.stringify(t.latest.position) !==
              JSON.stringify(current.tracks[t.id].latest.position),
          ).length;
        })
        .toBe(40);
      r.cases.push(
        `All forty moving at ${process.env.PERF_LOCATION ?? 'default'} location`,
      );
      if (process.env.PERF_LOCATION === 'sydney') {
        await u.tab('Orchestrator', 'Close view');
        await u.select('Friendly 01');
        const controlled = initial.interactive.controls.find(
          (c) => initial.entities[c.entityId].label === 'Friendly 01',
        );
        expect(controlled).toBeTruthy();
        await page.evaluate(() =>
          globalThis.__sentinelMapTest.setCamera('tactical', {
            center: { longitudeDeg: 151.1772, latitudeDeg: -33.9461 },
            groundSpanM: 2500,
            headingTrueDeg: 0,
            pitchFromNadirDeg: 0,
          }),
        );
        const surface = page.locator('[data-view-id="tactical"] .map-canvas');
        const box = await surface.boundingBox();
        const directReply = page.waitForResponse(
          (response) =>
            response.request().method() === 'POST' &&
            response.url().endsWith('/direct-moves'),
        );
        await surface.click({
          button: 'right',
          position: { x: box.width * 0.58, y: box.height * 0.56 },
        });
        const direct = await (await directReply).json();
        expect(direct.accepted).toBe(true);
        const manualStart = await u.world();
        await expect
          .poll(async () =>
            JSON.stringify(
              (await u.world()).tracks[controlled.controlTrackId].latest
                .position,
            ),
          )
          .not.toBe(
            JSON.stringify(
              manualStart.tracks[controlled.controlTrackId].latest.position,
            ),
          );
        await u.behavior('patrol');
        await expect
          .poll(
            async () =>
              (await u.world()).fleetBehavior.members.find(
                (m) => m.entityId === controlled.entityId,
              )?.policy,
          )
          .toBe('patrol');
        await shot('00-sydney-manual-patrol');
        for (const [name, action] of [
          ['Stop selected', 'stop'],
          ['Return to script', 'return-to-script'],
        ]) {
          const response = page.waitForResponse(
            (reply) =>
              reply.request().method() === 'POST' &&
              reply.url().endsWith('/commands') &&
              reply.request().postDataJSON()?.intent?.action === action,
          );
          await u.fleet.getByRole('button', { name, exact: true }).click();
          expect((await (await response).json()).accepted).toBe(true);
        }
        r.cases.push(
          'Sydney actual ground-click manual movement, Patrol, movement Stop and Return to script retain geographic authority',
        );
      }
      await u.action('Pause');
      await u.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await u.review();
      await expect(
        u.pane.getByRole('heading', {
          name: 'Enable Intercept · 20',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        u.pane.getByRole('heading', { name: /leave others unchanged/ }),
      ).toHaveCount(0);
      r.cases.push(
        'Actual 20-friendly/20-hostile review; no redundant smaller group',
      );
      await u.behavior('intercept');
      await expect(u.pane).toContainText('Out of date');
      await u.refresh();
      r.cases.push('Ordinary Fleet policy change invalidates open cards');
      // Block receipt reconciliation before losing the response. A successful
      // background reconciliation is correct behavior, but would remove the
      // pending identity before this explicit reload/retry case can inspect it.
      holdReceipts = true;
      lose = true;
      await u.pane
        .getByRole('button', { name: /^Apply Stop selected/ })
        .click();
      await expect(u.pane).toContainText('Outcome unknown');
      const pendingBeforeReload = await page.evaluate(() =>
        globalThis.sessionStorage.getItem('sentinel.interactive.pending.v1'),
      );
      expect(pendingBeforeReload).not.toBe(null);
      await shot('01-lost-response');
      await page.reload();
      await expect
        .poll(() =>
          page.evaluate(() =>
            globalThis.sessionStorage.getItem(
              'sentinel.interactive.pending.v1',
            ),
          ),
        )
        .toBe(pendingBeforeReload);
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
      await u.select('Friendly 01');
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
      const oldEpoch = (await u.world()).interactive.executorEpoch;
      const recoveringMission = (await u.world()).mission.id;
      await restartBackend();
      await expect
        .poll(
          async () => {
            try {
              return (await u.world(recoveringMission)).interactive
                .executorEpoch;
            } catch {
              return oldEpoch;
            }
          },
          { timeout: 30000 },
        )
        .not.toBe(oldEpoch);
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0, {
        timeout: 30000,
      });
      if (
        !(await page
          .getByRole('button', { name: 'Resume', exact: true })
          .first()
          .isEnabled())
      )
        await u.action('Take control');
      await expect(
        page.getByRole('button', { name: 'Resume', exact: true }).first(),
      ).toBeEnabled();
      await u.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
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
          // This 20v20 fixture begins about 445 m apart. Existing 120 vs 80
          // km/h pursuit needs roughly 40 seconds; do not alter simulation time.
          { timeout: 60000 },
        )
        .toBe(true);
      await expect
        .poll(
          async () =>
            Object.values((await u.world()).entities).filter(
              (e) => e.condition === 'non-operational',
            ).length,
          { timeout: 45000 },
        )
        .toBe(40);
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
      // Isolate mission identity from the deliberately strict live-frame
      // recommendation freshness guard. That guard was exercised above.
      await u.action('Pause');
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await u.select('F-01');
      await u.review();
      await expect(u.pane).not.toContainText('Friendly 01');
      expect((await u.world()).mission.id).not.toBe(mid);
      expect(
        await page.evaluate(() =>
          globalThis.sessionStorage.getItem('sentinel.interactive.pending.v1'),
        ),
      ).toBe(null);
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
