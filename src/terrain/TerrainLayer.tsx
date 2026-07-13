import { useEffect, useRef } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { MapBasemap } from '../store/uiSlice'
import {
  applyTerrainBase,
  clearTerrainBase,
  setEnvLayerVisibility,
  setTerrainExaggeration,
} from './applyTerrain'
import {
  DEFAULT_TERRAIN_CONFIG,
  type EnvLayerState,
  type TerrainConfig,
} from './sgTerrainConfig'

export interface TerrainLayerProps {
  map: MapboxMap | null
  mapReady: boolean
  /** Bumps when Mapbox style reloads so DEM/overlays rebind. */
  styleEpoch: number
  basemap: MapBasemap
  /** When false, DEM mesh is nearly flat but elevation queries still work. */
  volume3d: boolean
  config?: TerrainConfig
  envLayers: EnvLayerState[]
}

/**
 * Imperative terrain / DEM / hillshade / contour sync for Mapbox.
 * Renders nothing — side-effects only.
 */
export function TerrainLayer({
  map,
  mapReady,
  styleEpoch,
  basemap,
  volume3d,
  config = DEFAULT_TERRAIN_CONFIG,
  envLayers,
}: TerrainLayerProps) {
  const appliedRef = useRef(false)

  useEffect(() => {
    if (!map || !mapReady || !map.isStyleLoaded()) return

    applyTerrainBase(
      map,
      {
        ...config,
        hillshade: envLayers.find((l) => l.id === 'hillshade')?.visible ?? config.hillshade,
        contours: {
          ...config.contours,
          enabled: envLayers.find((l) => l.id === 'contours')?.visible ?? config.contours.enabled,
        },
      },
      basemap,
    )

    // Keep DEM active in 2D (near-zero exaggeration) so LOS / elevation queries work.
    setTerrainExaggeration(map, volume3d ? config.exaggeration : 0.02)

    setEnvLayerVisibility(map, envLayers)

    // Buildings extrusions only in 3D volume mode.
    if (!volume3d) {
      for (const id of ['3d-buildings', '3d-building-edges']) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none')
        }
      }
    }

    appliedRef.current = true
  }, [map, mapReady, styleEpoch, basemap, volume3d, config, envLayers])

  useEffect(() => {
    return () => {
      if (map && appliedRef.current && map.getStyle()) {
        try {
          clearTerrainBase(map)
        } catch {
          /* map may already be removed */
        }
      }
    }
  }, [map])

  return null
}
