import { test, expect, type WebSocketRoute } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  newDemo,
  readWorld,
  endDemo,
  fleetSelect,
  directClick,
  demoAction,
} from './rtsActions';
import type { DirectMoveRequest } from '../../src/contracts/generated';
test.use({ trace: 'off' });
const evidence = resolve('test-results/browser/movement');
test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});
const active = (f: Awaited<ReturnType<typeof readWorld>>) =>
  f.interactive!.executions!.filter(
    (e) =>
      !['Completed', 'Cancelled', 'Failed', 'Expired', 'Interrupted'].includes(
        e.state,
      ),
  );
async function numeric(
  page: import('@playwright/test').Page,
  longitude: number,
  latitude: number,
) {
  await page
    .getByRole('button', { name: 'Open Activity', exact: true })
    .click();
  const panel = page.locator('[data-view="movement"]');
  const disclosure = panel.locator('details').filter({
    has: page.locator('summary').filter({ hasText: 'Move by coordinates' }),
  });
  if (!(await disclosure.getAttribute('open')))
    await disclosure.locator('summary').click();
  await panel
    .getByRole('textbox', { name: 'Destination longitude' })
    .fill(String(longitude));
  await panel
    .getByRole('textbox', { name: 'Destination latitude' })
    .fill(String(latitude));
  await panel
    .getByRole('button', { name: 'Move selected', exact: true })
    .click();
}

test('direct group movement skips unavailable members, redirects a subset and preserves invalid replacement', async ({
  page,
}) => {
  test.setTimeout(70000);
  await newDemo(page);
  await fleetSelect(page, ['F-01', 'F-02', 'F-03', 'F-04']);
  const before = await readWorld(page);
  const unaffected = Object.values(before.tracks)
    .filter((t) => ['O-01', 'F-05'].includes(before.entities[t.entityId].label))
    .map((t) => ({ id: t.id, p: t.latest.position }));
  await directClick(page, 0.82, 0.72);
  await expect.poll(async () => active(await readWorld(page)).length).toBe(2);
  await expect(page.locator('.operational-attention')).toContainText(
    /2 (commanded|moving) · 2 skipped/,
  );
  expect(
    await page.getByRole('tab', { name: 'Activity', exact: true }).count(),
  ).toBe(0);
  await page.screenshot({
    path: resolve(evidence, 'direct-group-unavailable.png'),
  });
  const admitted = await readWorld(page),
    old = active(admitted);
  expect(
    old.every(
      (e) => e.destination.altitude.metres === e.origin.altitude.metres,
    ),
  ).toBe(true);
  await page
    .locator('.fleet-sidebar')
    .getByRole('button', { name: 'Inspect F-01', exact: true })
    .click();
  await directClick(page, 0.3, 0.72);
  await expect
    .poll(
      async () =>
        (await readWorld(page)).interactive!.executions!.filter(
          (e) =>
            e.state === 'Cancelled' &&
            old.some((previous) => previous.id === e.id),
        ).length,
    )
    .toBe(1);
  const redirected = await readWorld(page);
  expect(active(redirected).find((e) => e.entityId.endsWith(':F-02'))!.id).toBe(
    old.find((e) => e.entityId.endsWith(':F-02'))!.id,
  );
  const current = active(redirected).find((e) => e.entityId.endsWith(':F-01'))!;
  await numeric(page, 104.5, 1.29);
  await expect(page.locator('.operational-attention')).toContainText(
    /supported|extent|area/i,
  );
  expect(
    (await readWorld(page)).interactive!.executions!.find(
      (e) => e.id === current.id,
    )!.state,
  ).not.toBe('Cancelled');
  await page.screenshot({ path: resolve(evidence, 'invalid-replacement.png') });
  for (const t of unaffected)
    expect((await readWorld(page)).tracks[t.id].latest.position).toEqual(t.p);
  await endDemo(page);
});

