// Headless screenshots inside an emulated WebXR session: Meta's Immersive Web Emulation Runtime (IWER) stands in for
// a Quest 3, so the glass layout, the tabletop model and the Origin and Inside placements can be checked without a
// headset. The runtime is installed before the page's modules run (the app reads navigator.xr once, at load).
//
//   node scripts/xrshot.mjs URL out.png [--pre "js"]... [--eval "js"]...
//
// Each --pre runs before Enter VR (e.g. a seated head: `dev.position.set(0, 1.2, 0)`), each --eval after it (e.g. look
// up: `dev.quaternion.set(Math.sin(0.5), 0, 0, Math.cos(0.5))`); `dev` is the emulated headset.
import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const IWER = 'https://cdn.jsdelivr.net/npm/iwer@2.1.1/build/iwer.min.js';
const args = process.argv.slice(2);
const [url, out] = args;
const all = name => args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));

const runtime = await (await fetch(IWER)).text();
const chrome = await launch({ flags: ['--force-prefers-reduced-motion'] });
try {
  const { send, evaluate, waitFor } = chrome;
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 800, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `${runtime}\n;window.dev = new IWER.XRDevice(IWER.metaQuest3); window.dev.installRuntime();`,
  });
  await send('Page.navigate', { url });
  if (!(await waitFor('window.starscape', 15000))) console.error('not ready');
  await sleep(1000);
  for (const expression of all('--pre')) await evaluate(expression);
  await evaluate(`document.getElementById('xr-vr').click()`);
  await sleep(2500);
  if (!(await evaluate(`document.body.classList.contains('immersive')`))) console.error('the session did not start');
  for (const expression of all('--eval')) {
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
