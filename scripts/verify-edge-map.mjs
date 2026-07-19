import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(process.env.EDGE_MAP_ROOT ?? 'edge-map')
const failures = []

async function json(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'))
  } catch (error) {
    failures.push(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

const manifest = await json('manifest.json')
const style = await json(manifest?.style ?? 'style.json')

if (manifest) {
  if (manifest.schemaVersion !== 1) failures.push('manifest.json: unsupported schemaVersion')
  if (!manifest.id) failures.push('manifest.json: id is required')
  if (!Array.isArray(manifest.coverage?.bounds) || manifest.coverage.bounds.length !== 4) {
    failures.push('manifest.json: coverage.bounds must contain west, south, east, north')
  }
}

if (style) {
  if (style.version !== 8) failures.push('style.json: MapLibre style version must be 8')
  for (const [id, source] of Object.entries(style.sources ?? {})) {
    if (typeof source !== 'object' || source === null) continue
    if (source.type === 'geojson' && typeof source.data === 'string' && source.data.startsWith('/edge-map/')) {
      const relativePath = source.data.slice('/edge-map/'.length)
      try {
        await access(path.join(root, relativePath))
      } catch {
        failures.push(`style.json: source ${id} is missing ${relativePath}`)
      }
    }
    if (source.type === 'vector' && typeof source.url === 'string' && source.url.startsWith('pmtiles:///edge-map/')) {
      const relativePath = source.url.slice('pmtiles:///edge-map/'.length)
      try {
        await access(path.join(root, relativePath))
      } catch {
        failures.push(`style.json: source ${id} is missing ${relativePath}`)
      }
    }
    if (source.type === 'raster-dem' && Array.isArray(source.tiles)) {
      for (const tile of source.tiles) {
        if (typeof tile !== 'string' || !tile.startsWith('/edge-map/')) continue
        const directory = tile.slice('/edge-map/'.length).split('/{z}')[0]
        try {
          await access(path.join(root, directory))
        } catch {
          failures.push(`style.json: source ${id} is missing ${directory}`)
        }
      }
    }
    const serialized = JSON.stringify(source)
    if (/https?:\/\//i.test(serialized)) failures.push(`style.json: source ${id} reaches the internet`)
    if (/mapbox:\/\//i.test(serialized)) failures.push(`style.json: source ${id} uses Mapbox`)
  }
  const serializedStyle = JSON.stringify(style)
  if (/https?:\/\//i.test(serializedStyle)) failures.push('style.json: external HTTP resource found')
  if (/mapbox:\/\//i.test(serializedStyle)) failures.push('style.json: Mapbox resource found')

  if (typeof style.glyphs === 'string' && style.glyphs.startsWith('/edge-map/')) {
    const directory = style.glyphs.slice('/edge-map/'.length).split('/{fontstack}')[0]
    try {
      await access(path.join(root, directory))
    } catch {
      failures.push(`style.json: glyph directory is missing ${directory}`)
    }
  }
  if (typeof style.sprite === 'string' && style.sprite.startsWith('/edge-map/')) {
    const base = style.sprite.slice('/edge-map/'.length)
    for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) {
      try {
        await access(path.join(root, `${base}${suffix}`))
      } catch {
        failures.push(`style.json: sprite is missing ${base}${suffix}`)
      }
    }
  }
}

if (failures.length) {
  console.error(`Edge map pack verification failed:\n- ${failures.join('\n- ')}`)
  process.exitCode = 1
} else {
  console.log(`Edge map pack verified: ${manifest.id} (${manifest.coverage.name})`)
}
