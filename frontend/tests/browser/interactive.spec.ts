import { test, expect, type Page, type WebSocketRoute } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tabAction } from './actions';

// Authority headers must never be retained in network trace archives.
test.use({ trace: 'off' });

const origin = 'http://127.0.0.1:5182';
const evidence = resolve('../docs/m1.1/evidence');
async function tracks(page: Page) {
  await page
    .getByRole('navigation', { name: 'Activity Bar' })
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .click();
}
async function action(page: Page, name: string, keyboard = false) {
  const trigger = page.getByRole('button', { name: 'Simulation', exact: true });
  await trigger.focus();
  if (keyboard) await page.keyboard.press('Enter');
  else await trigger.click();
  const item = page.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeEnabled({ timeout: 12_000 });
  if (keyboard) {
    await item.focus();
    await page.keyboard.press('Enter');
  } else await item.click();
  if (name === 'End')
    await expect(page.locator('[data-run-state]')).toHaveAttribute(
      'data-run-state',
      'ended',
    );
}
async function world(page: Page) {
  const id = await page
    .locator('.tracks-browser')
    .getAttribute('data-frame-id');
  const entry = await (
    await page.request.get(`${origin}/api/interactive/entry`)
  ).json();
  return {
    entry,
    frame: entry.activeMissionId
      ? await (
          await page.request.get(
            `${origin}/api/missions/${entry.activeMissionId}/world`,
          )
        ).json()
      : undefined,
    id,
  };
}
async function newRun(page: Page) {
  await page.goto(origin);
  await tracks(page);
  await action(page, 'New demo run', true);
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ready',
  );
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED');
}
test.beforeEach(async () => {
  await mkdir(evidence, { recursive: true });
});

test('complete operator workflow, actual pause over 30 seconds, keyboard and narrow split', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await newRun(page);
  const first = (await world(page)).frame;
  await page.getByRole('button', { name: 'Fleet', exact: true }).click();
  await expect(page.locator('[data-field="total-entities"]')).toHaveText('4');
  await expect(page.locator('.tracks-table tbody tr')).toHaveCount(4);
  await action(page, 'Acquire control', true);
  await expect(page.locator('.simulation-status')).toContainText(
    'You have control',
  );
  await action(page, 'Start', true);
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await expect
    .poll(async () => (await world(page)).frame.interactive.tick)
    .toBeGreaterThan(1);
  await action(page, 'Pause', true);
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'paused',
  );
  const paused = (await world(page)).frame;
  await page.screenshot({ path: resolve(evidence, 'desktop-paused.png') });
  // This is elapsed real time, not an accelerated browser clock or fixture control.
  await page.waitForTimeout(31_500);
  const longPause = (await world(page)).frame;
  expect(longPause.effectiveAt).toBe(paused.effectiveAt);
  expect(longPause.interactive.tick).toBe(paused.interactive.tick);
  expect(longPause.interactive.lease.revision).toBeGreaterThan(
    paused.interactive.lease.revision,
  );
  await action(page, 'Resume', true);
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await tabAction(page, 'Tactical Map', 'Open to Side');
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator('.tracks-browser')).toBeVisible();
  // Fleet is table-only: opposing and unmanaged friendly Entities remain on the map.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const probe = (
          window as unknown as {
            __sentinelMapTest?: {
              inspect: (id: string) => { entityIds: string[] };
            };
          }
        ).__sentinelMapTest;
        return probe?.inspect('tactical')?.entityIds?.length;
      }),
    )
    .toBe(5);
  await page.getByRole('button', { name: 'Simulation', exact: true }).click();
  await page.screenshot({ path: resolve(evidence, 'narrow-split-menu.png') });
  const accessibility = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await action(page, 'End', true);
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ended',
  );
  const oldText = await (
    await page.request.get(`${origin}/api/missions/${first.mission.id}/world`)
  ).text();
  const oldMetadata = await (
    await page.request.get(`${origin}/api/recordings/${first.recordingId}`)
  ).json();
  await action(page, 'New demo run', true);
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ready',
  );
  const second = (await world(page)).frame;
  expect(second.mission.id).not.toBe(first.mission.id);
  expect(second.recordingId).not.toBe(first.recordingId);
  expect(second.interactive.runId).not.toBe(first.interactive.runId);
  expect(
    await (
      await page.request.get(`${origin}/api/missions/${first.mission.id}/world`)
    ).text(),
  ).toBe(oldText);
  expect(
    await (
      await page.request.get(`${origin}/api/recordings/${first.recordingId}`)
    ).json(),
  ).toEqual(oldMetadata);
  await page.screenshot({ path: resolve(evidence, 'narrow-new-run.png') });
  await action(page, 'Acquire control');
  await action(page, 'End');
  expect(errors).toEqual([]);
});

