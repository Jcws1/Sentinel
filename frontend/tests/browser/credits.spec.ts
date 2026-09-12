import { expect, test } from '@playwright/test';

test('Settings opens a single Credits workspace with keyboard access and no mission subscription', async ({
  page,
}) => {
  let streams = 0;
  page.on('websocket', (socket) => {
    if (socket.url().includes('/stream')) streams++;
  });
  await page.goto('http://127.0.0.1:5181');
  const settings = page.getByRole('button', { name: 'Settings', exact: true });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('menuitem', { name: 'Credits', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();
  await settings.click();
  await page.getByRole('menuitem', { name: 'Credits', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Credits', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('tab', { name: 'Credits', exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole('link', { name: 'Copyright and ODbL' }),
  ).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
  await expect(page.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
    'href',
    'https://creativecommons.org/licenses/by/4.0/',
  );
  await settings.click();
  await page.getByRole('menuitem', { name: 'Credits', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Credits', exact: true }),
  ).toHaveCount(1);
  expect(streams).toBe(0);
  await page.setViewportSize({ width: 760, height: 650 });
  const content = page.getByRole('article', { name: 'Settings — Credits' });
  expect(await content.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page
    .getByRole('tab', { name: 'Credits', exact: true })
    .click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close view', exact: true }).click();
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await expect(
    page.getByRole('tab', { name: 'Tactical Map', exact: true }),
  ).toBeFocused();
});
