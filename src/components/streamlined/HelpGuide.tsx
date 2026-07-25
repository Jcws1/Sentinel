import { useAppDispatch, useAppSelector } from '../../store'
import { setHelpOpen } from '../../store/uiSlice'

const SECTIONS = [
  {
    title: 'Quick start',
    items: [
      'Highest-priority threat auto-selects unless AUTO is toggled to PIN (freeze).',
      'Check GPS / C2 / data age chips before confirming.',
      'When tasking is ready, CONFIRM pulses teal — blocked if data is stale or ROE fails.',
    ],
  },
  {
    title: 'Bottom bar',
    items: [
      'FLEET — tap stats, long-press full telemetry.',
      'OVERLAYS — map layers.',
      'HOLD — tap for confirmation; long-press 3s for immediate hold.',
      'RECALL — tap for confirmation; long-press 3s for immediate recall.',
      'CONFIRM — single threat: one tap. Multiple: tap ARM then CONFIRM within 5s.',
    ],
  },
  {
    title: 'Map',
    items: [
      'Tap threat to pin callout; touch-hold preview on tablet.',
      'Drift halos grow in GNSS-denied mode (meters on ground).',
      'LOS CLEAR/BLOCKED shown in degraded terrain panel.',
    ],
  },
  {
    title: 'Keyboard',
    items: [
      '1 or Enter — confirm (when ready).',
      'H — hold dialog; Shift+H — immediate hold.',
      '[ / ] — cycle threats by priority.',
    ],
  },
  {
    title: 'Degraded ops',
    items: [
      'C2 offline — commands queue and flush when link returns.',
      'Prep offline maps before sortie if cache banner shows.',
      'Decision evidence strip shows ROE, staleness, and buffer.',
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
