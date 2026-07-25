import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import {
  setAlertsOpen,
  setMapBasemap,
  setMapOverlayTab,
  setOfflinePrepOpen,
  setOverflowMenuOpen,
  setWorkspace,
  setHelpOpen,
  toggleOverflowMenu,
  toggleAutoFocusFrozen,
  type WorkspaceView,
} from '../../store/uiSlice'
import { ModeSelector } from './ModeSelector'
import { BasemapToggle } from './BasemapToggle'
import { ModeSwitchDialog } from '../ModeSwitchDialog'
import { resolveOfflineMapConfig } from '../../terrain/offlineMapConfig'
import { useDataAgeSec } from '../../hooks/useDataAgeSec'
import { CommandQueueHud } from './CommandQueueHud'

type MenuId =
  | WorkspaceView
  | 'installations'
  | 'basemap'
  | 'offline'
  | 'logout'

const MENU: Array<{ id: MenuId; label: string; section?: 'map' | 'system' }> = [
  { id: 'operations', label: 'Logs', section: 'system' },
  { id: 'policy', label: 'ROE', section: 'system' },
  { id: 'fleet', label: 'Settings', section: 'system' },
  { id: 'installations', label: 'Installations', section: 'map' },
  { id: 'basemap', label: 'Basemap', section: 'map' },
  { id: 'offline', label: 'Offline maps', section: 'map' },
  { id: 'logout', label: 'Log out' },
]

function statusLabel(
  connected: boolean,
  gnss: string,
  c2Link: string,
  mapOffline: boolean,
): string | null {
  if (!connected) return 'C2 offline'
  if (mapOffline) return 'Map cache'
  if (c2Link === 'lost') return 'LINK lost'
  if (c2Link === 'weak') return 'LINK weak'
  if (gnss === 'denied') return 'GNSS denied'
  if (gnss === 'degraded') return 'GNSS degraded'
  return null
}

function isNominalBar(
  connected: boolean,
  gnss: string,
  c2Link: string,
  mapOffline: boolean,
  alertCount: number,
): boolean {
  return (
    connected &&
    !mapOffline &&
    gnss === 'active' &&
    c2Link === 'strong' &&
    alertCount === 0
  )
}

