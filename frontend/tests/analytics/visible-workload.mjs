/* global document, window */
import { expect } from '@playwright/test';

// This uses existing verification-only renderer APIs. It never changes the source,
// route, speed, projection quality or runtime's authoritative world.
export async function prepareVisibleWorkload(page, origin) {
  await page.evaluate((center) => {
    for (const pane of document.querySelectorAll('.tactical-view')) {
      const rect = pane.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const id = pane.getAttribute('data-view-id');
      const mode = pane.getAttribute('data-projection');
      const api =
        mode === 'three-d'
          ? globalThis.__sentinelCesiumTest
          : globalThis.__sentinelMapTest;
      api.setCamera(id, {
        center,
        groundSpanM: 10000,
        headingTrueDeg: 0,
        pitchFromNadirDeg: mode === 'three-d' ? 35 : 0,
        focusHeightM: 0,
      });
    }
    for (const pane of document.querySelectorAll('.analytics')) {
      const rect = pane.getBoundingClientRect();
      const chart = pane.querySelector('.analytic-chart');
      if (!rect.width || !rect.height || !chart) continue;
      const chartRect = chart.getBoundingClientRect();
      pane.scrollTop +=
        chartRect.top - rect.top - (pane.clientHeight - chartRect.height) / 2;
    }
  }, origin);
}

export async function inspectVisibleWorkload(page) {
  return page.evaluate(() => {
    const rect = (element) => element.getBoundingClientRect().toJSON();
    const maps = [...document.querySelectorAll('.tactical-view')].flatMap(
      (pane) => {
        const bounds = rect(pane);
        if (!bounds.width || !bounds.height) return [];
        const id = pane.getAttribute('data-view-id');
        const mode = pane.getAttribute('data-projection');
        const api =
          mode === 'three-d'
            ? globalThis.__sentinelCesiumTest
            : globalThis.__sentinelMapTest;
        const state = api.inspect(id);
        const canvas = rect(pane.querySelector('.map-canvas'));
        const points = state?.points ?? [];
        return [
          {
            id,
            mode,
            bounds,
            canvas,
            camera: state?.camera,
            frameId: state?.frameId,
            points,
            visibleIds: points
              .filter(
                (p) =>
                  Number.isFinite(p.x) &&
                  Number.isFinite(p.y) &&
                  p.x >= 16 &&
                  p.y >= 16 &&
                  p.x <= canvas.width - 16 &&
                  p.y <= canvas.height - 16,
              )
              .map((p) => p.id)
              .sort(),
          },
        ];
      },
    );
    const primaryCharts = [...document.querySelectorAll('.analytics')].flatMap(
      (pane) => {
        const bounds = rect(pane);
        const chart = pane.querySelector('.analytic-chart');
        if (!bounds.width || !bounds.height || !chart) return [];
        const canvas = chart.querySelector('canvas');
        const chartBounds = rect(chart);
        const clip = {
          left: Math.max(bounds.left, 0),
          right: Math.min(bounds.right, window.innerWidth),
          top: Math.max(bounds.top, 0),
          bottom: Math.min(bounds.bottom, window.innerHeight),
        };
        return [
          {
            view: pane.closest('[data-view]')?.getAttribute('data-view'),
            pane: bounds,
            chart: chartBounds,
            canvas: canvas ? rect(canvas) : null,
            fullyVisible:
              !!canvas &&
              chartBounds.width > 0 &&
              chartBounds.height > 0 &&
              chartBounds.left >= clip.left - 1 &&
              chartBounds.right <= clip.right + 1 &&
              chartBounds.top >= clip.top - 1 &&
              chartBounds.bottom <= clip.bottom + 1,
          },
        ];
      },
    );
    return { maps, primaryCharts };
  });
}

export function assertVisibleWorkload(snapshot, label, entityCount) {
  const expectedModes = label.endsWith('dual-maps')
    ? ['tactical', 'three-d']
    : label.startsWith('alone-')
      ? []
      : [
          label.startsWith('3d-') || label.endsWith('-3d')
            ? 'three-d'
            : 'tactical',
        ];
  expect(snapshot.maps.map((m) => m.mode).sort()).toEqual(expectedModes.sort());
  for (const map of snapshot.maps) {
    expect(
      new Set(map.visibleIds).size,
      `${label}: ${map.id} visible entities`,
    ).toBe(entityCount);
    expect(map.camera.groundSpanM).toBeCloseTo(10000, -1);
  }
  const expectedCharts = label.startsWith('two-profiles-')
    ? 2
    : label.startsWith('closed-') || label.endsWith('recorded-activity')
      ? 0
      : 1;
  expect(snapshot.primaryCharts).toHaveLength(expectedCharts);
  expect(snapshot.primaryCharts.every((c) => c.fullyVisible)).toBe(true);
}
