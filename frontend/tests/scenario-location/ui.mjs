// Foreground application verification; all services, contexts and data are task-owned.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
process.chdir(fileURLToPath(new URL('../..', import.meta.url)));

await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'location-ui',
    frontendPort: 5381,
    backendPort: 8181,
    previewDir: 'dist-verification-scenario-location',
    evidenceRoot: 'test-results/scenario-location',
  },
  async ({ frontend, output, restartBackend }) => {
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
      browser: browser.version(),
      cases: [],
      errors: [],
      screenshots: [],
    };
    page.on('pageerror', (e) => report.errors.push(e.message));
    const pane = page.locator('.units-pane:not(.conductor-pane)'),
      map = page.locator('.tactical-view[data-view-id="tactical"]');
    const shot = async (name) => {
      await page.screenshot({ path: resolve(output, name + '.png') });
      report.screenshots.push(name + '.png');
    };
    const mark = (name) => {
      report.cases.push(name);
      globalThis.console.log(name);
    };
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelMapTest?.inspect('tactical'));
    const origin = async (lon, lat) => {
      await pane
        .getByRole('button', { name: 'Enter coordinates', exact: true })
        .click();
      await pane
        .getByLabel('Origin longitude', { exact: true })
        .fill(String(lon));
      await pane
        .getByLabel('Origin latitude', { exact: true })
        .fill(String(lat));
    };
    const openUnits = async () => {
      await page
        .getByRole('button', { name: 'Open Units', exact: true })
        .first()
        .click();
      const open = pane.getByRole('button', {
        name: 'Open scenario editor',
        exact: true,
      });
      if (await open.isVisible()) await open.click();
    };
    const save = async () => {
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          /\/api\/scenarios(?:\/[^/]+\/revisions)?$/.test(r.url()),
      );
      await pane
        .getByRole('button', { name: 'Save revision', exact: true })
        .click();
      const data = await (await response).json();
      expect(data.accepted).toBe(true);
      return data.result;
    };
    const load = async (name) => {
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: new RegExp(name + ' · r1.*Saved plan') })
        .click();
      await openUnits();
    };
    try {
      for (const name of ['default', 'nearby', 'remote', 'remote-20v20']) {
        const content = JSON.parse(
          readFileSync(
            resolve('tests/fixtures/scenario-location', name + '.json'),
            'utf8',
          ),
        );
        const reply = await page.request.post(frontend + '/api/scenarios', {
          data: { requestId: randomUUID(), expectedRevision: 0, content },
        });
        expect(reply.ok()).toBe(true);
      }
      await page.goto(frontend);
      await openUnits();
      await expect
        .poll(async () => Boolean((await inspect())?.ready))
        .toBe(true);
      await pane.getByLabel('Arrangement name').fill('Location UI authoring');
      const initial = await inspect();
      await origin(151.1772, -33.9461);
      await pane
        .getByRole('button', { name: 'Show operating area', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect())?.camera.center.longitudeDeg)
        .toBeCloseTo(151.1772, 4);
      expect((await inspect()).entityIds).toHaveLength(0);
      await shot('01-preview-remote');
      await pane
        .getByRole('button', { name: 'Cancel origin change', exact: true })
        .click();
      await expect(pane.locator('.location-coordinates')).toContainText(
        '103.850000',
      );
      // Cancel does not undo a deliberate camera movement.
      expect((await inspect()).camera.center.longitudeDeg).toBeCloseTo(
        151.1772,
        4,
      );
      await pane
        .getByRole('button', { name: 'Choose on map', exact: true })
        .click();
      const canvas = map.locator('canvas').first(),
        box = await canvas.boundingBox();
      await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
      await expect(
        pane.getByLabel('Origin longitude', { exact: true }),
      ).toBeFocused();
      await pane
        .getByRole('button', { name: 'Apply origin', exact: true })
        .click();
      await expect(pane.locator('.location-coordinates')).toContainText(
        '151.177',
      );
      mark(
        'Numeric preview, Cancel, map origin picking and explicit Apply; no unit accidentally placed',
      );
      await pane.getByRole('button', { name: /^Friendly drone/ }).click();
      await pane
        .locator('.units-subtypes')
        .getByRole('button', { name: /^STING interceptor/ })
        .click();
      await pane.locator('.units-numeric summary').click();
      await pane
        .getByLabel('Placement longitude', { exact: true })
        .fill('151.1772');
      await pane
        .getByLabel('Placement latitude', { exact: true })
        .fill('-33.9461');
      await pane
        .getByLabel('Placement altitude', { exact: true })
        .fill('231.125');
      await pane.getByLabel('Placement heading', { exact: true }).fill('42.25');
      await pane
        .getByRole('button', { name: 'Place at coordinates', exact: true })
        .click();
      await expect(pane.locator('.units-arrangement li')).toHaveCount(1);
      const first = await save();
      expect(first.schemaVersion).toBe('1.6');
      expect(first.content.units[0].position.altitude.metres).toBe(231.125);
      await origin(0, 0);
      await expect(
        pane.getByRole('button', { name: 'Apply origin', exact: true }),
      ).toBeDisabled();
      await expect(pane.locator('.location-conflicts')).toContainText(
        'Friendly',
      );
      await shot('02-rejected-origin');
      await pane
        .getByRole('button', { name: 'Cancel origin change', exact: true })
        .click();
      await pane
        .getByRole('button', { name: 'Duplicate unit', exact: true })
        .click();
      await pane.locator('.units-numeric summary').click();
      await pane
        .getByLabel('Placement longitude', { exact: true })
        .fill('151.1782');
      await pane
        .getByLabel('Placement latitude', { exact: true })
        .fill('-33.9461');
      await pane
        .getByRole('button', { name: 'Place at coordinates', exact: true })
        .click();
      const second = await save();
      expect(second.content.units).toHaveLength(2);
      await origin(151.178, -33.9461);
      await pane
        .getByRole('button', { name: 'Apply origin', exact: true })
        .click();
      const third = await save();
      expect(third.content.units).toEqual(second.content.units);
      expect(third.revision).toBe(3);
      mark(
        'Remote numeric placement and duplication; invalid change rejected; accepted change preserves exact positions, heights and IDs',
      );
      for (const width of [760, 820, 900, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await pane
          .getByRole('button', { name: 'Enter coordinates', exact: true })
          .click();
        await expect(
          pane.getByLabel('Origin longitude', { exact: true }),
        ).toBeVisible();
        await pane.getByLabel('Origin latitude', { exact: true }).focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await expect(
          pane.getByRole('button', {
            name: 'Cancel origin change',
            exact: true,
          }),
        ).toBeFocused();
        await expect(
          pane.getByRole('button', {
            name: 'Cancel origin change',
            exact: true,
          }),
        ).toBeInViewport();
        await shot('layout-' + width);
        await pane
          .getByRole('button', { name: 'Cancel origin change', exact: true })
          .click();
      }
      mark('Origin form usable at 760, 820, 900 and 1440 px');
      await page.reload();
      await openUnits();
      await expect(pane.locator('.location-coordinates')).toContainText(
        '151.178000',
      );
      await map.getByRole('button', { name: 'Recenter', exact: true }).click();
      await expect
        .poll(async () => (await inspect())?.camera.center.longitudeDeg)
        .toBeCloseTo(151.178, 4);
      await map.getByRole('button', { name: '3D', exact: true }).click();
      await expect
        .poll(
          () =>
            page.evaluate(() =>
              Boolean(
                globalThis.__sentinelCesiumTest?.inspect('tactical')?.ready,
              ),
            ),
          { timeout: 30000 },
        )
        .toBe(true);
      await shot('03-remote-3d');
      await map.getByRole('button', { name: 'Tactical', exact: true }).click();
      await expect
        .poll(async () => Boolean((await inspect())?.ready))
        .toBe(true);
      expect((await inspect()).camera.center.longitudeDeg).toBeCloseTo(
        151.178,
        3,
      );
      mark(
        'Draft reload, scenario Recenter and Tactical/3D camera preservation',
      );
      await load('Location · Sydney 20v20');
      await pane
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(pane).toContainText('Ready to run');
      await pane
        .getByRole('button', { name: 'Run saved revision 1', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      const before = await u.world();
      await expect
        .poll(async () => {
          const after = await u.world();
          return Object.keys(before.tracks).filter(
            (id) =>
              JSON.stringify(before.tracks[id].latest.position) !==
              JSON.stringify(after.tracks[id].latest.position),
          ).length;
        })
        .toBe(40);
      await expect
        .poll(async () => (await inspect())?.entityIds.length, {
          timeout: 30000,
        })
        .toBe(40);
      report.movingWorld = {
        missionId: before.mission.id,
        origin: before.interactive.localGeometry,
        entities: Object.keys(before.entities).length,
      };
      await shot('04-remote-20v20');
      await u.action('Pause');
      const paused = await u.world();
      await page.waitForTimeout(500);
      expect((await u.world()).tracks).toEqual(paused.tracks);
      await u.action('Resume');
      await restartBackend();
      await expect
        .poll(
          async () => {
            try {
              return (await u.world(before.mission.id)).interactive.state;
            } catch {
              return undefined;
            }
          },
          { timeout: 30000 },
        )
        .toBe('paused');
      expect(
        (await u.world(before.mission.id)).interactive.localGeometry,
      ).toEqual(before.interactive.localGeometry);
      mark(
        '40 remote actors move; Pause/Resume and actual backend restart preserve frozen geometry and pause on recovery',
      );
      await expect(
        page.locator('[data-run-state="paused"]').first(),
      ).toBeVisible({ timeout: 30000 });
      // Recovered ownership follows the existing operator control workflow.
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      const acquire = page.getByRole('menuitem', {
        name: /^(Acquire control|Reclaim control)$/,
      });
      if (await acquire.count()) await acquire.click();
      else await page.keyboard.press('Escape');
      await u.action('End demo');
      await expect
        .poll(async () => (await u.world(before.mission.id)).interactive.state)
        .toBe('ended');
      mark('End preserves the remote recorded world');
      report.initialCamera = initial.camera;
      expect(report.errors).toEqual([]);
    } catch (e) {
      report.failure = String(e);
      await shot('failure');
      throw e;
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
