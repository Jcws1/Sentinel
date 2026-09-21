import { armPlacement, openAuthoringTab } from './authoringActions';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  rtsOrigin,
  readWorld,
  endDemo,
  fleetSelect,
  newDemo,
} from './rtsActions';
import { closeTab } from './actions';
import type {
  ScenarioRevision,
  WorldFrame,
} from '../../src/contracts/generated';
import { metric } from '../../src/world/movement';
const evidence = resolve('test-results/browser/evidence');
const units = (p: Page) => p.locator('[data-view="orchestrator"]');
const conductor = (p: Page) => p.locator('[data-view="orchestrator"]');
const map = (p: Page) => p.locator('.tactical-view[data-view-id="tactical"]');
function v2(world: WorldFrame) {
  const fleet = world.fleetBehavior!;
  expect(fleet.ruleVersion).toBe('local-fleet-v2');
  expect(fleet.model.acquisitionRadiusM).toBe(700);
  expect(fleet.members).toBeDefined();
  expect(fleet.assignments).toBeDefined();
  expect(fleet.outcomes).toBeDefined();
  expect(fleet.members!.some((m) => m.state === 'reserve')).toBe(false);
  const active = fleet.assignments!.filter((a) => a.state === 'active');
  expect(new Set(active.map((a) => a.interceptorId)).size).toBe(active.length);
  expect(new Set(active.map((a) => a.targetId)).size).toBe(active.length);
  return {
    ...fleet,
    members: fleet.members!,
    assignments: fleet.assignments!,
    outcomes: fleet.outcomes!,
  };
}
function sourcePosition(world: WorldFrame, entityId: string) {
  return Object.values(world.tracks).find(
    (t) =>
      t.entityId === entityId && t.source.id === world.interactive!.sourceId,
  )!.latest.position;
}
function separation(world: WorldFrame, first: string, second: string) {
  const a = metric(sourcePosition(world, first), world);
  const b = metric(sourcePosition(world, second), world);
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
type Probe = {
  ready: boolean;
  destinations: { id: string; label: string }[];
  points: { id: string; x: number; y: number; unavailable?: string }[];
  scriptIntents?: number;
  retainedScriptIntents?: number;
};
async function inspect(page: Page, threeD = false): Promise<Probe> {
  return page.evaluate(
    ({ threeD }) => {
      const w = window as unknown as {
        __sentinelMapTest: { inspect(id: string): Probe };
        __sentinelCesiumTest: { inspect(id: string): Probe };
      };
      return (threeD ? w.__sentinelCesiumTest : w.__sentinelMapTest)?.inspect(
        'tactical',
      );
    },
    { threeD },
  );
}
async function projection(page: Page, threeD = false) {
  await map(page)
    .getByRole('button', { name: threeD ? '3D' : 'Tactical', exact: true })
    .click();
  await expect
    .poll(async () => (await inspect(page, threeD))?.points?.length, {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
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
  await expect
    .poll(
      async () =>
        (await inspect(page, threeD))?.scriptIntents ??
        (await inspect(page, threeD))?.retainedScriptIntents ??
        0,
    )
    .toBe(0);
  await expect(conductor(page).getByLabel('Script plan filter')).toHaveCount(0);
}
async function place(
  page: Page,
  category: string,
  longitude: string,
  latitude: string,
) {
  await armPlacement(units(page), category);
  await units(page).locator('.units-numeric summary').click();
  await units(page)
    .getByLabel('Placement longitude', { exact: true })
    .fill(longitude);
  await units(page)
    .getByLabel('Placement latitude', { exact: true })
    .fill(latitude);
  await units(page)
    .getByLabel('Placement altitude', { exact: true })
    .fill('150.125');
  await units(page)
    .getByRole('button', { name: 'Place at coordinates', exact: true })
    .click();
}
test.beforeAll(() => mkdir(evidence, { recursive: true }).then(() => {}));
test.use({ actionTimeout: 12000 });

test('v2 mixed controlled members retain ordinary movement receipts and Stop with explicit unavailable skips', async ({
  page,
}) => {
  test.setTimeout(75000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await newDemo(page);
  v2(await readWorld(page));
  const fleet = page.locator('.fleet-sidebar');
  try {
    await fleetSelect(page, ['F-01', 'F-02', 'F-03', 'F-04']);
    await fleet
      .getByLabel('Behavior', { exact: true })
      .selectOption('intercept');
    const applied = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/commands'),
    );
    await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
    const armed = await (await applied).json();
    expect(armed.accepted).toBe(true);
    expect(
      armed.behaviorOutcomes.map((o: { outcome: string }) => o.outcome),
    ).toEqual(['accepted', 'accepted', 'skipped', 'skipped']);
    await expect(fleet).toContainText('INTERCEPT ENABLED');
    await expect(
      fleet.getByRole('button', { name: 'Move · Intercept', exact: true }),
    ).toBeEnabled();
    await map(page)
      .getByRole('button', { name: 'Map layers', exact: true })
      .click();
    await page.getByRole('menuitem', { name: 'Overview', exact: true }).click();
    await expect
      .poll(async () =>
        (await inspect(page))?.points?.some((p) => p.id.endsWith(':O-01')),
      )
      .toBe(true);
    const target = (await inspect(page)).points.find((p) =>
      p.id.endsWith(':O-01'),
    )!;
    const approached = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith('/direct-moves'),
    );
    await map(page)
      .locator('canvas')
      .first()
      .click({ button: 'right', position: { x: target.x, y: target.y } });
    const response = await approached;
    const sent = response.request().postDataJSON();
    const approach = await response.json();
    expect(sent.direct.intercept ?? false).toBe(false);
    expect(approach.accepted).toBe(true);
    expect(approach.operation).toBe('direct-move');
    expect(approach.requestId).toBe(sent.commandId);
    expect(approach.directOrder).toBe(sent.direct.order);
    expect(approach.targetScope).toEqual([]);
    expect(approach.behaviorOutcomes).toEqual([]);
    expect(
      approach.memberOutcomes.map(
        (o: { entityId: string; outcome: string; code: string }) => ({
          label: o.entityId.split(':').at(-1),
          outcome: o.outcome,
          code: o.code,
        }),
      ),
    ).toEqual([
      { label: 'F-01', outcome: 'accepted', code: 'OK' },
      { label: 'F-02', outcome: 'accepted', code: 'OK' },
      { label: 'F-03', outcome: 'skipped', code: 'POSITION_UNAVAILABLE' },
      { label: 'F-04', outcome: 'skipped', code: 'NO_RESPONSE' },
    ]);
    expect(approach.executionIds).toHaveLength(2);
    const beforeMove = await readWorld(page);
    expect(
      v2(beforeMove).assignments.filter((a) => a.state === 'active'),
    ).toHaveLength(0);
    await expect
      .poll(async () => (await readWorld(page)).interactive!.tick)
      .toBeGreaterThan(beforeMove.interactive!.tick + 2);
    const moved = await readWorld(page);
    for (const label of ['F-01', 'F-02']) {
      const id = Object.values(moved.entities).find(
        (e) => e.label === label,
      )!.id;
      expect(sourcePosition(moved, id)).not.toEqual(
        sourcePosition(beforeMove, id),
      );
      expect(v2(moved).members.find((m) => m.entityId === id)?.policy).toBe(
        'intercept',
      );
    }
    await expect(page.locator('.operational-attention')).toContainText(
      '2 moving · 2 skipped',
    );
    const stopped = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/commands'),
    );
    await fleet
      .getByRole('button', { name: 'Stop selected', exact: true })
      .click();
    const stop = await (await stopped).json();
    expect(stop.accepted).toBe(true);
    expect(
      stop.controlOutcomes.map((o: { outcome: string }) => o.outcome),
    ).toEqual(['accepted', 'accepted', 'skipped', 'skipped']);
    await expect(
      fleet.getByRole('status', { name: 'Last selected-control receipt' }),
    ).toContainText('skipped');
    await expect
      .poll(async () =>
        (await readWorld(page)).fleetBehavior!.members!.every(
          (m) => m.policy === 'hold',
        ),
      )
      .toBe(true);
    for (const label of ['F-01', 'F-02'])
      await fleet
        .getByRole('checkbox', { name: `Select ${label}`, exact: true })
        .uncheck();
    const rejected = page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().endsWith('/commands'),
    );
    await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
    const refusal = await (await rejected).json();
    expect(refusal.accepted).toBe(false);
    expect(refusal.code).toBe('NO_AVAILABLE_ASSETS');
    await expect(fleet.locator('.fleet-behavior-result').first()).toContainText(
      'refused',
    );
    expect((await readWorld(page)).fleetBehavior!.outcomes).toHaveLength(0);
    await page.screenshot({
      path: resolve(evidence, 'mixed-unavailable-members.png'),
    });
  } finally {
    await endDemo(page).catch(() => {});
  }
});

