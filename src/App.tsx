import { useEffect } from 'react'
import { StreamlinedLayout } from './components/streamlined/StreamlinedLayout'
import { connectC2Backend } from './api/sync'
import { useAppDispatch, useAppSelector } from './store'
import { pruneToasts } from './store/taskingSlice'
import { pruneCommands } from './store/workflowSlice'

export default function App() {
  const dispatch = useAppDispatch()
  const connected = useAppSelector((s) => s.session.connected)
  const connecting = useAppSelector((s) => s.session.connecting)
  const error = useAppSelector((s) => s.session.error)
  const mode = useAppSelector((s) => s.ui.mode)
  const mission = useAppSelector((s) => s.mission)
  const hardDenied = mission.gnss === 'denied' || mission.c2Link === 'lost'

  useEffect(() => {
    const disconnect = connectC2Backend(dispatch)
    const toastTimer = window.setInterval(() => {
      dispatch(pruneToasts())
      dispatch(pruneCommands())
    }, 1000)
    return () => {
      disconnect()
      window.clearInterval(toastTimer)
    }
  }, [dispatch])

  return (
    <div
      className="app-shell app-shell--v4"
      data-theme="gotham"
      data-mode={mode}
      data-degraded={hardDenied ? 'true' : 'false'}
      data-left-panel="false"
      data-right-panel="false"
      data-rail="false"
    >
      {!connected && (
        <div
          className={`link-banner ${connecting ? 'link-banner--warn' : 'link-banner--crit'}`}
          role="status"
        >
          {connecting
            ? 'Connecting to C2…'
            : (error ?? 'C2 offline — run npm run dev')}
        </div>
      )}
      <StreamlinedLayout />
    </div>
  )
}
