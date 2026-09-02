import { useState } from 'react'
import { Ruler, PenTool, MapPin, X, type LucideIcon } from 'lucide-react'

import { Icon } from '@/components/primitives/Icon'
import { cn } from '@/lib/cn'
import { measurementFor } from '@/map/annotations/geojson'
import type { AnnotationKind } from '@/map/annotations/types'
import {
  useAnnotations,
  removeAnnotation,
  renameAnnotation,
  clearAnnotations,
} from '@/state/annotations'

const KIND_ICON: Record<AnnotationKind, LucideIcon> = {
  measure: Ruler,
  zone: PenTool,
  waypoint: MapPin,
}

/**
 * One row: kind, editable name, readout, delete.
 *
 * The name is an inline input rather than a click-to-edit affordance. Renaming
 * is the whole reason this list exists — a zone called "ZONE 03" tells an
 * operator nothing, and hiding the edit behind a second interaction would make
 * the useful case the slow one.
 */
function AnnotationRow({
  id,
  kind,
  label,
  measurement,
}: {
  id: string
  kind: AnnotationKind
  label: string
  measurement: string
}) {
  const [draft, setDraft] = useState(label)

  return (
    <li className="group flex items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-state-hover">
      <span className="shrink-0 text-text-tertiary">
        <Icon icon={KIND_ICON[kind]} size="sm" />
      </span>

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // Commit on blur and on Enter, not on every keystroke: a store write
        // per character would repaint the map's label layer as you type.
        onBlur={() => renameAnnotation(id, draft.trim() || label)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setDraft(label)
            e.currentTarget.blur()
          }
          // The global bindings are bare letters; without this, typing a name
          // containing "v" or "g" would switch cursor mode mid-word.
          e.stopPropagation()
        }}
        aria-label={`Rename ${label}`}
        className={cn(
          'min-w-0 flex-1 rounded-xs bg-transparent px-1 py-0.5 text-xs text-text',
          'border border-transparent hover:border-border-faint',
          'focus:border-border focus:bg-panel-inset focus:outline-none',
        )}
      />

      {measurement ? (
        <span className="shrink-0 font-mono text-2xs tabular text-text-tertiary">
          {measurement}
        </span>
      ) : null}

      <button
        type="button"
        onClick={() => removeAnnotation(id)}
        aria-label={`Delete ${label}`}
        className={cn(
          'grid size-5 shrink-0 cursor-pointer place-items-center rounded-xs',
          'text-text-disabled transition-colors duration-(--duration-fast)',
          'hover:bg-state-hover hover:text-text',
          // Revealed on hover so a list of ten zones is not a wall of X's,
          // but kept in the tab order for keyboard users.
          'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      >
        <Icon icon={X} size="sm" />
      </button>
    </li>
  )
}

export function AnnotationList() {
  const annotations = useAnnotations()

  if (annotations.length === 0) {
    return (
      <p className="text-2xs leading-snug text-text-tertiary">
        None yet. Pick Measure, Draw zone or Waypoint from the palette, then
        click on the map. Double-click ends a path; Escape cancels.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col">
        {annotations.map((a) => (
          <AnnotationRow
            key={a.id}
            id={a.id}
            kind={a.kind}
            label={a.label}
            measurement={measurementFor(a)}
          />
        ))}
      </ul>

      <button
        type="button"
        onClick={clearAnnotations}
        className={cn(
          'mt-1 cursor-pointer self-start rounded-xs px-1.5 py-1 text-2xs',
          'text-text-tertiary transition-colors duration-(--duration-fast)',
          'hover:bg-state-hover hover:text-text',
        )}
      >
        Clear all ({annotations.length})
      </button>
    </div>
  )
}
