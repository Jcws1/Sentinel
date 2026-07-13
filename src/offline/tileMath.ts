export interface TileBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface TileCoord {
  z: number
  x: number
  y: number
}

/** Web mercator tile X from longitude. */
export function lngToTileX(lng: number, zoom: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** zoom)
}

/** Web mercator tile Y from latitude. */
export function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom,
  )
}

/** All XYZ tiles covering bounds at a zoom level. */
export function tilesForBounds(
  bounds: TileBounds,
  zoom: number,
): TileCoord[] {
  const xMin = lngToTileX(bounds.west, zoom)
  const xMax = lngToTileX(bounds.east, zoom)
  const yMin = latToTileY(bounds.north, zoom)
  const yMax = latToTileY(bounds.south, zoom)
  const out: TileCoord[] = []
  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      out.push({ z: zoom, x, y })
    }
  }
  return out
}

export function expandTileUrl(template: string, tile: TileCoord): string {
  return template
    .replace('{z}', String(tile.z))
    .replace('{x}', String(tile.x))
    .replace('{y}', String(tile.y))
}

export function estimateTileCount(
  bounds: TileBounds,
  minZoom: number,
  maxZoom: number,
): number {
  let total = 0
  for (let z = minZoom; z <= maxZoom; z++) {
    total += tilesForBounds(bounds, z).length
  }
  return total
}
