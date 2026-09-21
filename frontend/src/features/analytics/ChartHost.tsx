import { useContext, useEffect, useRef } from 'react';
import { init, use, type EChartsType } from 'echarts/core';
import { BarChart, ScatterChart, LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption } from 'echarts';
import { PaneVisibilityContext } from '../../app/OperationalContext';
import { createChartMotion } from './chartMotion';
import { setChartProjection } from './chartProjection';

use([
  BarChart,
  ScatterChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  AriaComponent,
  CanvasRenderer,
]);
const counters = {
  created: 0,
  disposed: 0,
  updates: 0,
  motionUpdates: 0,
  resizes: 0,
};
export const chartDiagnostics = () => ({
  ...counters,
  active: counters.created - counters.disposed,
});
type PaintCapture = {
  label: string;
  motion: number[];
  rendered: number[];
  overflow: number;
};
let paintCapture: Map<string, PaintCapture> | undefined;
function capturePaint(
  chart: EChartsType,
  label: string,
  kind: 'motion' | 'rendered',
  now: number,
) {
  if (!paintCapture) return;
  let capture = paintCapture.get(chart.id);
  if (!capture) {
    if (paintCapture.size >= 16) return;
    capture = { label, motion: [], rendered: [], overflow: 0 };
    paintCapture.set(chart.id, capture);
  }
  if (capture[kind].length < 4096) capture[kind].push(now);
  else capture.overflow++;
}
/** ECharts item objects and named tuple dimensions carry the same opaque identity. */
export function chartEntityId(params: {
  data?: unknown;
  value?: unknown;
  dimensionNames?: readonly string[];
}): string | undefined {
  const data = params.data;
  if (data && typeof data === 'object' && 'entityId' in data)
    return typeof data.entityId === 'string' ? data.entityId : undefined;
  const index = params.dimensionNames?.indexOf('entityId') ?? -1;
  const id =
    index >= 0 && Array.isArray(params.value) ? params.value[index] : undefined;
  return typeof id === 'string' ? id : undefined;
}
if (import.meta.env.MODE === 'verification')
  Object.assign(globalThis, {
    __sentinelChartsTest: {
      inspect: chartDiagnostics,
      startPaintCapture: () => {
        paintCapture = new Map();
      },
      stopPaintCapture: () => {
        const result = Object.fromEntries(paintCapture ?? []);
        paintCapture = undefined;
        return result;
      },
    },
  });
