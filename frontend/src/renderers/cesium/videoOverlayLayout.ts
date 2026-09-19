export interface OverlayPoint {
  id: string;
  x: number;
  y: number;
  width: number;
  secondaryWidth: number;
  selected: boolean;
}
export interface OverlayLabel {
  x: number;
  y: number;
  width: number;
  height: number;
  secondary: boolean;
  side: number;
  offsetY: number;
}
export interface ClipPoint {
  x: number;
  y: number;
  z: number;
  w: number;
}
/** Homogeneous camera projection. No screen-edge clamping or scenery occlusion. */
export function overlayWindowPoint(
  p: ClipPoint,
  width: number,
  height: number,
) {
  if (
    ![p.x, p.y, p.z, p.w, width, height].every(Number.isFinite) ||
    p.w <= 0 ||
    width <= 0 ||
    height <= 0 ||
    Math.abs(p.x) > p.w ||
    Math.abs(p.y) > p.w ||
    Math.abs(p.z) > p.w
  )
    return;
  return {
    x: ((p.x / p.w + 1) * width) / 2,
    y: ((1 - p.y / p.w) * height) / 2,
  };
}
/** Stable side preference, short leaders and bounded density; markers stay at their positions. */
export function layoutVideoLabels(
  points: OverlayPoint[],
  width: number,
  height: number,
  previous: Map<string, OverlayLabel>,
) {
  const placed = new Map<string, OverlayLabel>();
  const budget = Math.min(
    16,
    Math.max(2, Math.floor((width * height) / 16000)),
  );
  const sorted = [...points].sort(
    (a, b) =>
      Number(b.selected) - Number(a.selected) || a.id.localeCompare(b.id),
  );
  for (const p of sorted) {
    if (placed.size >= budget) break;
    const old = previous.get(p.id);
    const sides = old?.side === -1 ? [-1, 1] : [1, -1];
    for (const secondary of [true, false]) {
      const w = Math.max(p.width, secondary ? p.secondaryWidth : 0) + 12,
        h = secondary ? 32 : 19;
      let found = false;
      for (const side of sides) {
        // Keep a valid relative placement while the camera/marker moves. Merely
        // making a higher-ranked slot available must not bounce the label 38 px.
        for (const dy of [
          ...new Set([...(old ? [old.offsetY] : []), -30, 8, -50, 28]),
        ]) {
          const candidate = {
            x: p.x + (side === 1 ? 20 : -w - 20),
            y: p.y + dy,
            width: w,
            height: h,
            secondary,
            side,
            offsetY: dy,
          };
          if (
            candidate.x < 5 ||
            candidate.y < 5 ||
            candidate.x + w > width - 5 ||
            candidate.y + h > height - 5
          )
            continue;
          if (
            [...placed.values()].some(
              (b) =>
                candidate.x < b.x + b.width + 5 &&
                candidate.x + w > b.x - 5 &&
                candidate.y < b.y + b.height + 5 &&
                candidate.y + h > b.y - 5,
            )
          )
            continue;
          // A label must not cover another entity's position marker.
          if (
            points.some(
              (q) =>
                q.id !== p.id &&
                q.x > candidate.x - 9 &&
                q.x < candidate.x + w + 9 &&
                q.y > candidate.y - 9 &&
                q.y < candidate.y + h + 9,
            )
          )
            continue;
          placed.set(p.id, candidate);
          found = true;
          break;
        }
        if (found) break;
      }
      if (found) break;
    }
  }
  return placed;
}
