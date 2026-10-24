// Headless screenshots at exact viewport sizes. Chrome's headless window has a minimum width (~500px), so a
// `--window-size=390,844` capture is really a cropped 500px layout; device emulation over CDP gives the true one.
//
//   node scripts/shoot.mjs URL out.png [--size 390x844] [--mobile] [--ready "js"] [--wait 12000] [--eval "js"]...
//
// It waits up to --wait ms for --ready (default `window.starscape`) to be truthy, then 1.5 s for frames to settle.
// Each --eval then runs in order (awaiting promises), followed by a 1.2 s settle; page errors go to stderr.
import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const [width, height] = opt('--size', '1440x900').split('x').map(Number);
const mobile = args.includes('--mobile');
const evals = args.flatMap((a, i) => (a === '--eval' ? [args[i + 1]] : []));

const chrome = await launch({ flags: ['--force-prefers-reduced-motion'] });
try {
  const { send, evaluate, waitFor } = chrome;
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.navigate', { url });
  // Headless Chrome occasionally stalls a module graph mid-load, so a page that never gets ready is reloaded once.
  const ready = opt('--ready', 'window.starscape'), wait = +opt('--wait', '12000');
  if (!(await waitFor(ready, wait))) {
    console.error('not ready; reloading');
    await send('Page.reload', { ignoreCache: true });
    if (!(await waitFor(ready, wait))) console.error('still not ready');
  }
  await sleep(1500);
  for (const expression of evals) {
    try {
      const value = await evaluate(expression);
      if (value !== undefined) console.log(JSON.stringify(value));
    } catch (e) { console.error('eval failed:', e.message); }
    await sleep(1200);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
} finally {
  await chrome.close();
}
