import fs from 'node:fs/promises'
import path from 'node:path'
import type { Express, Request, Response } from 'express'
import { PMTiles, type Source } from 'pmtiles'

const TILES_DIR = path.join(process.cwd(), 'public', 'offline', 'tiles')
const archives = new Map<string, PMTiles>()

class NodeFileSource implements Source {
  constructor(private filePath: string) {}

  getKey(): string {
    return this.filePath
  }

  async getBytes(offset: number, length: number) {
    const fh = await fs.open(this.filePath, 'r')
    try {
      const buf = Buffer.alloc(length)
      const { bytesRead } = await fh.read(buf, 0, length, offset)
      const slice = buf.subarray(0, bytesRead)
      return {
        data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength),
      }
    } finally {
      await fh.close()
    }
  }
}

function getArchive(name: string): PMTiles | null {
  if (archives.has(name)) return archives.get(name)!
  const filePath = path.join(TILES_DIR, `${name}.pmtiles`)
  try {
    const archive = new PMTiles(new NodeFileSource(filePath))
    archives.set(name, archive)
    return archive
  } catch {
    return null
  }
}

async function servePmtilesTile(
  req: Request,
  res: Response,
  ext: 'pbf' | 'png',
) {
  const archiveName = req.params.archive
  const z = Number.parseInt(req.params.z, 10)
  const x = Number.parseInt(req.params.x, 10)
  const y = Number.parseInt(req.params.y, 10)

  if (!archiveName || Number.isNaN(z) || Number.isNaN(x) || Number.isNaN(y)) {
    res.status(400).json({ error: 'Invalid tile coordinates' })
    return
  }

  const filePath = path.join(TILES_DIR, `${archiveName}.pmtiles`)
  try {
    await fs.access(filePath)
  } catch {
    res.status(404).json({ error: `PMTiles archive not found: ${archiveName}.pmtiles` })
    return
  }

  const archive = getArchive(archiveName)
  if (!archive) {
    res.status(500).json({ error: 'Failed to open PMTiles archive' })
    return
  }

  try {
    const tile = await archive.getZxy(z, x, y)
    if (!tile?.data) {
      res.status(204).end()
      return
    }
    res.setHeader(
      'Content-Type',
      ext === 'png' ? 'image/png' : 'application/x-protobuf',
    )
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(tile.data))
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'PMTiles read failed',
    })
  }
}

/** Expose PMTiles archives as Mapbox-compatible XYZ endpoints. */
export function registerPmtilesRoutes(app: Express): void {
  app.get('/api/offline/pmtiles/:archive/:z/:x/:y.pbf', (req, res) => {
    void servePmtilesTile(req, res, 'pbf')
  })
  app.get('/api/offline/pmtiles/:archive/:z/:x/:y.png', (req, res) => {
    void servePmtilesTile(req, res, 'png')
  })
}
