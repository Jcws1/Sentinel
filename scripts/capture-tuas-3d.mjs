import { mkdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const envText = await readFile(new URL('../.env', import.meta.url), 'utf8')
const tokenLine = envText.split(/\r?\n/).find((line) => line.startsWith('VITE_MAPBOX_TOKEN='))
if (!tokenLine) throw new Error('No Mapbox token is configured')
const accessToken = tokenLine.slice('VITE_MAPBOX_TOKEN='.length).trim()

const outputDir = new URL('../artifacts/tuas-3d/', import.meta.url)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

try {
  await page.goto('about:blank')
  await page.addStyleTag({ url: 'https://api.mapbox.com/mapbox-gl-js/v3.14.0/mapbox-gl.css' })
  await page.addScriptTag({ url: 'https://api.mapbox.com/mapbox-gl-js/v3.14.0/mapbox-gl.js' })
  await page.evaluate((token) => {
    document.head.insertAdjacentHTML('beforeend', `<style>
      html, body, #map { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #101418; }
      .title { position: absolute; z-index: 5; left: 36px; top: 32px; padding: 14px 18px; background: rgba(12,16,20,.88); border: 1px solid rgba(255,255,255,.22); color: #fff; font: 600 17px Arial; letter-spacing: .12em; }
      .sub { display: block; margin-top: 6px; color: #9ed3ff; font: 12px Arial; letter-spacing: .08em; }
    </style>`)
    document.body.innerHTML = '<div id="map"></div><div class="title">TUAS INDUSTRIAL ESTATE<span class="sub">3D FACTORY VIEW · SINGAPORE</span></div>'
    window.mapboxgl.accessToken = token
    const map = new window.mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [103.6478, 1.3074],
      zoom: 15.25,
      pitch: 67,
      bearing: -28,
      antialias: true,
      attributionControl: true,
    })
    map.on('style.load', () => {
      map.addLayer({
        id: 'tuas-factory-extrusions',
        type: 'fill-extrusion',
        source: 'composite',
        'source-layer': 'building',
        minzoom: 13,
        paint: {
          'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'height'], 18], 0, '#b8c2c8', 25, '#d8c7a8', 60, '#c7d0d4'],
          'fill-extrusion-height': ['coalesce', ['get', 'height'], 18],
          'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
          'fill-extrusion-opacity': 0.86,
        },
      })
      window.__captureReady = true
    })
  }, accessToken)

  await page.waitForFunction(() => window.__captureReady === true, { timeout: 60_000 })
  await page.waitForTimeout(15_000)
  const outputPath = new URL('tuas-factories-3d.png', outputDir)
  await page.screenshot({ path: fileURLToPath(outputPath) })
  console.log(fileURLToPath(outputPath))
} finally {
  await browser.close()
}
