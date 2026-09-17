import { affiliationSymbols } from './symbology';
import type { SceneObject, SceneDestination } from './contracts';

/** Neutral endpoint cross and stage ring, spatially distinct from reported symbols. */
export function destinationCanvas(destination: SceneDestination) {
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d')!;
  const text =
    destination.stage === 'accepted'
      ? destination.label.slice(0, 36)
      : `${destination.label.slice(0, 45)} · ${destination.stage}`;
  context.font = '22px ui-monospace, Consolas, monospace';
  canvas.width = Math.ceil(context.measureText(text).width) + 80;
  canvas.height = 56;
  context.scale(2, 2);
  context.fillStyle = '#0b1015';
  context.strokeStyle = '#d1dae2';
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(14, 14, 10, 0, Math.PI * 2);
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
  context.moveTo(9, 14);
  context.lineTo(19, 14);
  context.moveTo(14, 9);
  context.lineTo(14, 19);
  context.stroke();
  context.fillStyle = 'rgba(11,16,21,0.9)';
  context.fillRect(30, 5, canvas.width / 2 - 30, 18);
  context.fillStyle = '#c6cdd4';
  context.font = '11px ui-monospace, Consolas, monospace';
  context.textBaseline = 'middle';
  context.fillText(text, 34, 14);
  return canvas;
}

/** Shared glyph geometry; selection never changes affiliation colour or shape. */
export function symbolCanvas(
  affiliation: SceneObject['affiliation'],
  selected = false,
  keyboard = false,
  stale = false,
  unavailable = false,
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
  context.globalAlpha = stale || unavailable ? 0.55 : 1;
  context.fillStyle = '#0b1015';
  context.strokeStyle = symbol.color;
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
  if (unavailable) {
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
