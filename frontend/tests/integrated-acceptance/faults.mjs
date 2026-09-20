/* global document */
// Foreground faults inside the sole task-owned writer. Normal app has no probe routes.
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve, delimiter } from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { withIsolatedRuntime } from '../support/isolated-runtime.mjs';
import { operatorUI } from '../support/operator-ui.mjs';
import { loadPerformanceScenario } from '../performance/support.mjs';

process.env.SENTINEL_INTEGRATION_PROBE = '1';
process.env.PYTHONPATH = [
  resolve('../backend/tests'),
  resolve('../backend'),
].join(delimiter);
await withIsolatedRuntime(
  {
    tag: process.argv[2] ?? 'd7-faults',
    frontendPort: 5401,
    backendPort: 8201,
    backendModule: 'integrated_runtime:app',
    evidenceRoot: 'test-results/integrated-acceptance',
    previewDir: 'dist-verification-integrated-acceptance',
  },
  async ({ frontend, apiTarget, output }) => {
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
    const r = {
      cases: [],
      errors: [],
      requests: [],
      lifecycleReceipts: [],
      browser: browser.version(),
    };
    let holdReceipts = false,
      loseStop = false;
    const mark = (message) => {
      r.cases.push(message);
      globalThis.console.log(message);
    };
    const probe = async (path, data) =>
      expect(
        (
          await page.request.post(`${apiTarget}/__verification/${path}`, {
            data,
          })
        ).ok(),
      ).toBe(true);
    const pending = () =>
      page.evaluate(() =>
        globalThis.sessionStorage.getItem('sentinel.interactive.pending.v1'),
      );
    const shot = (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    const retry = async () => {
      await page.locator('.attention-trigger').click();
      await page
        .getByRole('menuitem', { name: 'Retry saved request', exact: true })
        .click();
      await expect.poll(pending).toBe(null);
    };
    const policies = (world) =>
      world.fleetBehavior.members.map((m) => [m.entityId, m.policy]);
    const positions = (world) =>
      Object.fromEntries(
        Object.values(world.tracks).map((t) => [t.entityId, t.latest.position]),
      );
    const committedAction = async (label, operation) => {
      const response = page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          res.url().endsWith('/commands') &&
          res.request().postDataJSON()?.intent?.action === operation,
      );
      await u.action(label);
      const reply = await response;
      expect(reply.ok()).toBe(true);
      const receipt = await reply.json();
      expect(receipt.accepted).toBe(true);
      expect(receipt.operation).toBe(operation);
      r.lifecycleReceipts.push({
        operation,
        requestId: receipt.requestId,
        sequence: receipt.sequence,
      });
    };
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().endsWith('/commands')) {
        const b = req.postDataJSON();
        if (['behavior', 'stop'].includes(b.intent?.action))
          r.requests.push({
            action: b.intent.action,
            id: b.commandId,
            hash: createHash('sha256').update(req.postData()).digest('hex'),
          });
      }
    });
    await page.route('**/api/interactive/*/receipts?**', (route) =>
      holdReceipts ? route.abort() : route.continue(),
    );
    await page.route('**/api/interactive/*/commands', async (route) => {
      if (
        loseStop &&
        route.request().postDataJSON()?.intent?.action === 'stop'
      ) {
        loseStop = false;
        expect((await (await route.fetch()).json()).accepted).toBe(true);
        await route.abort();
      } else await route.continue();
    });
    await page.addInitScript(() => {
      globalThis.__d7Transport = {
        opened: 0,
        closed: 0,
        frames: 0,
        heartbeats: 0,
      };
      const Original = globalThis.WebSocket;
      globalThis.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener(
            'open',
            () => globalThis.__d7Transport.opened++,
          );
          this.addEventListener(
            'close',
            () => globalThis.__d7Transport.closed++,
          );
          this.addEventListener('message', (e) => {
            if (JSON.parse(e.data).type === 'heartbeat')
              globalThis.__d7Transport.heartbeats++;
            else globalThis.__d7Transport.frames++;
          });
        }
      };
    });
    try {
      await loadPerformanceScenario(page, frontend, 10);
      await page.bringToFront();
      await committedAction('Pause', 'pause');
      await u.select('Friendly 01', 'Friendly 02');
      const before = await u.world();
      expect(before.interactive.state).toBe('paused');
      expect(before.fleetBehavior.ruleVersion).toBe('local-fleet-v2');
      // A real failure at receipt persistence rolls back the same transaction that
      // would publish the changed policy; the loop/clock is otherwise untouched.
      holdReceipts = true;
      await probe('receipt-fault', { operation: 'behavior' });
      await u.fleet
        .getByLabel('Behavior', { exact: true })
        .selectOption('intercept');
      const failed = page.waitForResponse(
        (res) =>
          res.request().postDataJSON?.()?.intent?.action === 'behavior' &&
          res.url().endsWith('/commands'),
      );
      await u.fleet.getByRole('button', { name: 'Apply', exact: true }).click();
      expect((await failed).status()).toBe(503);
      await expect.poll(pending).not.toBe(null);
      const rolledBack = await u.world();
      expect(policies(rolledBack)).toEqual(policies(before));
      expect(positions(rolledBack)).toEqual(positions(before));
      expect(rolledBack.fleetBehavior.outcomes).toEqual(
        before.fleetBehavior.outcomes,
      );
      await shot('01-rollback-no-authoritative-policy');
      const savedPending = await pending();
      await page.reload();
      await expect.poll(pending).toBe(savedPending);
      await retry();
      expect(r.requests.filter((q) => q.action === 'behavior')).toHaveLength(2);
      expect(r.requests[0]).toEqual(r.requests[1]);
      const committed = await u.world();
      expect(
        committed.fleetBehavior.members.filter((m) => m.policy === 'intercept'),
      ).toHaveLength(2);
      mark(
        'Receipt-write rollback preserves world/policies/positions; reload and exact body+identity retry commit once',
      );
      holdReceipts = false;
      await u.action('Return to active demo');
      await u.select('Friendly 01', 'Friendly 02');
      loseStop = true;
      holdReceipts = true;
      await u.fleet
        .getByRole('button', { name: 'Stop selected', exact: true })
        .click();
      await expect.poll(pending).not.toBe(null);
      const stopped = await u.world();
      expect(
        stopped.fleetBehavior.members.filter((m) => m.policy === 'intercept'),
      ).toHaveLength(0);
      const stopPending = await pending();
      await page.reload();
      await expect.poll(pending).toBe(stopPending);
      await retry();
      const stops = r.requests.filter((q) => q.action === 'stop');
      expect(stops).toHaveLength(2);
      expect(stops[0]).toEqual(stops[1]);
      holdReceipts = false;
      const mid = stopped.mission.id;
      const events = (
        await (
          await page.request.get(
            `${frontend}/api/missions/${mid}/events?limit=500`,
          )
        ).json()
      ).events;
      r.commandEvents = events.filter((e) =>
        ['interactive.behavior', 'interactive.stop'].includes(e.type),
      );
      expect(
        r.commandEvents.filter((e) => e.type === 'interactive.stop'),
      ).toHaveLength(1);
      mark(
        'Lost committed Stop response survives reload and exact retry with one persisted Stop event',
      );
      await u.action('Return to active demo');
      await committedAction('Resume', 'resume');
      const moving = await u.world();
      expect(moving.interactive.state).toBe('running');
      await expect
        .poll(async () => (await u.world()).interactive.tick)
        .toBeGreaterThan(moving.interactive.tick + 3);
      await probe('source', { stalled: true });
      const frozen = await u.world();
      const transportBefore = await page.evaluate(() => ({
        ...globalThis.__d7Transport,
      }));
      await expect(page.locator('.attention-trigger')).toContainText(
        'Source report delayed',
      );
      await expect
        .poll(() => page.evaluate(() => globalThis.__d7Transport.heartbeats))
        .toBeGreaterThan(transportBefore.heartbeats + 2);
      const sourceAfter = await u.world();
      expect(sourceAfter.interactive.tick).toBe(frozen.interactive.tick);
      expect(positions(sourceAfter)).toEqual(positions(frozen));
      const transportAfter = await page.evaluate(() => ({
        ...globalThis.__d7Transport,
      }));
      expect(transportAfter.opened).toBe(transportBefore.opened);
      expect(transportAfter.closed).toBe(transportBefore.closed);
      await u.select('Friendly 01');
      expect(
        await u.fleet
          .getByRole('button', { name: 'Move', exact: true })
          .isDisabled(),
      ).toBe(true);
      await expect(
        u.fleet.getByRole('button', { name: 'Stop selected', exact: true }),
      ).toBeEnabled();
      await u.fleet.locator('.fleet-suggestions summary').click();
      await expect(
        u.fleet.getByRole('button', { name: 'Review options', exact: true }),
      ).toBeDisabled();
      r.sourceStall = {
        transportBefore,
        transportAfter,
        tick: frozen.interactive.tick,
      };
      await shot('02-connected-source-stall');
      await probe('source', { stalled: false });
      await expect
        .poll(async () => (await u.world()).interactive.tick)
        .toBeGreaterThan(frozen.interactive.tick + 3);
      await expect(
        page.getByRole('button', { name: /^Source report delayed:/ }),
      ).toHaveCount(0);
      mark(
        'Connected transport sends heartbeats while source freezes: delayed notice, frozen positions, movement/Suggestions disabled, nonpositional Stop retained, recovery without reconnect',
      );
      await committedAction('Pause', 'pause');
      const paused = await u.world(),
        pauseStart = Date.now();
      expect(paused.interactive.state).toBe('paused');
      // The 30s lease boundary is the condition under test, not a race-hiding sleep.
      while (Date.now() - pauseStart < 31500) await page.waitForTimeout(500);
      const longPause = await u.world();
      expect(longPause.interactive.state).toBe('paused');
      expect(longPause.interactive.tick).toBe(paused.interactive.tick);
      expect(longPause.effectiveAt).toBe(paused.effectiveAt);
      expect(longPause.interactive.lease.revision).toBeGreaterThan(
        paused.interactive.lease.revision,
      );
      r.longPause = {
        elapsedMs: Date.now() - pauseStart,
        tickBefore: paused.interactive.tick,
        tickAfter: longPause.interactive.tick,
        effectiveAtBefore: paused.effectiveAt,
        effectiveAtAfter: longPause.effectiveAt,
        leaseBefore: paused.interactive.lease.revision,
        leaseAfter: longPause.interactive.lease.revision,
      };
      expect(await page.evaluate(() => document.visibilityState)).toBe(
        'visible',
      );
      mark(
        'Foreground Pause >31.5 seconds retains simulation time while existing lease renews',
      );
      await committedAction('End demo', 'end');
      const ended = await u.world(mid);
      expect(ended.interactive.state).toBe('ended');
      await page.reload();
      expect((await u.world(mid)).interactive.state).toBe('ended');
      expect((await u.world(mid)).fleetBehavior).toEqual(ended.fleetBehavior);
      await shot('03-ended-reload');
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 2000);
      await shot('failure').catch(() => {});
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
