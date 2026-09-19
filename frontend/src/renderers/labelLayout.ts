/** Bounded screen-space label placement. Input order is display priority only. */
export interface LabelAnchor {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  previous?: { offsetX: number; offsetY: number };
}
export function layoutLabels(
  anchors: LabelAnchor[],
  width: number,
  height: number,
) {
  const occupied: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = [];
  return anchors.map((a) => {
    const step = a.height + 8;
    const candidates = [a.offsetX, -a.width - a.offsetX].flatMap((dx) =>
      [0, -step, step, -2 * step, 2 * step, -3 * step, 3 * step].map((dy) => ({
        offsetX: dx,
        offsetY: a.offsetY + dy,
      })),
    );
    if (a.previous) candidates.unshift(a.previous);
    for (const { offsetX: dx, offsetY } of candidates) {
      const box = {
        left: a.x + dx - 4,
        top: a.y + offsetY - a.height / 2 - 4,
        right: a.x + dx + a.width + 4,
        bottom: a.y + offsetY + a.height / 2 + 4,
      };
      if (
        box.left < 4 ||
        box.top < 4 ||
        box.right > width - 4 ||
        box.bottom > height - 4
      )
        continue;
      if (
        occupied.some(
          (b) =>
            box.left < b.right &&
            box.right > b.left &&
            box.top < b.bottom &&
            box.bottom > b.top,
        )
      )
        continue;
      occupied.push(box);
      return { id: a.id, show: true, offsetX: dx, offsetY };
    }
    return { id: a.id, show: false, offsetX: a.offsetX, offsetY: a.offsetY };
  });
}
