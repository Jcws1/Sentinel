import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  { tag: 'acceptance', frontendPort: 5320, backendPort: 8120 },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const report = { cases: [], posts: [], streams: 0, errors: [] };
    let socket,
      blocked = false;
    const check = (name) => report.cases.push(name);
    page.on('pageerror', (e) => report.errors.push(e.name));
    page.on('request', (r) => {
      const url = new globalThis.URL(r.url());
      if (r.method() === 'POST' && url.pathname.startsWith('/api/'))
        report.posts.push(url.pathname);
    });
    await page.routeWebSocket('**/api/missions/*/stream', (r) => {
      report.streams++;
      if (blocked) r.close();
      else {
        socket = r;
        r.connectToServer();
      }
    });
    const cockpit = () => page.locator('.cockpit-pane');
    const inspect = () =>
      page.evaluate(() => globalThis.__sentinelCesiumTest?.inspect('cockpit'));
    const pool = () =>
      page.evaluate(() => globalThis.__sentinelRendererPoolTest?.inspect());
    const world = async (mid) => {
      mid ??= (
        await (
          await page.request.get(`${frontend}/api/interactive/entry`)
        ).json()
      ).activeMissionId;
      return (
        await page.request.get(
          `${frontend}/api/missions/${encodeURIComponent(mid)}/world`,
        )
      ).json();
    };
    const action = async (name) => {
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const tab = async (name, actionName) => {
      await page
        .getByRole('tab', { name, exact: true })
        .click({ button: 'right' });
      await page
        .getByRole('menuitem', { name: actionName, exact: true })
        .click();
    };
    const select = async (label) => {
      const f = page.locator('[data-activity-view="fleet"]');
      if ((await f.getAttribute('aria-expanded')) !== 'true') await f.click();
      const clear = page.getByRole('button', {
        name: 'Clear selection',
        exact: true,
      });
      if (await clear.isVisible()) await clear.click();
      for (const c of await page
        .locator('.fleet-sidebar input[type="checkbox"]:checked')
        .all())
        await c.uncheck();
      await page
        .locator('.fleet-sidebar')
        .getByRole('checkbox', { name: `Select ${label}`, exact: true })
        .check();
    };
    const open = async () => {
      await page
        .getByRole('button', { name: 'Simulated cockpit', exact: true })
        .click();
    };
    const ready = async () =>
      expect
        .poll(async () => (await inspect())?.ready, { timeout: 30000 })
        .toBe(true);
    const shot = async (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    const pick = async (suffix) => {
      const point = () =>
        page.evaluate(
          (s) =>
            globalThis.__sentinelMapTest
              .inspect('tactical')
              ?.points.find((p) => p.id.endsWith(s)),
          suffix,
        );
      const canvas = page.locator('[data-view-id="tactical"] canvas').first();
      await page
        .locator('[data-view-id="tactical"]')
        .getByRole('button', { name: 'Map layers', exact: true })
        .click();
      await page
        .getByRole('menuitem', { name: 'Overview', exact: true })
        .click();
      await expect.poll(async () => !!(await point())).toBe(true);
      const p = await point();
      await canvas.click({ position: { x: p.x, y: p.y } });
    };
    const behavior = async (value) => {
      const f = page.locator('.fleet-sidebar');
      await f.getByLabel('Behavior', { exact: true }).selectOption(value);
      const r = page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().endsWith('/commands'),
      );
      await f.getByRole('button', { name: 'Apply', exact: true }).click();
      expect((await (await r).json()).accepted).toBe(true);
    };
    try {
      // Create a Ready run using its public API; every cockpit and operator action is actual UI.
      const created = await page.request.post(
        `${frontend}/api/interactive/runs`,
        {
          data: {
            creationId: globalThis.crypto.randomUUID(),
            templateId: 'singapore-local-v2',
          },
        },
      );
      expect(created.ok()).toBe(true);
      await page.goto(frontend);
      await action('Return to active demo');
      await page.locator('[data-run-state="ready"]').first().waitFor();
      await select('F-01');
      const initial = await world(),
        before = report.posts.length,
        streams = report.streams;
      await open();
      await ready();
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Ready · initial viewpoint',
      );
      const binding = JSON.parse(await cockpit().getAttribute('data-binding'));
      const control = initial.interactive.controls.find(
        (c) => c.entityId === binding[3],
      );
      expect(binding[4]).toBe(control.controlTrackId);
      expect(report.posts.length).toBe(before);
      expect(report.streams).toBe(streams);
      expect((await world()).interactive.state).toBe('ready');
      check(
        'Ready pose, exact control Track, no acquire/start/commands/extra stream from opening',
      );
      await shot('01-ready');
      await page
        .getByRole('button', { name: 'Place cockpit beside map' })
        .click();
      await select('F-02');
      expect(JSON.parse(await cockpit().getAttribute('data-binding'))[3]).toBe(
        binding[3],
      );
      await cockpit()
        .getByRole('checkbox', { name: /Follow selection/ })
        .check();
      await expect
        .poll(
          async () =>
            JSON.parse(await cockpit().getAttribute('data-binding'))[3],
        )
        .not.toBe(binding[3]);
      await page
        .locator('.fleet-sidebar')
        .getByRole('checkbox', { name: 'Select F-01', exact: true })
        .check();
      expect(
        JSON.parse(await cockpit().getAttribute('data-binding'))[3],
      ).toMatch(/F-02$/);
      await pick(':O-01');
      await expect(cockpit()).toContainText('Cannot follow selection');
      expect(
        JSON.parse(await cockpit().getAttribute('data-binding'))[3],
      ).toMatch(/F-02$/);
      await cockpit()
        .getByRole('checkbox', { name: /Follow selection/ })
        .uncheck();
      check(
        'Pinned selection, follow primary, mixed group primary, hostile cannot-follow retains explicit subject',
      );
      await select('F-03');
      await open();
      await expect(cockpit()).toHaveAttribute('data-state', 'View unavailable');
      check('Missing position unavailable');
      await select('F-04');
      await open();
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Stale · frozen viewpoint',
      );
      check('Stale separately disclosed');
      await pick(':F-05');
      await open();
      await ready();
      await expect(cockpit()).toContainText('Displayed observation Track');
      expect(
        (await world()).interactive.controls.some((c) =>
          c.entityId.endsWith(':F-05'),
        ),
      ).toBe(false);
      check('Observation-only simulated friendly without acquiring control');
      await select('F-01');
      await open();
      await ready();
      await action('Start demo');
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Running · simulated viewpoint',
      );
      const initialCanvas = page
        .locator('[data-view-id="tactical"] canvas')
        .first();
      const initialBox = await initialCanvas.boundingBox();
      const initialMove = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/direct-moves'),
      );
      await initialCanvas.click({
        button: 'right',
        position: { x: initialBox.width * 0.6, y: initialBox.height * 0.4 },
      });
      expect((await (await initialMove).json()).accepted).toBe(true);
      const moving = (await inspect()).cockpit.position;
      await page.waitForTimeout(1200);
      expect((await inspect()).cockpit.position).not.toEqual(moving);
      await action('Pause');
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Paused · frozen viewpoint',
      );
      const frozen = (await inspect()).cockpit.actualPosition;
      await page.waitForTimeout(1200);
      expect((await inspect()).cockpit.actualPosition).toEqual(frozen);
      check('Running pose changes; Pause freezes camera');
      await cockpit()
        .getByText('View controls and pose', { exact: true })
        .click();
      await cockpit().getByRole('slider', { name: 'Cockpit look yaw' }).focus();
      await page.keyboard.press('End');
      await cockpit()
        .getByRole('slider', { name: 'Cockpit look pitch' })
        .focus();
      await page.keyboard.press('Home');
      expect((await inspect()).cockpit.actualPosition).toEqual(frozen);
      await cockpit().getByRole('button', { name: 'Reset view' }).click();
      check('Keyboard bounded look-around/reset preserves anchor');
      await cockpit()
        .getByText('View controls and pose', { exact: true })
        .click();
      blocked = true;
      socket.close();
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Disconnected · frozen viewpoint',
      );
      await page.waitForTimeout(700);
      expect((await inspect()).cockpit.actualPosition).toEqual(frozen);
      blocked = false;
      await page.getByRole('button', { name: 'Retry', exact: true }).click();
      await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Paused · frozen viewpoint',
      );
      check('Disconnection frozen with age and valid reconnection');
      await action('Resume');
      await page.locator('[data-run-state="running"]').first().waitFor();
      await page
        .getByRole('button', { name: 'Stop selected', exact: true })
        .first()
        .click();
      await page.waitForTimeout(500);
      const stopped = (await inspect()).cockpit.position;
      await page.waitForTimeout(800);
      expect((await inspect()).cockpit.position).toEqual(stopped);
      check('Stop commits stationary viewpoint');
      await behavior('hold');
      const canvas = page.locator('[data-view-id="tactical"] canvas').first(),
        box = await canvas.boundingBox();
      const move = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' && r.url().endsWith('/direct-moves'),
      );
      await canvas.click({
        button: 'right',
        position: { x: box.width * 0.65, y: box.height * 0.55 },
      });
      expect((await (await move).json()).accepted).toBe(true);
      await page.waitForTimeout(1200);
      expect((await inspect()).cockpit.position).not.toEqual(stopped);
      check('Manual movement viewed through cockpit');
      await action('Pause');
      for (const [width, height] of [
        [760, 800],
        [820, 900],
        [900, 900],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(200);
        expect(
          await page.evaluate(
            () =>
              globalThis.document.documentElement.scrollWidth <=
              globalThis.innerWidth,
          ),
        ).toBe(true);
        expect(
          await cockpit().evaluate((e) => e.scrollWidth <= e.clientWidth),
        ).toBe(true);
        await cockpit()
          .locator('.cockpit-body')
          .evaluate((e) => {
            e.scrollTop = e.scrollHeight;
          });
        await expect(
          cockpit().getByText('SIMULATED VIEW · no video feed', {
            exact: true,
          }),
        ).toBeInViewport();
        await expect(cockpit().locator('.cockpit-subject')).toBeInViewport();
        await expect(cockpit().locator('.cockpit-state')).toBeInViewport();
        await shot(`layout-${width}`);
      }
      report.accessibility = (
        await new AxeBuilder({ page }).include('.cockpit-pane').analyze()
      ).violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        count: v.nodes.length,
      }));
      expect(
        report.accessibility.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        ),
      ).toEqual([]);
      check(
        '760/820/900/desktop/1440p/4K no overflow; cockpit axe serious/critical clear',
      );
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.evaluate(() =>
        globalThis.__sentinelCesiumTest.failRenderer('cockpit', 'context-lost'),
      );
      await expect(cockpit()).toContainText('Renderer unavailable');
      await cockpit()
        .getByRole('button', { name: 'Restart cockpit renderer' })
        .click();
      await ready();
      check('Context failure and explicit renderer restart');
      await action('End demo');
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Ended · frozen simulated viewpoint',
      );
      const mid = initial.mission.id;
      report.ended = await world(mid);
      await shot('ended');
      await tab('Simulated cockpit', 'Close view');
      expect((await pool()).leases.some((l) => l.role === 'cockpit')).toBe(
        false,
      );
      await select('F-01');
      await open();
      await ready();
      await expect(cockpit()).toHaveAttribute(
        'data-state',
        'Ended · frozen simulated viewpoint',
      );
      check(
        'End preserves recorded pose; close disposes; reopen inspects saved ended pose',
      );
      await action('New demo');
      await expect(cockpit()).toHaveAttribute('data-state', 'View unavailable');
      await expect(cockpit()).toContainText('Context changed');
      expect(await cockpit().getAttribute('data-binding')).toBe(null);
      check('New mission clears prior subject and follow');
      await action('End demo');
      report.passed = true;
    } catch (e) {
      report.failure = {
        name: e.name,
        message: e.message
          .replace(/https?:\/\/[^\s]+/g, '[URL removed]')
          .slice(0, 1500),
      };
      await shot('failure').catch(() => {});
      report.final = await inspect().catch(() => undefined);
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
          cases: report.cases,
          errors: report.errors,
          failure: report.failure,
          passed: report.passed,
        }),
      );
    }
  },
);
