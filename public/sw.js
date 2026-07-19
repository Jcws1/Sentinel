/**
 * Sentinel offline tile service worker.
 * Cache-first for /offline/tiles/; network-with-cache for Mapbox CDN tiles.
 */
const DB_NAME = 'sentinel-offline-tiles'
const STORE = 'tiles'

const TILE_URL_PATTERNS = [
  /\/offline\/tiles\//,
  /\/offline\/styles\//,
  /\/api\/offline\/pmtiles\//,
  /api\.mapbox\.com\/v4\//,
  /api\.mapbox\.com\/raster\/v1\//,
  /api\.mapbox\.com\/styles\/v1\//,
]

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('sentinel-offline-static-v1').then((cache) =>
      cache.addAll([
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
  event.respondWith(handleTileFetch(event.request))
})
