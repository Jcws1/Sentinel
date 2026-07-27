/**
 * Sentinel offline tile service worker.
 * Cache-first for local edge-map assets and prepared offline tiles.
 */
const DB_NAME = 'sentinel-offline-tiles'
const STORE = 'tiles'

const TILE_URL_PATTERNS = [
  /\/edge-map\//,
  /\/offline\/tiles\//,
  /\/offline\/styles\//,
  /\/api\/offline\/pmtiles\//,
  /api\.mapbox\.com\/v4\//,
  /api\.mapbox\.com\/raster\/v1\//,
  /api\.mapbox\.com\/styles\/v1\//,
]

const EDGE_CACHE = 'sentinel-edge-map-v2'

function isTileRequest(url) {
  return TILE_URL_PATTERNS.some((p) => p.test(url))
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'url' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getFromDb(url) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(url)
        req.onsuccess = () => resolve(req.result ?? null)
        req.onerror = () => reject(req.error)
      }),
  )
}

function putToDb(url, data, contentType) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put({
          url,
          data,
          contentType,
          cachedAt: Date.now(),
        })
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

async function handleTileFetch(request) {
  const url = request.url
  const cached = await getFromDb(url)
  if (cached) {
    return new Response(cached.data, {
      headers: { 'Content-Type': cached.contentType || 'application/octet-stream' },
    })
  }

  try {
    const response = await fetch(request)
    if (response.ok) {
      const clone = response.clone()
      const data = await clone.arrayBuffer()
      const contentType =
        response.headers.get('content-type') || 'application/octet-stream'
      await putToDb(url, data, contentType)
    }
    return response
  } catch {
    if (cached) {
      return new Response(cached.data, {
        headers: { 'Content-Type': cached.contentType || 'application/octet-stream' },
      })
    }
    return new Response('Offline — tile not cached', {
      status: 503,
      statusText: 'Offline tile missing',
    })
  }
}

async function handleEdgeMapFetch(request) {
  const range = request.headers.get('range')
  // PMTiles uses HTTP range requests, which return 206 responses. Cache.put()
  // rejects partial responses, so let the browser fetch them from the local C2
  // server without passing them through Cache Storage.
  if (range) return fetch(request)

  const cache = await caches.open(EDGE_CACHE)
  const cacheKey = request
  const cached = await cache.match(cacheKey)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok || response.status === 206) {
      await cache.put(cacheKey, response.clone())
    }
    return response
  } catch {
    return new Response('Edge map asset not cached', {
      status: 503,
      statusText: 'Offline map asset missing',
    })
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(EDGE_CACHE).then((cache) =>
      cache.addAll([
        '/edge-map/style.json',
        '/offline/styles/sentinel-ops.json',
        '/offline/styles/sentinel-satellite.json',
      ]),
    ),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const url = event.request.url
  if (!isTileRequest(url)) return
  event.respondWith(
    url.includes('/edge-map/')
      ? handleEdgeMapFetch(event.request)
      : handleTileFetch(event.request),
  )
})
