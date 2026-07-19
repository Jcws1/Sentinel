import type { CdsePollRecord } from './healthDatabase'

export interface CdsePollState {
  status: 'idle' | 'polling' | 'healthy' | 'error'
  collection: string
  coverageBbox: [number, number, number, number]
  intervalMs: number
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastDurationMs: number | null
  nextPollAt: string | null
  itemCount: number
  itemIds: string[]
}

interface StacFeatureCollection {
  type?: string
  features?: Array<{ id?: string }>
}

const DEFAULT_COLLECTION = 'cop-dem-glo-30-dged-cog'
const DEFAULT_BBOX: [number, number, number, number] = [103.45, 1.1, 104.25, 1.65]
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000

function configuredBbox(): [number, number, number, number] {
  const values = (process.env.CDSE_COVERAGE_BBOX ?? '')
    .split(',')
    .map((value) => Number(value.trim()))
  if (values.length === 4 && values.every(Number.isFinite)) {
    return values as [number, number, number, number]
  }
  return DEFAULT_BBOX
}

function configuredInterval(): number {
  const value = Number(process.env.CDSE_POLL_INTERVAL_MS)
  return Number.isFinite(value) && value >= 60_000 ? value : DEFAULT_INTERVAL_MS
}

interface CdsePollerOptions {
  onPollCompleted?: (record: CdsePollRecord) => void
}

export function createCdsePoller(options: CdsePollerOptions = {}) {
  const collection = process.env.CDSE_DEM_COLLECTION ?? DEFAULT_COLLECTION
  const coverageBbox = configuredBbox()
  const intervalMs = configuredInterval()
  const baseUrl = (process.env.CDSE_STAC_URL ?? 'https://stac.dataspace.copernicus.eu/v1')
    .replace(/\/$/, '')
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  let inFlight: Promise<void> | null = null
  const state: CdsePollState = {
    status: 'idle',
    collection,
    coverageBbox,
    intervalMs,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastDurationMs: null,
    nextPollAt: null,
    itemCount: 0,
    itemIds: [],
  }

  const schedule = () => {
    if (stopped) return
    const nextAt = Date.now() + intervalMs
    state.nextPollAt = new Date(nextAt).toISOString()
    timer = setTimeout(() => void poll(), intervalMs)
  }

  const poll = async () => {
    if (inFlight) return inFlight
    inFlight = (async () => {
      const startedAt = Date.now()
      state.status = 'polling'
      state.lastAttemptAt = new Date(startedAt).toISOString()
      state.nextPollAt = null
      const url = new URL(`${baseUrl}/search`)
      url.searchParams.set('collections', collection)
      url.searchParams.set('bbox', coverageBbox.join(','))
      url.searchParams.set('limit', '100')

      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/geo+json, application/json' },
          signal: AbortSignal.timeout(30_000),
        })
        if (!response.ok) throw new Error(`CDSE STAC returned HTTP ${response.status}`)
        const body = (await response.json()) as StacFeatureCollection
        if (body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
          throw new Error('CDSE STAC returned an invalid feature collection')
        }
        state.status = 'healthy'
        state.lastSuccessAt = new Date().toISOString()
        state.lastError = null
        state.itemCount = body.features.length
        state.itemIds = body.features
          .map((feature) => feature.id)
          .filter((id): id is string => Boolean(id))
          .slice(0, 20)
      } catch (error) {
        state.status = 'error'
        state.lastError = error instanceof Error ? error.message : 'CDSE poll failed'
      } finally {
        const completedAt = new Date()
        state.lastDurationMs = completedAt.getTime() - startedAt
        try {
          options.onPollCompleted?.({
            attemptedAt: state.lastAttemptAt!,
            completedAt: completedAt.toISOString(),
            status: state.status === 'healthy' ? 'healthy' : 'error',
            durationMs: state.lastDurationMs,
            itemCount: state.status === 'healthy' ? state.itemCount : null,
            error: state.lastError,
            collection,
            coverageBbox,
          })
        } catch (error) {
          console.error('Failed to persist CDSE poll history', error)
        }
        inFlight = null
        schedule()
      }
    })()
    return inFlight
  }

  return {
    start() {
      stopped = false
      void poll()
    },
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = null
      state.nextPollAt = null
    },
    poll,
    snapshot(): CdsePollState {
      return { ...state, itemIds: [...state.itemIds] }
    },
  }
}
