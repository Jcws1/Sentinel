import type { CameraIntent } from './contracts';

export interface MapRegion {
  readonly id: string;
  readonly label: string;
  readonly bounds: readonly [number, number, number, number];
  readonly minSpanM: number;
  readonly maxSpanM: number;
}
/** Replaceable presentation policy, explicitly matched to existing mission metadata.
 * It neither clips operational objects nor changes source positions or eligibility.
 * Archive coverage and maximum source zoom are independent of camera limits.
 */
export const regionalMissions: Readonly<Record<string, MapRegion>> = {
  'fixture-tactical': {
    id: 'singapore-seasia',
    label: 'Singapore / Southeast Asia',
    bounds: [99, -1.5, 105.5, 7],
    minSpanM: 150,
    maxSpanM: 1_100_000,
  },
};
export function constrainCamera(
  camera: CameraIntent,
  region?: MapRegion,
): CameraIntent {
  if (!region) return camera;
  const [west, south, east, north] = region.bounds;
  return {
    ...camera,
    center: {
      longitudeDeg: Math.max(west, Math.min(east, camera.center.longitudeDeg)),
      latitudeDeg: Math.max(south, Math.min(north, camera.center.latitudeDeg)),
    },
    groundSpanM: Math.max(
      region.minSpanM,
      Math.min(region.maxSpanM, camera.groundSpanM),
    ),
  };
}
