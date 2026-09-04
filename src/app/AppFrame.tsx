import { IconRail } from '@/components/rail/IconRail'
import { ModeBar } from '@/components/modebar/ModeBar'
import { Panel } from '@/components/panel/Panel'
import { TooltipProvider } from '@/components/primitives/Tooltip'
import { SwarmHandle } from '@/components/swarm/SwarmHandle'
import { SwarmPanel } from '@/components/swarm/SwarmPanel'
import { TopBar } from '@/components/topbar/TopBar'
import { MapCanvas } from '@/map/MapCanvas'
import { getCursorMode } from '@/map/cursorModes'
import { useCursorMode } from '@/state/cursorMode'
import { useSwarmPanelOpen } from '@/state/swarm'
import { useActiveView, usePanelVisible, setPanelVisible } from '@/state/ui'
import { getView } from './views'
import { useGlobalShortcuts } from './useGlobalShortcuts'

/** The rail's destination: whichever view the active slot names. */
function RailPanel() {
  const activeView = useActiveView()
  const view = getView(activeView)
  const Body = view.component

  return (
    <Panel title={view.label} onClose={() => setPanelVisible(false)}>
      <Body />
    </Panel>
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
 *
 * The same reasoning governs the right dock. It is a sibling inside the
 * overlay field, so opening and closing it moves nothing underneath.
 */
export function AppFrame() {
  const panelVisible = usePanelVisible()
  const swarmOpen = useSwarmPanelOpen()
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
                className="flex min-h-0 flex-1 items-start gap-(--panel-gutter) p-(--panel-gutter) pb-0"
                style={{ zIndex: 'var(--z-panel)' }}
              >
                {panelVisible ? <RailPanel /> : null}

                {/* Right dock. ml-auto pins it to the far edge whether or not
                    the rail's panel is mounted, so closing the left panel
                    does not slide this one across the viewport. */}
                <div className="ml-auto flex max-h-full min-h-0 shrink-0">
                  {swarmOpen ? <SwarmPanel /> : <SwarmHandle />}
                </div>
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
