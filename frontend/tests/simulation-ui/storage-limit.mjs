/* global structuredClone, localStorage, document, requestAnimationFrame, setTimeout */
// R2-3: practical browser-storage limit for Simulation UI batches.
//   node tests/simulation-ui/storage-limit.mjs <tag>
// The Simulation client persists the draft and, before sending, the exact
// pending body (draft + pending) in localStorage; a refused write blocks
// sending. This probe loads synthetic valid batches through the real file
// input in a fresh Edge profile, submits them, and records whether the POST was
// sent. The POST is answered with an authoritative 422 so the pending identity
// clears; nothing reaches the backend. Doubling then bisection on drone count
// finds the largest persisted batch. The external endpoint's contract limits are
// separate and unchanged. PHASE5_BUILD / PHASE5_EVIDENCE_ROOT as for foreground.mjs.
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { openSimulation } from '../support/simulation-ui.mjs';

process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
const tag = process.argv[2] ?? 'phase5-storage-limit';
const build = process.env.PHASE5_BUILD ?? 'dist-verification-phase5';
const evidenceRoot =
  process.env.PHASE5_EVIDENCE_ROOT ??
  'test-results/phase5-simulation-compatibility';
const golden = JSON.parse(
  readFileSync(
    resolve('../contracts/simulation/fixtures/golden.request.json'),
    'utf8',
  ),
);

function batch(count) {
  const body = structuredClone(golden);
  body.mission_id = `STORAGE-${count}`;
  body.command.command_id = `STORAGE-${count}`;
  body.area.polygon = [
    [-170, -80],
    [170, -80],
    [170, 80],
    [-170, 80],
    [-170, -80],
  ];
  body.samples_by_timestamp = {
    '2026-09-06T00:00:01.000Z': Array.from({ length: count }, (_, i) => ({
      drone_id: `${i % 2 ? 'BLUE' : 'RED'}-${String(i).padStart(6, '0')}`,
      longitude_deg: -150 + (i % 300) * 1,
      latitude_deg: -70 + Math.floor(i / 300) * 0.01,
      altitude_m: 100,
      class: 'I',
      team: i % 2 ? 'BLUE' : 'RED',
      health: 100,
      status: 'ACTIVE',
    })),
  };
  return JSON.stringify(body, null, 2);
}

await withIsolatedRuntime(
  {
    tag,
    frontendPort: 5425,
    backendPort: 8225,
    configured: false,
    previewDir: build,
    evidenceRoot,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    let posted = false;
    await context.route('**/api/simulation/v1/commands', (route) => {
      posted = true;
      return route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            path: '',
            message: 'Storage probe rejection',
          },
        }),
      });
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ||
        ['data:', 'blob:'].includes(url.protocol)
        ? route.fallback()
        : route.abort();
    });
    await page.goto(frontend);
    const pane = await openSimulation(page);
    const attempts = [];
    const attempt = async (count) => {
      const text = batch(count);
      posted = false;
      await pane.getByLabel('Load JSON batch').setInputFiles({
        name: `batch-${count}.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(text),
      });
      // The file is read asynchronously; wait for the new draft or a storage error.
      await page.waitForFunction(
        ([key, identity]) =>
          (localStorage.getItem(key) ?? '').includes(identity) ||
          document
            .querySelector('.simulation-notice')
            ?.textContent?.includes('could not be saved'),
        ['sentinel.simulation.session.v1', `STORAGE-${count}`],
        { timeout: 120000 },
      );
      const drafted = await page.evaluate(
        ([key, identity]) => {
          const value = localStorage.getItem(key) ?? '';
          return value.includes(identity) ? value.length : -1;
        },
        ['sentinel.simulation.session.v1', `STORAGE-${count}`],
      );
      // Let the page finish rendering the multi-megabyte draft before querying
      // it: at 16,000 drones layout can outlast a 30 s locator wait (the
      // candidate 4 gate run stopped there). page.evaluate has no timeout.
      await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() => setTimeout(done, 0)),
          ),
      );
      const submit = pane.getByRole('button', { name: /^Submit / });
      const draftSaved = drafted > 0;
      if (draftSaved && (await submit.isEnabled())) {
        await submit.click();
        await pane
          .locator('.simulation-notice')
          .filter({
            hasText: /rejected|not been sent|could not|quota|exceeded/i,
          })
          .waitFor({ timeout: 60000 })
          .catch(() => {});
      }
      const notice = (
        await pane.locator('.simulation-notice').innerText()
      ).slice(0, 300);
      const row = {
        drones: count,
        bodyBytes: Buffer.byteLength(text),
        draftStoredChars: drafted,
        draftSaved,
        persistedAndSent: posted,
        notice,
      };
      attempts.push(row);
      writeFileSync(
        resolve(output, 'attempts.json'),
        JSON.stringify(attempts, null, 1),
      );
      return posted;
    };
    let low = 0,
      high = 0;
    for (let count = 1000; count <= 512000; count *= 2) {
      if (await attempt(count)) low = count;
      else {
        high = count;
        break;
      }
    }
    while (high && high - low > Math.max(50, low / 100)) {
      const middle = Math.floor((low + high) / 2);
      if (await attempt(middle)) low = middle;
      else high = middle;
    }
    const largest = attempts.find((a) => a.drones === low);
    const summary = {
      browser: browser.version(),
      largestPersistedDrones: low,
      largestPersistedBodyBytes: largest?.bodyBytes ?? null,
      firstRefusedDrones: high || null,
      format: 'Pretty JSON (2-space), one timestamp, synthetic valid rows',
      note: 'Draft and exact pending body are both persisted before sending; contract maxima are separate.',
      attempts: attempts.length,
    };
    writeFileSync(
      resolve(output, 'summary.json'),
      JSON.stringify(summary, null, 1),
    );
    process.stdout.write(JSON.stringify(summary, null, 1) + '\n');
    await context.close();
    await browser.close();
  },
);
