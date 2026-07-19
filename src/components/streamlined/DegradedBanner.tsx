import { useAppSelector } from '../../store'
import { isDegraded } from '../../modeProfiles'

export function DegradedBanner() {
  const mission = useAppSelector((s) => s.mission)
  const degraded = isDegraded(mission.gnss, mission.c2Link)
  if (!degraded) return null

  const hard = mission.gnss === 'denied' || mission.c2Link === 'lost'
  return (
    <div
      className={['v4-degraded-banner', hard ? 'is-crit' : 'is-warn'].join(' ')}
      role="status"
      data-operator-ui
    >
      {hard ? 'GNSS denied — terrain primary' : 'GNSS degraded — terrain primary'}
    </div>
  )
}
