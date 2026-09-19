import type { Locator } from '@playwright/test';

/** Category expansion does not arm placement; choose an explicit supported type. */
export async function armPlacement(pane: Locator, category: string) {
  const button = pane.getByRole('button', { name: new RegExp(`^${category}`) });
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
