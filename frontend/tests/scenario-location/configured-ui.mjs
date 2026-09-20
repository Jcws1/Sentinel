// Bounded checks of the existing regional pack and remote authoring at a real UI.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'location-configured',
    frontendPort: 5383,
    backendPort: 8183,
    configured: true,
    evidenceRoot: 'test-results/scenario-location',
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: false,
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage(),
      u = operatorUI(page, frontend);
    page.setDefaultTimeout(15000);
    const report = {
      cases: [],
      screenshots: [],
      errors: [],
      providerRequests: 0,
    };
    page.on('pageerror', (e) =>
      report.errors.push(e.message.replace(/https?:\/\/\S+/g, '[URL]')),
    );
    await page.route('**/*', (route) => {
      const host = new URL(route.request().url()).hostname;
      if (
        host &&
        host !== '127.0.0.1' &&
        host !== 'localhost' &&
        ++report.providerRequests > 150
      )
        return route.abort();
      return route.continue();
    });
    const pane = page.locator('[data-view="orchestrator"]'),
      map = page.locator('.tactical-view[data-view-id="tactical"]');
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelMapTest?.inspect('tactical'));
    const shot = async (name) => {
      await page.screenshot({ path: resolve(output, name + '.png') });
      report.screenshots.push(name + '.png');
    };
    const mark = (x) => {
      report.cases.push(x);
      globalThis.console.log(x);
    };
    const openUnits = async () => {
      await page
        .getByRole('button', { name: 'Open Orchestrator', exact: true })
        .first()
        .click();
      await pane.getByRole('tab', { name: 'Units', exact: true }).click();
      const settings = pane.locator('.units-settings');
      if (
        (await settings.count()) &&
        !(await settings.evaluate((el) => el.open))
      )
        await settings.locator(':scope > summary').click();
    };
    try {
      const fixtures = {};
      for (const name of ['default', 'nearby', 'remote']) {
        const content = JSON.parse(
          readFileSync(
            resolve('tests/fixtures/scenario-location', name + '.json'),
            'utf8',
          ),
        );
        fixtures[name] = (
          await (
            await page.request.post(frontend + '/api/scenarios', {
              data: { requestId: randomUUID(), expectedRevision: 0, content },
            })
          ).json()
        ).result;
      }
      await page.goto(frontend);
      for (const name of ['default', 'nearby', 'remote']) {
        await page
          .getByRole('button', { name: 'Load mission', exact: true })
          .click();
        await page
          .getByRole('menuitem', {
            name: new RegExp(fixtures[name].content.name + ' · r1.*Saved plan'),
          })
          .click();
        await openUnits();
        await map
          .getByRole('button', { name: 'Recenter', exact: true })
          .click();
        await expect
          .poll(async () => (await inspect())?.ready, { timeout: 30000 })
          .toBe(true);
        if (name === 'remote')
          await expect(map).toContainText('OUTSIDE MAP PACK');
        else
          await expect
            .poll(async () => (await inspect())?.geography?.buildings ?? 0, {
              timeout: 30000,
            })
            .toBeGreaterThan(0);
        const state = await inspect();
        report[name] = {
          camera: state.camera,
          geography: state.geography,
          region: state.region,
          provider: await map
            .locator('.map-provider-state')
            .textContent()
            .catch(() => ''),
        };
        await shot('map-' + name);
      }
      mark(
        'Configured regional map content loads at default/nearby locations; Sydney reports OUTSIDE MAP PACK and uses an honest grid',
      );
      // Editing real geographic content remains possible outside the installed pack.
      await pane
        .locator('.units-arrangement li')
        .first()
        .getByRole('button')
        .click();
      await pane.getByLabel('Unit altitude', { exact: true }).fill('230.125');
      await pane
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
      await pane
        .getByRole('button', { name: 'Reposition', exact: true })
        .click();
      await pane.locator('.units-numeric summary').click();
      await pane
        .getByLabel('Placement longitude', { exact: true })
        .fill('151.16');
      await pane
        .getByLabel('Placement latitude', { exact: true })
        .fill('-33.9554');
      await pane
        .getByRole('button', { name: 'Place at coordinates', exact: true })
        .click();
      await pane
        .getByRole('button', { name: 'Draw boundary', exact: true })
        .click();
      await pane
        .getByLabel('Boundary name', { exact: true })
        .fill('Remote annotation');
      for (const [i, coordinates] of [
        [151.185, -33.942],
        [151.19, -33.942],
        [151.19, -33.94],
        [151.185, -33.94],
      ].entries()) {
        await pane
          .getByRole('button', { name: 'Add numeric vertex', exact: true })
          .click();
        await pane
          .getByLabel(`Vertex ${i + 1} longitude`, { exact: true })
          .fill(String(coordinates[0]));
        await pane
          .getByLabel(`Vertex ${i + 1} latitude`, { exact: true })
          .fill(String(coordinates[1]));
      }
      await pane
        .getByRole('button', { name: 'Finish boundary', exact: true })
        .click();
      await pane
        .getByLabel('Type of Remote annotation', { exact: true })
        .selectOption('annotation');
      await pane.getByRole('tab', { name: 'Conductor', exact: true }).click();
      const conductor = pane;
      await conductor
        .getByRole('button', { name: /^Select action Friendly 01/ })
        .first()
        .click();
      await conductor
        .getByRole('button', { name: 'Edit action', exact: true })
        .click();
      await conductor
        .getByLabel('Script destination longitude', { exact: true })
        .fill('151.192');
      await conductor
        .getByRole('button', { name: /^(Apply action|Apply movement)$/ })
        .click();
      await openUnits();
      const saving = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/revisions'),
      );
      await pane
        .getByRole('button', { name: 'Save revision', exact: true })
        .click();
      const saved = (await (await saving).json()).result;
      expect(saved.content.units[0].position.altitude.metres).toBe(230.125);
      expect(saved.content.units[0].position.longitudeDeg).toBe(151.16);
      expect(saved.content.boundaries).toHaveLength(3);
      expect(
        saved.content.actions.find((a) => a.id === 'friendly-01-out')
          .destination.longitudeDeg,
      ).toBe(151.192);
      await pane
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(pane).toContainText('Ready to run');
      await shot('authoring-remote-route-boundary');
      await pane
        .getByRole('button', { name: 'Run saved revision 2', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      const world = await u.world();
      expect(world.interactive.localGeometry).toEqual(
        saved.content.localGeometry,
      );
      await u.select('Friendly 01');
      const before = await u.world();
      await u.fleet
        .getByRole('button', { name: 'Stop selected', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await u.world()).interactive.executions.filter(
              (e) =>
                ![
                  'Completed',
                  'Cancelled',
                  'Failed',
                  'Interrupted',
                  'Expired',
                ].includes(e.state),
            ).length,
        )
        .toBe(0);
      await page.waitForTimeout(500);
      const stopped = await u.world(),
        positions = Object.fromEntries(
          Object.entries(stopped.tracks).map(([id, t]) => [
            id,
            t.latest.position,
          ]),
        );
      await page.waitForTimeout(600);
      const later = await u.world();
      const fid = Object.keys(stopped.entities).find(
        (id) => stopped.entities[id].label === 'Friendly 01',
      );
      const tid = Object.keys(stopped.tracks).find(
        (id) => stopped.tracks[id].entityId === fid,
      );
      expect(later.tracks[tid].latest.position).toEqual(positions[tid]);
      expect(stopped.interactive.tick).toBeGreaterThanOrEqual(
        before.interactive.tick,
      );
      await shot('configured-remote-run');
      await u.action('End demo');
      await expect
        .poll(async () => (await u.world(world.mission.id)).interactive.state)
        .toBe('ended');
      mark(
        'Remote numeric unit editing/reposition, boundary creation, route editing, Save/Validate/Run and selected Stop preserve supplied altitude',
      );
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (error) {
      report.failure = String(error).replace(/https?:\/\/\S+/g, '[URL]');
      await shot('failure');
      throw error;
    } finally {
      writeFileSync(
        resolve(output, 'report.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);
