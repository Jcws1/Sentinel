import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { withD5Runtime } from './d5-runtime.mjs';

await withD5Runtime(
  {
    phase: 'd6',
    tag: process.argv[2] ?? 'ui-first',
    frontendPort: 5361,
    backendPort: 8161,
    configured: true,
  },
  async ({ frontend, output }) => {
    const browser = await chromium.launch({
      channel: 'msedge',
      headless: true,
    });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    const report = {
      checks: [],
      errors: [],
      requests: [],
      streams: 0,
      providerFailures: {},
    };
    page.on('pageerror', (e) =>
      report.errors.push(
        e.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 500),
      ),
    );
    page.on('websocket', (s) => {
      if (s.url().includes('/api/missions/')) report.streams++;
    });
    page.on('request', (r) => {
      const u = new globalThis.URL(r.url());
      if (u.pathname.startsWith('/api/interactive/') && r.method() === 'POST') {
        const b = r.postDataJSON();
        report.requests.push({
          path: u.pathname,
          action: b?.action ?? b?.intent?.action,
          recommendation: !!b?.intent?.recommendation,
          id: b?.commandId,
        });
      }
    });
    page.on('requestfailed', (r) => {
      const host = new globalThis.URL(r.url()).hostname;
      if (host !== '127.0.0.1') {
        const code =
          r.failure()?.errorText?.match(/ERR_[A-Z_]+/)?.[0] ?? 'FAILED';
        report.providerFailures[`${host} ${code}`] =
          (report.providerFailures[`${host} ${code}`] ?? 0) + 1;
      }
    });
    const fleet = page.locator('.fleet-sidebar'),
      pane = page.locator('.decision-suggestions');
    const action = async (name) => {
      await page
        .getByRole('button', { name: 'Simulation', exact: true })
        .first()
        .click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    };
    const shot = async (name) =>
      page.screenshot({ path: resolve(output, `${name}.png`) });
    const selectFleet = async () => {
      const button = page.locator('[data-activity-view="fleet"]');
      if ((await button.getAttribute('aria-expanded')) !== 'true')
        await button.click();
    };
    const select = async (label) => {
      await selectFleet();
      await fleet
        .getByRole('button', { name: `Inspect ${label}`, exact: true })
        .click();
    };
    const refresh = async () => {
      await pane
        .getByRole('button', { name: /^(Refresh options|Get suggestions)$/ })
        .click();
      await expect(pane.locator('.suggestion-card').first()).toBeVisible();
      await expect(pane).not.toContainText('Reviewing the current committed');
    };
    try {
      const name = `D6 choices ${Date.now()}`;
      const unit = (id, label, category, i) => ({
        id,
        label,
        category,
        commandRole: category === 'friendly' ? 'sentinel' : 'observation',
        profileId:
          category === 'friendly'
            ? i % 2
              ? 'hornet-10-v1'
              : 'sting-v1'
            : 'hornet-10-v1',
        headingTrueDeg: 90,
        position: {
          longitudeDeg:
            103.85 + (category === 'hostile' ? 0.003 : 0) + i * 0.000025,
          latitudeDeg: 1.29 + i * 0.000015,
          altitude: { metres: 180, reference: 'ELLIPSOID', datumId: 'WGS84' },
        },
      });
      const units = [
        ...Array.from({ length: 10 }, (_, i) =>
          unit(
            `f-${i}`,
            `D6 Friendly ${String(i + 1).padStart(2, '0')}`,
            'friendly',
            i,
          ),
        ),
        ...Array.from({ length: 5 }, (_, i) =>
          unit(`h-${i}`, `D6 Hostile ${i + 1}`, 'hostile', i),
        ),
        {
          ...unit('observer', 'D6 Observer', 'friendly', 11),
          commandRole: 'observation',
        },
      ];
      const created = await page.request.post(`${frontend}/api/scenarios`, {
        data: {
          requestId: globalThis.crypto.randomUUID(),
          expectedRevision: 0,
          content: {
            name,
            boundaryRuleVersion: 'local-boundary-v1',
            units,
            boundaries: [],
          },
        },
      });
      expect(created.ok()).toBe(true);
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
      await action('Pause');
      await page.locator('[data-run-state="paused"]').first().waitFor();
      await select('D6 Friendly 01');
      for (let i = 2; i <= 10; i++)
        await fleet
          .getByRole('checkbox', {
            name: `Select D6 Friendly ${String(i).padStart(2, '0')}`,
            exact: true,
          })
          .check();
      const before = report.requests.length,
        streams = report.streams;
      await fleet.locator('.fleet-suggestions summary').click();
      await fleet
        .getByRole('button', { name: 'Review options', exact: true })
        .click();
      await expect(
        pane.getByRole('heading', {
          name: 'Enable Intercept · 10',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        pane.getByRole('heading', {
          name: 'Enable for 5 · leave others unchanged',
          exact: true,
        }),
      ).toBeVisible();
      expect(
        report.requests
          .slice(before)
          .filter(
            (r) => !r.path.endsWith('/recommendations') && r.action !== 'renew',
          ),
      ).toEqual([]);
      expect(report.streams).toBe(streams);
      report.checks.push(
        'Actual saved revision → Validate → Run → Pause; 10/5 distinct cards; generation has no commands or new mission stream',
      );
      await shot('01-paused-ten-five');
      await pane
        .getByRole('button', { name: 'Keep current orders', exact: true })
        .click();
      await expect(pane).toContainText('No command sent');
      await refresh();
      await pane
        .locator('.suggestion-card')
        .first()
        .getByText('10 affected · 0 unchanged', { exact: true })
        .click();
      await expect(pane.locator('.suggestion-card').first()).toContainText(
        'D6 Friendly 01',
      );
      await shot('02-exact-member-review');
      await pane
        .getByRole('button', {
          name: 'Apply Enable for 5 · leave others unchanged',
          exact: true,
        })
        .dblclick();
      await expect(pane).toContainText('Command accepted');
      expect(report.requests.filter((r) => r.recommendation)).toHaveLength(1);
      report.checks.push(
        'Keep current orders is no-op; exact member review; double Apply sends one ordinary audited command',
      );
      await refresh();
      await expect(
        pane.getByRole('heading', { name: /Use Manual/ }),
      ).toBeVisible();
      await pane.getByRole('button', { name: /^Apply Stop selected/ }).click();
      await expect(pane).toContainText('Command accepted');
      await refresh();
      for (const [width, height] of [
        [760, 850],
        [820, 900],
        [900, 950],
        [1920, 1080],
        [2560, 1440],
        [3840, 2160],
      ]) {
        await page.setViewportSize({ width, height });
        await refresh();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                globalThis.document.documentElement.scrollWidth <=
                globalThis.innerWidth,
            ),
          )
          .toBe(true);
        await shot(`layout-${width}`);
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const axe = await new AxeBuilder({ page })
        .include('.decision-suggestions')
        .analyze();
      report.axe = axe.violations.map((v) => ({ id: v.id, impact: v.impact }));
      expect(report.axe).toEqual([]);
      await pane
        .getByRole('button', { name: 'Refresh options', exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect(pane.locator('.suggestion-card').first()).toBeVisible();
      await expect(
        pane.getByRole('button', { name: 'Refresh options', exact: true }),
      ).toBeFocused();
      report.focus = await pane
        .getByRole('button', { name: 'Refresh options', exact: true })
        .evaluate((el) => globalThis.getComputedStyle(el).outlineStyle);
      expect(report.focus).toBe('solid');
      await page.waitForTimeout(16000);
      await expect(pane).toContainText('Out of date');
      await expect(
        pane.getByRole('button', {
          name: 'Apply Enable Intercept · 10',
          exact: true,
        }),
      ).toBeDisabled();
      report.checks.push(
        'Expiry, keyboard activation, reduced motion, axe, six requested layouts',
      );
      await action('End demo');
      await expect(pane).toContainText('Recorded and ended runs are read-only');
      expect(await pane.locator('.suggestion-card').count()).toBe(0);
      expect(report.errors).toEqual([]);
      report.passed = true;
    } catch (error) {
      report.failure = String(error)
        .replace(/https?:\/\/\S+/g, '[URL]')
        .slice(0, 2000);
      await shot('failure').catch(() => {});
      throw error;
    } finally {
      writeFileSync(
        resolve(output, 'result.json'),
        JSON.stringify(report, null, 2),
      );
      await context.close();
      await browser.close();
    }
  },
);
