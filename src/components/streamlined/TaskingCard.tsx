import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector, store } from '../../store'
import {
  requestPlanCommand,
  submitDecisionCommand,
} from '../../store/commandThunks'
import {
  selectConfirmReadiness,
  selectPendingRecommendations,
  selectTopPriorityPending,
} from '../../store/selectors'
import { setIntentPaletteOpen } from '../../store/taskingSlice'
import { setTaskingSheetOpen, disarmConfirm, armConfirm } from '../../store/uiSlice'
import { executePrimaryConfirm } from '../../utils/operatorActions'
import { assessDecisionEvidence } from '../../utils/decision'
import {
  ASSET_MATCH_WEIGHTS,
  rankAssetMatches,
  type AssetMatch,
} from '../../utils/assetMatching'
import type { IntentAction } from '../../types'
import { DecisionEvidenceStrip } from './DecisionEvidenceStrip'

const INTENTS: IntentAction[] = ['DELAY', 'SWAP', 'IGNORE', 'ESCALATE']

function distanceLabel(distanceM: number): string {
  return distanceM >= 1000
    ? `${(distanceM / 1000).toFixed(1)} km`
    : `${distanceM} m`
}

export function AssetMatchCard({
  match,
  selected,
  switching,
  supportCount,
  onSelect,
}: {
  match: AssetMatch
  selected: boolean
  switching: boolean
  supportCount: number
  onSelect: () => void
}) {
  const name = match.drone.displayName || match.drone.id
  const platform = match.drone.platformId || match.drone.type

  return (
    <article
      className={[
        'v4-match-card',
        match.rank === 1 ? 'is-top' : '',
        selected ? 'is-selected' : '',
        !match.eligible ? 'is-blocked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="option"
      aria-selected={selected}
      aria-label={`${name}, rank ${match.rank}, ${match.score} percent match`}
    >
      <header className="v4-match-card__header">
        <span className="v4-match-card__rank">
          <i aria-hidden>{match.rank === 1 ? '⌘' : match.rank}</i>
          {match.rank === 1 ? 'Top match' : `Alternative ${match.rank}`}
        </span>
        <span className="v4-match-card__score mono">{match.score}%</span>
      </header>

      <div className="v4-match-card__identity">
        <span className="v4-match-card__glyph" aria-hidden>✦</span>
        <div>
          <h3>{name}</h3>
          <p>{platform}</p>
        </div>
        <span
          className={`v4-match-card__roe ${match.roePass ? 'is-pass' : 'is-hold'}`}
        >
          {match.roePass ? 'ROE PASS' : 'ROE HOLD'}
        </span>
      </div>

      <div className="v4-match-card__payload">
        <span>Payload</span>
        <strong>{match.drone.payloadStatus}</strong>
        {supportCount > 0 && selected && (
          <small>+{supportCount} support asset</small>
        )}
      </div>

      <dl className="v4-match-card__telemetry">
        <div>
          <dt>Elevation</dt>
          <dd className="mono">{Math.round(match.drone.position.alt)} m</dd>
        </div>
        <div>
          <dt>Battery</dt>
          <dd className="mono">{Math.round(match.drone.battery)}%</dd>
        </div>
        <div>
          <dt>Link</dt>
          <dd className={`mono tone-${match.drone.comms === 'strong' ? 'ok' : 'warn'}`}>
            {match.drone.comms.toUpperCase()}
          </dd>
        </div>
      </dl>

      <dl className="v4-match-card__criteria">
        <div>
          <dt>Time to target</dt>
          <dd className="mono">{match.etaSeconds}s</dd>
        </div>
        <div>
          <dt>Distance</dt>
          <dd className="mono">{distanceLabel(match.distanceM)}</dd>
        </div>
        <div>
          <dt>Cost index</dt>
          <dd className="mono">{match.costIndex}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd className="mono">{match.confidenceScore}%</dd>
        </div>
      </dl>

      <div className="v4-match-card__breakdown" aria-label="Match breakdown">
        <span title="Operational readiness score">Ready {match.readinessScore}</span>
        <span title="Response-time score">Response {match.responseScore}</span>
        <span title="Cost score; higher is better">Cost {match.costScore}</span>
      </div>

      {!match.eligible && (
        <p className="v4-match-card__blocked">{match.blockReasons.join(' · ')}</p>
      )}

      <button
        type="button"
        className="v4-match-card__select"
        disabled={!match.eligible || switching}
        onClick={onSelect}
      >
        {switching ? 'UPDATING…' : selected ? '✓ SELECTED' : 'USE ASSET'}
      </button>
    </article>
  )
}

export function TaskingCard() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.taskingSheetOpen)
  const pending = useAppSelector(selectPendingRecommendations)
  const activeId = useAppSelector((s) => s.tasking.activeRecommendationId)
  const topPriority = useAppSelector(selectTopPriorityPending)
  const active = pending.find((r) => r.id === activeId) ?? topPriority
  const paletteOpen = useAppSelector((s) => s.tasking.intentPaletteOpen)
  const readiness = useAppSelector(selectConfirmReadiness)
  const confirmArmed = useAppSelector((s) => s.ui.confirmArmed)
  const confirmExpires = useAppSelector((s) => s.ui.confirmArmExpiresAt)
  const drones = useAppSelector((s) => s.fleet.drones)
  const tracks = useAppSelector((s) => s.threats.tracks)
  const asset = useAppSelector((s) => s.mission.protectedAsset)
  const zones = useAppSelector((s) => s.policy.zones)
  const lastSyncAt = useAppSelector((s) => s.session.lastSyncAt)
  const [switchingAssetId, setSwitchingAssetId] = useState<string | null>(null)
  const multi = pending.length > 1
  const armValid =
    confirmArmed && confirmExpires != null && Date.now() < confirmExpires
  const track = active ? tracks.find((item) => item.id === active.trackId) : null
  const roePass = track
    ? assessDecisionEvidence(track, asset, zones, lastSyncAt).roePass
    : false
  const matches = useMemo(
    () => (track ? rankAssetMatches(track, drones, roePass) : []),
    [track, drones, roePass],
  )

  if (!active || !track) return null
  if (!open && !paletteOpen) return null

  const canConfirm = readiness.ready
  const selectedDroneId = active.droneIds[0] ?? null

  const selectAsset = async (droneId: string) => {
    if (switchingAssetId || droneId === selectedDroneId) return
    setSwitchingAssetId(droneId)
    try {
      await dispatch(
        requestPlanCommand({
          trackId: active.trackId,
          preferredDroneIds: [droneId],
        }),
      ).unwrap()
      dispatch(disarmConfirm())
    } finally {
      setSwitchingAssetId(null)
    }
  }

  return (
    <div className="v4-tasking-card" role="dialog" aria-label="Ranked tasking recommendations" data-operator-ui>
      <header className="v4-tasking-card__head">
        <div>
          <p className="v4-tasking-card__eyebrow mono">INTERCEPT {active.trackId}</p>
          <h2>Recommended assets</h2>
          <p>
            Ranked by ROE, readiness, response time, confidence, and relative mission cost.
          </p>
        </div>
        <button
          type="button"
          className="v4-tasking-card__close"
          aria-label="Close recommendations"
          onClick={() => {
            dispatch(setTaskingSheetOpen(false))
            dispatch(setIntentPaletteOpen(false))
            dispatch(disarmConfirm())
          }}
        >
          ×
        </button>
      </header>

      <div className="v4-tasking-card__weights mono" aria-label="Ranking weights">
        <span>ROE {ASSET_MATCH_WEIGHTS.roe}%</span>
        <span>Readiness {ASSET_MATCH_WEIGHTS.readiness}%</span>
        <span>Response {ASSET_MATCH_WEIGHTS.response}%</span>
        <span>Confidence {ASSET_MATCH_WEIGHTS.confidence}%</span>
        <span>Cost {ASSET_MATCH_WEIGHTS.cost}%</span>
      </div>

      <div className="v4-tasking-card__matches" role="listbox" aria-label="Ranked interceptor assets">
        {matches.map((match) => (
          <AssetMatchCard
            key={match.drone.id}
            match={match}
            selected={selectedDroneId === match.drone.id}
            switching={switchingAssetId === match.drone.id}
            supportCount={Math.max(0, active.droneIds.length - 1)}
            onSelect={() => void selectAsset(match.drone.id)}
          />
        ))}
      </div>

      <p className="v4-tasking-card__cost-note">
        Cost index is a relative simulation score based on transit, battery reserve, link quality,
        and navigation risk; lower is better.
      </p>

      <DecisionEvidenceStrip trackId={active.trackId} />

      <div className="v4-tasking-card__actions">
        <button
          type="button"
          className={[
            'v4-btn v4-btn--confirm',
            canConfirm ? 'is-ready' : 'is-disabled',
            multi && armValid ? 'is-armed' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          disabled={!canConfirm || switchingAssetId != null}
          onClick={() => {
            if (multi && !armValid) {
              dispatch(armConfirm())
              return
            }
            executePrimaryConfirm(dispatch, store.getState, pending, active)
            dispatch(setTaskingSheetOpen(false))
            dispatch(setIntentPaletteOpen(false))
          }}
        >
          {multi && !armValid
            ? `ARM (${pending.length})`
            : `CONFIRM ${selectedDroneId ?? ''}`}
        </button>
        {INTENTS.map((intent) => (
          <button
            key={intent}
            type="button"
            className="v4-btn v4-btn--sm"
            onClick={() => {
              void dispatch(
                submitDecisionCommand({
                  recommendationId: active.id,
                  decision: 'veto',
                  intent,
                }),
              )
              dispatch(setTaskingSheetOpen(false))
              dispatch(setIntentPaletteOpen(false))
              dispatch(disarmConfirm())
            }}
          >
            {intent}
          </button>
        ))}
      </div>
    </div>
  )
}
