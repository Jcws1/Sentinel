import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openSimulation, submitSimulation } from '../support/simulation-ui.mjs';

const base = 'http://127.0.0.1:5182';
const inputs = resolve('../backend/tests/fixtures/assessment');

function dataset(name: string) {
  const body = JSON.parse(readFileSync(resolve(inputs, name), 'utf8'));
  body.mission_id = `ASSESSMENT-BROWSER-${randomUUID()}`;
  body.command.command_id = `ASSESSMENT-COMMAND-${randomUUID()}`;
  return body;
}

test('reviewer can submit shifted observations with gaps, inspect them and retry without another frame', async ({
  page,
}) => {
  // Three editor imports plus mapped inspection; each uses the normal UI path.
  test.setTimeout(60000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const baseline = dataset('baseline.json');
  const variant = dataset('variant.json');
  const manifest = JSON.parse(
    readFileSync(resolve(inputs, 'manifest.json'), 'utf8'),
  );
  await page.goto(base);
  await submitSimulation(page, baseline);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/simulation/v1/commands') &&
      response.request().method() === 'POST',
  );
  const outcome = await submitSimulation(page, variant);
  const response = await responsePromise;
  expect(response.headers()['x-sentinel-trace']).toMatch(/^[a-f0-9]{32}$/);
  expect(Object.keys(outcome.results_by_timestamp)).toHaveLength(6);
  const runs = await (
    await page.request.get(`${base}/api/simulation/v1/runs`)
  ).json();
  const run = runs.find(
    (item: { externalMissionId: string }) =>
      item.externalMissionId === variant.mission_id,
  );
  const worldUrl = `${base}/api/missions/${run.missionId}/world`;
  const before = await (await page.request.get(worldUrl)).json();
  const entities = Object.values(before.entities) as {
    label: string;
    presence: string;
  }[];
  expect(entities).toHaveLength(40);
  expect(
    entities
      .filter((entity) => entity.presence === 'unobserved')
      .map((entity) => entity.label)
      .sort(),
  ).toEqual(manifest.expected_final_unobserved);
  const pane = page.locator('[data-view="simulation"]');
  await pane.getByRole('button', { name: 'Inspect mapped mission' }).click();
  await expect(page.locator('.mission-name')).toContainText(variant.mission_id);
  await page
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-view="tracks"]')).toContainText('OBS-001');
  expect(await submitSimulation(page, variant)).toEqual(outcome);
  expect(await (await page.request.get(worldUrl)).json()).toEqual(before);
  const metricsResponse = await page.request.get(
    `${base}/api/diagnostics/metrics`,
  );
  expect(metricsResponse.ok()).toBe(true);
  const metrics = await metricsResponse.json();
  expect(metrics.counters['simulation.recorded']).toBeGreaterThanOrEqual(2);
  expect(metrics.counters['simulation.retry_returned']).toBeGreaterThanOrEqual(
    1,
  );
  expect(metrics.durations_ms['simulation.submit'].max).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('invalid reviewer input is explained in the UI and creates no recorded run', async ({
  page,
}) => {
  const body = dataset('invalid.json');
  await page.goto(base);
  const pane = await openSimulation(page);
  await pane
    .getByRole('textbox', { name: 'External request JSON' })
    .fill(JSON.stringify(body));
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/simulation/v1/commands') &&
      response.request().method() === 'POST',
  );
  await pane.getByRole('button', { name: /^Submit / }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(422);
  expect(response.headers()['x-sentinel-trace']).toMatch(/^[a-f0-9]{32}$/);
  await expect(pane.locator('[role="alert"]')).toContainText('latitude_deg');
  await expect(pane.locator('[role="alert"]')).toBeFocused();
  const runs = await (
    await page.request.get(`${base}/api/simulation/v1/runs`)
  ).json();
  expect(
    runs.some(
      (item: { externalMissionId: string }) =>
        item.externalMissionId === body.mission_id,
    ),
  ).toBe(false);
});