test('v2 saved revision, both-map authoring isolation, unassigned movement, later acquisition and persistent losses', async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(rtsOrigin);
  const entry = await (
    await page.request.get(`${rtsOrigin}/api/interactive/entry`)
  ).json();
  expect(entry.enabled).toBe(true);
  expect(entry.activeMissionId).toBeFalsy();
  await openAuthoringTab(page, 'Units');
  await units(page)
    .getByRole('button', { name: 'Open scenario editor', exact: true })
    .click();
  const name = `D4 operator exercise ${Date.now()}`;
  await units(page).getByLabel('Arrangement name', { exact: true }).fill(name);
  await place(page, 'Friendly', '103.850', '1.290');
  await place(page, 'Friendly', '103.850', '1.29025');
  await place(page, 'Hostile', '103.852', '1.290');
  // Keep the second target outside 700 m even after the first destination.
  await place(page, 'Hostile', '103.8586', '1.29025');
  await openAuthoringTab(page, 'Conductor');
  const c = conductor(page);
  for (const [actor, seconds, longitude, latitude] of [
    ['Hostile 3', '0', '103.8518', '1.29'],
    ['Hostile 4', '60', '103.8587', '1.29025'],
  ] as const) {
    await c.getByRole('button', { name: 'Add action', exact: true }).click();
    await c
      .getByLabel('Script actor', { exact: true })
      .selectOption({ label: `${actor} · observation only` });
    await c
      .getByLabel('Action time after Start', { exact: true })
      .fill(seconds);
    await c
      .getByLabel('Script destination longitude', { exact: true })
      .fill(longitude);
    await c
      .getByLabel('Script destination latitude', { exact: true })
      .fill(latitude);
    await c.getByRole('button', { name: 'Apply action', exact: true }).click();
  }
  await expect
    .poll(async () => (await inspect(page))?.destinations?.length)
    .toBe(2);
  await projection(page, true);
  await expect
    .poll(async () => (await inspect(page, true))?.destinations?.length)
    .toBe(2);
  await page.screenshot({ path: resolve(evidence, 'authoring-3d.png') });
  await projection(page);
  await c.getByRole('button', { name: 'Save revision', exact: true }).click();
  await expect(c).toContainText('Revision 1 saved');
  const saved = (
    await (await page.request.get(`${rtsOrigin}/api/scenarios`)).json()
  ).scenarios.find(
    (s: ScenarioRevision) => s.content.name === name,
  ) as ScenarioRevision;
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
    .click();
  await c
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(
    c.getByLabel('Scenario validation review', { exact: true }),
  ).toContainText('Ready to run');
  // Observe the actual Ready run before the shared startup owner sends Start.
  let releaseStart = () => {};
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  let finishedStart = () => {};
  const startContinued = new Promise<void>((resolve) => {
    finishedStart = resolve;
  });
  await page.route('**/api/interactive/*/commands', async (route) => {
    const isStart = route.request().postDataJSON()?.intent?.action === 'start';
    if (isStart) await startGate;
    await route.continue();
    if (isStart) finishedStart();
  });
  try {
    await c
      .getByRole('button', { name: 'Run saved revision 1', exact: true })
      .click();
    await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
      'data-run-state',
      'ready',
    );
    await noScript(page);
    await projection(page, true);
    await noScript(page, true);
    releaseStart();
    // Removing a route while its handler is still awaiting the gate can let
    // Playwright continue it first. Wait for this handler's single continuation.
    await startContinued;
    await page.unroute('**/api/interactive/*/commands');
    await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
      'data-run-state',
      'running',
    );
    await expect
      .poll(
        async () => (await readWorld(page)).scenarioSchedule?.actions[0].state,
      )
      .toBe('Completed');
    const running = await readWorld(page);
    expect(running.scenario?.revision).toBe(saved.revision);
    v2(running);
    await noScript(page, true);
    await projection(page);
    await noScript(page);
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
    // Inspecting a saved definition remains authoring even while the demo exists.
    await page
      .getByRole('button', { name: 'Load mission', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
      .click();
    await expect
      .poll(async () => (await inspect(page, true))?.destinations?.length)
      .toBe(2);
    await expect(c).toContainText('Saved r1');
    await c
      .getByRole('button', { name: 'Return to active demo', exact: true })
      .click();
    await noScript(page, true);
    await projection(page);
    await noScript(page);
    await fleetSelect(page, ['Friendly 1', 'Friendly 2']);
    const fleet = page.locator('.fleet-sidebar');
    await fleet
      .getByLabel('Behavior', { exact: true })
      .selectOption('intercept');
    await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(fleet).toContainText('INTERCEPT ENABLED');
    expect((await readWorld(page)).fleetBehavior?.assignments).toHaveLength(0);
    await page
      .getByRole('button', { name: 'Resume', exact: true })
      .first()
      .click();
    await expect(
      fleet.getByRole('button', { name: 'Move · Intercept', exact: true }),
    ).toBeEnabled();
    const w = await readWorld(page),
      hostile = Object.values(w.entities).find((e) => e.label === 'Hostile 3')!;
    const p = (await inspect(page)).points.find((p) => p.id === hostile.id)!;
    await map(page)
      .locator('canvas')
      .first()
      .click({ button: 'right', position: { x: p.x, y: p.y } });
    await expect
      .poll(
        async () =>
          (await readWorld(page)).fleetBehavior?.assignments?.filter(
            (a) => a.state === 'active',
          ).length,
      )
      .toBe(1);
    const acquiring = await readWorld(page);
    const active = v2(acquiring).assignments.filter(
      (a) => a.state === 'active',
    );
    expect(active).toHaveLength(1);
    expect(active[0].targetId).toBe(hostile.id);
    const unassignedBefore = v2(acquiring).members.find(
      (m) => m.state === 'armed',
    )!;
    expect(unassignedBefore).toBeDefined();
    const farther = Object.values(acquiring.entities).find(
      (e) => e.label === 'Hostile 4',
    )!;
    expect(
      separation(acquiring, unassignedBefore.entityId, farther.id),
    ).toBeGreaterThan(700);
    await expect
      .poll(
        async () =>
          (await readWorld(page)).interactive!.executions!.find(
            (e) =>
              e.entityId === unassignedBefore.entityId &&
              e.id === unassignedBefore.movementExecutionId,
          )?.state,
      )
      .toBe('Running');
    await expect
      .poll(async () =>
        sourcePosition(await readWorld(page), unassignedBefore.entityId),
      )
      .not.toEqual(sourcePosition(acquiring, unassignedBefore.entityId));
    await page.screenshot({
      path: resolve(evidence, 'intercept-and-unassigned-movement.png'),
    });
    await expect
      .poll(
        async () => (await readWorld(page)).fleetBehavior?.outcomes?.length,
        { timeout: 15000 },
      )
      .toBe(1);
    await expect(fleet).toContainText('NON-OP');
    await page
      .getByRole('button', { name: 'Pause', exact: true })
      .first()
      .click();
    await noScript(page);
    await projection(page, true);
    await noScript(page, true);
    expect(
      (await inspect(page, true)).points.filter(
        (p) => p.unavailable === 'NON-OP',
      ),
    ).toHaveLength(2);
    await page.screenshot({
      path: resolve(evidence, 'persistent-loss-3d.png'),
    });
    const loss = await readWorld(page),
      unassigned = v2(loss).members.find((m) => m.state === 'armed')!;
    expect(unassigned.entityId).toBe(unassignedBefore.entityId);
    expect(loss.entities[unassigned.entityId].condition).toBe('operational');
    for (const input of await fleet.getByRole('checkbox').all())
      await input.uncheck();
    await fleet
      .getByRole('checkbox', {
        name: `Select ${loss.entities[unassigned.entityId].label}`,
        exact: true,
      })
      .check();
    await fleet
      .getByRole('button', { name: 'Stop selected', exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await readWorld(page)).fleetBehavior!.members!.find(
            (m) => m.entityId === unassigned.entityId,
          )?.policy,
      )
      .toBe('hold');
    await fleet
      .getByLabel('Behavior', { exact: true })
      .selectOption('intercept');
    await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(fleet).toContainText('INTERCEPT ENABLED');
    await projection(page);
    await page
      .getByRole('button', { name: 'Resume', exact: true })
      .first()
      .click();
    await expect(
      fleet.getByRole('button', { name: 'Move · Intercept', exact: true }),
    ).toBeEnabled();
    const remaining = Object.values(loss.entities).find(
      (e) => e.label === 'Hostile 4',
    )!;
    const later = (await inspect(page)).points.find(
      (p) => p.id === remaining.id,
    )!;
    const beforeLater = await readWorld(page);
    const distanceM = separation(
      beforeLater,
      unassigned.entityId,
      remaining.id,
    );
    const cruiseMps = beforeLater.unitProfiles![unassigned.entityId].cruiseMps;
    expect(distanceM).toBeGreaterThan(
      v2(beforeLater).model.acquisitionRadiusM!,
    );
    // This case deliberately begins outside acquisition range. Allow its
    // published ordinary travel time plus the standard 5 s assertion budget.
    const acquisitionBudgetMs =
      ((distanceM - v2(beforeLater).model.acquisitionRadiusM!) / cruiseMps) *
        1000 +
      5000;
    const laterResponse = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' && r.url().endsWith('/direct-moves'),
    );
    await map(page)
      .locator('canvas')
      .first()
      .click({ button: 'right', position: { x: later.x, y: later.y } });
    const laterReceipt = await (await laterResponse).json();
    expect(laterReceipt.accepted).toBe(true);
    expect(laterReceipt.operation).toBe('direct-move');
    expect(laterReceipt.executionIds).toHaveLength(1);
    expect(
      laterReceipt.memberOutcomes.map(
        (o: { entityId: string; outcome: string; code: string }) => ({
          entityId: o.entityId,
          outcome: o.outcome,
          code: o.code,
        }),
      ),
    ).toEqual([
      { entityId: unassigned.entityId, outcome: 'accepted', code: 'OK' },
    ]);
    await expect
      .poll(
        async () =>
          v2(await readWorld(page)).assignments.filter(
            (a) => a.state === 'active',
          ).length,
        { timeout: acquisitionBudgetMs },
      )
      .toBe(1);
    const acquired = await readWorld(page);
    expect(
      v2(acquired)
        .assignments.filter((a) => a.state === 'active')
        .map((a) => ({
          interceptorId: a.interceptorId,
          targetId: a.targetId,
        })),
    ).toEqual([{ interceptorId: unassigned.entityId, targetId: remaining.id }]);
    await writeFile(
      resolve(evidence, 'v2-later-acquisition.json'),
      JSON.stringify(
        {
          distanceM,
          cruiseMps,
          acquisitionBudgetMs,
          ruleVersion: acquired.fleetBehavior!.ruleVersion,
          receipt: laterReceipt,
        },
        null,
        2,
      ),
    );
    await expect
      .poll(
        async () => (await readWorld(page)).fleetBehavior?.outcomes?.length,
        { timeout: 45000 },
      )
      .toBe(2);
    await page
      .getByRole('button', { name: 'Pause', exact: true })
      .first()
      .click();
    const finalLoss = await readWorld(page);
    const outcomes = v2(finalLoss).outcomes;
    expect(outcomes).toHaveLength(2);
    expect(new Set(outcomes.map((o) => o.id)).size).toBe(2);
    expect(
      Object.values(finalLoss.entities).filter(
        (e) => e.condition === 'non-operational',
      ),
    ).toHaveLength(4);
    expect(
      Object.values(finalLoss.tracks).every(
        (t) => t.latest.position.altitude.metres === 150.125,
      ),
    ).toBe(true);
    await expect(fleet.locator('[data-non-operational="true"]')).toHaveCount(2);
    await expect(
      page.getByLabel('Current behavior and condition'),
    ).toContainText('SIMULATED ENGAGEMENT');
    const a11y = await new AxeBuilder({ page })
      .include('.fleet-sidebar')
      .include('.entity-details')
      .analyze();
    expect(
      a11y.violations.filter((v) =>
        ['critical', 'serious'].includes(v.impact ?? ''),
      ),
    ).toEqual([]);
    const layouts = [];
    for (const [width, height] of [
      [760, 820],
      [820, 900],
      [900, 900],
      [1440, 900],
      [2560, 1440],
      [3840, 2160],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      layouts.push({ width, height });
      await page.screenshot({ path: resolve(evidence, `non-op-${width}.png`) });
    }
    await writeFile(
      resolve(evidence, 'layouts-accessibility.json'),
      JSON.stringify({ layouts, violations: a11y.violations, errors }, null, 2),
    );
    expect(errors).toEqual([]);
    await endDemo(page);
    await noScript(page);
    await projection(page, true);
    await noScript(page, true);
    await closeTab(page, '3D Map');
    await page
      .getByRole('button', { name: 'Open Map', exact: true })
      .first()
      .click();
    await projection(page, true);
    await noScript(page, true); // Retained renderer reuse after End.
    await page.reload();
    await page
      .getByRole('button', { name: 'Load mission', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: 'Previous demos', exact: true })
      .hover();
    await page
      .getByRole('menuitem', { name: new RegExp(`${name}.*Demo`) })
      .click();
    await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
      'data-run-state',
      'ended',
    );
    await projection(page, true);
    await noScript(page, true);
    expect(
      (await inspect(page, true)).points.filter(
        (p) => p.unavailable === 'NON-OP',
      ),
    ).toHaveLength(4);
    await projection(page);
    await noScript(page);
    await page.screenshot({
      path: resolve(evidence, 'ended-no-script-preview.png'),
    });
  } finally {
    releaseStart();
    const current = await (
      await page.request.get(`${rtsOrigin}/api/interactive/entry`)
    ).json();
    if (current.activeMissionId) await endDemo(page).catch(() => {});
  }
});
