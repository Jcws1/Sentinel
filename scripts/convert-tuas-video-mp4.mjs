import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'file:///C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'

const inputPath = fileURLToPath(new URL('../artifacts/tuas-3d/tuas-10v10-sentinel-photoreal-animation.webm', import.meta.url))
const outputPath = fileURLToPath(new URL('../artifacts/tuas-3d/tuas-10v10-sentinel-photoreal-animation.mp4', import.meta.url))

const browser = await chromium.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
})
const page = await browser.newPage()

try {
  await page.goto(pathToFileURL(inputPath).href)
  await page.locator('video').waitFor({ state: 'visible' })
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 })
  const mimeType = await page.evaluate(async () => {
    const video = document.querySelector('video')
    const candidates = [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4;codecs=avc1',
      'video/mp4',
    ]
    const selected = candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
    if (!selected) throw new Error('This Edge build cannot encode MP4 through MediaRecorder')

    await new Promise((resolve) => {
      if (video.readyState >= 1) resolve()
      else video.addEventListener('loadedmetadata', resolve, { once: true })
    })
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    const recorder = new MediaRecorder(canvas.captureStream(30), {
      mimeType: selected,
      videoBitsPerSecond: 8_000_000,
    })
    const chunks = []
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: selected })
      const anchor = document.createElement('a')
      anchor.href = URL.createObjectURL(blob)
      anchor.download = 'tuas-10v10-sentinel-photoreal-animation.mp4'
      anchor.click()
    }

    video.controls = false
    video.muted = true
    video.currentTime = 0
    recorder.start(500)
    await video.play()
    await new Promise((resolve) => {
      const draw = () => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        if (video.ended) resolve()
        else requestAnimationFrame(draw)
      }
      requestAnimationFrame(draw)
    })
    recorder.stop()
    return selected
  })

  const download = await downloadPromise
  await download.saveAs(outputPath)
  console.log(`MIME=${mimeType}`)
  console.log(outputPath)
} finally {
  await browser.close()
}
