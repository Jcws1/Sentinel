import { useAppDispatch, useAppSelector } from '../../store'
import { setHelpOpen } from '../../store/uiSlice'

const SECTIONS = [
  {
    title: 'Quick start',
    items: [
      'Highest-priority threat auto-selects on the map.',
      'When tasking is ready, CONFIRM pulses teal — one tap to execute.',
      'Threat ticker above the bottom bar: tap to fly to that track.',
    ],
  },
  {
    title: 'Bottom bar',
    items: [
      'FLEET — view drones; tap for stats, long-press for full telemetry.',
      'OVERLAYS — toggle map layers (threats, mesh, terrain, etc.).',
      'HOLD — pause intercepts; tap again to resume.',
      'RECALL — return all drones (confirmation required).',
      'CONFIRM — execute the top-priority intercept plan.',
    ],
  },
  {
    title: 'Map',
    items: [
      'Tap a threat or drone to select it.',
      'Alert tracks pulse amber on the map.',
      'Use Satellite / Minimal in the top bar to switch basemap.',
    ],
  },
  {
    title: 'Keyboard',
    items: [
      '1 or Enter — confirm intercept.',
      'H — hold / resume mission.',
    ],
  },
  {
    title: 'Menu (⋮)',
    items: [
      'Settings — alert chirp, fleet list, ROE summary.',
      'Offline maps — cache tiles before disconnected ops.',
      'Logs / ROE — mission log and rules of engagement.',
    ],
  },
]

export function HelpGuide() {
  const dispatch = useAppDispatch()
  const open = useAppSelector((s) => s.ui.helpOpen)

  if (!open) return null

  return (
    <div
      className="v4-help-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="v4-help-title"
      data-operator-ui
    >
      <button
        type="button"
        className="v4-help-modal__backdrop"
        aria-label="Close help"
        onClick={() => dispatch(setHelpOpen(false))}
      />
      <div className="v4-help-modal__card">
        <header className="v4-help-modal__head">
          <h2 id="v4-help-title">How to use Sentinel</h2>
          <button
            type="button"
            className="v4-help-modal__close"
            aria-label="Close"
            onClick={() => dispatch(setHelpOpen(false))}
          >
            ✕
          </button>
        </header>

        <div className="v4-help-modal__body">
          {SECTIONS.map((section) => (
            <section key={section.title} className="v4-help-section">
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <footer className="v4-help-modal__foot">
          <button
            type="button"
            className="v4-btn"
            onClick={() => dispatch(setHelpOpen(false))}
          >
            CLOSE
          </button>
        </footer>
      </div>
    </div>
  )
}
