import { expect, type Page } from '@playwright/test';

/** Fixtures advance through the opt-in backend authority; the product has no generator. */
export async function advanceFixture(page: Page, missionId: string) {
  const origin = new URL(page.url()).origin;
  const previousResponse = await page.request.get(
    `${origin}/api/missions/${missionId}/world`,
  );
  expect(previousResponse.ok()).toBe(true);
  const previous = await previousResponse.json();
  const committed = await page.request.post(
    `${origin}/api/fixtures/${missionId}/advance`,
    { data: { expectedSequence: previous.sequence } },
  );
  expect(committed.ok()).toBe(true);
  return committed.json();
}

export async function unloadMission(page: Page) {
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Unload mission', exact: true })
    .click();
}

export async function tabAction(page: Page, title: string, action: string) {
  await page
    .getByRole('tab', { name: title, exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}

export const closeTab = (page: Page, title: string) =>
  tabAction(page, title, 'Close view');
