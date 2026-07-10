/** True when the event target is operator UI (not the map). */
export function isOperatorUiTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    !!target.closest('[data-operator-ui], .btn, button, a[href]')
  )
}
