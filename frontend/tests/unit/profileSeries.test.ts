// @vitest-environment node
import { expect, it } from 'vitest';
import { init, use } from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { chartEntityId } from '../../src/features/analytics/ChartHost';
import {
  profileColour,
  profileSeries,
  profileTooltip,
  type ProfileDatum,
} from '../../src/features/analytics/profileSeries';

use([SVGRenderer]);

it('formats current and observed tooltip values on separate lines with explicit units and numeric-table precision', () => {
  const point = {
    componentType: 'series',
    componentSubType: 'scatter',
    componentIndex: 0,
    seriesType: 'scatter',
    seriesIndex: 0,
    seriesName: 'Current presentation',
    name: 'Entity {raw|name}\n2026-09-20T12:00:00Z\nstale · MSL',
    dataIndex: 0,
    data: [],
    value: [0.176073928, -185.126],
    $vars: [],
  };
  expect(profileTooltip(point)).toBe(
    'Current presentation\nEntity {raw|name}\n2026-09-20T12:00:00Z\nstale · MSL\nDistance: 0.176 km\nAltitude: -185.13 m',
  );
  expect(
    profileTooltip({
      ...point,
      seriesName: 'Observed · source gap',
      name: 'Observed\n2026-09-20T11:59:00Z\nsource\nELLIPSOID',
      value: [1.5, 180],
    }),
  ).toBe(
    'Observed\n2026-09-20T11:59:00Z\nsource\nELLIPSOID\nDistance: 1.500 km\nAltitude: 180.00 m',
  );
  expect(profileTooltip({ ...point, value: [null, 180] })).toBe('');
});

it('real ECharts tuples retain opaque identity, tooltip dimensions, selection size and stale alpha', () => {
  const observed: ProfileDatum = [
    1.25,
    180,
    'entity:/opaque [a]|" <& Ω',
    'Original name\n2026-09-20T12:00:00Z\ntracking · MSL',
    profileColour('friendly', true),
    13,
  ];
  const stale: ProfileDatum = [
    2.5,
    -185,
    'other:entity',
    'Last known\n2026-09-20T11:59:00Z\nstale · MSL',
    profileColour('hostile', false),
    8,
  ];
  const chart = init(null, undefined, {
    renderer: 'svg',
    ssr: true,
    width: 500,
    height: 300,
  });
  const captures: {
    id?: string;
    name: string;
    value: unknown;
    dimensions?: string[];
    encode?: unknown;
    colour: unknown;
    size?: number | number[];
  }[] = [];
  const option = profileSeries([observed, stale]);
  const colour = option.itemStyle!.color;
  if (typeof colour !== 'function') throw new Error('Expected colour callback');
  expect(option.symbolSize).toBe(0);
  expect(option.silent).toBe(true);
  option.itemStyle!.color = (params) => {
    const value = colour(params);
    captures.push({
      id: chartEntityId(params),
      name: params.name,
      value: params.value,
      dimensions: params.dimensionNames,
      encode: params.encode,
      colour: value,
    });
    return value;
  };
  try {
    chart.setOption({
      animation: false,
      xAxis: { type: 'value', min: 0, axisLabel: { show: false } },
      yAxis: { type: 'value', axisLabel: { show: false } },
      series: [option],
    });
    expect(captures.map((p) => [p.id, p.name, p.value, p.colour])).toEqual([
      [observed[2], observed[3], observed, observed[4]],
      [stale[2], stale[3], stale, stale[4]],
    ]);
    expect(captures[0].dimensions).toEqual([
      'distanceKm',
      'altitudeMetres',
      'entityId',
      'observationLabel',
      'colour',
      'size',
    ]);
    // Event params expose coordinate encoding only. Read the real library's
    // formatted tooltip/data in this test; production uses public option APIs.
    expect(captures[0].encode).toMatchObject({ x: [0], y: [1] });
    const seriesModel = () =>
      (
        chart as unknown as {
          getModel(): {
            getSeriesByIndex(index: number): {
              formatTooltip(index: number, multiple: boolean): unknown;
              getData(): {
                hasItemOption: boolean;
                getId(index: number): string;
              };
            };
          };
        }
      )
        .getModel()
        .getSeriesByIndex(0);
    expect(seriesModel().getData().hasItemOption).toBe(false);
    expect(seriesModel().getData().getId(0)).toBe(observed[2]);
    expect(seriesModel().formatTooltip(0, false)).toMatchObject({
      header: 'Current presentation',
      blocks: [
        { name: observed[3] },
        { name: 'Distance (km)', value: 1.25 },
        { name: 'Altitude (m)', value: 180 },
      ],
    });
    expect(chart.renderToSVGString()).toContain('fill-opacity="0.45"');

    // A corrected/reordered authoritative projection removes the old identity,
    // then a motion-only patch keeps the new metadata and named dimensions.
    const corrected: ProfileDatum = [
      0.5,
      95,
      'replacement',
      'Corrected source · ELLIPSOID',
      profileColour('neutral', true),
      8,
    ];
    chart.setOption(
      { series: [profileSeries([corrected])] },
      { replaceMerge: ['series'] },
    );
    chart.setOption({
      series: [{ id: 'current', data: [[0.6, ...corrected.slice(1)]] }],
    });
    const series = (
      chart.getOption().series as {
        data: ProfileDatum[];
        dimensions: { name: string }[];
      }[]
    )[0];
    expect(series.data).toEqual([[0.6, ...corrected.slice(1)]]);
    expect(seriesModel().getData().getId(0)).toBe('replacement');
    expect(
      chartEntityId({
        value: series.data[0],
        dimensionNames: series.dimensions.map((d) => d.name),
      }),
    ).toBe('replacement');
    chart.setOption(
      { series: [profileSeries([])] },
      { replaceMerge: ['series'] },
    );
    expect((chart.getOption().series as { data: unknown[] }[])[0].data).toEqual(
      [],
    );
  } finally {
    chart.dispose();
  }
});

it('picking uses the named identity dimension and never interprets an arbitrary numeric or tuple slot', () => {
  expect(chartEntityId({ data: { entityId: 'original-object-id' } })).toBe(
    'original-object-id',
  );
  expect(
    chartEntityId({
      value: [22, 'opaque-id'],
      dimensionNames: ['altitude', 'entityId'],
    }),
  ).toBe('opaque-id');
  expect(
    chartEntityId({
      value: [0, 0, 'not-an-identity'],
      dimensionNames: ['x', 'y', 'label'],
    }),
  ).toBeUndefined();
  expect(
    chartEntityId({ value: [42], dimensionNames: ['entityId'] }),
  ).toBeUndefined();
  expect(chartEntityId({ data: null })).toBeUndefined();
});
