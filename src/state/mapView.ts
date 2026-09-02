import { createStore, useStoreSelector } from './createStore'
import { DEFAULT_VIEW_MODE, type ViewModeId } from '@/map/viewModes'
import { defaultPack, type SourcePackId } from '@/map/sources'

export interface MapViewState {
  mode: ViewModeId
  pack: SourcePackId
  /** Set once MapLibre reports the style loaded, so the UI can say so. */
  ready: boolean
  /** Populated when a source fails; surfaced in the Map panel. */
  error: string | null
  /**
   * Live attribution from the photoreal tileset. Google returns per-tile
   * copyright that changes as the camera crosses differently-sourced
   * captures, and displaying it is a licence condition — so it is state, not
   * a constant.
   */
  photorealAttribution: string | null
  /** Which route served the photoreal mesh: 'google-direct' | 'cesium-ion'. */
  photorealRoute: string | null
  /** Tiles pulled this session — the visible proxy for API spend. */
  photorealTiles: number
}

export const mapViewStore = createStore<MapViewState>({
  mode: DEFAULT_VIEW_MODE,
  pack: defaultPack(),
  ready: false,
  error: null,
  photorealAttribution: null,
  photorealRoute: null,
  photorealTiles: 0,
})

export function useMapMode() {
  return useStoreSelector(mapViewStore, (s) => s.mode)
}

export function useMapPack() {
  return useStoreSelector(mapViewStore, (s) => s.pack)
}

export function useMapReady() {
  return useStoreSelector(mapViewStore, (s) => s.ready)
}

export function useMapError() {
  return useStoreSelector(mapViewStore, (s) => s.error)
}

export function setMapMode(mode: ViewModeId) {
  if (mapViewStore.get().mode === mode) return
  mapViewStore.set((s) => ({ ...s, mode }))
}

export function setMapPack(pack: SourcePackId) {
  if (mapViewStore.get().pack === pack) return
  // Changing the pack reloads the whole style, so readiness resets with it.
  // The error is NOT cleared here: when this is called to revert a failed
  // selection, the reason for the revert has to outlive it.
  mapViewStore.set((s) => ({ ...s, pack, ready: false }))
}

export function setMapReady(ready: boolean) {
  mapViewStore.set((s) => (s.ready === ready ? s : { ...s, ready }))
}

export function setMapError(error: string | null) {
  mapViewStore.set((s) => (s.error === error ? s : { ...s, error }))
}

export function usePhotorealAttribution() {
  return useStoreSelector(mapViewStore, (s) => s.photorealAttribution)
}

export function usePhotorealRoute() {
  return useStoreSelector(mapViewStore, (s) => s.photorealRoute)
}

export function usePhotorealTiles() {
  return useStoreSelector(mapViewStore, (s) => s.photorealTiles)
}

export function setPhotorealRoute(route: string | null) {
  mapViewStore.set((s) =>
    s.photorealRoute === route ? s : { ...s, photorealRoute: route, photorealTiles: 0 },
  )
}

export function setPhotorealTiles(count: number) {
  mapViewStore.set((s) =>
    s.photorealTiles === count ? s : { ...s, photorealTiles: count },
  )
}

export function setPhotorealAttribution(html: string | null) {
  mapViewStore.set((s) =>
    s.photorealAttribution === html ? s : { ...s, photorealAttribution: html },
  )
}
