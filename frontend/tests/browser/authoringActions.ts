import type { Locator, Page } from '@playwright/test';

export async function openAuthoringTab(page: Page, tab: 'Units' | 'Conductor') {
  await page
    .getByRole('button', { name: 'Open Orchestrator', exact: true })
    .first()
    .click();
  await page
    .locator('[data-view="orchestrator"]')
    .getByRole('tab', { name: tab, exact: true })
    .click();
}

export async function openScenarioFile(page: Page) {
  const disclosure = page.locator('.orchestrator-document');
  if (!(await disclosure.evaluate((el) => (el as HTMLDetailsElement).open)))
    await disclosure.locator(':scope > summary').click();
}
export async function openUnitsSettings(page: Page) {
  const disclosure = page.locator('.units-settings');
  if (!(await disclosure.evaluate((el) => (el as HTMLDetailsElement).open)))
    await disclosure.locator(':scope > summary').click();
}

/** Category expansion does not arm placement; choose an explicit supported type. */
export async function armPlacement(pane: Locator, category: string) {
  const palette = pane.locator('.units-palette');
  if (!(await palette.evaluate((el) => (el as HTMLDetailsElement).open)))
    await palette.locator(':scope > summary').click();
  const button = palette.getByRole('button', {
    name: new RegExp(`^${category}`),
  });
  if (category === 'Unknown entity') {
    await button.click();
    return;
  }
  if ((await button.getAttribute('aria-expanded')) !== 'true')
    await button.click();
  await pane
    .locator('.units-subtypes')
    .getByRole('button', {
      name: /^Quadcopter \/ strike/,
    })
    .click();
}
