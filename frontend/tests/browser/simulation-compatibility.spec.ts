import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  abortSimulation,
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
  await pane.getByRole('textbox', { name: 'External request JSON' }).fill(raw);
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
    pane.getByRole('textbox', { name: 'External request JSON' }),
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
    await pane.getByRole('textbox', { name: 'External request JSON' }).focus();
    await expect(
      pane.getByRole('textbox', { name: 'External request JSON' }),
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
    .getByRole('textbox', { name: 'External request JSON' })
    .fill(JSON.stringify(bad));
  // A draft outside the v1 schema has no previewable identity; the pane says so.
  await expect(pane).toContainText('not a readable v1 request');
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

for (const [name, polygon, position] of [
  [
    'mixed-scale R3-1',
    [
      [0, 0],
      [2e-170, 2e-170],
      [1e-170, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
    [0.5, 0.5],
  ],
  [
    'decimal-view spike',
    [
      [0, 0],
      [0.6000000000000001, 2],
      [0.30000000000000004, 1],
      [-1, 1],
      [0, 0],
    ],
    [-0.2, 0.8],
  ],
] as const) {
  test(`externally valid ${name} area completes the mapped mission in the browser`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const body = externalFixture();
    body.area.polygon = polygon.map(([x, y]) => [
      x,
      y,
    ]) as typeof body.area.polygon;
    for (const row of Object.values(body.samples_by_timestamp)[0] as {
      longitude_deg: number;
      latitude_deg: number;
    }[]) {
      [row.longitude_deg, row.latitude_deg] = position;
    }
    await page.goto(base);
    const result = await submitSimulation(page, body);
    const outcome = Object.values(result.results_by_timestamp)[0] as {
      interactions: { outcome: string }[];
    };
    expect(outcome.interactions.map((i) => i.outcome)).toEqual([
      'MUTUAL_EFFECT',
    ]);
    const pane = page.locator('[data-view="simulation"]');
    await pane.getByRole('button', { name: 'Inspect mapped mission' }).click();
    await expect(page.locator('.mission-name')).toContainText(body.mission_id);
    await page
      .getByRole('button', { name: 'Open Tracks', exact: true })
      .first()
      .click();
    // Tracks render only after the frontend decoder accepted the exact zone.
    await expect(page.locator('[data-view="tracks"]')).toContainText(
      'BLUE-001',
    );
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
    expect(
      (Object.values(world.zones)[0] as { geometry: { coordinates: unknown } })
        .geometry.coordinates,
    ).toEqual([polygon]);
    expect(errors).toEqual([]);
  });
}

test('spec section 9 defensive sequence: HOLD with samples, RESUME, ABORT and recorded commands', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const dataset = JSON.parse(
    readFileSync(
      resolve('tests/fixtures/simulation/defensive-s9.json'),
      'utf8',
    ),
  );
  const north = dataset.missions[0];
  const [start, hold, resume] = north.commands;
  await page.goto(base);
  const started = await submitSimulation(page, start);
  expect(started.command_ack.run_status).toBe('RUNNING');
  const pane = page.locator('[data-view="simulation"]');
  await pane.getByRole('button', { name: 'Inspect mapped mission' }).click();
  await expect(page.locator('.mission-name')).toContainText(north.missionId);
  await page
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .first()
    .click();
  await expect(page.locator('[data-view="tracks"]')).toContainText('B-N-EDGE');
  const held = await submitSimulation(page, hold);
  expect(held.command_ack.run_status).toBe('HELD');
  expect(held.results_by_timestamp).toEqual({});
  await expect(pane.locator('.simulation-notice')).toContainText('HELD');
  // Focus stays on the control that was used; it never falls to the page.
  await expect(pane.getByRole('button', { name: /^Submit / })).toBeFocused();
  const resumed = await submitSimulation(page, resume);
  expect(resumed.command_ack.run_status).toBe('RUNNING');
  // ABORT is terminal: the first press only asks, and "Keep run" changes nothing.
  const abort = pane.getByRole('button', {
    name: 'ABORT external run',
    exact: true,
  });
  await abort.click();
  await expect(
    page.getByRole('alertdialog').getByRole('button', { name: 'Keep run' }),
  ).toBeFocused();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep run' })
    .click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(abort).toBeFocused();
  await expect(pane).toContainText('RUNNING · ready');
  await abortSimulation(page);
  await expect(abort).toBeDisabled();
  await expect(pane).toContainText(
    'ABORTED · ready · NOTIONAL · recording finalized',
  );
  // The finalized mapped mission no longer reads as a live picture: the state
  // is a whole tag beside the truncating mission name, and on the map itself.
  await pane.getByRole('button', { name: 'Inspect mapped mission' }).click();
  const finalizedTag = page
    .locator('.mission-controls')
    .getByText('RECORDING FINALIZED · ABORTED', { exact: true });
  const wholeAndUnclipped = () =>
    finalizedTag.evaluate((tag) => {
      const box = tag.getBoundingClientRect();
      for (let node = tag.parentElement; node; node = node.parentElement) {
        if (getComputedStyle(node).overflowX === 'visible') continue;
        const clip = node.getBoundingClientRect();
        if (box.left < clip.left - 0.5 || box.right > clip.right + 0.5)
          return false;
      }
      return box.right <= innerWidth && tag.scrollWidth <= tag.clientWidth;
    });
  await expect(finalizedTag).toBeVisible();
  expect(await wholeAndUnclipped()).toBe(true);
  await page.setViewportSize({ width: 760, height: 900 });
  await expect(finalizedTag).toBeVisible();
  expect(await wholeAndUnclipped()).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.mission-picker')).toHaveAttribute(
    'title',
    /ABORTED · recording finalized$/,
  );
  await expect(page.locator('.map-status').first()).toContainText(
    'RECORDING FINALIZED · ABORTED',
  );
  await page
    .getByRole('button', { name: 'Open Tracks', exact: true })
    .first()
    .click();
  const tracks = page.locator('[data-view="tracks"]');
  await expect(tracks).toContainText('RECORDING FINALIZED · ABORTED');
  await expect(tracks).toContainText('Last recorded');
  await openSimulation(page);
  await pane
    .getByRole('button', { name: 'Load recorded commands', exact: true })
    .click();
  const commands = pane.getByRole('combobox', {
    name: 'Recorded command',
    exact: true,
  });
  await expect(commands.locator('option')).toHaveCount(5);
  await commands.selectOption(start.command.command_id);
  const outcome = pane.getByRole('region', {
    name: 'Recorded simulation outcome',
  });
  await expect(outcome).toContainText(
    'S9-N-START · run state recorded with this command: RUNNING',
  );
  const timestamp = outcome.getByRole('combobox', {
    name: 'Source timestamp (UTC)',
  });
  await timestamp.selectOption('2026-10-01T06:01:00.000Z');
  await expect(outcome).toContainText('28 interactions');
  await expect(outcome).toContainText('B-N-EDGE');
  await expect(outcome).toContainText('R-N-APEX');
  // Who reached zero health at T+02:00 is visible without opening raw JSON.
  await timestamp.selectOption('2026-10-01T06:02:00.000Z');
  await expect(outcome).toContainText('6 reached zero health');
  for (const drone of ['B-N-02', 'B-N-04', 'R-N-05-004'])
    await expect(
      outcome.getByRole('row').filter({ hasText: drone }).first(),
    ).toContainText('DISABLED');
  // RESUME's supplied-health correction is shown with its drone.
  await commands.selectOption(resume.command.command_id);
  await expect(outcome).toContainText('1 supplied correction');
  await expect(
    outcome
      .getByRole('row')
      .filter({ hasText: north.repairedOnResume })
      .first(),
  ).toContainText('Yes: supplied health differs from the last recorded output');
  expect(errors).toEqual([]);
});