test('delayed older delivery cannot restore a newer redirect and receipts stay distinct from completion samples', async ({
  page,
}) => {
  test.setTimeout(65000);
  await newDemo(page);
  await fleetSelect(page, ['F-01', 'F-02']);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const bodies: DirectMoveRequest[] = [];
  await page.route('**/api/interactive/*/direct-moves', async (route) => {
    bodies.push(route.request().postDataJSON());
    if (bodies.length === 1) await gate;
    await route.continue();
  });
  await directClick(page, 0.85, 0.7);
  await expect.poll(() => bodies.length).toBe(1);
  await page
    .locator('.fleet-sidebar')
    .getByRole('checkbox', { name: 'Select F-02', exact: true })
    .uncheck();
  await directClick(page, 0.3, 0.6);
  await expect.poll(() => bodies.length).toBe(2);
  await expect
    .poll(async () =>
      active(await readWorld(page)).some(
        (e) => e.commandId === bodies[1].commandId,
      ),
    )
    .toBe(true);
  release();
  await expect.poll(async () => active(await readWorld(page)).length).toBe(2);
  let f = await readWorld(page);
  expect(active(f).find((e) => e.entityId.endsWith(':F-01'))!.commandId).toBe(
    bodies[1].commandId,
  );
  expect(active(f).find((e) => e.entityId.endsWith(':F-02'))!.commandId).toBe(
    bodies[0].commandId,
  );
  await page.screenshot({ path: resolve(evidence, 'rapid-redirect.png') });
  // An explicit short redirect completes only when the backend commits its endpoint sample.
  const t =
    f.tracks[
      f.interactive!.controls.find((c) => c.entityId.endsWith(':F-01'))!
        .controlTrackId!
    ];
  await numeric(
    page,
    t.latest.position.longitudeDeg + 0.0002,
    t.latest.position.latitudeDeg,
  );
  await expect
    .poll(
      async () =>
        (await readWorld(page)).interactive!.executions!.some(
          (e) =>
            e.commandId === bodies[2]?.commandId && e.state === 'Completed',
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  f = await readWorld(page);
  const e = f.interactive!.executions!.find(
    (e) => e.commandId === bodies[2].commandId,
  )!;
  expect(e.completionSample!.position).toEqual(e.destination);
  expect(e.completionSample!.sequence).toBe(e.terminalSequence);
  await page.screenshot({
    path: resolve(evidence, 'committed-completion.png'),
  });
  await endDemo(page);
});

test('started work survives navigation and lease expiry; long pause, fresh cancellation and Resume remain usable', async ({
  page,
}) => {
  test.setTimeout(120000);
  await newDemo(page);
  await fleetSelect(page, ['F-01', 'F-02']);
  await numeric(page, 103.882, 1.292);
  await expect
    .poll(
      async () =>
        active(await readWorld(page)).filter((e) => e.state === 'Running')
          .length,
    )
    .toBe(2);
  const mid = (await readWorld(page)).mission.id;
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Unload mission', exact: true })
    .click();
  await page.waitForTimeout(33000);
  const navigation = await readWorld(page, mid);
  expect(active(navigation)).toHaveLength(2);
  expect(active(navigation).every((e) => e.travelledMetres > 600)).toBe(true);
  await demoAction(page, 'Return to active demo');
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }).first(),
  ).toBeEnabled({ timeout: 15000 });
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'paused',
  );
  const paused = await readWorld(page);
  await page.waitForTimeout(31500);
  const long = await readWorld(page);
  expect(long.effectiveAt).toBe(paused.effectiveAt);
  expect(active(long).map((e) => e.travelledMetres)).toEqual(
    active(paused).map((e) => e.travelledMetres),
  );
  await page
    .getByRole('button', { name: 'Open Activity', exact: true })
    .click();
  await page
    .locator('[data-view="movement"]')
    .getByRole('button', { name: 'Cancel F-01', exact: true })
    .click();
  await expect.poll(async () => active(await readWorld(page)).length).toBe(1);
  await page
    .getByRole('button', { name: 'Resume', exact: true })
    .first()
    .click();
  await expect
    .poll(async () => active(await readWorld(page))[0].state)
    .toBe('Running');
  await page.screenshot({
    path: resolve(evidence, 'cancel-after-long-pause.png'),
  });
  await endDemo(page);
});

