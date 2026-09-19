// Final-source matched advisory cost without variable remote tile loading.
import { chromium, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';
import { d6UI } from './d6-support.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: 'performance-final',
    frontendPort: 5363,
    backendPort: 8163,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage(),
      u = d6UI(page, frontend);
    const r = {
      errors: [],
      samples: [],
      generationMs: [],
      commands: [],
      streams: 0,
      requests: {},
    };
    let phase = 'setup';
    page.on('pageerror', (e) => r.errors.push(e.name));
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) r.streams++;
    });
    page.on('request', (req) => {
      const url = new globalThis.URL(req.url());
      const kind =
        url.hostname !== '127.0.0.1'
          ? 'external'
          : url.pathname.endsWith('/recommendations')
            ? 'suggestions'
            : url.pathname.startsWith('/api/')
              ? 'API'
              : 'assets';
      r.requests[`${phase} ${kind}`] =
        (r.requests[`${phase} ${kind}`] ?? 0) + 1;
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const metrics = async () =>
      Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map((m) => [
          m.name,
          m.value,
        ]),
      );
    const generated = async () => {
      const start = globalThis.performance.now();
      const response = page.waitForResponse((res) =>
        res.url().endsWith('/recommendations'),
      );
      await u.refresh();
      expect((await response).ok()).toBe(true);
      r.generationMs.push(globalThis.performance.now() - start);
    };
    try {
      await u.scenario({ friendly: 10, hostile: 0, patrol: true });
      await u.select(
        ...Array.from(
          { length: 10 },
          (_, i) => `D6 Friendly ${String(i + 1).padStart(2, '0')}`,
        ),
      );
      await u.behavior('patrol');
      const openingStart = globalThis.performance.now();
      await u.review();
      r.openingMs = globalThis.performance.now() - openingStart;
      await page.waitForTimeout(2000);
      for (const [label, on] of [
        ['off-1', false],
        ['on-1', true],
        ['on-2', true],
        ['off-2', false],
      ]) {
        await page
          .getByRole('tab', {
            name: on ? 'Suggestions' : 'Details',
            exact: true,
          })
          .click();
        if (on) await generated();
        await page.waitForTimeout(300);
        phase = label;
        const before = await metrics();
        const pacing = await page.evaluate(async () => {
          const begin = globalThis.performance.now(),
            times = [];
          await new Promise((done) => {
            const frame = (t) => {
              times.push(t);
              if (t - begin < 4000) globalThis.requestAnimationFrame(frame);
              else done();
            };
            globalThis.requestAnimationFrame(frame);
          });
          const intervals = times
            .slice(1)
            .map((t, i) => t - times[i])
            .sort((a, b) => a - b);
          return {
            durationMs: globalThis.performance.now() - begin,
            callbacks: times.length,
            medianMs: intervals[Math.floor(intervals.length * 0.5)],
            p95Ms: intervals[Math.floor(intervals.length * 0.95)],
            maxMs: Math.max(...intervals),
          };
        });
        const after = await metrics();
        const pool = await page.evaluate(() =>
          globalThis.__sentinelRendererPoolTest.inspect(),
        );
        r.samples.push({
          label,
          pacing,
          taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
          layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
          heapBefore: before.JSHeapUsedSize,
          heapAfter: after.JSHeapUsedSize,
          leases: pool.leases.length,
        });
        phase = 'between';
        const reply = page.waitForResponse(
          (res) =>
            res.url().endsWith('/commands') &&
            res.request().postDataJSON()?.intent?.action === 'stop',
        );
        const start = globalThis.performance.now();
        if (on)
          await u.pane
            .getByRole('button', { name: /^Apply Stop selected/ })
            .click();
        else
          await u.fleet
            .getByRole('button', { name: 'Stop selected', exact: true })
            .click();
        expect((await (await reply).json()).accepted).toBe(true);
        r.commands.push({
          advisory: on,
          ms: globalThis.performance.now() - start,
        });
        await u.behavior('patrol');
      }
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
      await generated();
      await cdp.send('HeapProfiler.collectGarbage');
      const before = await metrics();
      for (let i = 0; i < 12; i++) await generated();
      await cdp.send('HeapProfiler.collectGarbage');
      const after = await metrics();
      r.resourceCycle = {
        heapBefore: before.JSHeapUsedSize,
        heapAfter: after.JSHeapUsedSize,
        nodesBefore: before.Nodes,
        nodesAfter: after.Nodes,
      };
      await page.getByRole('tab', { name: 'Details', exact: true }).click();
      phase = 'hidden';
      await page.waitForTimeout(2500);
      expect(r.requests['hidden suggestions'] ?? 0).toBe(0);
      phase = 'end';
      await u.action('Pause');
      await page.getByRole('tab', { name: 'Suggestions', exact: true }).click();
      await generated();
      await page.screenshot({
        path: resolve(output, 'final-measured-state.png'),
      });
      await u.action('End demo');
      expect(r.streams).toBe(1);
      expect(r.errors).toEqual([]);
      r.passed = true;
    } catch (e) {
      r.failure = String(e)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 1600);
      process.exitCode = 1;
    } finally {
      await context.close();
      await browser.close();
      writeFileSync(resolve(output, 'result.json'), JSON.stringify(r, null, 2));
      globalThis.console.log(JSON.stringify(r));
    }
  },
);
