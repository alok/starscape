// Deterministic video of the app. A virtual clock replaces requestAnimationFrame, timers, performance.now and CSS
// animation time, so frame i is rendered at exactly t = i / fps however long the GPU and the screenshot take. A
// timeline module (see scripts/reel.mjs) drives the page with cues, per-frame spans, captions, title cards and a
// pointer that sends real mouse events, and the frames are piped to ffmpeg.
//
//   node scripts/film.mjs scripts/reel.mjs out.mp4 [--fps 60] [--from s] [--to s] [--crf 16] [--scale 1.3333]
//   node scripts/film.mjs scripts/reel.mjs --stills 2,9.5,31 [--dir shots] [--fps 15]
//
// Timeline functions run in the page and are sent as source text, so they cannot close over anything in Node.
// Each receives the context { S, api, rig, state, stars, pane, film } and, for spans, u ∈ [0, 1] and t.
// Pointer keyframes: { t, x, y } or { t, at: ctx => [x, y] } (resolved when the move toward it begins, or every
// frame with `follow: true`), with `down`, `shift` and `hide` holding until the next keyframe and `ease: 'linear'`.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const reel = (await import(pathToFileURL(resolve(args[0])).href)).default;
const stills = opt('--stills', null)?.split(',').map(Number);
const out = stills ? null : args[1];
const fps = +opt('--fps', reel.fps ?? 60), dt = 1 / fps;
const scale = +opt('--scale', reel.scale ?? 1);
const crf = opt('--crf', '16');
const from = +opt('--from', 0), to = Math.min(+opt('--to', reel.duration), reel.duration);

// ---------------------------------------------------------------------------------------------------------------
// In the page, before any of its scripts: the virtual clock. Until `__vt.manual(true)` a real animation frame loop
// advances it with wall time, so the page loads normally; after that it moves only when `__vt.step(ms)` is called.
const CLOCK = `(() => {
  const real = { raf: requestAnimationFrame.bind(window), now: performance.now.bind(performance), dateNow: Date.now };
  let now = real.now(), manual = false, seq = 1, frames = [];
  const timers = new Map(), d0 = real.dateNow() - now;
  performance.now = () => now;
  Date.now = () => d0 + now;
  window.requestAnimationFrame = cb => { const id = seq++; frames.push({ id, cb }); return id; };
  window.cancelAnimationFrame = id => { frames = frames.filter(f => f.id !== id); };
  const timer = every => (fn, ms = 0, ...a) => {
    const id = seq++, wait = Math.max(every ? 1 : 0, Number(ms) || 0);
    timers.set(id, { at: now + wait, every: every ? wait : 0, fn: typeof fn === 'function' ? fn : new Function(fn), a });
    return id;
  };
  window.setTimeout = timer(false); window.setInterval = timer(true);
  window.clearTimeout = window.clearInterval = id => timers.delete(id);
  const run = f => { try { f(); } catch (e) { console.error(e); } };
  function step(ms) {
    const until = now + ms;
    for (;;) {
      let due = null;
      for (const [id, t] of timers) if (t.at <= until && (!due || t.at < due[1].at)) due = [id, t];
      if (!due) break;
      const [id, t] = due;
      now = Math.max(now, t.at);
      if (t.every) t.at += t.every; else timers.delete(id);
      run(() => t.fn(...t.a));
    }
    now = until;
    const fs = frames; frames = [];
    for (const f of fs) run(() => f.cb(now));
    // CSS transitions and animations: paused, and set to the virtual time since each began.
    if (manual) for (const an of document.getAnimations()) {
      if (an.__t0 === undefined) { an.__t0 = now - (an.currentTime ?? 0); an.pause(); }
      const t = now - an.__t0, end = an.effect?.getComputedTiming().endTime ?? Infinity;
      if (t >= end) an.finish(); else an.currentTime = t;
    }
  }
  let last = real.now();
  const auto = () => { if (manual) return; const t = real.now(); step(Math.min(100, t - last)); last = t; real.raf(auto); };
  real.raf(auto);
  window.__vt = {
    step, get now() { return now; },
    manual(on) { manual = on; if (!on) { last = real.now(); real.raf(auto); } },
    /** Resolves after one real frame, by which time queued input has been dispatched. */
    realFrame: () => new Promise(r => real.raf(() => r())),
  };
})();`;

