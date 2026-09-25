/* global document, window, screen, devicePixelRatio, performance, localStorage, requestAnimationFrame */
// Headed Phase 5 external-simulation workflows with native foreground proof.
//   node tests/simulation-ui/foreground.mjs <tag> [0|10|20]
// 0 runs the external workflows (default/Sydney 40, lost-response exact retry,
// actual backend restart, narrow layouts, R3-1 mixed-scale area and the spec §9
// defensive sequence); 10/20 measure moving interactive isolation. A fresh
// task-owned Edge profile uses real document focus (CDP noDefaults). Before each
// screenshot the OS foreground window PID must belong to the task browser
// (scripts/foreground_identity.py); document.hasFocus() alone is never accepted.
// While not foreground the harness waits (default 15 min) and writes
// foreground-waiting.json. Screenshots use CDP Page.captureScreenshot.
// PHASE5_BUILD selects the verification bundle and PHASE5_EVIDENCE_ROOT the
// output root. External provider requests are blocked and counted.
import { expect } from '@playwright/test';
import { readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import {
  abortSimulation,
  externalFixture,
  openSimulation,
  simulationFlow,
  submitSimulation,
} from '../support/simulation-ui.mjs';
import { loadPerformanceScenario } from '../performance/support.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import {
  captureBrowserSurface,
  launchForegroundBrowser,
} from '../analytics/foreground-browser.mjs';
import { foregroundIdentity } from '../analytics/foreground-identity.mjs';

process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
const tag = process.argv[2] ?? 'phase5-foreground';
const interactiveCount = Number(process.argv[3] ?? 0);
if (![0, 10, 20].includes(interactiveCount))
  throw Error('Expected external (0), 10 or 20');
const build = process.env.PHASE5_BUILD ?? 'dist-verification-phase5';
const evidenceRoot =
  process.env.PHASE5_EVIDENCE_ROOT ??
  'test-results/phase5-simulation-compatibility';
