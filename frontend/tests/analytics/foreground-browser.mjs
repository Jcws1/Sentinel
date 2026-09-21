/* global window */
import { chromium } from '@playwright/test';
import { createServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

/** Capture the existing surface without Playwright viewport preparation, which
 * can relocate the native pointer on a Windows-scaled surface. Foreground and
 * CSS viewport/DPR are checked separately; PNG dimensions may reflect OS scaling.
 */
export async function captureBrowserSurface(page, { path }) {
  const session = await page.context().newCDPSession(page);
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    writeFileSync(path, Buffer.from(data, 'base64'));
  } finally {
    await session.detach();
  }
}

async function localPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/** Fresh task-owned Edge profile with real document focus/visibility.
 * Playwright's ordinary newContext() enables focus emulation in its own CDP
 * session; a second session cannot disable that override. The documented
 * noDefaults CDP connection avoids it for this fresh default context only.
 */
export async function launchForegroundBrowser({
  viewport = { width: 1280, height: 700 },
} = {}) {
  const port = await localPort();
  const server = await chromium.launchServer({
    channel: 'msedge',
    headless: false,
    args: [
      '--window-position=0,0',
      '--remote-debugging-address=127.0.0.1',
      `--remote-debugging-port=${port}`,
    ],
  });
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
      noDefaults: true,
    });
    const context = browser.contexts()[0];
    if (!context) throw Error('Fresh native-focus default context unavailable');
    const insets = new WeakMap();
    const resize = async (page, size) => {
      if (!insets.has(page)) {
        insets.set(
          page,
          await page.evaluate(() => ({
            width: window.outerWidth - window.innerWidth,
            height: window.outerHeight - window.innerHeight,
          })),
        );
      }
      const border = insets.get(page);
      const cdp = await context.newCDPSession(page);
      try {
        const { targetInfo } = await cdp.send('Target.getTargetInfo');
        const { windowId } = await cdp.send('Browser.getWindowForTarget', {
          targetId: targetInfo.targetId,
        });
        await cdp.send('Browser.setWindowBounds', {
          windowId,
          bounds: {
            width: size.width + border.width,
            height: size.height + border.height,
          },
        });
        await page.setViewportSize(size);
      } finally {
        await cdp.detach();
      }
    };
    return {
      browser,
      context,
      resize,
      async newPage() {
        const page = await context.newPage();
        await resize(page, viewport);
        return page;
      },
      async close() {
        try {
          await browser.close();
        } finally {
          await server.close();
        }
      },
    };
  } catch (error) {
    try {
      await browser?.close();
    } finally {
      await server.close();
    }
    throw error;
  }
}
