import { expect } from '@playwright/test';

export function operatorUI(page, frontend) {
  const fleet = page.locator('.fleet-sidebar'),
    pane = page.locator('.decision-suggestions');
  const action = async (name) => {
    await page
      .getByRole('button', { name: 'Simulation', exact: true })
      .first()
      .click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  const tab = async (name, act) => {
    await page
      .getByRole('tab', { name, exact: true })
      .click({ button: 'right' });
    await page.getByRole('menuitem', { name: act, exact: true }).click();
  };
  const select = async (...labels) => {
    const toggle = page.locator('[data-activity-view="fleet"]');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true')
      await toggle.click();
    await fleet
      .getByRole('button', { name: `Inspect ${labels[0]}`, exact: true })
      .click();
    for (const label of labels.slice(1))
      await fleet
        .getByRole('checkbox', { name: `Select ${label}`, exact: true })
        .check();
  };
  const review = async () => {
    if (
      !(
        (await fleet.locator('.fleet-suggestions').getAttribute('open')) !==
        null
      )
    )
      await fleet.locator('.fleet-suggestions summary').click();
    await fleet
      .getByRole('button', { name: 'Review options', exact: true })
      .click();
    await expect(pane.locator('.suggestion-card').first()).toBeVisible();
  };
  const refresh = async () => {
    await pane
      .getByRole('button', { name: /^(Refresh options|Get suggestions)$/ })
      .click();
    await expect(pane.locator('.suggestion-card').first()).toBeVisible();
  };
  const behavior = async (value) => {
    await fleet.getByLabel('Behavior', { exact: true }).selectOption(value);
    const response = page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().endsWith('/commands') &&
        r.request().postDataJSON()?.intent?.action === 'behavior',
    );
    await fleet.getByRole('button', { name: 'Apply', exact: true }).click();
    expect((await (await response).json()).accepted).toBe(true);
  };
  const world = async (mid) => {
    mid ??= (
      await (await page.request.get(`${frontend}/api/interactive/entry`)).json()
    ).activeMissionId;
    return (
      await page.request.get(`${frontend}/api/missions/${mid}/world`)
    ).json();
  };
  const scenario = async ({
    friendly = 10,
    hostile = 5,
    patrol = false,
    name = `D6 verification ${Date.now()}`,
  } = {}) => {
    const unit = (id, label, category, i) => ({
      id,
      label,
      category,
      commandRole: category === 'friendly' ? 'sentinel' : 'observation',
      profileId:
        category === 'friendly' && i % 2 === 0 ? 'sting-v1' : 'hornet-10-v1',
      headingTrueDeg: 90,
      position: {
        longitudeDeg:
          103.85 + (category === 'hostile' ? 0.003 : 0) + i * 0.000025,
        latitudeDeg: 1.29 + i * 0.000015,
        altitude: { metres: 180, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
    });
    const content = {
      name,
      boundaryRuleVersion: 'local-boundary-v1',
      units: [
        ...Array.from({ length: friendly }, (_, i) =>
          unit(
            `f-${i}`,
            `D6 Friendly ${String(i + 1).padStart(2, '0')}`,
            'friendly',
            i,
          ),
        ),
        ...Array.from({ length: hostile }, (_, i) =>
          unit(`h-${i}`, `D6 Hostile ${i + 1}`, 'hostile', i),
        ),
        {
          ...unit('observer', 'D6 Observer', 'friendly', friendly + 1),
          commandRole: 'observation',
        },
      ],
      boundaries: patrol
        ? [
            {
              id: 'patrol',
              name: 'D6 Patrol',
              type: 'patrol',
              vertices: [
                [103.848, 1.288],
                [103.854, 1.288],
                [103.854, 1.294],
                [103.848, 1.294],
              ],
            },
          ]
        : [],
    };
    const response = await page.request.post(`${frontend}/api/scenarios`, {
      data: {
        requestId: globalThis.crypto.randomUUID(),
        expectedRevision: 0,
        content,
      },
    });
    expect(response.ok()).toBe(true);
    await page.goto(frontend);
    await page
      .getByRole('button', { name: 'Load mission', exact: true })
      .click();
    await page
      .getByRole('menuitem', { name: new RegExp(`${name} · r1.*Saved plan`) })
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
    return name;
  };
  return {
    fleet,
    pane,
    action,
    tab,
    select,
    review,
    refresh,
    behavior,
    world,
    scenario,
  };
}
