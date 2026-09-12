import { IonImageryProvider } from 'cesium';

/** Cesium 1.145 caches a rejected endpoint promise indefinitely (fromAssetId).
 * Evict only our failed request so explicit Retry can recover, retaining successful
 * endpoint caching across panes to avoid extra imagery sessions. This narrow SDK
 * compatibility shim is covered by the browser's 401 -> success test; revisit on upgrades.
 */
export async function ionImagery(assetId: number, accessToken: string) {
  try {
    return await IonImageryProvider.fromAssetId(assetId, { accessToken });
  } catch (error) {
    const cache = (
      IonImageryProvider as unknown as {
        _endpointCache?: Record<string, unknown>;
      }
    )._endpointCache;
    if (cache) delete cache[`${assetId}${accessToken}undefined`];
    throw error;
  }
}
