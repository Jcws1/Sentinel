/* global URL, structuredClone */
import { expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export function externalFixture(kind = 'golden') {
  const path =
    kind === 'golden'
      ? '../contracts/simulation/fixtures/golden.request.json'
      : `tests/fixtures/simulation/${kind}.json`;
  const body = JSON.parse(readFileSync(resolve(path), 'utf8'));
  body.mission_id = `UI-${kind}-${randomUUID()}`;
  body.command.command_id = `CMD-${randomUUID()}`;
  return body;
}

export async function openSimulation(page) {
  await page
    .getByRole('button', { name: 'Open Simulation', exact: true })
    .first()
    .click();
  return page.locator('[data-view="simulation"]');
}

export async function submitSimulation(page, body) {
  const pane = await openSimulation(page);
  const raw = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  await pane.getByRole('textbox', { name: 'External request JSON' }).fill(raw);
  const committed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/simulation/v1/commands') &&
      response.request().method() === 'POST',
  );
  await pane.getByRole('button', { name: /^Submit / }).click();
  const response = await committed;
  expect(response.status()).toBe(200);
  const result = await response.json();
  expect(result.command_ack.status).toBe('SUCCEEDED');
  await expect(pane.locator('.simulation-notice')).toContainText('committed');
  return result;
}

/** ABORT is terminal, so the pane asks for confirmation first. */
export async function abortSimulation(page) {
  const pane = page.locator('[data-view="simulation"]');
  await pane
    .getByRole('button', { name: 'ABORT external run', exact: true })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('cannot be held or resumed');
  await dialog
    .getByRole('button', { name: 'Confirm ABORT', exact: true })
    .click();
  await expect(pane.locator('.simulation-notice')).toContainText(
    'committed · ABORTED',
  );
}

export async function simulationFlow(
  page,
  base,
  output,
  kind = 'remote40',
  capture = (path) => page.screenshot({ path }),
) {
  mkdirSync(output, { recursive: true });
  const errors = [],
    blockedExternal = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (
      !['127.0.0.1', 'localhost'].includes(url.hostname) &&
      !['data:', 'blob:'].includes(url.protocol)
    ) {
      blockedExternal.push(url.hostname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(base);
  const body = externalFixture(kind);
  const result = await submitSimulation(page, body);
  const runs = await (
    await page.request.get(`${base}/api/simulation/v1/runs`)
  ).json();
  const run = runs.find((item) => item.externalMissionId === body.mission_id);
  expect(run.phase).toBe('ready');
  const worldUrl = `${base}/api/missions/${run.missionId}/world`;
  const world = await (await page.request.get(worldUrl)).json();
  expect(Object.keys(world.entities)).toHaveLength(kind === 'golden' ? 2 : 40);
  expect(Object.keys(world.assets)).toHaveLength(0);
  expect(world.interactive).toBeUndefined();
  expect(
    Object.values(world.tracks).every(
      (track) => track.latest.position.altitude.reference === 'MSL',
    ),
  ).toBe(true);
  const pane = page.locator('[data-view="simulation"]');
  await pane.getByRole('button', { name: 'Inspect mapped mission' }).click();
  await expect(page.locator('.mission-name')).toContainText(body.mission_id);
  await page
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-view="tracks"]')).toContainText(
    kind === 'golden' ? 'BLUE-001' : 'BLUE-00001',
  );
  await page
    .locator('[data-view="tracks"] tr[data-entity-id]')
    .filter({ hasText: kind === 'golden' ? 'BLUE-001' : 'BLUE-00001' })
    .first()
    .click();
  await expect(
    page.getByRole('region', { name: 'External simulation detail' }),
  ).toContainText('NOTIONAL');
  await capture(resolve(output, 'mapped-tracks.png'));
  await openSimulation(page);
  await pane
    .getByRole('button', { name: 'HOLD external run', exact: true })
    .click();
  await expect(pane.locator('.simulation-notice')).toContainText(
    'committed · HELD',
  );
  const resumed = structuredClone(body);
  resumed.command.action = 'RESUME';
  resumed.command.command_id = randomUUID();
  resumed.command.source_mode = 'REPLAY';
  const resumedResult = await submitSimulation(page, resumed);
  expect(resumedResult.command_ack.run_status).toBe('RUNNING');
  await capture(resolve(output, 'resume-outcomes.png'));
  await abortSimulation(page);
  await expect(
    pane.getByRole('button', { name: 'HOLD external run', exact: true }),
  ).toBeDisabled();
  const end = await (await page.request.get(worldUrl)).json();
  expect(end.mission.lifecycle).toBe('completed');
  expect(
    Object.values(end.tracks).every((track) => track.source.mode === 'replay'),
  ).toBe(true);
  await page.reload();
  await openSimulation(page);
  await pane
    .getByRole('combobox', { name: 'Recorded run', exact: true })
    .selectOption(run.missionId);
  await expect(
    pane.getByRole('region', { name: 'Recorded simulation outcome' }),
  ).toContainText('ABORTED');
  await pane
    .getByRole('button', { name: 'Load recorded commands', exact: true })
    .click();
  await pane
    .getByRole('combobox', { name: 'Recorded command', exact: true })
    .selectOption(body.command.command_id);
  await expect(
    pane.getByRole('region', { name: 'Recorded simulation outcome' }),
  ).toContainText('MUTUAL_EFFECT');
  await capture(resolve(output, 'recorded-inspection.png'));
  expect(errors).toEqual([]);
  expect(blockedExternal).toEqual([]);
  return {
    body,
    result,
    run,
    resumedResult,
    worldSequence: end.sequence,
    pageErrors: errors,
    externalRequests: blockedExternal.length,
  };
}
