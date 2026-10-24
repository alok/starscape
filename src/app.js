// Starscape: wiring. Mathematics lives in src/math (no DOM), drawing in src/render, cameras and input in
// src/views, and panels in src/ui. This file connects them and owns the frame loop.
import * as THREE from 'three';
import * as F from './math/forms.js';
import * as G from './math/sl2.js';
import * as Mo from './math/models.js';
import * as Pl from './math/planes.js';
import { walk } from './math/flatland.js';
import { StarField } from './render/stars.js';
import { makeCone, makeScreen, makeSelection, makePlane, setPlane, makeShell } from './render/scenery.js';
import { makeFloor, setFloorG } from './render/flatland.js';
import { PALETTES, gradientCSS } from './render/palette.js';
import { Rig } from './views/rig.js';
import { PointerInput, HeldKeys } from './views/input.js';
import { Tweens } from './core/tweens.js';
import { CHAPTERS } from './ui/chapters.js';
import { Inspector, button } from './ui/inspector.js';
import { InsideHud } from './ui/inside.js';
import { RootsPane } from './ui/rootspane.js';
import { matrixText, tupleText, complexText } from './ui/format.js';
import { setupXR } from './ui/xr.js';

const $ = id => document.getElementById(id);
const H = 4, HP = 2;          // screen height and half-plane scale, display units
const BALL = 6;               // radius of the whole-lattice ball
const INSIDE_SCALE = 4;       // inside, the ground disk is H · 4 = 16 world units in radius
const isMobile = matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------------------------------------------------------
// Renderer, scene, objects

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

const state = {
  g: [...G.identity],
  snap: true,
  palette: 'spectrum',
  selected: null,           // [a, b, c], an exact base identity
  hovered: -1,
  plane: null,              // { normal: [A, B, C], endpoints }
  shellK: 0,
  chapter: 0,
  morphTarget: 0,
  starDepth: isMobile ? 40 : 57,
  exposure: 1.5, size: 1, style: 1,
  split: window.innerWidth >= 1000,     // the roots pane, side by side
  show: { cone: true, dust: true, lower: true, multiples: true },
};
$('s-depth').value = String(state.starDepth);