export const chartBase: EChartsOption = {
  animation: false,
  color: ['#7bc8ee', '#dca775', '#85c5a8', '#b6a1dc', '#d2c574'],
  textStyle: {
    color: '#bcc9d5',
    fontFamily: 'Inter, sans-serif',
    fontSize: 11,
  },
  grid: { left: 64, right: 24, top: 36, bottom: 46, containLabel: true },
  tooltip: { trigger: 'item', confine: true, renderMode: 'richText' },
};
export function barOption(
  values: readonly (readonly [string, number | null])[],
  unit = 'Count',
  signed = false,
): EChartsOption {
  return {
    ...chartBase,
    xAxis: {
      type: 'value',
      name: unit,
      nameLocation: 'middle',
      nameGap: 28,
      // Every bar retains zero; signed native altitude may extend below it.
      min: signed ? undefined : 0,
      scale: false,
      minInterval: unit === 'Count' ? 1 : undefined,
      splitLine: { lineStyle: { color: '#263342' } },
    },
    yAxis: {
      type: 'category',
      data: values.map((v) => v[0]),
      axisLabel: { width: 100, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: values.map((v) => v[1]),
        label: { show: true, position: 'right', color: '#d9e6ef' },
        barMaxWidth: 24,
      },
    ],
  };
}
/** The host owns only chart/DOM resources. Numeric tables/buttons supply keyboard access. */
export function ChartHost({
  option,
  label,
  onPick,
  motion,
  onMotion,
  onDispose,
  replaceSeries = false,
}: {
  option: EChartsOption;
  label: string;
  onPick?: (id: string) => void;
  motion?: { subscribe: (listener: (now: number) => void) => () => void };
  onMotion?: (chart: EChartsType, now: number) => void;
  onDispose?: () => void;
  replaceSeries?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<EChartsType | null>(null);
  const motionPaint = useRef<ReturnType<typeof createChartMotion> | null>(null);
  const visible = useContext(PaneVisibilityContext);
  const current = useRef({
    option,
    label,
    onPick,
    onMotion,
    onDispose,
    replaceSeries,
  });
  useEffect(() => {
    current.current = {
      option,
      label,
      onPick,
      onMotion,
      onDispose,
      replaceSeries,
    };
  }, [option, label, onPick, onMotion, onDispose, replaceSeries]);
  const paintLayer = (chart: EChartsType) => {
    if (!current.current.onMotion) return;
    const now = host.current!.ownerDocument.defaultView!.performance.now();
    current.current.onMotion(chart, now);
    // Axis layout is synchronous at projection/resize boundaries. Flush the
    // reprojected layer in the same turn so old coordinates cannot be displayed.
    chart.getZr().flush();
  };
  useEffect(() => {
    // A new authoritative projection supersedes any queued motion from the old one.
    motionPaint.current?.reset();
    if (instance.current) {
      setChartProjection(instance.current, option, replaceSeries);
      paintLayer(instance.current);
      counters.updates++;
    }
  }, [option, replaceSeries]);
  useEffect(() => {
    const el = host.current;
    if (!el || !visible) return;
    const doc = el.ownerDocument,
      win = doc.defaultView!;
    let pending = 0,
      stopAnimation: (() => void) | undefined;
    const dispose = () => {
      stopAnimation?.();
      stopAnimation = undefined;
      motionPaint.current?.dispose();
      motionPaint.current = null;
      if (instance.current) {
        current.current.onDispose?.();
        instance.current.dispose();
        instance.current = null;
        counters.disposed++;
      }
    };
    const resize = () => {
      pending = 0;
      if (doc.hidden || !el.clientWidth || !el.clientHeight) {
        dispose();
        return;
      }
      if (!instance.current) {
        const axis = {
          axisLabel: { color: '#bcc9d5' },
          nameTextStyle: { color: '#bcc9d5' },
          axisLine: { lineStyle: { color: '#617487' } },
        };
        const chart = init(
          el,
          { categoryAxis: axis, valueAxis: axis },
          { renderer: 'canvas' },
        );
        instance.current = chart;
        counters.created++;
        if (import.meta.env.MODE === 'verification')
          chart.on('rendered', () =>
            capturePaint(
              chart,
              current.current.label,
              'rendered',
              win.performance.now(),
            ),
          );
        setChartProjection(
          chart,
          current.current.option,
          current.current.replaceSeries,
        );
        paintLayer(chart);
        counters.updates++;
        chart.on('click', (p) => {
          const id = chartEntityId(p);
          if (id) current.current.onPick?.(id);
        });
        const painter = createChartMotion(win, (now) => {
          if (current.current.onMotion) {
            current.current.onMotion(chart, now);
            counters.motionUpdates++;
            if (import.meta.env.MODE === 'verification')
              capturePaint(chart, current.current.label, 'motion', now);
          }
        });
        motionPaint.current = painter;
        stopAnimation = motion?.subscribe(painter.update);
      } else {
        instance.current.resize();
        paintLayer(instance.current);
        counters.resizes++;
      }
    };
    const schedule = () => {
      win.cancelAnimationFrame(pending);
      pending = win.requestAnimationFrame(resize);
    };
    const visibility = () => {
      if (doc.hidden) {
        win.cancelAnimationFrame(pending);
        pending = 0;
        dispose();
      } else schedule();
    };
    const observer = new (win as Window & typeof globalThis).ResizeObserver(
      schedule,
    );
    observer.observe(el);
    doc.addEventListener('visibilitychange', visibility);
    resize();
    return () => {
      win.cancelAnimationFrame(pending);
      observer.disconnect();
      doc.removeEventListener('visibilitychange', visibility);
      dispose();
    };
  }, [visible, motion]);
  return (
    <div
      className="analytic-chart"
      ref={host}
      role="img"
      aria-label={`${label}. Numeric values and selection controls follow.`}
    />
  );
}