test('spec section 9 editor ABORT asks first, and recorded commands follow the selected run', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let posts = 0;
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url().endsWith('/simulation/v1/commands')
    )
      posts++;
  });
  const dataset = JSON.parse(
    readFileSync(
      resolve('tests/fixtures/simulation/defensive-s9.json'),
      'utf8',
    ),
  );
  // The §9 batches under new identities: this backend already recorded the
  // dataset's own IDs in the sequence test above.
  const tag = randomUUID();
  const [north, south] = dataset.missions;
  const renamed = (body: (typeof north.commands)[number]) => {
    const copy = structuredClone(body);
    copy.mission_id = `${copy.mission_id}-${tag}`;
    copy.command.command_id = `${copy.command.command_id}-${tag}`;
    return copy;
  };
  const southAbort = renamed(south.commands[3]);
  await page.goto(base);
  await submitSimulation(page, renamed(north.commands[0]));
  const pane = page.locator('[data-view="simulation"]');
  await pane
    .getByRole('button', { name: 'Load recorded commands', exact: true })
    .click();
  const commands = pane.getByRole('combobox', {
    name: 'Recorded command',
    exact: true,
  });
  await expect(commands.locator('option')).toHaveCount(2);
  // A command committed for the selected run joins its loaded list.
  await pane
    .getByRole('button', { name: 'HOLD external run', exact: true })
    .click();
  await expect(pane.locator('.simulation-notice')).toContainText(
    'committed · HELD',
  );
  await expect(commands.locator('option')).toHaveCount(3);
  await expect(commands.locator('option').last()).toContainText('HOLD');
  // Another run's START never leaves the north list under the south run.
  await submitSimulation(page, renamed(south.commands[0]));
  await expect(pane).toContainText('RUNNING · ready');
  await expect(commands).toHaveCount(0);
  // An ABORT batch from the editor is terminal: it asks first, like ABORT.
  await pane
    .getByRole('textbox', { name: 'External request JSON' })
    .fill(JSON.stringify(southAbort, null, 2));
  const submitAbort = pane.getByRole('button', {
    name: 'Submit ABORT',
    exact: true,
  });
  const sent = posts;
  await submitAbort.click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText(`ABORT ${southAbort.mission_id}?`);
  await expect(dialog).toContainText('cannot be held or resumed');
  await expect(dialog.getByRole('button', { name: 'Keep run' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(submitAbort).toBeFocused();
  expect(posts).toBe(sent);
  await expect(pane).toContainText('RUNNING · ready');
  await page.keyboard.press('Enter');
  await dialog
    .getByRole('button', { name: 'Confirm ABORT', exact: true })
    .click();
  await expect(pane.locator('.simulation-notice')).toContainText(
    `${southAbort.command.command_id}: ABORT committed · ABORTED`,
  );
  expect(posts).toBe(sent + 1);
  await expect(submitAbort).toBeFocused();
  expect(errors).toEqual([]);
});