const foregroundWaitMs = Number(
  process.env.PHASE5_FOREGROUND_WAIT_MS ?? 900000,
);
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
    previewDir: build,
    evidenceRoot,
    reportStorage: true,
  },
  async ({ frontend, output, restartBackend }) => {
    const foreground = await launchForegroundBrowser({
      viewport: { width: 1440, height: 900 },
    });
    const { browser, context, resize } = foreground;
    const page = await foreground.newPage();
    const report = {
      browser: browser.version(),
      build,
      cases: [],
      errors: [],
      externalRequests: [],
      foreground: [],
      measurements: [],
      screenshots: [],
      started: new Date().toISOString(),
    };
    const save = () =>
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
    const native = async (label) => {
      const began = Date.now();
      for (;;) {
        try {
          const identity = await foregroundIdentity(browser, page);
          report.foreground.push({ label, ...identity });
          rmSync(resolve(output, 'foreground-waiting.json'), { force: true });
          return identity;
        } catch (error) {
          if (Date.now() - began > foregroundWaitMs)
            throw Error(
              `Native foreground not established for ${label}: ${error.message}`,
              { cause: error },
            );
          writeFileSync(
            resolve(output, 'foreground-waiting.json'),
            JSON.stringify(
              {
                label,
                since: new Date(began).toISOString(),
                reason: error.message,
                action:
                  'Bring the task Edge window (title starting "Sentinel") to the front.',
              },
              null,
              2,
            ),
          );
          await sleep(1000);
        }
      }
    };
    const capture = async (path) => {
      mkdirSync(dirname(path), { recursive: true });
      const label = relative(output, path).replaceAll('\\', '/');
      await native(label);
      await captureBrowserSurface(page, { path });
      report.screenshots.push(label);
      save();
    };
    const shot = (name) => capture(resolve(output, name + '.png'));
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
      await cdp.detach();
      await page.goto(frontend);
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
            waitingFor: 'native foreground PID match',
          },
          null,
          2,
        ),
      );
      await native('start');
      if (!interactiveCount) {
        report.remote = await simulationFlow(
          page,
          frontend,
          resolve(output, 'remote'),
          'remote40',
          capture,
        );
        report.cases.push(
          'Sydney 40-row input/output joining, MSL, HOLD/RESUME/ABORT and historical interaction inspection',
        );
        report.default = await simulationFlow(
          page,
          frontend,
          resolve(output, 'default'),
          'local40',
          capture,
        );
        report.cases.push(
          'Default 40-row input/output joining and external lifecycle',
        );
        const lost = externalFixture('golden'),
          raw = JSON.stringify(lost, null, 3);
        let sent;
        const pane = await openSimulation(page);
        await pane
          .getByRole('textbox', { name: 'External request JSON' })
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
            name: 'Recorded run',
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
        // Phase 5 closure: externally valid mixed-scale area (R3-1) maps and decodes.
        const mixed = externalFixture('golden');
        mixed.area.polygon = [
          [0, 0],
          [2e-170, 2e-170],
          [1e-170, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ];
        for (const row of Object.values(mixed.samples_by_timestamp)[0]) {
          row.longitude_deg = 0.5;
          row.latitude_deg = 0.5;
        }
        const mixedResult = await submitSimulation(page, mixed);
        expect(
          Object.values(mixedResult.results_by_timestamp)[0].interactions[0]
            .outcome,
        ).toBe('MUTUAL_EFFECT');
        await pane
          .getByRole('button', { name: 'Inspect mapped mission' })
          .click();
        await expect(page.locator('.mission-name')).toContainText(
          mixed.mission_id,
        );
        await page
          .getByRole('button', { name: 'Open Tracks', exact: true })
          .first()
          .click();
        await expect(page.locator('[data-view="tracks"]')).toContainText(
          'BLUE-001',
        );
        await shot('r3-1-mixed-scale-mapped');
        report.cases.push(
          'R3-1 mixed-scale area: HTTP 200, golden outcome, mapped mission decoded',
        );
        // Spec §9 defensive sequence through the actual Simulation view.
        const dataset = JSON.parse(
          readFileSync(
            resolve('tests/fixtures/simulation/defensive-s9.json'),
            'utf8',
          ),
        );
        const [s9Start, s9Hold, s9Resume] = dataset.missions[0].commands;
        await submitSimulation(page, s9Start);
        await shot('s9-start-committed');
        await pane
          .getByRole('button', { name: 'Inspect mapped mission' })
          .click();
        await page
          .getByRole('button', { name: 'Open Tracks', exact: true })
          .first()
          .click();
        await expect(page.locator('[data-view="tracks"]')).toContainText(
          'B-N-EDGE',
        );
        await shot('s9-mapped-tracks');
        const held = await submitSimulation(page, s9Hold);
        expect(held.results_by_timestamp).toEqual({});
        await shot('s9-held');
        await submitSimulation(page, s9Resume);
        await shot('s9-resumed');
        await abortSimulation(page);
        await pane
          .getByRole('button', { name: 'Load recorded commands', exact: true })
          .click();
        await pane
          .getByRole('combobox', {
            name: 'Recorded command',
            exact: true,
          })
          .selectOption(s9Start.command.command_id);
        await pane
          .getByRole('region', { name: 'Recorded simulation outcome' })
          .getByRole('combobox', { name: 'Source timestamp (UTC)' })
          .selectOption('2026-10-01T06:01:00.000Z');
        await expect(
          pane.getByRole('region', { name: 'Recorded simulation outcome' }),
        ).toContainText('28 interactions');
        await shot('s9-recorded-after-abort');
        report.cases.push(
          'Spec §9 defensive sequence: START, HOLD with samples, RESUME, ABORT and recorded commands',
        );
        // The finalized state stays whole beside the mission name and on the map.
        await pane
          .getByRole('button', { name: 'Inspect mapped mission' })
          .click();
        for (const width of [760, 1440]) {
          await resize(page, { width, height: 900 });
          await expect(
            page
              .locator('.mission-controls')
              .getByText('RECORDING FINALIZED · ABORTED', { exact: true }),
          ).toBeVisible();
          await expect(page.locator('.map-status').first()).toContainText(
            'RECORDING FINALIZED · ABORTED',
          );
          await shot('s9-finalized-map-' + width);
        }
        await openSimulation(page);
        report.cases.push(
          'Finalized §9 mission: header tag and map chip at 760 and 1440 px',
        );
        for (const width of [760, 820, 900, 1440]) {
          await resize(page, { width, height: 900 });
          await pane
            .getByRole('textbox', { name: 'External request JSON' })
            .focus();
          await expect(
            pane.getByRole('textbox', {
              name: 'External request JSON',
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
      save();
    } catch (error) {
      report.failure = String(error?.stack ?? error);
      await captureBrowserSurface(page, {
        path: resolve(output, 'failure.png'),
      }).catch(() => {});
      save();
      throw error;
    } finally {
      await foreground.close();
    }
  },
);
