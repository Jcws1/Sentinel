import { useEffect } from 'react'
import { recordingById } from '../data/missionRecordings'
import { useAppDispatch, useAppSelector } from '../store'
import {
  advanceReplay,
  setReplayPlaying,
  setReplayPosition,
  setReplaySpeed,
} from '../store/replaySlice'

function formatTime(positionMs: number): string {
  const seconds = Math.max(0, Math.round(positionMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

export function MissionPlaybackTimeline() {
  const dispatch = useAppDispatch()
  const selectedMissionId = useAppSelector((state) => state.replay.selectedMissionId)
  const positionMs = useAppSelector((state) => state.replay.positionMs)
  const playing = useAppSelector((state) => state.replay.playing)
  const speed = useAppSelector((state) => state.replay.speed)
  const recording = recordingById(selectedMissionId)
  const durationMs = recording?.manifest.durationMs ?? 0

  useEffect(() => {
    if (!playing || !recording) return
    const timer = window.setInterval(() => {
      dispatch(advanceReplay({ deltaMs: 100, durationMs: recording.manifest.durationMs }))
    }, 100)
    return () => window.clearInterval(timer)
  }, [dispatch, playing, recording])

  if (!recording) return null
  const progress = durationMs > 0 ? (positionMs / durationMs) * 100 : 0

  return (
    <section className="mission-playback" aria-label="Mission playback" data-operator-ui>
      <div className="mission-playback__controls">
        <button
          type="button"
          className="mission-playback__play"
          aria-label={playing ? 'Pause mission playback' : 'Play mission playback'}
          onClick={() => {
            if (positionMs >= durationMs) dispatch(setReplayPosition(0))
            dispatch(setReplayPlaying(!playing))
          }}
        >
          <span aria-hidden="true">{playing ? '\u275A\u275A' : '\u25B6'}</span>
        </button>
        <button
          type="button"
          className="mission-playback__restart"
          aria-label="Restart mission playback"
          onClick={() => {
            dispatch(setReplayPosition(0))
            dispatch(setReplayPlaying(true))
          }}
        >
          &#8634;
        </button>
        <strong className="mono">{formatTime(positionMs)}</strong>
        <span className="mono">/ {formatTime(durationMs)}</span>
      </div>

      <div className="mission-playback__timeline">
        <div className="mission-playback__event-raster">
          {recording.events.map((event, index) => {
            const eventProgress = durationMs > 0 ? event.atMs / durationMs : 0
            return (
              <button
                key={event.eventId}
                type="button"
                className={`mission-playback__marker is-${event.tone}`}
                style={{ left: `${2 + eventProgress * 96}%` }}
                title={`${formatTime(event.atMs)} - ${event.type}: ${event.summary}`}
                aria-label={`Event ${index + 1}: ${event.type}, ${event.summary}`}
                onClick={() => {
                  dispatch(setReplayPosition(event.atMs))
                  dispatch(setReplayPlaying(false))
                }}
              >
                <span>{index + 1}</span>
                <i />
              </button>
            )
          })}
        </div>
        <div className="mission-playback__track">
          <span className="mission-playback__progress" style={{ width: `${progress}%` }} />
          <span className="mission-playback__playhead" style={{ left: `${progress}%` }} />
          <input
            type="range"
            min="0"
            max={durationMs}
            step="100"
            value={Math.min(positionMs, durationMs)}
            aria-label="Mission playback position"
            onChange={(event) => {
              dispatch(setReplayPosition(Number(event.target.value)))
              dispatch(setReplayPlaying(false))
            }}
          />
        </div>
      </div>

      <label className="mission-playback__speed mono">
        Speed
        <select
          value={speed}
          onChange={(event) => dispatch(setReplaySpeed(Number(event.target.value) as 0.5 | 1 | 2 | 4))}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </label>
    </section>
  )
}
