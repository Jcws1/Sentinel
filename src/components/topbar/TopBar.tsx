import { useEffect, useState } from 'react'

import { Brand } from './Brand'
import { cycleAutoMode, setMissionMode, setMissionState, useOperations } from '@/state/operations'

/**
 * Station time zone.
 *
 * NOTE: this is deliberately local (UTC+8), not Zulu. Multi-force operations
 * normally coordinate in UTC precisely so that a time never has to be
 * qualified — so the suffix below is not decoration, it is what stops a
 * displayed time being read as UTC. If this console ever talks to anyone
 * outside GMT+8, add a Zulu readout beside this rather than replacing the
 * suffix.
 *
 * Singapore has no DST and has not observed it since 1935, so the offset is a
 * fixed +08:00 — but the formatting still goes through the IANA zone rather
 * than a hardcoded arithmetic offset, so this stays correct if the station
 * ever moves.
 */
const TIME_ZONE = 'Asia/Singapore'
const TIME_ZONE_LABEL = 'SGT'

const displayFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Sortable `YYYY-MM-DD HH:mm:ss` in the station zone, for the datetime attr. */
const machineFormat = new Intl.DateTimeFormat('sv-SE', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

function useStationTime() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    // Align the first tick to the next whole second so the display does not
    // sit visibly out of phase with the wall clock.
    let interval: number | undefined
    const timeout = window.setTimeout(
      () => {
        setNow(new Date())
        interval = window.setInterval(() => setNow(new Date()), 1000)
      },
      1000 - (Date.now() % 1000),
    )

    return () => {
      window.clearTimeout(timeout)
      if (interval !== undefined) window.clearInterval(interval)
    }
  }, [])

  return {
    display: displayFormat.format(now),
    machine: `${machineFormat.format(now).replace(' ', 'T')}+08:00`,
  }
}

export function TopBar() {
  const { display, machine } = useStationTime()
  const operations = useOperations()
  const pending = operations.tasks.filter((task) => task.status === 'review').length

  return (
    <header
      className="flex h-(--topbar-height) shrink-0 items-center gap-2 border-b border-border bg-panel-header pr-3 backdrop-blur-(--panel-blur)"
      style={{ zIndex: 'var(--z-topbar)' }}
    >
      {/* No left padding: Brand owns its own rail-width column so the
          insignia stays centred on the rail regardless of disc size. */}
      <Brand />

      <nav aria-label="Mission mode" className="flex items-center gap-0.5">
        {(['defense', 'recon', 'attack'] as const).map((mode) => <button key={mode} type="button" aria-pressed={operations.mode === mode} onClick={() => setMissionMode(mode)} className={`rounded-xs px-2 py-1 text-2xs uppercase ${operations.mode === mode ? 'bg-state-selected text-text' : 'text-text-tertiary hover:bg-state-hover'}`}>{mode}</button>)}
      </nav>

      <div className="ml-auto flex items-center gap-2 font-mono text-2xs">
        <span className={operations.connected ? 'text-signal-nominal' : 'text-signal-critical'}>LINK {operations.connected ? 'ONLINE' : 'OFFLINE'}</span>
        <span className={operations.gnss === 'ACTIVE' ? 'text-signal-nominal' : 'text-signal-caution'}>GNSS {operations.gnss}</span>
        <span className="text-text-secondary">QUEUE {pending}</span>
        <button type="button" onClick={cycleAutoMode} className="rounded-xs border border-border px-1.5 py-1 text-text-secondary">AUTO {operations.autoMode}</button>
        <button type="button" onClick={() => setMissionState(operations.missionState === 'HOLD' ? 'ACTIVE' : 'HOLD')} className="rounded-xs border border-signal-caution/40 px-1.5 py-1 text-signal-caution">{operations.missionState === 'HOLD' ? 'RESUME' : 'HOLD'}</button>
        <button type="button" onClick={() => setMissionState('RECALL')} className="rounded-xs border border-signal-critical/40 px-1.5 py-1 text-signal-critical">RECALL</button>
      </div>

      {/* The clock is the only status readout here, because it is the only one
          currently backed by real data. Node identity and link health return
          when there is an actual connection to report on. */}
      <time
        className="font-mono text-num tabular text-text-secondary select-text"
        dateTime={machine}
      >
        {display}
        <span className="ml-1 text-text-tertiary">{TIME_ZONE_LABEL}</span>
      </time>
    </header>
  )
}