export function StreamlinedTopBar() {
  const dispatch = useAppDispatch()
  const menuOpen = useAppSelector((s) => s.ui.overflowMenuOpen)
  const alertsOpen = useAppSelector((s) => s.ui.alertsOpen)
  const alertCount = useAppSelector((s) => s.threats.alertTrackIds.length)
  const gnss = useAppSelector((s) => s.mission.gnss)
  const basemap = useAppSelector((s) => s.ui.mapBasemap)
  const mapOverlayTab = useAppSelector((s) => s.ui.mapOverlayTab)
  const connected = useAppSelector((s) => s.session.connected)
  const mission = useAppSelector((s) => s.mission)
  const lastSyncAt = useAppSelector((s) => s.session.lastSyncAt)
  const autoFocusFrozen = useAppSelector((s) => s.ui.autoFocusFrozen)
  const dataAgeSec = useDataAgeSec(lastSyncAt)
  const [netOnline, setNetOnline] = useState(
    () => typeof navigator !== 'undefined' && navigator.onLine,
  )
  const mapOffline =
    resolveOfflineMapConfig(basemap).offlinePreferred || !netOnline
  const status = statusLabel(connected, gnss, mission.c2Link, mapOffline)
  const nominal = isNominalBar(
    connected,
    gnss,
    mission.c2Link,
    mapOffline,
    alertCount,
  )

  useEffect(() => {
    const on = () => setNetOnline(true)
    const off = () => setNetOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  const menuHint = (id: MenuId): string => {
    if (id === 'installations') {
      return mapOverlayTab === 'bases' ? ' (Bases)' : ' (Scenarios)'
    }
    if (id === 'basemap') return basemap === 'satellite' ? ' (Sat)' : ' (Min)'
    return ''
  }

  return (
    <header
      className={['v4-top-bar', nominal ? 'is-nominal' : ''].filter(Boolean).join(' ')}
      data-operator-ui
    >
      <div className="v4-top-bar__left">
        {!nominal && <span className="v4-top-bar__brand">SENTINEL</span>}
        <ModeSelector compact={nominal} />
        <BasemapToggle />
        <span
          className={`v4-top-bar__gnss tone-${
            gnss === 'active' ? 'ok' : gnss === 'degraded' ? 'warn' : 'crit'
          }`}
        >
          {gnss === 'active' ? 'GPS OK' : gnss === 'degraded' ? 'GPS weak' : 'GPS dead'}
        </span>
        <span
          className={`v4-top-bar__link tone-${
            !connected ? 'crit' : mission.c2Link === 'strong' ? 'ok' : mission.c2Link === 'weak' ? 'warn' : 'crit'
          }`}
        >
          {!connected ? 'C2 off' : mission.c2Link === 'strong' ? 'C2 live' : mission.c2Link === 'weak' ? 'C2 weak' : 'C2 lost'}
        </span>
        {dataAgeSec != null && (
          <span
            className={`v4-top-bar__data-age mono tone-${
              dataAgeSec > 12 ? 'crit' : dataAgeSec > 5 ? 'warn' : 'ok'
            }`}
          >
            {dataAgeSec}s
          </span>
        )}
        {mapOffline && (
          <span className="v4-top-bar__map-offline tone-warn">Map cache</span>
        )}
        {!nominal && status && (
          <span className="v4-top-bar__status tone-warn">{status}</span>
        )}
      </div>
      <div className="v4-top-bar__right">
        <CommandQueueHud />
        <button
          type="button"
          className={['v4-top-bar__freeze', autoFocusFrozen ? 'is-active' : '']
            .filter(Boolean)
            .join(' ')}
          aria-pressed={autoFocusFrozen}
          title="Freeze auto-focus"
          onClick={() => dispatch(toggleAutoFocusFrozen())}
        >
          {autoFocusFrozen ? 'PIN' : 'AUTO'}
        </button>
        {alertCount > 0 && (
          <button
            type="button"
            className={['v4-top-bar__alerts', alertsOpen ? 'is-active' : '']
              .filter(Boolean)
              .join(' ')}
            onClick={() => dispatch(setAlertsOpen(!alertsOpen))}
          >
            {alertCount}
          </button>
        )}
        <button
          type="button"
          className="v4-top-bar__help-btn"
          aria-label="How to use Sentinel"
          onClick={() => dispatch(setHelpOpen(true))}
        >
          ?
        </button>
        <button
          type="button"
          className="v4-top-bar__menu-btn"
          aria-expanded={menuOpen}
          aria-label="Menu"
          onClick={() => dispatch(toggleOverflowMenu())}
        >
          ⋮
        </button>
      </div>

      {menuOpen && (
        <div className="v4-menu" role="menu">
          <button
            type="button"
            className="v4-menu__backdrop"
            aria-label="Close menu"
            onClick={() => dispatch(setOverflowMenuOpen(false))}
          />
          <ul className="v4-menu__list">
            {MENU.map((item, idx) => {
              const showMapHeader =
                item.section === 'map' &&
                (idx === 0 || MENU[idx - 1]?.section !== 'map')
              return (
                <li key={item.id}>
                  {showMapHeader && <span className="v4-menu__section">Map</span>}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      if (item.id === 'logout') {
                        dispatch(setOverflowMenuOpen(false))
                        return
                      }
                      if (item.id === 'installations') {
                        dispatch(
                          setMapOverlayTab(mapOverlayTab === 'bases' ? 'scenarios' : 'bases'),
                        )
                        dispatch(setOverflowMenuOpen(false))
                        return
                      }
                      if (item.id === 'basemap') {
                        dispatch(setMapBasemap(basemap === 'satellite' ? 'minimal' : 'satellite'))
                        dispatch(setOverflowMenuOpen(false))
                        return
                      }
                      if (item.id === 'offline') {
                        dispatch(setOfflinePrepOpen(true))
                        dispatch(setOverflowMenuOpen(false))
                        return
                      }
                      dispatch(setWorkspace(item.id))
                      dispatch(setOverflowMenuOpen(false))
                    }}
                  >
                    {item.label}
                    {menuHint(item.id)}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <ModeSwitchDialog />
    </header>
  )
}
