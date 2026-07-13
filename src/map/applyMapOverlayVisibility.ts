import type { Map as MapboxMap } from 'mapbox-gl'
import type { OverlayVisibility } from '../streamlined/overlayDefaults'
import {
  LOS_LAYER,
  MASK_LAYER,
} from '../terrain/sgTerrainConfig'

function setLayerVisibility(map: MapboxMap, layerIds: string[], visible: boolean) {
  const vis = visible ? 'visible' : 'none'
  for (const id of layerIds) {
    if (!map.getLayer(id)) continue
    try {
      map.setLayoutProperty(id, 'visibility', vis)
    } catch {
      /* layer may be mid-style swap */
    }
  }
}

export interface ApplyOverlayOptions {
  /** When false (2D flat view), building extrusions stay hidden. */
  volume3d?: boolean
}

/** Sync Redux overlay toggles to Mapbox operator + policy layers. */
export function applyMapOverlayVisibility(
  map: MapboxMap,
  overlays: OverlayVisibility,
  options: ApplyOverlayOptions = {},
) {
  if (!map.isStyleLoaded()) return

  setLayerVisibility(
    map,
    [
      'threat-points',
      'threat-labels',
      'threat-hit',
      'threat-uncertainty',
      'trails-threat',
    ],
    overlays.threats,
  )

  setLayerVisibility(
    map,
    [
      'drone-points',
      'drone-labels',
      'uncertainty-halos',
      'trails-friendly',
      'asset-ring',
      'asset-core',
      'routes-preview',
    ],
    overlays.friendly,
  )

  setLayerVisibility(map, ['mesh-links'], overlays.mesh)

  setLayerVisibility(
    map,
    ['policy-zones-fill', 'policy-zones-outline', MASK_LAYER, LOS_LAYER],
    overlays.masking,
  )

  const showBuildings = overlays.buildings && options.volume3d !== false
  setLayerVisibility(map, ['3d-buildings', '3d-building-edges'], showBuildings)
}
