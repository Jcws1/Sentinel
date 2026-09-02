import logoUrl from '@/assets/sentinel-logo.png'

/**
 * Brand cluster: circular insignia plus wordmark.
 *
 * The source PNG is truecolor with **no alpha** — the mark sits on a pure
 * black square. Two consequences drive the markup below:
 *
 * 1. `mix-blend-mode: screen` erases that background. screen(0, backdrop)
 *    returns the backdrop exactly, so every black pixel becomes invisible
 *    while the light mark survives untouched. This is why we do not need a
 *    cut-out PNG, and why the disc colour behind it can be anything.
 * 2. The square is clipped to a circle by the wrapper, giving the medallion
 *    the brief asked for without editing the asset.
 *
 * If the logo is ever re-exported with a real alpha channel, drop the blend
 * mode — with alpha, `screen` would start lightening the disc behind it.
 *
 * SIZING: measured off the asset, the mark's ink occupies only 55% of the
 * source width and 75% of its height — the rest is baked-in padding. So the
 * image box is oversized relative to the disc to claw that back; at 86% of a
 * 28px disc the mark lands ~18px tall, which is where its thin spikes stop
 * dissolving into antialiasing. Re-measure if the asset is ever re-exported
 * with different margins.
 */
export function Brand() {
  return (
    <div className="flex items-center">
      {/* The insignia is centred inside a rail-width column so it sits dead
          centre on the rail below it, whatever the disc size. Tying it to the
          same token means the two cannot drift apart. */}
      <div className="grid w-(--rail-width) shrink-0 place-items-center">
        <div
          className="relative grid size-7 place-items-center overflow-hidden rounded-full border border-border-strong bg-surface-2"
          aria-hidden="true"
        >
          <img
            src={logoUrl}
            alt=""
            className="size-[86%] object-contain mix-blend-screen"
            draggable={false}
          />
        </div>
      </div>

      <span className="text-base font-semibold tracking-[0.14em] text-text uppercase">
        Sentinel
      </span>

      {/* Version sits with the wordmark, not in the status cluster: it
          identifies the build, which is brand, not live state. */}
      <span className="ml-2 font-mono text-2xs tabular text-text-disabled">
        v2
      </span>
    </div>
  )
}