test('lost creation and command replies reconcile through reload without new identities', async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto(origin);
  await tracks(page);
  let creationId = '',
    commandId = '';
  await page.route('**/api/interactive/runs', async (route) => {
    creationId = route.request().postDataJSON().creationId;
    await route.fetch();
    await route.abort();
  });
  await action(page, 'New demo run');
  await expect(
    page.getByRole('button', { name: 'Reconcile request' }),
  ).toBeVisible();
  await page.reload();
  await tracks(page);
  await page.getByRole('button', { name: 'Reconcile request' }).click();
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ready',
  );
  await page.unroute('**/api/interactive/runs');
  expect(
    (
      await (
        await page.request.get(
          `${origin}/api/interactive/creations/${creationId}`,
        )
      ).json()
    ).accepted,
  ).toBe(true);
  await action(page, 'Acquire control');
  const mid = (await world(page)).entry.activeMissionId;
  await page.route('**/api/interactive/*/commands', async (route) => {
    const body = route.request().postDataJSON();
    if (body.intent.action !== 'start') return route.continue();
    commandId = body.commandId;
    await route.fetch();
    await route.abort();
  });
  await action(page, 'Start');
  await expect(page.locator('.simulation-status')).toContainText(
    'Outcome unknown',
  );
  await page.screenshot({ path: resolve(evidence, 'lost-response.png') });
  await page.unroute('**/api/interactive/*/commands');
  let retriedId = '';
  page.on('request', (r) => {
    if (
      r.url().endsWith('/commands') &&
      r.postDataJSON()?.intent.action === 'start'
    )
      retriedId = r.postDataJSON().commandId;
  });
  await page.getByRole('button', { name: 'Retry saved request' }).click();
  await expect(
    page.getByRole('button', { name: 'Reconcile request' }),
  ).toHaveCount(0);
  expect(retriedId).toBe(commandId);
  const events = await (
    await page.request.get(`${origin}/api/missions/${mid}/events?limit=500`)
  ).json();
  expect(
    events.events.filter(
      (e: { type: string }) => e.type === 'interactive.start',
    ),
  ).toHaveLength(1);
  await action(page, 'End');
});

test('navigation preserves the run, a second session cannot take over and reclaim is explicit after expiry', async ({
  page,
  browser,
}) => {
  test.setTimeout(65_000);
  await newRun(page);
  await action(page, 'Acquire control');
  await action(page, 'Start');
  const mid = (await world(page)).entry.activeMissionId;
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Synthetic Alpha', exact: true })
    .click();
  await expect(page.locator('.simulation-status')).toContainText('active run');
  const other = await browser.newContext();
  try {
    const second = await other.newPage();
    await second.goto(origin);
    await tracks(second);
    await action(second, 'Reopen active run');
    await expect(second.locator('.simulation-status')).toContainText(
      'Control held by Operator',
    );
    await second
      .getByRole('button', { name: 'Simulation', exact: true })
      .click();
    await expect(
      second.getByRole('menuitem', { name: /^Acquire control/ }),
    ).toBeDisabled();
    await second.keyboard.press('Escape');
    await expect
      .poll(
        async () =>
          (
            await (
              await second.request.get(
                `${origin}/api/interactive/${mid}/status`,
              )
            ).json()
          ).leaseState,
        { timeout: 38_000, intervals: [1000] },
      )
      .toBe('expired');
    await expect(second.locator('.simulation-status')).toContainText(
      'Control expired',
      { timeout: 10_000 },
    );
    await action(second, 'Reclaim control', true);
    await expect(second.locator('.simulation-status')).toContainText(
      'You have control',
    );
    await action(second, 'Pause');
    await action(second, 'End');
  } finally {
    await other.close();
  }
});

test('disconnected run retains its frame and labels source state unverified until recovery', async ({
  page,
  context,
}) => {
  test.setTimeout(50_000);
  let offline = false;
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket('**/api/missions/*/stream', (socket) => {
    sockets.push(socket);
    if (offline) socket.close();
    else socket.connectToServer();
  });
  await newRun(page);
  await action(page, 'Acquire control');
  await action(page, 'Start');
  await expect(page.locator('.simulation-status')).toContainText(
    'Stationary source running',
  );
  offline = true;
  sockets.forEach((socket) => socket.close());
  await context.setOffline(true);
  await expect(page.locator('.connection-state')).toHaveText('STALE');
  await expect(page.locator('.simulation-status')).toContainText(
    'Source state unverified · last known running',
  );
  await page.waitForTimeout(12_000);
  await expect(page.locator('.simulation-status')).not.toContainText(
    'Stationary source running',
  );
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'running',
  );
  await page.screenshot({ path: resolve(evidence, 'source-unverified.png') });
  offline = false;
  await context.setOffline(false);
  await expect(page.locator('.connection-state')).toHaveText('CONNECTED', {
    timeout: 15_000,
  });
  await expect(page.locator('.simulation-status')).toContainText(
    'Stationary source running',
    { timeout: 15_000 },
  );
  await action(page, 'End');
});
