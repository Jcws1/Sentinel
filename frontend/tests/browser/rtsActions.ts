import { expect, type Page } from '@playwright/test';
import type { WorldFrame } from '../../src/contracts/generated';
export const rtsOrigin = 'http://127.0.0.1:5182';
export async function demoAction(page: Page, name: string) {
  await page
    .getByRole('button', { name: 'Simulation', exact: true })
    .first()
    .click();
  const item = page.getByRole('menuitem', { name, exact: true });
  await expect(item).toBeEnabled({ timeout: 15000 });
  await item.click();
}
export async function newDemo(page: Page) {
  await page.goto(rtsOrigin);
  const button = page
    .getByRole('button', { name: 'New demo', exact: true })
    .first();
  await expect(button).toBeEnabled({ timeout: 15000 });
  await button.click();
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'running',
    { timeout: 20000 },
  );
  await expect
    .poll(async () => (await readWorld(page)).interactive!.tick, {
      timeout: 10000,
    })
    .toBeGreaterThan(1);
  await expect(
    page.getByRole('button', { name: 'Pause', exact: true }).first(),
  ).toBeEnabled();
}
export async function readWorld(page: Page, mid?: string): Promise<WorldFrame> {
  const origin = new URL(page.url()).origin;
  mid ??= (
    await (await page.request.get(`${origin}/api/interactive/entry`)).json()
  ).activeMissionId;
  return (
    await page.request.get(
      `${origin}/api/missions/${encodeURIComponent(mid!)}/world`,
    )
  ).json();
}
export async function fleetSelect(page: Page, labels: string[]) {
  const fleetButton = page.locator('[data-activity-view="fleet"]');
  if ((await fleetButton.getAttribute('aria-expanded')) !== 'true')
    await fleetButton.click();
  for (const label of labels)
    await page
      .locator('.fleet-sidebar')
      .getByRole('checkbox', { name: `Select ${label}`, exact: true })
      .check();
}
export async function endDemo(page: Page) {
  await demoAction(page, 'End demo');
  await expect(page.locator('[data-run-state]').first()).toHaveAttribute(
    'data-run-state',
    'ended',
  );
}
export async function directClick(
  page: Page,
  x = 0.65,
  y = 0.55,
  id = 'tactical',
) {
  const canvas = page
    .locator(`.tactical-view[data-view-id="${id}"] canvas`)
    .first();
  const box = (await canvas.boundingBox())!;
  await canvas.click({
    button: 'right',
    position: { x: box.width * x, y: box.height * y },
  });
}
