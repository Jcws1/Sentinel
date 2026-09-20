import { openAuthoringTab } from './authoringActions';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { rtsOrigin, readWorld, endDemo, fleetSelect } from './rtsActions';
import { closeTab } from './actions';
import type { ScenarioContent } from '../../src/contracts/generated';
const evidence = resolve('test-results/browser/evidence');
const units = (p: Page) => p.locator('[data-view="orchestrator"]');
const conductor = (p: Page) => p.locator('[data-view="orchestrator"]');
const map = (p: Page) => p.locator('.tactical-view[data-view-id="tactical"]');
const fleet = (p: Page) => p.locator('.fleet-sidebar');
type Probe = {
  ready: boolean;
  points: { id: string; x: number; y: number; unavailable?: string }[];
  destinations: { id: string }[];
  scriptIntents?: number;
  retainedScriptIntents?: number;
  renderer?: { renderedFrames: number };
  environment?: { renderedFrames: number };
  renderedPoints?: { id: string; coordinates: number[] }[];
};
async function inspect(page: Page, threeD = false): Promise<Probe> {
  return page.evaluate((threeD) => {
    const w = window as unknown as {
      __sentinelMapTest: { inspect(id: string): Probe };
      __sentinelCesiumTest: { inspect(id: string): Probe };
    };
    return (threeD ? w.__sentinelCesiumTest : w.__sentinelMapTest)?.inspect(
      'tactical',
    );
  }, threeD);
}
async function projection(page: Page, threeD = false) {
  await map(page)
    .getByRole('button', { name: threeD ? '3D' : 'Tactical', exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page, threeD))?.points?.length, {
      timeout: 25000,
    })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => (await inspect(page, threeD))?.ready, { timeout: 25000 })
    .toBe(true);
}
async function noScript(page: Page, threeD = false) {
  await expect
    .poll(
      async () =>
        (await inspect(page, threeD))?.destinations?.filter((d) =>
          d.id.startsWith('script:'),
        ).length,
    )
    .toBe(0);
  expect(
    (await inspect(page, threeD)).scriptIntents ??
      (await inspect(page, threeD)).retainedScriptIntents ??
      0,
  ).toBe(0);
}
async function stance(page: Page, value: string) {
  await fleet(page).getByLabel('Behavior', { exact: true }).selectOption(value);
  const result = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/commands'),
  );
  await fleet(page).getByRole('button', { name: 'Apply', exact: true }).click();
  expect((await (await result).json()).accepted).toBe(true);
}
async function groundMove(page: Page, threeD = false) {
  if (threeD) {
    // A fixed fraction near the top of an oblique regional camera can pick
    // kilometres beyond the scenario. Frame a known supported destination;
    // the real canvas click must still pass normal ground picking/validation.
    await page.evaluate(() => {
      (
        window as unknown as {
          __sentinelCesiumTest: { setCamera(id: string, value: unknown): void };
        }
      ).__sentinelCesiumTest.setCamera('tactical', {
        center: { longitudeDeg: 103.86, latitudeDeg: 1.29 },
        groundSpanM: 1500,
        headingTrueDeg: 0,
        pitchFromNadirDeg: 35,
        focusHeightM: 0,
        projection: 'three-d',
      });
    });
  }
  const canvas = map(page).locator('canvas').first(),
    box = (await canvas.boundingBox())!;
  const before = await inspect(page, threeD);
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/direct-moves'),
  );
  const started = Date.now();
  await canvas.click({
    button: 'right',
    position: {
      x: box.width * (threeD ? 0.5 : 0.72),
      y: box.height * (threeD ? 0.5 : 0.38),
    },
  });
  const reply = await response;
  const receipt = await reply.json();
  await test.info().attach(`ground-pick-${threeD ? '3d' : 'tactical'}`, {
    body: JSON.stringify({
      box,
      before,
      after: await inspect(page, threeD),
      request: reply.request().postDataJSON(),
      receipt,
    }),
    contentType: 'application/json',
  });
  expect(receipt.accepted, receipt.message).toBe(true);
  return { receipt, latencyMs: Date.now() - started };
}
async function place(
  page: Page,
  category: 'friendly' | 'hostile' | 'unknown',
  label: string | undefined,
  lon: number,
  lat: number,
) {
  const card = units(page)
    .locator('.units-palette')
    .getByRole('button', {
      name: new RegExp(
        `^${category === 'friendly' ? 'Friendly' : category === 'hostile' ? 'Hostile' : 'Unknown entity'}`,
      ),
    });
  if (
    category === 'unknown' ||
    (await card.getAttribute('aria-expanded')) !== 'true'
  )
    await card.click();
  if (label)
    await units(page)
      .getByLabel(`${category} unit types`)
      .getByRole('button', { name: new RegExp(`^${label}`) })
      .click();
  await units(page).locator('.units-numeric summary').click();
  await units(page)
    .getByLabel('Placement longitude', { exact: true })
    .fill(String(lon));
  await units(page)
    .getByLabel('Placement latitude', { exact: true })
    .fill(String(lat));
  await units(page)
    .getByRole('button', { name: 'Place at coordinates', exact: true })
    .click();
}
async function loadValidateRun(page: Page, name: string) {
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  await conductor(page)
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(
    conductor(page).getByLabel('Scenario validation review', { exact: true }),
  ).toContainText('Ready to run');
  await conductor(page)
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 15000 },
  );
}
async function sampleAnimation(page: Page, threeD = false) {
  return page.evaluate(async (threeD) => {
    const w = window as unknown as {
      __sentinelMapTest: { inspect(id: string): Probe };
      __sentinelCesiumTest: { inspect(id: string): Probe };
    };
    const probe = () =>
      (threeD ? w.__sentinelCesiumTest : w.__sentinelMapTest).inspect(
        'tactical',
      );
    const samples: { t: number; x: number; y: number }[] = [];
    const begun = performance.now();
    const renderCount = () =>
      probe().renderer?.renderedFrames ??
      probe().environment?.renderedFrames ??
      0;
    const firstRender = renderCount();
    const renderedPositions = new Set<string>();
    await new Promise<void>((done) => {
      const step = (t: number) => {
        const state = probe();
        const p = state.points.find((p) => p.id.endsWith(':friendly-0'));
        if (p) samples.push({ t, x: p.x, y: p.y });
        const actual = state.renderedPoints?.find((p) =>
          p.id.endsWith(':friendly-0'),
        );
        if (actual) renderedPositions.add(JSON.stringify(actual.coordinates));
        if (t - begun < 1600) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    const intervals = samples
      .slice(1)
      .map((p, i) => p.t - samples[i].t)
      .sort((a, b) => a - b);
    return {
      samples,
      frames: samples.length,
      p95FrameMs: intervals[Math.floor(intervals.length * 0.95)],
      changedPoses: samples
        .slice(1)
        .filter(
          (p, i) =>
            Math.abs(p.x - samples[i].x) + Math.abs(p.y - samples[i].y) >
            0.0001,
        ).length,
      rendererFrames: renderCount() - firstRender,
      renderedPositions: threeD ? null : renderedPositions.size,
    };
  }, threeD);
}
async function sampleSource(page: Page) {
  const samples: {
    tick: number;
    recordedAt: string;
    receivedAt: number;
    roundTripMs: number;
  }[] = [];
  const until = Date.now() + 12000;
  while (samples.length < 30 && Date.now() < until) {
    const start = performance.now(),
      world = await readWorld(page);
    if (samples.at(-1)?.tick !== world.interactive!.tick)
      samples.push({
        tick: world.interactive!.tick,
        recordedAt: world.recordedAt,
        receivedAt: Date.now(),
        roundTripMs: performance.now() - start,
      });
    await page.waitForTimeout(50);
  }
  return samples;
}
function arrangement(count: number, hostiles: number): ScenarioContent {
  const result: ScenarioContent = {
    name: `Refinement ${count}v${hostiles} ${Date.now()}`,
    units: [],
  };
  for (const [category, n, lon] of [
    ['friendly', count, 103.85],
    ['hostile', hostiles, 103.8555],
  ] as const)
    for (let i = 0; i < n; i++)
      result.units.push({
        id: `${category}-${i}`,
        label: `${category === 'friendly' ? 'Friendly' : 'Hostile'} ${i + 1}`,
        category,
        commandRole: category === 'friendly' ? 'sentinel' : 'observation',
        profileId: category === 'friendly' ? 'sting-v1' : 'hornet-10-v1',
        headingTrueDeg: 0,
        position: {
          longitudeDeg: lon,
          latitudeDeg: 1.29 + i * 0.0005,
          altitude: { metres: 150, reference: 'ELLIPSOID', datumId: 'WGS84' },
        },
      });
  return result;
}
test.beforeAll(() => mkdir(evidence, { recursive: true }).then(() => {}));
test.use({ actionTimeout: 15000 });

test('typed authoring, exact saved revision, authored hostile movement and authoring-only previews', async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(rtsOrigin);
  expect(
    (
      await (
        await page.request.get(`${rtsOrigin}/api/interactive/entry`)
      ).json()
    ).enabled,
  ).toBe(true);
  await openAuthoringTab(page, 'Units');
  await units(page)
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  const name = `Typed review ${Date.now()}`;
  await units(page).getByLabel('Arrangement name', { exact: true }).fill(name);
  await place(page, 'friendly', 'Quadcopter / strike', 103.85, 1.29);
  await place(page, 'friendly', 'STING interceptor', 103.85, 1.291);
  await place(page, 'hostile', 'Quadcopter / strike', 103.86, 1.29);
  await place(page, 'hostile', 'Lancet-3', 103.86, 1.291);
  await place(page, 'hostile', 'Shahed-136', 103.86, 1.292);
  await place(page, 'unknown', undefined, 103.85, 1.292);
  await openAuthoringTab(page, 'Conductor');
  await conductor(page)
    .getByRole('button', { name: 'Add action', exact: true })
    .click();
  await conductor(page)
    .getByLabel('Script actor', { exact: true })
    .selectOption({ label: 'Hostile 3 · observation only' });
  await conductor(page)
    .getByLabel('Action time after Start', { exact: true })
    .fill('0');
  await conductor(page)
    .getByLabel('Script destination longitude', { exact: true })
    .fill('103.8602');
  await conductor(page)
    .getByLabel('Script destination latitude', { exact: true })
    .fill('1.29');
  await conductor(page)
    .getByRole('button', { name: 'Apply action', exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page)).destinations.length)
    .toBe(1);
  await projection(page, true);
  await expect
    .poll(async () => (await inspect(page, true)).destinations.length)
    .toBe(1);
  await page.screenshot({ path: resolve(evidence, 'typed-authoring-3d.png') });
  await conductor(page)
    .getByRole('button', { name: 'Save revision', exact: true })
    .click();
  await expect(conductor(page)).toContainText('Revision 1 saved');
  let release = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  await page.route('**/api/interactive/*/commands', async (route) => {
    if (route.request().postDataJSON()?.intent?.action === 'start') await gate;
    await route.continue();
  });
  try {
    const starting = loadValidateRun(page, name);
    await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
      'data-run-state',
      'ready',
      { timeout: 20000 },
    );
    await noScript(page, true);
    await projection(page);
    await noScript(page);
    release();
    await starting;
    await page.unroute('**/api/interactive/*/commands');
    await expect
      .poll(
        async () => (await readWorld(page)).scenarioSchedule?.actions[0].state,
      )
      .toBe('Completed');
    const world = await readWorld(page);
    expect(Object.keys(world.unitProfiles!)).toHaveLength(5);
    expect(world.scenario!.revision).toBe(1);
    await page
      .getByRole('button', { name: 'Pause', exact: true })
      .first()
      .click();
    await noScript(page);
    await projection(page, true);
    await noScript(page, true);
    await closeTab(page, 'Orchestrator');
    await openAuthoringTab(page, 'Conductor');
    await noScript(page, true);
    await page
      .getByRole('button', { name: 'Resume', exact: true })
      .first()
      .click();
    await noScript(page, true);
    await endDemo(page);
    await noScript(page, true);
    await projection(page);
    await noScript(page);
    await closeTab(page, 'Tactical Map');
    await page
      .getByRole('button', { name: 'Open Map', exact: true })
      .first()
      .click();
    await noScript(page);
    await page
      .getByRole('button', { name: 'Load mission', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
      .click();
    await expect
      .poll(async () => (await inspect(page)).destinations.length)
      .toBe(1);
    await page.screenshot({
      path: resolve(evidence, 'typed-authoring-restored.png'),
    });
  } finally {
    release();
    const entry = await (
      await page.request.get(`${rtsOrigin}/api/interactive/entry`)
    ).json();
    if (entry.activeMissionId) await endDemo(page).catch(() => {});
  }
});

for (const [count, hostiles] of [
  [5, 1],
  [5, 5],
  [10, 10],
  [5, 0],
])
  test(`${count}v${hostiles} actual group movement, unique concurrent pursuit and Stop`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(rtsOrigin);
    const data = arrangement(count, hostiles);
    const saved = await page.request.post(`${rtsOrigin}/api/scenarios`, {
      data: {
        requestId: crypto.randomUUID(),
        expectedRevision: 0,
        content: data,
      },
    });
    expect(saved.ok()).toBe(true);
    try {
      await loadValidateRun(page, data.name);
      await closeTab(page, 'Orchestrator');
      await fleetSelect(
        page,
        Array.from({ length: count }, (_, i) => `Friendly ${i + 1}`),
      );
      await stance(page, 'intercept');
      const command = await groundMove(page);
      expect(command.receipt.executionIds).toHaveLength(count);
      await expect
        .poll(
          async () =>
            (await readWorld(page)).fleetBehavior!.assignments!.filter(
              (a) => a.state === 'active',
            ).length,
        )
        .toBe(hostiles);
      const f = await readWorld(page);
      const active = f.fleetBehavior!.assignments!.filter(
        (a) => a.state === 'active',
      );
      expect(new Set(active.map((a) => a.targetId)).size).toBe(hostiles);
      await expect
        .poll(
          async () =>
            (await readWorld(page)).interactive!.executions!.filter(
              (e) => e.state === 'Running',
            ).length,
        )
        .toBe(count - hostiles);
      const measured = hostiles === 0 ? await sampleAnimation(page) : undefined;
      if (measured) {
        expect(measured.changedPoses).toBeGreaterThan(20);
        await projection(page, true);
        await groundMove(page, true);
        const threeD = await sampleAnimation(page, true);
        expect(threeD.changedPoses).toBeGreaterThan(20);
        await writeFile(
          resolve(evidence, 'animation-measurements.json'),
          JSON.stringify(
            {
              tactical: measured,
              threeD,
              commandLatencyMs: command.latencyMs,
              source: await sampleSource(page),
            },
            null,
            2,
          ),
        );
      }
      await page
        .getByRole('button', { name: 'Pause', exact: true })
        .first()
        .click();
      const paused = await readWorld(page);
      await page.screenshot({
        path: resolve(evidence, `group-${count}v${hostiles}.png`),
      });
      expect(
        paused.fleetBehavior!.members!.some((m) => m.state === 'reserve'),
      ).toBe(false);
      if (count === 5 && hostiles === 1) {
        const layouts = [];
        for (const [width, height] of [
          [760, 900],
          [820, 900],
          [900, 900],
          [1440, 900],
          [2560, 1440],
          [3840, 2160],
        ]) {
          await page.setViewportSize({ width, height });
          await page.screenshot({
            path: resolve(evidence, `layout-${width}.png`),
          });
          layouts.push({
            width,
            height,
            overflow: await page.evaluate(
              () => document.documentElement.scrollWidth > innerWidth,
            ),
          });
        }
        const axe = await new AxeBuilder({ page })
          .disableRules(['color-contrast'])
          .analyze();
        await writeFile(
          resolve(evidence, 'layouts-accessibility.json'),
          JSON.stringify({ layouts, violations: axe.violations }, null, 2),
        );
        expect(
          axe.violations.filter(
            (v) => v.impact === 'critical' || v.impact === 'serious',
          ),
        ).toEqual([]);
        await page.setViewportSize({ width: 1920, height: 1080 });
      }
      await fleetSelect(
        page,
        Array.from({ length: count }, (_, i) => `Friendly ${i + 1}`),
      );
      await fleet(page)
        .getByRole('button', { name: 'Stop selected', exact: true })
        .click();
      await expect
        .poll(async () =>
          (await readWorld(page)).fleetBehavior!.members!.every(
            (m) => m.policy === 'hold',
          ),
        )
        .toBe(true);
      await page
        .getByRole('button', { name: 'Resume', exact: true })
        .first()
        .click();
      expect(
        (await readWorld(page)).fleetBehavior!.assignments!.filter(
          (a) => a.state === 'active',
        ),
      ).toHaveLength(0);
      await endDemo(page);
    } finally {
      const entry = await (
        await page.request.get(`${rtsOrigin}/api/interactive/entry`)
      ).json();
      if (entry.activeMissionId) await endDemo(page).catch(() => {});
    }
  });

test('idle Intercept produces persistent NON-OP on both maps and reload without replaying effects', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(rtsOrigin);
  const data = arrangement(1, 1);
  data.name = `Persistent refinement ${Date.now()}`;
  data.units[1].position.longitudeDeg = 103.8505;
  await page.request.post(`${rtsOrigin}/api/scenarios`, {
    data: {
      requestId: crypto.randomUUID(),
      expectedRevision: 0,
      content: data,
    },
  });
  try {
    await loadValidateRun(page, data.name);
    await closeTab(page, 'Orchestrator');
    await fleetSelect(page, ['Friendly 1']);
    await stance(page, 'intercept');
    await expect
      .poll(async () => (await readWorld(page)).fleetBehavior!.outcomes!.length)
      .toBe(1);
    const loss = await readWorld(page),
      mid = loss.mission.id;
    await expect(
      fleet(page).locator('li[data-non-operational="true"]'),
    ).toHaveCount(1);
    await expect
      .poll(
        async () =>
          (await inspect(page)).points.filter((p) => p.unavailable === 'NON-OP')
            .length,
      )
      .toBe(2);
    await noScript(page);
    await page.screenshot({
      path: resolve(evidence, 'persistent-loss-tactical.png'),
    });
    await projection(page, true);
    await expect
      .poll(
        async () =>
          (await inspect(page, true)).points.filter(
            (p) => p.unavailable === 'NON-OP',
          ).length,
      )
      .toBe(2);
    await noScript(page, true);
    await page.screenshot({
      path: resolve(evidence, 'persistent-loss-3d.png'),
    });
    await endDemo(page);
    await page.reload();
    await page
      .getByRole('button', { name: 'Load mission', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: 'Previous demos', exact: true })
      .hover();
    await page
      .getByRole('menuitem', { name: new RegExp(`${data.name}.*Demo`) })
      .click();
    await projection(page);
    await expect
      .poll(
        async () =>
          (await inspect(page)).points.filter((p) => p.unavailable === 'NON-OP')
            .length,
      )
      .toBe(2);
    await noScript(page);
    const replay = await readWorld(page, mid);
    expect(replay.fleetBehavior!.outcomes).toEqual(
      loss.fleetBehavior!.outcomes,
    );
    expect(replay.tracks).toMatchObject(
      Object.fromEntries(
        Object.entries(loss.tracks).map(([id, t]) => [
          id,
          { latest: { position: t.latest.position } },
        ]),
      ),
    );
  } finally {
    const entry = await (
      await page.request.get(`${rtsOrigin}/api/interactive/entry`)
    ).json();
    if (entry.activeMissionId) await endDemo(page).catch(() => {});
  }
});
