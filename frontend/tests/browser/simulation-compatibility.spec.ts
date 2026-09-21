import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  externalFixture,
  openSimulation,
  simulationFlow,
  submitSimulation,
} from '../support/simulation-ui.mjs';
const simulationStorageKey = 'sentinel.simulation.session.v1';

const base = 'http://127.0.0.1:5182';
test('external non-default 40-unit submission, lifecycle and recorded inspection', async ({
  page,
}) => {
  await simulationFlow(
    page,
    base,
    resolve('test-results/browser/simulation-remote'),
    'remote40',
  );
});

test('external lost response preserves exact pending body across reload and commits once', async ({
  page,
}) => {
  const body = externalFixture();
  const raw = JSON.stringify(body, null, 3);
  await page.goto(base);
  const pane = await openSimulation(page);
  await pane
    .getByRole('textbox', { name: 'External simulation request JSON' })
    .fill(raw);
  let firstBody = '';
  await page.route('**/api/simulation/v1/commands', async (route) => {
    firstBody = route.request().postData()!;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await pane.getByRole('button', { name: 'Submit START', exact: true }).click();
  await expect(pane.locator('.simulation-notice')).toContainText(
    'Pending identity and body retained',
  );
  expect(firstBody).toBe(raw);
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    simulationStorageKey,
  );
  expect(saved.pending).toBe(raw);
  await page.unroute('**/api/simulation/v1/commands');
  await page.reload();
  await openSimulation(page);
  await expect(
    pane.getByRole('textbox', { name: 'External simulation request JSON' }),
  ).toBeDisabled();
  const retried = page.waitForRequest(
    (request) =>
      request.url().endsWith('/simulation/v1/commands') &&
      request.method() === 'POST',
  );
  await pane
    .getByRole('button', { name: 'Retry exact pending command' })
    .click();
  expect((await retried).postData()).toBe(raw);
  await expect(pane.locator('.simulation-notice')).toContainText('committed');
  const runs = await (
    await page.request.get(`${base}/api/simulation/v1/runs`)
  ).json();
  const run = runs.find(
    (item: { externalMissionId: string }) =>
      item.externalMissionId === body.mission_id,
  );
  const world = await (
    await page.request.get(`${base}/api/missions/${run.missionId}/world`)
  ).json();
  expect(world.sequence).toBe(1);
  expect(
    world.recentEvents.filter(
      (event: { type: string }) => event.type === 'simulation.v1.interaction',
    ),
  ).toHaveLength(1);
});

test('external input rejection, narrow layouts and keyboard operation', async ({
  page,
}) => {
  await page.goto(base);
  const body = externalFixture('local40');
  await submitSimulation(page, body);
  const pane = page.locator('[data-view="simulation"]');
  for (const width of [760, 820, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(pane).toBeVisible();
    await pane
      .getByRole('textbox', { name: 'External simulation request JSON' })
      .focus();
    await expect(
      pane.getByRole('textbox', { name: 'External simulation request JSON' }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  const bad = {
    ...structuredClone(body),
    command: {
      ...body.command,
      command_id: randomUUID(),
      action: 'HOLD',
      source_mode: 'LIVE',
    },
  };
  await pane
    .getByRole('textbox', { name: 'External simulation request JSON' })
    .fill(JSON.stringify(bad));
  await pane.getByRole('button', { name: /^Submit / }).click();
  await expect(pane.locator('[role="alert"]')).toContainText(
    '/command/source_mode',
  );
  await expect(pane.locator('[role="alert"]')).toBeFocused();
  const runs = await (
    await page.request.get(`${base}/api/simulation/v1/runs`)
  ).json();
  expect(
    runs.find(
      (item: { externalMissionId: string }) =>
        item.externalMissionId === body.mission_id,
    ).state,
  ).toBe('RUNNING');
});
