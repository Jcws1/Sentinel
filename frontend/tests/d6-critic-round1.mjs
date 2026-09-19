// Independent D6 critic: fresh runtime, real UI, own assertions/evidence.
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'critic-round1',
    frontendPort: 5364,
    backendPort: 8164,
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
    const u = d6UI(page, frontend),
      c = page.locator('.cockpit-pane');
    const report = {
      cases: [],
      errors: [],
      posts: [],
      streams: 0,
      providerFailures: {},
      layouts: [],
    };
    const hash = (s) => createHash('sha256').update(s).digest('hex');
    const commands = () =>
      report.posts.filter(
        (p) => p.path.endsWith('/commands') && p.action !== 'renew',
      );
    const suggestions = () =>
      report.posts.filter((p) => p.path.endsWith('/recommendations'));
    const check = (s) => {
      report.cases.push(s);
      globalThis.console.log(s);
    };
    const shot = (s) => page.screenshot({ path: resolve(output, `${s}.png`) });
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelCesiumTest?.inspect('cockpit'));
    const pool = () =>
      page.evaluate(() => globalThis.__sentinelRendererPoolTest?.inspect());
    const cameraMatches = (actual, expected) => {
      expect(actual.projection).toBe(expected.projection);
      expect(actual.center.longitudeDeg).toBeCloseTo(
        expected.center.longitudeDeg,
        7,
      );
      expect(actual.center.latitudeDeg).toBeCloseTo(
        expected.center.latitudeDeg,
        7,
      );
      expect(actual.groundSpanM).toBeCloseTo(expected.groundSpanM, 4);
      expect(actual.headingTrueDeg).toBeCloseTo(expected.headingTrueDeg, 6);
      expect(actual.pitchFromNadirDeg).toBeCloseTo(
        expected.pitchFromNadirDeg,
        6,
      );
    };
    let lastProposal;
    page.on('pageerror', (e) =>
      report.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300),
      ),
    );
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) report.streams++;
    });
    page.on('request', (req) => {
      const url = new globalThis.URL(req.url());
      if (
        req.method() === 'POST' &&
        url.pathname.startsWith('/api/interactive/')
      ) {
        const b = req.postDataJSON();
        report.posts.push({
          path: url.pathname,
          action: b?.action ?? b?.intent?.action,
          id: b?.commandId,
          audited: !!b?.intent?.recommendation,
          hash: hash(req.postData() ?? ''),
          memberIds: b?.intent?.members?.map((m) => m.entityId),
          optionId: b?.intent?.recommendation?.option?.id,
        });
      }
    });
    page.on('response', async (r) => {
      if (r.url().endsWith('/recommendations') && r.ok())
        lastProposal = await r.json();
    });
    page.on('requestfailed', (r) => {
      const host = new globalThis.URL(r.url()).hostname;
      if (host !== '127.0.0.1') {
        const k =
          host +
          ' ' +
          (r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED');
        report.providerFailures[k] = (report.providerFailures[k] ?? 0) + 1;
      }
    });
    const review = async () => {
      await u.review();
      await expect(u.pane).not.toContainText('Reviewing the current committed');
    };
    const refresh = async () => {
      await u.refresh();
      await expect(u.pane).not.toContainText('Reviewing the current committed');
    };
    const selectTen = () =>
      u.select(
        ...Array.from(
          { length: 10 },
          (_, i) => `D6 Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
    try {
      await u.scenario({ name: `D6 independent review ${Date.now()}` });
      await u.action('Pause');
      await u.tab('Conductor', 'Close view');
      await selectTen();
      const before = commands().length,
        ws = report.streams;
      await review();
      expect(await u.pane.locator('.suggestion-card').count()).toBe(3);
      await expect(u.pane).toContainText(
        '10 available selected · 0 current assignments · 5 unassigned hostiles',
      );
      await expect(
        u.pane.getByRole('heading', {
          name: 'Enable for 5 · leave others unchanged',
          exact: true,
        }),
      ).toBeVisible();
      expect(lastProposal.selectedEntityIds).toHaveLength(10);
      expect(lastProposal.options[1].action.members).toHaveLength(5);
      expect(lastProposal.options[1].unchangedEntityIds).toHaveLength(5);
      await u.pane
        .locator('.suggestion-card')
        .nth(1)
        .locator('summary')
        .click();
      await expect(u.pane.locator('.suggestion-card').nth(1)).toContainText(
        'Unchanged',
      );
      await shot('01-ten-five-exact-review');
      await u.pane
        .getByRole('button', { name: 'Keep current orders', exact: true })
        .click();
      await expect(u.pane).toContainText('No command sent');
      await u.pane
        .getByRole('button', { name: 'Dismiss', exact: true })
        .click();
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await refresh();
      expect(commands().length).toBe(before);
      expect(report.streams).toBe(ws);
      check(
        'Personally operated 10/5 review; exact affected/unchanged disclosure; Keep and Dismiss are command-free; one shared mission stream.',
      );

      const button = u.pane.getByRole('button', {
        name: 'Refresh options',
        exact: true,
      });
      await button.focus();
      await page.keyboard.press('Enter');
      await expect(u.pane.locator('.suggestion-card').first()).toBeVisible();
      await expect(button).toBeFocused();
      report.focus = await button.evaluate((e) => ({
        style: globalThis.getComputedStyle(e).outlineStyle,
        width: globalThis.getComputedStyle(e).outlineWidth,
      }));
      expect(report.focus.style).toBe('solid');
      await shot('02-keyboard-focus');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      report.axe = (
        await new AxeBuilder({ page })
          .include('.decision-suggestions')
          .include('.fleet-suggestions')
          .analyze()
      ).violations.map((v) => ({ id: v.id, impact: v.impact }));
      expect(report.axe).toEqual([]);
      const exact = lastProposal.options
        .find((o) => o.id === 'intercept-subset')
        .action.members.map((m) => m.entityId);
      const n = commands().length;
      await u.pane
        .getByRole('button', {
          name: 'Apply Enable for 5 · leave others unchanged',
          exact: true,
        })
        .dblclick();
      await expect(u.pane).toContainText(
        'Command accepted · 5 members accepted',
      );
      expect(commands().length).toBe(n + 1);
      expect(commands().at(-1).memberIds).toEqual(exact);
      expect(commands().at(-1).audited).toBe(true);
      const frame = await u.world();
      expect(
        frame.fleetBehavior.members
          .filter((m) => m.policy === 'intercept')
          .map((m) => m.entityId)
          .sort(),
      ).toEqual([...exact].sort());
      await refresh();
      await expect(
        u.pane.getByRole('heading', { name: /Use Manual/ }),
      ).toBeVisible();
      await u.pane
        .getByRole('button', { name: /^Apply Stop selected/ })
        .click();
      await expect(u.pane).toContainText('Command accepted');
      expect(
        (await u.world()).fleetBehavior.members.every(
          (m) => m.policy === 'hold',
        ),
      ).toBe(true);
      check(
        'Double Apply produced exactly one ordinary audited command for the five reviewed IDs; Stop was separate and disarmed them. Keyboard focus and reduced-motion axe checks passed.',
      );

      await refresh();
      await page.waitForTimeout(16000);
      await expect(u.pane).toContainText('Out of date');
      await expect(
        u.pane.getByRole('button', { name: /^Apply Enable Intercept/ }),
      ).toBeDisabled();
      await shot('03-expiry');
      await refresh();
      await u.behavior('intercept');
      await expect(u.pane).toContainText('Out of date');
      await refresh();
      await expect(
        u.pane.getByRole('heading', { name: /Use Manual/ }),
      ).toBeVisible();
      await u.behavior('hold');
      await u.select('D6 Friendly 01');
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await review();
      expect(lastProposal.selectedEntityIds).toHaveLength(1);
      check(
        'Fifteen-second expiry disables Apply; ordinary Fleet behavior invalidates cards; changing selection clears the old scope.',
      );

      await page.route('**/api/interactive/*/recommendations', (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Independent advisory failure' }),
        }),
      );
      await u.pane
        .getByRole('button', { name: 'Refresh options', exact: true })
        .click();
      await expect(u.pane).toContainText('Independent advisory failure');
      await expect(
        u.fleet.getByRole('button', { name: 'Apply', exact: true }),
      ).toBeEnabled();
      await page.unroute('**/api/interactive/*/recommendations');
      await refresh();
      check(
        'Injected advisory 503 was contained; ordinary Fleet controls remained usable and explicit Refresh recovered.',
      );

      for (const [width, height] of [
        [760, 850],
        [820, 900],
        [900, 950],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(250);
        const metrics = await u.pane.evaluate((e) => ({
          panel: e.getBoundingClientRect().toJSON(),
          overflow:
            globalThis.document.documentElement.scrollWidth -
            globalThis.innerWidth,
          scrollable:
            e.querySelector('.suggestions-body').scrollHeight >
            e.querySelector('.suggestions-body').clientHeight,
        }));
        expect(metrics.overflow).toBeLessThanOrEqual(1);
        expect(metrics.panel.width).toBeGreaterThan(240);
        report.layouts.push({ width, height, ...metrics });
        await shot(`layout-${width}`);
      }
      await page.setViewportSize({ width: 2560, height: 1440 });
      await u.select('D6 Friendly 01');
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect())?.ready, { timeout: 45000 })
        .toBe(true);
      await expect(
        c.getByLabel('Video Feed environment', { exact: true }),
      ).toHaveValue('photorealistic');
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      await c
        .getByRole('button', { name: 'Place Video Feed beside map' })
        .click();
      await u.tab('Tactical Map', 'New Tactical pane');
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect.poll(async () => (await pool()).active).toBe(3);
      await review();
      await page.waitForTimeout(3500);
      report.google = await inspect();
      report.pool = await pool();
      expect(report.google.environment.photoVisibleTiles).toBeGreaterThan(0);
      await expect(c).toContainText('SIMULATED VIEW · no video feed');
      await expect(c).toContainText('Visibility not assessed');
      report.credits = await c.locator('.cesium-widget-credits').innerText();
      expect(report.credits).toContain('Google Maps');
      await shot('04-google-three-renderers-suggestions');
      const mapCamera = await page.evaluate(
        () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
      );
      const anchor = report.google.cockpit.actualPosition;
      await c.locator('summary').click();
      await c.getByRole('slider', { name: 'Video Feed look yaw' }).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(350);
      expect((await inspect()).cockpit.actualPosition).toEqual(anchor);
      cameraMatches(
        await page.evaluate(
          () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
        ),
        mapCamera,
      );
      await c.getByRole('button', { name: 'Reset view', exact: true }).click();
      await refresh();
      cameraMatches(
        await page.evaluate(
          () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
        ),
        mapCamera,
      );
      expect((await pool()).active).toBe(3);
      const readsBeforeHide = suggestions().length;
      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      await page.waitForTimeout(1200);
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
      expect(suggestions().length).toBe(readsBeforeHide);
      check(
        'Actual configured Google tiles visible with Suggestions, Tactical and independent 3D map; Video Feed disclosure, overlays and associated credits preserved; view-local look-around and refresh did not move the map camera.',
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
      await shot('05-standard-three-renderers');
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('photorealistic');
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      check(
        'Actual configured standard Cesium imagery/terrain/buildings also rendered in Video Feed; manual return to Google succeeded.',
      );

      await selectTen();
      await review();
      await u.pane
        .getByRole('button', { name: /^Apply Enable Intercept/ })
        .click();
      await expect(u.pane).toContainText('Command accepted');
      const dynamic = resolve(output, 'dynamic');
      mkdirSync(dynamic, { recursive: true });
      report.motion = [];
      await u.action('Resume');
      for (let i = 0; i < 10; i++) {
        await page.screenshot({
          path: resolve(dynamic, `${String(i).padStart(3, '0')}.png`),
        });
        const w = await u.world();
        report.motion.push({
          sequence: w.sequence,
          tick: w.interactive.tick,
          assignments: w.fleetBehavior.assignments.filter(
            (a) => a.state === 'active',
          ).length,
          nonop: Object.values(w.entities).filter(
            (e) => e.condition === 'non-operational',
          ).length,
        });
        await page.waitForTimeout(300);
      }
      await u.action('Pause');
      await refresh();
      await shot('06-post-movement-review');
      const afterMotion = await u.world();
      const lost = Object.values(afterMotion.entities).find(
        (e) =>
          e.affiliation === 'friendly' && e.condition === 'non-operational',
      );
      expect(lost).toBeTruthy();
      await u.select(lost.label);
      await review();
      await expect(u.pane).toContainText('NON-OP');
      expect(
        await u.pane.getByRole('button', { name: /^Apply / }).count(),
      ).toBe(0);
      await shot('06b-non-op-no-action');
      const video = spawnSync(
        'C:/ProgramData/chocolatey/lib/ffmpeg-full/tools/ffmpeg/bin/ffmpeg.exe',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-framerate',
          '3',
          '-i',
          resolve(dynamic, '%03d.png'),
          '-vf',
          'scale=1280:-2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          resolve(output, 'movement-sampled.mp4'),
        ],
        { windowsHide: true, encoding: 'utf8', timeout: 30000 },
      );
      report.dynamicVideo = video.status === 0;
      if (video.status === 0) rmSync(dynamic, { recursive: true });
      expect(report.motion.at(-1).tick).toBeGreaterThan(report.motion[0].tick);
      check(
        'Captured my own sampled dynamic UI evidence of Resume, existing Intercept progression and Pause; selected a resulting NON-OP friendly and verified no actionable option. Sampling is evidence, not display-FPS measurement.',
      );
      await u.action('End demo');
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0);
      await page.reload();
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      await shot('07-ended-recording');
      check(
        'End clears actionable cards; reopening the retained recording remains read-only.',
      );
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (e) {
      report.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 2000);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      const sourceFiles = [
        'backend/app/commands/recommendations.py',
        'backend/app/commands/service.py',
        'backend/app/commands/contracts.py',
        'frontend/src/services/recommendationClient.ts',
        'frontend/src/services/interactiveClient.ts',
        'frontend/src/features/entities/DecisionSuggestions.tsx',
        'frontend/src/features/entities/suggestions.css',
        'frontend/src/app/runtime.ts',
      ];
      report.sourceHashes = Object.fromEntries(
        sourceFiles.map((f) => [f, hash(readFileSync(resolve('..', f)))]),
      );
      await context.close();
      await browser.close();
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      globalThis.console.log(
        JSON.stringify({
          passed: report.passed,
          cases: report.cases.length,
          failure: report.failure,
          errors: report.errors,
          providerFailures: report.providerFailures,
        }),
      );
    }
  },
);
