import { expect, test } from '@playwright/test';
import { advanceFixture, loadFixture, tabAction } from './actions';
import { openCommand, analyticViews } from '../support/analytics-ui.mjs';
import {
  externalFixture,
  submitSimulation,
} from '../support/simulation-ui.mjs';

const base = 'http://127.0.0.1:5182';
test('rendered profile hover survives pointer movement, corrections and resize; removal clears it', async ({
  page,
}) => {
  await page.goto(base);
  await loadFixture(page, 'Synthetic Tactical');
  let frame = await (
    await page.request.get(`${base}/api/missions/fixture-tactical/world`)
  ).json();
  for (let i = 0; frame.sequence % 3 !== 0 && i < 3; i++)
    frame = await advanceFixture(page, 'fixture-tactical');
  expect(frame.sequence % 3).toBe(0);
  const commands: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/(commands|intents)$/.test(r.url()))
      commands.push(r.url());
  });
  const pane = await openCommand(page);
  await pane.getByLabel('Shared entity search').fill('F-01');
  await pane
    .getByRole('button', { name: 'Vertical profile', exact: true })
    .click();
  const readout = pane.locator('[data-analytic-frame]');
  await expect(readout).toHaveAttribute('data-analytic-frame', frame.frameId);
  const chart = pane.locator('.analytic-chart');
  const tooltip = chart.getByRole('tooltip');
  // Locate actual marker pixels and inspect the library-owned visible tooltip;
  // no mocked dispatch or private chart metadata supplies the hit coordinates.
  const pixels = () =>
    chart.evaluate((host) => {
      let x = 0,
        y = 0,
        count = 0;
      for (const canvas of host.querySelectorAll('canvas')) {
        const ctx = canvas.getContext('2d')!;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const bounds = canvas.getBoundingClientRect();
        for (let i = 0; i < data.length; i += 4) {
          if (
            Math.abs(data[i] - 123) < 8 &&
            Math.abs(data[i + 1] - 200) < 8 &&
            Math.abs(data[i + 2] - 238) < 8 &&
            data[i + 3] > 220
          ) {
            x +=
              bounds.x +
              ((((i / 4) % canvas.width) + 0.5) * bounds.width) / canvas.width;
            y +=
              bounds.y +
              ((Math.floor(i / 4 / canvas.width) + 0.5) * bounds.height) /
                canvas.height;
            count++;
          }
        }
      }
      return { point: count ? { x: x / count, y: y / count } : null };
    });
  const hover = async () => {
    await chart.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(tooltip).toBeHidden();
    await expect.poll(async () => (await pixels()).point).not.toBeNull();
    const before = await pixels(),
      point = before.point!;
    await page.mouse.move(point.x, point.y);
    await expect(tooltip).toBeVisible();
    // A tooltip confined over its own marker must not disappear on tiny motion.
    await page.mouse.move(point.x + 0.25, point.y);
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Current presentation\nF-01\n');
    await expect(tooltip).toContainText('Altitude: 120.00 m');
    await expect(tooltip).toContainText(
      frame.tracks['fixture-tactical-friendly-01-track'].latest.timestamp,
    );
    const tipBounds = (await tooltip.boundingBox())!,
      chartBounds = (await chart.boundingBox())!;
    expect(tipBounds.x).toBeGreaterThanOrEqual(chartBounds.x);
    expect(tipBounds.y).toBeGreaterThanOrEqual(chartBounds.y);
    expect(tipBounds.x + tipBounds.width).toBeLessThanOrEqual(
      chartBounds.x + chartBounds.width,
    );
    expect(tipBounds.y + tipBounds.height).toBeLessThanOrEqual(
      chartBounds.y + chartBounds.height,
    );
    return point;
  };
  const point = await hover();
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.selection-details')).toContainText('F-01');
  await tabAction(page, 'Details', 'Close view');
  frame = await advanceFixture(page, 'fixture-tactical');
  await expect(readout).toHaveAttribute('data-analytic-frame', frame.frameId);
  await hover();
  await page.setViewportSize({ width: 820, height: 900 });
  await hover();
  frame = await advanceFixture(page, 'fixture-tactical');
  await expect(readout).toHaveAttribute('data-analytic-frame', frame.frameId);
  await expect(pane.getByRole('table')).toContainText('0 compatible');
  await expect(tooltip).toBeHidden();
  await expect.poll(async () => (await pixels()).point).toBeNull();
  expect(commands).toEqual([]);
});

test('Command Picture uses shared filters, profile selection, numeric inspection and docking', async ({
  page,
}) => {
  await page.goto(base);
  await loadFixture(page, 'Synthetic Observations');
  const calls: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST') calls.push(r.url());
  });
  const pane = await openCommand(page);
  await pane.getByLabel('Shared entity search').fill('F-01');
  await expect(pane.getByText('1 filtered / 6 mission entities')).toBeVisible();
  await pane.getByLabel('Shared entity search').fill('');
  const { separate } = await analyticViews(page);
  await expect(separate.getByText(/Axis:/)).toContainText('MSL');
  expect(calls.every((url) => url.endsWith('/audit-query'))).toBe(true);
  await tabAction(page, 'Vertical Profile', 'Close view');
  await expect(separate).toHaveCount(0);
  await pane.getByRole('button', { name: 'Open profile to side' }).click();
  await expect(separate).toBeVisible();
});
test('external audit retains native MSL, exact request identities and no managed BLUE resources', async ({
  page,
}) => {
  await page.goto(base);
  const body = externalFixture();
  await submitSimulation(page, body);
  await page
    .getByRole('button', { name: 'Inspect mapped mission', exact: true })
    .click();
  await expect(page.locator('.mission-name')).toContainText(body.mission_id);
  const pane = await openCommand(page);
  await pane.getByRole('button', { name: 'Resources', exact: true }).click();
  await expect(pane).toContainText(
    '0 filtered / 0 mission managed Asset records',
  );
  await pane
    .getByRole('button', { name: 'Recorded activity', exact: true })
    .click();
  await expect(pane.locator('.audit-list')).toContainText(
    body.command.command_id,
  );
  await expect(pane.locator('.audit-list')).toContainText('MUTUAL_EFFECT');
  await pane.getByLabel('Audit search').fill('no-such-identity');
  await pane.getByRole('button', { name: 'Read range', exact: true }).click();
  await expect(pane).toContainText('No matching recorded rows');
  await pane
    .getByRole('button', { name: 'Vertical profile', exact: true })
    .click();
  await expect(pane.getByText(/Axis:/)).toContainText('MSL');
  await loadFixture(page, 'Synthetic Alpha');
  await expect(pane).not.toContainText(body.command.command_id);
});
test('analytics keyboard and narrow layouts retain usable controls at 760, 820 and 900', async ({
  page,
}) => {
  await page.goto(base);
  await loadFixture(page, 'Synthetic Observations');
  const pane = await openCommand(page);
  for (const width of [760, 820, 900]) {
    await page.setViewportSize({ width, height: 900 });
    const button = pane.getByRole('button', {
      name: 'Comparison',
      exact: true,
    });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(
      pane.getByRole('heading', { name: 'Compare selected entities' }),
    ).toBeVisible();
    await pane.getByLabel('Add to comparison').selectOption({ label: 'F-01' });
    await expect(pane.getByRole('table').last()).toContainText('F-01');
    await pane.getByRole('button', { name: 'Clear selection' }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
