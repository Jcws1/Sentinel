// Fresh independent D6 critic, round 2. No application source mutations.
import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';

const files = [
  'backend/app/commands/recommendations.py',
  'backend/app/commands/contracts.py',
  'backend/app/commands/service.py',
  'backend/app/commands/selected_control.py',
  'backend/app/commands/behaviors.py',
  'backend/app/commands/movement.py',
  'backend/app/api/interactive.py',
  'frontend/src/services/recommendationClient.ts',
  'frontend/src/services/interactiveClient.ts',
  'frontend/src/contracts/interactive.ts',
  'frontend/src/contracts/generated.ts',
  'frontend/src/features/entities/DecisionSuggestions.tsx',
  'frontend/src/features/entities/suggestions.css',
  'frontend/src/features/entities/FleetSidebar.tsx',
  'frontend/src/app/runtime.ts',
  'frontend/src/features/workspace/viewRegistry.ts',
  'frontend/src/features/workspace/workspaceBridge.ts',
];
const hash = (data) => createHash('sha256').update(data).digest('hex');
const hashes = () =>
  Object.fromEntries(
    files.map((f) => [f, hash(readFileSync(resolve('..', f)))]),
  );
const sourceBefore = hashes();
const providersOnly = process.argv.includes('--providers');
await withD5Runtime(
  {
    phase: 'd6',
    tag: 'critic-round2',
    frontendPort: 5364,
    backendPort: 8164,
    configured: true,
  },
  async ({ frontend, output, restartBackend }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(25000);
    const u = d6UI(page, frontend),
      c = page.locator('.cockpit-pane');
    const r = {
      cases: [],
      errors: [],
      commands: [],
      reads: 0,
      streams: 0,
      layouts: [],
      providerFailures: {},
      sourceBefore,
    };
    let proposal,
      lost = false,
      holdReceipts = false;
    const check = (s) => {
      r.cases.push(s);
      globalThis.console.log(s);
    };
    const shot = (s) => page.screenshot({ path: resolve(output, `${s}.png`) });
    const refresh = async () => {
      await u.refresh();
      await expect(u.pane).not.toContainText('Reviewing the current committed');
    };
    const review = async () => {
      await u.review();
      await expect(u.pane).not.toContainText('Reviewing the current committed');
    };
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelCesiumTest?.inspect('cockpit'));
    const pool = () =>
      page.evaluate(() => globalThis.__sentinelRendererPoolTest?.inspect());
    const ten = () =>
      u.select(
        ...Array.from(
          { length: 10 },
          (_, i) => `D6 Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
    page.on('pageerror', (e) =>
      r.errors.push(
        e.name +
          ': ' +
          e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 300),
      ),
    );
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) r.streams++;
    });
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/recommendations'))
        r.reads++;
      if (req.method() === 'POST' && req.url().endsWith('/commands')) {
        const b = req.postDataJSON();
        if (b.intent.action !== 'renew')
          r.commands.push({
            id: b.commandId,
            action: b.intent.action,
            audited: !!b.intent.recommendation,
            hash: hash(req.postData()),
            members: b.intent.members?.map((m) => m.entityId),
            option: b.intent.recommendation?.option.id,
            reasons: b.intent.recommendation?.option.unchangedReasons,
          });
      }
    });
    page.on('response', async (response) => {
      if (response.ok() && response.url().endsWith('/recommendations'))
        proposal = await response.json();
    });
    page.on('requestfailed', (req) => {
      const host = new globalThis.URL(req.url()).hostname;
      if (host !== '127.0.0.1') {
        const k =
          host +
          ' ' +
          (req.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED');
        r.providerFailures[k] = (r.providerFailures[k] ?? 0) + 1;
      }
    });
    await page.route('**/api/interactive/*/receipts?**', (route) =>
      holdReceipts ? route.abort() : route.continue(),
    );
    await page.route('**/api/interactive/*/commands', async (route) => {
      if (lost && route.request().postDataJSON()?.intent?.recommendation) {
        lost = false;
        const response = await route.fetch();
        expect((await response.json()).accepted).toBe(true);
        await route.abort();
      } else await route.continue();
    });
    try {
      if (!providersOnly) {
        // Real authored mixed-ingress scenario: the first member's straight ingress crosses a restricted square.
        const geographic = (x, y) => ({
          longitudeDeg:
            103.85 +
            ((x / (6378137 * Math.cos((1.29 * Math.PI) / 180))) * 180) /
              Math.PI,
          latitudeDeg: 1.29 + ((y / 6378137) * 180) / Math.PI,
        });
        const square = (id, type, x, y, size) => ({
          id,
          name: `${type} area`,
          type,
          vertices: [
            [-size, -size],
            [size, -size],
            [size, size],
            [-size, size],
          ].map(([dx, dy]) => {
            const p = geographic(x + dx, y + dy);
            return [p.longitudeDeg, p.latitudeDeg];
          }),
        });
        const name = `D6 critic mixed ingress ${Date.now()}`;
        const units = [0, 500].map((y, i) => ({
          id: `mixed-${i}`,
          label: i ? 'Clear ingress' : 'Blocked ingress',
          category: 'friendly',
          commandRole: 'sentinel',
          profileId: i ? 'hornet-10-v1' : 'sting-v1',
          headingTrueDeg: 90,
          position: {
            ...geographic(0, y),
            altitude: { metres: 180, reference: 'ELLIPSOID', datumId: 'WGS84' },
          },
        }));
        const saved = await page.request.post(`${frontend}/api/scenarios`, {
          data: {
            requestId: globalThis.crypto.randomUUID(),
            expectedRevision: 0,
            content: {
              name,
              units,
              boundaryRuleVersion: 'local-boundary-v1',
              boundaries: [
                square('patrol', 'patrol', 100, 0, 20),
                square('wall', 'restricted', 50, 0, 20),
              ],
            },
          },
        });
        expect(saved.ok()).toBe(true);
        await page.goto(frontend);
        await page
          .getByRole('button', { name: 'Load mission', exact: true })
          .click();
        await page
          .getByRole('menuitem', {
            name: new RegExp(`${name} · r1.*Saved plan`),
          })
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
        await u.tab('Conductor', 'Close view');
        await u.select('Blocked ingress', 'Clear ingress');
        await review();
        const patrol = u.pane.locator('.suggestion-card').filter({
          has: page.getByRole('heading', { name: 'Patrol · 1', exact: true }),
        });
        await patrol.locator('summary').click();
        await expect(patrol).toContainText('Excluded');
        await expect(patrol).toContainText(/ingress/i);
        const reviewed = proposal.options.find((o) => o.id === 'patrol');
        expect(reviewed.action.members).toHaveLength(1);
        expect(reviewed.unchangedReasons).toHaveLength(1);
        expect(reviewed.unchangedReasons[0].disposition).toBe('excluded');
        r.mixed = reviewed;
        await shot('01-specific-blocked-ingress');
        const n = r.commands.length;
        await u.pane
          .getByRole('button', { name: 'Keep current orders', exact: true })
          .click();
        expect(r.commands.length).toBe(n);
        await refresh();
        await u.pane
          .getByRole('button', { name: 'Apply Patrol · 1', exact: true })
          .click();
        await expect(u.pane).toContainText(
          'Command accepted · 1 members accepted',
        );
        expect(r.commands.at(-1).reasons).toEqual(reviewed.unchangedReasons);
        expect(r.commands.at(-1).members).toEqual(
          reviewed.action.members.map((m) => m.entityId),
        );
        await u.action('Pause');
        const mixedWorld = await u.world();
        expect(
          mixedWorld.fleetBehavior.members.filter((m) => m.policy === 'patrol'),
        ).toHaveLength(1);
        check(
          'Personally verified corrected mixed Patrol review: blocked ingress has an explicit excluded reason; one feasible member is applied through ordinary audited command, with unchanged reason preserved. Keep sends nothing.',
        );
        await u.action('End demo');

        await u.scenario({ name: `D6 critic providers ${Date.now()}` });
        await u.action('Pause');
        await u.tab('Conductor', 'Close view');
        await ten();
        const before = r.commands.length,
          streams = r.streams;
        await review();
        expect(proposal.options).toHaveLength(3);
        const subset = proposal.options.find(
          (o) => o.id === 'intercept-subset',
        );
        expect(subset.action.members).toHaveLength(5);
        expect(subset.unchangedReasons).toHaveLength(5);
        expect(
          subset.unchangedReasons.every(
            (x) =>
              x.disposition === 'unchanged' &&
              x.reason.includes('smaller group'),
          ),
        ).toBe(true);
        const card = u.pane.locator('.suggestion-card').nth(1);
        await card.locator('summary').click();
        await expect(card).toContainText('Not in this smaller group');
        await shot('02-deliberate-scope');
        await u.pane
          .getByRole('button', { name: 'Keep current orders', exact: true })
          .click();
        await u.pane
          .getByRole('button', { name: 'Dismiss', exact: true })
          .click();
        await refresh();
        expect(r.commands.length).toBe(before);
        expect(r.streams).toBe(streams);
        const exact = proposal.options
          .find((o) => o.id === 'intercept-subset')
          .action.members.map((m) => m.entityId);
        await u.pane
          .getByRole('button', {
            name: 'Apply Enable for 5 · leave others unchanged',
            exact: true,
          })
          .dblclick();
        await expect(u.pane).toContainText(
          'Command accepted · 5 members accepted',
        );
        expect(r.commands.length).toBe(before + 1);
        expect(r.commands.at(-1).members).toEqual(exact);
        await refresh();
        await expect(
          u.pane.getByRole('heading', { name: 'Use Manual · 5', exact: true }),
        ).toBeVisible();
        await u.pane
          .getByRole('button', { name: 'Apply Stop selected · 5', exact: true })
          .click();
        await expect(u.pane).toContainText('Command accepted');
        expect(
          (await u.world()).fleetBehavior.members.every(
            (m) => m.policy === 'hold',
          ),
        ).toBe(true);
        check(
          '10/5 options distinguish deliberate unchanged group from exclusions; double Apply submits one command for exact five; Stop disarms separately. No-op, dismissal and review create no command or stream.',
        );

        await refresh();
        const refreshButton = u.pane.getByRole('button', {
          name: 'Refresh options',
          exact: true,
        });
        await refreshButton.focus();
        await page.keyboard.press('Enter');
        await expect(refreshButton).toBeFocused();
        r.focus = await refreshButton.evaluate((e) => ({
          style: globalThis.getComputedStyle(e).outlineStyle,
          width: globalThis.getComputedStyle(e).outlineWidth,
        }));
        expect(r.focus.style).toBe('solid');
        r.axe = (
          await new AxeBuilder({ page })
            .include('.decision-suggestions')
            .include('.fleet-suggestions')
            .analyze()
        ).violations.map((v) => ({ id: v.id, impact: v.impact }));
        expect(r.axe).toEqual([]);
        for (const [width, height] of [
          [760, 850],
          [820, 900],
          [900, 950],
          [1920, 1080],
          [2560, 1440],
          [3840, 2160],
        ]) {
          await page.setViewportSize({ width, height });
          await page.waitForTimeout(150);
          const metric = await u.pane.evaluate((e) => ({
            width: e.clientWidth,
            overflow:
              globalThis.document.documentElement.scrollWidth -
              globalThis.innerWidth,
            scroll:
              e.querySelector('.suggestions-body').scrollHeight >
              e.querySelector('.suggestions-body').clientHeight,
          }));
          expect(metric.overflow).toBeLessThanOrEqual(1);
          r.layouts.push({ width, height, ...metric });
          await shot(`layout-${width}`);
        }
        check(
          'Own keyboard/reduced-motion/axe checks passed; six viewport layouts 760 through 3840 px fit without horizontal page overflow.',
        );
        await page.setViewportSize({ width: 2560, height: 1440 });
        await ten();
        await review();
        await page.waitForTimeout(16000);
        await expect(u.pane).toContainText('Out of date');
        await expect(
          u.pane.getByRole('button', { name: /^Apply Enable Intercept/ }),
        ).toBeDisabled();
        await refresh();
        await u.behavior('intercept');
        await expect(u.pane).toContainText('Out of date');
        await u.behavior('hold');
        await page.locator('[data-activity-view="tracks"]').click();
        await page
          .locator('.tracks-browser')
          .getByText('D6 Observer', { exact: true })
          .click();
        await review();
        await expect(u.pane).toContainText('0 available selected');
        await u.pane
          .getByText('Selection and exclusions', { exact: true })
          .click();
        await expect(u.pane).toContainText('Observation only');
        expect(
          await u.pane.getByRole('button', { name: /^Apply / }).count(),
        ).toBe(0);
        await u.select('D6 Friendly 01');
        await review();
        await page.route('**/api/interactive/*/recommendations', (route) =>
          route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Critic advisory outage' }),
          }),
        );
        await refreshButton.click();
        await expect(u.pane).toContainText('Critic advisory outage');
        await expect(
          u.fleet.getByRole('button', { name: 'Apply', exact: true }),
        ).toBeEnabled();
        await page.unroute('**/api/interactive/*/recommendations');
        await refresh();
        check(
          'Expiry and ordinary orders invalidate; observation-only member has no action; advisory failure leaves Fleet controls usable and explicit refresh recovers.',
        );
      } else {
        await u.scenario({ name: `D6 critic focused providers ${Date.now()}` });
        await u.action('Pause');
        await u.tab('Conductor', 'Close view');
        await u.select('D6 Friendly 01');
        await review();
      }

      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      await page
        .getByRole('button', { name: 'Video Feed', exact: true })
        .click();
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      await c
        .getByRole('button', {
          name: 'Place Video Feed beside map',
          exact: true,
        })
        .click();
      await u.tab('Tactical Map', 'New Tactical pane');
      await page
        .locator('[data-view-id="tactical:2"]')
        .getByRole('button', { name: '3D', exact: true })
        .click();
      await expect.poll(async () => (await pool()).active).toBe(3);
      await review();
      await page.waitForTimeout(4000);
      r.google = await inspect();
      r.pool = await pool();
      r.credits = await c.locator('.cesium-widget-credits').innerText();
      expect(r.credits).toContain('Google Maps');
      await expect(c).toContainText('SIMULATED VIEW · no video feed');
      await shot('03-google-map-video-suggestions');
      const camera = await page.evaluate(
        () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
      );
      const anchor = r.google.cockpit.actualPosition;
      await c.locator('summary').click();
      await c.getByRole('slider', { name: 'Video Feed look yaw' }).focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(200);
      expect((await inspect()).cockpit.actualPosition).toEqual(anchor);
      const cameraAfter = await page.evaluate(
        () => globalThis.__sentinelCesiumTest.inspect('tactical:2').camera,
      );
      expect(cameraAfter.center.longitudeDeg).toBeCloseTo(
        camera.center.longitudeDeg,
        7,
      );
      expect(cameraAfter.center.latitudeDeg).toBeCloseTo(
        camera.center.latitudeDeg,
        7,
      );
      expect(cameraAfter.headingTrueDeg).toBeCloseTo(camera.headingTrueDeg, 6);
      await c.getByRole('button', { name: 'Reset view', exact: true }).click();
      const reads = r.reads;
      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      await page.waitForTimeout(1500);
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
      expect(r.reads).toBe(reads);
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
      r.standard = await inspect();
      await shot('04-standard-coexistence');
      await c
        .getByLabel('Video Feed environment', { exact: true })
        .selectOption('photorealistic');
      await expect
        .poll(async () => (await inspect())?.environment.photoVisibleTiles, {
          timeout: 60000,
        })
        .toBeGreaterThan(0);
      check(
        'Personally loaded configured Google tiles and standard Cesium imagery/terrain/buildings in the actual Video Feed beside independent maps and Suggestions; readable associated credits and three renderer leases remain; hidden Suggestions send no reads.',
      );

      // Capture bounded progression. This is sampled evidence, never an FPS estimate.
      await ten();
      await review();
      await u.pane
        .getByRole('button', { name: /^Apply Enable Intercept/ })
        .click();
      await expect(u.pane).toContainText('Command accepted');
      const dynamic = resolve(output, 'dynamic');
      mkdirSync(dynamic, { recursive: true });
      r.motion = [];
      await u.action('Resume');
      for (let i = 0; i < 8; i++) {
        await page.screenshot({
          path: resolve(dynamic, `${String(i).padStart(3, '0')}.png`),
        });
        const w = await u.world();
        r.motion.push({
          tick: w.interactive.tick,
          sequence: w.sequence,
          assignments: w.fleetBehavior.assignments.filter(
            (a) => a.state === 'active',
          ).length,
          nonop: Object.values(w.entities).filter(
            (e) => e.condition === 'non-operational',
          ).length,
        });
        await page.waitForTimeout(350);
      }
      await u.action('Pause');
      const w = await u.world(),
        nonop = Object.values(w.entities).find(
          (e) =>
            e.affiliation === 'friendly' && e.condition === 'non-operational',
        );
      expect(nonop).toBeTruthy();
      await u.select(nonop.label);
      await review();
      await expect(u.pane).toContainText('NON-OP');
      expect(
        await u.pane.getByRole('button', { name: /^Apply / }).count(),
      ).toBe(0);
      await shot('05-nonop');
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
      r.video = video.status === 0;
      if (r.video) rmSync(dynamic, { recursive: true });
      check(
        'Own sampled video captures existing Intercept progression, atomic NON-OP and paused unavailable review; no motion or performance claim inferred from sample count.',
      );
      await u.action('End demo');
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      await page.reload();
      await page
        .getByRole('button', { name: 'Load mission', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Previous demos', exact: true })
        .hover();
      await page
        .getByRole('menuitem', {
          name: providersOnly ? /Demo 001/ : /Demo 002/,
        })
        .click();
      const views = page.getByRole('button', {
        name: 'Show Views list',
        exact: true,
      });
      if (await views.isVisible()) await views.click();
      await page
        .getByRole('button', {
          name: 'Open Suggestions from Views',
          exact: true,
        })
        .click();
      await expect(u.pane).toContainText(
        'Recorded and ended runs are read-only',
      );
      await shot('06-recorded-readonly');
      check(
        'End clears cards; explicitly reopened the previous recorded demo and confirmed Suggestions is read-only.',
      );

      // Recovery uses another bounded own demo and an intentionally dropped response after real commit.
      await u.scenario({
        friendly: 2,
        hostile: 2,
        name: `D6 critic recovery ${Date.now()}`,
      });
      await u.action('Pause');
      await u.tab('Conductor', 'Close view');
      await u.select('D6 Friendly 01', 'D6 Friendly 02');
      await review();
      lost = true;
      const auditedBefore = r.commands.filter((x) => x.audited).length;
      await u.pane
        .getByRole('button', { name: /^Apply Enable Intercept/ })
        .click();
      await expect(u.pane).toContainText('Outcome unknown');
      holdReceipts = true;
      await page.reload();
      await page.getByRole('button', { name: /^Attention:/ }).click();
      await page
        .getByRole('menuitem', { name: 'Retry saved request', exact: true })
        .click();
      await expect
        .poll(() => r.commands.filter((x) => x.audited).length)
        .toBe(auditedBefore + 2);
      const audited = r.commands.filter((x) => x.audited);
      expect(audited.at(-1)).toEqual(audited.at(-2));
      await expect
        .poll(() =>
          page.evaluate(() =>
            globalThis.sessionStorage.getItem(
              'sentinel.interactive.pending.v1',
            ),
          ),
        )
        .toBe(null);
      holdReceipts = false;
      await u.action('Return to active demo');
      await u.select('D6 Friendly 01');
      await review();
      await restartBackend();
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await expect(u.pane.locator('.suggestion-card')).toHaveCount(0, {
        timeout: 30000,
      });
      await u.action('Take control');
      await refresh();
      await expect(u.pane).not.toContainText('Acquire or reclaim');
      await shot('07-restart-recovery');
      await u.action('End demo');
      check(
        'Personally verified lost HTTP response after real commit, reload and exact saved command identity/payload retry; actual sole-backend restart clears epoch-bound cards and resumes only after explicit control acquisition.',
      );
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 2200);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      r.sourceAfter = hashes();
      r.sourceUnchanged =
        JSON.stringify(r.sourceBefore) === JSON.stringify(r.sourceAfter);
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(
        JSON.stringify({
          passed: r.passed,
          cases: r.cases.length,
          failure: r.failure,
          errors: r.errors,
          sourceUnchanged: r.sourceUnchanged,
        }),
      );
    }
  },
);
