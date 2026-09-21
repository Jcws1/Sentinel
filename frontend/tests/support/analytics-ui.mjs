import { expect } from '@playwright/test';

export async function openCommand(page) {
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .first()
    .click();
  const pane = page.locator('[data-view="command"]');
  await expect(
    pane.getByRole('heading', { name: 'Command Picture', exact: true }),
  ).toBeVisible();
  return pane;
}
export async function analyticViews(page, shot = async () => {}) {
  const pane = await openCommand(page);
  await expect(
    pane.getByText(/filtered \/ \d+ mission entities/),
  ).toBeVisible();
  for (const lens of [
    'Overview',
    'Resources',
    'Recorded activity',
    'Statistics',
    'Comparison',
    'Vertical profile',
  ]) {
    await pane.getByRole('button', { name: lens, exact: true }).click();
    if (lens === 'Recorded activity' || lens === 'Statistics')
      await expect(pane.getByText(/Complete range summary/)).toBeVisible();
    await shot(lens.toLowerCase().replaceAll(' ', '-'));
  }
  const profile = pane.getByRole('region', {
    name: 'Vertical engagement profile',
  });
  const row = profile.locator('tbody tr').first();
  const label = await row.locator('button').innerText();
  await row.locator('button').click();
  await expect(page.locator('.selection-details')).toContainText(label);
  await profile
    .getByRole('checkbox', { name: 'Selected observed history' })
    .check();
  await profile
    .getByRole('combobox', { name: 'History range', exact: true })
    .selectOption('120');
  await expect(
    profile.getByText(
      /History: 120-second plot · retained 120-second read through source/,
    ),
  ).toBeVisible();
  await profile
    .getByRole('button', { name: 'Use selected position as fixed origin' })
    .click();
  await expect(profile.getByText(/Origin: Fixed capture/)).toBeVisible();
  await profile
    .getByRole('button', { name: 'Use mission reference', exact: true })
    .click();
  await profile.getByRole('button', { name: 'Open profile to side' }).click();
  const separate = page.locator('[data-view="vertical"]');
  await expect(separate).toBeVisible();
  await expect(pane).toBeVisible();
  await shot('split-profile');
  return { label, pane, separate };
}
