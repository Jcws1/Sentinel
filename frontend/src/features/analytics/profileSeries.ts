import type {
  ScatterSeriesOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts';

/** Single-column values remain readable in the supported narrow split pane.
 * Precision matches numeric inspection. This is plain text; the HTML tooltip
 * inserts it via textContent, never interpreted source markup.
 */
export function profileTooltip(
  params: TooltipComponentFormatterCallbackParams,
) {
  const point = Array.isArray(params) ? params[0] : params;
  if (!point || !Array.isArray(point.value)) return '';
  const [distance, altitude] = point.value;
  if (typeof distance !== 'number' || typeof altitude !== 'number') return '';
  const label = point.name;
  const heading =
    point.seriesName === 'Current presentation' ? 'Current presentation\n' : '';
  return `${heading}${label}\nDistance: ${distance.toFixed(3)} km\nAltitude: ${altitude.toFixed(2)} m`;
}

export function profileTooltipContent(doc: Document, text: string) {
  const content = doc.createElement('div');
  content.setAttribute('role', 'tooltip');
  content.style.whiteSpace = 'pre';
  content.textContent = text;
  return content;
}

/** Primitive dimensions avoid ECharts' per-item style/label models on motion.
 * Public encode fields preserve item identity, source-context names and tooltips.
 */
export type ProfileDatum = [
  distanceKm: number,
  altitudeMetres: number,
  entityId: string,
  observationLabel: string,
  colour: string,
  size: number,
];

const colours = {
  friendly: [123, 200, 238],
  hostile: [231, 165, 129],
  neutral: [150, 202, 170],
  unknown: [192, 181, 161],
} as const;

export function profileColour(
  affiliation: keyof typeof colours,
  tracking: boolean,
) {
  return `rgba(${colours[affiliation].join(',')},${tracking ? 1 : 0.45})`;
}

export function profileSeries(data: ProfileDatum[]): ScatterSeriesOption {
  return {
    id: 'current',
    type: 'scatter',
    name: 'Current presentation',
    dimensions: [
      { name: 'distanceKm', displayName: 'Distance (km)', type: 'float' },
      { name: 'altitudeMetres', displayName: 'Altitude (m)', type: 'float' },
      { name: 'entityId', type: 'ordinal' },
      { name: 'observationLabel', type: 'ordinal' },
      { name: 'colour', type: 'ordinal' },
      { name: 'size', type: 'float' },
    ],
    encode: {
      x: 'distanceKm',
      y: 'altitudeMetres',
      itemId: 'entityId',
      itemName: 'observationLabel',
      tooltip: ['distanceKm', 'altitudeMetres'],
    },
    data,
    // Public current-marker graphics use these identities and metadata for
    // manual tooltip dispatch. Backing symbols never paint or receive hits.
    symbolSize: 0,
    silent: true,
    emphasis: { disabled: true },
    // RGBA preserves the existing 0.45 stale/unobserved opacity without an
    // unsupported per-item opacity callback or a second visual-mapping pipeline.
    itemStyle: {
      opacity: 1,
      color: (params) => (params.value as ProfileDatum)[4],
    },
  };
}
