/* global document, getComputedStyle */
import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { operatorUI } from './operator-ui.mjs';
import { validateSavedScenario } from '../performance/support.mjs';

/** Same real interactions in regression and actual-desktop verification. */
export async function detailsClosure(page, frontend, output) {
  mkdirSync(output, { recursive: true });
  const content = JSON.parse(
    readFileSync(
      resolve('tests/fixtures/scenario-location/remote-20v20.json'),
      'utf8',
    ),
  );
  content.name = 'Details Sydney forty';
  content.units[1].profileId = 'hornet-10-v1';
  content.units[20].profileId = 'hornet-10-v1';
  const response = await page.request.post(`${frontend}/api/scenarios`, {
    data: { requestId: randomUUID(), expectedRevision: 0, content },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const saved = (await response.json()).result;
  await page.goto(frontend);
  await page.evaluate(() => {
    document.title = 'Sentinel Milestone 1 Details verification';
  });
  await page.bringToFront();
  await page.getByRole('button', { name: 'Load mission', exact: true }).click();
  await page
    .getByRole('menuitem', { name: /Details Sydney forty · r1.*Saved plan/ })
    .click();
  await validateSavedScenario(page, saved);
  await page
    .locator('[data-view="orchestrator"]')
    .getByRole('button', { name: 'Run saved revision 1', exact: true })
    .click();
  await page.locator('[data-run-state="running"]').first().waitFor();
  const u = operatorUI(page, frontend),
    detail = page.locator('.selection-details');
  const initial = await u.world();
  await expect
    .poll(async () => {
      const current = await u.world();
      return Object.values(initial.tracks).filter(
        (t) =>
          JSON.stringify(t.latest.position) !==
          JSON.stringify(current.tracks[t.id].latest.position),
      ).length;
    })
    .toBe(40);
  const camera = () =>
    page.evaluate(
      () => globalThis.__sentinelMapTest?.inspect('tactical')?.camera,
    );
  const select = async (label) => {
    await page
      .getByRole('button', { name: 'Open Tracks', exact: true })
      .click();
    const row = page
      .locator('.tracks-table tbody tr')
      .filter({ hasText: label });
    await row.focus();
    await page.keyboard.press('Enter');
    await expect(detail.getByRole('heading', { level: 1 })).toHaveText(label);
    await page.getByRole('tab', { name: 'Tactical Map', exact: true }).click();
    await detail.evaluate((e) => {
      e.scrollTop = 0;
    });
  };
  const result = {
    missionId: initial.mission.id,
    moving: 40,
    mappings: [],
    layouts: [],
  };
  const beforeCamera = await camera();
  for (const [label, profile, image, affiliation] of [
    ['Friendly 01', 'sting-v1', 'STING interceptor', 'FRIENDLY'],
    ['Friendly 02', 'hornet-10-v1', 'Quadcopter', 'FRIENDLY'],
    ['Hostile 01', 'hornet-10-v1', 'Quadcopter', 'HOSTILE'],
  ]) {
    await select(label);
    const img = detail.getByRole('img', {
      name: `${image} — static model reference, not a live feed`,
      exact: true,
    });
    await expect(img).toBeVisible();
    await expect
      .poll(() => img.evaluate((e) => e.complete && e.naturalWidth > 0))
      .toBe(true);
    await expect(
      detail.locator('.details-identity .unit-silhouette'),
    ).toHaveAttribute('data-profile', profile);
    await expect(detail.locator('.details-affiliation')).toHaveText(
      affiliation,
    );
    expect(await img.evaluate((e) => getComputedStyle(e).objectFit)).toBe(
      'contain',
    );
    expect(
      await detail
        .locator('.asset-portrait')
        .evaluate((e) => getComputedStyle(e).backgroundColor),
    ).toBe('rgb(0, 0, 0)');
    result.mappings.push({
      label,
      profile,
      affiliation,
      src: await img.getAttribute('src'),
    });
    await page.screenshot({
      path: resolve(output, `${label.replaceAll(' ', '-').toLowerCase()}.png`),
    });
  }
  expect(result.mappings[1].src).toBe(result.mappings[2].src);
  await select('Hostile 03');
  await expect(detail).toContainText('No reference image assigned');
  await expect(detail.locator('.asset-portrait img')).toHaveCount(0);
  await page.screenshot({ path: resolve(output, 'unsupported-profile.png') });
  await select('Friendly 01');
  await detail
    .getByRole('button', { name: 'Pin inspector', exact: true })
    .click();
  await select('Friendly 02');
  await page
    .getByRole('tab', { name: 'Pinned · Friendly 01', exact: true })
    .click();
  const pinned = page.locator('.entity-inspector');
  await expect(pinned.getByRole('heading', { level: 1 })).toHaveText(
    'Friendly 01',
  );
  await expect(
    pinned.getByRole('img', { name: /^STING interceptor/ }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(output, 'pinned-sting.png') });
  await pinned
    .getByRole('button', { name: 'Close pinned inspector', exact: true })
    .click();
  await select('Friendly 02');
  expect(await camera()).toEqual(beforeCamera);
  for (const width of [1440, 900, 820, 760]) {
    await page.setViewportSize({ width, height: 900 });
    await detail.evaluate((e) => {
      e.scrollTop = 0;
    });
    await expect
      .poll(() => detail.evaluate((e) => e.scrollWidth <= e.clientWidth))
      .toBe(true);
    await expect(
      detail.getByRole('img', { name: /^Quadcopter/ }),
    ).toBeInViewport();
    const a = await detail.locator('.asset-portrait').boundingBox();
    await detail.getByText('Speed', { exact: true }).scrollIntoViewIfNeeded();
    await expect(detail.getByText('Speed', { exact: true })).toBeInViewport();
    await page.screenshot({ path: resolve(output, `layout-${width}.png`) });
    result.layouts.push({
      width,
      portrait: a,
      pageWidth: await page.evaluate(
        () => document.documentElement.scrollWidth,
      ),
    });
    expect(result.layouts.at(-1).pageWidth).toBe(width);
  }
  const axe = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/quadcopter-*.png', (route) => route.abort('failed'));
  await page.reload();
  await u.action('Return to active demo');
  await select('Friendly 02');
  await expect(detail).toContainText('Reference image unavailable');
  const failedHeight = (await detail.locator('.asset-portrait').boundingBox())
    .height;
  await select('Friendly 01');
  await expect(
    detail.getByRole('img', { name: /^STING interceptor/ }),
  ).toBeVisible();
  expect((await detail.locator('.asset-portrait').boundingBox()).height).toBe(
    failedHeight,
  );
  await page.screenshot({ path: resolve(output, 'after-image-failure.png') });
  await page.unroute('**/quadcopter-*.png');
  await u.action('End demo');
  await expect(page.locator('[data-run-state]')).toHaveAttribute(
    'data-run-state',
    'ended',
  );
  await select('Friendly 01');
  await expect(
    detail.getByRole('img', { name: /^STING interceptor/ }),
  ).toBeVisible();
  expect((await u.world(initial.mission.id)).interactive.state).toBe('ended');
  await page.screenshot({ path: resolve(output, 'recorded-sting.png') });
  result.passed = true;
  return result;
}
