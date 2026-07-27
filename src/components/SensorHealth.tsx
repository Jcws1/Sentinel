import { useEffect, useState } from 'react'
import {
  SENSOR_SOURCES,
  type SensorSource,
  type SensorState,
} from '../data/sensorCatalog'

interface CdsePollState {
  status: 'idle' | 'polling' | 'healthy' | 'error'
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  itemCount: number
}

interface CdsePollHistoryPoint {
  id: number
  attemptedAt: string
  completedAt: string
  status: 'healthy' | 'error'
  durationMs: number
  itemCount: number | null
  error: string | null
}

interface CdseHistoryResponse {
  window: '30d'
  points: CdsePollHistoryPoint[]
  summary: {
    total: number
    successful: number
    failed: number
    successRate: number | null
    averageDurationMs: number | null
  }
}

const tone: Record<SensorState, string> = {
  healthy: '#4c8bf5',
  degraded: '#c4921a',
  offline: '#c44b4b',
}

function relativeTime(value: string): string {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1000))
  if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`
  const minutes = Math.floor(elapsedSeconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

function pollTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function Sparkline({ samples, health }: Pick<SensorSource, 'samples' | 'health'>) {
  const width = 150
  const height = 40
  const points = samples
    .map((value, index) => `${(index / (samples.length - 1)) * width},${height - (value / 100) * height}`)
    .join(' ')

  return (
    <svg className="sensor-sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Recent feed activity">
      <line x1="0" y1="20" x2={width} y2="20" className="sensor-sparkline__grid" />
      <polyline points={points} fill="none" stroke={tone[health]} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={width} cy={height - (samples.at(-1)! / 100) * height} r="2.5" fill={tone[health]} />
    </svg>
  )
}

function CdsePollGraph({ points }: { points: CdsePollHistoryPoint[] }) {
  const width = 150
  const height = 40
  if (!points.length) {
    return (
      <svg className="sensor-sparkline cdse-poll-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="No CDSE polling history yet">
        <line x1="0" y1="20" x2={width} y2="20" className="sensor-sparkline__grid" />
        <text x={width / 2} y="23" textAnchor="middle" className="cdse-poll-graph__empty">NO HISTORY</text>
      </svg>
    )
  }

  const timestamps = points.map((point) => Date.parse(point.attemptedAt))
  const firstTimestamp = Math.min(...timestamps)
  const lastTimestamp = Math.max(...timestamps)
  const timeSpan = Math.max(1, lastTimestamp - firstTimestamp)
  const maxDuration = Math.max(1_000, ...points.map((point) => point.durationMs))
  const xFor = (timestamp: number) => points.length === 1
    ? width / 2
    : ((timestamp - firstTimestamp) / timeSpan) * width
  const yFor = (durationMs: number) => height - 5 - Math.min(1, durationMs / maxDuration) * 28
  let healthyPath = ''
  let previousHealthyIndex: number | null = null

  points.forEach((point, index) => {
    if (point.status !== 'healthy') {
      previousHealthyIndex = null
      return
    }
    const previousIndex = previousHealthyIndex
    const previousPoint = previousIndex === null ? null : points[previousIndex]
    const gapMs = previousPoint && previousIndex !== null ? timestamps[index] - timestamps[previousIndex] : 0
    const command = previousPoint && gapMs <= 105 * 60 * 1000 ? 'L' : 'M'
    healthyPath += `${command}${xFor(timestamps[index]).toFixed(2)},${yFor(point.durationMs).toFixed(2)} `
    previousHealthyIndex = index
  })

  return (
    <svg className="sensor-sparkline cdse-poll-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`CDSE polling history: ${points.length} attempts over 30 days`}>
      <line x1="0" y1="20" x2={width} y2="20" className="sensor-sparkline__grid" />
      <path d={healthyPath} className="cdse-poll-graph__healthy-line" vectorEffect="non-scaling-stroke" />
      {points.map((point, index) => {
        const x = xFor(timestamps[index])
        const y = point.status === 'healthy' ? yFor(point.durationMs) : height - 5
        const title = `${pollTimestamp(point.attemptedAt)} / ${point.status} / ${point.durationMs}ms${point.itemCount === null ? '' : ` / ${point.itemCount} tiles`}${point.error ? ` / ${point.error}` : ''}`
        return (
          <circle key={point.id} cx={x} cy={y} r={point.status === 'healthy' ? 2.1 : 2.8} className={`cdse-poll-graph__point cdse-poll-graph__point--${point.status}`}>
            <title>{title}</title>
          </circle>
        )
      })}
    </svg>
  )
}

export function SensorHealth() {
  const [cdsePoll, setCdsePoll] = useState<CdsePollState | null>(null)
  const [cdseHistory, setCdseHistory] = useState<CdseHistoryResponse | null>(null)

  useEffect(() => {
    let active = true
    const refresh = () => {
      void fetch('/api/v1/sensors/cdse')
        .then(async (response) => {
          if (!response.ok) throw new Error(`Status endpoint returned HTTP ${response.status}`)
          const state = (await response.json()) as CdsePollState
          if (active) setCdsePoll(state)
        })
      void fetch('/api/v1/sensors/cdse/history?window=30d')
        .then(async (response) => {
          if (!response.ok) throw new Error(`History endpoint returned HTTP ${response.status}`)
          const history = (await response.json()) as CdseHistoryResponse
          if (active) setCdseHistory(history)
        })
        .catch(() => {
          if (active) setCdseHistory(null)
        })
        .catch((error: unknown) => {
          if (!active) return
          setCdsePoll({
            status: 'error',
            lastAttemptAt: new Date().toISOString(),
            lastSuccessAt: null,
            lastError: error instanceof Error ? error.message : 'CDSE status unavailable',
            itemCount: 0,
          })
        })
    }
    refresh()
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  const sources = SENSOR_SOURCES.map((source): SensorSource => {
    if (source.id !== 'CDSE-API') return source
    const latestHistory = cdseHistory?.points.at(-1)
    const attemptedAt = cdsePoll?.lastAttemptAt ?? latestHistory?.attemptedAt ?? null
    const lastError = cdsePoll?.lastError ?? (latestHistory?.status === 'error' ? latestHistory.error : null)
    const hasError = Boolean(lastError)
    const successRate = cdseHistory?.summary.successRate
    const historyHealth = latestHistory?.status === 'healthy' ? 'healthy' : 'degraded'
    return {
      ...source,
      health: hasError ? 'degraded' : cdsePoll?.lastSuccessAt ? 'healthy' : historyHealth,
      lastPing: attemptedAt ? pollTimestamp(attemptedAt) : 'Waiting for first poll',
      cadence: attemptedAt ? `${relativeTime(attemptedAt)} / hourly` : 'Hourly',
      uptime: successRate === null || successRate === undefined ? '--' : `${(successRate * 100).toFixed(1)}%`,
      integration: cdsePoll?.status === 'polling'
        ? 'Polling...'
        : cdseHistory?.summary.total
          ? `${cdseHistory.summary.total} polls / 30d`
          : 'CDSE STAC',
      lastPollError: lastError,
      cdseHistory: cdseHistory?.points ?? [],
    }
  })

  const healthy = sources.filter((source) => source.health === 'healthy').length
  const degraded = sources.filter((source) => source.health === 'degraded').length
  const offline = sources.filter((source) => source.health === 'offline').length

  return (
    <main className="sensor-health">
      <div className="sensor-health__masthead">
        <div>
          <p className="panel__eyebrow">Ingestion observability</p>
          <h1>Sensor health</h1>
          <p className="sensor-health__subtitle">Feed availability, freshness and recent throughput across platform inputs.</p>
        </div>
        <div className="sensor-health__summary" aria-label="Sensor health summary">
          <div><strong className="tone-ok mono">{healthy}</strong><span>Healthy</span></div>
          <div><strong className="tone-warn mono">{degraded}</strong><span>Degraded</span></div>
          <div><strong className="tone-crit mono">{offline}</strong><span>Offline</span></div>
          <div><strong className="mono">{sources.length}</strong><span>Sources</span></div>
        </div>
      </div>

      <section className="sensor-health__table" aria-label="Sensor ingestion health">
        <div className="sensor-health__table-head" aria-hidden="true">
          <span>Source</span><span>Signal / data product</span><span>Status</span><span>Activity / history</span><span>Last data</span><span>Delivery</span>
        </div>
        {sources.map((source) => (
          <article className="sensor-row" key={source.id}>
            <div className="sensor-row__identity">
              <span className={`sensor-row__icon sensor-row__icon--${source.health}`} aria-hidden="true" />
              <div><h2>{source.name}</h2><span className="mono">{source.id} / {source.kind}</span></div>
            </div>
            <div className="sensor-row__feed">
              <p>{source.feed}</p>
              {source.lastPollError && (
                <span className="sensor-row__error" title={source.lastPollError}>
                  Last poll: {source.lastPollError}
                </span>
              )}
            </div>
            <div className={`sensor-state sensor-state--${source.health}`}><span aria-hidden="true" />{source.health}</div>
            {source.id === 'CDSE-API'
              ? <CdsePollGraph points={source.cdseHistory ?? []} />
              : <Sparkline samples={source.samples} health={source.health} />}
            <div className="sensor-row__ping"><strong className="mono">{source.lastPing}</strong><span>{source.cadence}</span></div>
            <div className="sensor-row__delivery"><strong className="mono">{source.uptime}</strong><span>{source.integration}</span></div>
          </article>
        ))}
      </section>
      <footer className="sensor-health__footer"><span><i className="sensor-health__live-dot" /> Live monitoring</span><span className="mono">CDSE history 30d / refreshed just now</span></footer>
    </main>
  )
}