let dirty = true;
const markDirty = () => { dirty = true; };
const rig = new Rig(camera, { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
const tw = new Tweens({ reducedMotion: rig.reducedMotion, onChange: markDirty });
Object.entries({ a_upper: 1, a_lower: 0.8, a_exterior: 0.75, a_null: 1, morph: 0, cone: 1, screen: 0, r0: 0.11, floor: 0 })
  .forEach(([k, v]) => tw.set(k, v, 0));

// Phones get her full sky (a + c ≤ 57, about 100k stars); desktops can go denser.
const MAX_DEPTH = isMobile ? 57 : 96;
if (isMobile) $('s-depth').querySelector('option[value="80"]')?.remove();
const stars = new StarField(F.buildLattice({ ball: BALL, depth: MAX_DEPTH }), { palette: state.palette });
stars.uniforms.uH.value = H; stars.uniforms.uHP.value = HP;
stars.setRho(G.displayPushforward(state.g));
const cone = makeCone(8), screenDisk = makeScreen(H), selection = makeSelection();
const planeView = makePlane(), shell = makeShell(), floor = makeFloor(H);
world.add(stars.points, cone, screenDisk, planeView, shell, floor, selection);
const pane = new RootsPane({ world, stars, state, H, HP, onModel: markDirty });

// ---------------------------------------------------------------------------------------------------------------
// Per-frame synchronization of uniforms and overlays

/** The 3D view's width; the roots pane takes the rest. On narrow screens the pane, when shown, is the whole view. */
const view3d = { w: window.innerWidth, h: window.innerHeight };
function layout() {
  const W = window.innerWidth, Hh = window.innerHeight, narrowScreen = W < 760;
  const paneW = !state.split ? 0 : narrowScreen ? W : Math.round(Math.min(760, Math.max(380, 0.44 * W)));
  document.documentElement.style.setProperty('--pane-w', `${narrowScreen ? 0 : paneW}px`);
  document.body.classList.toggle('split', state.split && !narrowScreen);
  document.body.classList.toggle('roots-only', state.split && narrowScreen);
  $('roots-head').hidden = !state.split;
  $('v-split').setAttribute('aria-pressed', String(state.split));
  view3d.w = W - paneW; view3d.h = Hh;
  pane.layout({ x: W - paneW, y: 0, w: paneW, h: Hh });
  camera.aspect = Math.max(view3d.w, 1) / Hh; camera.updateProjectionMatrix();
  dirty = true;
}
function resize() {
  renderer.setPixelRatio(dpr());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  layout();
  if (!rig.animating) rig.apply();
  const u = stars.uniforms, p = dpr();
  u.uMinPx.value = 1.15 * p; u.uKnee.value = 3.2 * p; u.uMaxPx.value = 12 * p; u.uHaloPx.value = 3 * p; u.uPointPx.value = 2.1 * p;
  dirty = true;
}
window.addEventListener('resize', resize);

function syncUniforms() {
  const u = stars.uniforms, m = tw.get('morph');
  u.uKindAlpha.value.set(tw.get('a_upper'), tw.get('a_lower') * +state.show.lower,
    tw.get('a_exterior') * +state.show.dust, tw.get('a_null'));
  u.uMorph.value = m;
  u.uDepth.value = tw.get('depthOn') > 0.5 ? state.starDepth : 0;
  u.uBall.value = BALL;
  // The half-plane packs every star near ℝ; ease the exposure there so the boundary does not wash out.
  u.uExposure.value = state.exposure * (1 - 0.35 * Math.min(1, Math.max(0, m - 1.5) / 1.5)) * (1 - 0.25 * tw.get('floor'));
  u.uR0.value = tw.get('r0') * state.size;
  u.uMultiples.value = +state.show.multiples;
  // Inside, a star is drawn at its true hyperbolic size on the ground; elsewhere the chosen style applies.
  u.uStyle.value = rig.mode === 'inside' ? 0 : state.style;
  u.uShell.value = state.shellK;
  u.uPlaneOn.value = state.plane ? 1 : 0;
  if (state.plane) u.uPlane.value.set(...state.plane.normal);
  u.uUnit.value = world.scale.y;
  cone.visible = state.show.cone && tw.get('cone') > 0.01;
  cone.userData.uniforms.uOpacity.value = tw.get('cone');
  cone.userData.uniforms.uRho.value.set(...G.displayPushforward(state.g));
  screenDisk.visible = tw.get('screen') > 0.01;
  screenDisk.userData.ring.material.opacity = 0.5 * tw.get('screen');
  screenDisk.userData.fill.material.opacity = 0.32 * tw.get('screen');
  screenDisk.userData.ring.visible = m < 2.6;
  setFloorG(floor, state.g, tw.get('floor'));
}

const sameCoef = (p, q) => !!p && !!q && p.every((x, i) => x === q[i]);
function updateSelectionMarker() {
  const { ray, ring, hover } = selection.userData, rho = G.displayPushforward(state.g), m = tw.get('morph');
  const place = (sprite, coef, minPx) => {
    if (!coef) { sprite.visible = false; return null; }
    const st = stars.stage(...coef, rho);
    if (st.kind === 2 && m > 0.5) { sprite.visible = false; return null; }
    sprite.position.set(...st.position);
    const d = camera.position.distanceTo(world.localToWorld(sprite.position.clone()));
    const rpx = (st.radius * world.scale.y * camera.projectionMatrix.elements[5] * 0.5 * renderer.domElement.height) / Math.max(d, 1e-3);
    sprite.scale.setScalar((Math.max(minPx, Math.min(34, 2.2 * rpx + 10)) / renderer.domElement.height) * 2 * dpr());
    sprite.visible = true;
    return st;
  };
  const st = place(ring, state.selected, 18);
  const hovered = state.hovered >= 0 ? stars.coefficients(state.hovered) : null;
  place(hover, sameCoef(hovered, state.selected) ? null : hovered, 15);
  // The line of sight: from the origin through the star, on which all its multiples lie.
  ray.visible = !!st && st.kind !== 2 && m < 1.2;
  if (ray.visible) {
    const p = new THREE.Vector3(...st.position);
    ray.geometry.setFromPoints([new THREE.Vector3(), p.clone().setLength(Math.max(p.length() * 1.6, 14))]);
    ray.computeLineDistances();
  }
}

function updatePlaneView() {
  if (!state.plane) { planeView.visible = false; return; }
  // The plane's normal moves like a form, n′ = ρ(g)n; its Euclidean display normal flips the Y sign.
  const nd = G.apply3(G.displayPushforward(state.g), F.toDisplay(...state.plane.normal)), m = tw.get('morph');
  const chord = m >= 0.5 && m <= 1.5
    ? state.plane.endpoints.map(t => Mo.boundaryPoint(G.actReal(state.g, t))).map(([u, v]) => [u * H, H + 0.002, v * H])
    : null;
  setPlane(planeView, [nd[0], -nd[1], nd[2]], BALL * 1.6, chord);
  planeView.userData.plate.visible = m < 1.5;
}

// Rationals on the rim of the sky, moved by g; on the real line once the picture is the half-plane.
const LABELS = [[0, '0', 1], [1, '1', 1], [-1, '−1', 1], [Infinity, '∞', 1], [2, '2'], [-2, '−2'], [0.5, '½'], [-0.5, '−½'], [1 / 3, '⅓'], [-1 / 3, '−⅓']];
const labelEls = LABELS.map(([, text, big]) => {
  const s = document.createElement('span'); s.textContent = text; if (big) s.className = 'big';
  $('labels').append(s); return s;
});
function updateLabels() {
  const m = tw.get('morph'), w = view3d.w, h = view3d.h;
  const vis = tw.get('screen') > 0.3 || m > 0.5 || (rig.mode === 'origin' && tw.get('cone') > 0.3);
  LABELS.forEach(([t], i) => {
    const el = labelEls[i], t2 = G.actReal(state.g, t), [bu, bv] = Mo.boundaryPoint(t2);
    let p = new THREE.Vector3(bu * H * 1.06, H, bv * H * 1.06);
    if (m > 2 && Number.isFinite(t2)) p.lerp(new THREE.Vector3(t2 * HP, H, -HP - 0.25), m - 2);
    const q = world.localToWorld(p).project(camera);
    const show = vis && w > 0 && !(m > 2 && !Number.isFinite(t2)) && Math.abs(q.z) <= 1 && Math.abs(q.x) <= 1.05 && Math.abs(q.y) <= 1.05;
    el.style.display = show ? '' : 'none';
    if (show) { el.style.left = `${((q.x + 1) / 2) * w}px`; el.style.top = `${((1 - q.y) / 2) * h}px`; }
  });
}

let xr = null, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const presenting = renderer.xr.isPresenting;
  const moving = rig.update(dt) | tw.step(dt) | pane.step(dt) | stepGAnimation(dt) | stepKeys(dt) | (xr?.update(dt) ?? false);
  if (!dirty && !moving && !presenting) return;
  dirty = false;
  syncUniforms();
  stars.uniforms.uViewportH.value = presenting ? (renderer.xr.getCamera().cameras[0]?.viewport?.w || 1600) : renderer.domElement.height;
  updatePlaneView();
  updateSelectionMarker();
  if (!presenting) updateLabels();
  if (rig.mode === 'inside') { hud.update(); const [hx, hz] = localHeading(); pane.inside = { heading: Math.atan2(hz, hx) }; }
  if (presenting || !state.split) {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.render(scene, camera);
    return;
  }
  // Side by side: the lattice on the left, the roots on the right, one renderer.
  renderer.setScissorTest(true);
  if (view3d.w > 0) {
    renderer.setViewport(0, 0, view3d.w, view3d.h); renderer.setScissor(0, 0, view3d.w, view3d.h);
    renderer.render(scene, camera);
  }
  pane.render(renderer, scene);
  pane.drawOverlay({ selected: state.selected, hovered: state.hovered >= 0 ? stars.coefficients(state.hovered) : null, plane: state.plane, palette: state.palette });
}

// ---------------------------------------------------------------------------------------------------------------
// The group element g: dragging, snapping, T and S

let gAnim = null, flashTimer;
function setG(g) {
  state.g = g;
  stars.setRho(G.displayPushforward(g));
  dirty = true;
  updateReadout();
}
function stepGAnimation(dt) {
  if (!gAnim) return false;
  const a = gAnim;
  a.t = Math.min(1, a.t + dt / a.duration);
  setG(G.interpolate(a.from, a.to, a.t < 0.5 ? 2 * a.t * a.t : 1 - (-2 * a.t + 2) ** 2 / 2));
  if (a.t >= 1) { gAnim = null; setG(a.to); a.done?.(); }
  return true;
}
function animateG(to, done) {
  if (rig.reducedMotion) { setG(to); done?.(); return; }
  gAnim = { from: [...state.g], to, t: 0, duration: 0.65, done };
}
/** Fold an integral g into the exact labels: the selection and plane are relabeled by γ and g returns to 1. */
function absorb() {
  const gamma = state.g.map(Math.round);
  if (!G.isIntegral(gamma) || gamma.every((x, i) => x === G.identity[i])) { setG([...G.identity]); return; }
  const move = p => G.pushforwardExact(gamma, p).map(Number);
  const before = state.selected;
  if (state.selected) state.selected = move(state.selected);
  if (state.plane) state.plane = Pl.planeFromNormal(move(state.plane.normal));
  setG([...G.identity]);
  flash(before ? `γ = ${matrixText(gamma)} · ${tupleText(before)} ↦ ${tupleText(state.selected)}` : `γ = ${matrixText(gamma)}`);
  if (!inspector.el.hidden) inspector.show(state.selected);
}
function applyIntegral(name) {
  const gen = { T: G.T, S: G.S, Tinv: G.inverse(G.T) }[name];
  animateG(G.multiply(gen, state.g), () => { if (G.isIntegral(state.g.map(x => Math.round(x * 1e9) / 1e9))) absorb(); });
}
function updateReadout() {
  const id = state.g.every((x, i) => Math.abs(x - G.identity[i]) < 1e-9);
  $('g-readout').textContent = id ? '' : `g = ${matrixText(state.g)}  ·  g·i = ${complexText(G.act(state.g, { x: 0, y: 1 }))}`;
}
function flash(text) {
  $('g-readout').textContent = text;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(updateReadout, 3200);
}

// ---------------------------------------------------------------------------------------------------------------
// Pointer and keyboard

const raycaster = new THREE.Raycaster();
/** Normalized device coordinates in the 3D view (the left part of the canvas when the pane is open). */
const ndc = e => new THREE.Vector2((e.clientX / Math.max(view3d.w, 1)) * 2 - 1, -(e.clientY / view3d.h) * 2 + 1);
/** The half-plane point under the pointer on the current picture, or null. In the bare lattice only a line of
 * sight from the origin has one. */
function rootAt(e) {
  if (tw.get('morph') < 0.5 && rig.mode !== 'origin') return null;
  raycaster.setFromCamera(ndc(e), camera);
  const inv = world.matrixWorld.clone().invert();
  return Mo.rayToRoot(raycaster.ray.origin.clone().applyMatrix4(inv), raycaster.ray.direction.clone().transformDirection(inv), tw.get('morph'), H, HP);
}
function pickAt(e, radiusPx) {
  camera.updateMatrixWorld(); world.updateMatrixWorld();
  const toClip = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(world.matrixWorld);
  const p = ndc(e);
  return stars.pick(p.x, p.y, toClip, canvas.clientHeight, { radiusPx, aspect: camera.aspect });
}

let skyRoot = null, hoverEvent = null;
new PointerInput(canvas, {
  start: () => { rig.stopInertia(); },
  classify: e => {
    if (pane.contains(e)) {
      skyRoot = e.shiftKey ? null : pane.rootAt(e);
      if (skyRoot) { gAnim = null; return 'pane-drag'; }
      return 'pane-pan';
    }
    skyRoot = rootAt(e);
    if (skyRoot) { gAnim = null; return 'sky'; }
    return rig.mode === 'outside' ? 'orbit' : 'look';
  },
  secondary: e => (pane.contains(e) ? 'pane-pan' : rig.mode === 'outside' ? 'pan' : 'look'),
  drag: (kind, dx, dy, e, px, py) => {
    if (kind === 'pane-pan') pane.pan(px, py);
    else if (kind === 'pane-drag') {
      // Inside, the pane is a fixed map, so dragging it pans; elsewhere it moves the stars as in her viewer.
      if (pane.inside) pane.pan(px, py);
      else { const z1 = pane.rootAt(e); if (z1 && skyRoot) setG(G.dragStep(state.g, skyRoot, z1)); if (z1) skyRoot = z1; }
    } else if (kind === 'orbit') rig.orbit(dx * 3.2, dy * 3.2);
    else if (kind === 'pan') rig.pan(dx, dy);
    else if (kind === 'look') rig.look(dx * 1.6, dy * 1.6);
    else if (kind === 'sky') {
      const z1 = rootAt(e);
      if (z1 && skyRoot) setG(G.dragStep(state.g, skyRoot, z1));
      if (z1) skyRoot = z1;
    }
    dirty = true;
  },
  pinch: (scale, dx, dy) => {
    rig.zoom(scale);
    if (rig.mode === 'outside') rig.pan(dx, dy); else rig.look(dx * 1.6, dy * 1.6);
    dirty = true;
  },
  wheel: (f, e) => { if (pane.contains(e)) pane.zoom(f, e); else rig.zoom(f); dirty = true; },
  end: kind => {
    // Inside, dragging the ground is walking, and stays where you leave it.
    if ((kind !== 'sky' && kind !== 'pane-drag') || !state.snap || rig.mode === 'inside') return;
    const gamma = G.nearestIntegral(state.g);
    if (gamma) animateG(gamma, absorb);
  },
  click: (e, shift) => {
    const i = pane.contains(e) ? pane.pick(e, isMobile ? 18 : 11) : pickAt(e, isMobile ? 22 : 14);
    if (i < 0) { if (!shift) select(null); return; }
    const coef = stars.coefficients(i);
    if (shift && state.selected) pairWith(coef); else select(coef);
  },
  hover: e => {
    // At most one pick per animation frame.
    if (hoverEvent) { hoverEvent = e; return; }
    hoverEvent = e;
    requestAnimationFrame(() => {
      const ev = hoverEvent, i = pane.contains(ev) ? pane.pick(ev, 9) : pickAt(ev, 11); hoverEvent = null;
      if (i === state.hovered) return;
      state.hovered = i; dirty = true;
      canvas.classList.toggle('hovering', i >= 0);
      // Previews never replace a card the user opened; they show while the inspector is closed.
      const pinned = !inspector.el.hidden && !inspector.el.classList.contains('preview');
      if (!pinned) i >= 0 ? inspector.show(stars.coefficients(i), { preview: true }) : inspector.hide();
    });
  },
});

const keys = new HeldKeys({
  // First-person vantages take over the movement keys while they are held.
  owns: k => (rig.mode === 'inside' && /^(arrow(up|down|left|right)|[wasdqe])$/.test(k)) || (rig.mode === 'origin' && /^[wasdqe]$/.test(k)),
  press: k => {
    if (k === 'ArrowRight') tour.go(state.chapter + 1);
    else if (k === 'ArrowLeft') tour.go(state.chapter - 1);
    else if (k === 'o' || k === 'O') (rig.mode === 'origin' ? goOutside() : goOrigin());
    else if (k === 'i' || k === 'I') (rig.mode === 'inside' ? goOrigin() : goInside());
    else if (k === 'r' || k === 'R') toggleSplit();
    else if (k === 'p' || k === 'P') setMorph((Math.round(tw.get('morph')) + 1) % 4);
    else if (k === 't') applyIntegral('T');
    else if (k === 'T') applyIntegral('Tinv');
    else if (k === 's') applyIntegral('S');
    else if (k === 'Escape') { select(null); clearPlane(); clearShell(); }
    else if (k === '?') $('help-open').click();
    else if (/^[1-9]$/.test(k) && Number(k) <= CHAPTERS.length) tour.go(Number(k) - 1);
  },
});
/** Movement from held keys each frame: leaning at the origin, walking inside. */
function stepKeys(dt) {
  if (!keys.any || rig.animating) return false;
  const k = n => keys.held(n);
  if (rig.mode === 'origin') {
    const s = 2.4 * dt;
    rig.lean((k('d') - k('a')) * s, (k('e') - k('q')) * s, (k('s') - k('w')) * s);
    return true;
  }
  if (rig.mode !== 'inside') return false;
  const turn = (k('arrowleft') + k('q') - k('arrowright') - k('e')) * 1.6 * dt;
  if (turn) rig.look(-turn, 0);
  const forward = k('w') + k('arrowup') - k('s') - k('arrowdown'), side = k('d') - k('a');
  if (forward || side) {
    // In the plane's own (standard) orientation your right is clockwise from your heading.
    const [hx, hz] = localHeading();
    setG(walk(state.g, Math.atan2(hz, hx) - Math.atan2(side, forward), 1.1 * dt));
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Selection, planes, shells

const inspector = new Inspector({
  state,
  actions: {
    lookAt: coef => lookAtStar(coef),
    showShell: k => { state.shellK = k; shell.userData.set(k, 40); dirty = true; inspector.show(state.selected); },
    clearPlane: () => { clearPlane(); inspector.show(state.selected); },
    clearShell: () => { clearShell(); inspector.show(state.selected); },
  },
});
function clearPlane() { state.plane = null; dirty = true; }
function clearShell() { state.shellK = 0; shell.visible = false; dirty = true; }

/** Select an exact identity. `quiet` (used by the tour) rings it without opening the inspector or cutting planes. */
function select(coef, { quiet = false } = {}) {
  state.selected = coef;
  dirty = true;
  writeHash();
  if (!coef) { inspector.hide(); return; }
  if (quiet) { inspector.hide(); return; }
  if (F.kind(...coef) === 'exterior') {
    const plane = Pl.planeFromNormal(coef);
    if (!plane.error) state.plane = plane;
  }
  inspector.show(coef);
}
function pairWith(coef) {
  const first = state.selected;
  if (F.discriminant(...first) >= 0 || F.discriminant(...coef) >= 0) { flash('Pair two stars (complex roots) for their geodesic.'); return; }
  const plane = Pl.planeThrough(first, coef);
  if (plane.error) { flash(plane.error); return; }
  state.plane = plane;
  flash(`plane ${Pl.planeEquation(plane.normal)} through ${tupleText(first)} and ${tupleText(coef)}`);
  inspector.show(first);
  dirty = true;
}
function lookAtStar(coef) {
  const v = new THREE.Vector3(...G.apply3(G.displayPushforward(state.g), F.toDisplay(...coef)));
  if (v.y < 0) v.negate();
  v.normalize();
  goOrigin({ pitch: Math.min(Math.asin(Math.min(1, v.y)), Math.PI / 2 - 1e-4), yaw: Math.atan2(-v.x, -v.z), fov: 70 });
}
function stepShell(delta) {
  let k = state.shellK || 3;
  do { k += delta; } while (k > 2 && ((-k % 4) + 4) % 4 > 1);
  state.shellK = Math.max(3, k);
  shell.userData.set(state.shellK, 40);
  const forms = F.reducedForms(state.shellK);
  if (forms.length) select(forms[0], { quiet: true });
  updateShellReadout(); dirty = true;
}
function updateShellReadout() {
  const el = document.getElementById('shell-readout'), k = state.shellK;
  if (!el || !k) return;
  const forms = F.reducedForms(k);
  el.innerHTML = `<b>Δ = −${k}</b>: h(−${k}) = ${forms.length}, reduced forms ${forms.map(f => `<span class="math">${F.polynomialText(...f)}</span>`).join(', ')}.`;
}

// ---------------------------------------------------------------------------------------------------------------
// Vantage points: Outside, Origin, Inside

/** Your heading in the plane's own coordinates (the world is mirrored in X inside). */
function localHeading() { const [hx, hz] = rig.heading(); return world.scale.x < 0 ? [-hx, hz] : [hx, hz]; }
const hud = new InsideHud({ state, rig, stars, heading: localHeading });
function setView(mode) {
  document.body.classList.toggle('inside', mode === 'inside');
  // From the origin a star needs a smaller radius: only the nearest few resolve, the rest are points of light.
  tw.set('r0', { origin: 0.045, inside: 0.04, outside: 0.11 }[mode], 1.2);
  for (const m of ['outside', 'origin', 'inside']) $('v-' + m).setAttribute('aria-pressed', String(mode === m));
}
/**
 * Inside, the world is scaled so the ground disk (the plane Y = h) lies at your feet, and mirrored in X: the
 * standard orientation of H² is the one seen from below (from the origin), so standing on top of the plane would
 * otherwise show its mirror image, and your left and right would be swapped relative to Series' L/R convention.
 */
function setWorldFrame(inside) {
  world.scale.set(inside ? -INSIDE_SCALE : 1, inside ? INSIDE_SCALE : 1, inside ? INSIDE_SCALE : 1);
  world.position.set(0, inside ? -H * INSIDE_SCALE : 0, 0);
  camera.near = inside ? 0.002 : 0.02; camera.updateProjectionMatrix();
}
/** A short fade through black. `always` fades even without reduced motion (changing worlds, not just views). */
function fade(fn, always = false) {
  if (!always && !rig.reducedMotion) { fn(); return; }
  $('veil').classList.add('on');
  setTimeout(() => { fn(); dirty = true; setTimeout(() => $('veil').classList.remove('on'), 80); }, 280);
}
function leaveInside() {
  pane.inside = null;
  setWorldFrame(false);
  tw.set('floor', 0, 0);
  hud.show(false);
}
function goInside(pose = {}) {
  if (rig.mode === 'inside') { rig.go('inside', pose, 0.8); return; }
  fade(() => {
    setView('inside');
    setWorldFrame(true);
    Object.entries({ morph: 2, floor: 1, cone: 0, screen: 0, depthOn: 1, a_upper: 1, a_lower: 0, a_exterior: 0, a_null: 1 })
      .forEach(([k, v]) => tw.set(k, v, 0));
    $('morph').value = '2'; state.morphTarget = 2;
    clearPlane(); clearShell();
    rig.go('inside', pose, 0);
    // Start inside a triangle, not on an edge: at the center of (0, 1, ∞), on the star x² − x + 1.
    setG(G.toI({ x: 0.5, y: Math.sqrt(3) / 2 }));
    hud.reset(); hud.show(true); hud.eyeLabel();
    pane.resetView();
    $('eye').value = String(rig.inside.eye);
  }, true);
}
function goOrigin(pose = {}) {
  const go = () => { setView('origin'); rig.go('origin', { ...pose, lean: new THREE.Vector3(...(pose.leanArr ?? [0, 0, 0])) }); };
  if (rig.mode === 'inside') fade(() => { leaveInside(); tw.set('cone', 1, 0); tw.set('screen', 1, 0); setMorph(1, 0); go(); rig.apply(); }, true);
  else fade(go);
  dirty = true;
}
function goOutside(pose = {}) {
  const o = { ...pose };
  if (Array.isArray(o.target)) o.target = new THREE.Vector3(...o.target);
  const go = () => { setView('outside'); rig.go('outside', o); };
  if (rig.mode === 'inside') fade(() => { leaveInside(); tw.set('cone', 1, 0); setMorph(0, 0); go(); }, true);
  else fade(go);
  dirty = true;
}
function leanTo(v) { if (rig.mode === 'origin') rig.go('origin', { lean: new THREE.Vector3(...v) }, 0.9); }
function setMorph(m, seconds = 1.1) {
  state.morphTarget = m;
  tw.set('morph', m, seconds);
  if (m >= 0.5) tw.set('screen', 1, 0.6);
  $('morph').value = String(m);
}
function setEye(h) { rig.setEye(h); $('eye').value = String(h); hud.eyeLabel(); dirty = true; }

// ---------------------------------------------------------------------------------------------------------------
// The tour

function applyScene(s) {
  if (s.view === 'inside') { goInside(s.pose ?? {}); if (s.select) setTimeout(() => select(s.select, { quiet: true }), 320); return; }
  if (s.view === 'origin') goOrigin({ ...(s.pose ?? {}), leanArr: s.lean });
  else if (s.view === 'outside') goOutside(s.pose ?? {});
  if (s.morph !== undefined) setMorph(s.morph, 1.4);
  if (s.alpha) for (const [k, v] of Object.entries(s.alpha)) tw.set('a_' + k, v, 1.0);
  if (s.depth !== undefined) tw.set('depthOn', s.depth === 'deep' ? 1 : 0, 0);
  if (s.cone !== undefined) tw.set('cone', s.cone ? 1 : 0, 0.8);
  if (s.screen !== undefined) tw.set('screen', s.screen ? 1 : 0, 0.8);
  if ('plane' in s) state.plane = s.plane ? Pl.planeFromNormal(s.plane) : null;
  if (s.shell !== undefined) { if (s.shell) { state.shellK = s.shell; shell.userData.set(s.shell, 40); } else clearShell(); }
  if (s.select !== undefined) select(s.select, { quiet: true });
  if (state.g.some((x, i) => x !== G.identity[i])) setG([...G.identity]);
  dirty = true;
}
const narrow = matchMedia('(max-width: 760px)');
const tour = {
  go(i, { apply = true } = {}) {
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
    updateShellReadout();
    writeHash();
  },
  syncCollapse() {
    const open = narrow.matches ? $('chapter').classList.contains('expanded') : !$('chapter').classList.contains('collapsed');
    $('c-collapse').textContent = open ? '–' : '+';
    $('c-collapse').setAttribute('aria-label', open ? 'Hide the tour text' : 'Show the tour text');
  },
  toggle() {
    $('chapter').classList.toggle(narrow.matches ? 'expanded' : 'collapsed');
    tour.syncCollapse();
  },
};
CHAPTERS.forEach((c, i) => {
  const li = document.createElement('li'), b = button(String(i + 1), () => tour.go(i));
  b.setAttribute('aria-label', `Chapter ${i + 1}: ${c.title}`);
  li.append(b); $('c-dots').append(li);
});
$('c-prev').onclick = () => tour.go(state.chapter - 1);
$('c-next').onclick = () => tour.go(state.chapter + 1);
$('c-collapse').onclick = tour.toggle;
$('c-title').onclick = () => { if (narrow.matches) tour.toggle(); };
// On short screens the tour starts folded so the sky is the first thing you see.
if (window.innerHeight < 700 && !narrow.matches) $('chapter').classList.add('collapsed');
tour.syncCollapse();

// ---------------------------------------------------------------------------------------------------------------
// Dock and settings

$('v-outside').onclick = () => goOutside();
$('v-origin').onclick = () => goOrigin();
$('v-inside').onclick = () => goInside();
$('v-split').onclick = () => toggleSplit();
function toggleSplit() { state.split = !state.split; layout(); if (!rig.animating) rig.apply(); }
$('roots-home').onclick = () => { pane.resetView(); dirty = true; };
$('morph').addEventListener('input', e => { const m = Number(e.target.value); state.morphTarget = m; tw.set('morph', m, 0.15); if (m > 0.3) tw.set('screen', 1, 0.5); });
$('g-t').onclick = () => applyIntegral('T');
$('g-tinv').onclick = () => applyIntegral('Tinv');
$('g-s').onclick = () => applyIntegral('S');
$('g-snap').onclick = () => { state.snap = !state.snap; $('g-snap').setAttribute('aria-pressed', String(state.snap)); };
$('dock-toggle').onclick = () => { const o = $('dock').classList.toggle('open'); $('dock-toggle').setAttribute('aria-expanded', String(o)); };
const toggleSheet = (id, other) => () => { $(id).hidden = !$(id).hidden; $(other).hidden = true; };
$('settings-open').onclick = toggleSheet('settings', 'help');
$('help-open').onclick = toggleSheet('help', 'settings');
$('settings-close').onclick = () => { $('settings').hidden = true; };
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
const setting = (id, event, fn) => $(id).addEventListener(event, e => { fn(e.target); dirty = true; });
setting('s-palette', 'change', t => { state.palette = t.value; stars.setPalette(state.palette); paletteUI(); });
setting('s-depth', 'change', t => { state.starDepth = Number(t.value); });
setting('s-exposure', 'input', t => { state.exposure = Number(t.value); });
setting('s-style', 'change', t => { state.style = Number(t.value); });
setting('s-beta', 'input', t => { stars.uniforms.uBeta.value = Number(t.value); $('s-beta-v').textContent = Number(t.value).toFixed(2); });
setting('s-size', 'input', t => { state.size = Number(t.value); });
setting('s-cone', 'change', t => { state.show.cone = t.checked; });
setting('s-dust', 'change', t => { state.show.dust = t.checked; });
setting('s-lower', 'change', t => { state.show.lower = t.checked; });
setting('s-multiples', 'change', t => { state.show.multiples = t.checked; });
$('s-motion').checked = rig.reducedMotion;
setting('s-motion', 'change', t => { rig.reducedMotion = tw.reducedMotion = t.checked; });
$('eye').addEventListener('input', e => setEye(Number(e.target.value)));
$('h-reset').onclick = () => { animateG([...G.identity]); hud.reset(); };
$('h-clear').onclick = () => { hud.reset(); dirty = true; };

// ---------------------------------------------------------------------------------------------------------------
// Shareable state in the URL hash: #c=3&sel=1,1,1

function writeHash() {
  const parts = [`c=${state.chapter + 1}`];
  if (state.selected) parts.push(`sel=${state.selected.join(',')}`);
  history.replaceState(null, '', '#' + parts.join('&'));
}
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  tour.go((Number(q.get('c')) || 1) - 1);
  const sel = q.get('sel')?.split(',').map(Number);
  if (sel?.length === 3 && sel.every(Number.isSafeInteger) && sel.some(x => x)) select(sel, { quiet: true });
}

// ---------------------------------------------------------------------------------------------------------------

/** What the tour's actions and the XR panels may call. */
const api = {
  rig, leanTo, goOrigin, goOutside, goInside, setMorph, setEye, applyIntegral, stepShell, select,
  renderChapter: i => tour.go(i),
  chapter: () => ({ ...CHAPTERS[state.chapter], index: state.chapter, count: CHAPTERS.length }),
  restoreFrame: () => { setWorldFrame(rig.mode === 'inside'); dirty = true; },
  get state() { return state; },
};

resize();
readHash();
xr = setupXR({ renderer, scene, world, stars, state, api, markDirty, setG, animateG, absorb, H, HP });
renderer.setAnimationLoop(frame);
window.starscape = { state, rig, stars, api, setG, tweens: tw, pane, G, F };   // for the console and tests
