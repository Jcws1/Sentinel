import { useAppDispatch, useAppSelector } from '../../store'
import { setOfflinePrepOpen } from '../../store/uiSlice'
import { useOfflineCacheStatus } from '../../hooks/useOfflineCacheStatus'
import { isDegraded } from '../../modeProfiles'

export function OfflineCacheBanner() {
  const dispatch = useAppDispatch()
  const mission = useAppSelector((s) => s.mission)
  const connected = useAppSelector((s) => s.session.connected)
  const degraded = isDegraded(mission.gnss, mission.c2Link)
  const { coveragePct, cacheIncomplete } = useOfflineCacheStatus(degraded || !connected)

  if (!cacheIncomplete || coveragePct == null) return null

  return (
    <div className="v4-cache-banner" role="alert" data-operator-ui>
      <span>
        Map cache {coveragePct}% — AO not fully cached for offline ops
      </span>
      <button
        type="button"
        className="v4-cache-banner__btn"
        onClick={() => dispatch(setOfflinePrepOpen(true))}
      >
        PREP
      </button>
    </div>
  )
}
