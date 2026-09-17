import type { CameraIntent, SceneProjection } from './contracts';

const CIRCUMFERENCE = 40075016.68557849;
export const mercatorLatitude = (latitude: number) =>
  Math.max(-85.051129, Math.min(85.051129, latitude));
export function groundSpan(zoom: number, latitude: number, width: number) {
  return (
    (Math.max(1, width) *
      CIRCUMFERENCE *
      Math.cos((mercatorLatitude(latitude) * Math.PI) / 180)) /
    (512 * 2 ** zoom)
  );
}
export function zoomForCamera(camera: CameraIntent, width: number) {
  return Math.max(
    0,
    Math.min(
      24,
      Math.log2(
        groundSpan(0, camera.center.latitudeDeg, width) /
          Math.max(1, camera.groundSpanM),
      ),
    ),
  );
}
/** A physical wheel notch is about 100 pixel units; trackpads accumulate smoothly. */
export function wheelSpanFactor(
  deltaY: number,
  deltaMode: number,
  span: number,
) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 320 : 1);
  const rate = span <= 2000 ? Math.log(1.12) : Math.log(1.25);
  return Math.exp((Math.max(-240, Math.min(240, pixels)) * rate) / 100);
}
/** Fit a useful vertical neighbourhood too, rather than clipping it in a short pane. */
export function localHomeCamera(
  scene: SceneProjection,
  width: number,
  height: number,
) {
  if (!scene.localHome) return undefined;
  return {
    ...scene.localHome,
    center: { ...scene.localHome.center },
    groundSpanM: Math.max(
      scene.localHome.groundSpanM,
      (600 * width) / Math.max(1, height),
    ),
  };
}
export function boundsCamera(
  bounds: [[number, number], [number, number]],
  width: number,
  height: number,
  minimum = 150,
): CameraIntent {
  const longitude = (bounds[0][0] + bounds[1][0]) / 2,
    latitude = (bounds[0][1] + bounds[1][1]) / 2;
  return {
    center: { longitudeDeg: longitude, latitudeDeg: latitude },
    groundSpanM: Math.max(
      minimum,
      (bounds[1][0] - bounds[0][0]) *
        111320 *
        Math.cos((latitude * Math.PI) / 180) *
        1.4,
      (((bounds[1][1] - bounds[0][1]) * 111320 * width) / Math.max(1, height)) *
        1.4,
    ),
    headingTrueDeg: 0,
  };
}
/** Full mission extent is available only through an explicit Overview action. */
export function sceneBounds(
  scene: SceneProjection,
): [[number, number], [number, number]] | undefined {
  const points: number[][] = scene.objects.map((o) => [
    o.position.longitudeDeg,
    o.position.latitudeDeg,
  ]);
  for (const zone of scene.zones)
    for (const ring of zone.geometry.coordinates)
      for (const p of ring) points.push([...p]);
  if (!points.length && scene.referencePoint)
    points.push([
      scene.referencePoint.longitudeDeg,
      scene.referencePoint.latitudeDeg,
    ]);
  if (!points.length) return undefined;
  const lons = points.map((p) => p[0]),
    lats = points.map((p) => mercatorLatitude(p[1]));
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}
