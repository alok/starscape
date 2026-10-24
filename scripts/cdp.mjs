// A headless Chrome driven over the DevTools protocol, shared by scripts/shoot.mjs and scripts/film.mjs.
//
//   const chrome = await launch({ flags: ['--force-prefers-reduced-motion'] });
//   await chrome.send('Page.navigate', { url });
//   await chrome.waitFor('window.starscape');
//   chrome.close();
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch({ flags = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'starscape-chrome-'));
  const proc = spawn(CHROME, ['--headless=new', '--use-angle=metal', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
    '--hide-scrollbars', '--no-first-run', ...flags, 'about:blank'], { stdio: 'ignore' });
  const close = async () => { proc.kill(); await sleep(300); rmSync(dir, { recursive: true, force: true }); };
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
    /** Evaluate an expression in the page (awaiting promises); returns its value, or throws the page's exception. */
    const evaluate = async expression => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.error) throw new Error(r.error.message);
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
      return r.result.result.value;
    };
    /** Poll until `expression` is truthy, up to `ms`. */
    const waitFor = async (expression, ms = 12000) => {
      for (const deadline = Date.now() + ms; Date.now() < deadline; await sleep(200))
        if (await evaluate(`!!(${expression})`).catch(() => false)) return true;
      return false;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    return { send, evaluate, waitFor, close: async () => { ws.close(); await close(); } };
  } catch (e) {
    await close();
    throw e;
  }
}
