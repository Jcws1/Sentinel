import { mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const videoPath = fileURLToPath(new URL('../artifacts/tuas-3d/tuas-10v10-sentinel-photoreal-animation.mp4', import.meta.url))
const frameDir = new URL('../artifacts/tuas-3d/video-verification/', import.meta.url)
await mkdir(frameDir, { recursive: true })

const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
try {
  await page.goto(pathToFileURL(videoPath).href)
  const video = page.locator('video')
  await video.waitFor({ state: 'visible' })
  for (const second of [2, 13, 24]) {
    await page.evaluate(async (time) => {
      const element = document.querySelector('video')
      element.currentTime = time
      await new Promise((resolve) => element.addEventListener('seeked', resolve, { once: true }))
    }, second)
    await video.screenshot({ path: fileURLToPath(new URL(`frame-${second}s.png`, frameDir)) })
  }
} finally {
  await browser.close()
}
