import type { LucideIcon, LucideProps } from 'lucide-react'

/**
 * Icon rendering, tuned in one place.
 *
 * Every icon in the console goes through here so sharpness is a single edit
 * rather than a hunt through call sites.
 *
 * WHY THESE NUMBERS
 * lucide draws on a 24-unit grid. `absoluteStrokeWidth` makes lucide solve
 * stroke-width so the *rendered* stroke is `stroke` CSS px regardless of
 * `size`, instead of scaling the stroke down with the icon — without it, an
 * 18px icon at strokeWidth 1.5 renders a 1.125px line, which is guaranteed
 * to straddle a pixel boundary at any DPI.
 *
 * Size is 20 rather than 18: at a fixed stroke, a larger glyph spends more
 * device pixels on the shape itself, so the detail resolves rather than
 * smearing. 20 in a 32px hit target leaves a 6px inset, which is the density
 * an activity bar wants.
 *
 * `shapeRendering="geometricPrecision"` stops the renderer trading curve
 * accuracy for speed — these are static chrome icons, there is no frame
 * budget to protect.
 *
 * On very high-DPI displays no CSS stroke resolves to whole device pixels
 * (at 1.75x, 1.5px is 2.625 device px). Contrast is what carries perceived
 * sharpness there, which is why inactive icons sit at --color-text-secondary
 * and not the dimmer tertiary ramp.
 */
export const ICON_SIZES = {
  /** Inline controls: panel close, chevrons, row affordances. */
  sm: 14,
  /** Chrome: icon rail, cursor-mode palette. */
  md: 20,
} as const

export type IconSize = keyof typeof ICON_SIZES

/** Rendered stroke in CSS pixels, held constant across every size. */
export const ICON_STROKE = 1.5

interface IconProps extends Omit<LucideProps, 'size' | 'strokeWidth'> {
  icon: LucideIcon
  size?: IconSize
}

export function Icon({ icon: Glyph, size = 'md', ...props }: IconProps) {
  return (
    <Glyph
      size={ICON_SIZES[size]}
      strokeWidth={ICON_STROKE}
      absoluteStrokeWidth
      shapeRendering="geometricPrecision"
      {...props}
    />
  )
}
