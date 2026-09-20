/* global chrome, devicePixelRatio, innerWidth, document */
// Genuine browser zoom and a bounded hidden-pane/reopen check, not FPS evidence.
import { chromium, expect } from '@playwright/test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';

// Keep the disposable browser profile outside Vite's source watcher. Edge
// exclusively locks its Cookies file while running on Windows.
const temporary = mkdtempSync(resolve(tmpdir(), 'sentinel-orchestrator-zoom-'));
const extension = resolve(temporary, 'extension');
mkdirSync(extension, { recursive: true });
writeFileSync(
  resolve(extension, 'manifest.json'),
  JSON.stringify({
    manifest_version: 3,
    name: 'Task-only Orchestrator zoom check',
    version: '1.0',
    permissions: ['tabs'],
    host_permissions: ['http://127.0.0.1:5393/*'],
    background: { service_worker: 'worker.js' },
  }),
);
writeFileSync(
  resolve(extension, 'worker.js'),
  'chrome.runtime.onInstalled.addListener(() => {});',
);
await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'orchestrator-workspace',
    frontendPort: 5393,
    backendPort: 8193,
    evidenceRoot: 'test-results/orchestrator-ui',
  },
  async ({ frontend, output }) => {
    const profile = resolve(temporary, 'profile');
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
    const page = context.pages()[0] ?? (await context.newPage()),
      ui = operatorUI(page, frontend),
      panel = page.locator('[data-view="orchestrator"]');
    page.setDefaultTimeout(15000);
    const r = { profile, extension, zoom: [], sockets: 0, errors: [] };
    page.on('pageerror', (e) => r.errors.push(e.message));
    page.on('websocket', () => r.sockets++);
    const pool = () =>
      page.evaluate(() => globalThis.__sentinelRendererPoolTest.inspect());
    try {
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'));
      const content = JSON.parse(
        readFileSync(
          'tests/fixtures/scenario-location/remote-20v20.json',
          'utf8',
        ),
      );
      expect(
        (
          await (
            await page.request.post(frontend + '/api/scenarios', {
              data: { requestId: randomUUID(), expectedRevision: 0, content },
            })
          ).json()
        ).accepted,
      ).toBe(true);
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', {
          name: /Location · Sydney 20v20 · r1.*Saved plan/,
        })
        .click();
      await panel.getByRole('tab', { name: 'Units', exact: true }).click();
      for (const zoom of [1, 1.25, 0.8, 1]) {
        const confirmed = await worker.evaluate(
          async ({ frontend, zoom }) => {
            const tabs = await chrome.tabs.query({ url: `${frontend}/*` });
            if (tabs.length !== 1) throw Error('Expected one task tab');
            await chrome.tabs.setZoom(tabs[0].id, zoom);
            return chrome.tabs.getZoom(tabs[0].id);
          },
          { frontend, zoom },
        );
        expect(confirmed).toBe(zoom);
        await page.waitForTimeout(300);
        await panel.getByRole('tab', { name: 'Units', exact: true }).click();
        await page.keyboard.press('ArrowRight');
        await expect(
          panel.getByRole('tab', { name: 'Conductor', exact: true }),
        ).toBeFocused();
        await expect(
          panel.getByRole('button', {
            name: 'Validate saved revision',
            exact: true,
          }),
        ).toBeInViewport();
        const state = await page.evaluate(() => ({
          dpr: devicePixelRatio,
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(state.scrollWidth).toBeLessThanOrEqual(state.width + 1);
        r.zoom.push({ zoom, confirmed, ...state });
        await page.screenshot({ path: resolve(output, `zoom-${zoom}.png`) });
      }
      expect(r.zoom[1].dpr).toBeGreaterThan(r.zoom[0].dpr);
      expect(r.zoom[2].dpr).toBeLessThan(r.zoom[0].dpr);
      await panel
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(
        panel.getByLabel('Scenario validation review'),
      ).toContainText('Ready to run');
      await panel
        .getByRole('button', { name: 'Run saved revision 1', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      const running = await ui.world();
      await expect
        .poll(() =>
          page.evaluate((missionId) => {
            const map = globalThis.__sentinelMapTest?.inspect('tactical');
            return (
              map?.renderer.active &&
              map.missionId === missionId &&
              !!map.frameId &&
              new Set(map.renderedPoints.map((p) => p.id)).size === 40
            );
          }, running.mission.id),
        )
        .toBe(true);
      const displayed = await page.evaluate(
        () => globalThis.__sentinelMapTest.inspect('tactical').sequence,
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => globalThis.__sentinelMapTest.inspect('tactical').sequence,
          ),
        )
        .toBeGreaterThan(displayed);
      const before = await pool(),
        sockets = r.sockets,
        world = await ui.world();
      await page
        .getByRole('button', { name: 'Open Details', exact: true })
        .first()
        .click();
      await expect(panel).toBeHidden();
      await page.waitForTimeout(300);
      const hiddenBefore = await panel
        .locator('.conductor-context')
        .textContent();
      await page.waitForTimeout(1600);
      const hiddenAfter = await panel
        .locator('.conductor-context')
        .textContent();
      expect(hiddenAfter).toBe(hiddenBefore);
      expect((await ui.world()).interactive.tick).toBeGreaterThan(
        world.interactive.tick,
      );
      await page
        .getByRole('button', { name: 'Open Orchestrator', exact: true })
        .first()
        .click();
      await expect(panel).toBeVisible();
      await expect
        .poll(() => panel.locator('.conductor-context').textContent())
        .not.toBe(hiddenBefore);
      for (let i = 0; i < 8; i++) {
        await ui.tab('Orchestrator', 'Close view');
        await page
          .getByRole('button', { name: 'Open Orchestrator', exact: true })
          .first()
          .click();
        await expect(panel).toHaveCount(1);
        await page.waitForTimeout(200);
      }
      const after = await pool();
      expect(after.alive).toBe(before.alive);
      expect(after.leases.map((l) => [l.viewId, l.mode])).toEqual(
        before.leases.map((l) => [l.viewId, l.mode]),
      );
      expect(r.sockets).toBe(sockets);
      r.hidden = {
        unchangedHiddenScheduleText: hiddenAfter === hiddenBefore,
        caughtUpOnReveal: true,
      };
      r.reopening = {
        iterations: 8,
        before,
        after,
        additionalSockets: r.sockets - sockets,
      };
      const divider = page.getByRole('separator').last();
      const widthBefore = (await panel.boundingBox()).width;
      await divider.focus();
      await page.keyboard.press('ArrowLeft');
      await expect
        .poll(async () => (await panel.boundingBox()).width)
        .not.toBe(widthBefore);
      r.resizing = {
        widthBefore,
        widthAfter: (await panel.boundingBox()).width,
      };
      await page.keyboard.press('ArrowRight');
      await page.screenshot({ path: resolve(output, 'reopened-running.png') });
      await ui.action('End demo');
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e);
      await page.screenshot({ path: resolve(output, 'failure.png') });
      throw e;
    } finally {
      await context.close();
      writeFileSync(resolve(output, 'report.json'), JSON.stringify(r, null, 2));
    }
  },
);
