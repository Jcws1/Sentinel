import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    tag: process.argv[2] ?? 'video-overlay-ui',
    frontendPort: 5351,
    backendPort: 8151,
    configured: true,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const report = {
      checks: [],
      errors: [],
      providerFailures: {},
      streams: 0,
      viewingWrites: [],
      samples: [],
    };
    const c = page.locator('.cockpit-pane'),
      fleet = page.locator('.fleet-sidebar');
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelCesiumTest?.inspect('cockpit'));
    const pool = () =>
      page.evaluate(() => globalThis.__sentinelRendererPoolTest?.inspect());
    const action = async (name) => {
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const tab = async (name, act) => {
      await page
        .getByRole('tab', { name, exact: true })
        .click({ button: 'right' });
      await page.getByRole('menuitem', { name: act, exact: true }).click();
    };
    const select = async (label) => {
      const toggle = page.locator('[data-activity-view="fleet"]');
      if ((await toggle.getAttribute('aria-expanded')) !== 'true')
        await toggle.click();
      await fleet
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
    const shot = async (name) => {
      await c.locator('.cockpit-body').evaluate((e) => (e.scrollTop = 0));
      await page.screenshot({ path: resolve(output, `${name}.png`) });
    };
    let viewing = false;
    page.on('pageerror', (e) => report.errors.push(e.name));
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) report.streams++;
    });
    page.on('request', (r) => {
      const url = new globalThis.URL(r.url());
      if (
        viewing &&
        r.method() === 'POST' &&
        url.pathname.startsWith('/api/') &&
        r.postDataJSON()?.action !== 'renew' &&
        r.postDataJSON()?.intent?.action !== 'renew'
      )
        report.viewingWrites.push(url.pathname);
    });
    page.on('requestfailed', (r) => {
      const host = new globalThis.URL(r.url()).hostname;
      if (host === '127.0.0.1') return;
      const code =
        r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED';
      report.providerFailures[`${host} ${code}`] =
        (report.providerFailures[`${host} ${code}`] ?? 0) + 1;
    });
    try {
      const name = `Cockpit refinement ${Date.now()}`;
      const unit = (
        id,
        label,
        profileId,
        lon,
        heading,
        category = 'friendly',
      ) => ({
        id,
        label,
        category,
        commandRole: category === 'friendly' ? 'sentinel' : 'observation',
        profileId,
        headingTrueDeg: heading,
        position: {
          longitudeDeg: lon,
          latitudeDeg: 1.2903,
          altitude: { metres: 180, reference: 'ELLIPSOID', datumId: 'WGS84' },
        },
      });
      const response = await page.request.post(`${frontend}/api/scenarios`, {
        data: {
          requestId: globalThis.crypto.randomUUID(),
          expectedRevision: 0,
          content: {
            name,
            boundaryRuleVersion: 'local-boundary-v1',
            units: [
              ...Array.from({ length: 8 }, (_, i) => ({
                ...unit(
                  `unknown-${i}`,
                  `Unknown ${i + 1}`,
                  'hornet-10-v1',
                  103.856 + i * 0.0001,
                  0,
                  'unknown',
                ),
                profileId: null,
                position: {
                  longitudeDeg: 103.856 + i * 0.0001,
                  latitudeDeg: 1.2892 + i * 0.00022,
                  altitude: {
                    metres: 180 + (i % 3) * 12,
                    reference: 'ELLIPSOID',
                    datumId: 'WGS84',
                  },
                },
              })),
              unit('sting', 'Refine STING', 'sting-v1', 103.8505, 90),
              {
                ...unit('quad', 'Refine Quad', 'hornet-10-v1', 103.854, 273),
                position: {
                  longitudeDeg: 103.854,
                  latitudeDeg: 1.291,
                  altitude: {
                    metres: 180,
                    reference: 'ELLIPSOID',
                    datumId: 'WGS84',
                  },
                },
              },
              unit(
                'target',
                'Refine Target',
                'hornet-10-v1',
                103.854,
                0,
                'hostile',
              ),
            ],
            boundaries: [],
          },
        },
      });
      if (!response.ok())
        throw Error(
          `Isolated scenario rejected: ${response.status()} ${await response.text()}`,
        );
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
      await select('Refine STING');
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
      await page.waitForTimeout(6000);
      report.google = await inspect();
      await shot('01-google-default-paused');
      report.overlayInitial = (await inspect()).videoOverlay;
      expect(report.overlayInitial.points.length).toBeGreaterThan(2);
      const ownId = JSON.parse(await c.getAttribute('data-binding'))[3];
      expect(report.overlayInitial.candidates.some((o) => o.id === ownId)).toBe(
        false,
      );
      const placement = await c.evaluate((e) => ({
        canvas: e
          .querySelector('.cesium-widget canvas')
          .getBoundingClientRect()
          .toJSON(),
        credits: e
          .querySelector('.cesium-widget-credits')
          .getBoundingClientRect()
          .toJSON(),
      }));
      expect(placement.canvas.bottom).toBeLessThanOrEqual(
        placement.credits.top + 1,
      );
      report.attributionPlacement = placement;
      const points = (await inspect()).videoOverlay.points;
      await page.waitForTimeout(800);
      const pausedPoints = (await inspect()).videoOverlay.points;
      expect(pausedPoints.map((p) => p.id)).toEqual(points.map((p) => p.id));
      for (let i = 0; i < points.length; i++) {
        expect(pausedPoints[i].x).toBeCloseTo(points[i].x, 5);
        expect(pausedPoints[i].y).toBeCloseTo(points[i].y, 5);
      }
      await c
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .uncheck();
      expect((await inspect()).videoOverlay.enabled).toBe(false);
      await c
        .getByRole('checkbox', { name: 'Simulated entities', exact: true })
        .check();
      await expect
        .poll(async () => (await inspect()).videoOverlay.points.length)
        .toBeGreaterThan(2);
      report.checks.push(
        'Own subject excluded; projected crowd visible and frozen while Paused; overlay toggle; required credits physically below canvas',
      );
      report.checks.push(
        'Configured Google default loads actual visible tiles; Paused has no inactive notice',
      );
      await expect(c.locator('.cockpit-notice')).toHaveCount(0);
      const binding = await c.getAttribute('data-binding'),
        anchor = (await inspect()).cockpit.actualPosition;
      await select('Refine Quad');
      await page.getByRole('tab', { name: 'Video Feed', exact: true }).click();
      expect(await c.getAttribute('data-binding')).toBe(binding);
      await c.getByRole('checkbox', { name: /Follow selection/ }).check();
      await expect(c).toContainText('Refine Quad');
      await c.getByRole('checkbox', { name: /Follow selection/ }).uncheck();
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
      await shot('02-standard-quad');
      await tab('Video Feed', 'Close view');
      await open();
      await expect(
        c.getByLabel('Video Feed environment', { exact: true }),
      ).toHaveValue('standard');
      report.checks.push(
        'Explicit standard choice survives close/reopen; pinned and follow selection rebind the same viewer',
      );
      await page.route('https://tile.googleapis.com/**', (route) =>
        route.fulfill({ status: 503, body: '' }),
      );
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('photorealistic');
      await expect(c.locator('.cockpit-provider-status')).toContainText(
        'Google 3D unavailable or incomplete',
        { timeout: 60000 },
      );
      await shot('03-google-failure');
      report.failureState = (await inspect()).spatial;
      await page.unroute('https://tile.googleapis.com/**');
      await c
        .getByRole('button', { name: 'Retry services', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      await page.waitForTimeout(3500);
      await shot('04-google-recovered');
      report.checks.push(
        'Injected Google failure is explicit; retry restores configured Google content',
      );
      await select('Refine STING');
      await open();
      await c
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await tab('Tactical Map', 'New Tactical pane');
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect.poll(async () => (await pool()).active).toBe(3);
      await c.locator('summary').click();
      const mapBefore = await page.evaluate(
        () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
      );
      await c.getByRole('slider', { name: 'Video Feed look pitch' }).focus();
      await page.keyboard.press('ArrowLeft');
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
      expect(mapAfter.pitchFromNadirDeg).toBeCloseTo(
        mapBefore.pitchFromNadirDeg,
        7,
      );
      expect(
        Math.abs(
          ((mapAfter.headingTrueDeg - mapBefore.headingTrueDeg + 540) % 360) -
            180,
        ),
      ).toBeLessThan(0.00001);
      await c.getByRole('button', { name: 'Reset view', exact: true }).click();
      await c.locator('summary').click();
      expect(report.viewingWrites).toEqual([]);
      expect(report.streams).toBe(streams);
      viewing = false;
      report.checks.push(
        'Three renderers; look/reset leave anchor and map camera unchanged; zero viewing writes/extra mission streams',
      );
      await action('Resume');
      await fleet
        .getByLabel('Behavior', { exact: true })
        .selectOption('intercept');
      const receipt = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().endsWith('/commands') &&
          r.request().postDataJSON()?.intent?.action !== 'renew',
      );
      const commandAt = globalThis.performance.now();
      await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
      expect((await (await receipt).json()).accepted).toBe(true);
      report.interceptResponseMs = globalThis.performance.now() - commandAt;
      const dynamic = resolve(output, 'dynamic');
      mkdirSync(dynamic, { recursive: true });
      for (let i = 0; i < 24; i++) {
        await c.locator('.cockpit-body').evaluate((e) => (e.scrollTop = 0));
        report.samples.push({
          at: Date.now(),
          phase: await c.getAttribute('data-phase'),
          actual: (await inspect()).cockpit.actualPosition,
        });
        await page.screenshot({
          path: resolve(dynamic, `${String(i).padStart(3, '0')}.jpg`),
          type: 'jpeg',
          quality: 68,
        });
        if ((await c.getAttribute('data-phase')) === 'non-op' && i >= 3) break;
        await page.waitForTimeout(350);
      }
      await expect(c.locator('.cockpit-notice')).toContainText(
        'VIEW INACTIVE',
        { timeout: 20000 },
      );
      await expect(c.locator('.cockpit-notice')).toContainText(
        'NON-OP · simulated loss',
      );
      const frozen = (await inspect()).cockpit.actualPosition;
      await page.waitForTimeout(1000);
      expect((await inspect()).cockpit.actualPosition).toEqual(frozen);
      report.nonOp = await inspect();
      expect(report.nonOp.videoOverlay.enabled).toBe(false);
      expect(report.nonOp.videoOverlay.nodes).toBe(0);
      await shot('05-non-op-three-views');
      report.creditStyles = await c.evaluate((e) => {
        const credit = e.querySelector('.cesium-widget-credits'),
          canvas = e.querySelector('canvas');
        return {
          canvasFilter: globalThis.getComputedStyle(canvas).filter,
          creditFilter: globalThis.getComputedStyle(credit).filter,
          text: credit.textContent,
          creditHeight: credit.getBoundingClientRect().height,
          googleFont: globalThis.getComputedStyle(
            e.querySelector('.google-maps-credit'),
          ).fontSize,
        };
      });
      expect(report.creditStyles.canvasFilter).toContain('grayscale(1)');
      expect(report.creditStyles.creditFilter).toBe('none');
      expect(report.creditStyles.text).toContain('Google Maps');
      report.checks.push(
        'Actual Intercept outcome: grey last valid viewpoint, distinct NON-OP notice, stable camera and unfiltered attribution',
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const [width, height] of [
        [760, 800],
        [820, 900],
        [900, 900],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        await c.getByRole('checkbox', { name: /Follow selection/ }).focus();
        await page.waitForTimeout(200);
        await expect(c.locator('.cockpit-heading > strong')).toBeInViewport();
        await expect(c.locator('.cockpit-subject')).toBeInViewport();
        expect(await c.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
          true,
        );
        await c.locator('.cockpit-body').evaluate((e) => (e.scrollTop = 0));
        const geometry = await c.evaluate((e) => {
          const box = (selector) =>
            e.querySelector(selector).getBoundingClientRect().toJSON();
          return {
            body: box('.cockpit-body'),
            notice: box('.cockpit-notice > div'),
            credits: box('.cesium-widget-credits'),
            google: box('.google-maps-credit'),
            viewport: e
              .closest('.workspace-scroll')
              .getBoundingClientRect()
              .toJSON(),
          };
        });
        for (const rect of [
          geometry.notice,
          geometry.credits,
          geometry.google,
        ]) {
          expect(rect.top).toBeGreaterThanOrEqual(geometry.body.top - 1);
          expect(rect.bottom).toBeLessThanOrEqual(geometry.body.bottom + 1);
          expect(rect.left).toBeGreaterThanOrEqual(geometry.viewport.left - 1);
          expect(rect.right).toBeLessThanOrEqual(geometry.viewport.right + 1);
        }
        expect(geometry.notice.bottom).toBeLessThanOrEqual(
          geometry.credits.top + 1,
        );
        expect(await c.innerText()).not.toContain('\uFFFD');
        (report.layoutGeometry ??= []).push({ width, height, ...geometry });
        await shot(`layout-${width}`);
      }
      report.accessibility = (
        await new AxeBuilder({ page }).include('.cockpit-pane').analyze()
      ).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        count: v.nodes.length,
      }));
      expect(report.accessibility).toEqual([]);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await action('End demo');
      await select('Refine Quad');
      await open();
      await expect(c.locator('.cockpit-notice')).toContainText('DEMO ENDED');
      expect((await inspect()).videoOverlay.enabled).toBe(false);
      await shot('06-ended');
      await tab('Video Feed', 'Close view');
      await open();
      await expect(c.locator('.cockpit-notice')).toContainText('DEMO ENDED');
      expect((await inspect()).videoOverlay.enabled).toBe(false);
      report.checks.push(
        'Ended pose remains inspectable after closing and reopening; six layouts, keyboard focus and reduced motion verified',
      );
      const ffmpeg = spawnSync(
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
          resolve(output, 'intercept-sampled.mp4'),
        ],
        { windowsHide: true, timeout: 30000 },
      );
      report.sampledVideoEncoded = ffmpeg.status === 0;
      report.passed = true;
    } catch (e) {
      report.failure = {
        name: e.name,
        message: e.message
          .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
          .slice(0, 1600),
      };
      report.final = await inspect().catch(() => undefined);
      await page
        .screenshot({ path: resolve(output, 'failure.png') })
        .catch(() => {});
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
          errors: report.errors,
          failure: report.failure,
        }),
      );
    }
  },
);
