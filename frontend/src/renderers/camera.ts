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
      20,
      Math.log2(
        groundSpan(0, camera.center.latitudeDeg, width) /
          Math.max(1, camera.groundSpanM),
      ),
    ),
  );
}
/** Frame once on mission entry; recenter explicitly recomputes current visible extent. */
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
