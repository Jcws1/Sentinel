import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const outputDir = new URL('../artifacts/scenario-04-demo/', import.meta.url)
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
  await page.waitForTimeout(5_000)

  await page.getByRole('button', { name: 'Scenarios' }).click()
  const scenario = page.locator('article').filter({ hasText: 'Thales coastal split' })
  await scenario.getByRole('button', { name: /STAGE/ }).click()
  await page.waitForTimeout(2_000)
  await page.screenshot({ path: fileURLToPath(new URL('01-scenario-staged.png', outputDir)) })

  await page.getByRole('button', { name: 'Tasking' }).click()
  await page.getByRole('button', { name: /TASK-WGT-SPLIT/ }).click()
  await page.waitForTimeout(1_500)
  await page.getByRole('button', { name: 'RUN WEDGETAIL SIM' }).click()
  await page.waitForTimeout(1_000)
  await page.getByRole('button', { name: 'CONFIRM SANDBOX REQUEST' }).click()

  const phase = page.getByTestId('wedgetail-phase')
  await phase.getByText('LAUNCH', { exact: true }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: fileURLToPath(new URL('02-launch.png', outputDir)) })

  await phase.getByText('INTERCEPT', { exact: true }).waitFor({ timeout: 10_000 })
  await page.waitForTimeout(7_000)
  await page.screenshot({ path: fileURLToPath(new URL('03-first-split.png', outputDir)) })
  await page.waitForTimeout(7_000)
  await page.screenshot({ path: fileURLToPath(new URL('04-three-way-pursuit.png', outputDir)) })

  await phase.getByText('COMPLETE', { exact: true }).waitFor({ timeout: 12_000 })
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: fileURLToPath(new URL('05-intercept-complete.png', outputDir)) })

  await page.getByRole('button', { name: 'Events' }).click()
  await page.waitForTimeout(2_000)
  const accepted = await page.getByText(/accepted THALESSPLIT04/).first().innerText()
  await page.screenshot({ path: fileURLToPath(new URL('06-event-ledger.png', outputDir)) })
  await writeFile(new URL('result.json', outputDir), `${JSON.stringify({ completedAt: new Date().toISOString(), scenario: 'Thales SwarmBreakers 04 · perp_dive_split_180_20_100', estimatedObjects: 300, visualizedInterceptors: 3, accepted }, null, 2)}\n`)
  console.log(JSON.stringify({ accepted }))
} finally {
  await context.close()
  const videoPath = await video?.path()
  if (videoPath) console.log(`VIDEO=${videoPath}`)
  await browser.close()
}
