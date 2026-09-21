// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { graphic, init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import type { CallbackDataParams } from 'echarts/types/dist/shared';
import { chartBase } from '../../src/features/analytics/ChartHost';
import {
  createProfileLayer,
  profileMotionBounds,
} from '../../src/features/analytics/profileLayer';
import {
  profileColour,
  profileSeries,
  type ProfileDatum,
} from '../../src/features/analytics/profileSeries';
import {
  radialKm,
  type ProfileOrigin,
} from '../../src/features/analytics/projections';

use([SVGRenderer]);

it('moves actual circles without model updates; preserves rendered values, hit identity, reordering, correction and disposal', () => {
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 500,
    height: 300,
  });
  const layer = createProfileLayer();
  const a: ProfileDatum = [
    1.25,
    180,
    'opaque:/id [a]|" <& Ω',
    'Original\nsource UTC\ntracking · MSL',
    profileColour('friendly', true),
    13,
  ];
  const b: ProfileDatum = [
    2.5,
    -185,
    'stale',
    'Last known\nsource UTC\nstale · MSL',
    profileColour('hostile', false),
    8,
  ];
  const params = new Map<string, CallbackDataParams>();
  const series = profileSeries([a, b]),
    colour = series.itemStyle!.color;
  if (typeof colour !== 'function') throw Error('Expected colour callback');
  series.itemStyle!.color = (p) => {
    params.set((p.value as ProfileDatum)[2], p);
    return colour(p);
  };
  try {
    chart.setOption({
      ...chartBase,
      xAxis: { min: 0, max: 10 },
      yAxis: { min: -300, max: 300 },
      series: [series],
    });
    const added = vi.spyOn(chart.getZr(), 'add'),
      removed = vi.spyOn(chart.getZr(), 'remove');
    const model = vi.spyOn(chart, 'setOption');
    // Interactive tooltip dispatch is verified natively; this SSR check has no DOM.
    const dispatch = vi
      .spyOn(chart, 'dispatchAction')
      .mockImplementation(() => {});
    const pick = vi.fn(),
      painted: ProfileDatum = [1.5, 180, ...a.slice(2)] as ProfileDatum;
    layer.paint(chart, [painted, b], pick, 'mission/epoch/MSL');
    expect(model).not.toHaveBeenCalled();
    const circles = added.mock.calls.map(
      ([el]) => el as InstanceType<typeof graphic.Circle>,
    );
    expect(circles).toHaveLength(2);
    expect(circles.every((c) => c instanceof graphic.Circle)).toBe(true);
    const [x, y] = chart.convertToPixel(
      { gridIndex: 0 },
      [1.5, 180],
    ) as number[];
    expect(circles[0].shape).toMatchObject({ cx: x, cy: y, r: 6.5 });
    expect(circles[1].shape.r).toBe(4);
    expect(circles[1].style.fill).toBe(profileColour('hostile', false));
    expect(chart.renderToSVGString()).toContain('fill-opacity="0.45"');
    const frozenShape = vi.spyOn(circles[1], 'setShape');
    layer.paint(chart, [painted, b], pick, 'mission/epoch/MSL');
    expect(frozenShape).not.toHaveBeenCalled();
    chart.resize({ width: 700, height: 400 });
    layer.paint(chart, [painted, b], pick, 'mission/epoch/MSL');
    const resized = chart.convertToPixel(
      { gridIndex: 0 },
      [1.5, 180],
    ) as number[];
    expect(circles[0].shape.cx).toBe(resized[0]);
    expect(circles[0].shape.cy).toBe(resized[1]);
    expect(resized[0]).not.toBe(x);
    expect(model).not.toHaveBeenCalled();
    circles[0].trigger('click', {} as never);
    expect(pick).toHaveBeenLastCalledWith(a[2]);
    expect(layer.tooltip(params.get(a[2])!)).toContain('Distance: 1.500 km');
    expect(layer.tooltip(params.get(a[2])!)).not.toContain(
      'Distance: 1.250 km',
    );
    expect(
      layer.tooltip({
        ...params.get(a[2])!,
        seriesId: 'history-0',
        name: 'Observed',
        value: [0.25, 90],
      }),
    ).toContain('Distance: 0.250 km\nAltitude: 90.00 m');
    chart.setOption(
      { series: [profileSeries([b, a])] },
      { replaceMerge: ['series'] },
    );
    layer.paint(chart, [b, painted], pick, 'mission/epoch/MSL');
    circles[0].trigger('mouseover', {} as never);
    expect(dispatch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        type: 'showTip',
        seriesIndex: 0,
        dataIndex: 1,
      }),
    );
    chart.setOption(
      { series: [profileSeries([b])] },
      { replaceMerge: ['series'] },
    );
    layer.paint(chart, [b], pick, 'mission/epoch/MSL');
    expect(layer.tooltip(params.get(a[2])!)).toBe('');
    expect(removed).toHaveBeenCalledWith(circles[0]);
    pick.mockClear();
    circles[0].trigger('click', {} as never);
    expect(pick).not.toHaveBeenCalled();
    layer.paint(chart, [b], pick, 'different-mission/epoch/MSL');
    expect(removed).toHaveBeenCalledWith(circles[1]);
    expect(added).toHaveBeenCalledTimes(3);
    dispatch.mockClear();
    layer.dispose();
    // Disposal also clears a historical tooltip not owned by a current circle.
    expect(dispatch).toHaveBeenCalledWith({ type: 'hideTip' });
    expect(removed).toHaveBeenCalledTimes(3);
    expect(layer.tooltip(params.get(b[2])!)).toBe('');
    expect(layer.htmlTooltip(params.get(b[2])!)).toBe('');
    added.mock.calls[2][0].trigger('click', {} as never);
    expect(pick).not.toHaveBeenCalled();
    chart.dispose();
    layer.paint(chart, [a], pick, 'disposed');
    expect(added).toHaveBeenCalledTimes(3);
  } finally {
    layer.dispose();
    if (!chart.isDisposed()) chart.dispose();
    vi.restoreAllMocks();
  }
});

