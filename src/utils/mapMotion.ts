/** Map camera duration — instant when operator prefers reduced motion. */
export function mapMotionDuration(reducedMotion: boolean, normalMs: number): number {
  return reducedMotion ? 0 : normalMs
}
