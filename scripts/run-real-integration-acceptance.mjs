import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const sentinelRoot = path.resolve(import.meta.dirname, '..')
const simulatorWsl =
  '/mnt/c/Users/nsf.yusuf/Documents/Codex/2026-07-18/le/outputs/drone-c2-sim'
const reportDir = path.join(sentinelRoot, 'build', 'qa')
const report = {
  startedAt: new Date().toISOString(),
  status: 'RUNNING',
  checks: {},
}
const ipResult = spawnSync(
  'wsl.exe',
  ['-d', 'Drone-C2-Ubuntu-24.04', '-u', 'nsfyusuf', '--', 'hostname', '-I'],
  { encoding: 'utf8', windowsHide: true },
)
const wslIp = ipResult.stdout.trim().split(/\s+/)[0]
if (!wslIp) throw new Error(`Could not resolve simulator WSL IP: ${ipResult.stderr}`)
const gatewayBase = `http://${wslIp}:8080`
const transportResult = spawnSync(
  'wsl.exe',
  [
    '-d',
    'Drone-C2-Ubuntu-24.04',
    '-u',
    'nsfyusuf',
    '--',
    'pgrep',
    '-o',
    '-f',
    'gz sim .*individual_demo.sdf',
  ],
  { encoding: 'utf8', windowsHide: true },
)
const transportPid = transportResult.stdout.trim()
const partitionResult = transportPid
  ? spawnSync(
      'wsl.exe',
      [
        '-d',
        'Drone-C2-Ubuntu-24.04',
        '-u',
        'nsfyusuf',
        '--',
        'strings',
        `/proc/${transportPid}/environ`,
      ],
      { encoding: 'utf8', windowsHide: true },
    )
  : { stdout: '', stderr: transportResult.stderr }
const gzPartition =
  partitionResult.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('GZ_PARTITION='))
    ?.slice('GZ_PARTITION='.length) ?? ''
if (!gzPartition) {
  throw new Error(`Could not discover live Gazebo transport: ${partitionResult.stderr}`)
}

const bashGateway = `
set -e
cd '${simulatorWsl}'
export GZ_PARTITION='${gzPartition}'
export PYTHONPATH="$PWD/src"
exec env SIM_GATEWAY_HOST=0.0.0.0 SIM_GATEWAY_PORT=8080 .venv-px4/bin/python -m drone_c2_sim.gateway
`

const gateway = spawn(
  'wsl.exe',
  [
    '-d',
    'Drone-C2-Ubuntu-24.04',
    '-u',
    'nsfyusuf',
    '--',
    'bash',
    '-lc',
    bashGateway,
  ],
  { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
)
let gatewayLog = ''
gateway.stdout.on('data', (value) => {
  gatewayLog += value
})
gateway.stderr.on('data', (value) => {
  gatewayLog += value
})

let c2 = null
let browser = null
let failure = null

async function waitForJson(url, predicate, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      const value = await response.json()
      if (response.ok && predicate(value)) return value
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError ?? 'condition false'}`)
}

try {
  report.checks.gateway = await waitForJson(
    `${gatewayBase}/v1/handshake`,
    (value) => value.protocol === 'sentinel-sim',
  )

  c2 = spawn(
    'C:\\Program Files\\nodejs\\node.exe',
    ['node_modules/tsx/dist/cli.mjs', 'server/index.ts'],
    {
      cwd: sentinelRoot,
      env: {
        ...process.env,
        C2_HOST: '127.0.0.1',
        C2_PORT: '3101',
        SENTINEL_REQUIRE_PAIRING: '0',
        SIM_GATEWAY_URL: gatewayBase,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  let c2Log = ''
  c2.stdout.on('data', (value) => {
    c2Log += value
  })
  c2.stderr.on('data', (value) => {
    c2Log += value
  })

  report.checks.adapter = await waitForJson(
    'http://127.0.0.1:3101/api/v1/sim/status',
    (value) => value.connected === true && value.compatible === true,
  )
  const state = await waitForJson(
    'http://127.0.0.1:3101/api/v1/sim/state',
    (value) => Array.isArray(value.vehicles) && value.vehicles.length === 4,
  )
  report.checks.vehicleCount = state.vehicles.length

  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  })
  const page = await browser.newPage({
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 1,
  })
  await page.goto('http://127.0.0.1:3101', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Fleet ops' }).click()
  await page.getByRole('heading', { name: 'Fleet Manager' }).waitFor()
  const text = await page.locator('body').innerText()
  const normalizedText = text.toLowerCase()
  for (const expected of [
    'Simulator fleet',
    'Collective autonomy',
    'Operational mission',
    'ADD ASSET',
  ]) {
    if (!normalizedText.includes(expected.toLowerCase())) {
      throw new Error(`Fleet UI is missing ${expected}`)
    }
  }
  const screenshot = path.join(sentinelRoot, 'build', 'real-fleet-landscape.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  const missionPanel = page.locator('.fleet-mission')
  await missionPanel.scrollIntoViewIfNeeded()
  const missionBox = await missionPanel.boundingBox()
  if (
    !missionBox ||
    missionBox.x < 0 ||
    missionBox.x + missionBox.width > 844 ||
    missionBox.y < 0 ||
    missionBox.y >= 390
  ) {
    throw new Error(`Operational mission panel is outside landscape viewport: ${JSON.stringify(missionBox)}`)
  }
  const missionScreenshot = path.join(
    sentinelRoot,
    'build',
    'real-fleet-mission-landscape.png',
  )
  await page.screenshot({ path: missionScreenshot, fullPage: true })
  report.checks.phoneLandscape = {
    viewport: '844x390',
    screenshot,
    missionScreenshot,
    controls: 'PASS',
  }
  report.status = 'PASS'
} catch (error) {
  failure = error
  report.status = 'FAIL'
  report.error = error instanceof Error ? error.message : String(error)
} finally {
  report.finishedAt = new Date().toISOString()
  await mkdir(reportDir, { recursive: true })
  await writeFile(
    path.join(reportDir, 'real-c2-integration.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  if (browser) await browser.close()
  if (c2) c2.kill('SIGTERM')
  gateway.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 500))
  spawnSync(
    'wsl.exe',
    [
      '-d',
      'Drone-C2-Ubuntu-24.04',
      '-u',
      'nsfyusuf',
      '--',
      'pkill',
      '-f',
      'python -m drone_c2_sim.gateway',
    ],
    { windowsHide: true },
  )
}

console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') {
  console.error(gatewayLog)
  throw failure
}
