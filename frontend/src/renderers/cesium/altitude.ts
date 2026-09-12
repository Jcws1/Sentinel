import type { Altitude } from '../../contracts/generated';
import type { DeepReadonly } from '../../contracts/types';

export interface VisualHeight {
  metres: number;
  quality: 'ellipsoid' | 'approximate-msl' | 'terrain-relative';
}
/** Presentation only. Source measurements remain untouched in the shared frame.
 * MSL uses an explicitly disclosed N=0 visual approximation, NOT a geoid conversion.
 * AGL requires sampled ellipsoid terrain height; missing terrain never becomes zero.
 */
export function visualHeight(
  altitude: DeepReadonly<Altitude>,
  terrainHeight?: number,
): VisualHeight | undefined {
  if (altitude.reference === 'MSL')
    return { metres: altitude.metres, quality: 'approximate-msl' };
  if (altitude.reference === 'AGL')
    return terrainHeight !== undefined && Number.isFinite(terrainHeight)
      ? { metres: altitude.metres + terrainHeight, quality: 'terrain-relative' }
      : undefined;
  if (
    altitude.datumId &&
    !['WGS84', 'WGS-84', 'EPSG:4979'].includes(altitude.datumId.toUpperCase())
  )
    return undefined;
  return { metres: altitude.metres, quality: 'ellipsoid' };
}
export const altitudeDisclosure =
  'MSL rendered with an approximate zero geoid offset (h ≈ H). This is not an MSL-to-WGS84 conversion. AGL requires sampled terrain. Source measurements are unchanged; do not use this view for vertical clearance.';
