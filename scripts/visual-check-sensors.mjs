import { chromium } from 'playwright-core'

const output = process.env.SENSORS_SCREENSHOT ?? 'sensor-health-check.png'
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 900 }, deviceScaleFactor: 1 })
const errors = []
const now = Date.now()
const points = Array.from({ length: 12 }, (_, index) => {
  const attemptedAt = new Date(now - (11 - index) * 60 * 60 * 1000).toISOString()
  const failed = index === 4 || index === 9
  return {
    id: index + 1,
    attemptedAt,
    completedAt: new Date(Date.parse(attemptedAt) + (failed ? 180 : 900 + index * 75)).toISOString(),
    status: failed ? 'error' : 'healthy',
    durationMs: failed ? 180 : 900 + index * 75,
    itemCount: failed ? null : 2,
    error: failed ? 'CDSE STAC returned HTTP 503' : null,
  }
})

page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`)
})

await page.route('**/api/v1/sensors/cdse/history?window=30d', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    window: '30d',
    points,
    summary: { total: 12, successful: 10, failed: 2, successRate: 10 / 12, averageDurationMs: 1118 },
  }),
}))
await page.route('**/api/v1/sensors/cdse', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    status: 'healthy',
    lastAttemptAt: points.at(-1).attemptedAt,
    lastSuccessAt: points.at(-1).completedAt,
    lastError: null,
    itemCount: 2,
  }),
}))

await page.goto('http://127.0.0.1:5173/?deployment=edge', { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: 'Sensors' }).click()
await page.waitForSelector('.cdse-poll-graph__point--error', { timeout: 20_000 })
await page.screenshot({ path: output, fullPage: false })

const graphLabel = await page.locator('.cdse-poll-graph').getAttribute('aria-label')
const cdseRow = await page.locator('.sensor-row').filter({ hasText: 'CDSE' }).innerText()
console.log(JSON.stringify({ output, graphLabel, cdseRow, errors }, null, 2))
await browser.close()
