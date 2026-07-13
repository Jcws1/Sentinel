import { registerPmtilesProtocol } from './pmtilesProtocol'

let swPromise: Promise<ServiceWorkerRegistration | null> | null = null

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (swPromise) return swPromise
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    swPromise = Promise.resolve(null)
    return swPromise
  }

  swPromise = navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      console.info('[sentinel-offline] Service worker registered')
      return reg
    })
    .catch((err) => {
      console.warn('[sentinel-offline] Service worker registration failed:', err)
      return null
    })

  return swPromise
}

/** One-time offline infrastructure bootstrap. */
export async function initOfflineInfrastructure(): Promise<void> {
  registerPmtilesProtocol()
  await registerServiceWorker()
}
