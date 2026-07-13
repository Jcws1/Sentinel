const DB_NAME = 'sentinel-offline-tiles'
const DB_VERSION = 1
const STORE = 'tiles'

export interface CachedTile {
  url: string
  data: ArrayBuffer
  contentType: string
  cachedAt: number
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'url' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
  })
  return dbPromise
}

export async function putTile(
  url: string,
  data: ArrayBuffer,
  contentType: string,
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({
      url,
      data,
      contentType,
      cachedAt: Date.now(),
    } satisfies CachedTile)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('putTile failed'))
  })
}

export async function getTile(url: string): Promise<CachedTile | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(url)
    req.onsuccess = () => resolve((req.result as CachedTile | undefined) ?? null)
    req.onerror = () => reject(req.error ?? new Error('getTile failed'))
  })
}

export async function hasTile(url: string): Promise<boolean> {
  const cached = await getTile(url)
  return cached !== null
}

export async function countTiles(): Promise<number> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('countTiles failed'))
  })
}

export async function clearTileCache(): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('clearTileCache failed'))
  })
}

export { DB_NAME, STORE }