it.each([
  [1, 1, -1, -1],
  [10, 170, 10, -170],
  [-33.947, 151.176, -33.946, 151.177],
])(
  'real axes contain the entire existing linear coordinate path and descending altitude (%s)',
  (lat1, lon1, lat2, lon2) => {
    const origin: ProfileOrigin = {
      missionId: 'test',
      label: 'fixed',
      latitudeDeg: -33.9461,
      longitudeDeg: 151.1772,
    };
    const current = {
      latitudeDeg: lat1,
      longitudeDeg: lon1,
      altitude: { reference: 'ELLIPSOID' as const, metres: 200 },
    };
    const committed = {
      latitudeDeg: lat2,
      longitudeDeg: lon2,
      altitude: { reference: 'ELLIPSOID' as const, metres: -40 },
    };
    const bounds = profileMotionBounds(origin, [{ current, committed }]);
    const chart = init(null, undefined, {
      renderer: 'svg',
      ssr: true,
      width: 500,
      height: 300,
    });
    try {
      chart.setOption({
        ...chartBase,
        xAxis: { type: 'value', min: 0 },
        yAxis: { type: 'value', scale: true },
        series: [
          {
            type: 'scatter',
            silent: true,
            symbolSize: 0,
            tooltip: { show: false },
            data: bounds,
          },
        ],
      });
      for (let step = 0; step <= 100; step++) {
        const t = step / 100,
          p = {
            latitudeDeg: lat1 + (lat2 - lat1) * t,
            longitudeDeg: lon1 + (lon2 - lon1) * t,
          };
        for (const altitude of [200, -40, 200 - 240 * t]) {
          const pixel = chart.convertToPixel({ gridIndex: 0 }, [
            radialKm(origin, p),
            altitude,
          ]) as number[];
          expect(chart.containPixel({ gridIndex: 0 }, pixel)).toBe(true);
        }
      }
      expect(profileMotionBounds(origin, [])).toEqual([]);
    } finally {
      chart.dispose();
    }
  },
);
