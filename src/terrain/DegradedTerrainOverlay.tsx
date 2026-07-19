import { useEffect, useMemo } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { Drone, Position } from '../types'
import {
  setDegradedLandmarksVisible,
  setLosResultOnMap,
  setTerrainMaskFromLos,
} from './applyTerrain'
import { analyzeLineOfSight, suggestRelayPositions, type LosResult } from './losAnalysis'
import { useTerrainDrift } from './useTerrainDrift'
import { estimateTerrainComplexity } from './sgTerrainConfig'

export interface DegradedTerrainOverlayProps {
  map: MapboxMap | null
  mapReady: boolean
  active: boolean
  drones: Drone[]
  asset: Position
  selectedDroneId: string | null
  losResult: LosResult | null
}

/**
 * GNSS-degraded truth layer: landmarks, drift hints, relay suggestions, LOS/mask sync.
 */
export function DegradedTerrainOverlay({
  map,
  mapReady,
  active,
  drones,
  asset,
  selectedDroneId,
  losResult,
}: DegradedTerrainOverlayProps) {
  const focus = useMemo(() => {
    const drone =
      drones.find((d) => d.id === selectedDroneId) ??
      drones.find((d) => d.type === 'Scout') ??
      drones[0]
    return drone?.position ?? asset
  }, [drones, selectedDroneId, asset])

  const drift = useTerrainDrift({
    lng: focus.lng,
    lat: focus.lat,
    secondsSinceFix: active ? 45 : 0,
    confidence: drones.find((d) => d.id === selectedDroneId)?.positioningConfidence ?? 55,
    gnssDenied: active,
  })

  const relays = useMemo(() => {
    if (!map || !mapReady || !active) return []
    try {
      return suggestRelayPositions(
        map,
        { lng: focus.lng, lat: focus.lat, alt: focus.alt },
        { lng: asset.lng, lat: asset.lat, alt: asset.alt },
        3,
      )
    } catch {
      return []
    }
  }, [map, mapReady, active, focus, asset])

  useEffect(() => {
    if (!map || !mapReady) return
    setDegradedLandmarksVisible(map, active)
  }, [map, mapReady, active])

  useEffect(() => {
    if (!map || !mapReady) return
    setLosResultOnMap(map, losResult)
    setTerrainMaskFromLos(map, losResult)
  }, [map, mapReady, losResult])

  if (!active) return null

  const complexity = estimateTerrainComplexity(focus.lng, focus.lat)
  const groundHint =
    map && mapReady
      ? (() => {
          try {
            return map.queryTerrainElevation(
              { lng: focus.lng, lat: focus.lat },
              { exaggerated: false },
            )
          } catch {
            return null
          }
        })()
      : null
  const agl =
    groundHint != null ? Math.max(0, Math.round(focus.alt - groundHint)) : Math.round(focus.alt)

  return (
    <div className="degraded-terrain" data-operator-ui role="status">
      <p className="degraded-terrain__eyebrow mono">GNSS-DENIED · TERRAIN TRUTH</p>
      <p className="degraded-terrain__line">
        AGL ~{agl} m · complexity <strong>{complexity}</strong>
      </p>
      <p className="degraded-terrain__line mono">
        Drift ±{Math.round(drift.uncertaintyRadiusM)} m · {drift.driftRateMps.toFixed(1)} m/s
      </p>
      <p className="degraded-terrain__hint">{drift.aglHint}</p>
      {losResult && (
        <p
          className={[
            'degraded-terrain__los',
            losResult.clear ? 'is-clear' : 'is-blocked',
          ].join(' ')}
        >
          LOS {losResult.clear ? 'CLEAR' : 'BLOCKED'}
          {!losResult.clear && losResult.blockingFeature
            ? ` · ${losResult.blockingFeature} @ ${Math.round(losResult.blockingElevation)} m`
            : ''}
        </p>
      )}
      {relays.length > 0 && (
        <ul className="degraded-terrain__relays">
          <li className="mono">Relay candidates</li>
          {relays.map((r, i) => (
            <li key={`${r.lng}-${r.lat}`}>
              R{i + 1}: {r.lng.toFixed(4)}, {r.lat.toFixed(4)}
              {r.alt != null ? ` · ${Math.round(r.alt)} m` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Re-export for callers that need a one-shot LOS from the overlay context. */
export { analyzeLineOfSight }
