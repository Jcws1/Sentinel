import { X } from 'lucide-react'

import { IconRail } from '@/components/rail/IconRail'
import { ModeBar } from '@/components/modebar/ModeBar'
import { Icon } from '@/components/primitives/Icon'
import { TooltipProvider } from '@/components/primitives/Tooltip'
import { TopBar } from '@/components/topbar/TopBar'
import { MapCanvas } from '@/map/MapCanvas'
import { getCursorMode } from '@/map/cursorModes'
import { useCursorMode } from '@/state/cursorMode'
import { useActiveView, usePanelVisible, setPanelVisible } from '@/state/ui'
import { getView } from './views'
import { useGlobalShortcuts } from './useGlobalShortcuts'

/**
 * PROVISIONAL panel shell — replaced by the reusable <Panel> at build step 5,
 * which adds collapse, resize and a stable header slot API. Here only so the
 * rail has somewhere to route to.
 */
function PanelShell() {
  const activeView = useActiveView()
  const view = getView(activeView)
  const Body = view.component

  return (
    <section className="panel-surface pointer-events-auto flex max-h-full w-(--panel-default-width) flex-col overflow-hidden">
      <header className="flex h-(--panel-header-height) shrink-0 items-center justify-between border-b border-border-faint pr-1 pl-3">
        <h2 className="text-xs font-medium tracking-wide text-text">
          {view.label}
        </h2>
        <button
          type="button"
          onClick={() => setPanelVisible(false)}
          aria-label={`Close ${view.label}`}
          className="grid size-6 cursor-pointer place-items-center rounded-xs text-text-tertiary transition-colors duration-(--duration-fast) hover:bg-state-hover hover:text-text"
        >
          <Icon icon={X} size="sm" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Body />
      </div>
    </section>
  )
}

/**
 * The three-layer frame. This layering is load-bearing:
 *
 *   z-map      full-bleed map, edge to edge, never unmounted and never resized
 *              by chrome — a rail toggle must not trigger a MapLibre resize.
 *   z-panel    panels floating over the map, in a pointer-events-none field so
 *              drags pass through to the map everywhere a panel is not.
 *   z-modebar  cursor-mode palette, bottom left.
 *   z-rail     chrome, above panels, never occluded.
 *
 * Chrome overlays the map rather than displacing it. That is why the map sits
 * in an absolutely positioned layer instead of a flex sibling: a grid
 * dashboard would reflow the canvas on every layout change, and at 20Hz with
 * a WebGL context that is exactly the cost we cannot pay.
 */
export function AppFrame() {
  const panelVisible = usePanelVisible()
  const cursorMode = useCursorMode()

  useGlobalShortcuts()

  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={300}>
      <div className="relative size-full overflow-hidden">
        {/* Map layer — beneath everything, full bleed. MapCanvas sets the
            cursor on its own canvas from the same store; the style here
            covers the margins before the canvas has painted. */}
        <div
          className="absolute inset-0"
          style={{
            zIndex: 'var(--z-map)',
            cursor: getCursorMode(cursorMode).cursor,
          }}
        >
          <MapCanvas />
        </div>

        {/* Chrome + panel layer. pointer-events-none so the map stays
            draggable through the gaps; each surface opts itself back in. */}
        <div className="pointer-events-none relative flex size-full flex-col">
          <div className="pointer-events-auto">
            <TopBar />
          </div>

          <div className="flex min-h-0 flex-1">
            <div className="pointer-events-auto">
              <IconRail />
            </div>

            {/* Overlay column: panels take the space above, the mode palette
                is pinned to the bottom. Laying them out as flex siblings
                rather than stacking both absolutely means a full-height panel
                stops short of the palette instead of covering it — the active
                cursor mode must never be hidden behind a panel. */}
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                className="min-h-0 flex-1 p-(--panel-gutter) pb-0"
                style={{ zIndex: 'var(--z-panel)' }}
              >
                {panelVisible ? <PanelShell /> : null}
              </div>

              <div className="shrink-0 p-(--panel-gutter)">
                <ModeBar />
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
