import { affiliationSymbols } from './symbology';
import type { SceneObject, SceneDestination } from './contracts';
import { unitGlyphs } from './unitGlyphs';
import type { DisplayPreferences } from '../state/displayPreferences';

export const entityLabelVisible = (
  o: SceneObject,
  display?: Readonly<DisplayPreferences>,
) =>
  display?.labels !== 'selected' ||
  o.selected ||
  o.condition === 'non-operational' ||
  Boolean(o.unavailable);
export const entityLabel = (
  o: SceneObject,
  display?: Readonly<DisplayPreferences>,
) => {
  const name = o.label.length > 36 ? `${o.label.slice(0, 35)}…` : o.label;
  return `${name}${o.unavailable ? ` · ${o.unavailable}` : o.stale ? ' · Last known' : ''}${display?.entityStyle === 'silhouette' && display.labels !== 'minimal' ? ` · ${o.affiliation}` : ''}${o.planLabel ? ` · ${o.planLabel}` : ''}`;
};

export function boundaryCaption(text: string, color: string) {
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d')!;
  const lines = text.split('\n');
  context.font = '20px Inter, sans-serif';
  canvas.width =
    Math.ceil(
      Math.max(...lines.map((line) => context.measureText(line).width)),
    ) + 20;
  canvas.height = lines.length * 26 + 14;
  context.font = '20px Inter, sans-serif';
  context.fillStyle = '#10191eeb';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.textBaseline = 'middle';
  lines.forEach((line, index) => context.fillText(line, 10, 20 + index * 26));
  return canvas;
}

/** Neutral endpoint cross and stage ring, spatially distinct from reported symbols. */
export function destinationCanvas(
  destination: SceneDestination,
  style: DisplayPreferences['destinationStyle'] = 'ring',
) {
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d')!;
  const text = destination.outcome
    ? destination.label
    : destination.stage === 'accepted'
      ? destination.label.slice(0, 36)
      : `${destination.label.slice(0, 45)} · ${destination.stage}`;
  const lines = text.split('\n');
  context.font = '22px ui-monospace, Consolas, monospace';
  canvas.width =
    Math.ceil(
      Math.max(...lines.map((line) => context.measureText(line).width)),
    ) + 80;
  canvas.height = Math.max(56, lines.length * 28 + 12);
  context.scale(2, 2);
  const center = canvas.height / 4;
  context.fillStyle = '#0b1015';
  context.strokeStyle = '#d1dae2';
  context.lineWidth = destination.selected ? 2.5 : 1.25;
  context.beginPath();
  if (style === 'flag' && !destination.outcome) {
    context.moveTo(10, center + 10);
    context.lineTo(10, center - 10);
    context.lineTo(23, center - 7);
    context.lineTo(10, center - 2);
  } else
    context.arc(14, center, style === 'crosshair' ? 7 : 10, 0, Math.PI * 2);
  context.fill();
  context.setLineDash(
    destination.stage === 'draft'
      ? [4, 3]
      : destination.stage === 'requested'
        ? [1, 3]
        : [],
  );
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  if (style === 'crosshair' || destination.outcome) {
    context.moveTo(2, center);
    context.lineTo(10, center);
    context.moveTo(18, center);
    context.lineTo(26, center);
    context.moveTo(14, center - 12);
    context.lineTo(14, center - 4);
    context.moveTo(14, center + 4);
    context.lineTo(14, center + 12);
  } else if (style === 'ring') context.arc(14, center, 1, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = 'rgba(11,16,21,0.9)';
  context.fillRect(
    30,
    center - lines.length * 7 - 2,
    canvas.width / 2 - 30,
    lines.length * 14 + 4,
  );
  context.fillStyle = '#c6cdd4';
  context.font = '11px ui-monospace, Consolas, monospace';
  context.textBaseline = 'middle';
  lines.forEach((line, i) =>
    context.fillText(line, 34, center + (i - (lines.length - 1) / 2) * 14),
  );
  return canvas;
}

/** Shared glyph geometry; selection never changes affiliation colour or shape. */
export function symbolCanvas(
  affiliation: SceneObject['affiliation'],
  selected = false,
  keyboard = false,
  stale = false,
  unavailable = false,
  nonOperational = false,
  profileId?: string,
  style: DisplayPreferences['entityStyle'] = 'minimal',
) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 56;
  const context = canvas.getContext('2d')!;
  context.scale(2, 2);
  context.translate(14, 14);
  if (selected || keyboard) {
    context.strokeStyle = selected ? '#eef2f5' : '#aab4bf';
    context.lineWidth = 1;
    if (keyboard && !selected) context.setLineDash([2, 2]);
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  const symbol = affiliationSymbols[affiliation];
  context.globalAlpha = nonOperational ? 1 : stale || unavailable ? 0.55 : 1;
  context.fillStyle = '#0b1015';
  context.strokeStyle = nonOperational ? '#9ba5af' : symbol.color;
  context.lineWidth = 2;
  context.beginPath();
  if (symbol.shape === 'circle') context.arc(0, 0, 7, 0, Math.PI * 2);
  else if (symbol.shape === 'diamond') {
    context.moveTo(0, -9);
    context.lineTo(9, 0);
    context.lineTo(0, 9);
    context.lineTo(-9, 0);
    context.closePath();
  } else if (symbol.shape === 'rectangle') context.rect(-9, -6, 18, 12);
  else context.rect(-7, -7, 14, 14);
  context.fill();
  context.stroke();
  const glyph =
    style === 'silhouette' && profileId ? unitGlyphs[profileId] : undefined;
  if (glyph) {
    // Type is shared across affiliations; the surrounding frame retains meaning without colour.
    context.fillStyle = '#0b1015';
    context.fillRect(-8, -5, 16, 10);
    context.save();
    context.scale(0.72, 0.72);
    context.translate(-12, -12);
    context.lineWidth = 1.7;
    context.lineJoin = 'round';
    const path = new Path2D(glyph);
    context.fill(path);
    context.stroke(path);
    context.restore();
  }
  if (nonOperational) {
    context.strokeStyle = '#c4cbd2';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-10, 10);
    context.lineTo(10, -10);
    context.stroke();
  } else if (unavailable) {
    context.globalAlpha = 1;
    context.fillStyle = '#10171e';
    context.fillRect(4, 3, 9, 9);
    context.strokeStyle = '#bac2ca';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(6, 7.5);
    context.lineTo(11, 7.5);
    context.stroke();
  }
  return canvas;
}
