import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { performanceScenario } from './scenario.mjs';

export async function loadPerformanceScenario(page, frontend, perSide = 20) {
  const content = performanceScenario(perSide);
  const reply = await page.request.post(`${frontend}/api/scenarios`, {
    data: { requestId: randomUUID(), expectedRevision: 0, content },
  });
  expect(reply.ok()).toBe(true);
  await page.goto(frontend);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: new RegExp(`${content.name} · r1.*Saved plan`),
    })
    .click();
  const conductor = page.locator('[data-view="conductor"]');
  await conductor
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  await expect(conductor).toContainText('Ready to run');
  await conductor
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await page.locator('[data-run-state="running"]').first().waitFor();
  return content;
}
