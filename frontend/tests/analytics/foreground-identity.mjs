import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
/** Read-only OS corroboration of Playwright's task browser; DOM focus is insufficient. */
export async function foregroundIdentity(browser, page) {
  await page.bringToFront();
  if (process.env.PHASE6_FOREGROUND_WAIT)
    await sleep(Number(process.env.PHASE6_FOREGROUND_WAIT));
  const native = JSON.parse(
    execFileSync(
      resolve('../backend/.venv/Scripts/python.exe'),
      [resolve('../scripts/foreground_identity.py')],
      { encoding: 'utf8', windowsHide: true },
    ),
  );
  const cdp = await browser.newBrowserCDPSession();
  const processes = await cdp.send('SystemInfo.getProcessInfo');
  await cdp.detach();
  const belongs = processes.processInfo.some(
    (p) => Number(p.id) === native.pid,
  );
  if (!belongs || !native.title.startsWith('Sentinel'))
    throw Error(
      `Task browser is not OS foreground (hwnd ${native.hwnd}, PID match ${belongs})`,
    );
  return {
    ...native,
    taskBrowserPidMatched: true,
    checkedAt: new Date().toISOString(),
  };
}
