// Starscape: wiring. Math lives in src/math (no DOM), drawing in src/render, the camera in src/views.
import * as THREE from 'three';
import * as F from './math/forms.js';
import * as G from './math/sl2.js';
import * as Mo from './math/models.js';
import * as Pl from './math/planes.js';
import { StarField } from './render/stars.js';
import { makeCone, makeScreen, makeSelection, makePlane, setPlane, makeShell } from './render/scenery.js';
import { PALETTES, gradientCSS } from './render/palette.js';
import { Rig } from './views/rig.js';
import { CHAPTERS } from './ui/chapters.js';
import { setupXR } from './ui/xr.js';
import { makeFloor, setFloorG } from './render/flatland.js';
import { walk, CuttingSequence, flatlandRetina } from './math/flatland.js';

const $ = id => document.getElementById(id);
const H = 4, HP = 2;                     // screen height and half-plane scale, display units
const BALL = 6;
const INSIDE_SCALE = 4;                  // the ground disk is H·4 = 16 world units across the radius
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------------------------------------------
// Renderer and scene
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (e) {
  $('fatal').hidden = false;
  $('fatal').innerHTML = 'Starscape needs WebGL, which this browser could not start. <a href="https://www.katestange.net/starscape-lattice/">See Katherine Stange’s original viewer.</a>';
  throw e;
}
const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dpr());
renderer.setClearColor(0x000000, 0);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.02, 400);
const world = new THREE.Group();          // the lattice frame: display coordinates live here
scene.add(world, camera);

const isMobile = matchMedia('(pointer: coarse)').matches;
const depthFor = setting => Number(setting);
let starDepth = isMobile ? 40 : 57;
$('s-depth').value = String(starDepth);

let stars;
function buildStars() {
  const lattice = F.buildLattice({ ball: BALL, depth: 96 });
  if (stars) { world.remove(stars.points); stars.points.geometry.dispose(); }
  stars = new StarField(lattice, { palette: state.palette });
  stars.uniforms.uH.value = H; stars.uniforms.uHP.value = HP;
  stars.setRho(G.displayPushforward(state.g));
  world.add(stars.points);
}

const cone = makeCone(8);
const screenDisk = makeScreen(H);
const selection = makeSelection();
const planeView = makePlane();
const shell = makeShell();
const floor = makeFloor(H);
world.add(cone, screenDisk, planeView, shell, floor, selection);
screenDisk.visible = false;

const rig = new Rig(camera, { reducedMotion: prefersReduced });

// ---------------------------------------------------------------------------------------------------------------
// State
const state = {
  g: [...G.identity],
  snap: true,
  palette: 'starlight',
  selected: null,           // [a, b, c] (exact base identity)
  hovered: -1,
  pairFirst: null,
  plane: null,              // { normal: [A,B,C], endpoints }
  shellK: 0,
  chapter: 0,
  exposure: 1.5, size: 1, style: 1,
  show: { cone: true, dust: true, lower: true, multiples: true },
  alpha: { upper: 1, lower: 0.8, exterior: 0.75, null: 1 },
};
buildStars();

let dirty = true, last = performance.now();

// Animated scalars: { current, target, rate }. Reduced motion jumps straight to the target.
const tweens = new Map();
function tween(name, target, seconds = 0.9) {
  const t = tweens.get(name) ?? { current: target, target };
  t.target = target; t.rate = seconds; tweens.set(name, t);
  if (rig.reducedMotion || seconds <= 0) t.current = target;
  dirty = true;
}
const value = name => tweens.get(name)?.current ?? 0;
function stepTweens(dt) {
  let moving = false;
  for (const t of tweens.values()) {
    if (t.current === t.target) continue;
    const k = 1 - Math.exp(-dt * 5.5 / Math.max(0.05, t.rate));
    t.current += (t.target - t.current) * k;
    if (Math.abs(t.target - t.current) < 1e-3) t.current = t.target;
    moving = true;
  }
  return moving;
}
['upper', 'lower', 'exterior', 'null'].forEach(k => tween('a_' + k, state.alpha[k], 0));
tween('morph', 0, 0); tween('cone', 1, 0); tween('screen', 0, 0); tween('r0', 0.11, 0); tween('floor', 0, 0);

// ---------------------------------------------------------------------------------------------------------------
// Frame
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(dpr());
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (!rig.animating) rig.apply();
  const p = dpr();
  Object.assign(stars.uniforms, {});
  stars.uniforms.uMinPx.value = 1.15 * p; stars.uniforms.uKnee.value = 3.2 * p;
  stars.uniforms.uMaxPx.value = 12 * p; stars.uniforms.uHaloPx.value = 3 * p;
  stars.uniforms.uPointPx.value = 2.1 * p;
  dirty = true;
}
window.addEventListener('resize', resize);

