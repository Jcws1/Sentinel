import { closeTab, tabAction } from './actions';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const product = 'http://127.0.0.1:5181';
const harness = 'http://127.0.0.1:5182/tests/harness/index.html';
const evidence = resolve('../docs/chrome-refinement/evidence');
const failures = new WeakMap<Page, string[]>();
test.beforeAll(async ({ browser }) => {
  await mkdir(evidence, { recursive: true });
  await writeFile(
    resolve(evidence, 'environment.json'),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        browser: `Microsoft Edge ${browser.version()}`,
        mode: 'headless',
        node: process.version,
        platform: process.platform,
        normalBuild: product,
        verificationBuild: harness,
      },
      null,
      2,
    ),
  );
});
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  failures.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type()))
      errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400)
      errors.push(`${response.status()} ${response.url()}`);
  });
  await mkdir(evidence, { recursive: true });
});
test.afterEach(async ({ page }) => {
  expect(failures.get(page)).toEqual([]);
});
const tab = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true });
async function side(page: Page, title: string) {
  await page
    .getByRole('button', { name: `${title} options`, exact: true })
    .click();
  await page
    .getByRole('menuitem', { name: 'Open to Side', exact: true })
    .click();
}
async function reorder(page: Page, from: string, before: string) {
  const a = await tab(page, from).boundingBox();
  const b = await tab(page, before).boundingBox();
  if (!a || !b) throw new Error('Tab bounds unavailable for actual mouse drag');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, {
    steps: 6,
  });
  await page.mouse.move(b.x + 3, b.y + b.height / 2, { steps: 15 });
  await page.mouse.up();
}

test('registry navigation focuses singleton views without reloading, closes and reopens every tab', async ({
  page,
}) => {
  await page.goto(product);
  let navigations = 0;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations++;
  });
  const titles = [
    'Tactical Map',
    '3D View',
    'Command Picture',
    'Vertical Profile',
    'Timeline',
    'Entity Inspector',
  ];
  for (const title of titles) {
    await page
      .getByRole('button', { name: `Open ${title} from Views`, exact: true })
      .click();
    await expect(tab(page, title)).toHaveAttribute('aria-selected', 'true');
    if (title === 'Tactical Map' || title === '3D View') {
      await expect(page.locator('.tactical-view:visible')).toBeVisible();
      await expect(page.locator('.tactical-view:visible')).toContainText(
        'Load a mission',
      );
      await expect(page.locator('.tactical-view:visible canvas')).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('region', { name: `${title} view`, exact: true })
          .getByText('NOT IMPLEMENTED', { exact: true }),
      ).toBeVisible();
    }
  }
  await page.getByRole('button', { name: 'Open Map', exact: true }).click();
  await expect(page.getByRole('tab')).toHaveCount(6);
  await expect(tab(page, 'Tactical Map')).toBeFocused();
  for (const title of titles) {
    await page
      .getByRole('button', { name: `Open ${title} from Views`, exact: true })
      .click();
    await closeTab(page, title);
    await expect(tab(page, title)).toHaveCount(0);
  }
  await expect(
    page.getByRole('heading', { name: 'No open views' }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Open Tactical Map', exact: true })
    .last()
    .click();
  await expect(tab(page, 'Tactical Map')).toHaveCount(1);
  expect(navigations).toBe(0);
  expect(await page.evaluate(() => '__workspaceTest' in window)).toBe(false);
});

