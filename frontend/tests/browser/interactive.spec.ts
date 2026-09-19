import { test, expect, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  demoAction,
  newDemo,
  readWorld,
  endDemo,
  rtsOrigin,
} from './rtsActions';
test.use({ trace: 'off' });
const evidence = resolve('test-results/browser/interactive');
test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});

test('one-action numbered demo, real long pause, resume and repeatable creation retain recordings', async ({
  page,
}) => {
  test.setTimeout(100000);
  await newDemo(page);
  const first = await readWorld(page);
  expect(first.mission.name).toMatch(/^Demo \d{3,}$/);
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'paused',
  );
  const paused = await readWorld(page);
  await page.screenshot({ path: resolve(evidence, 'long-pause.png') });
  await page.waitForTimeout(31500);
  const after = await readWorld(page);
  expect(after.effectiveAt).toBe(paused.effectiveAt);
  expect(after.interactive!.tick).toBe(paused.interactive!.tick);
  expect(after.interactive!.lease.revision).toBeGreaterThan(
    paused.interactive!.lease.revision,
  );
  await page
    .getByRole('button', { name: 'Resume', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await page.setViewportSize({ width: 900, height: 800 });
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze())
      .violations,
  ).toEqual([]);
  await endDemo(page);
  const completed = await readWorld(page, first.mission.id);
  await page
    .getByRole('button', { name: 'New demo', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 20000 },
  );
  const second = await readWorld(page);
  expect(second.mission.id).not.toBe(first.mission.id);
  expect(second.recordingId).not.toBe(first.recordingId);
  expect(Number(second.mission.name.split(' ')[1])).toBeGreaterThan(
    Number(first.mission.name.split(' ')[1]),
  );
  expect(await readWorld(page, first.mission.id)).toEqual(completed);
  await page.reload();
  await demoAction(page, 'Return to active demo');
  await expect(page.locator('.mission-name')).toHaveText(second.mission.name);
  await page.screenshot({ path: resolve(evidence, 'repeat-demo-narrow.png') });
  await endDemo(page);
});

test('lost creation and lifecycle responses reconcile automatically without new identities', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto(rtsOrigin);
  let creation = '',
    command = '';
  let creates = 0,
    pauses = 0;
  await page.route('**/api/interactive/runs', async (route) => {
    creates++;
    creation = route.request().postDataJSON().creationId;
    await route.fetch();
    await route.abort();
  });
  await expect(
    page.getByRole('button', { name: 'New demo', exact: true }).first(),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'New demo', exact: true })
    .first()
    .click();
  await expect.poll(() => creation).not.toBe('');
  await page.reload();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 25000 },
  );
  expect(creates).toBe(1);
  const mid = (await readWorld(page)).mission.id;
  expect(
    (
      await (
        await page.request.get(
          `${rtsOrigin}/api/interactive/creations?identity=${encodeURIComponent(creation)}`,
        )
      ).json()
    ).accepted,
  ).toBe(true);
  await page.route('**/api/interactive/*/commands', async (route) => {
    const b = route.request().postDataJSON();
    if (b.intent.action !== 'pause') return route.continue();
    pauses++;
    command = b.commandId;
    await route.fetch();
    await route.abort();
  });
  await page
    .getByRole('button', { name: 'Pause', exact: true })
    .first()
    .click();
  await expect.poll(() => command).not.toBe('');
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'paused',
  );
  await expect(page.locator('.recovery-details')).toHaveCount(0, {
    timeout: 20000,
  });
  await expect(
    page.getByRole('button', { name: 'Resume', exact: true }).first(),
  ).toBeEnabled({ timeout: 20000 });
  expect(pauses).toBe(1);
  const events = (
    await (
      await page.request.get(
        `${rtsOrigin}/api/missions/${mid}/events?limit=500`,
      )
    ).json()
  ).events;
  expect(
    events.filter((e: { type: string }) => e.type === 'interactive.pause'),
  ).toHaveLength(1);
  await page.unroute('**/api/interactive/*/commands');
  await endDemo(page);
});

test('another session cannot silently take over; expired ownership requires explicit action', async ({
  page,
  browser,
}) => {
  test.setTimeout(65000);
  await newDemo(page);
  const mid = (await readWorld(page)).mission.id;
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Unload mission', exact: true })
    .click();
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.goto(rtsOrigin);
    await demoAction(second, 'Return to active demo');
    await expect(second.locator('.operational-attention')).toContainText(
      'Another session has control',
      { timeout: 10000 },
    );
    const before = await readWorld(second, mid);
    await second.waitForTimeout(1000);
    expect((await readWorld(second, mid)).interactive!.lease.holderId).toBe(
      before.interactive!.lease.holderId,
    );
    await expect
      .poll(
        async () =>
          (
            await (
              await second.request.get(
                `${rtsOrigin}/api/interactive/${mid}/status`,
              )
            ).json()
          ).leaseState,
        { timeout: 38000, intervals: [1000] },
      )
      .toBe('expired');
    await second.waitForTimeout(5500);
    expect((await readWorld(second, mid)).interactive!.lease.holderId).toBe(
      before.interactive!.lease.holderId,
    );
    await demoAction(second, 'Take control');
    await expect(
      second.getByRole('button', { name: 'Pause', exact: true }).first(),
    ).toBeEnabled({ timeout: 10000 });
    await endDemo(second);
  } finally {
    await other.close();
  }
});

test('disconnect retains committed frame and truthful connection notice through recovery', async ({
  page,
  context,
}) => {
  test.setTimeout(50000);
  let offline = false;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket('**/api/missions/*/stream', (socket) => {
    sockets.push(socket);
    if (offline) socket.close();
    else socket.connectToServer();
  });
  await newDemo(page);
  offline = true;
  sockets.forEach((s) => s.close());
  await context.setOffline(true);
  await expect(page.locator('.connection-state')).toHaveText('STALE');
  await expect(page.locator('.operational-attention')).toContainText(
    'Connection',
  );
  const sequence = await page
    .locator('.tactical-view')
    .getAttribute('data-sequence');
  await page.waitForTimeout(2200);
  expect(
    await page.locator('.tactical-view').getAttribute('data-sequence'),
  ).toBe(sequence);
  await page.screenshot({ path: resolve(evidence, 'disconnected.png') });
  offline = false;
  await context.setOffline(false);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED', {
    timeout: 15000,
  });
  await endDemo(page);
});
