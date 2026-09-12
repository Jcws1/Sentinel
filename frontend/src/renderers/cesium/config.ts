export interface CesiumProvider {
  token?: string;
  imageryAssetId: number | null;
  terrainAssetId: number | null;
  buildingsAssetId: number | null;
  googleKey?: string;
  photorealisticAssetId?: number | null;
}
/** Zero explicitly disables a layer. Malformed configuration fails closed. */
export function assetId(
  value: string | undefined,
  fallback: number,
): number | null {
  if (value === undefined || value.trim() === '') return fallback;
  return /^\d+$/.test(value.trim()) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
    ? Number(value)
    : null;
}
export const cesiumProvider: CesiumProvider = {
  token: import.meta.env.VITE_CESIUM_ION_TOKEN?.trim(),
  googleKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim(),
  // Opt-in ion alternative. Direct Google key is preferred when configured.
  photorealisticAssetId: assetId(
    import.meta.env.VITE_CESIUM_PHOTOREALISTIC_ASSET_ID,
    0,
  ),
  imageryAssetId: assetId(import.meta.env.VITE_CESIUM_IMAGERY_ASSET_ID, 2),
  terrainAssetId: assetId(import.meta.env.VITE_CESIUM_TERRAIN_ASSET_ID, 1),
  buildingsAssetId: assetId(
    import.meta.env.VITE_CESIUM_BUILDINGS_ASSET_ID,
    96188,
  ),
};
