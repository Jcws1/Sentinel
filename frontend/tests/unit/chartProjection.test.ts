// @vitest-environment node
import { expect, it } from 'vitest';
import { init, use } from 'echarts/core';
import { ScatterChart, LineChart, BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { setChartProjection } from '../../src/features/analytics/chartProjection';
import { barOption } from '../../src/features/analytics/ChartHost';

use([ScatterChart, LineChart, BarChart, GridComponent, SVGRenderer]);

it.each([
  [180, 185],
  [-185, -180],
  [-180, 185],
])('keeps zero inside signed altitude bars for %s and %s', (a, b) => {
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 500,
    height: 300,
  });
  try {
    chart.setOption(
      barOption(
        [
          ['A', a],
          ['B', b],
          ['Missing', null],
        ],
        'm',
        true,
      ),
    );
    const zero = chart.convertToPixel({ xAxisIndex: 0 }, 0) as number;
    const y = chart.convertToPixel({ yAxisIndex: 0 }, 0) as number;
    expect(chart.containPixel({ gridIndex: 0 }, [zero, y])).toBe(true);
    const pa = chart.convertToPixel({ xAxisIndex: 0 }, a) as number;
    const pb = chart.convertToPixel({ xAxisIndex: 0 }, b) as number;
    expect(chart.containPixel({ gridIndex: 0 }, [pa, y])).toBe(true);
    expect(chart.containPixel({ gridIndex: 0 }, [pb, y])).toBe(true);
    // Bar lengths are proportional to the raw signed measurements, not their
    // difference from a truncated minimum. Missing remains an absent bar.
    expect((pa - zero) / (pb - zero)).toBeCloseTo(a / b, 8);
    expect((chart.getOption().series as { data: unknown[] }[])[0].data).toEqual(
      [a, b, null],
    );
  } finally {
    chart.dispose();
  }
});

it.each([false, true])(
  'replaces history and axis extents with deferred painting %s, including a subsequent motion patch',
  (deferPaint) => {
    const chart = init(null, undefined, {
      renderer: 'svg',
      ssr: true,
      width: 400,
      height: 300,
    });
    const axes = {
      animation: false,
      xAxis: { type: 'value' as const, min: 0, axisLabel: { show: false } },
      yAxis: { type: 'value' as const, axisLabel: { show: false } },
    };
    try {
      setChartProjection(
        chart,
        {
          ...axes,
          series: [
            {
              id: 'current',
              type: 'scatter',
              data: [{ id: 'old-entity', value: [900, 180] }],
            },
            {
              id: 'history-0',
              type: 'line',
              data: [
                [800, 180],
                [900, 180],
              ],
            },
            {
              id: 'history-1',
              type: 'line',
              data: [
                [950, 180],
                [1000, 180],
              ],
            },
          ],
        },
        true,
        deferPaint,
      );
      if (deferPaint) chart.getZr().animation.update();
      const previousPixel = chart.convertToPixel({ xAxisIndex: 0 }, 5);
      setChartProjection(
        chart,
        {
          ...axes,
          series: [
            {
              id: 'current',
              type: 'scatter',
              data: [{ id: 'new-entity', value: [5, 90] }],
            },
            {
              id: 'history-0',
              type: 'line',
              data: [
                [1, 90],
                [4, 90],
              ],
            },
          ],
        },
        true,
        deferPaint,
      );
      if (deferPaint) {
        // A motion update can arrive after the authoritative replacement but before
        // the next ECharts paint. It must not revive removed entities/history or
        // lose the corrected series and axis extents.
        chart.setOption(
          {
            series: [
              { id: 'current', data: [{ id: 'new-entity', value: [5, 95] }] },
            ],
          },
          { lazyUpdate: true, silent: true },
        );
        expect(chart.convertToPixel({ xAxisIndex: 0 }, 5) as number).toBe(
          previousPixel,
        );
        chart.getZr().animation.update();
      }
      const series = chart.getOption().series as {
        id: string;
        data: unknown[];
      }[];
      expect(series.map((s) => s.id)).toEqual(['current', 'history-0']);
      expect(series[0].data).toEqual([
        { id: 'new-entity', value: [5, deferPaint ? 95 : 90] },
      ]);
      expect(series[1].data).toEqual([
        [1, 90],
        [4, 90],
      ]);
      expect(
        chart.convertToPixel({ xAxisIndex: 0 }, 5) as number,
      ).toBeGreaterThan(300);
      setChartProjection(
        chart,
        { ...axes, series: [{ id: 'current', type: 'scatter', data: [] }] },
        true,
        deferPaint,
      );
      if (deferPaint) chart.getZr().animation.update();
      expect(chart.getOption().series).toEqual([
        expect.objectContaining({ id: 'current', data: [] }),
      ]);
    } finally {
      chart.dispose();
    }
  },
);
