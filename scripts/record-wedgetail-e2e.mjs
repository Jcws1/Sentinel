import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const outputDir = new URL('../artifacts/wedgetail-e2e/', import.meta.url)
const outputPath = fileURLToPath(outputDir)
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outputPath, size: { width: 1280, height: 720 } },
})
const page = await context.newPage()
const video = page.video()

try {
  await page.goto('http://127.0.0.1:7000/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)

  await page.getByRole('button', { name: 'Tasking' }).click()
  await page.waitForTimeout(1400)

  await page.getByRole('button', { name: /TASK-WGT-01/ }).click()
  await page.waitForTimeout(1400)

  await page.getByRole('button', { name: 'RUN WEDGETAIL SIM' }).click()
  await page.waitForTimeout(1400)
  await page.getByRole('button', { name: 'CONFIRM SANDBOX REQUEST' }).click()

  const phaseBanner = page.getByTestId('wedgetail-phase')
  await phaseBanner.getByText('LAUNCH', { exact: true }).waitFor({ state: 'visible', timeout: 30000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: fileURLToPath(new URL('launch.png', outputDir)), fullPage: false })

  await phaseBanner.getByText('INTERCEPT', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForTimeout(3000)
  await page.screenshot({ path: fileURLToPath(new URL('converging.png', outputDir)), fullPage: false })

  await phaseBanner.getByText('COMPLETE', { exact: true }).waitFor({ state: 'visible', timeout: 12000 })
  await page.waitForTimeout(1200)

  const statusPanel = await page.getByText('WEDGETAIL', { exact: true }).locator('..').innerText()
  await page.screenshot({ path: fileURLToPath(new URL('intercept-complete.png', outputDir)), fullPage: false })

  await page.getByRole('button', { name: 'Events' }).click()
  await page.waitForTimeout(2500)
  const eventText = await page.getByText(/accepted THALES01/).first().innerText()

  const result = {
    completedAt: new Date().toISOString(),
    flow: 'Thales simulator -> Sentinel tasking -> Wedgetail sandbox',
    taskId: 'TASK-WGT-01',
    trackId: 'THALES-01',
    statusPanel,
    eventText,
  }
  await writeFile(new URL('result.json', outputDir), `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify(result))
} finally {
  await context.close()
  const videoPath = await video?.path()
  if (videoPath) console.log(`VIDEO=${videoPath}`)
  await browser.close()
}
