import * as ToggleGroup from '@radix-ui/react-toggle-group'

import { AnnotationList } from '@/components/panel/AnnotationList'
import { Section } from '@/components/panel/Section'
import { StatusRow } from '@/components/panel/StatusRow'
import { Icon } from '@/components/primitives/Icon'
import { cn } from '@/lib/cn'
import {
  formatBounds,
  formatBoundsSpan,
  formatResolution,
  formatZoomRange,
} from '@/lib/format'
import { VIEW_MODES, type ViewModeId } from '@/map/viewModes'
import {
  SOURCE_PACKS,
  getPack,
  hasKey,
  type SourcePack,
  type SourcePackId,
} from '@/map/sources'
import {
  useMapMode,
  useMapPack,
  useMapReady,
  useMapError,
  usePhotorealAttribution,
  usePhotorealRoute,
  usePhotorealTiles,
  setMapMode,
  setMapPack,
} from '@/state/mapView'

const optionClass = (active: boolean) =>
  cn(
    'flex cursor-pointer flex-col gap-0.5 rounded-sm border p-2 text-left',
    'transition-colors duration-(--duration-fast) ease-out',
    active
      ? 'border-border-strong bg-state-selected text-text'
      : 'border-border-faint text-text-secondary hover:bg-state-hover hover:text-text',
  )

function ViewModePicker() {
  const mode = useMapMode()

  return (
    <ToggleGroup.Root
      type="single"
      value={mode}
      onValueChange={(value) => value && setMapMode(value as ViewModeId)}
      aria-label="Map view mode"
      className="flex flex-col gap-1"
    >
      {VIEW_MODES.map((item) => (
        <ToggleGroup.Item
          key={item.id}
          value={item.id}
          className={cn(optionClass(item.id === mode), 'flex-row items-center gap-2.5')}
        >
          <span className="shrink-0">
            <Icon icon={item.icon} size="sm" />
          </span>
          <span className="text-xs font-medium">{item.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

/**
 * The badge is the most important thing on each option.
 *
 * An operator choosing a source on an edge node needs to know, before
 * clicking, whether it survives losing the network and whether it will work
 * at all with the credentials present. Both are stated on the control rather
 * than discovered when the map goes blank.
 */
function PackBadges({ pack }: { pack: SourcePack }) {
  const keyed = hasKey(pack)

  return (
    <span className="flex items-center gap-1.5 font-mono text-2xs tabular">
      <span className={pack.offline ? 'text-text-secondary' : 'text-text-tertiary'}>
        {pack.offline ? 'OFFLINE' : 'NEEDS NET'}
      </span>
      {pack.requiresKey ? (
        <span className={keyed ? 'text-text-tertiary' : 'text-text-disabled'}>
          {keyed ? 'KEY OK' : 'KEY REQUIRED'}
        </span>
      ) : null}
    </span>
  )
}

function SourcePicker() {
  const pack = useMapPack()

  return (
    <ToggleGroup.Root
      type="single"
      value={pack}
      onValueChange={(value) => value && setMapPack(value as SourcePackId)}
      aria-label="Map source pack"
      className="flex flex-col gap-1"
    >
      {SOURCE_PACKS.map((item) => (
        <ToggleGroup.Item
          key={item.id}
          value={item.id}
          className={optionClass(item.id === pack)}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium">{item.label}</span>
            <PackBadges pack={item} />
          </span>
          <span className="text-2xs leading-snug text-text-tertiary">
            {item.description}
          </span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

function PackStatus({ packId }: { packId: SourcePackId }) {
  const pack = getPack(packId)
  const terrain = pack.terrain

  return (
    <>
      <StatusRow
        label="Coverage"
        // Corner-pair with hemisphere letters rather than a bare w/s/e/n
        // array: at 10px a leading minus is easy to lose, and confusing east
        // for west puts you on the wrong side of the planet.
        value={pack.bounds ? formatBounds(pack.bounds) : 'Worldwide'}
      />
      {pack.bounds ? (
        <StatusRow label="Span" value={formatBoundsSpan(pack.bounds)} />
      ) : null}

      {terrain ? (
        <>
          <StatusRow
            label="DEM zoom"
            value={formatZoomRange(terrain.minzoom ?? 0, terrain.maxzoom)}
          />
          <StatusRow
            label="DEM detail"
            // The zoom number alone does not say whether a DEM is good
            // enough. Ground resolution at the operating latitude does.
            value={`${formatResolution(terrain.maxzoom, terrain.tileSize, 1.35)} @ 1.35°N`}
          />
          <StatusRow label="DEM encoding" value={terrain.encoding} />
        </>
      ) : (
        <StatusRow
          label="Terrain"
          value={pack.renderer === 'photoreal' ? 'mesh (no DEM)' : 'none'}
        />
      )}
      {pack.needs && pack.needs.length > 0 ? (
        // Naming the hosts answers "why does this need the internet" with a
        // fact rather than a badge.
        <StatusRow label="Fetches from" value={pack.needs.join(', ')} />
      ) : null}
    </>
  )
}

export function MapView() {
  const ready = useMapReady()
  const error = useMapError()
  const packId = useMapPack()
  const photorealAttribution = usePhotorealAttribution()
  const photorealRoute = usePhotorealRoute()
  const photorealTiles = usePhotorealTiles()

  const pack = getPack(packId)

  return (
    <div className="flex flex-col gap-4 p-3">
      <Section title="View mode">
        <ViewModePicker />
      </Section>

      <Section title="Source">
        <SourcePicker />
      </Section>

      <Section title="Annotations">
        <AnnotationList />
      </Section>

      <Section title="Status">
        <div className="flex flex-col gap-1">
          <StatusRow label="Style" value={ready ? 'LOADED' : 'LOADING'} />
          <PackStatus packId={packId} />
          {pack.renderer === 'photoreal' && photorealRoute ? (
            <>
              <StatusRow
                label="Route"
                value={
                  photorealRoute === 'google-direct'
                    ? 'GOOGLE DIRECT'
                    : 'VIA CESIUM ION'
                }
              />
              {/* Tiles pulled is the only spend signal visible in-app. The
                  real cap is a budget set in Google Cloud / the ion console. */}
              <StatusRow
                label="Tiles this session"
                value={photorealTiles.toLocaleString()}
              />
            </>
          ) : null}
        </div>

        {error ? (
          <p className="mt-1 rounded-xs border border-border-faint bg-panel-inset p-2 text-2xs leading-snug text-text-secondary">
            {error}
          </p>
        ) : null}
      </Section>

      {/* Google requires its tileset attribution to be displayed while its
          tiles are on screen. It is a licence condition, not a courtesy. */}
      <p className="text-2xs leading-snug text-text-disabled">
        {photorealAttribution ?? pack.attribution}
      </p>
    </div>
  )
}
