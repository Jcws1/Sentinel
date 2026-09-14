import { mkdir, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = new URL(`../artifacts/sentinel-wedgetail-live/${runId}/`, import.meta.url)
const outputPath = fileURLToPath(outputDir)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: false,
  args: ['--enable-webgl', '--ignore-gpu-blocklist'],
})

const sentinelContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outputPath, size: { width: 1280, height: 720 } },
})
const simulatorContext = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outputPath, size: { width: 1280, height: 720 } },
})

// The simulator pins Three.js 0.128.0 on jsDelivr, whose certificate is
// rejected on this host. Route those exact assets to the same version on
// unpkg so the vendor viewer can render; no simulator behavior is replaced.
await simulatorContext.route('https://cdn.jsdelivr.net/**', async (route) => {
  const alternateUrl = route.request().url().replace('https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/')
  await route.continue({ url: alternateUrl })
})

const sentinel = await sentinelContext.newPage()
const simulator = await simulatorContext.newPage()
const sentinelVideo = sentinel.video()
const simulatorVideo = simulator.video()
const apiResponses = []

sentinel.on('response', async (response) => {
  if (!response.url().includes('/wedgetail-sandbox/addtarget')) return
  let body = null
  try { body = await response.json() } catch { /* retain status-only evidence */ }
  apiResponses.push({ status: response.status(), body })
})

try {
  await simulator.goto('https://wedgetail-dynamics.com/sim/?livesandbox=true', {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  })
  await simulator.locator('#canvas-container').waitFor({ state: 'visible', timeout: 60_000 })
  await simulator.waitForTimeout(3_000)
  await simulator.screenshot({ path: fileURLToPath(new URL('01-simulator-ready.png', outputDir)) })

  await sentinel.goto('http://127.0.0.1:7000/', { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await sentinel.waitForTimeout(4_000)
  await sentinel.getByRole('button', { name: 'Tasking' }).click()
  await sentinel.getByRole('button', { name: /TASK-WGT-SPLIT/ }).click()
  await sentinel.waitForTimeout(1_500)
  await sentinel.screenshot({ path: fileURLToPath(new URL('02-sentinel-task-ready.png', outputDir)) })

  await sentinel.getByRole('button', { name: 'RUN WEDGETAIL SIM' }).click()
  await sentinel.waitForTimeout(900)
  await sentinel.getByRole('button', { name: 'CONFIRM SANDBOX REQUEST' }).click()
  await sentinel.getByText(/4 synthetic tracks accepted/i).waitFor({ timeout: 30_000 })
  await sentinel.waitForTimeout(2_000)
  await sentinel.screenshot({ path: fileURLToPath(new URL('03-sentinel-api-accepted.png', outputDir)) })

  await sentinel.getByRole('button', { name: 'Events' }).click()
  await sentinel.waitForTimeout(2_000)
  await sentinel.screenshot({ path: fileURLToPath(new URL('04-sentinel-event-ledger.png', outputDir)) })
  await sentinel.waitForTimeout(4_000)

  await sentinelContext.close()
  const sentinelRawPath = await sentinelVideo.path()
  const sentinelPath = fileURLToPath(new URL('sentinel-tasking-and-api-evidence.webm', outputDir))
  await rename(sentinelRawPath, sentinelPath)

  await simulator.waitForTimeout(18_000)
  await simulator.screenshot({ path: fileURLToPath(new URL('05-simulator-engagement.png', outputDir)) })
  await simulator.waitForTimeout(25_000)
  await simulator.screenshot({ path: fileURLToPath(new URL('06-simulator-pursuit.png', outputDir)) })
  await simulator.waitForTimeout(25_000)
  await simulator.screenshot({ path: fileURLToPath(new URL('07-simulator-late-engagement.png', outputDir)) })
  await simulator.waitForTimeout(35_000)
  await simulator.screenshot({ path: fileURLToPath(new URL('08-simulator-resolution.png', outputDir)) })
  await simulator.waitForTimeout(35_000)
  await simulator.screenshot({ path: fileURLToPath(new URL('09-simulator-final.png', outputDir)) })

  await simulatorContext.close()
  const simulatorRawPath = await simulatorVideo.path()
  const simulatorPath = fileURLToPath(new URL('wedgetail-live-engagement.webm', outputDir))
  await rename(simulatorRawPath, simulatorPath)

  await writeFile(new URL('recording-manifest.json', outputDir), `${JSON.stringify({
    recordedAt: new Date().toISOString(),
    scenario: 'Thales littoral source tracks to Wedgetail public sandbox',
    sentinelVideo: 'sentinel-tasking-and-api-evidence.webm',
    simulatorVideo: 'wedgetail-live-engagement.webm',
    apiResponses,
    integrityNote: 'Sentinel displays source-track replay and API acknowledgements only. Interceptor behavior is shown only in the Wedgetail live simulator because the public API exposes no interceptor telemetry.',
  }, null, 2)}\n`)

  console.log(`OUTPUT_DIR=${outputPath}`)
  console.log(`API_RESPONSES=${apiResponses.length}`)
} finally {
  await sentinelContext.close().catch(() => {})
  await simulatorContext.close().catch(() => {})
  await browser.close()
}
