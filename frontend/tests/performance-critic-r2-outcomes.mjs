// Independent continuation for existing proximity Intercept outcomes.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';
import { loadPerformanceScenario } from './performance-support.mjs';

const files = Object.keys(
  JSON.parse(
    readFileSync('../docs/performance-stability/baseline-source.json', 'utf8'),
  ),
).filter((p) => p.startsWith('backend/app/') || p.startsWith('frontend/src/'));
files.push('backend/app/domain/capacity.py');
const hashes = () =>
  Object.fromEntries(
    files.map((p) => [
      p,
      createHash('sha256')
        .update(readFileSync(resolve('..', p)))
        .digest('hex'),
    ]),
  );

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'perf-critic-r2-outcomes',
    frontendPort: 5381,
    backendPort: 8181,
    configured: false,
    evidenceRoot: '../docs/performance-stability',
    previewDir: 'dist-performance-after',
    viteConfig: '.cache/performance-preview.mjs',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const ui = d6UI(page, frontend),
      result = { cases: [], errors: [], sourceBefore: hashes() };
    page.on('pageerror', (e) => result.errors.push(e.name));
    const command = async (label, operation) => {
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action === operation,
      );
      await ui.action(label);
      const receipt = await (await response).json();
      expect(receipt.accepted).toBe(true);
      return receipt;
    };
    try {
      await loadPerformanceScenario(page, frontend, 20);
      await command('Pause', 'pause');
      await ui.tab('Conductor', 'Close view');
      await ui.select(
        ...Array.from(
          { length: 20 },
          (_, i) => `Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await ui.behavior('intercept');
      const initial = await ui.world();
      result.missionId = initial.mission.id;
      result.acquisitionRadiusM =
        initial.fleetBehavior.model.acquisitionRadiusM;
      expect(initial.fleetBehavior.members).toHaveLength(20);
      expect(
        initial.fleetBehavior.members.every(
          (m) => initial.entities[m.entityId].affiliation === 'friendly',
        ),
      ).toBe(true);
      await command('Resume', 'resume');
      const first = await ui.world();
      await page.waitForTimeout(650);
      const moving = await ui.world();
      result.movingTracks = Object.values(first.tracks).filter(
        (t) =>
          JSON.stringify(t.latest.position) !==
          JSON.stringify(moving.tracks[t.id].latest.position),
      ).length;
      expect(result.movingTracks).toBe(40);
      await expect
        .poll(
          async () =>
            Object.values((await ui.world()).entities).filter(
              (e) => e.condition === 'non-operational',
            ).length,
          { timeout: 35000, intervals: [500, 1000] },
        )
        .toBe(40);
      const resolved = await ui.world();
      expect(resolved.fleetBehavior.outcomes).toHaveLength(20);
      result.outcomes = resolved.fleetBehavior.outcomes;
      result.nonOperational = Object.values(resolved.entities).filter(
        (e) => e.condition === 'non-operational',
      ).length;
      result.cases.push(
        'Ordinary Conductor run: 20 Friendly receive existing Intercept, all forty tracks move before resolution, twenty outcomes leave forty NON-OP entities.',
      );
      await command('Pause', 'pause');
      await page.screenshot({
        path: resolve(output, 'forty-non-operational.png'),
      });
      result.endReceipt = await command('End demo', 'end');
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      await page.locator('[data-run-state="ended"]').first().waitFor();
      const ended = await ui.world(result.missionId);
      expect(ended.interactive.state).toBe('ended');
      expect(ended.fleetBehavior.outcomes).toEqual(result.outcomes);
      expect(
        Object.values(ended.entities).every(
          (e) => e.condition === 'non-operational',
        ),
      ).toBe(true);
      await page.screenshot({
        path: resolve(output, 'recorded-terminal-outcomes.png'),
      });
      result.cases.push(
        'End accepted; recorded run reopened after reload with exact same twenty outcomes and all forty terminal entity states.',
      );
      expect(result.errors).toEqual([]);
      result.passed = true;
    } catch (error) {
      result.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1500);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
      process.exitCode = 1;
    } finally {
      result.sourceAfter = hashes();
      result.sourceUnchanged =
        JSON.stringify(result.sourceBefore) ===
        JSON.stringify(result.sourceAfter);
      await context.close();
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(result, null, 2),
      );
      globalThis.console.log(
        JSON.stringify({
          passed: result.passed,
          failure: result.failure,
          cases: result.cases,
          movingTracks: result.movingTracks,
          nonOperational: result.nonOperational,
          sourceUnchanged: result.sourceUnchanged,
        }),
      );
    }
  },
);
