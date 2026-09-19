// Independent critic evidence. Does not alter application state except through public UI/API setup.
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    tag: 'video-overlay-critic1',
    frontendPort: 5355,
    backendPort: 8155,
    configured: true,
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const report = {
      checks: [],
      errors: [],
      projection: [],
      layouts: [],
      writes: [],
      streams: 0,
      providerFailures: {},
    };
    let socket,
      blocked = false,
      viewing = false;
    const c = page.locator('.cockpit-pane');
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelCesiumTest?.inspect('cockpit'));
    const pool = () =>
      page.evaluate(() => globalThis.__sentinelRendererPoolTest?.inspect());
    const check = (message) => {
      report.checks.push(message);
      globalThis.console.log(message);
    };
    const shot = async (name) => {
      await c
        .locator('.cockpit-body')
        .evaluate((e) => {
          e.scrollTop = 0;
        })
        .catch(() => {});
      await page.screenshot({ path: resolve(output, `${name}.png`) });
    };
    const action = async (name) => {
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const tab = async (name, command) => {
      await page
        .getByRole('tab', { name, exact: true })
        .click({ button: 'right' });
      await page.getByRole('menuitem', { name: command, exact: true }).click();
    };
    const select = async (label) => {
      const f = page.locator('[data-activity-view="fleet"]');
      if ((await f.getAttribute('aria-expanded')) !== 'true') await f.click();
      await page
        .locator('.fleet-sidebar')
        .getByRole('button', { name: `Inspect ${label}`, exact: true })
        .click();
    };
    const open = async () => {
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect())?.ready, { timeout: 45000 })
        .toBe(true);
    };
    const alignment = async (name) => {
      await expect
        .poll(async () => {
          const v = await inspect();
          return Math.max(
            0,
            ...(v.videoOverlay.points ?? []).map((p) => {
              const s = v.sdkOverlayProjection.find((s) => s.id === p.id);
              return Math.hypot(s.x - p.x, s.y - p.y);
            }),
          );
        })
        .toBeLessThan(1); // SDK integer client size versus fractional ResizeObserver CSS size.
      const v = await inspect();
      const errors = v.videoOverlay.points.map((p) => {
        const s = v.sdkOverlayProjection.find((s) => s.id === p.id);
        return { id: p.id, pixels: Math.hypot(s.x - p.x, s.y - p.y) };
      });
      report.projection.push({
        name,
        errors,
        frame: v.videoOverlay.frameId,
        labels: v.videoOverlay.labels,
      });
      for (const [i, a] of v.videoOverlay.labels.entries())
        for (const b of v.videoOverlay.labels.slice(i + 1))
          expect(
            a.x < b.x + b.width &&
              a.x + a.width > b.x &&
              a.y < b.y + b.height &&
              a.y + a.height > b.y,
          ).toBe(false);
    };
    page.on('pageerror', (e) => report.errors.push(e.name));
    page.on('request', (r) => {
      const url = new globalThis.URL(r.url());
      if (
        viewing &&
        r.method() === 'POST' &&
        url.pathname.startsWith('/api/') &&
        r.postDataJSON()?.intent?.action !== 'renew' &&
        r.postDataJSON()?.action !== 'renew'
      )
        report.writes.push(url.pathname);
    });
    page.on('requestfailed', (r) => {
      const host = new globalThis.URL(r.url()).hostname;
      if (host === '127.0.0.1') return;
      const k =
        host +
        ' ' +
        (r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED');
      report.providerFailures[k] = (report.providerFailures[k] ?? 0) + 1;
    });
    await page.routeWebSocket('**/api/missions/*/stream', (r) => {
      report.streams++;
      if (blocked) r.close();
      else {
        socket = r;
        r.connectToServer();
      }
    });
    try {
      const name = `Independent overlay review ${Date.now()}`;
      const unit = (id, label, category, lon, lat, height = 220) => ({
        id,
        label,
        category,
        commandRole: category === 'friendly' ? 'sentinel' : 'observation',
        profileId:
          category === 'unknown'
            ? null
            : category === 'friendly' && id === 'eye'
              ? 'sting-v1'
              : 'hornet-10-v1',
        headingTrueDeg: 90,
        position: {
          longitudeDeg: lon,
          latitudeDeg: lat,
          altitude: {
            metres: height,
            reference: 'ELLIPSOID',
            datumId: 'WGS84',
          },
        },
      });
      const created = await page.request.post(`${frontend}/api/scenarios`, {
        data: {
          requestId: globalThis.crypto.randomUUID(),
          expectedRevision: 0,
          content: {
            name,
            boundaryRuleVersion: 'local-boundary-v1',
            boundaries: [],
            units: [
              unit('eye', 'Review Eye', 'friendly', 103.8505, 1.2903),
              unit('wing', 'Review Wing', 'friendly', 103.854, 1.291),
              unit('enemy', 'Review Hostile', 'hostile', 103.854, 1.2903),
              unit('behind', 'Behind camera', 'unknown', 103.847, 1.2903),
              ...Array.from({ length: 12 }, (_, i) =>
                unit(
                  `unknown-${i}`,
                  `Unknown ${String(i + 1).padStart(2, '0')}`,
                  'unknown',
                  103.856 + i * 0.00006,
                  1.2893 + i * 0.00017,
                  180 + (i % 3) * 20,
                ),
              ),
            ],
          },
        },
      });
      expect(created.ok()).toBe(true);
      await page.goto(frontend);
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
        .click();
      const conductor = page.locator('[data-view="conductor"]');
      await conductor
        .getByRole('button', { name: 'Validate saved revision', exact: true })
        .click();
      await expect(conductor).toContainText('Ready to run');
      await conductor
        .getByRole('button', { name: 'Run saved revision 1', exact: true })
        .click();
      await page.locator('[data-run-state="running"]').first().waitFor();
      await action('Pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await tab('Conductor', 'Close view');
      await select('Review Eye');
      const streams = report.streams;
      viewing = true;
      await open();
      await expect(
        c.getByLabel('Video Feed environment', { exact: true }),
      ).toHaveValue('photorealistic');
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      await page.waitForTimeout(5000);
      await expect
        .poll(async () => (await inspect()).videoOverlay.points.length)
        .toBeGreaterThan(4);
      report.google = await inspect();
      await alignment('default-docked');
      const own = JSON.parse(await c.getAttribute('data-binding'))[3];
      expect(
        report.google.videoOverlay.candidates.some((o) => o.id === own),
      ).toBe(false);
      expect(
        report.google.videoOverlay.points.some((o) => o.id.endsWith(':behind')),
      ).toBe(false);
      await shot('01-google-docked-crowd');
      report.attribution = await c.evaluate((e) => {
        const rect = (s) => e.querySelector(s).getBoundingClientRect().toJSON();
        return {
          canvas: rect('.cesium-widget canvas'),
          credits: rect('.cesium-widget-credits'),
          google: rect('.google-maps-credit'),
          text: e.querySelector('.cesium-widget-credits').textContent,
        };
      });
      expect(report.attribution.canvas.bottom).toBeLessThanOrEqual(
        report.attribution.credits.top + 1,
      );
      await c.locator('.cesium-credit-expand-link').focus();
      await page.keyboard.press('Enter');
      await expect(c.locator('.cesium-credit-lightbox')).toBeVisible();
      report.creditDialog = await c
        .locator('.cesium-credit-lightbox')
        .innerText();
      await shot('01b-data-sources-keyboard');
      await page.keyboard.press('Escape');
      await expect(c.locator('.cesium-credit-expand-link')).toBeFocused();
      const frozen = report.google.videoOverlay.points;
      await page.waitForTimeout(1000);
      const frozenAgain = (await inspect()).videoOverlay.points;
      expect(frozenAgain.map((p) => p.id)).toEqual(frozen.map((p) => p.id));
      for (let i = 0; i < frozen.length; i++) {
        expect(frozenAgain[i].x).toBeCloseTo(frozen[i].x, 6);
        expect(frozenAgain[i].y).toBeCloseTo(frozen[i].y, 6);
      }
      check(
        'Configured Google visible in actual UI; same-camera projection agrees; own/behind subject excluded; crowded labels non-overlapping; Paused frozen; credits below canvas.',
      );
      const toggle = c.getByRole('checkbox', {
        name: 'Simulated entities',
        exact: true,
      });
      await toggle.focus();
      report.focus = await toggle.evaluate((e) => ({
        outline: globalThis.getComputedStyle(e).outlineStyle,
        width: globalThis.getComputedStyle(e).outlineWidth,
      }));
      await page.keyboard.press('Space');
      expect((await inspect()).videoOverlay.nodes).toBe(0);
      await page.keyboard.press('Space');
      await expect
        .poll(async () => (await inspect()).videoOverlay.points.length)
        .toBeGreaterThan(4);
      await c
        .getByRole('button', { name: 'Place Video Feed beside map' })
        .click();
      await tab('Tactical Map', 'New Tactical pane');
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect.poll(async () => (await pool()).active).toBe(3);
      const mapBefore = await page.evaluate(
        () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
      );
      const anchor = (await inspect()).cockpit.actualPosition;
      await c.locator('summary').click();
      await c.getByRole('slider', { name: 'Video Feed look yaw' }).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(300);
      await alignment('look-yaw-10');
      expect((await inspect()).cockpit.actualPosition).toEqual(anchor);
      const mapAfter = await page.evaluate(
        () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
      );
      expect(mapAfter.center.longitudeDeg).toBeCloseTo(
        mapBefore.center.longitudeDeg,
        7,
      );
      expect(mapAfter.center.latitudeDeg).toBeCloseTo(
        mapBefore.center.latitudeDeg,
        7,
      );
      expect(mapAfter.groundSpanM).toBeCloseTo(mapBefore.groundSpanM, 4);
      await c.getByRole('button', { name: 'Reset view', exact: true }).click();
      await c.locator('summary').click();
      await shot('02-three-views-look-reset');
      check(
        'Keyboard overlay toggle, bounded look-around/reset, three active renderers and independent ordinary 3D camera.',
      );
      for (const [width, height] of [
        [760, 800],
        [820, 900],
        [900, 900],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        await toggle.focus();
        await page.waitForTimeout(300);
        await alignment(`layout-${width}`);
        await c.locator('.cockpit-body').evaluate((e) => {
          e.scrollTop = 0;
        });
        const geometry = await c.evaluate((e) => ({
          width: e.clientWidth,
          scrollWidth: e.scrollWidth,
          scene: e
            .querySelector('.video-render-surface')
            .getBoundingClientRect()
            .toJSON(),
          credits: e
            .querySelector('.cesium-widget-credits')
            .getBoundingClientRect()
            .toJSON(),
          body: e
            .querySelector('.cockpit-body')
            .getBoundingClientRect()
            .toJSON(),
        }));
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
        expect(geometry.scene.bottom).toBeLessThanOrEqual(
          geometry.credits.top + 1,
        );
        report.layouts.push({ width, height, ...geometry });
        await shot(`layout-${width}`);
      }
      await c
        .getByRole('button', { name: 'Place Video Feed beside map' })
        .click();
      await shot('layout-3840-beside');
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      report.axe = (
        await new AxeBuilder({ page }).include('.cockpit-pane').analyze()
      ).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        count: v.nodes.length,
      }));
      expect(report.axe).toEqual([]);
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      check(
        '760/820/900/desktop/1440p/4K: projection remains aligned, credit footer separate, no pane overflow; axe clear and reduced-motion mode operable.',
      );
      // Test UI display filters through the map's existing menu.
      await page
        .locator('[data-view-id="tactical"]')
        .getByRole('button', { name: 'Map layers', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Shared entity filters', exact: true })
        .hover();
      const affiliation = page.getByRole('menuitem', { name: /^Affiliation/ });
      await affiliation.hover();
      await page
        .getByRole('menuitemcheckbox', { name: 'HOSTILE', exact: true })
        .click();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      await expect
        .poll(async () => (await inspect()).videoOverlay.candidates.length)
        .toBe(1);
      expect((await inspect()).videoOverlay.candidates[0].id).toMatch(/enemy$/);
      await shot('03-hostile-filter');
      await page
        .locator('[data-view-id="tactical"]')
        .getByRole('button', { name: 'Map layers', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Shared entity filters', exact: true })
        .hover();
      await page
        .getByRole('menuitem', { name: 'Reset all filters', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect()).videoOverlay.candidates.length)
        .toBeGreaterThan(10);
      check(
        'Existing shared affiliation filter applies to simulated annotations.',
      );
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('standard');
      await expect
        .poll(async () => (await inspect())?.spatial, { timeout: 60000 })
        .toMatchObject({
          imagery: 'ready',
          terrain: 'ready',
          buildings: 'ready',
          displayedBase: 'standard',
        });
      await page.waitForTimeout(3500);
      report.standard = await inspect();
      await alignment('standard');
      await shot('04-standard-cesium');
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('photorealistic');
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      check(
        'Configured Cesium imagery/terrain/buildings rendered; provider switching retains correctly projected annotations.',
      );
      const binding = await c.getAttribute('data-binding');
      await select('Review Wing');
      await page.getByRole('tab', { name: 'Video Feed', exact: true }).click();
      expect(await c.getAttribute('data-binding')).toBe(binding);
      await c.getByRole('checkbox', { name: /Follow selection/ }).check();
      await expect(c).toContainText('Review Wing');
      expect((await inspect()).videoOverlay.bindingKey).not.toBe(binding);
      await c.getByRole('checkbox', { name: /Follow selection/ }).uncheck();
      await select('Review Eye');
      await open();
      await toggle.uncheck();
      await tab('Video Feed', 'Close view');
      await open();
      await expect(toggle).not.toBeChecked();
      expect((await inspect()).videoOverlay.enabled).toBe(false);
      await toggle.check();
      check(
        'Pinned versus Follow selection and rebinding preserve exact subject; explicit overlay preference survives close/reopen.',
      );
      expect(report.writes).toEqual([]);
      expect(report.streams).toBe(streams);
      viewing = false;
      blocked = true;
      socket.close();
      await expect(c).toHaveAttribute('data-phase', 'disconnected');
      expect((await inspect()).videoOverlay.nodes).toBe(0);
      await shot('05-disconnected');
      blocked = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(c).toHaveAttribute('data-phase', 'paused');
      await expect
        .poll(async () => (await inspect()).videoOverlay.points.length)
        .toBeGreaterThan(4);
      await restartBackend();
      await expect(page.locator('.connection-state')).toHaveText('CONNECTED', {
        timeout: 30000,
      });
      await expect(c).toHaveAttribute('data-phase', 'paused');
      check(
        'Actual stream loss hides annotations; valid reconnection and backend restart retain paused-source semantics.',
      );
      await action('Resume');
      await page.locator('[data-run-state="running"]').first().waitFor();
      const fleet = page.locator('.fleet-sidebar');
      await fleet
        .getByLabel('Behavior', { exact: true })
        .selectOption('intercept');
      const accepted = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action !== 'renew',
      );
      const at = globalThis.performance.now();
      await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
      expect((await (await accepted).json()).accepted).toBe(true);
      report.commandResponseMs = globalThis.performance.now() - at;
      const dynamic = resolve(output, 'dynamic');
      mkdirSync(dynamic, { recursive: true });
      report.dynamic = [];
      for (let i = 0; i < 18; i++) {
        await c.locator('.cockpit-body').evaluate((e) => {
          e.scrollTop = 0;
        });
        const v = await inspect();
        report.dynamic.push({
          phase: await c.getAttribute('data-phase'),
          frame: v.videoOverlay.frameId,
          enabled: v.videoOverlay.enabled,
          camera: v.cockpit.actualPosition,
          points: v.videoOverlay.points,
        });
        await page.screenshot({
          path: resolve(dynamic, `${String(i).padStart(3, '0')}.jpg`),
          type: 'jpeg',
          quality: 66,
        });
        if ((await c.getAttribute('data-phase')) === 'non-op' && i > 3) break;
        await page.waitForTimeout(250);
      }
      await expect(c).toHaveAttribute('data-phase', 'non-op', {
        timeout: 20000,
      });
      expect((await inspect()).videoOverlay.nodes).toBe(0);
      await shot('06-non-op');
      const ff = spawnSync(
        'C:/ProgramData/chocolatey/lib/ffmpeg-full/tools/ffmpeg/bin/ffmpeg.exe',
        [
          '-y',
          '-loglevel',
          'error',
          '-framerate',
          '2',
          '-i',
          resolve(dynamic, '%03d.jpg'),
          '-vf',
          'scale=1280:-2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          resolve(output, 'sampled-motion.mp4'),
        ],
        { windowsHide: true, timeout: 30000 },
      );
      report.videoEncoded = ff.status === 0;
      check(
        'Real Intercept movement and atomic NON-OP captured; annotations disappear under the inactive notice; viewing generated no extra command submissions or mission streams.',
      );
      await action('End demo');
      await select('Review Wing');
      await open();
      await expect(c).toHaveAttribute('data-phase', 'ended');
      expect((await inspect()).videoOverlay.nodes).toBe(0);
      await shot('07-ended');
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page.getByRole('menuitem', { name: /Demo 001/ }).click();
      await select('Review Wing');
      await open();
      await expect(c).toHaveAttribute('data-phase', 'ended');
      expect((await inspect()).videoOverlay.nodes).toBe(0);
      await shot('08-recorded-ended');
      await action('New demo');
      await expect(c).toHaveAttribute('data-phase', 'unavailable');
      expect(await c.getAttribute('data-binding')).toBe(null);
      await shot('09-mission-cleared');
      await action('End demo');
      check(
        'Recorded ended inspection preserves final pose with annotations hidden; new mission clears the prior subject/image.',
      );
      report.passed = true;
    } catch (e) {
      report.failure = {
        name: e.name,
        message: e.message
          .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
          .slice(0, 1500),
      };
      report.final = await inspect().catch(() => undefined);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      globalThis.console.log(
        JSON.stringify({
          passed: report.passed,
          checks: report.checks,
          failure: report.failure,
          errors: report.errors,
        }),
      );
    }
  },
);
