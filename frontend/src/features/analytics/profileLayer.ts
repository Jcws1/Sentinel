import { graphic, type EChartsType } from 'echarts/core';
import type { TooltipComponentFormatterCallbackParams } from 'echarts';
import type { DeepReadonly } from '../../contracts/types';
import type { Position3D } from '../../contracts/generated';
import { radialKm, type ProfileOrigin } from './projections';
import {
  profileTooltip,
  profileTooltipContent,
  type ProfileDatum,
} from './profileSeries';

/** Axis-only envelope for the existing linear latitude/longitude presentation.
 * R(|Δlatitude| + |Δlongitude|) bounds that path on the sphere. These two
 * invisible points are layout bounds, never observations or telemetry samples.
 */
export function profileMotionBounds(
  origin: ProfileOrigin,
  positions: readonly {
    current: DeepReadonly<Position3D>;
    committed: DeepReadonly<Position3D>;
  }[],
): number[][] {
  if (!positions.length) return [];
  let farthest = 0,
    lowest = Infinity,
    highest = -Infinity;
  for (const { current, committed } of positions) {
    const pathBound =
      ((Math.abs(current.latitudeDeg - committed.latitudeDeg) +
        Math.abs(current.longitudeDeg - committed.longitudeDeg)) *
        Math.PI *
        6371.0088) /
      180;
    farthest = Math.max(farthest, radialKm(origin, current) + pathBound);
    lowest = Math.min(
      lowest,
      current.altitude.metres,
      committed.altitude.metres,
    );
    highest = Math.max(
      highest,
      current.altitude.metres,
      committed.altitude.metres,
    );
  }
  return [
    [0, lowest],
    [farthest, highest],
  ];
}

/** One chart-owned layer on ECharts' existing canvas. Public graphics APIs only.
 * The authoritative series owns axes/data; motion changes circles, not models.
 */
export function createProfileLayer() {
  type Marker = {
    circle: InstanceType<typeof graphic.Circle>;
    data: ProfileDatum;
    index: number;
    pick: (id: string) => void;
  };
  const markers = new Map<string, Marker>();
  let chart: EChartsType | undefined,
    hovered: string | undefined,
    identity: string | undefined;
  const show = (marker: Marker) => {
    if (!chart || chart.isDisposed() || markers.get(marker.data[2]) !== marker)
      return;
    hovered = marker.data[2];
    chart.dispatchAction({
      type: 'showTip',
      seriesIndex: 0,
      dataIndex: marker.index,
      position: [marker.circle.shape.cx + 10, marker.circle.shape.cy + 10],
    });
  };
  const hide = (allTooltips = false) => {
    if ((hovered || allTooltips) && chart && !chart.isDisposed())
      chart.dispatchAction({ type: 'hideTip' });
    hovered = undefined;
  };
  const remove = (marker: Marker) => {
    if (hovered === marker.data[2]) hide();
    marker.circle.off();
    if (chart && !chart.isDisposed()) chart.getZr().remove(marker.circle);
  };
  const dispose = () => {
    hide(true);
    for (const marker of markers.values()) remove(marker);
    markers.clear();
    chart = undefined;
    identity = undefined;
  };
  const tooltip = (params: TooltipComponentFormatterCallbackParams) => {
    const point = Array.isArray(params) ? params[0] : params;
    if (point?.seriesId !== 'current') return profileTooltip(params);
    const id = Array.isArray(point.value) ? point.value[2] : undefined;
    const marker = typeof id === 'string' ? markers.get(id) : undefined;
    // A removed identity cannot borrow the replacement's same array index.
    return marker
      ? profileTooltip({ ...point, name: marker.data[3], value: marker.data })
      : '';
  };
  return {
    dispose,
    tooltip,
    htmlTooltip(params: TooltipComponentFormatterCallbackParams) {
      const text = tooltip(params);
      return text && chart && !chart.isDisposed()
        ? profileTooltipContent(chart.getDom().ownerDocument, text)
        : '';
    },
    paint(
      target: EChartsType,
      data: ProfileDatum[],
      pick: (id: string) => void,
      key: string,
    ) {
      if (target.isDisposed()) return;
      if (chart !== target || identity !== key) {
        dispose();
        chart = target;
        identity = key;
      }
      const ids = new Set(data.map((point) => point[2]));
      for (const [id, marker] of markers) {
        if (!ids.has(id)) {
          remove(marker);
          markers.delete(id);
        }
      }
      data.forEach((point, index) => {
        const id = point[2];
        let marker = markers.get(id);
        if (!marker) {
          const circle = new graphic.Circle({ z: 3, cursor: 'pointer' });
          marker = { circle, data: point, index, pick };
          const current = marker;
          circle.on('click', () => {
            if (
              chart &&
              !chart.isDisposed() &&
              markers.get(current.data[2]) === current
            )
              current.pick(current.data[2]);
          });
          // This public graphic has no private series event metadata. Stop the
          // generic chart hover handler from hiding our explicit showTip action.
          circle.on('mouseover', (event) => {
            event.cancelBubble = true;
            show(current);
          });
          circle.on('mousemove', (event) => {
            event.cancelBubble = true;
            show(current);
          });
          circle.on('mouseout', (event) => {
            event.cancelBubble = true;
            if (hovered === current.data[2]) hide();
          });
          markers.set(id, marker);
          chart!.getZr().add(circle);
        }
        marker.data = point;
        marker.index = index;
        marker.pick = pick;
        const [x, y] = target.convertToPixel(
          { gridIndex: 0 },
          point.slice(0, 2),
        ) as number[];
        const shape = marker.circle.shape;
        if (shape.cx !== x || shape.cy !== y || shape.r !== point[5] / 2)
          marker.circle.setShape({ cx: x, cy: y, r: point[5] / 2 });
        if (marker.circle.style.fill !== point[4])
          marker.circle.setStyle({ fill: point[4], opacity: 1 });
      });
      if (hovered) {
        const marker = markers.get(hovered);
        if (marker) show(marker);
      }
    },
  };
}
