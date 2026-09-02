import { useCallback, useSyncExternalStore } from 'react'

/**
 * Minimal external store.
 *
 * The reason this exists instead of `useState` in a context: telemetry will
 * arrive at ~20Hz for up to 30 entities — ~600 updates/sec. Routing that
 * through React state re-renders a subtree 600 times a second and the console
 * dies. An external store keeps the live value in a ref-like cell and lets
 * each component subscribe to exactly the slice it draws, so a changing
 * altitude readout repaints itself and nothing above it moves.
 *
 * UI state uses the same primitive today. That is deliberate: when the
 * telemetry store lands it plugs into the identical `useStoreValue` /
 * `useStoreSelector` call sites, so nothing downstream has to be rewritten.
 */
export interface Store<T> {
  get(): T
  set(next: T | ((prev: T) => T)): void
  subscribe(listener: () => void): () => void
}

export function createStore<T>(initial: T): Store<T> {
  let value = initial
  const listeners = new Set<() => void>()

  return {
    get: () => value,

    set(next) {
      const resolved =
        typeof next === 'function' ? (next as (prev: T) => T)(value) : next

      // Bail on no-op writes. At 20Hz most fields are unchanged frame to
      // frame, and notifying on an identical value is the cheapest render to
      // never do.
      if (Object.is(resolved, value)) return

      value = resolved
      for (const listener of listeners) listener()
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Subscribe to a derived slice, outside React.
 *
 * The listener runs only when `selector`'s result actually changes, which is
 * what makes it safe for a subscriber that also writes to the same store.
 * Subscribing to the raw store in that situation is a re-entrancy trap: the
 * write re-notifies the writer, which writes again. That produced an infinite
 * style-reload loop in MapCanvas once already.
 *
 * `selector` must return a primitive or a stable reference, for the same
 * reason as `useStoreSelector`.
 */
export function subscribeSelector<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
  listener: (selection: S) => void,
): () => void {
  let previous = selector(store.get())
  return store.subscribe(() => {
    const next = selector(store.get())
    if (Object.is(next, previous)) return
    previous = next
    listener(next)
  })
}

/** Subscribe to a store's whole value. */
export function useStoreValue<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

/**
 * Subscribe to one slice of a store.
 *
 * `selector` must return a primitive or a stable reference — it runs on every
 * notification and React compares the result with `Object.is` to decide
 * whether to re-render. Returning a fresh object or array from here will
 * re-render on every tick and defeat the point of the store.
 */
export function useStoreSelector<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
): S {
  const getSelection = useCallback(
    () => selector(store.get()),
    [store, selector],
  )
  return useSyncExternalStore(store.subscribe, getSelection, getSelection)
}
