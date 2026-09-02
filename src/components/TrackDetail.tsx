import { useEffect, useState } from 'react'
import { c2Client } from '../api/sync'
import type { FusionTrackDetailDto } from '../api/types'
import { useAppSelector } from '../store'

export function TrackDetail() {
  const selectedTrackId = useAppSelector((s) => s.threats.selectedTrackId)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const [detail, setDetail] = useState<FusionTrackDetailDto | null>(null)
  const [loading, setLoading] = useState(false)

  const track = tracks.find((t) => t.id === selectedTrackId)

  useEffect(() => {
    if (!selectedTrackId) {
      setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true)
    void c2Client
      .getTrackDetail(selectedTrackId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedTrackId])

  if (!track) return null

  return (
    <section className="track-detail" aria-label="Track intelligence">
      <header className="track-detail__header">
        <p className="panel__eyebrow">Fusion</p>
        <h3 className="track-detail__title mono">{track.id}</h3>
      </header>

      <dl className="track-detail__kv mono">
        <div>
          <dt>Class</dt>
          <dd>{track.threatClass}</dd>
        </div>
        <div>
          <dt>Conf</dt>
          <dd>{track.sourceConfidenceAvailable === false ? 'N/A' : `${track.fusionConfidence}%`}</dd>
        </div>
        <div>
          <dt>ETA</dt>
          <dd>{track.etaAvailable === false ? 'N/A' : `${track.etaToAsset}s`}</dd>
        </div>
        <div>
          <dt>Action</dt>
          <dd>{track.recommendedAction}</dd>
        </div>
      </dl>

      {loading && <p className="track-detail__loading">Loading provenance…</p>}

      {detail && (
        <>
          <p className="track-detail__algo mono">{detail.algorithm}</p>
          <ul className="provenance-list">
            {detail.provenance.map((p) => (
              <li key={p.sensorId} className="provenance-list__item">
                <span className="provenance-list__sensor mono">{p.sensorId}</span>
                <span className="provenance-list__type">{p.sensorType}</span>
                <span className="provenance-list__conf mono">{p.confidence}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
