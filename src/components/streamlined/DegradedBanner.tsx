import { useAppSelector } from '../../store'
import { isDegraded } from '../../modeProfiles'
import type { CommsState, GnssState } from '../../types'

function gnssLabel(gnss: GnssState): { text: string; tone: 'ok' | 'warn' | 'crit' } {
  if (gnss === 'active') return { text: 'GPS OK', tone: 'ok' }
  if (gnss === 'degraded') return { text: 'GPS weak', tone: 'warn' }
  return { text: 'GPS dead', tone: 'crit' }
}

function linkLabel(c2: CommsState, connected: boolean): { text: string; tone: 'ok' | 'warn' | 'crit' } {
  if (!connected) return { text: 'C2 offline', tone: 'crit' }
  if (c2 === 'strong') return { text: 'C2 live', tone: 'ok' }
  if (c2 === 'weak') return { text: 'C2 weak', tone: 'warn' }
  return { text: 'C2 lost', tone: 'crit' }
}

export function DegradedBanner() {
  const mission = useAppSelector((s) => s.mission)
  const connected = useAppSelector((s) => s.session.connected)
  const degraded = isDegraded(mission.gnss, mission.c2Link)
  const show =
    degraded ||
    !connected ||
    mission.c2Link !== 'strong' ||
    mission.gnss !== 'active' ||
    mission.swarmAutonomy

  if (!show) return null

  const gnss = gnssLabel(mission.gnss)
  const link = linkLabel(mission.c2Link, connected)
  const posSource =
    mission.gnss === 'active'
      ? 'GNSS'
      : (mission.fallbackPositioning ?? 'VIO + mesh')

  return (
    <div
      className={[
        'v4-degraded-banner',
        gnss.tone === 'crit' || link.tone === 'crit' ? 'is-crit' : 'is-warn',
      ].join(' ')}
      role="status"
      data-operator-ui
    >
      <div className="v4-degraded-banner__chips">
        <span className={`v4-ops-chip tone-${gnss.tone}`}>{gnss.text}</span>
        <span className={`v4-ops-chip tone-${link.tone}`}>{link.text}</span>
        <span className="v4-ops-chip tone-neutral mono">POS {posSource}</span>
        {mission.swarmAutonomy && (
          <span className="v4-ops-chip tone-warn">AUTONOMY</span>
        )}
      </div>
      <p className="v4-degraded-banner__hint">
        {mission.gnss === 'denied'
          ? 'Terrain primary — drift grows over time'
          : mission.c2Link === 'lost'
            ? 'Local state only — commands queue until link returns'
            : 'Cross-check fusion before confirm'}
      </p>
    </div>
  )
}