function syncUniforms() {
  const u = stars.uniforms;
  u.uKindAlpha.value.set(
    value('a_upper'),
    value('a_lower') * (state.show.lower ? 1 : 0),
    value('a_exterior') * (state.show.dust ? 1 : 0),
    value('a_null'));
  u.uMorph.value = value('morph');
  u.uDepth.value = value('depthOn') > 0.5 ? starDepth : 0;
  u.uBall.value = BALL;
  // The half-plane packs every star near ℝ; ease the exposure there so the boundary does not wash out.
  u.uExposure.value = state.exposure * (1 - 0.35 * Math.min(1, Math.max(0, value('morph') - 1.5) / 1.5)) * (1 - 0.25 * value('floor'));
  u.uR0.value = value('r0') * state.size;
  u.uMultiples.value = state.show.multiples ? 1 : 0;
  // Inside, a star is drawn at its true hyperbolic size on the ground; elsewhere the chosen style applies.
  u.uStyle.value = rig.mode === 'inside' ? 0 : state.style;
  u.uShell.value = state.shellK;
  if (state.plane) { u.uPlane.value.set(...state.plane.normal); u.uPlaneOn.value = 1; } else u.uPlaneOn.value = 0;
  cone.visible = state.show.cone && value('cone') > 0.01;
  cone.userData.uniforms.uOpacity.value = value('cone');
  cone.userData.uniforms.uRho.value.set(...G.displayPushforward(state.g));
  screenDisk.visible = value('screen') > 0.01;
  screenDisk.userData.ring.material.opacity = 0.5 * value('screen');
  screenDisk.userData.fill.material.opacity = 0.32 * value('screen');
  // The screen fill becomes the half-plane's ground as the morph passes Poincaré.
  const m = value('morph');
  screenDisk.userData.ring.visible = m < 2.6;
}

function updateSelectionMarker() {
  const { ray, ring, hover } = selection.userData;
  const place = (sprite, coef, px) => {
    if (!coef) { sprite.visible = false; return null; }
    const st = stars.stage(...coef, G.displayPushforward(state.g));
    if (st.kind === 2 && value('morph') > 0.5) { sprite.visible = false; return null; }
    sprite.position.set(...st.position);
    const d = camera.position.distanceTo(world.localToWorld(sprite.position.clone()));
    const rpx = (st.radius * stars.uniforms.uUnit.value * camera.projectionMatrix.elements[5] * 0.5 * renderer.domElement.height) / Math.max(d, 1e-3);
    const sizePx = Math.max(px, Math.min(34, 2.2 * rpx + 10));
    sprite.scale.setScalar((sizePx / renderer.domElement.height) * 2 * dpr());
    sprite.visible = true;
    return st;
  };
  const st = place(ring, state.selected, 18);
  place(hover, state.hovered >= 0 && !sameCoef(stars.coefficients(state.hovered), state.selected) ? stars.coefficients(state.hovered) : null, 15);
  if (st && st.kind !== 2 && value('morph') < 1.2) {
    // The line of sight: from the origin through the star (all its multiples lie on it).
    const p = new THREE.Vector3(...st.position), far = p.clone().setLength(Math.max(p.length() * 1.6, 14));
    ray.geometry.setFromPoints([new THREE.Vector3(), far]);
    ray.computeLineDistances();
    ray.visible = true;
  } else ray.visible = false;
}
const sameCoef = (p, q) => !!p && !!q && p[0] === q[0] && p[1] === q[1] && p[2] === q[2];

function updatePlaneView() {
  if (!state.plane) { planeView.visible = false; return; }
  const rho = G.displayPushforward(state.g);
  // The plane's normal moves like a form: n′ = ρ(g)n. Its Euclidean display normal then follows.
  const nd = G.apply3(rho, F.toDisplay(...state.plane.normal));
  const euclid = [nd[0], -nd[1], nd[2]];
  const ends = state.plane.endpoints.map(t => Mo.boundaryPoint(G.actReal(state.g, t)));
  const m = value('morph');
  const chord = m >= 0.5 && m <= 1.5 ? ends.map(([u, v]) => [u * H, H + 0.002, v * H]) : null;
  setPlane(planeView, euclid, BALL * 1.6, chord);
  planeView.userData.plate.visible = m < 1.5;
}

// Boundary labels: rationals on the edge of the sky, moved by g.
const LABELS = [[0, '0', 1], [1, '1', 1], [-1, '−1', 1], [Infinity, '∞', 1], [2, '2'], [-2, '−2'], [0.5, '½'], [-0.5, '−½'], [1 / 3, '⅓'], [-1 / 3, '−⅓']];
const labelEls = LABELS.map(([, text, big]) => {
  const s = document.createElement('span'); s.textContent = text; if (big) s.className = 'big';
  $('labels').append(s); return s;
});
function updateLabels() {
  const vis = value('screen') > 0.3 || value('morph') > 0.5 || (rig.mode === 'origin' && value('cone') > 0.3);
  const m = value('morph');
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
  LABELS.forEach(([t], i) => {
    const el = labelEls[i];
    if (!vis) { el.style.display = 'none'; return; }
    const t2 = G.actReal(state.g, t);
    const [bu, bv] = Mo.boundaryPoint(t2);
    let p = new THREE.Vector3(bu * H * 1.06, H, bv * H * 1.06);
    if (m > 2) {
      const f = m - 2, onLine = Number.isFinite(t2) ? new THREE.Vector3(t2 * HP, H, -HP - 0.25) : null;
      if (!onLine) { el.style.display = 'none'; return; }
      p = p.lerp(onLine, f);
    }
    const q = world.localToWorld(p.clone()).project(camera);
    if (q.z > 1 || q.z < -1 || Math.abs(q.x) > 1.05 || Math.abs(q.y) > 1.05) { el.style.display = 'none'; return; }
    el.style.display = '';
    el.style.left = `${((q.x + 1) / 2) * w}px`; el.style.top = `${((1 - q.y) / 2) * h}px`;
  });
}

