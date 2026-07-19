import { chromium } from 'playwright-core'

const output = process.env.EDGE_SCREENSHOT ?? 'edge-map-check.png'
const deployment = process.env.MAP_DEPLOYMENT ?? 'edge'
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1840, height: 830 }, deviceScaleFactor: 1 })
const errors = []

page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`http ${response.status()}: ${response.url()}`)
})

await page.goto(`http://127.0.0.1:5173/?deployment=${deployment}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector(deployment === 'edge' ? '.maplibregl-canvas' : '.mapboxgl-canvas', { timeout: 20_000 })
await page.waitForTimeout(4_000)
await page.screenshot({ path: output, fullPage: false })

console.log(JSON.stringify({ output, errors }, null, 2))
await browser.close()