// The film layer: captions, title cards and a drawn cursor (headless screenshots have none), above the app.
const OVERLAY_CSS = `
body.film #chapter, body.film #dock, body.film #help, body.film #settings, body.film #brand { display: none !important; }
body.film:not(.film-readout) #g-readout, body.film:not(.film-inspector) #inspector, body.film:not(.film-roots-head) #roots-head, body.film:not(.film-hud) #inside-hud { display: none !important; }
#film { position: fixed; inset: 0; pointer-events: none; z-index: 1000; }
#film .cap { position: absolute; left: 34px; bottom: 32px; width: min(560px, calc(100vw - var(--pane-w, 0px) - 68px)); padding: 16px 20px 17px;
  border-radius: 14px; background: rgba(6, 9, 18, 0.66); border: 1px solid rgba(160, 185, 230, 0.13); backdrop-filter: blur(10px);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35); opacity: 0; }
body:not(.split) #film .cap { width: min(640px, calc(100vw - 68px)); }
#film .cap.top { bottom: auto; top: 30px; }
/* The app's readout wraps at a third of the 3D view in split; in a film the bottom is free while captions sit on top. */
body.film.split #g-readout { max-width: calc(100vw - var(--pane-w) - 80px) !important; }
/* Captions are wider than the tour card that the app's wide split layout makes room for, so the low inspector card
   would slide under them: keep it at the top, as at narrower widths. */
body.film.split #inspector { top: 120px; bottom: auto; }
#film .kick { font: 600 11.5px/1 var(--sans); letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); }
#film .title { font: 400 29px/1.12 var(--serif); color: #f2f5fb; margin: 9px 0 0; }
#film .body { font: 400 15.5px/1.48 var(--sans); color: rgba(220, 228, 242, 0.86); margin: 8px 0 0; }
#film .body:empty { display: none; }
#film .math { font-family: var(--serif); font-style: italic; font-size: 1.08em; white-space: nowrap; color: #fff; }
#film .card { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; opacity: 0; }
#film .card.solid { background: radial-gradient(120% 90% at 50% 45%, #0a1022 0%, #04060c 60%, #020308 100%); }
#film .cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px; transform: translate(-3px, -2px); opacity: 0;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7)); }
#film .ring { position: absolute; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
  border: 2px solid rgba(255, 213, 138, 0.9); background: rgba(255, 213, 138, 0.12); opacity: 0; }
`;
const CURSOR_SVG = `<svg viewBox="0 0 26 26" width="26" height="26"><path d="M3 2 L3 21 L8.2 16.4 L11.6 24 L15 22.5 L11.7 15.1 L18.6 15.1 Z"
  fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

/** Installs the film layer and helpers; `fns` are the timeline's functions as source. */
const install = ({ css, cursor, captions, cards }) => `(() => {
  const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.append(style);
  document.body.classList.add('film');
  const layer = document.createElement('div'); layer.id = 'film'; document.body.append(layer);
  const caps = ${JSON.stringify(captions)}.map(c => {
    const el = document.createElement('div'); el.className = 'cap' + (c.place === 'top' ? ' top' : '');
    el.innerHTML = '<div class="kick"></div><div class="title"></div><div class="body"></div>';
    el.querySelector('.kick').innerHTML = c.kicker ?? ''; el.querySelector('.title').innerHTML = c.title ?? '';
    el.querySelector('.body').innerHTML = c.body ?? '';
    layer.append(el); return el;
  });
  const cards = ${JSON.stringify(cards)}.map(c => {
    const el = document.createElement('div'); el.className = 'card' + (c.solid ? ' solid' : ''); el.innerHTML = c.html;
    layer.append(el); return el;
  });
  const ring = document.createElement('div'); ring.className = 'ring'; layer.append(ring);
  const cur = document.createElement('div'); cur.className = 'cursor'; cur.innerHTML = ${JSON.stringify(cursor)}; layer.append(cur);
  const shown = new Map();
  const set = (el, o) => { const v = o.toFixed(3); if (shown.get(el) !== v) { el.style.opacity = v; shown.set(el, v); } };
  window.__film = {
    ctx() {
      const S = window.starscape;
      return { S, api: S.api, rig: S.rig, state: S.state, stars: S.stars, pane: S.pane, film: window.__film };
    },
    call(id, ...a) { return window.__filmFns[id](this.ctx(), ...a); },
    frame({ calls, caps: co, cards: ko, cursor, ms }) {
      for (const [id, u, t] of calls) this.call(id, u, t);
      // The app redraws only when something it knows about moved; timeline calls may move the camera directly.
      if (calls.length) window.starscape.markDirty?.();
      caps.forEach((el, i) => set(el, co[i] ?? 0));
      cards.forEach((el, i) => set(el, ko[i] ?? 0));
      if (cursor) {
        const [x, y, down, o] = cursor;
        cur.style.transform = 'translate(' + (x - 3) + 'px, ' + (y - 2) + 'px)' + (down ? ' scale(0.9)' : '');
        set(cur, o);
        ring.style.left = x + 'px'; ring.style.top = y + 'px'; set(ring, down ? o : 0);
      } else { set(cur, 0); set(ring, 0); }
      __vt.step(ms);
    },
    // --- helpers for timelines -----------------------------------------------------------------------------
    /** Show or hide parts of the app's interface: inspector, rootsHead, hud, readout. */
    ui(o) {
      const b = document.body.classList;
      if ('inspector' in o) b.toggle('film-inspector', o.inspector);
      if ('rootsHead' in o) b.toggle('film-roots-head', o.rootsHead);
      if ('hud' in o) b.toggle('film-hud', o.hud);
      if ('readout' in o) b.toggle('film-readout', o.readout);
    },
    /** CSS pixel of a lattice point in the 3D view, as currently drawn. */
    starPx(coef) {
      const S = window.starscape, cam = S.rig.camera, world = S.stars.points.parent, V = cam.position.constructor;
      cam.updateMatrixWorld(); world.updateMatrixWorld();
      const st = S.stars.stage(...coef), p = world.localToWorld(new V(...(st.position ?? st))).project(cam);
      const w = window.innerWidth - (S.state.split ? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pane-w')) || 0) : 0);
      return [((p.x + 1) / 2) * w, ((1 - p.y) / 2) * window.innerHeight];
    },
    /** CSS pixel of a form's root in the roots pane. */
    rootPx(coef) { const P = window.starscape.pane, p = P.pixelOf(coef); return p && [P.rect.x + p[0], P.rect.y + p[1]]; },
    /** CSS pixel at the center of an element. */
    elPx(sel) { const r = document.querySelector(sel).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; },
    key(key, down) { window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, bubbles: true })); },
    /** The app's own display settings (the Brightness, β and Star size controls). */
    look({ exposure, beta, size } = {}) {
      const S = window.starscape;
      if (exposure !== undefined) S.state.exposure = exposure;
      if (beta !== undefined) S.stars.uniforms.uBeta.value = beta;
      if (size !== undefined) S.state.size = size;
    },
  };
})()`;

// ---------------------------------------------------------------------------------------------------------------
// The timeline, flattened. Functions become indices into the page's table.
const fns = [];
const fn = f => { fns.push(String(f)); return fns.length - 1; };
const cues = (reel.cues ?? []).map(c => ({ t: c.t, id: fn(c.run) })).sort((a, b) => a.t - b.t);
const spans = (reel.spans ?? []).map(s => ({ t0: s.t0, t1: s.t1, id: fn(s.run) }));
const pointer = (reel.pointer ?? []).map(k => ({ ...k, at: k.at ? fn(k.at) : undefined })).sort((a, b) => a.t - b.t);
const captions = reel.captions ?? [], cards = reel.cards ?? [];
const setup = reel.setup ? fn(reel.setup) : null;
const fadeAt = (t, { t0, t1, fadeIn = 0.6, fadeOut = 0.5 }) =>
  t < t0 || t > t1 ? 0 : Math.min(1, fadeIn ? (t - t0) / fadeIn : 1, fadeOut ? (t1 - t) / fadeOut : 1);
const smooth = x => x * x * x * (x * (6 * x - 15) + 10);

const chrome = await launch({ flags: ['--autoplay-policy=no-user-gesture-required'] });
let ffmpeg;
try {
  const { send, evaluate, waitFor } = chrome;
  await send('Emulation.setDeviceMetricsOverride', { width: reel.width, height: reel.height, deviceScaleFactor: scale, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
  await send('Page.navigate', { url: reel.url });
  if (!(await waitFor('window.starscape'))) {
    console.error('not ready; reloading');
    await send('Page.reload', { ignoreCache: true });
    if (!(await waitFor('window.starscape'))) throw new Error('the app never became ready');
  }
  await evaluate('document.fonts.ready.then(() => true)');
  // Timeline functions are defined at global scope, so they see only the page's globals and their context.
  await evaluate(`window.__filmFns = [${fns.join(',\n')}]; true`);
  await evaluate(install({ css: OVERLAY_CSS, cursor: CURSOR_SVG, captions, cards }));
  if (setup !== null) await evaluate(`__film.call(${setup})`);
  await sleep(reel.settle ?? 2500);
  await evaluate('__vt.manual(true)');

  if (out) {
    const [W, H] = (opt('--out', null) ?? `${Math.round(reel.width * scale)}x${Math.round(reel.height * scale)}`).split('x');
    ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-vf', `scale=${W}:${H}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  }
  const dir = opt('--dir', 'shots');
  if (stills) mkdirSync(dir, { recursive: true });
  const wanted = new Set(stills?.map(s => Math.round(s * fps)));
  const first = Math.round(from * fps), last = stills ? Math.max(...wanted) : Math.round(to * fps);

  let cue = 0, pos = null, down = false, seg = -1, segFrom = null, segTo = null;
  const started = Date.now();
  for (let i = 0; i <= last; i++) {
    const t = i * dt;
    // Pointer: keyframe k holds from its time until the next; positions ease between keyframes.
    let k = -1;
    while (k + 1 < pointer.length && pointer[k + 1].t <= t) k++;
    const resolve = async kf => (kf.at !== undefined ? evaluate(`__film.call(${kf.at})`) : [kf.x, kf.y]);
    const input = [];
    if (k >= 0) {
      if (k !== seg) {
        // Entering keyframe k: arrive at its position, then aim for the next one.
        for (let j = seg + 1; j <= k; j++) if (pointer[j].x !== undefined || pointer[j].at !== undefined) pos = await resolve(pointer[j]);
        seg = k; segFrom = pos;
        const nx = pointer[k + 1];
        segTo = nx && !nx.hide && (nx.x !== undefined || nx.at !== undefined) ? await resolve(nx) : null;
        // A hidden keyframe with a position parks the mouse there (say, on empty sky to clear a hover), unseen.
        if (pointer[k].hide && pos && (pointer[k].x !== undefined || pointer[k].at !== undefined))
          input.push({ type: 'mouseMoved', x: pos[0], y: pos[1], button: 'none', buttons: 0 });
        const want = !!pointer[k].down;
        if (pos && want !== down) {
          input.push({ type: want ? 'mousePressed' : 'mouseReleased', x: pos[0], y: pos[1], button: 'left', buttons: want ? 1 : 0, clickCount: 1, modifiers: pointer[k].shift ? 8 : 0 });
          down = want;
        }
      }
      const nx = pointer[k + 1];
      if (segTo && nx?.follow) segTo = await resolve(nx);
      if (segTo && nx && !pointer[k].hide) {
        const f = (t - pointer[k].t) / (nx.t - pointer[k].t), e = nx.ease === 'linear' ? f : smooth(f);
        const p = [segFrom[0] + (segTo[0] - segFrom[0]) * e, segFrom[1] + (segTo[1] - segFrom[1]) * e];
        if (Math.hypot(p[0] - pos[0], p[1] - pos[1]) > 0.01) {
          input.push({ type: 'mouseMoved', x: p[0], y: p[1], button: down ? 'left' : 'none', buttons: down ? 1 : 0, modifiers: pointer[k].shift ? 8 : 0 });
          pos = p;
        }
      }
    }
    for (const ev of input) await send('Input.dispatchMouseEvent', ev);
    if (input.length) await evaluate('__vt.realFrame()');

    const calls = [];
    while (cue < cues.length && cues[cue].t <= t) calls.push([cues[cue++].id, 1, t]);
    for (const s of spans) if (t >= s.t0 && t - dt < s.t1) calls.push([s.id, Math.min(1, (t - s.t0) / (s.t1 - s.t0)), t]);
    const visible = k >= 0 && pos && !pointer[k].hide;
    const payload = {
      calls, ms: dt * 1000,
      caps: captions.map(c => fadeAt(t, c)), cards: cards.map(c => fadeAt(t, c)),
      cursor: visible ? [pos[0], pos[1], down, 1] : null,
    };
    await evaluate(`__film.frame(${JSON.stringify(payload)})`);

    if (stills ? wanted.has(i) : i >= first) {
      const shot = await send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: !stills });
      const png = Buffer.from(shot.result.data, 'base64');
      if (stills) writeFileSync(`${dir}/still-${(i / fps).toFixed(2)}.png`, png);
      else if (!ffmpeg.stdin.write(png)) await new Promise(r => ffmpeg.stdin.once('drain', r));
    }
    if (i % (fps * 5) === 0) process.stderr.write(`t = ${t.toFixed(1)} s  (${((Date.now() - started) / 1000).toFixed(0)} s elapsed)\n`);
  }
  if (ffmpeg) { ffmpeg.stdin.end(); await new Promise(r => ffmpeg.on('close', r)); }
} finally {
  await chrome.close();
}
