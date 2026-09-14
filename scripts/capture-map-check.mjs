import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://127.0.0.1:7000/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(6000)
await page.screenshot({ path: 'artifacts/wedgetail-e2e/map-check.png' })
console.log(JSON.stringify({ title: await page.title(), url: page.url() }))
await browser.close()
