import { useMemo, useState } from 'react'
import { recordingById } from '../data/missionRecordings'
import { useAppSelector } from '../store'
import type { MissionEventCategory } from '../../contracts/missionRecording'
import { CollapsiblePanel } from './CollapsiblePanel'

function elapsedLabel(atMs: number): string {
  const minutes = Math.floor(atMs / 60_000)
  const seconds = Math.floor((atMs % 60_000) / 1000)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function MissionReplayLogPanel() {
  const selectedMissionId = useAppSelector((state) => state.replay.selectedMissionId)
  const positionMs = useAppSelector((state) => state.replay.positionMs)
  const [tab, setTab] = useState<MissionEventCategory>('decision')
  const [collapsed, setCollapsed] = useState(false)
  const recording = recordingById(selectedMissionId)
  const visibleEvents = useMemo(
    () => recording?.events.filter((event) => event.category === tab) ?? [],
    [recording, tab],
  )

  return (
    <CollapsiblePanel
      side="right"
      eyebrow="Mission review"
      title={recording?.manifest.name ?? 'Mission logs'}
      count={recording?.manifest.outcome.toUpperCase() ?? 'NO MISSION'}
      collapsed={collapsed}
      onToggleCollapse={() => setCollapsed((current) => !current)}
      className="panel--mission-replay-log"
    >
      <div className="mission-log-tabs" role="tablist" aria-label="Mission log type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'decision'}
          className={tab === 'decision' ? 'is-active' : ''}
          onClick={() => setTab('decision')}
        >
          Decisions
          <span className="mono">
            {recording?.events.filter((event) => event.category === 'decision').length ?? 0}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'event'}
          className={tab === 'event' ? 'is-active' : ''}
          onClick={() => setTab('event')}
        >
          Events
          <span className="mono">
            {recording?.events.filter((event) => event.category === 'event').length ?? 0}
          </span>
        </button>
      </div>
      <div className="mission-log__summary">
        <span>{recording?.manifest.operation ?? 'Select a past mission'}</span>
        <strong className="mono">T+{elapsedLabel(positionMs)}</strong>
      </div>
      <ol className="mission-log__list" role="log">
        {visibleEvents.map((event) => {
          const reached = event.atMs <= positionMs
          return (
            <li
              key={event.eventId}
              className={[
                reached ? 'is-reached' : 'is-future',
                `is-${event.tone}`,
              ].join(' ')}
            >
              <time className="mono">{elapsedLabel(event.atMs)}</time>
              <span className="mission-log__mark" />
              <span>
                <strong className="mono">{event.type.replaceAll('.', ' ')}</strong>
                <p>{event.summary}</p>
                {event.entityIds.length > 0 && (
                  <small className="mono">{event.entityIds.join(' · ')}</small>
                )}
              </span>
            </li>
          )
        })}
      </ol>
    </CollapsiblePanel>
  )
}
