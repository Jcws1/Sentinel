/* global document, performance, MutationObserver, requestAnimationFrame */
// Exact-revision foreground validation latency. No provider or operator storage.
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { validateSavedScenario } from './support.mjs';
import { operatorUI } from '../support/operator-ui.mjs';

const tag = process.argv[2] ?? 'validation-current';
await withIsolatedRuntime(
  {
    tag,
    frontendPort: 5431,
    backendPort: 8231,
    previewDir: process.env.PERF_BUILD ?? 'dist-test-performance-closure',
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
      activeReviews: [],
      commands: [],
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
          globalThis.__closureArrivals = [];
          globalThis.__closureCommands = [];
          const OriginalSocket = globalThis.WebSocket;
          globalThis.WebSocket = class extends OriginalSocket {
            constructor(...args) {
              super(...args);
              this.addEventListener('message', (event) => {
                const value = JSON.parse(event.data);
                if (value.type !== 'heartbeat')
                  globalThis.__closureArrivals.push({
                    at: performance.now(),
                    wall: Date.now(),
                    type: value.type,
                    sequence: value.sequence ?? value.frame?.sequence,
                    recordedAt: value.recordedAt ?? value.frame?.recordedAt,
                  });
              });
            }
          };
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
            const label =
              event.target.closest('[role="menuitem"]')?.textContent;
            if (label === 'Pause' || label === 'Resume') {
              const sample = {
                label,
                input: performance.now(),
                inputWall: Date.now(),
              };
              globalThis.__closureCommands.push(sample);
              const target = label === 'Pause' ? 'paused' : 'running';
              const observer = new MutationObserver(() => {
                if (!document.querySelector(`[data-run-state="${target}"]`))
                  return;
                sample.visible = performance.now();
                observer.disconnect();
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => {
                    sample.paintOpportunity = performance.now();
                  }),
                );
              });
              observer.observe(document, {
                subtree: true,
                childList: true,
                attributes: true,
              });
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
        await page.evaluate(() => {
          document.title = 'Sentinel D7 closure validation';
        });
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
        if (process.env.PERF_ACTIVE_DIAGNOSTIC === '1') {
          const u = operatorUI(page, frontend);
          await panel
            .getByRole('button', { name: 'Run saved revision 1', exact: true })
            .click();
          await page.locator('[data-run-state="running"]').first().waitFor();
          await expect
            .poll(
              async () =>
                Object.values((await u.world()).tracks).filter(
                  (t) => t.latest.velocity.speedMps > 0,
                ).length,
            )
            .toBe(40);
          const mission = await u.world();
          const fresh = (
            await (
              await page.request.post(
                `${frontend}/api/scenarios/${saved.definitionId}/revisions`,
                {
                  data: {
                    requestId: randomUUID(),
                    expectedRevision: 1,
                    content: { ...content, name: content.name + ' review r2' },
                  },
                },
              )
            ).json()
          ).result;
          for (const revision of [saved, fresh]) {
            await page.waitForTimeout(800);
            const start = await page.evaluate(() => performance.now());
            const begun = performance.now();
            const review = await (
              await page.request.post(`${frontend}/api/scenarios/validate`, {
                data: {
                  definitionId: revision.definitionId,
                  revision: revision.revision,
                  contentHash: revision.contentHash,
                },
              })
            ).json();
            const elapsedMs = performance.now() - begun;
            expect(review.canRun).toBe(false);
            expect(
              review.issues.some((i) => i.code === 'ACTIVE_RUN_EXISTS'),
            ).toBe(true);
            expect(review.reference.revision).toBe(revision.revision);
            await page.waitForTimeout(800);
            const arrivals = await page.evaluate(
              (start) =>
                globalThis.__closureArrivals.filter((a) => a.at >= start - 750),
              start,
            );
            result.activeReviews.push({
              fixture,
              revision: revision.revision,
              kind:
                revision === saved
                  ? 'previously-reviewed'
                  : 'cold-new-revision',
              elapsedMs,
              arrivals,
              gapMs: arrivals.slice(1).map((a, i) => a.at - arrivals[i].at),
            });
            expect((await u.world()).scenario).toEqual(mission.scenario);
          }
          for (let cycle = 0; cycle < 3; cycle++) {
            for (const operation of ['pause', 'resume']) {
              const label = operation === 'pause' ? 'Pause' : 'Resume';
              const begun = performance.now();
              const pending = page.waitForResponse(
                (r) =>
                  r.url().endsWith('/commands') &&
                  r.request().method() === 'POST' &&
                  r.request().postDataJSON()?.intent?.action === operation,
              );
              await u.action(label);
              const response = await pending;
              const receipt = await response.json();
              const bodyReceivedWall = Date.now();
              expect(receipt.accepted).toBe(true);
              await expect
                .poll(() =>
                  page.evaluate(
                    () => globalThis.__closureCommands.at(-1)?.paintOpportunity,
                  ),
                )
                .toBeTruthy();
              result.commands.push({
                fixture,
                cycle,
                operation,
                automationToVisibleMs: performance.now() - begun,
                bodyReceivedWall,
                requestTiming: response.request().timing(),
                browser: await page.evaluate(() =>
                  globalThis.__closureCommands.at(-1),
                ),
              });
            }
          }
          const ended = page.waitForResponse(
            (r) =>
              r.url().endsWith('/commands') &&
              r.request().method() === 'POST' &&
              r.request().postDataJSON()?.intent?.action === 'end',
          );
          await u.action('End demo');
          expect((await (await ended).json()).accepted).toBe(true);
          expect((await u.world(mission.mission.id)).interactive.state).toBe(
            'ended',
          );
        }
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
