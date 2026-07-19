import type { Map as MapboxMap } from 'mapbox-gl'
import type { MapBasemap } from '../store/uiSlice'

export const MAP_STYLE_BY_BASEMAP: Record<MapBasemap, string> = {
  minimal: 'mapbox://styles/mapbox/dark-v11',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
}

/**
 * Refine satellite-streets for tactical topo readability:
 * brighter imagery, clearer water/roads, label halos that survive photo basemap.
 */
export function polishTopoBasemap(map: MapboxMap) {
  if (!map.isStyleLoaded()) return

  for (const layer of map.getStyle()?.layers ?? []) {
    try {
      if (layer.type === 'raster') {
        map.setPaintProperty(layer.id, 'raster-saturation', 0.25)
        map.setPaintProperty(layer.id, 'raster-contrast', 0.18)
        map.setPaintProperty(layer.id, 'raster-brightness-min', 0.08)
        map.setPaintProperty(layer.id, 'raster-brightness-max', 0.92)
        map.setPaintProperty(layer.id, 'raster-opacity', 1)
        continue
      }

      if (layer.type === 'fill' && layer.id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#2a7ab0')
        map.setPaintProperty(layer.id, 'fill-opacity', 0.55)
        continue
      }

      if (layer.type === 'line' && (layer.id.includes('waterway') || layer.id.includes('water'))) {
        map.setPaintProperty(layer.id, 'line-color', '#3d9fd0')
        map.setPaintProperty(layer.id, 'line-opacity', 0.85)
        continue
      }

      if (
        layer.type === 'line' &&
        (layer.id.includes('road') || layer.id.includes('bridge') || layer.id.includes('tunnel'))
      ) {
        const isCasing = layer.id.includes('case') || layer.id.includes('casing')
        map.setPaintProperty(layer.id, 'line-opacity', isCasing ? 0.35 : 0.75)
        continue
      }

      if (layer.type === 'symbol') {
        map.setPaintProperty(layer.id, 'text-halo-width', 1.6)
        map.setPaintProperty(layer.id, 'text-halo-color', 'rgba(10, 14, 12, 0.85)')
        map.setPaintProperty(layer.id, 'text-color', '#f4f7f2')
        try {
          map.setPaintProperty(layer.id, 'icon-halo-width', 1.2)
          map.setPaintProperty(layer.id, 'icon-halo-color', 'rgba(10, 14, 12, 0.8)')
        } catch {
          /* not all symbol layers have icons */
        }
      }
    } catch {
      /* style-dependent paint props */
    }
  }
}

/** Dark tactical minimalist ground — decluttered vector basemap. */
export function polishMinimalBasemap(map: MapboxMap) {
  if (!map.isStyleLoaded()) return

  for (const layer of map.getStyle()?.layers ?? []) {
    try {
      if (layer.type === 'background') {
        map.setPaintProperty(layer.id, 'background-color', '#0b0e14')
        continue
      }
      if (layer.type === 'fill' && layer.id.includes('water')) {
        map.setPaintProperty(layer.id, 'fill-color', '#121820')
        continue
      }
      if (
        layer.type === 'fill' &&
        (layer.id.includes('park') ||
          layer.id.includes('landcover') ||
          layer.id.includes('national-park'))
      ) {
        map.setPaintProperty(layer.id, 'fill-color', '#12161c')
        continue
      }
      if (
        layer.type === 'fill' &&
        (layer.id.includes('land') || layer.id.includes('landuse'))
      ) {
        map.setPaintProperty(layer.id, 'fill-color', '#141820')
        continue
      }
      if (
        layer.type === 'line' &&
        (layer.id.includes('road') || layer.id.includes('bridge') || layer.id.includes('tunnel'))
      ) {
        const isCasing = layer.id.includes('case') || layer.id.includes('casing')
        map.setPaintProperty(layer.id, 'line-opacity', isCasing ? 0.25 : 0.45)
        continue
      }
      if (layer.type === 'symbol') {
        map.setPaintProperty(layer.id, 'text-opacity', 0.7)
        map.setPaintProperty(layer.id, 'text-halo-width', 1.2)
      }
    } catch {
      /* style-dependent */
    }
  }
}

export function polishBasemap(map: MapboxMap, basemap: MapBasemap) {
  if (basemap === 'satellite') polishTopoBasemap(map)
  else polishMinimalBasemap(map)
}

/** Layer id to insert hillshade above (right after satellite raster). */
export function layerAfterSatellite(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers
  if (!layers) return undefined
  let lastRaster: string | undefined
  for (const layer of layers) {
    if (layer.type === 'raster') lastRaster = layer.id
  }
  if (!lastRaster) return undefined
  const idx = layers.findIndex((l) => l.id === lastRaster)
  return layers[idx + 1]?.id
}
