import { useAppDispatch, useAppSelector } from '../../store'
import { dismissToast } from '../../store/taskingSlice'
import { abortEngagementCommand } from '../../store/commandThunks'

export function ToastStack() {
  const dispatch = useAppDispatch()
  const toasts = useAppSelector((s) => s.tasking.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="v4-toast-stack" aria-live="polite" data-operator-ui>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={['v4-toast', toast.undoTrackId ? 'v4-toast--undo' : '']
            .filter(Boolean)
            .join(' ')}
        >
          <span className="v4-toast__message">{toast.message}</span>
          {toast.undoTrackId && (
            <button
              type="button"
              className="v4-toast__undo"
              onClick={() => {
                void dispatch(abortEngagementCommand(toast.undoTrackId!))
                dispatch(dismissToast(toast.id))
              }}
            >
              UNDO
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
