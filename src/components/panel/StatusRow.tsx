/**
 * The house key/value readout.
 *
 * Monospace, tabular and right-aligned so a column of them lines up on the
 * digit and does not jitter when a value ticks in place. `select-text` opts
 * back in against the global user-select:none — an operator reading a
 * coordinate off the screen needs to be able to copy it.
 */
export function StatusRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-2xs text-text-tertiary">{label}</span>
      <span className="text-right font-mono text-2xs tabular text-text-secondary select-text">
        {value}
      </span>
    </div>
  )
}
