/* global document, window, screen, devicePixelRatio, performance, localStorage, requestAnimationFrame */
import { chromium, expect } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import {
  externalFixture,
  openSimulation,
  simulationFlow,
  submitSimulation,
} from '../support/simulation-ui.mjs';
import { loadPerformanceScenario } from '../performance/support.mjs';
import { operatorUI } from '../support/operator-ui.mjs';

process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
const tag = process.argv[2] ?? 'phase5-foreground';
const interactiveCount = Number(process.argv[3] ?? 0);
if (![0, 10, 20].includes(interactiveCount))
  throw Error('Expected external (0), 10 or 20');
async function displayWindow(page, output, label) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const clock = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find(
      (metric) => metric.name === 'Timestamp',
    ).value;
  const frames = [];
  cdp.on('Tracing.dataCollected', ({ value }) =>
    frames.push(
      ...value.filter((event) =>
        /FrameDisplayed|FramePresented|DrawFrame|DroppedFrame/.test(event.name),
      ),
    ),
  );
  await cdp.send('Tracing.start', {
    categories: 'cc,benchmark,viz',
    transferMode: 'ReportEvents',
  });
  const begin = await clock();
  const raf = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const stamps = [],
          start = performance.now();
        const tick = (at) => {
          stamps.push(at);
          if (at - start < 10000) requestAnimationFrame(tick);
          else resolve(stamps);
        };
        requestAnimationFrame(tick);
      }),
  );
  const end = await clock();
  const complete = new Promise((resolve) =>
    cdp.once('Tracing.tracingComplete', resolve),
  );
  await cdp.send('Tracing.end');
  await complete;
  const presented = frames
    .filter(
      (event) =>
        event.name === 'Display::FrameDisplayed' &&
        event.ts >= begin * 1e6 &&
        event.ts <= end * 1e6,
    )
    .map((event) => event.ts / 1000)
    .sort((a, b) => a - b);
  const intervals = presented.slice(1).map((at, i) => at - presented[i]);
  const ordered = [...intervals].sort((a, b) => a - b);
  const quantile = (p) =>
    ordered[Math.max(0, Math.ceil(ordered.length * p) - 1)] ?? null;
  const report = {
    label,
    seconds: end - begin,
    count: presented.length,
    compositorFps: presented.length / (end - begin),
    medianMs: quantile(0.5),
    p95Ms: quantile(0.95),
    p99Ms: quantile(0.99),
    maxMs: quantile(1),
    stallsOver50Ms: intervals.filter((n) => n > 50).length,
    missed60HzEstimate: intervals.reduce(
      (sum, n) => sum + Math.max(0, Math.floor(n / (1000 / 60)) - 1),
      0,
    ),
    limitations:
      '10-second blank-grid Tactical window; compositor events plus RAF diagnostics, no sustained or configured-provider acceptance; missed-frame estimate is conservative',
    rafFrames: raf.length,
  };
  writeFileSync(
    resolve(output, label + '-frames.json'),
    JSON.stringify({ report, frames, raf }),
  );
  await cdp.detach();
  return report;
}
await withIsolatedRuntime(
  {
    tag,
    frontendPort: 5405,
    backendPort: 8205,
    configured: false,
    previewDir: 'dist-verification-phase5',
    evidenceRoot: 'test-results/phase5-simulation-compatibility',
    reportStorage: true,
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const report = {
      browser: browser.version(),
      cases: [],
      errors: [],
      externalRequests: [],
      measurements: [],
      screenshots: [],
      started: new Date().toISOString(),
    };
    const shot = async (name) => {
      await page.screenshot({ path: resolve(output, name + '.png') });
      report.screenshots.push(name + '.png');
      save();
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
    page.on('pageerror', (error) => report.errors.push(error.message));
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
      const cdp = await browser.newBrowserCDPSession();
      const hardware = await cdp.send('SystemInfo.getInfo');
      report.gpu = hardware.gpu.devices;
      await page.goto(frontend);
      await page.bringToFront();
      report.environment = await page.evaluate(() => ({
        viewport: { width: window.innerWidth, height: window.innerHeight },
        screen: { width: screen.width, height: screen.height },
        dpr: devicePixelRatio,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
      }));
      writeFileSync(
        resolve(output, 'ready.json'),
        JSON.stringify(
          {
            frontend,
            browser: report.browser,
            title: await page.title(),
            waitingFor: 'foreground-approved',
          },
          null,
          2,
        ),
      );
      // The caller confirms an actual returned Windows window before permitting UI work.
      for (
        let i = 0;
        i < 1200 && !existsSync(resolve(output, 'foreground-approved'));
        i++
      )
        await sleep(100);
      if (!existsSync(resolve(output, 'foreground-approved')))
        throw Error('Actual foreground verification gate was not confirmed');
      report.desktopGate = readFileSync(
        resolve(output, 'foreground-approved'),
        'utf8',
      );
      if (!interactiveCount) {
        report.remote = await simulationFlow(
          page,
          frontend,
          resolve(output, 'remote'),
          'remote40',
        );
        report.cases.push(
          'Sydney 40-row input/output joining, MSL, HOLD/RESUME/ABORT and historical interaction inspection',
        );
        report.default = await simulationFlow(
          page,
          frontend,
          resolve(output, 'default'),
          'local40',
        );
        report.cases.push(
          'Default 40-row input/output joining and external lifecycle',
        );
        const lost = externalFixture('golden'),
          raw = JSON.stringify(lost, null, 3);
        let sent;
        const pane = await openSimulation(page);
        await pane
          .getByRole('textbox', { name: 'External simulation request JSON' })
          .fill(raw);
        await page.route('**/api/simulation/v1/commands', async (route) => {
          sent = route.request().postData();
          expect((await route.fetch()).status()).toBe(200);
          await route.abort('failed');
        });
        await pane
          .getByRole('button', { name: 'Submit START', exact: true })
          .click();
        await expect(pane.locator('.simulation-notice')).toContainText(
          'Pending identity and body retained',
        );
        await shot('lost-response');
        await page.unroute('**/api/simulation/v1/commands');
        await page.reload();
        await openSimulation(page);
        expect(
          await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem('sentinel.simulation.session.v1'))
                .pending,
          ),
        ).toBe(raw);
        const retried = page.waitForRequest(
          (req) =>
            req.url().endsWith('/simulation/v1/commands') &&
            req.method() === 'POST',
        );
        await pane
          .getByRole('button', { name: 'Retry exact pending command' })
          .click();
        expect((await retried).postData()).toBe(sent);
        await expect(pane.locator('.simulation-notice')).toContainText(
          'committed',
        );
        await shot('exact-retry');
        report.cases.push(
          'Lost committed response, reload, exact original retry and one outcome',
        );
        await restartBackend();
        await expect
          .poll(async () => {
            try {
              return (
                await page.request.get(`${frontend}/api/simulation/v1/runs`)
              ).status();
            } catch {
              return 0;
            }
          })
          .toBe(200);
        await page.reload();
        await openSimulation(page);
        const runs = await (
          await page.request.get(`${frontend}/api/simulation/v1/runs`)
        ).json();
        const restored = runs.find(
          (run) => run.externalMissionId === lost.mission_id,
        );
        await pane
          .getByRole('combobox', {
            name: 'External simulation run',
            exact: true,
          })
          .selectOption(restored.missionId);
        await expect(
          pane.getByRole('region', { name: 'Recorded simulation outcome' }),
        ).toContainText('MUTUAL_EFFECT');
        const restoredWorld = await (
          await page.request.get(
            `${frontend}/api/missions/${restored.missionId}/world`,
          )
        ).json();
        expect(restoredWorld.sequence).toBe(1);
        await shot('restart-recorded');
        report.cases.push(
          'Actual backend restart and exact recorded world/result',
        );
        for (const width of [760, 820, 900, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await pane
            .getByRole('textbox', { name: 'External simulation request JSON' })
            .focus();
          await expect(
            pane.getByRole('textbox', {
              name: 'External simulation request JSON',
            }),
          ).toBeFocused();
          expect(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
          ).toBe(true);
          await shot('layout-' + width);
        }
        report.cases.push('760/820/900/1440 layouts and keyboard focus');
      }
      // Existing interactive movement remains independent while an external batch commits.
      for (const count of interactiveCount ? [interactiveCount] : []) {
        await loadPerformanceScenario(page, frontend, count, {
          location: count === 20 ? 'sydney' : 'default',
        });
        const ui = operatorUI(page, frontend),
          before = await ui.world();
        const stream = await context.newCDPSession(page);
        await stream.send('Network.enable');
        const arrivals = [];
        stream.on('Network.webSocketFrameReceived', (event) => {
          try {
            const v = JSON.parse(event.response.payloadData);
            if (v.missionId === before.mission.id && v.type === 'delta')
              arrivals.push({
                at: performance.now(),
                sequence: v.sequence,
                recordedAt: v.recordedAt,
              });
          } catch {
            /* non-world socket */
          }
        });
        const begin = performance.now();
        await submitSimulation(page, externalFixture('remote40'));
        const uiSubmissionMs = performance.now() - begin;
        await page
          .getByRole('button', { name: 'Open Map', exact: true })
          .first()
          .click();
        await sleep(2200);
        const after = await ui.world(before.mission.id);
        expect(after.interactive.runId).toBe(before.interactive.runId);
        expect(
          Object.values(after.tracks).filter(
            (track) => track.latest.velocity?.speedMps > 0,
          ),
        ).toHaveLength(count * 2);
        expect(
          Object.entries(after.tracks).every(
            ([id, track]) =>
              JSON.stringify(track.latest.position) !==
              JSON.stringify(before.tracks[id].latest.position),
          ),
        ).toBe(true);
        const gaps = arrivals
          .slice(1)
          .map((sample, i) => sample.at - arrivals[i].at);
        report.measurements.push({
          workload: `${count}v${count}`,
          ms: performance.now() - begin,
          arrivals: arrivals.length,
          maxArrivalGapMs: Math.max(...gaps),
          movingEntities: count * 2,
          uiSubmissionMs,
          beforeSequence: before.sequence,
          afterSequence: after.sequence,
          limitation:
            'Short arrival probe; includes UI submission and source transport, not sustained pacing',
        });
        await shot(`moving-${count}v${count}`);
        report.measurements.push(
          await displayWindow(page, output, `tactical-${count}v${count}`),
        );
        await ui.action('End demo');
        await stream.detach();
      }
      if (interactiveCount)
        report.cases.push(
          `Moving ${interactiveCount}v${interactiveCount} isolated from external submission`,
        );
      expect(report.externalRequests).toEqual([]);
      expect(report.errors).toEqual([]);
      report.completed = new Date().toISOString();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      // Keep the final view available briefly for a human/tool screenshot inspection.
      writeFileSync(
        resolve(output, 'finished.json'),
        JSON.stringify({ screenshot: report.screenshots.at(-1) }),
      );
      for (let i = 0; i < 600 && !existsSync(resolve(output, 'close')); i++)
        await sleep(100);
    } catch (error) {
      report.failure = String(error?.stack ?? error);
      await shot('failure').catch(() => {});
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      throw error;
    } finally {
      await context.close();
      await browser.close();
    }
  },
);
