import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const API_ROOT = 'https://wedgetail-dynamics.com'
const API_KEY = 'wgtl_sandbox_1a2b3c4d5e6f7g8h9i0j'
const outputDir = new URL('../artifacts/wedgetail-littoral-live/', import.meta.url)
const outputPath = fileURLToPath(outputDir)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: false,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outputPath, size: { width: 1280, height: 720 } },
})
// This host's network rejects jsDelivr's certificate. Route the exact pinned
// Three.js files to the same package/version on a certificate-valid CDN.
await context.route('https://cdn.jsdelivr.net/**', async (route) => {
  const alternateUrl = route.request().url().replace('https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/')
  await route.continue({ url: alternateUrl })
})
const viewer = await context.newPage()
const video = viewer.video()
const diagnostics = []
viewer.on('console', (message) => diagnostics.push({ kind: 'console', type: message.type(), text: message.text() }))
viewer.on('pageerror', (error) => diagnostics.push({ kind: 'pageerror', text: error.message }))
viewer.on('requestfailed', (request) => diagnostics.push({ kind: 'requestfailed', url: request.url(), error: request.failure()?.errorText }))

const targets = [
  { azimuth_d: 20, altitude_d: 7, distance_m: 1500, speed_m_s: 28, direction_d: 205, box_id: 'box_3', label: 'LIT01' },
  { azimuth_d: 335, altitude_d: 6, distance_m: 1350, speed_m_s: 25, direction_d: 155, box_id: 'box_3', label: 'LIT02' },
  { azimuth_d: 95, altitude_d: 8, distance_m: 1450, speed_m_s: 31, direction_d: 275, box_id: 'box_2', label: 'LIT03' },
  { azimuth_d: 175, altitude_d: 5, distance_m: 1250, speed_m_s: 23, direction_d: 355, box_id: 'box_1', label: 'LIT04' },
]

const responses = []
try {
  await viewer.goto(`${API_ROOT}/sim/?livesandbox=true`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  try {
    await viewer.locator('#canvas-container').waitFor({ state: 'visible', timeout: 60_000 })
  } catch (error) {
    await viewer.screenshot({ path: fileURLToPath(new URL('viewer-initialization-failed.png', outputDir)) })
    await writeFile(new URL('viewer-diagnostics.json', outputDir), `${JSON.stringify(diagnostics, null, 2)}\n`)
    throw error
  }
  await viewer.waitForTimeout(3_000)
  await viewer.screenshot({ path: fileURLToPath(new URL('00-viewer-ready.png', outputDir)) })

  const launchpoints = await context.request.get(`${API_ROOT}/sandbox/launchpoints`, {
    headers: { 'X-API-Key': API_KEY, Accept: 'application/json' },
  })
  responses.push({ kind: 'launchpoints', status: launchpoints.status(), body: await launchpoints.json() })

  for (let index = 0; index < targets.length; index += 1) {
    const target = { ...targets[index], unix_timestamp: Math.floor(Date.now() / 1000) }
    const response = await context.request.post(`${API_ROOT}/sandbox/addtarget`, {
      headers: { 'X-API-Key': API_KEY, Accept: 'application/json', 'Content-Type': 'application/json' },
      data: target,
    })
    const body = await response.json()
    responses.push({ kind: 'target', label: target.label, status: response.status(), body })
    console.log(`${target.label}: HTTP ${response.status()} ${body.message ?? ''}`)
    await viewer.waitForTimeout(index === 0 ? 5_000 : 3_000)
    await viewer.screenshot({ path: fileURLToPath(new URL(`0${index + 1}-${target.label.toLowerCase()}.png`, outputDir)) })
  }

  await viewer.waitForTimeout(12_000)
  await viewer.screenshot({ path: fileURLToPath(new URL('05-pursuit.png', outputDir)) })
  await viewer.waitForTimeout(15_000)
  await viewer.screenshot({ path: fileURLToPath(new URL('06-resolution.png', outputDir)) })
  await viewer.waitForTimeout(20_000)
  await viewer.screenshot({ path: fileURLToPath(new URL('07-late-resolution.png', outputDir)) })
  await viewer.waitForTimeout(20_000)
  await viewer.screenshot({ path: fileURLToPath(new URL('08-final-state.png', outputDir)) })
  await writeFile(new URL('api-results.json', outputDir), `${JSON.stringify({ scenario: 'Pulau Ubin littoral perimeter · four low-level tracks', recordedAt: new Date().toISOString(), responses }, null, 2)}\n`)
} finally {
  await context.close()
  const videoPath = await video?.path()
  if (videoPath) console.log(`VIDEO=${videoPath}`)
  await browser.close()
}
