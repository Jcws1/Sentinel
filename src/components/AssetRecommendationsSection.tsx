import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../store'
import { requestPlanCommand } from '../store/commandThunks'
import { assessDecisionEvidence } from '../utils/decision'
import { ASSET_MATCH_WEIGHTS, rankAssetMatches } from '../utils/assetMatching'
import { AssetMatchCard } from './streamlined/TaskingCard'

export function AssetRecommendationsSection({
  preferredTrackId,
}: {
  preferredTrackId?: string | null
}) {
  const dispatch = useAppDispatch()
  const recommendations = useAppSelector((state) => state.tasking.recommendations)
  const activeRecommendationId = useAppSelector(
    (state) => state.tasking.activeRecommendationId,
  )
  const tracks = useAppSelector((state) => state.threats.tracks)
  const drones = useAppSelector((state) => state.fleet.drones)
  const asset = useAppSelector((state) => state.mission.protectedAsset)
  const zones = useAppSelector((state) => state.policy.zones)
  const lastSyncAt = useAppSelector((state) => state.session.lastSyncAt)
  const [collapsed, setCollapsed] = useState(false)
  const [switchingAssetId, setSwitchingAssetId] = useState<string | null>(null)

  const pending = recommendations.filter((recommendation) => recommendation.status === 'pending')
  const active =
    pending.find((recommendation) => recommendation.trackId === preferredTrackId) ??
    pending.find((recommendation) => recommendation.id === activeRecommendationId) ??
    pending[0]
  const track = active
    ? tracks.find((candidate) => candidate.id === active.trackId)
    : undefined
  const roePass = track
    ? assessDecisionEvidence(track, asset, zones, lastSyncAt).roePass
    : false
  const matches = useMemo(
    () => (track ? rankAssetMatches(track, drones, roePass) : []),
    [drones, roePass, track],
  )
  const activeRecommendationKey = active?.id

  useEffect(() => {
    if (activeRecommendationKey) setCollapsed(false)
  }, [activeRecommendationKey])

  const selectAsset = async (droneId: string) => {
    if (!active || switchingAssetId || active.droneIds[0] === droneId) return
    setSwitchingAssetId(droneId)
    try {
      await dispatch(
        requestPlanCommand({
          trackId: active.trackId,
          preferredDroneIds: [droneId],
        }),
      ).unwrap()
    } finally {
      setSwitchingAssetId(null)
    }
  }

  return (
    <section className="map-inspector__recommendations">
      <button
        type="button"
        className="map-inspector__section-toggle"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
      >
        <span>
          <small className="mono">TASKING</small>
          <strong>Ranked interceptors</strong>
        </span>
        {active && <em className="mono">{active.trackId}</em>}
        <i aria-hidden="true">{collapsed ? '+' : '\u2212'}</i>
      </button>

      {!collapsed && (
        <div className="map-inspector__recommendation-body">
          {active && track ? (
            <>
              <p className="map-inspector__recommendation-copy">
                Top match based on ROE, readiness, response, confidence, and relative mission cost.
              </p>
              <div className="map-inspector__recommendation-weights mono">
                <span>ROE {ASSET_MATCH_WEIGHTS.roe}</span>
                <span>RDY {ASSET_MATCH_WEIGHTS.readiness}</span>
                <span>RSP {ASSET_MATCH_WEIGHTS.response}</span>
                <span>CONF {ASSET_MATCH_WEIGHTS.confidence}</span>
                <span>COST {ASSET_MATCH_WEIGHTS.cost}</span>
              </div>
              <div
                className="map-inspector__match-list"
                role="listbox"
                aria-label={`Ranked interceptors for ${active.trackId}`}
              >
                {matches.map((match) => (
                  <AssetMatchCard
                    key={match.drone.id}
                    match={match}
                    selected={active.droneIds[0] === match.drone.id}
                    switching={switchingAssetId === match.drone.id}
                    supportCount={Math.max(0, active.droneIds.length - 1)}
                    onSelect={() => void selectAsset(match.drone.id)}
                  />
                ))}
              </div>
              <p className="map-inspector__recommendation-note">
                Cost is a relative simulation index; lower is better.
              </p>
            </>
          ) : (
            <p className="map-inspector__recommendation-empty">
              No pending intercept recommendation. Select a threat to request a plan.
            </p>
          )}
        </div>
      )}
    </section>
  )
}
