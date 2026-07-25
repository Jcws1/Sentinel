import { useAppSelector } from '../../store'
import {
  selectFailedQueuedCount,
  selectQueuedCommandCount,
} from '../../store/selectors'

export function CommandQueueHud() {
  const queued = useAppSelector(selectQueuedCommandCount)
  const failed = useAppSelector(selectFailedQueuedCount)
  const flushing = useAppSelector((s) => s.commandQueue.flushing)

  if (queued === 0 && failed === 0) return null

  return (
    <div className="v4-queue-hud mono" role="status" data-operator-ui>
      {flushing && <span>Sending queue…</span>}
      {queued > 0 && !flushing && <span>{queued} queued</span>}
      {failed > 0 && <span className="tone-crit">{failed} failed</span>}
    </div>
  )
}