test('keyboard focus, tab activation and closure, menus, dialog and divider resizing', async ({
  page,
}) => {
  await page.goto(product);
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Load mission', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Open Map', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('button', { name: 'Open Command Picture', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Command Picture')).toBeFocused();
  await expect(tab(page, 'Command Picture')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowLeft');
  await expect(tab(page, 'Tactical Map')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Tactical Map')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(tab(page, 'Command Picture')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('F6');
  await expect(
    page.getByRole('tabpanel', { name: 'Command Picture', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('F6');
  await expect(tab(page, 'Command Picture')).toBeFocused();
  const focusStyle = await tab(page, 'Command Picture').evaluate((element) => ({
    width: getComputedStyle(element).outlineWidth,
    style: getComputedStyle(element).outlineStyle,
  }));
  expect(focusStyle).toEqual({ width: '2px', style: 'solid' });
  await page.screenshot({ path: resolve(evidence, 'keyboard-focus.png') });
  await page.keyboard.press('Control+Delete');
  await expect(tab(page, 'Command Picture')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Open Command Picture', exact: true })
    .focus();
  await page.keyboard.press('Space');
  await expect(tab(page, 'Command Picture')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page
    .getByRole('button', { name: 'Timeline options', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await expect(
    page.getByRole('menuitem', { name: 'Open to Side', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tablist')).toHaveCount(2);
  await expect(tab(page, 'Timeline')).toBeFocused();
  const divider = page.getByRole('separator');
  const pane = page.getByRole('region', { name: 'Timeline view' });
  const before = (await pane.boundingBox())!.width;
  await divider.focus();
  await page.keyboard.press('ArrowLeft');
  await expect
    .poll(async () => (await pane.boundingBox())!.width)
    .not.toBe(before);
  await page
    .getByRole('button', { name: 'Keyboard shortcuts', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Keyboard shortcuts', exact: true }),
  ).toBeFocused();
});

test('actual drag reordering and Open to Side preserve isolated shared context under updates', async ({
  page,
}) => {
  await page.goto(harness);
  await page
    .getByRole('button', { name: 'Open Timeline', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Select sample Bravo', exact: true })
    .click();
  await page.evaluate(() => window.__workspaceTest.start());
  await expect
    .poll(() =>
      page.evaluate(() => window.__workspaceTest.snapshot().context.sequence),
    )
    .toBeGreaterThan(20);
  await reorder(page, 'Timeline', 'Tactical Map');
  await expect(page.getByRole('tab').first()).toHaveAccessibleName('Timeline');
  await side(page, 'Command Picture');
  await expect(page.getByRole('tablist')).toHaveCount(2);
  const divider = page.getByRole('separator');
  const rect = (await divider.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + 120, rect.y + rect.height / 2, { steps: 12 });
  await page.mouse.up();
  const stableRevision = await page.evaluate(
    () => window.__workspaceTest.snapshot().workspace.revision,
  );
  await expect
    .poll(() =>
      page.evaluate(() => window.__workspaceTest.snapshot().context.sequence),
    )
    .toBeGreaterThan(200);
  expect(
    await page.evaluate(
      () => window.__workspaceTest.snapshot().workspace.revision,
    ),
  ).toBe(stableRevision);
  await page.evaluate(() => window.__workspaceTest.stop());
  const snapshot = await page.evaluate(() => window.__workspaceTest.snapshot());
  expect(snapshot.context.selection).toBe('sample-bravo');
  for (const id of ['timeline', 'command']) {
    await expect(
      page.locator(`[data-probe="${id}"] [data-probe-value]`),
    ).toHaveText(JSON.stringify(snapshot.context));
  }
  // Returning to a previously hidden pane must consume the same latest test snapshot.
  await tab(page, 'Tactical Map').click();
  await expect(
    page.locator('[data-probe="tactical"] [data-probe-value]'),
  ).toHaveText(JSON.stringify(snapshot.context));
  await closeTab(page, 'Command Picture');
  const events = (await page.evaluate(() => window.__workspaceTest.snapshot()))
    .events;
  expect(
    events.some(
      (event) =>
        event.type === 'visibility' &&
        event.viewId === 'timeline' &&
        !event.visible,
    ),
  ).toBe(true);
  expect(
    events.filter(
      (event) =>
        event.type === 'resize' &&
        event.viewId === 'command' &&
        event.width > 0,
    ).length,
  ).toBeGreaterThan(1);
  expect(
    events.filter(
      (event) => event.type === 'mount' && event.viewId === 'command',
    ).length,
  ).toBe(
    events.filter(
      (event) => event.type === 'dispose' && event.viewId === 'command',
    ).length,
  );
  await writeFile(
    resolve(evidence, 'update-probe.json'),
    JSON.stringify(
      {
        ...snapshot,
        events,
        observedUpdatesPerSecond:
          (snapshot.context.sequence / snapshot.elapsedMs) * 1000,
      },
      null,
      2,
    ),
  );
});

test('native close returns a child to a floating panel; explicit redock and reopen retain context', async ({
  page,
  context,
}) => {
  await page.goto(harness);
  await page.evaluate(() => window.__workspaceTest.start());
  const childPromise = context.waitForEvent('page');
  await page
    .getByRole('button', { name: 'Pop out test view', exact: true })
    .click();
  const child = await childPromise;
  const childErrors: string[] = [];
  child.on('pageerror', (error) => childErrors.push(error.message));
  await tab(child, 'Tactical Map').click({ button: 'right' });
  await expect(
    child.getByRole('menuitem', { name: 'Return to workspace', exact: true }),
  ).toBeVisible();
  await child.keyboard.press('Escape');
  await child
    .getByRole('button', { name: 'Select sample Bravo', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__workspaceTest.snapshot().context.selection),
    )
    .toBe('sample-bravo');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__workspaceTest
            .snapshot()
            .workspace.views.find((view) => view.id === 'tactical')?.location,
      ),
    )
    .toBe('window');
  await page.evaluate(() => window.__workspaceTest.stop());
  const state = await page.evaluate(
    () => window.__workspaceTest.snapshot().context,
  );
  await expect(child.locator('[data-probe-value]')).toHaveText(
    JSON.stringify(state),
  );
  // Runs beforeunload, matching native close. Playwright page.close() force-closes instead.
  await child.evaluate(() => window.close());
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__workspaceTest
            .snapshot()
            .workspace.views.find((view) => view.id === 'tactical')?.location,
      ),
    )
    .toBe('float');
  await tab(page, 'Tactical Map').click({ button: 'right' });
  await expect(
    page.getByRole('menuitem', { name: 'Return to workspace', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: resolve(evidence, 'popout-return-float.png') });
  await page
    .getByRole('menuitem', { name: 'Return to workspace', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__workspaceTest
            .snapshot()
            .workspace.views.find((view) => view.id === 'tactical')?.location,
      ),
    )
    .toBe('main');
  await expect(
    page.getByRole('button', { name: 'Return to workspace', exact: true }),
  ).toHaveCount(0);
  expect(
    Object.keys(
      (await page.evaluate(() => window.__workspaceTest.snapshot())).layout
        .subLayouts ?? {},
    ),
  ).toHaveLength(0);
  await expect(
    page.locator('[data-probe="tactical"] [data-probe-value]'),
  ).toHaveText(JSON.stringify(state));
  const secondPromise = context.waitForEvent('page');
  await page
    .getByRole('button', { name: 'Pop out test view', exact: true })
    .click();
  const second = await secondPromise;
  await expect(second.locator('[data-probe-value]')).toHaveText(
    JSON.stringify(state),
  );
  await tabAction(second, 'Tactical Map', 'Return to workspace');
  await expect.poll(() => second.isClosed()).toBe(true);
  await expect(tab(page, 'Tactical Map')).toHaveCount(1);
  expect(childErrors).toEqual([]);
  await writeFile(
    resolve(evidence, 'popout-probe.json'),
    JSON.stringify(
      await page.evaluate(() => window.__workspaceTest.snapshot()),
      null,
      2,
    ),
  );
});

for (const size of [
  { width: 2560, height: 1440, label: '1440p' },
  { width: 3840, height: 2160, label: '4k' },
  { width: 1920, height: 1080, label: 'desktop-1080' },
]) {
  test(`readable ${size.label} layout, two panes and accessible shell`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await page.goto(product);
    await side(page, 'Entity Inspector');
    await expect(page.locator('.tactical-view')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Entity Inspector', exact: true }),
    ).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: innerWidth,
      scrollHeight: document.documentElement.scrollHeight,
      height: innerHeight,
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    expect(dimensions.scrollHeight).toBe(dimensions.height);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    await writeFile(
      resolve(evidence, `accessibility-${size.label}.json`),
      JSON.stringify(
        {
          violations: results.violations,
          passes: results.passes.length,
          incomplete: results.incomplete.map((item) => ({
            id: item.id,
            description: item.description,
            nodes: item.nodes.map((node) => ({
              target: node.target,
              summary: node.failureSummary,
            })),
          })),
        },
        null,
        2,
      ),
    );
    expect(results.violations).toEqual([]);
    await page.screenshot({
      path: resolve(evidence, `shell-${size.label}.png`),
    });
  });
}

test('module constraints, neutral chrome and a wall clock independent of the workspace', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2026-09-10T15:30:00.000Z') });
  await page.goto(product);
  await expect(page.locator('.app-header')).toContainText('Sentinel v3');
  await expect(page.locator('.app-header')).toContainText('No mission');
  await expect(page.locator('.wall-clock')).toHaveText('23:30:00UTC+8');
  await expect(page.locator('.mission-controls')).toBeVisible();
  for (const name of ['Home', 'Tracks', 'Sensors', 'Reports', 'Events']) {
    const control = page.getByRole('button', {
      name: `${name} - not implemented`,
      exact: true,
    });
    await expect(control).toBeDisabled();
    await expect(control).toHaveText('N/A');
  }
  await page.clock.runFor(1000);
  await expect(page.locator('.wall-clock time')).toHaveText('23:30:01');
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(page.locator('.status-bar')).toContainText('No mission loaded');
  await page.getByRole('button', { name: 'Hide Views list' }).click();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Open Timeline', exact: true })
    .click();
  await expect(tab(page, 'Timeline')).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Show Views list' }).click();
  await expect(page.getByRole('complementary')).toBeVisible();
  const selectable = await page.evaluate(() => ({
    navigation: getComputedStyle(document.querySelector('.activity-bar')!)
      .userSelect,
    clock: getComputedStyle(document.querySelector('.wall-clock time')!)
      .userSelect,
  }));
  expect(selectable.navigation).toBe('none');
  expect(selectable.clock).not.toBe('none');
});
