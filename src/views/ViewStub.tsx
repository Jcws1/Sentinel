import type { ReactNode } from 'react'

interface ViewStubProps {
  /** What this view will own once it is built. */
  summary: string
  /** Concrete things that land here, so the slot's scope is not guesswork. */
  contents: string[]
  children?: ReactNode
}

/**
 * Placeholder body for a rail slot that has no implementation yet.
 *
 * It states what the view is for rather than saying "coming soon" — an empty
 * slot in a console should still tell the reader what belongs in it.
 * Deleted per-view as each real view is built.
 */
export function ViewStub({ summary, contents, children }: ViewStubProps) {
  return (
    <div className="flex flex-col gap-4 p-3">
      <p className="text-xs leading-relaxed text-text-secondary">{summary}</p>

      <div className="flex flex-col gap-1.5">
        <div className="label-caps">Planned</div>
        <ul className="flex flex-col gap-1">
          {contents.map((item) => (
            <li
              key={item}
              className="flex gap-2 text-xs text-text-tertiary before:text-text-disabled before:content-['—']"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>

      {children}
    </div>
  )
}
