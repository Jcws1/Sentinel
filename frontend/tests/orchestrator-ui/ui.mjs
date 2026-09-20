/* global innerWidth, document, sessionStorage */
// Foreground acceptance with an isolated database/context. No operator storage.
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
process.chdir(fileURLToPath(new URL('../..', import.meta.url)));

await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'orchestrator-final',
    frontendPort: 5391,
    backendPort: 8191,
    evidenceRoot: 'test-results/orchestrator-ui',
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
      ui = operatorUI(page, frontend);
    page.setDefaultTimeout(15000);
    const r = {
      browser: browser.version(),
      viewport: { width: 1440, height: 900 },
      cases: [],
      errors: [],
      screenshots: [],
    };
    page.on('pageerror', (e) => r.errors.push(e.message));
    const panel = page.locator('[data-view="orchestrator"]');
    const map = page.locator('.tactical-view[data-view-id="tactical"]');
    const mark = (text) => {
      r.cases.push(text);
      globalThis.console.log(text);
    };
    const shot = async (name) => {
      await page.screenshot({ path: resolve(output, name + '.png') });
      r.screenshots.push(name + '.png');
    };
    const tab = (name) => panel.getByRole('tab', { name, exact: true }).click();
    const open = async (section = 'Units') => {
      await page
        .getByRole('button', { name: 'Open Orchestrator', exact: true })
        .first()
        .click();
      await tab(section);
      const editor = panel.getByRole('button', {
        name: 'Open scenario editor',
        exact: true,
      });
      if (await editor.isVisible()) await editor.click();
    };
    const disclosure = async (selector) => {
      const el = panel.locator(selector);
      if (!(await el.evaluate((e) => e.open)))
        await el.locator(':scope > summary').click();
    };
    const inspect = () =>
      page.evaluate(() => ({
        map: globalThis.__sentinelMapTest?.inspect('tactical'),
        threeD: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
      }));
    const save = async (label = 'Save revision') => {
      const response = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          /\/api\/scenarios(?:\/[^/]+\/revisions)?$/.test(res.url()),
      );
      await panel.getByRole('button', { name: label, exact: true }).click();
      const result = await (await response).json();
      expect(result.accepted).toBe(true);
      await expect(panel.locator('.units-save-status')).toContainText('saved');
      return result.result;
    };
    const place = async (category, profile, lon, lat) => {
      await disclosure('.units-palette');
      const cat = panel
        .locator('.units-category')
        .filter({ hasText: category })
        .first();
      if ((await cat.getAttribute('aria-expanded')) !== 'true')
        await cat.click();
      await panel
        .locator('.units-subtypes')
        .getByRole('button', { name: new RegExp('^' + profile) })
        .click();
      await panel.locator('.units-numeric > summary').click();
      await panel
        .getByLabel('Placement longitude', { exact: true })
        .fill(String(lon));
      await panel
        .getByLabel('Placement latitude', { exact: true })
        .fill(String(lat));
      await panel
        .getByRole('button', { name: 'Place at coordinates', exact: true })
        .click();
    };
    try {
      await page.goto(frontend);
      await open();
      await panel
        .getByLabel('Arrangement name')
        .fill('Orchestrator author acceptance');
      await panel.getByRole('button', { name: /^Location ·/ }).click();
      await panel
        .getByRole('button', { name: 'Choose on map', exact: true })
        .click();
      await expect
        .poll(async () => Boolean((await inspect()).map?.ready))
        .toBe(true);
      const canvas = map.locator('canvas').first(),
        b = await canvas.boundingBox();
      await canvas.click({
        position: { x: b.width * 0.55, y: b.height * 0.5 },
      });
      await panel
        .getByRole('button', { name: 'Cancel origin change', exact: true })
        .click();
      await panel.getByRole('button', { name: /^Location ·/ }).click();
      await panel
        .getByLabel('Origin longitude', { exact: true })
        .fill('151.1772');
      await panel
        .getByLabel('Origin latitude', { exact: true })
        .fill('-33.9461');
      await panel
        .getByRole('button', { name: 'Apply origin', exact: true })
        .click();
      await map.getByRole('button', { name: 'Recenter', exact: true }).click();
      await place('Friendly', 'Quadcopter', 151.1772, -33.9461);
      await place('Friendly', 'STING', 151.1782, -33.9461);
      await place('Hostile', 'Lancet-3', 151.1792, -33.9461);
      expect(
        await panel.locator('.units-subtypes .unit-silhouette').count(),
      ).toBeGreaterThan(0);
      await shot('01-profile-silhouettes');
      await panel.locator('.units-palette > summary').click();
      await panel
        .getByRole('button', { name: 'Clear selection', exact: true })
        .click();
      await panel.getByLabel('Select unit Friendly 1', { exact: true }).focus();
      const checkboxBefore = await panel
        .getByLabel('Select unit Friendly 1', { exact: true })
        .boundingBox();
      await page.keyboard.press('Space');
      const checkboxAfter = await panel
        .getByLabel('Select unit Friendly 1', { exact: true })
        .boundingBox();
      r.firstCheckboxDeltaPx = checkboxAfter.y - checkboxBefore.y;
      expect(Math.abs(r.firstCheckboxDeltaPx)).toBeLessThanOrEqual(1);
      await panel.getByLabel('Select unit Friendly 2', { exact: true }).check();
      await panel.getByLabel('Filter placed units').selectOption('hostile');
      await expect(
        panel.getByRole('group', { name: 'Unit selection' }),
      ).toContainText('2 hidden by filter');
      await panel
        .getByRole('button', { name: 'Select all shown (1)', exact: true })
        .click();
      await expect(
        panel.getByRole('group', { name: 'Unit selection' }),
      ).toContainText('3 selected');
      await panel
        .getByRole('button', { name: 'Delete selected (3)', exact: true })
        .click();
      await shot('02-filtered-deletion-review');
      await page.keyboard.press('Escape');
      await expect(
        panel.getByRole('button', { name: 'Delete selected (3)', exact: true }),
      ).toBeFocused();
      await panel
        .getByRole('button', { name: 'Delete selected (3)', exact: true })
        .click();
      await panel
        .getByRole('button', { name: 'Confirm delete 3', exact: true })
        .click();
      await expect(panel.locator('.arrangement-item')).toHaveCount(0);
      await panel.getByLabel('Filter placed units').selectOption('all');
      await place('Friendly', 'Quadcopter', 151.1772, -33.9461);
      await panel
        .getByLabel('Unit label', { exact: true })
        .fill('Remote actor');
      await panel
        .getByRole('button', { name: 'Apply changes', exact: true })
        .click();
      await tab('Conductor');
      await panel
        .getByRole('button', { name: 'Add action', exact: true })
        .click();
      await panel
        .getByLabel('Script destination longitude', { exact: true })
        .fill('151.1872');
      await tab('Units');
      await tab('Conductor');
      await expect(
        panel.getByLabel('Script destination longitude', { exact: true }),
      ).toHaveValue('151.1872');
      await panel
        .getByRole('button', { name: 'Apply action', exact: true })
        .click();
      await save();
      await tab('Units');
      await panel
        .getByRole('button', { name: 'Delete selected (1)', exact: true })
        .click();
      await expect(
        panel.getByRole('region', { name: 'Review unit deletion' }),
      ).toContainText('Deletion blocked');
      await expect(
        panel.getByRole('button', { name: 'Confirm delete 1', exact: true }),
      ).toBeDisabled();
      await panel
        .getByRole('button', { name: 'Keep units', exact: true })
        .click();
      mark(
        'New remote location, map-pick Cancel, numeric Apply, profile silhouettes, keyboard/mixed/hidden selection, atomic deletion, scripted dependency refusal and retained action edit',
      );

      const fixture = JSON.parse(
        readFileSync(
          'tests/fixtures/scenario-location/remote-20v20.json',
          'utf8',
        ),
      );
      const seeded = await (
        await page.request.post(frontend + '/api/scenarios', {
          data: {
            requestId: randomUUID(),
            expectedRevision: 0,
            content: fixture,
          },
        })
      ).json();
      expect(seeded.accepted).toBe(true);
      const id = seeded.result.definitionId;
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', {
          name: /Location · Sydney 20v20 · r1.*Saved plan/,
        })
        .click();
      await tab('Units');
      await expect(panel.locator('.arrangement-item')).toHaveCount(40);
      await panel.getByLabel('Filter placed units').selectOption('friendly');
      await panel
        .getByRole('button', { name: 'Select all shown (20)', exact: true })
        .click();
      await tab('Conductor');
      await expect(
        panel.locator('.conductor-actor-picker > summary'),
      ).toContainText('20 selected');
      await tab('Units');
      await expect(
        panel.getByRole('group', { name: 'Unit selection' }),
      ).toContainText('20 selected');
      await panel
        .getByRole('button', { name: 'Clear selection', exact: true })
        .click();
      await panel.getByLabel('Filter placed units').selectOption('all');
      await shot('03-populated-40');
      for (const width of [760, 820, 900, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await panel.getByRole('tab', { name: 'Units', exact: true }).focus();
        await page.keyboard.press('ArrowRight');
        await expect(
          panel.getByRole('tab', { name: 'Conductor', exact: true }),
        ).toBeFocused();
        await page.keyboard.press('Home');
        await expect(
          panel.getByRole('tab', { name: 'Units', exact: true }),
        ).toBeFocused();
        await expect(
          panel.getByRole('button', { name: 'Save revision', exact: true }),
        ).toBeInViewport();
        const bounds = await page.evaluate(() => ({
          w: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(bounds.scroll).toBeLessThanOrEqual(bounds.w + 1);
        await shot('layout-' + width);
      }
      const axe = await new AxeBuilder({ page })
        .include('.orchestrator-pane')
        .analyze();
      r.accessibility = axe.violations;
      expect(axe.violations).toEqual([]);
      // Losing a committed response must retain exactly the same pending request across tabs/reload.
      await panel.getByLabel('Arrangement name').fill('Orchestrator Sydney 40');
      const bodies = [],
        url = '**/api/scenarios/' + id + '/revisions';
      await page.route(url, async (route) => {
        bodies.push(route.request().postData());
        const response = await route.fetch();
        if (bodies.length === 1) await route.abort('failed');
        else await route.fulfill({ response });
      });
      await panel
        .getByRole('button', { name: 'Save revision', exact: true })
        .click();
      await expect(
        panel.getByRole('button', { name: 'Retry saved request', exact: true }),
      ).toBeEnabled();
      const pending = await page.evaluate(() =>
        sessionStorage.getItem('sentinel.scenario.pending.v1'),
      );
      expect(pending).toBeTruthy();
      await tab('Conductor');
      await expect(
        panel.getByRole('button', { name: 'Add action', exact: true }),
      ).toBeDisabled();
      await tab('Units');
      await expect(panel.getByLabel('Arrangement name')).toBeDisabled();
      await page.reload();
      await open();
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem('sentinel.scenario.pending.v1'),
        ),
      ).toBe(pending);
      await panel
        .getByRole('button', { name: 'Retry saved request', exact: true })
        .click();
      await expect(panel.locator('.units-save-status')).toContainText(
        'Revision 2 saved',
      );
      expect(bodies).toHaveLength(2);
      expect(bodies[0]).toBe(bodies[1]);
      await page.unroute(url);
      mark(
        '40-unit authoring, 760/820/900/1440 layouts, keyboard tab focus, accessibility and exact pending-save body/identity across tabs and reload',
      );
      await panel
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(
        panel.getByLabel('Scenario validation review'),
      ).toContainText('Ready to run');
      await expect(
        panel.getByLabel('Scenario validation review'),
      ).toBeFocused();
      await panel
        .getByRole('button', { name: 'Run saved revision 2', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      const before = await ui.world(),
        mid = before.mission.id;
      expect(before.scenario.revision).toBe(2);
      await expect
        .poll(async () => {
          const after = await ui.world();
          return Object.keys(before.tracks).filter(
            (key) =>
              JSON.stringify(before.tracks[key].latest.position) !==
              JSON.stringify(after.tracks[key].latest.position),
          ).length;
        })
        .toBe(40);
      await expect
        .poll(async () => (await inspect()).map?.entityIds.length)
        .toBe(40);
      r.moving = {
        entityCount: 40,
        changedPositions: 40,
        revision: 2,
        mission: mid,
        origin: before.interactive.localGeometry,
      };
      await shot('04-forty-moving');
      const frames = resolve(output, 'motion-frames');
      mkdirSync(frames, { recursive: true });
      const started = Date.now();
      let count = 0;
      while (Date.now() - started < 8000) {
        await page.screenshot({
          path: resolve(frames, String(count++).padStart(4, '0') + '.jpg'),
          type: 'jpeg',
          quality: 72,
        });
        await page.waitForTimeout(90);
      }
      const elapsed = Date.now() - started;
      const encoder = spawn(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-framerate',
          String((count * 1000) / elapsed),
          '-i',
          resolve(frames, '%04d.jpg'),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          resolve(output, 'forty-moving.mp4'),
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
      expect(
        await new Promise((ok, fail) => {
          encoder.on('error', fail);
          encoder.on('exit', ok);
        }),
      ).toBe(0);
      for (let i = 0; i < count; i++)
        unlinkSync(resolve(frames, String(i).padStart(4, '0') + '.jpg'));
      r.recording = {
        path: 'forty-moving.mp4',
        frames: count,
        elapsedMs: elapsed,
        purpose: 'Movement demonstration, not display FPS evidence',
      };

      await ui.action('Pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      const frozen = await ui.world();
      await open();
      await panel
        .getByLabel('Arrangement name')
        .fill('Draft alongside paused run');
      await save();
      expect((await ui.world(mid)).scenario).toEqual(frozen.scenario);
      expect((await ui.world(mid)).tracks).toEqual(frozen.tracks);
      await panel
        .getByRole('button', { name: 'Return to active demo', exact: true })
        .click();
      await ui.action('Resume');
      await map.getByRole('button', { name: '3D', exact: true }).click();
      await expect
        .poll(async () => (await inspect()).threeD?.ready, { timeout: 30000 })
        .toBe(true);
      await ui.select('Friendly 01');
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await page
        .locator('.cockpit-pane')
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await inspect()).video?.ready, { timeout: 30000 })
        .toBe(true);
      await shot('05-3d-video');
      await ui.tab('Video Feed', 'Close view');
      await map.getByRole('button', { name: 'Tactical', exact: true }).click();
      for (let i = 0; i < 3; i++) {
        await ui.tab('Orchestrator', 'Close view');
        await page
          .getByRole('button', { name: 'Open Orchestrator', exact: true })
          .first()
          .click();
        await expect(panel).toHaveCount(1);
      }
      await ui.tab('Orchestrator', 'Open to Side');
      await expect(panel).toHaveCount(1);
      await restartBackend();
      await expect
        .poll(
          async () => {
            try {
              return (await ui.world(mid)).interactive.state;
            } catch {
              return undefined;
            }
          },
          { timeout: 30000 },
        )
        .toBe('paused');
      await expect(
        page.locator('[data-run-state="paused"]').first(),
      ).toBeVisible({ timeout: 30000 });
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      const acquire = page.getByRole('menuitem', {
        name: /^(Acquire control|Reclaim control)$/,
      });
      if (await acquire.count()) await acquire.click();
      else await page.keyboard.press('Escape');
      await ui.action('End demo');
      await expect
        .poll(async () => (await ui.world(mid)).interactive.state)
        .toBe('ended');
      await expect(panel.locator('.orchestrator-status')).toContainText(
        'ended',
      );
      await shot('06-recorded-inspection');
      expect((await ui.world(mid)).scenario.contentHash).toBe(
        before.scenario.contentHash,
      );
      r.resources = await inspect();
      mark(
        'Exact saved revision Run, all 40 moving, paused frozen-run isolation, Resume, Tactical/3D/Video, repeated reopening, docking, backend restart/reconnection and ended recorded inspection',
      );
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e);
      await shot('failure');
      throw e;
    } finally {
      writeFileSync(resolve(output, 'report.json'), JSON.stringify(r, null, 2));
      await context.close();
      await browser.close();
    }
  },
);
