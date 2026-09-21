/* global requestAnimationFrame, performance, document, window, devicePixelRatio, screen */
import { expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { URL } from 'node:url';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { loadPerformanceScenario } from '../performance/support.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { foregroundIdentity } from './foreground-identity.mjs';
import {
  captureBrowserSurface,
  launchForegroundBrowser,
} from './foreground-browser.mjs';
import {
  prepareVisibleWorkload,
  inspectVisibleWorkload,
  assertVisibleWorkload,
} from './visible-workload.mjs';

const setupOnly = process.argv.includes('--setup-only');

export function distribution(values) {
  const a = [...values].sort((a, b) => a - b);
  const q = (p) => a[Math.max(0, Math.ceil(p * a.length) - 1)] ?? null;
  return {
    count: a.length,
    mean: a.length ? a.reduce((n, v) => n + v, 0) / a.length : null,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: q(1),
    over50: a.filter((v) => v > 50).length,
  };
}
export async function measureWindow(browser, page, output, label, seconds) {
  const beforeForeground = await foregroundIdentity(browser, page);
  const cdp = await page.context().newCDPSession(page),
    trace = [];
  await cdp.send('Performance.enable');
  const clock = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find(
      (m) => m.name === 'Timestamp',
    ).value;
  cdp.on('Tracing.dataCollected', ({ value }) =>
    trace.push(
      ...value.filter((e) =>
        /FrameDisplayed|FramePresented|DroppedFrame/.test(e.name),
      ),
    ),
  );
  await cdp.send('Tracing.start', {
    categories: 'cc,benchmark,viz',
    transferMode: 'ReportEvents',
  });
  const start = await clock();
  const samples = await page.evaluate(
    (seconds) =>
      new Promise((resolve) => {
        const raf = [],
          states = [],
          started = performance.now();
        globalThis.__sentinelChartsTest?.startPaintCapture();
        let last = 0,
          finished = false;
        const focusLosses = [];
        const blur = () =>
          focusLosses.push({ at: performance.now(), reason: 'window-blur' });
        const visibility = () => {
          if (document.hidden)
            focusLosses.push({
              at: performance.now(),
              reason: 'document-hidden',
            });
        };
        window.addEventListener('blur', blur);
        document.addEventListener('visibilitychange', visibility);
        const finish = (timedOut) => {
          if (finished) return;
          finished = true;
          window.clearTimeout(timer);
          window.removeEventListener('blur', blur);
          document.removeEventListener('visibilitychange', visibility);
          resolve({
            raf,
            states,
            timedOut,
            focusLosses,
            focused: document.hasFocus(),
            visibility: document.visibilityState,
            chartPaints: globalThis.__sentinelChartsTest?.stopPaintCapture(),
          });
        };
        const timer = window.setTimeout(
          () => finish(true),
          (seconds + 3) * 1000,
        );
        const tick = (at) => {
          raf.push(at);
          if (at - last >= 200) {
            last = at;
            const s = globalThis.__sentinelAnalyticsTest?.inspect();
            states.push({
              at,
              age: s?.recordedAt ? Date.now() - Date.parse(s.recordedAt) : null,
              state: s,
              charts: globalThis.__sentinelChartsTest?.inspect(),
              focused: document.hasFocus(),
              visibility: document.visibilityState,
            });
          }
          if (finished) return;
          if (at - started < seconds * 1000) requestAnimationFrame(tick);
          else finish(false);
        };
        requestAnimationFrame(tick);
      }),
    seconds,
  );
  const end = await clock(),
    completed = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end');
  await completed;
  let afterForeground, foregroundFailure;
  try {
    afterForeground = await foregroundIdentity(browser, page);
  } catch (error) {
    foregroundFailure = String(error);
  }
  const displayed = [
    ...new Set(
      trace
        .filter(
          (e) =>
            e.name === 'Display::FrameDisplayed' &&
            e.ts >= start * 1e6 &&
            e.ts <= end * 1e6,
        )
        .map((e) => e.ts / 1000),
    ),
  ].sort((a, b) => a - b);
  const intervals = displayed.slice(1).map((t, i) => t - displayed[i]);
  const rafIntervals = samples.raf.slice(1).map((t, i) => t - samples.raf[i]);
  const report = {
    label,
    seconds: end - start,
    displayedFrames: displayed.length,
    compositorFps: displayed.length / (end - start),
    compositor: distribution(intervals),
    raf: distribution(rafIntervals),
    sourceAgeMs: distribution(
      samples.states.flatMap((s) => (s.age == null ? [] : [s.age])),
    ),
    before: samples.states[0],
    after: samples.states.at(-1),
    beforeForeground,
    afterForeground,
    foregroundFailure,
    timedOut: samples.timedOut,
    allForegroundSamples: samples.states.every(
      (s) => s.focused && s.visibility === 'visible',
    ),
    focusLosses: samples.focusLosses,
  };
  writeFileSync(
    resolve(output, label + '-trace.json'),
    JSON.stringify({ report, samples, trace }),
  );
  await cdp.detach();
  if (
    foregroundFailure ||
    samples.timedOut ||
    !report.allForegroundSamples ||
    samples.focusLosses.length
  )
    throw Error(`Interrupted display sample ${label}; raw trace retained`);
  return report;
}

const tag = process.argv[2] ?? 'phase6-performance';
await withIsolatedRuntime(
  {
    tag,
    frontendPort: 5412,
    backendPort: 8212,
    configured: false,
    previewDir: 'dist-verification-phase6',
    evidenceRoot: 'test-results/phase6-command-picture',
    reportStorage: true,
  },
  async ({ frontend, output }) => {
    const report = {
      started: new Date().toISOString(),
      externalRequests: [],
      errors: [],
      measurements: [],
      cycles: [],
      input: [],
      workloads: [],
      resourceTraffic: [],
      setupOnly,
      setupChecks: [],
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
    try {
      for (const location of ['default', 'sydney'])
        for (const n of [10, 20]) {
          const foregroundBrowser = await launchForegroundBrowser();
          const prefix = `${location}-${n}v${n}`;
          let page;
          try {
            const { browser, context } = foregroundBrowser;
            report.browser = browser.version();
            const browserCdp = await browser.newBrowserCDPSession();
            report.hardware = (await browserCdp.send('SystemInfo.getInfo')).gpu;
            await browserCdp.detach();
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
            page = await foregroundBrowser.newPage();
            const traffic = {
              prefix,
              missionSockets: [],
              historyReads: [],
              auditReads: [],
            };
            report.resourceTraffic.push(traffic);
            page.on('websocket', (socket) => {
              if (
                !/\/missions\/[^/]+\/stream$/.test(
                  new URL(socket.url()).pathname,
                )
              )
                return;
              const entry = {
                url: socket.url(),
                method: 'WEBSOCKET',
                closed: false,
              };
              traffic.missionSockets.push(entry);
              socket.on('close', () => {
                entry.closed = true;
              });
            });
            page.on('request', (request) => {
              const pathname = new URL(request.url()).pathname;
              const entry = { url: request.url(), method: request.method() };
              if (pathname.endsWith('/observed-history'))
                traffic.historyReads.push(entry);
              else if (pathname.endsWith('/audit-query'))
                traffic.auditReads.push(entry);
            });
            const resources = () => ({
              missionSocketCreations: traffic.missionSockets.length,
              activeMissionSockets: traffic.missionSockets.filter(
                (s) => !s.closed,
              ).length,
              historyReads: traffic.historyReads.length,
              auditReads: traffic.auditReads.length,
            });
            const resourceDelta = (before, after) =>
              Object.fromEntries(
                Object.keys(before).map((key) => [
                  key,
                  after[key] - before[key],
                ]),
              );
            page.on('pageerror', (e) => report.errors.push(e.message));
            await loadPerformanceScenario(page, frontend, n, {
              location,
              routeHalfSpanDeg: 0.035,
            });
            const ui = operatorUI(page, frontend);
            await ui.tab('Orchestrator', 'Close view');
            const nav = page.getByRole('button', {
              name: 'Hide Views list',
              exact: true,
            });
            if (await nav.isVisible()) await nav.click();
            const first = await ui.world();
            const origin =
              first.interactive?.localGeometry?.origin ??
              first.mission.referencePoint;
            expect(origin).toBeTruthy();
            const cameraOrigin = {
              longitudeDeg: origin.longitudeDeg,
              latitudeDeg: origin.latitudeDeg,
            };
            await sleep(500);
            const second = await ui.world();
            report.workloads.push({
              prefix,
              focusEmulationDisabled: true,
              moving: Object.keys(first.tracks).filter(
                (id) =>
                  JSON.stringify(first.tracks[id].latest.position) !==
                  JSON.stringify(second.tracks[id].latest.position),
              ).length,
              sourceUnits: Object.keys(first.entities).length,
              cameraOrigin,
              cameraGroundSpanM: 10000,
            });
            expect(report.workloads.at(-1).moving).toBe(2 * n);
            const initialResources = resources();
            report.workloads.at(-1).initialResources = initialResources;
            report.environment = await page.evaluate(() => ({
              viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
              },
              dpr: devicePixelRatio,
              screen: { width: screen.width, height: screen.height },
            }));
            const measure = async (
              label,
              seconds = 12,
              pacingTargetApplicable = true,
            ) => {
              // Selection may open the shared inspector. Keep the measured
              // configuration limited to the surfaces named in this window.
              if (
                await page
                  .getByRole('tab', { name: 'Details', exact: true })
                  .count()
              )
                await ui.tab('Details', 'Close view');
              await prepareVisibleWorkload(page, cameraOrigin);
              await sleep(800);
              const beforeVisibility = await inspectVisibleWorkload(page);
              assertVisibleWorkload(beforeVisibility, label, 2 * n);
              await captureBrowserSurface(page, {
                path: resolve(output, `${prefix}-${label}-visible.png`),
              });
              if (setupOnly) {
                report.setupChecks.push({
                  label: `${prefix}-${label}`,
                  beforeVisibility,
                });
                save();
                return;
              }
              const sourceBefore = await ui.world();
              const resourcesBefore = resources();
              const sample = await measureWindow(
                browser,
                page,
                output,
                `${prefix}-${label}`,
                seconds,
              );
              const sourceAfter = await ui.world();
              sample.beforeVisibility = beforeVisibility;
              sample.afterVisibility = await inspectVisibleWorkload(page);
              sample.movingUnits = Object.keys(sourceBefore.tracks).filter(
                (id) =>
                  JSON.stringify(sourceBefore.tracks[id].latest.position) !==
                  JSON.stringify(sourceAfter.tracks[id]?.latest.position),
              ).length;
              sample.sourceUnits = Object.keys(sourceBefore.entities).length;
              sample.resources = {
                before: resourcesBefore,
                after: resources(),
                delta: resourceDelta(resourcesBefore, resources()),
              };
              sample.pacingTargetApplicable = pacingTargetApplicable;
              sample.mapBounds = (await page
                .locator('[data-view-id="tactical"]')
                .isVisible())
                ? await page.locator('[data-view-id="tactical"]').boundingBox()
                : null;
              sample.visibleMaps = await page
                .locator('.tactical-view')
                .evaluateAll((elements) =>
                  elements.flatMap((element) => {
                    const rect = element.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0
                      ? [
                          {
                            id: element.getAttribute('data-view-id'),
                            mode: element.getAttribute('data-projection'),
                            frameId: element.getAttribute('data-frame-id'),
                            bounds: rect.toJSON(),
                          },
                        ]
                      : [];
                  }),
                );
              report.measurements.push(sample);
              save();
              assertVisibleWorkload(sample.afterVisibility, label, 2 * n);
              expect(sample.movingUnits).toBe(2 * n);
              expect(sample.resources.after.missionSocketCreations).toBe(
                initialResources.missionSocketCreations,
              );
            };
            const side = async (title) => {
              const show = page.getByRole('button', {
                name: 'Show Views list',
                exact: true,
              });
              if (await show.isVisible()) await show.click();
              await page
                .getByRole('button', { name: `${title} options`, exact: true })
                .click();
              await page
                .getByRole('menuitem', { name: 'Open to Side', exact: true })
                .click();
              const hide = page.getByRole('button', {
                name: 'Hide Views list',
                exact: true,
              });
              if (await hide.isVisible()) await hide.click();
            };
            const map = page.locator('[data-view-id="tactical"]');
            await measure('closed-tactical', 30);
            await map.getByRole('button', { name: '3D', exact: true }).click();
            await sleep(2500);
            await measure('closed-3d', 30);
            await map
              .getByRole('button', { name: 'Tactical', exact: true })
              .click();
            await side('Command Picture');
            const pane = page.locator('[data-view="command"]');
            const lenses = [
              'Overview',
              'Resources',
              'Recorded activity',
              'Statistics',
              'Comparison',
              'Vertical profile',
            ];
            for (const surface of ['tactical', '3d', 'alone']) {
              if (surface === '3d') {
                await map
                  .getByRole('button', { name: '3D', exact: true })
                  .click();
                await sleep(2500);
              } else if (surface === 'alone') {
                await ui.tab('3D Map', 'Close view');
              }
              for (const lens of lenses) {
                await pane
                  .getByRole('button', { name: lens, exact: true })
                  .click();
                if (lens === 'Recorded activity' || lens === 'Statistics')
                  await expect(
                    pane.getByText(/Complete range summary/),
                  ).toBeVisible();
                if (lens === 'Comparison') {
                  await pane
                    .getByRole('button', {
                      name: 'Clear selection',
                      exact: true,
                    })
                    .click();
                  const chooser = pane.getByRole('combobox', {
                    name: 'Add to comparison',
                    exact: true,
                  });
                  for (const label of [
                    'Friendly 01',
                    'Friendly 02',
                    'Hostile 01',
                    'Hostile 02',
                  ])
                    await chooser.selectOption({ label });
                }
                const chart = pane.locator('.analytic-chart').first();
                if (await chart.count()) await chart.scrollIntoViewIfNeeded();
                await measure(
                  `${surface}-${lens.toLowerCase().replaceAll(' ', '-')}`,
                  12,
                  surface !== 'alone' || lens === 'Vertical profile',
                );
              }
            }
            await side('3D Map');
            await map
              .getByRole('button', { name: 'Tactical', exact: true })
              .click();
            await pane
              .getByRole('button', { name: 'Open profile to side' })
              .click();
            const profile = page.locator('[data-view="vertical"]');
            await profile
              .getByRole('checkbox', { name: 'Selected observed history' })
              .check();
            await expect(profile.getByText(/compatible samples/)).toBeVisible();
            await profile.locator('.analytic-chart').scrollIntoViewIfNeeded();
            await measure('two-profiles-tactical', 30);
            await map.getByRole('button', { name: '3D', exact: true }).click();
            await sleep(2500);
            await measure('two-profiles-3d', 30);
            await captureBrowserSurface(page, {
              path: resolve(output, `${prefix}-combined.png`),
            });
            await ui.tab('Vertical Profile', 'Close view');
            await ui.tab('Command Picture', 'Close view');
            await map
              .getByRole('button', { name: 'Tactical', exact: true })
              .click();
            await ui.tab('Tactical Map', 'New Tactical pane');
            const secondMap = page.locator('[data-view-id="tactical:2"]');
            await secondMap
              .getByRole('button', { name: '3D', exact: true })
              .click();
            await sleep(2500);
            const assertDualMaps = async () => {
              await expect(map).toBeVisible();
              await expect(secondMap).toBeVisible();
              await expect(map).toHaveAttribute('data-projection', 'tactical');
              await expect(secondMap).toHaveAttribute(
                'data-projection',
                'three-d',
              );
            };
            await assertDualMaps();
            await measure('closed-dual-maps', 30);
            await side('Command Picture');
            await pane
              .getByRole('button', { name: 'Vertical profile', exact: true })
              .click();
            await pane
              .getByRole('checkbox', { name: 'Selected observed history' })
              .check();
            await expect(pane.getByText(/compatible samples/)).toBeVisible();
            await pane
              .getByRole('button', { name: 'Open profile to side' })
              .click();
            await profile
              .getByRole('checkbox', { name: 'Selected observed history' })
              .check();
            await expect(profile.getByText(/compatible samples/)).toBeVisible();
            await pane.locator('.analytic-chart').scrollIntoViewIfNeeded();
            await profile.locator('.analytic-chart').scrollIntoViewIfNeeded();
            await assertDualMaps();
            await measure('two-profiles-dual-maps', 30);
            await captureBrowserSurface(page, {
              path: resolve(output, `${prefix}-dual-maps-combined.png`),
            });
            await ui.tab('3D Map 2', 'Close view');
            await map.getByRole('button', { name: '3D', exact: true }).click();
            await sleep(2500);
            await profile.locator('tbody button').first().click();
            await ui.tab('Details', 'Close view');
            await ui.tab('Vertical Profile', 'Close view');
            await ui.tab('Command Picture', 'Close view');
            await sleep(1000);
            const cdp = await context.newCDPSession(page);
            await cdp.send('HeapProfiler.collectGarbage');
            const heap = async () =>
              (await cdp.send('Runtime.getHeapUsage')).usedSize;
            const before = await heap(),
              cycle = [];
            const cycleResourcesBefore = resources();
            const cycleReport = {
              prefix,
              heapBefore: before,
              cycle,
              resourcesBefore: cycleResourcesBefore,
              baseline: await page.evaluate(() => ({
                charts: globalThis.__sentinelChartsTest.inspect(),
                runtime: globalThis.__sentinelAnalyticsTest.inspect(),
              })),
            };
            report.cycles.push(cycleReport);
            for (let i = 0; i < 10; i++) {
              const iterationResourcesBefore = resources();
              await side('Command Picture');
              await pane
                .getByRole('button', { name: 'Vertical profile', exact: true })
                .click();
              await foregroundBrowser.resize(page, {
                width: i % 2 ? 1280 : 1200,
                height: 700,
              });
              await pane.locator('.analytic-chart').scrollIntoViewIfNeeded();
              const label = await pane
                .locator('tbody button')
                .first()
                .textContent();
              const start = performance.now();
              await pane.locator('tbody button').first().click();
              await expect(page.locator('.selection-details')).toContainText(
                label,
              );
              report.input.push({ prefix, ms: performance.now() - start });
              await ui.tab('Command Picture', 'Close view');
              if (
                await page
                  .getByRole('tab', { name: 'Details', exact: true })
                  .count()
              )
                await ui.tab('Details', 'Close view');
              const hiddenResourcesBefore = resources();
              await sleep(1000);
              const hiddenResourcesAfter = resources();
              cycle.push({
                ...(await page.evaluate(() => ({
                  charts: globalThis.__sentinelChartsTest.inspect(),
                  runtime: globalThis.__sentinelAnalyticsTest.inspect(),
                }))),
                resources: {
                  before: iterationResourcesBefore,
                  after: hiddenResourcesAfter,
                  hiddenBefore: hiddenResourcesBefore,
                  hiddenAfter: hiddenResourcesAfter,
                  hiddenMs: 1000,
                  hiddenDelta: resourceDelta(
                    hiddenResourcesBefore,
                    hiddenResourcesAfter,
                  ),
                },
              });
              save();
              expect(hiddenResourcesAfter.missionSocketCreations).toBe(
                initialResources.missionSocketCreations,
              );
              expect(hiddenResourcesAfter.historyReads).toBe(
                hiddenResourcesBefore.historyReads,
              );
              expect(hiddenResourcesAfter.auditReads).toBe(
                hiddenResourcesBefore.auditReads,
              );
            }
            await cdp.send('HeapProfiler.collectGarbage');
            cycleReport.heapAfter = await heap();
            cycleReport.resourcesAfter = resources();
            await cdp.detach();
            expect(cycle.every((c) => c.charts.active === 0)).toBe(true);
            await ui.action('End demo');
            await expect(
              page.locator('[data-run-state="ended"]').first(),
            ).toBeVisible();
            await expect
              .poll(async () => {
                const response = await page.request.get(
                  `${frontend}/api/interactive/entry`,
                );
                expect(response.ok()).toBe(true);
                const entry = await response.json();
                expect(entry.enabled).toBe(true);
                report.workloads.at(-1).endedEntry = entry;
                // The existing contract permits an omitted or null empty slot.
                return entry.activeMissionId ?? null;
              })
              .toBeNull();
            report.workloads.at(-1).endConfirmed = true;
            save();
          } catch (error) {
            if (page) {
              const captures = await Promise.allSettled([
                captureBrowserSurface(page, {
                  path: resolve(output, `${prefix}-failure.png`),
                }),
                page
                  .locator('body')
                  .ariaSnapshot()
                  .then((snapshot) =>
                    writeFileSync(
                      resolve(output, `${prefix}-failure-aria.txt`),
                      snapshot,
                    ),
                  ),
              ]);
              report.failureCaptureErrors = captures.flatMap((capture) =>
                capture.status === 'rejected' ? [String(capture.reason)] : [],
              );
            }
            throw error;
          } finally {
            await foregroundBrowser.close();
          }
        }
      expect(report.externalRequests).toEqual([]);
      expect(report.errors).toEqual([]);
      expect(setupOnly ? report.setupChecks : report.measurements).toHaveLength(
        96,
      );
      report.passed = true;
    } catch (error) {
      report.failure = String(error);
      throw error;
    } finally {
      save();
    }
  },
);