let xr = null;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const xrActive = renderer.xr.isPresenting;
  const moving = rig.update(dt) | stepTweens(dt) | stepGAnimation(dt) | stepKeys(dt) | (xr?.update(dt) ?? false);
  if (!dirty && !moving && !xrActive) return;
  dirty = false;
  syncUniforms();
  const vh = xrActive ? (renderer.xr.getCamera().cameras[0]?.viewport?.w || 1600) : renderer.domElement.height;
  stars.uniforms.uViewportH.value = vh;
  stars.uniforms.uUnit.value = world.scale.x;
  setFloorG(floor, state.g, value('floor'));
  updatePlaneView();
  updateSelectionMarker();
  if (!xrActive) updateLabels();
  if (rig.mode === 'inside') updateInside();
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------------------------------------------------------
// The group element g: drag, snap, T and S
let gAnim = null;
function setG(g) {
  state.g = g;
  stars.setRho(G.displayPushforward(g));
  dirty = true;
  updateReadout();
}
function stepGAnimation(dt) {
  if (!gAnim) return false;
  gAnim.t = Math.min(1, gAnim.t + dt / gAnim.duration);
  const e = gAnim.t < 0.5 ? 2 * gAnim.t * gAnim.t : 1 - (-2 * gAnim.t + 2) ** 2 / 2;
  setG(G.interpolate(gAnim.from, gAnim.to, e));
  if (gAnim.t >= 1) { const done = gAnim.done; setG(gAnim.to); gAnim = null; done?.(); }
  return true;
}
function animateG(to, done) {
  if (rig.reducedMotion) { setG(to); done?.(); return; }
  gAnim = { from: [...state.g], to, t: 0, duration: 0.65, done };
}
/** Fold an integral g into the exact labels: the selection, pair and plane are relabeled by γ and g returns to 1. */
function absorb() {
  const gamma = state.g.map(Math.round);
  if (!G.isIntegral(gamma) || gamma.every((x, i) => x === G.identity[i])) { setG([...G.identity]); return; }
  const move = p => (p ? G.pushforwardExact(gamma, p).map(Number) : p);
  const before = state.selected;
  state.selected = move(state.selected);
  state.pairFirst = move(state.pairFirst);
  if (state.plane) state.plane = Pl.planeFromNormal(move(state.plane.normal));
  setG([...G.identity]);
  const tuple = t => `(${t.join(', ').replaceAll('-', '−')})`;
  flash(before ? `γ = ${matrixText(gamma)} · ${tuple(before)} ↦ ${tuple(state.selected)}` : `γ = ${matrixText(gamma)}`);
  showInspector(state.selected);
}
function applyIntegral(name) {
  const gen = { T: G.T, S: G.S, Tinv: G.inverse(G.T) }[name];
  animateG(G.multiply(gen, state.g), () => { if (G.isIntegral(state.g.map(x => Math.round(x * 1e9) / 1e9))) absorb(); });
}
const fmt = x => { const r = Math.round(x); return Math.abs(x - r) < 1e-9 ? String(r).replace('-', '−') : x.toFixed(2).replace('-', '−'); };
const matrixText = g => `[${fmt(g[0])} ${fmt(g[1])}; ${fmt(g[2])} ${fmt(g[3])}]`;
function updateReadout() {
  const isId = state.g.every((x, i) => Math.abs(x - G.identity[i]) < 1e-9);
  $('g-readout').textContent = isId ? '' : `g = ${matrixText(state.g)}  ·  g·i = ${rootFmt(G.act(state.g, { x: 0, y: 1 }))}`;
}
const rootFmt = z => `${z.x.toFixed(3).replace('-', '−')} ${z.y >= 0 ? '+' : '−'} ${Math.abs(z.y).toFixed(3)}i`;
let flashTimer;
function flash(text) {
  $('g-readout').textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateReadout, 3200);
}

