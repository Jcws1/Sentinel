import { useEffect, useState } from 'react'

import { Brand } from './Brand'

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

  return (
    <header
      className="flex h-(--topbar-height) shrink-0 items-center justify-between border-b border-border bg-panel-header pr-3 backdrop-blur-(--panel-blur)"
      style={{ zIndex: 'var(--z-topbar)' }}
    >
      {/* No left padding: Brand owns its own rail-width column so the
          insignia stays centred on the rail regardless of disc size. */}
      <Brand />

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