test('lost reply and healthy-socket source stall keep positions truthful and reconcile on resnapshot', async ({
  page,
}) => {
  test.setTimeout(55000);
  let blocked = false,
    deliveredSequence = 0;
  let socket: WebSocketRoute | undefined;
  await page.routeWebSocket('**/api/missions/*/stream', (s) => {
    socket = s;
    const server = s.connectToServer();
    server.onMessage((m) => {
      const v = JSON.parse(String(m));
      if (!blocked) {
        if (typeof v.sequence === 'number') deliveredSequence = v.sequence;
        s.send(m);
      } else if (v.type === 'heartbeat')
        s.send(JSON.stringify({ ...v, sequence: deliveredSequence }));
    });
  });
  await newDemo(page);
  await fleetSelect(page, ['F-01']);
  let command = '';
  let sends = 0;
  await page.route('**/api/interactive/*/direct-moves', async (route) => {
    sends++;
    command = route.request().postDataJSON().commandId;
    blocked = true;
    await route.fetch();
    await route.abort();
  });
  await directClick(page, 0.8, 0.65);
  const seq = await page
    .locator('.tactical-view')
    .getAttribute('data-sequence');
  await expect(page.locator('.operational-attention')).toContainText(
    'Source report delayed',
    { timeout: 12000 },
  );
  expect(
    await page.locator('.tactical-view').getAttribute('data-sequence'),
  ).toBe(seq);
  await expect(page.locator('.operational-attention')).toContainText(
    'awaiting world synchronization',
    { timeout: 15000 },
  );
  expect(
    (await readWorld(page)).interactive!.executions!.filter(
      (e) => e.commandId === command,
    ),
  ).toHaveLength(1);
  expect(sends).toBe(1);
  await page.screenshot({
    path: resolve(evidence, 'source-stalled-awaiting-sync.png'),
  });
  blocked = false;
  socket!.close();
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED', {
    timeout: 15000,
  });
  await expect(
    page
      .locator('.operational-attention')
      .filter({ hasText: 'Source report delayed' }),
  ).toHaveCount(0);
  await page.unroute('**/api/interactive/*/direct-moves');
  await endDemo(page);
});

test('all unavailable selections remain explicit without executions; empty selection cannot send', async ({
  page,
}) => {
  await newDemo(page);
  await fleetSelect(page, ['F-03', 'F-04']);
  let requests = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/direct-moves')) requests++;
  });
  await directClick(page, 0.7, 0.65);
  await expect(page.locator('.operational-attention')).toContainText(
    'No available drones.',
  );
  expect((await readWorld(page)).interactive!.executions).toHaveLength(0);
  expect(requests).toBe(1);
  await page
    .getByRole('button', { name: 'Open Activity', exact: true })
    .click();
  const activity = page.locator('[data-view="movement"]');
  await expect(activity).toContainText('F-03');
  await expect(activity).toContainText('F-04');
  await expect(activity).toContainText(/skipped/i);
  await page.screenshot({ path: resolve(evidence, 'all-unavailable.png') });
  await page
    .locator('.fleet-sidebar')
    .getByRole('checkbox', { name: 'Select F-03', exact: true })
    .uncheck();
  await page
    .locator('.fleet-sidebar')
    .getByRole('checkbox', { name: 'Select F-04', exact: true })
    .uncheck();
  await directClick(page, 0.6, 0.5);
  await expect(page.locator('.operational-attention')).toContainText(
    'Select drones',
  );
  expect(requests).toBe(1);
  await endDemo(page);
});
