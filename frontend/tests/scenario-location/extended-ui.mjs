// Additional foreground checks. API setup uses the same public scenario workflow.
import { chromium, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
process.chdir(fileURLToPath(new URL('../..', import.meta.url)));

await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'location-extended',
    frontendPort: 5381,
    backendPort: 8181,
    previewDir: 'dist-verification-scenario-location',
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
      browser: browser.version(),
      cases: [],
      errors: [],
      screenshots: [],
    };
    page.on('pageerror', (e) => report.errors.push(e.message));
    const pane = page.locator('.units-pane:not(.conductor-pane)');
    const map = page.locator('.tactical-view[data-view-id="tactical"]');
    const inspect = () =>
      page.evaluate(() => ({
        map: globalThis.__sentinelMapTest?.inspect('tactical'),
        map3d: globalThis.__sentinelCesiumTest?.inspect('tactical'),
        video: globalThis.__sentinelCesiumTest?.inspect('cockpit'),
        pool: globalThis.__sentinelRendererPoolTest?.inspect(),
      }));
    const mark = (x) => {
      report.cases.push(x);
      globalThis.console.log(x);
    };
    const shot = async (name) => {
      await page.screenshot({ path: resolve(output, name + '.png') });
      report.screenshots.push(name + '.png');
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
    const origin = async (lon) => {
      await pane
        .getByRole('button', { name: 'Enter coordinates', exact: true })
        .click();
      await pane
        .getByLabel('Origin longitude', { exact: true })
        .fill(String(lon));
      await pane
        .getByRole('button', { name: 'Apply origin', exact: true })
        .click();
    };
    const save = async () => {
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/revisions'),
      );
      await pane
        .getByRole('button', { name: 'Save revision', exact: true })
        .click();
      return await (await response).json();
    };
    try {
      const content = JSON.parse(
        readFileSync(
          resolve('tests/fixtures/scenario-location/remote-20v20.json'),
          'utf8',
        ),
      );
      const seeded = await (
        await page.request.post(frontend + '/api/scenarios', {
          data: { requestId: randomUUID(), expectedRevision: 0, content },
        })
      ).json();
      const id = seeded.result.definitionId;
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', {
          name: /Location · Sydney 20v20 · r1.*Saved plan/,
        })
        .click();
      await openUnits();
      await origin(151.1773);
      const bodies = [];
      const path = '**/api/scenarios/' + id + '/revisions';
      await page.route(path, async (route) => {
        bodies.push(route.request().postData());
        const response = await route.fetch();
        if (bodies.length === 1) await route.abort('failed');
        else await route.fulfill({ response });
      });
      await pane
        .getByRole('button', { name: 'Save revision', exact: true })
        .click();
      await expect(
        pane.getByRole('button', { name: 'Retry saved request', exact: true }),
      ).toBeEnabled();
      const pending = await page.evaluate(() =>
        globalThis.sessionStorage.getItem('sentinel.scenario.pending.v1'),
      );
      expect(pending).toBeTruthy();
      await expect(
        pane.getByRole('button', { name: 'Enter coordinates', exact: true }),
      ).toBeDisabled();
      await page.reload();
      await openUnits();
      expect(
        await page.evaluate(() =>
          globalThis.sessionStorage.getItem('sentinel.scenario.pending.v1'),
        ),
      ).toBe(pending);
      await pane
        .getByRole('button', { name: 'Retry saved request', exact: true })
        .click();
      await expect(pane.locator('.units-save-status')).toContainText(
        'Revision 2 saved',
      );
      expect(bodies).toHaveLength(2);
      expect(bodies[1]).toBe(bodies[0]);
      await page.unroute(path);
      report.retry = {
        identicalBytes: bodies[0] === bodies[1],
        requests: bodies.length,
        restoredIdentity: JSON.parse(pending).body.requestId,
      };
      mark(
        'Lost committed Save response, restored pending draft and exact-identity/body retry produce one revision',
      );

      // A second writer here is an API client of the sole task-owned backend.
      const latest = await (
        await page.request.get(frontend + '/api/scenarios/' + id)
      ).json();
      const rival = await (
        await page.request.post(
          frontend + '/api/scenarios/' + id + '/revisions',
          {
            data: {
              requestId: randomUUID(),
              expectedRevision: 2,
              content: {
                ...latest.content,
                name: latest.content.name + ' revised elsewhere',
              },
            },
          },
        )
      ).json();
      expect(rival.accepted).toBe(true);
      await origin(151.1774);
      const conflict = await save();
      expect(conflict.accepted).toBe(false);
      await expect(pane.locator('.location-coordinates')).toContainText(
        '151.177400',
      );
      expect(
        (
          await (
            await page.request.get(frontend + '/api/scenarios/' + id)
          ).json()
        ).content.localGeometry.origin.longitudeDeg,
      ).toBe(151.1773);
      await shot('01-save-conflict');
      await pane
        .getByRole('button', { name: 'Load latest', exact: true })
        .click();
      await pane
        .getByRole('button', { name: 'Replace draft', exact: true })
        .click();
      await expect(pane.locator('.location-coordinates')).toContainText(
        '151.177300',
      );
      mark(
        'Revision conflict retains the unsaved proposed origin and does not overwrite the saved revision',
      );

      await pane
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(pane).toContainText('Ready to run');
      await pane
        .getByRole('button', { name: 'Run saved revision 3', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      const frozen = await u.world(),
        mid = frozen.mission.id;
      await u.action('Pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await openUnits();
      await origin(151.1775);
      const revised = await save();
      expect(revised.accepted).toBe(true);
      expect(revised.result.content.units).toEqual(latest.content.units);
      expect((await u.world(mid)).interactive.localGeometry).toEqual(
        frozen.interactive.localGeometry,
      );
      await pane
        .getByRole('button', { name: 'Return to active demo', exact: true })
        .click();
      await u.action('Resume');
      await u.select('Friendly 01');
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      const video = page.locator('.cockpit-pane');
      await video
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await expect
        .poll(async () => (await inspect()).video?.ready, { timeout: 30000 })
        .toBe(true);
      const pose = (await inspect()).video.cockpit;
      report.videoPose = pose;
      expect(pose.position.longitudeDeg).toBeGreaterThan(151);
      expect(pose.position.latitudeDeg).toBeLessThan(-33);
      mark(
        'Authoring and saving revision 4 while the existing run is paused leaves revision 3 geometry frozen; Video Feed uses the remote track pose',
      );
      await video.locator('.cockpit-options > summary').click();
      const yaw = video.getByRole('slider', { name: 'Video Feed look yaw' });
      await yaw.focus();
      await yaw.press('ArrowRight');
      await yaw.press('ArrowRight');
      await video.locator('.cockpit-options > summary').click();
      await video
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .uncheck();
      await expect
        .poll(async () => (await inspect()).video?.videoOverlay.enabled)
        .toBe(false);
      await video
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .check();
      await expect
        .poll(async () => (await inspect()).video?.videoOverlay.enabled)
        .toBe(true);
      await shot('02-remote-video');

      // A short screenshot sequence encoded at its measured average sampling rate.
      // This demonstrates motion only and is expressly not a display-FPS measurement.
      const frames = resolve(output, 'motion-frames');
      mkdirSync(frames, { recursive: true });
      const started = Date.now();
      let count = 0;
      while (Date.now() - started < 12000) {
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
          resolve(output, 'remote-40-motion.mp4'),
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
      report.recording = {
        path: 'remote-40-motion.mp4',
        samplingFrames: count,
        elapsedMs: elapsed,
        purpose: 'motion demonstration; not FPS evidence',
      };
      await map.getByRole('button', { name: '3D', exact: true }).click();
      await expect
        .poll(async () => (await inspect()).map3d?.ready, { timeout: 30000 })
        .toBe(true);
      await shot('03-remote-3d-video');
      await u.tab('Video Feed', 'Close view');
      for (let i = 0; i < 3; i++) {
        await page
          .getByRole('button', { name: 'Video Feed', exact: true })
          .click();
        await expect
          .poll(async () => (await inspect()).video?.ready, { timeout: 30000 })
          .toBe(true);
        await u.tab('Video Feed', 'Close view');
      }
      mark(
        'Tactical, ordinary 3D and Video Feed at the remote location; overlay toggle and three Video Feed close/reopen cycles',
      );
      await u.action('End demo');
      await expect
        .poll(async () => (await u.world(mid)).interactive.state)
        .toBe('ended');
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      await expect
        .poll(
          async () =>
            (await inspect()).map?.entityIds.length ??
            (await inspect()).map3d?.entityIds.length,
          { timeout: 30000 },
        )
        .toBe(40);
      await u.select('Friendly 01');
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect(video).toContainText('Ended · frozen simulated viewpoint');
      expect((await u.world(mid)).interactive.localGeometry).toEqual(
        frozen.interactive.localGeometry,
      );
      await shot('04-remote-recorded');
      mark(
        'Ended remote recording reopens through Previous demos with 40 tracks, frozen geometry and recorded Video Feed',
      );
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (error) {
      report.failure = String(error);
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
