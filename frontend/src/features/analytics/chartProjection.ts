import type { EChartsType } from 'echarts/core';
import type { EChartsOption } from 'echarts';

/** Stable chart kinds can retain their axes/views while replacing the complete
 * series set. replaceMerge is essential: ordinary merging retains removed paths.
 * Motion views can defer painting so full and current-only updates share a paint;
 * ECharts still applies each model replacement immediately and in order.
 */
export function setChartProjection(
  chart: EChartsType,
  option: EChartsOption,
  replaceSeries = false,
  deferPaint = false,
) {
  chart.setOption(option, {
    ...(replaceSeries ? { replaceMerge: ['series'] } : { notMerge: true }),
    lazyUpdate: deferPaint,
  });
}
