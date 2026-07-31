import { useEffect, useState } from 'react'
import { MISSION_RECORDINGS } from '../data/missionRecordings'
import { useAppDispatch, useAppSelector } from '../store'
import { exitReplay, selectReplayMission } from '../store/replaySlice'
import { setWorkspace } from '../store/uiSlice'
import { CollapsiblePanel } from './CollapsiblePanel'

function durationLabel(durationMs: number): string {
  const minutes = Math.floor(durationMs / 60_000)
  const seconds = Math.floor((durationMs % 60_000) / 1000)
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`
}

export function MissionHistoryPanel() {
  const dispatch = useAppDispatch()
  const selectedMissionId = useAppSelector((state) => state.replay.selectedMissionId)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!selectedMissionId && MISSION_RECORDINGS[0]) {
      dispatch(selectReplayMission(MISSION_RECORDINGS[0].manifest.missionId))
    }
  }, [dispatch, selectedMissionId])

  return (
    <CollapsiblePanel
      side="left"
      eyebrow="Review"
      title="Past missions"
      count={MISSION_RECORDINGS.length}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((current) => !current)}
      className="panel--mission-history"
    >
      <div className="mission-history__toolbar">
        <div>
          <strong>Mission archive</strong>
          <span>Select a mission to replay it on the map.</span>
        </div>
        <button
          type="button"
          onClick={() => {
            dispatch(exitReplay())
            dispatch(setWorkspace('tracks'))
          }}
        >
          Live map
        </button>
      </div>
      <ol className="mission-history__list">
        {MISSION_RECORDINGS.map((recording) => {
          const manifest = recording.manifest
          const selected = selectedMissionId === manifest.missionId
          return (
            <li key={manifest.missionId}>
              <button
                type="button"
                className={selected ? 'is-selected' : ''}
                aria-pressed={selected}
                onClick={() => dispatch(selectReplayMission(manifest.missionId))}
              >
                <span className="mission-history__status" data-outcome={manifest.outcome} />
                <span className="mission-history__identity">
                  <strong>{manifest.name}</strong>
                  <small>{manifest.operation}</small>
                  <time>{new Date(manifest.startedAt).toLocaleString()}</time>
                </span>
                <span className="mission-history__meta mono">
                  <b>{durationLabel(manifest.durationMs)}</b>
                  <small>{manifest.eventCount} events</small>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <div className="mission-history__legend">
        <span><i data-outcome="completed" /> Completed</span>
        <span><i data-outcome="partial" /> Partial</span>
      </div>
    </CollapsiblePanel>
  )
}
