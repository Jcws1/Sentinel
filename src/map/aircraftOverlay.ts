import maplibregl from 'maplibre-gl'

import { SWARM } from '@/data/swarm'
import { THALES_SPLIT_REPLAY, type SplitReplayKeyframe, type SplitReplayTrack } from '@/data/thalesSplitReplay'
import { operationsStore } from '@/state/operations'

type Coordinate = [number, number]

const WEDGETAIL_BOX: Coordinate = [103.7857, 1.4478]
const THALES_TRACK_START: Coordinate = [103.7857, 1.43565]
const INTERCEPT_POINT: Coordinate = [103.7857, 1.44235]
const SINGLE_FLIGHT_MS = 8_500
const COASTAL_FLIGHT_MS = 20_000

function lerp(start: Coordinate, end: Coordinate, progress: number): Coordinate {
  return [start[0] + (end[0] - start[0]) * progress, start[1] + (end[1] - start[1]) * progress]
}

function markerElement(kind: 'fleet' | 'target' | 'interceptor', label: string) {
  const element = document.createElement('div')
  element.className = `aircraft-marker aircraft-marker--${kind}`
  element.innerHTML = `<span class="aircraft-marker__dot"></span><span class="aircraft-marker__label">${label}</span>`
  return element
}

function swarmElement(initialLabel: string) {
  const element = document.createElement('div')
  element.className = 'coastal-swarm'
  for (let index = 0; index < 32; index += 1) {
    const dot = document.createElement('i')
    const angle = index * Math.PI * (3 - Math.sqrt(5))
    const radius = 7 + Math.sqrt(index / 32) * 36
    dot.style.setProperty('--swarm-x', `${Math.cos(angle) * radius}px`)
    dot.style.setProperty('--swarm-y', `${Math.sin(angle) * radius * 0.58}px`)
    dot.style.animationDelay = `${(index % 8) * -110}ms`
    element.append(dot)
  }
  const label = document.createElement('span')
  label.className = 'coastal-swarm__label'
  label.textContent = initialLabel
  element.append(label)
  return { element, label }
}

function trackFrame(track: SplitReplayTrack, sourceTime: number): { coordinate: Coordinate; objects: number; speedKmh: number } | null {
  const frames = track.keyframes
  if (sourceTime < frames[0].t) return null
  let rightIndex = frames.findIndex((frame) => frame.t >= sourceTime)
  if (rightIndex < 0) rightIndex = frames.length - 1
  if (rightIndex < 1) rightIndex = 1
  const left = frames[rightIndex - 1] as SplitReplayKeyframe
  const right = frames[Math.min(rightIndex, frames.length - 1)] as SplitReplayKeyframe
  const segment = Math.max(1, right.t - left.t)
  const local = Math.min(1, Math.max(0, (sourceTime - left.t) / segment))
  const coordinate = lerp([left.lng, left.lat], [right.lng, right.lat], local)
  const objects = left.estimatedObjects + (right.estimatedObjects - left.estimatedObjects) * local
  const latKm = (right.lat - left.lat) * 111.32
  const lngKm = (right.lng - left.lng) * 111.32 * Math.cos(left.lat * Math.PI / 180)
  const speedKmh = Math.hypot(latKm, lngKm) / (segment / 3600)
  return { coordinate, objects, speedKmh }
}

/** Shows Sentinel source tracks only. Wedgetail's public API does not expose interceptor telemetry. */
export function attachAircraftOverlay(map: maplibregl.Map) {
  const fleetMarkers = SWARM.map((aircraft) => {
    const element = markerElement('fleet', aircraft.designation)
    element.dataset.state = aircraft.state
    return new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([aircraft.position[0], aircraft.position[1]]).addTo(map)
  })

  let runMarkers: maplibregl.Marker[] = []
  let animationFrame = 0
  let activeStartedAt: number | null = null

  function clearRun() {
    if (animationFrame) cancelAnimationFrame(animationFrame)
    animationFrame = 0
    for (const marker of runMarkers) marker.remove()
    runMarkers = []
  }

  function animateSingle(startedAt: number) {
    clearRun()
    const targetElement = markerElement('target', 'THALES-01')
    const targetMarker = new maplibregl.Marker({ element: targetElement, anchor: 'center' }).setLngLat(THALES_TRACK_START).addTo(map)
    runMarkers = [targetMarker]
    map.fitBounds([THALES_TRACK_START, WEDGETAIL_BOX], { padding: { top: 120, right: 390, bottom: 130, left: 430 }, maxZoom: 15, duration: 900 })
    const tick = () => {
      const progress = Math.min(1, Math.max(0, (Date.now() - startedAt) / SINGLE_FLIGHT_MS))
      targetMarker.setLngLat(lerp(THALES_TRACK_START, INTERCEPT_POINT, progress))
      if (progress >= 1) {
        targetElement.classList.add('aircraft-marker--complete')
        return
      }
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
  }

  function animateCoastal(startedAt: number) {
    clearRun()
    const swarmViews = THALES_SPLIT_REPLAY.tracks.map((track) => {
      const { element, label } = swarmElement(track.id)
      if (track.id !== 'MAIN') element.style.display = 'none'
      const first = track.keyframes[0]
      const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat([first.lng, first.lat]).addTo(map)
      return { track, element, label, marker }
    })
    runMarkers = swarmViews.map((view) => view.marker)
    map.fitBounds(THALES_SPLIT_REPLAY.mapBounds, { padding: { top: 120, right: 390, bottom: 110, left: 430 }, duration: 1_200 })
    const tick = () => {
      const now = Date.now()
      const progress = Math.min(1, Math.max(0, (now - startedAt) / COASTAL_FLIGHT_MS))
      const sourceTime = THALES_SPLIT_REPLAY.startOffsetSeconds + (THALES_SPLIT_REPLAY.durationSeconds - THALES_SPLIT_REPLAY.startOffsetSeconds) * progress
      swarmViews.forEach((view) => {
        const frame = trackFrame(view.track, sourceTime)
        if (!frame) return
        view.element.style.display = ''
        view.marker.setLngLat(frame.coordinate)
        view.label.textContent = `${view.track.id} · ~${Math.round(frame.objects)} OBJECTS · ${Math.round(frame.speedKmh)} KM/H`
      })
      if (progress >= 1) {
        swarmViews.forEach((view) => view.element.classList.add('coastal-swarm--complete'))
        return
      }
      animationFrame = requestAnimationFrame(tick)
    }
    animationFrame = requestAnimationFrame(tick)
  }

  const sync = () => {
    const { startedAt, mode } = operationsStore.get().wedgetail
    if (!startedAt || startedAt === activeStartedAt) return
    activeStartedAt = startedAt
    if (mode === 'coastal') animateCoastal(startedAt)
    else animateSingle(startedAt)
  }
  sync()
  const unsubscribe = operationsStore.subscribe(sync)
  return () => {
    unsubscribe()
    clearRun()
    for (const marker of fleetMarkers) marker.remove()
  }
}
