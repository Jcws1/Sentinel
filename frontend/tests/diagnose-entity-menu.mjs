/* global console, document, getComputedStyle */
import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
try {
  await page.goto('http://127.0.0.1:5230');
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: 'Synthetic Observations', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open Tracks', exact: true }).click();
  await page
    .getByRole('tab', { name: 'Tracks', exact: true })
    .click({ button: 'right' });
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
  await page.getByRole('button', { name: 'Shared entity filters' }).click();
  await page.getByRole('menuitem', { name: 'Source', exact: true }).hover();
  const item = page.getByRole('menuitemcheckbox', {
    name: 'synthetic-observations-secondary',
    exact: true,
  });
  await item.waitFor();
  console.log(
    await item.evaluate((el) => {
      const b = el.getBoundingClientRect();
      return {
        bounds: b.toJSON(),
        pointer: getComputedStyle(el).pointerEvents,
        hit: document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
          ?.outerHTML,
        body: document.body.style.pointerEvents,
      };
    }),
  );
  await page.screenshot({
    path: '../docs/phase3b/evidence/menu-diagnostic.png',
  });
  const box = await item.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
    steps: 12,
  });
  await item.click({ timeout: 3000 });
  console.log(
    'SELECTED',
    await page.locator('.tracks-table tbody').innerText(),
  );
} finally {
  await browser.close();
}
