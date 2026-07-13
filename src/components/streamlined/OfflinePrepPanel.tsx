import { useEffect, useState } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import {
  getOfflinePrepStatus,
  prepareOfflineMaps,
  subscribeOfflinePrep,
  type OfflinePrepStatus,
} from '../../offline/offlinePrep'

export interface OfflinePrepPanelProps {
  map: MapboxMap | null
  onClose: () => void
}

export function OfflinePrepPanel({ map, onClose }: OfflinePrepPanelProps) {
  const [status, setStatus] = useState<OfflinePrepStatus | null>(null)

  useEffect(() => {
    void getOfflinePrepStatus().then(setStatus)
    return subscribeOfflinePrep(setStatus)
  }, [])

  const pct =
    status?.progress && status.progress.total > 0
      ? Math.round((status.progress.done / status.progress.total) * 100)
      : 0

  return (
    <div className="v4-offline-prep" role="dialog" aria-label="Offline map preparation" data-operator-ui>
      <button type="button" className="v4-offline-prep__backdrop" aria-label="Close" onClick={onClose} />
      <div className="v4-offline-prep__card">
        <h3 className="v4-offline-prep__title">Offline Map Cache</h3>
        <p className="v4-offline-prep__desc">
          Caches Singapore AO tiles (50×50 km) into IndexedDB for disconnected ops.
        </p>
        <dl className="v4-offline-prep__stats mono">
          <div>
            <dt>Cached tiles</dt>
            <dd>{status?.tileCount ?? '—'}</dd>
          </div>
          <div>
            <dt>Est. local set</dt>
            <dd>{status?.estimatedTiles ?? '—'}</dd>
          </div>
        </dl>
        {status?.progress && status.preparing && (
          <div className="v4-offline-prep__progress">
            <div className="v4-offline-prep__bar" style={{ width: `${pct}%` }} />
            <span className="mono">{status.progress.message}</span>
          </div>
        )}
        {status?.lastResult && !status.preparing && (
          <p className="v4-offline-prep__result mono">
            +{status.lastResult.fetched} new · {status.lastResult.skipped} cached ·{' '}
            {status.lastResult.failed} missing
          </p>
        )}
        <div className="v4-offline-prep__actions">
          <button
            type="button"
            className="v4-btn"
            disabled={status?.preparing}
            onClick={() => void prepareOfflineMaps(map)}
          >
            {status?.preparing ? 'PREPARING…' : 'PREPARE OFFLINE MAPS'}
          </button>
          <button type="button" className="v4-btn v4-btn--ghost" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  )
}
