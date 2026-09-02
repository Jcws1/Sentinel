import { useEffect } from 'react'

import { matchKeybinding } from './keybindings'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * Dispatches global keybindings.
 *
 * Deliberately thin: what each key does lives in keybindings.ts, so adding a
 * shortcut never means touching this file. All this owns is the typing guard
 * — without it the bare-letter cursor-mode keys would fire while an operator
 * types into a filter box.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat) return
      if (isTypingTarget(event.target)) return

      const binding = matchKeybinding(event)
      if (!binding) return

      event.preventDefault()
      binding.run()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
