import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { performanceScenario } from './scenario.mjs';

export async function loadPerformanceScenario(
  page,
  frontend,
  perSide = 20,
  options,
) {
  const content = performanceScenario(perSide, options);
  const reply = await page.request.post(`${frontend}/api/scenarios`, {
    data: { requestId: randomUUID(), expectedRevision: 0, content },
  });
  expect(reply.ok()).toBe(true);
  const receipt = await reply.json();
  expect(receipt.accepted).toBe(true);
  const saved = receipt.result;
  expect(saved.revision).toBe(1);
  await page.goto(frontend);
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', {
      name: new RegExp(`${content.name} · r1.*Saved plan`),
    })
    .click();
  await validateSavedScenario(page, saved);
  await page
    .locator('[data-view="orchestrator"]')
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await page.locator('[data-run-state="running"]').first().waitFor();
  return content;
}

/** Validation must finish and belong to this exact immutable saved revision. */
export async function validateSavedScenario(page, saved) {
  const conductor = page.locator('[data-view="orchestrator"]');
  const validation = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      r.url().endsWith('/api/scenarios/validate'),
  );
  const validationStarted = performance.now();
  await conductor
    .getByRole('button', { name: 'Validate saved revision', exact: true })
    .click();
  const validationResponse = await validation;
  expect(validationResponse.ok()).toBe(true);
  // Response headers do not mean the body or React review is available yet.
  const review = await validationResponse.json();
  expect(review.canRun).toBe(true);
  expect(review.reference).toEqual({
    definitionId: saved.definitionId,
    revision: saved.revision,
    contentHash: saved.contentHash,
  });
  const bodyReceivedMs = performance.now() - validationStarted;
  const heading = `Ready to run · r${saved.revision}`;
  const ready = conductor.getByRole('heading', {
    name: heading,
    exact: true,
  });
  // Keep the existing assertion budget; report cold readiness separately from FPS.
  await expect(ready).toBeVisible();
  await expect(ready).toHaveText(heading);
  return {
    phase: 'scenario-validation-ready',
    bodyReceivedMs,
    visibleReviewMs: performance.now() - validationStarted,
  };
}
