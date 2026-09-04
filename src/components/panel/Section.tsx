import type { ReactNode } from 'react'

/**
 * A labelled block inside a panel body.
 *
 * The label is 10px uppercase and tracked out (see .label-caps): at this
 * density a heading has to be distinguishable from its content by treatment,
 * because there is no room to separate it by size.
 */
export function Section({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="label-caps">{title}</div>
      {children}
    </div>
  )
}