// ---------------------------------------------------------------------------------------------------------------
// Pointer → root of the sky (for Möbius dragging)
const raycaster = new THREE.Raycaster();
function ndc(e) {
  const r = canvas.getBoundingClientRect();
  return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
}
/** The upper half-plane point under the pointer on the current picture, or null. */
function rootAt(p) {
  raycaster.setFromCamera(p, camera);
  const inv = world.matrixWorld.clone().invert();
  const o = raycaster.ray.origin.clone().applyMatrix4(inv), d = raycaster.ray.direction.clone().transformDirection(inv);
  const m = value('morph');
  if (m < 0.5) {
    // The lattice itself: a line of sight from (near) the origin is a projective point. Use the ray's
    // intersection with the screen plane, which for the eye at the origin is exactly its Klein point.
    if (rig.mode !== 'origin') return null;
  }
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (H - o.y) / d.y;
  if (t <= 0) return null;
  const x = o.x + t * d.x, z = o.z + t * d.z;
  if (m < 1.5) {
    const u = x / H, v = z / H;
    return u * u + v * v < 0.9995 ? Mo.kleinToHalfPlane(u, v) : null;
  }
  if (m < 2.5) {
    const pu = x / H, pv = z / H;
    if (pu * pu + pv * pv >= 0.9995) return null;
    return Mo.kleinToHalfPlane(...Mo.poincareToKlein(pu, pv));
  }
  const zz = { x: x / HP, y: z / HP + 1 };
  return zz.y > 1e-3 ? zz : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Pointer input
const pointers = new Map();
let drag = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  rig.stopInertia();
  if (pointers.size === 2) { drag = { kind: 'two', ...twoInfo() }; return; }
  const p = ndc(e), z = rootAt(p);
  const secondary = e.button === 2 || e.ctrlKey || e.altKey;
  const firstPerson = rig.mode !== 'outside';
  const kind = secondary ? (firstPerson ? 'look' : 'pan') : z ? 'sky' : firstPerson ? 'look' : 'orbit';
  drag = { kind, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, z, shift: e.shiftKey, moved: 0 };
  if (kind === 'sky') gAnim = null;
  canvas.classList.add('dragging');
});
function twoInfo() {
  const [a, b] = [...pointers.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
}
canvas.addEventListener('pointermove', e => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!drag) { queueHover(e); return; }
  const h = canvas.clientHeight;
  if (drag.kind === 'two' && pointers.size === 2) {
    const now = twoInfo();
    rig.zoom(drag.dist / Math.max(now.dist, 1));
    if (rig.mode !== 'outside') rig.look(((now.cx - drag.cx) / h) * 1.6, ((now.cy - drag.cy) / h) * 1.6);
    else rig.pan((now.cx - drag.cx) / h, (now.cy - drag.cy) / h);
    Object.assign(drag, now); dirty = true; return;
  }
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.hypot(dx, dy); drag.x = e.clientX; drag.y = e.clientY;
  if (drag.kind === 'orbit') rig.orbit((dx / h) * 3.2, (dy / h) * 3.2);
  else if (drag.kind === 'pan') rig.pan(dx / h, dy / h);
  else if (drag.kind === 'look') rig.look((dx / h) * 1.6, (dy / h) * 1.6);
  else if (drag.kind === 'sky') {
    const z1 = rootAt(ndc(e));
    if (z1 && drag.z) { setG(G.dragStep(state.g, drag.z, z1)); drag.z = z1; }
    else if (z1) drag.z = z1;
  }
  dirty = true;
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (!drag) return;
  const d = drag;
  if (pointers.size > 0) { if (d.kind === 'two') drag = null; return; }
  drag = null;
  canvas.classList.remove('dragging');
  if (d.kind !== 'two' && d.moved < 6) { click(e, d.shift || e.shiftKey); return; }
  // Inside, dragging the ground is walking: it should stay where you leave it.
  if (d.kind === 'sky' && state.snap && rig.mode !== 'inside') {
    const gamma = G.nearestIntegral(state.g);
    if (gamma) animateG(gamma, absorb);
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', e => { e.preventDefault(); rig.zoom(Math.exp(e.deltaY * 0.0012)); dirty = true; }, { passive: false });

let hoverQueued = null;
function queueHover(e) {
  if (e.pointerType !== 'mouse') return;
  const first = !hoverQueued;
  hoverQueued = e;
  if (!first) return;
  requestAnimationFrame(() => {
    const ev = hoverQueued; hoverQueued = null;
    const i = pickAt(ndc(ev), 11);
    if (i !== state.hovered) {
      state.hovered = i; dirty = true;
      canvas.classList.toggle('hovering', i >= 0);
      if (!state.selected) i >= 0 ? showInspector(stars.coefficients(i), true) : hideInspector();
    }
  });
}
function pickAt(p, radiusPx = 14) {
  camera.updateMatrixWorld(); world.updateMatrixWorld();
  const toClip = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(world.matrixWorld);
  return stars.pick(p.x, p.y, toClip, canvas.clientHeight, { radiusPx, aspect: camera.aspect });
}
function click(e, shift) {
  const i = pickAt(ndc(e), isMobile ? 22 : 14);
  if (i < 0) { if (!shift) select(null); return; }
  const coef = stars.coefficients(i);
  if (shift && state.selected) return pairWith(coef);
  select(coef);
}

// ---------------------------------------------------------------------------------------------------------------
// Selection, planes, the inspector
function select(coef, { quiet = false } = {}) {
  state.selected = coef;
  if (!coef) { hideInspector(); dirty = true; writeHash(); return; }
  const kind = F.kind(...coef);
  if (kind === 'exterior' && !quiet) {
    const plane = Pl.planeFromNormal(coef);
    if (!plane.error) state.plane = plane;
  }
  showInspector(coef);
  dirty = true; writeHash();
}
function pairWith(coef) {
  const first = state.selected;
  if (F.discriminant(...first) >= 0 || F.discriminant(...coef) >= 0) { flash('Pair two stars (complex roots) for their geodesic.'); return; }
  const plane = Pl.planeThrough(first, coef);
  if (plane.error) { flash(plane.error); return; }
  state.plane = plane;
  flash(`plane ${Pl.planeEquation(plane.normal)} through (${first.join(', ')}) and (${coef.join(', ')})`);
  showInspector(first);
  dirty = true;
}
const KIND_TEXT = {
  upper: ['a star', 'complex roots, a > 0'], lower: ['lower cone', 'complex roots, a < 0'],
  exterior: ['dust', 'two real roots'], null: ['on the cone', 'a double root'],
};
function showInspector(coef, preview = false) {
  if (!coef) return hideInspector();
  const [a, b, c] = coef, kind = F.kind(a, b, c), d = F.discriminant(a, b, c);
  const el = $('inspector');
  el.hidden = false; el.classList.toggle('preview', preview);
  const swatchColor = kind === 'upper' ? `rgb(${PALETTES[state.palette].ramp(Math.min(1, Math.max(0, Math.log(-d / 3) / Math.log(80)))).map(x => Math.round(x * 255)).join(',')})` : PALETTES[state.palette][kind === 'lower' ? 'lower' : kind];
  $('i-kind').innerHTML = `<span class="swatch" style="background:${swatchColor}"></span>${KIND_TEXT[kind][0]} · ${KIND_TEXT[kind][1]}`;
  $('i-poly').textContent = F.polynomialText(a, b, c);
  const k = F.content(a, b, c);
  $('i-coef').textContent = `(${a}, ${b}, ${c})`.replaceAll('-', '−');
  $('i-delta').textContent = `Δ = ${String(d).replace('-', '−')}`;
  $('i-root-label').textContent = kind === 'exterior' ? 'roots' : 'root';
  $('i-root').textContent = F.rootText(a, b, c);
  $('i-compact').textContent = `Δ = ${String(d).replace('-', '−')} · ${F.rootText(a, b, c)}`;
  const notes = [];
  if (k > 1) notes.push(`${k} × (${[a / k, b / k, c / k].join(', ').replaceAll('-', '−')}): same root, ${k} times farther from the origin, so ${k * k} times dimmer.`);
  if (kind === 'upper' && k === 1) {
    const h = F.reducedForms(-d).length;
    notes.push(`One of ${h} SL₂(ℤ)-orbit${h > 1 ? 's' : ''} on the shell Δ = ${String(d).replace('-', '−')}.`);
  }
  if (kind === 'exterior') notes.push('Its plane is drawn: the geodesic between its roots.');
  if (state.plane && kind !== 'exterior' && Pl.onPlane(state.plane.normal, coef)) notes.push(`On the plane ${Pl.planeEquation(state.plane.normal)}.`);
  $('i-note').textContent = notes.join(' ');
  const acts = $('i-actions'); acts.replaceChildren();
  if (!preview) {
    if (kind === 'upper' || kind === 'lower') acts.append(button('Look at it from zero', () => lookAtStar(coef)));
    if (kind === 'upper') acts.append(button('Its shell', () => { state.shellK = -d; shell.userData.set(-d, 40); shell.visible = true; dirty = true; }));
    if (state.plane) acts.append(button('Clear plane', () => { state.plane = null; showInspector(state.selected); dirty = true; }));
    if (state.shellK) acts.append(button('Clear shell', () => { state.shellK = 0; shell.visible = false; showInspector(state.selected); dirty = true; }));
  }
  const gNotId = state.g.some((x, i) => Math.abs(x - G.identity[i]) > 1e-9);
  $('i-g-label').hidden = $('i-g').hidden = !gNotId || kind === 'exterior';
  if (gNotId && d < 0) {
    const z = G.act(state.g, F.upperRoot(a, b, c));
    $('i-g').textContent = `g·root ≈ ${rootFmt(z)}`;
  }
}
function hideInspector() { $('inspector').hidden = true; }
function button(label, run) {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.addEventListener('click', run); return b;
}
function lookAtStar(coef) {
  const v = new THREE.Vector3(...G.apply3(G.displayPushforward(state.g), F.toDisplay(...coef)));
  if (v.y < 0) v.negate();
  v.normalize();
  const pitch = Math.asin(Math.min(1, v.y)), yaw = Math.atan2(-v.x, -v.z);
  goOrigin({ pitch: Math.min(pitch, Math.PI / 2 - 1e-4), yaw, fov: 70 });
}

// ---------------------------------------------------------------------------------------------------------------
// Views and chapters
function setView(mode) {
  // Seen from the origin a star needs a smaller radius: only the nearest few resolve, the rest are points of light.
  tween('r0', mode === 'origin' ? 0.045 : mode === 'inside' ? 0.04 : 0.11, 1.2);
  for (const m of ['outside', 'origin', 'inside']) $('v-' + m).setAttribute('aria-pressed', String(mode === m));
}
/** Inside, the world is scaled up so the ground disk (the plane Y = h) sits at your feet, 16 units across. */
function setWorldFrame(inside) {
  world.scale.setScalar(inside ? INSIDE_SCALE : 1);
  world.position.set(0, inside ? -H * INSIDE_SCALE : 0, 0);
  camera.near = inside ? 0.002 : 0.02; camera.updateProjectionMatrix();
}
function fade(fn) {
  $('veil').classList.add('on');
  setTimeout(() => { fn(); dirty = true; setTimeout(() => $('veil').classList.remove('on'), 80); }, 300);
}
/** Leaving the plane: restore the lattice frame. Returns true if we were inside (so the caller fades). */
function leaveInside() {
  if (rig.mode !== 'inside') return false;
  setWorldFrame(false);
  tween('floor', 0, 0);
  $('inside-hud').hidden = true; $('retina').hidden = $('retina-caption').hidden = true;
  return true;
}
function goInside(pose = {}) {
  if (rig.mode === 'inside') { rig.go('inside', pose, 0.8); return; }
  fade(() => {
    setView('inside');
    setWorldFrame(true);
    tween('morph', 2, 0); tween('floor', 1, 0); tween('cone', 0, 0); tween('screen', 0, 0); tween('depthOn', 1, 0);
    Object.entries({ upper: 1, lower: 0, exterior: 0, null: 1 }).forEach(([k, v]) => tween('a_' + k, v, 0));
    $('morph').value = '2';
    state.plane = null; state.shellK = 0; shell.visible = false;
    rig.go('inside', pose, 0);
    // Start inside a triangle rather than on an edge: at the center of (0, 1, ∞), on the star x² − x + 1.
    setG(G.toI({ x: 0.5, y: Math.sqrt(3) / 2 }));
    cutting.reset();
    $('inside-hud').hidden = false;
    $('eye').value = String(rig.inside.eye);
  });
}
function veilCut(fn) {
  // Under reduced motion a change of vantage point is a short fade through black, not a flight.
  if (!rig.reducedMotion) return fn();
  $('veil').classList.add('on');
  setTimeout(() => { fn(); dirty = true; setTimeout(() => $('veil').classList.remove('on'), 60); }, 260);
}
function goOrigin(pose = {}) {
  const go = () => { setView('origin'); rig.go('origin', { ...pose, lean: new THREE.Vector3(...(pose.leanArr ?? [0, 0, 0])) }); };
  if (rig.mode === 'inside') fade(() => { leaveInside(); tween('cone', 1, 0); tween('screen', 1, 0); setMorph(1, 0); rig.go('origin', {}, 0); go(); rig.apply(); });
  else { setView('origin'); veilCut(go); }
  dirty = true;
}
function goOutside(pose = {}) {
  const o = { ...pose };
  if (Array.isArray(o.target)) o.target = new THREE.Vector3(...o.target);
  const go = () => { setView('outside'); rig.go('outside', o); };
  if (rig.mode === 'inside') fade(() => { leaveInside(); tween('cone', 1, 0); setMorph(0, 0); go(); });
  else { setView('outside'); veilCut(go); }
  dirty = true;
}
function leanTo(v) {
  if (rig.mode !== 'origin') return;
  rig.go('origin', { lean: new THREE.Vector3(...v) }, 0.9);
}
function setMorph(m, seconds = 1.1) {
  state.morphTarget = m;
  tween('morph', m, seconds);
  if (m >= 0.5) tween('screen', 1, 0.6);
  $('morph').value = String(m);
}

function applyScene(s) {
  if (s.view === 'inside') { goInside(s.pose ?? {}); if (s.select !== undefined) setTimeout(() => select(s.select, { quiet: true }), 320); return; }
  if (s.view === 'origin') goOrigin({ ...(s.pose ?? {}), leanArr: s.lean });
  else if (s.view === 'outside') goOutside(s.pose ?? {});
  if (s.morph !== undefined) setMorph(s.morph, 1.4);
  if (s.alpha) for (const [k, v] of Object.entries(s.alpha)) tween('a_' + k, v, 1.0);
  if (s.depth !== undefined) tween('depthOn', s.depth === 'deep' ? 1 : 0, 0);
  if (s.cone !== undefined) tween('cone', s.cone ? 1 : 0, 0.8);
  if (s.screen !== undefined) tween('screen', s.screen ? 1 : 0, 0.8);
  if ('plane' in s) state.plane = s.plane ? Pl.planeFromNormal(s.plane) : null;
  if (s.shell !== undefined) {
    state.shellK = s.shell;
    if (s.shell) shell.userData.set(s.shell, 40); else shell.visible = false;
  }
  if (s.select !== undefined) select(s.select, { quiet: true });
  if (state.g.some((x, i) => x !== G.identity[i])) setG([...G.identity]);
  dirty = true;
}

function renderChapter(i, { apply = true } = {}) {
  state.chapter = (i + CHAPTERS.length) % CHAPTERS.length;
  const c = CHAPTERS[state.chapter];
  $('c-eyebrow').textContent = c.eyebrow;
  $('c-title').textContent = c.title;
  $('c-body').innerHTML = c.body;
  if (c.actions?.length) {
    const row = document.createElement('div'); row.className = 'do';
    c.actions.forEach(a => row.append(button(a.label, () => a.run(api))));
    $('c-body').append(row);
  }
  [...$('c-dots').children].forEach((li, j) => li.firstChild.setAttribute('aria-current', j === state.chapter ? 'step' : 'false'));
  if (apply) applyScene(c.scene);
  if (state.shellK) updateShellReadout();
  writeHash();
}
CHAPTERS.forEach((c, i) => {
  const li = document.createElement('li');
  li.append(button(String(i + 1), () => renderChapter(i)));
  li.firstChild.setAttribute('aria-label', `Chapter ${i + 1}: ${c.title}`);
  $('c-dots').append(li);
});
$('c-prev').onclick = () => renderChapter(state.chapter - 1);
$('c-next').onclick = () => renderChapter(state.chapter + 1);
const narrow = matchMedia('(max-width: 760px)');
function syncCollapse() {
  const open = narrow.matches ? $('chapter').classList.contains('expanded') : !$('chapter').classList.contains('collapsed');
  $('c-collapse').textContent = open ? '–' : '+';
  $('c-collapse').setAttribute('aria-label', open ? 'Hide the tour text' : 'Show the tour text');
}
$('c-collapse').onclick = () => {
  if (narrow.matches) $('chapter').classList.toggle('expanded'); else $('chapter').classList.toggle('collapsed');
  syncCollapse();
};
$('c-title').onclick = () => { if (narrow.matches) { $('chapter').classList.toggle('expanded'); syncCollapse(); } };
syncCollapse();
$('inspector').addEventListener('click', e => { if (narrow.matches && !e.target.closest('button')) $('inspector').classList.toggle('expanded'); });
$('dock-toggle').onclick = () => { const o = $('dock').classList.toggle('open'); $('dock-toggle').setAttribute('aria-expanded', String(o)); };

function stepShell(delta) {
  let k = state.shellK || 3;
  do { k += delta; } while (k > 2 && ((-k % 4) + 4) % 4 > 1);
  k = Math.max(3, k);
  state.shellK = k; shell.userData.set(k, 40);
  const forms = F.reducedForms(k);
  if (forms.length) select(forms[0], { quiet: true });
  updateShellReadout(); dirty = true;
}
function updateShellReadout() {
  const el = document.getElementById('shell-readout');
  if (!el) return;
  const k = state.shellK, forms = F.reducedForms(k);
  el.innerHTML = `<b>Δ = −${k}</b>: h(−${k}) = ${forms.length}, reduced forms ${forms.map(f => `<span class="math">${F.polynomialText(...f)}</span>`).join(', ')}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Inside: where you are, where you are heading, the turns you have made, and the Flatland retina
const cutting = new CuttingSequence();
const zText = z => `${z.x.toFixed(3).replace('-', '−')} ${z.y >= 0 ? '+' : '−'} ${Math.abs(z.y).toFixed(3)}i`;
/** Continued fraction [a0; a1, …] of x, up to n terms. */
function continuedFraction(x, n = 7) {
  const out = [];
  for (let i = 0; i < n && Number.isFinite(x); i++) {
    const a = Math.floor(x); out.push(a);
    const f = x - a; if (f < 1e-9) break; x = 1 / f;
  }
  return out;
}
const cfText = a => (a.length ? `[${a[0]}${a.length > 1 ? '; ' + a.slice(1).join(', ') : ''}${a.length >= 7 ? ', …' : ''}]` : '');
let lastInside = '';
function updateInside() {
  const here = G.act(G.inverse(state.g), { x: 0, y: 1 });
  const [hx, hz] = rig.heading(), heading = Math.atan2(hz, hx);
  // Which of your Farey triangle's vertices is on your left, in the current disk picture.
  const leftOf = t => {
    const [bu, bv] = Mo.boundaryPoint(G.actReal(state.g, t));
    return bu * hz - bv * hx > 0;
  };
  cutting.update(here, leftOf);
  // The rim point straight ahead, pulled back to the base picture: where this geodesic ends.
  const u = Math.cos(heading), v = Math.sin(heading);
  const xi = G.actReal(G.inverse(state.g), v >= 1 - 1e-12 ? Infinity : u / (1 - v));
  const key = `${here.x.toFixed(4)},${here.y.toFixed(4)},${heading.toFixed(3)},${cutting.letters.length}`;
  if (key !== lastInside) {
    lastInside = key;
    $('h-here').textContent = `${zText(here)}  ·  ${G.hyperbolicDistance(here, { x: 0, y: 1 }).toFixed(2)} from i`;
    $('h-heading').textContent = Number.isFinite(xi) ? `${xi.toFixed(5).replace('-', '−')} = ${cfText(continuedFraction(xi))}` : '∞';
    const runs = cutting.runs().map(r => r.ch + (r.n > 1 ? '' + r.n : '')).join(' ');
    $('h-turns').textContent = runs || 'walk across a line';
  }
  updateRetina(heading);
}

// The Flatland retina: one pixel per direction, recomputed only when you move or turn.
const retina = $('retina'), retinaCtx = retina.getContext('2d');
let retinaKey = '';
function eyeLabel() {
  const h = rig.inside.eye;
  $('eye-v').textContent = h < 0.12 ? 'in the plane' : h < 1.2 ? 'crouching' : h < 2.6 ? 'standing' : 'above';
}
function updateRetina(heading) {
  const inPlane = rig.inside.eye < 0.12;
  retina.hidden = $('retina-caption').hidden = !inPlane;
  if (!inPlane) return;
  const key = state.g.map(x => x.toFixed(6)).join() + heading.toFixed(4) + state.palette;
  if (key === retinaKey) return;
  retinaKey = key;
  const W = 720, palette = d => PALETTES[state.palette].ramp(Math.min(1, Math.max(0, Math.log(d / 3) / Math.log(80))));
  const view = flatlandRetina(stars, state.g, { width: W, r0: 0.18, palette });
  retina.width = W; retina.height = 1;
  const img = retinaCtx.createImageData(W, 1);
  for (let x = 0; x < W; x++) {
    // Screen column x looks in direction heading + φ, with φ = 0 at the center and your left on the left.
    const phi = ((x + 0.5) / W - 0.5) * 2 * Math.PI, theta = heading + phi;
    const k = (((Math.floor(((theta + Math.PI) / (2 * Math.PI)) * W) % W) + W) % W);
    const src = (k + W / 2) % W;   // flatlandRetina bins start at angle 0
    for (let c = 0; c < 3; c++) img.data[4 * x + c] = Math.min(255, 255 * view.color[3 * src + c]);
    img.data[4 * x + 3] = 255;
  }
  retinaCtx.putImageData(img, 0, 0);
}
$('eye').addEventListener('input', e => { rig.setEye(Number(e.target.value)); eyeLabel(); retinaKey = ''; dirty = true; });
$('h-reset').onclick = () => { animateG([...G.identity]); cutting.reset(); };
$('h-clear').onclick = () => { cutting.reset(); lastInside = ''; dirty = true; };
$('v-inside').onclick = () => goInside();
eyeLabel();

const api = {
  leanTo, goOrigin, goOutside, goInside, setMorph, applyIntegral, stepShell, select, renderChapter, rig,
  setEye: h => { rig.setEye(h); $('eye').value = String(h); eyeLabel(); dirty = true; },
  chapter: () => ({ ...CHAPTERS[state.chapter], index: state.chapter, count: CHAPTERS.length }),
  restoreFrame: () => { setWorldFrame(rig.mode === 'inside'); dirty = true; },
  get state() { return state; },
};

// ---------------------------------------------------------------------------------------------------------------
// Dock, settings and keys
$('v-outside').onclick = () => goOutside();
$('v-origin').onclick = () => goOrigin();
$('morph').addEventListener('input', e => { tween('morph', Number(e.target.value), 0.15); if (Number(e.target.value) > 0.3) tween('screen', 1, 0.5); });
$('g-t').onclick = () => applyIntegral('T');
$('g-tinv').onclick = () => applyIntegral('Tinv');
$('g-s').onclick = () => applyIntegral('S');
$('g-snap').onclick = () => { state.snap = !state.snap; $('g-snap').setAttribute('aria-pressed', String(state.snap)); };
$('settings-open').onclick = () => { $('settings').hidden = !$('settings').hidden; $('help').hidden = true; };
$('settings-close').onclick = () => { $('settings').hidden = true; };
$('help-open').onclick = () => { $('help').hidden = !$('help').hidden; $('settings').hidden = true; };
$('help-close').onclick = () => { $('help').hidden = true; };
for (const [name, p] of Object.entries(PALETTES)) $('s-palette').append(new Option(p.label, name));
function paletteUI() {
  const p = PALETTES[state.palette];
  $('s-bar').style.background = gradientCSS(state.palette);
  document.querySelector('.k-ext').style.background = p.exterior;
  document.querySelector('.k-null').style.background = p.null;
  document.querySelector('.k-low').style.background = p.lower;
}
paletteUI();
$('s-palette').onchange = e => { state.palette = e.target.value; stars.setPalette(state.palette); paletteUI(); dirty = true; };
$('s-depth').onchange = e => { starDepth = depthFor(e.target.value); dirty = true; };
$('s-exposure').oninput = e => { state.exposure = Number(e.target.value); dirty = true; };
$('s-style').onchange = e => { state.style = Number(e.target.value); dirty = true; };
$('s-beta').oninput = e => { stars.uniforms.uBeta.value = Number(e.target.value); $('s-beta-v').textContent = Number(e.target.value).toFixed(2); dirty = true; };
$('s-size').oninput = e => { state.size = Number(e.target.value); dirty = true; };
$('s-cone').onchange = e => { state.show.cone = e.target.checked; dirty = true; };
$('s-dust').onchange = e => { state.show.dust = e.target.checked; dirty = true; };
$('s-lower').onchange = e => { state.show.lower = e.target.checked; dirty = true; };
$('s-multiples').onchange = e => { state.show.multiples = e.target.checked; dirty = true; };
$('s-motion').checked = rig.reducedMotion;
$('s-motion').onchange = e => { rig.reducedMotion = e.target.checked; };

const keysDown = new Set();
const MOVE_KEYS = /^(arrow(up|down|left|right)|[wasdqe])$/;
window.addEventListener('keydown', e => {
  if (e.target?.closest?.('input, select, textarea')) return;
  const k = e.key, lower = k.toLowerCase();
  // First-person vantages own the movement keys while they are held.
  if ((rig.mode === 'inside' && MOVE_KEYS.test(lower)) || (rig.mode === 'origin' && /^[wasdqe]$/.test(lower))) {
    keysDown.add(lower); e.preventDefault(); return;
  }
  if (k === 'ArrowRight') renderChapter(state.chapter + 1);
  else if (k === 'ArrowLeft') renderChapter(state.chapter - 1);
  else if (k === 'o' || k === 'O') (rig.mode === 'origin' ? goOutside() : goOrigin());
  else if (k === 'i' || k === 'I') (rig.mode === 'inside' ? goOrigin() : goInside());
  else if (k === 'p' || k === 'P') setMorph((Math.round(value('morph')) + 1) % 4);
  else if (k === 't') applyIntegral('T');
  else if (k === 'T') applyIntegral('Tinv');
  else if (k === 's') applyIntegral('S');
  else if (k === 'Escape') { select(null); state.plane = null; state.shellK = 0; shell.visible = false; dirty = true; }
  else if (k === '?') $('help-open').click();
  else if (/^[1-9]$/.test(k) && Number(k) <= CHAPTERS.length) renderChapter(Number(k) - 1);
});
window.addEventListener('keyup', e => keysDown.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keysDown.clear());
const held = k => (keysDown.has(k) ? 1 : 0);
/** Movement from held keys, called every frame: leaning at the origin, walking inside. */
function stepKeys(dt) {
  if (!keysDown.size || rig.animating) return false;
  if (rig.mode === 'origin') {
    const s = 2.4 * dt;
    rig.lean((held('d') - held('a')) * s, (held('e') - held('q')) * s, (held('s') - held('w')) * s);
    return true;
  }
  if (rig.mode !== 'inside') return false;
  const turn = (held('arrowleft') + held('q') - held('arrowright') - held('e')) * 1.6 * dt;
  if (turn) rig.look(-turn, 0);
  const forward = held('w') + held('arrowup') - held('s') - held('arrowdown'), side = held('d') - held('a');
  if (forward || side) {
    const [hx, hz] = rig.heading(), heading = Math.atan2(hz, hx);
    const angle = heading + Math.atan2(side, forward), speed = 1.1 * dt * Math.hypot(forward, side) / Math.max(1, Math.hypot(forward, side));
    setG(walk(state.g, angle, speed));
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Shareable state in the URL hash: #c=3&sel=1,1,1
function writeHash() {
  const parts = [`c=${state.chapter + 1}`];
  if (state.selected) parts.push(`sel=${state.selected.join(',')}`);
  history.replaceState(null, '', '#' + parts.join('&'));
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  const c = Number(q.get('c')) || 1;
  renderChapter(c - 1);
  const sel = q.get('sel')?.split(',').map(Number);
  if (sel?.length === 3 && sel.every(Number.isSafeInteger) && sel.some(x => x)) select(sel);
}

// ---------------------------------------------------------------------------------------------------------------
resize();
readHash();
xr = setupXR({ renderer, scene, camera, world, rig, stars, state, api, markDirty: () => { dirty = true; }, rootAtRay: null, setG, animateG, absorb, H });
renderer.setAnimationLoop(frame);
window.starscape = { state, rig, stars, api, setG, G, F, tween, value };   // for the console and tests
