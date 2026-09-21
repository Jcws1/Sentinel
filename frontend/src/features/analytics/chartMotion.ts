/** Coalesce chart work on accumulated 120 Hz deadlines, sampled by the display clock.
 * Current marker motion avoids full chart-model updates. Missed deadlines are
 * skipped, never replayed. Every paint samples the
 * actual owner-window clock, including the final update after source motion stops.
 */
export function createChartMotion(
  owner: Pick<
    Window,
    'requestAnimationFrame' | 'cancelAnimationFrame' | 'performance'
  >,
  paint: (now: number) => void,
) {
  const interval = 1000 / 120;
  // Fractional display periods accumulate floating-point error. A sub-microsecond
  // tolerance prevents an exact 120 Hz tick from being treated as a frame early.
  const tolerance = 0.000001;
  let pending = 0,
    deadline = -Infinity,
    generation = 0,
    disposed = false;
  const reset = () => {
    generation++;
    owner.cancelAnimationFrame(pending);
    pending = 0;
    deadline = -Infinity;
  };
  const update = () => {
    if (disposed || pending) return;
    const expected = generation;
    pending = owner.requestAnimationFrame(() => {
      if (disposed || expected !== generation) return;
      pending = 0;
      const now = owner.performance.now();
      if (now + tolerance < deadline) {
        update();
        return;
      }
      deadline = Number.isFinite(deadline)
        ? deadline +
          (Math.floor((now - deadline + tolerance) / interval) + 1) * interval
        : now + interval;
      paint(now);
    });
  };
  return {
    update,
    reset,
    dispose() {
      disposed = true;
      reset();
    },
  };
}
