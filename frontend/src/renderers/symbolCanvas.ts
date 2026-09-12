import { affiliationSymbols } from './symbology';
import type { SceneObject } from './contracts';

/** Shared glyph geometry; selection never changes affiliation colour or shape. */
export function symbolCanvas(
  affiliation: SceneObject['affiliation'],
  selected = false,
  keyboard = false,
  stale = false,
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
  context.globalAlpha = stale ? 0.6 : 1;
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
  return canvas;
}
