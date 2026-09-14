import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const outputDir = new URL('../artifacts/tuas-3d/', import.meta.url)
const rawVideoDir = new URL('../artifacts/tuas-3d/raw-full-ui/', import.meta.url)
await mkdir(outputDir, { recursive: true })
await mkdir(rawVideoDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({
  viewport: { width: 1600, height: 900 },
  recordVideo: {
    dir: fileURLToPath(rawVideoDir),
    size: { width: 1600, height: 900 },
  },
})
const page = await context.newPage()
const video = page.video()

try {
  await page.goto('http://127.0.0.1:7000/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(4_000)
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.waitForTimeout(1_000)
  const photoreal = page.getByText('Photorealistic Imagery', { exact: true })
  await photoreal.waitFor({ state: 'visible' })
  const sourceText = await photoreal.innerText()
  if (sourceText.includes('KEY REQUIRED')) throw new Error('The running Vite process has not loaded the Google/Cesium credentials')
  await photoreal.click()

  await page.waitForFunction(() => Boolean(window.__cesium), { timeout: 90_000 })
  await page.getByText(/GOOGLE DIRECT|VIA CESIUM ION/).waitFor({ timeout: 90_000 })
  await page.evaluate(() => {
    const viewer = window.__cesium
    const target = viewer.scene.globe.ellipsoid.cartographicToCartesian({
      longitude: 103.6485 * Math.PI / 180,
      latitude: 1.3215 * Math.PI / 180,
      height: 20,
    })
    viewer.camera.lookAt(target, { heading: 0.42, pitch: -0.52, range: 1450 })
  })
  await page.waitForTimeout(30_000)

  await page.getByRole('button', { name: 'Close Map' }).click()
  await page.getByRole('button', { name: 'Close Swarm' }).click()
  await page.waitForTimeout(5_000)

  await page.evaluate(() => {
    const viewer = window.__cesium
    const ellipsoid = viewer.scene.globe.ellipsoid
    const Color = viewer.scene.backgroundColor.constructor
    const friendly = Color.fromCssColorString('#55d6ff')
    const hostile = Color.fromCssColorString('#ff5353')
    const white = Color.fromCssColorString('#ffffff')
    const black = Color.fromCssColorString('#071014')
    const toCartesian = (longitude, latitude, height) => ellipsoid.cartographicToCartesian({
      longitude: longitude * Math.PI / 180,
      latitude: latitude * Math.PI / 180,
      height,
    })
    const friendlyTracks = Array.from({ length: 10 }, (_, index) => ({
      id: `F-${String(index + 1).padStart(2, '0')}`,
      longitude: 103.651 + (index % 5) * 0.0009,
      latitude: 1.3185 + Math.floor(index / 5) * 0.003,
      height: 220 + (index % 4) * 45,
    }))
    const hostileTracks = Array.from({ length: 10 }, (_, index) => ({
      id: `H-${String(index + 1).padStart(2, '0')}`,
      longitude: 103.6438 + (index % 5) * 0.0009,
      latitude: 1.319 + Math.floor(index / 5) * 0.003,
      height: 240 + (index % 4) * 45,
    }))
    const simulatedTracks = []
    const addTrack = (track, color, headingDelta, side, index) => {
      const position = toCartesian(track.longitude, track.latitude, track.height)
      const destination = toCartesian(track.longitude + headingDelta, track.latitude, track.height - 25)
      const entity = viewer.entities.add({
        position,
        point: {
          pixelSize: 13,
          color,
          outlineColor: white,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: track.id,
          font: '700 12px monospace',
          fillColor: color,
          outlineColor: black,
          outlineWidth: 4,
          style: 2,
          pixelOffset: { x: 0, y: -20 },
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        polyline: {
          positions: [position, destination],
          width: 2,
          material: color.withAlpha(0.72),
          depthFailMaterial: color.withAlpha(0.42),
        },
      })
      simulatedTracks.push({ entity, track, side, index })
    }
    friendlyTracks.forEach((track, index) => addTrack(track, friendly, -0.0015, -1, index))
    hostileTracks.forEach((track, index) => addTrack(track, hostile, 0.0015, 1, index))
    viewer.entities.add({
      position: toCartesian(103.6485, 1.3215, 30),
      ellipse: {
        semiMajorAxis: 340,
        semiMinorAxis: 340,
        material: white.withAlpha(0.08),
        outline: true,
        outlineColor: white.withAlpha(0.65),
        height: 35,
      },
    })

    const legend = document.createElement('div')
    legend.id = 'tuas-scenario-legend'
    legend.style.cssText = 'position:absolute;z-index:1000;left:62px;top:56px;width:350px;background:rgba(10,13,16,.92);border:1px solid rgba(255,255,255,.25);padding:13px 15px;color:white;font:12px monospace;letter-spacing:.06em;box-shadow:0 8px 26px rgba(0,0,0,.35);pointer-events:none'
    legend.innerHTML = '<strong style="font-size:14px">TUAS 10 × 10</strong><div style="margin-top:8px;color:#55d6ff">● 10 FRIENDLY INTERCEPTORS</div><div style="margin-top:4px;color:#ff5353">● 10 HOSTILE TRACKS</div><div id="tuas-phase" style="margin-top:8px;color:#fff">READY · T+0.0s</div><div style="margin-top:6px;color:#aeb6bd;font-size:10px">SIMULATION OVERLAY · NOT LIVE TELEMETRY</div>'
    document.body.appendChild(legend)

    window.__runTuasScenario = () => new Promise((resolve) => {
      const duration = 26_000
      let startedAt = null
      const phaseElement = document.querySelector('#tuas-phase')
      const frame = (now) => {
        if (startedAt === null) startedAt = now
        const elapsed = now - startedAt
        const progress = Math.min(1, elapsed / duration)
        const phase = progress < 0.38 ? 'INGRESS' : progress < 0.72 ? 'CONVERGENCE' : 'CROSSING'
        phaseElement.textContent = `${phase} · T+${(elapsed / 1000).toFixed(1)}s`
        simulatedTracks.forEach(({ entity, track, side, index }) => {
          const travel = 0.0046 * progress * side
          const latitudeWave = Math.sin(progress * Math.PI * 2 + index * 0.55) * 0.00035
          const heightWave = Math.sin(progress * Math.PI * 2 + index) * 28
          const longitude = track.longitude + travel
          const latitude = track.latitude + latitudeWave
          const height = track.height + heightWave
          const position = toCartesian(longitude, latitude, height)
          const tail = toCartesian(longitude - side * 0.0012, latitude, height - 18)
          entity.position = position
          entity.polyline.positions = [tail, position]
        })
        if (progress < 1) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
  })

  await page.waitForTimeout(5_000)
  await page.evaluate(() => window.__runTuasScenario())
  await page.waitForTimeout(1_500)
} finally {
  await context.close()
  const rawPath = fileURLToPath(new URL('tuas-10v10-sentinel-full-session.webm', outputDir))
  await video.saveAs(rawPath)
  await browser.close()
  console.log(rawPath)
}
