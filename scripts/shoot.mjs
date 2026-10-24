// Headless screenshots at exact viewport sizes. Chrome's headless window has a minimum width (~500px), so a
// `--window-size=390,844` capture is really a cropped 500px layout; device emulation over CDP gives the true one.
//
//   node scripts/shoot.mjs URL out.png [--size 390x844] [--mobile] [--ready "js"] [--wait 12000] [--eval "js"]...
//
// It waits up to --wait ms for --ready (default `window.starscape`) to be truthy, then 1.5 s for frames to settle.
// Each --eval then runs in order (awaiting promises), followed by a 1.2 s settle; page errors go to stderr.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const [url, out] = args;
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const [width, height] = opt('--size', '1440x900').split('x').map(Number);
const mobile = args.includes('--mobile');
const evals = args.flatMap((a, i) => (a === '--eval' ? [args[i + 1]] : []));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dir = mkdtempSync(join(tmpdir(), 'starscape-shoot-'));
const chrome = spawn(CHROME, ['--headless=new', '--use-angle=metal', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
  '--force-prefers-reduced-motion', '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });

try {
  let port;
  for (let i = 0; i < 150 && !port; i++) {
    await sleep(100);
    const f = join(dir, 'DevToolsActivePort');
    if (existsSync(f)) port = readFileSync(f, 'utf8').split('\n')[0];
  }
  if (!port) throw new Error('Chrome did not open a DevTools port');
  const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let next = 0;
  const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.exceptionThrown') console.error('page error:', m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type))
      console.error(`console.${m.params.type}:`, m.params.args.map(a => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++next;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  // Wait until the app is up (--ready, default window.starscape), then let a few frames settle.
  // Headless Chrome occasionally stalls a module graph mid-load, so a page that never gets ready is reloaded once.
  const ready = opt('--ready', 'window.starscape');
  const waitReady = async ms => {
    for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(200)) {
      const r = await send('Runtime.evaluate', { expression: `!!(${ready})`, returnByValue: true });
      if (r.result?.result?.value) return true;
    }
    return false;
  };
  const wait = +opt('--wait', '12000');
  if (!(await waitReady(wait))) {
    console.error('not ready; reloading');
    await send('Page.reload', { ignoreCache: true });
    if (!(await waitReady(wait))) console.error('still not ready');
  }
  await sleep(1500);
  for (const expression of evals) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) console.error('eval failed:', r.result.exceptionDetails.exception?.description);
    else if (r.result?.result?.value !== undefined) console.log(JSON.stringify(r.result.result.value));
    await sleep(1200);
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(dir, { recursive: true, force: true });
}
