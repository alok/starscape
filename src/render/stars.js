// The lattice of integer quadratics as one GPU point cloud.
//
// Each point carries its exact coefficients (a, b, c). The vertex shader applies the Lorentz transformation ρ(g),
// then a morph through four pictures, each placed so that the next is continuous with it:
//   0  the lattice itself, at display position v = ρ(g)·(−b, a+c, c−a);
//   1  Klein: v slid along its ray onto the screen Y = h (unchanged as seen from the origin);
//   2  Poincaré: the same disk, conformal;
//   3  the upper half-plane on the same screen, i at its center and ∞ toward +Z.
// Radii follow one rule: a star is a hyperbolic disk of radius R₀/√|Δ|. Seen from the origin that is just
// perspective; in the half-plane it is a disk of Euclidean radius R₀/(2a). A null form k(qx − p)² drawn as a disk is
// the circle tangent to ℝ at p/q with radius R₀/(2kq²): at R₀ = 1 the forms (qx − p)² are exactly the Ford circles.
// src/math/picture.js mirrors this geometry on the CPU, where it is tested.
//
// Sprites conserve energy: below uMinPx a star keeps that size and dims by (px/uMinPx)², so brightness falls
// like 1/distance² and the simplest numbers, which are nearest the origin, shine brightest.
//
// Which points are drawn is decided in the picture, as in Stange's viewer: stars and the upper cone by their depth
// a′ + c′ after ρ(g), dust by its distance from the origin after ρ(g), each fading out over the last 14% of its bound.
// SL₂(ℤ) maps that set onto itself, so a snap lands the sky on itself and relabeling it changes nothing, and a drag
// never thins the sky on one side. The buffer is a catalogue of the points near the current viewpoint g⁻¹·i,
// padded by PAD, and re-enumerated off the main thread whenever the viewpoint drifts from it.
//
// The catalogue's coefficients are labels in an integral frame γ: the buffer holds ρ(γ)·f for the app's label f,
// with γ moving the viewpoint into the standard fundamental domain, so the buffered integers stay small however far
// you walk (float32 positions stay sharp; Δ and the plane test stay exact, as lean-float proves under such bounds).
// coefficients(i) gives back the app's label; the shader's ρ is ρ(g·γ⁻¹).
import * as THREE from 'three';
import { paletteTexture, kindColors, DELTA_RANGE } from './palette.js';
import { stageAt } from '../math/picture.js';
import { catalogue } from '../math/forms.js';
import * as G from '../math/sl2.js';
import { gpuArrays } from './pack.js';

const vertexShader = /* glsl */ `
attribute vec2 meta;     // kind, primitive; position holds the coefficients (a, b, c) in the catalogue's frame
uniform mat3 uRho;       // moves the frame's labels into the picture drawn
uniform mat3 uCull;      // the same for the live sky, which decides what exists (the Inside map draws it at g = 1)
uniform float uMorph, uH, uHP, uR0, uUnit, uViewportH;
uniform float uMinPx, uKnee, uMaxPx, uExposure, uHaloPx, uFalloff, uRingMaxPx;
uniform float uStyle, uPointPx, uBeta;   // style 1: every point the same tiny size; brightness carries the weight
uniform vec4 uKindAlpha;
uniform float uDepth, uBall, uMultiples;
uniform vec3 uPlane; uniform float uPlaneOn;
uniform float uShell;
uniform sampler2D uRamp;
uniform vec3 uKindColor[4];
uniform float uLogLo, uLogSpan;
varying vec3 vColor;
varying float vAlpha;
varying float vCore;
varying float vHalo;
varying float vPoint;
varying float vRing;   // a null form drawn as a disk is a ring (a horocycle): its drawn radius in px, else 0

// Stange's edge: full strength to 86% of the bound, gone at the bound.
float edge(float x, float bound) { return 1.0 - smoothstep(0.86 * bound, bound, x); }

void main() {
  float a = position.x, b = position.y, c = position.z;
  int kind = int(meta.x + 0.5);
  float delta = b * b - 4.0 * a * c;
  vec3 v0 = vec3(-b, a + c, c - a);
  float m = clamp(uMorph, 0.0, 3.0);

  // Which points exist, judged in the live sky: stars and the upper cone (the Ford circles) by depth, the rest by the
  // ball. a + c > 0 is the future nappe of the cone, which every ρ(g) preserves.
  vec3 w = uCull * v0;
  bool deep = kind == 0 || (kind == 3 && a + c > 0.0);
  float alpha = (deep && uDepth > 0.0 ? edge(w.y, uDepth) : edge(length(w), uBall)) * uKindAlpha[kind];
  // A root belongs to the class [a : b : c], so as the sky flattens into a picture a star's multiples, which share
  // its root, fade away (as in Stange's pane) instead of mixing their own colors into it. The null multiples
  // k(qx − p)² stay: drawn as disks they nest inside their Ford circle.
  if (meta.y < 0.5) alpha *= uMultiples * (kind == 0 ? 1.0 - smoothstep(0.0, 1.0, m) : 1.0);
  // The same for the lower nappe: −f has f's root, so in a picture it would only draw the class twice (doubling the
  // rings at 0 and ±1, tinting stars with the lower cone's color).
  if (kind != 2 && a + c < 0.0) alpha *= 1.0 - smoothstep(0.0, 1.0, m);

  vec3 v = uRho * v0;
  float Y = v.y;

  // Stage positions and radii (display units).
  vec3 P0 = v; float r0 = uR0;
  vec2 k = v.xz / (abs(Y) > 1e-6 ? Y : 1e-6);
  vec3 P1 = vec3(k.x * uH, uH, k.y * uH);
  float r1 = uR0 * uH / max(abs(Y), 1e-6);
  float s = kind == 3 ? 0.0 : sqrt(max(0.0, 1.0 - dot(k, k)));   // exactly 0 on the cone; √ε would lift roots off ℝ
  vec2 p = k / (1.0 + s);
  vec3 P2 = vec3(p.x * uH, uH, p.y * uH);
  float rho = uR0 / sqrt(max(abs(delta), 1.0));
  // A null form's Poincaré radius is the conformal image of its half-plane circle: R₀/(R₀ + |Y|) of the disk.
  float r2 = kind == 3 ? uH * uR0 / (abs(Y) + uR0) : uH * rho * max(0.0, 1.0 - dot(p, p)) * 0.5;
  float den = max(1.0 - k.y, 1e-6);
  vec2 z = vec2(k.x / den, s / den);
  vec3 P3 = vec3(z.x * uHP, uH, (z.y - 1.0) * uHP);
  float aT = 0.5 * (Y - v.z);                       // the transformed leading coefficient a′
  float r3 = uHP * uR0 / (2.0 * max(abs(aT), 1e-3));
  // A null form drawn as a disk is a horocycle: tangent to the boundary at its root. P is the root; lift points
  // from it to the center (inward in the disk, up in the half-plane), and is applied below by the radius drawn.
  bool ring = kind == 3 && uStyle < 0.5;
  vec3 L2 = ring ? vec3(-p.x, 0.0, -p.y) : vec3(0.0), L3 = ring ? vec3(0.0, 0.0, 1.0) : vec3(0.0);

  vec3 P; float r; vec3 lift = vec3(0.0);
  if (m <= 1.0) { P = mix(P0, P1, m); r = mix(r0, r1, m); }
  else if (m <= 2.0) { P = mix(P1, P2, m - 1.0); r = mix(r1, r2, m - 1.0); lift = L2 * (m - 1.0); }
  else { P = mix(P2, P3, m - 2.0); r = mix(r2, r3, m - 2.0); lift = mix(L2, L3, m - 2.0); }
  // Off the cone's inside there is no Klein point; exterior dust fades as the morph begins.
  if (kind == 2) alpha *= 1.0 - smoothstep(0.0, 0.6, m);
  if (kind == 3 && abs(aT) < 1e-3 && m > 2.0) alpha = 0.0;   // the root ∞ leaves the half-plane
  // Invisible points leave now: off-screen positions or radii below would otherwise feed NaN into the blend.
  if (alpha <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vAlpha = 0.0; vColor = vec3(0.0); vCore = 1.0; vHalo = 0.0; vPoint = 0.0; vRing = 0.0; return; }

  // Emphasis: a selected plane (geodesic) or a discriminant shell.
  float emph = 1.0;
  if (uPlaneOn > 0.5) {
    bool on = abs(-2.0 * uPlane.z * a + uPlane.y * b - 2.0 * uPlane.x * c) < 0.5;
    emph = on ? 1.6 : 0.22;
  }
  if (uShell > 0.5) emph *= (kind == 0 && abs(abs(delta) - uShell) < 0.5) ? 1.8 : 0.08;   // the stars on Δ = −k

  vec4 mv = modelViewMatrix * vec4(P, 1.0);
  gl_Position = projectionMatrix * mv;
  // Perspective divides by depth; an orthographic camera (the 2D roots pane) does not.
  bool ortho = projectionMatrix[3][3] > 0.5;
  float depth = ortho ? 1.0 : max(-mv.z, 1e-4);
  float px = r * uUnit * projectionMatrix[1][1] * 0.5 * uViewportH / depth;
  float pxTrue = max(px, 1e-6);
  if (emph > 1.0) px *= 1.25;
  float dim = 1.0, drawn = px;
  // Physically the dimming exponent is 2 (energy conservation); a little more keeps Olbers' glow at bay.
  px = max(px, 0.0);
  if (px < uMinPx) { dim = pow(px / uMinPx, uFalloff); drawn = uMinPx; }
  else if (ring) drawn = min(px, uRingMaxPx);   // a thin ring may be large; it keeps its true size up to the cap
  else if (px > uKnee) drawn = min(uMaxPx, uKnee * sqrt(px / uKnee));
  if (ring) {
    // Tangent on screen: move the center off the root by the radius actually drawn, then project again.
    P += lift * r * (drawn / pxTrue);
    mv = modelViewMatrix * vec4(P, 1.0);
    gl_Position = projectionMatrix * mv;
  }
  vRing = ring ? drawn : 0.0;
  float size = 2.0 * drawn + uHaloPx;
  vHalo = smoothstep(1.6, 4.5, drawn / uMinPx);
  vPoint = uStyle;
  if (uStyle > 0.5) {
    // Points: geometry stays exact (no size). Brightness is the light you would receive at the origin from a
    // point at v: (4/|v|²)^β, with v after ρ(g), so (1, 0, 1) has weight 1 and k·f is k² times dimmer. It changes
    // as you drag, as the sizes do in Stange's viewer. Color carries the invariant |Δ|.
    float weight = 4.0 / max(dot(v, v), 1.0);
    dim = min(1.6, pow(weight, uBeta));
    // The core stays one tiny size for every point. Heavy points get a faint point-spread halo, as bright
    // stars do in a photograph, so brightness reads at a glance without changing the point itself.
    float spread = smoothstep(0.12, 1.0, dim * uExposure);
    drawn = uPointPx * 0.5; size = uPointPx * (1.0 + 4.0 * spread); vHalo = spread;
  }
  gl_PointSize = size;
  vCore = 2.0 * drawn / size;

  vec3 col = uKindColor[kind];
  if (kind == 0) col = texture2D(uRamp, vec2(clamp((log(max(-delta, 1.0)) - uLogLo) / uLogSpan, 0.0, 1.0), 0.5)).rgb;
  vColor = col;
  vAlpha = alpha * dim * min(emph, 1.4) * uExposure;
  if (vAlpha < 0.002) gl_PointSize = 0.0;
}`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vCore;
varying float vHalo;
varying float vPoint;
varying float vRing;
void main() {
  float q = length(gl_PointCoord - 0.5) * 2.0;
  if (q > 1.0) discard;
  float r = q / vCore;   // in units of the core radius
  // Points (vCore = 1) are flat, crisp discs; disks keep a soft gaussian core; horocycles are thin rings.
  bool point = vPoint > 0.5;
  float core = point ? 1.0 - smoothstep(0.55, 1.0, r) : exp(-r * r * 1.8);
  float halo = point ? 0.26 * vHalo * exp(-r * r * 0.12) * (1.0 - q * q) : 0.09 * vHalo * exp(-r * r * 0.25) * (1.0 - q * q);
  if (vRing > 0.0) {
    float d = (r - 1.0) * vRing;   // distance to the circle, in pixels
    core = exp(-d * d * 0.9) + 0.07 * step(r, 1.0);
    if (vRing < 2.5) core = max(core, exp(-r * r * 1.8));   // too small for a ring: a dot
    halo = 0.0;
  }
  float f = (core + halo) * vAlpha;
  if (f < 0.003) discard;
  gl_FragColor = vec4(vColor * f, f);
}`;

export const KIND = { upper: 0, lower: 1, exterior: 2, null: 3 };

/** How far past the drawn bounds the catalogue reaches: the viewpoint may drift ln PAD before the edge shows a gap. */
const PAD = 1.3;
/** Re-enumerate once the viewpoint is this far (hyperbolic distance) from the catalogue's; well inside ln PAD. */
const DRIFT = 0.15;
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1], I = { x: 0, y: 1 };
const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const edge = (x, bound) => 1 - smoothstep(0.86 * bound, bound, x);

/**
 * γ ∈ SL₂(ℤ) moving z into the standard fundamental domain (|x| ≤ ½, |z| ≥ 1), with γ·z; null if z is out of reach
 * of exact labels.
 */
function reduce(z) {
  let m = [1, 0, 0, 1];
  for (let step = 0; step < 100; step++) {
    if (!(Number.isFinite(z.x) && z.y > 0 && Number.isFinite(z.y)) || m.some(x => Math.abs(x) > 2 ** 24)) return null;
    const n = Math.round(z.x);
    if (n) { z = { x: z.x - n, y: z.y }; m = G.multiply([1, -n, 0, 1], m); }
    if (z.x * z.x + z.y * z.y >= 1 - 1e-12) return { m: m.map(x => x + 0), z };
    z = G.act(G.S, z); m = G.multiply(G.S, m);
  }
  return null;
}

export class StarField {
  /** `reach`: the drawn bounds, { depth, ball } (see setReach). */
  constructor(reach, { palette = 'spectrum' } = {}) {
    this.uniforms = {
      uRho: { value: new THREE.Matrix3() }, uCull: { value: new THREE.Matrix3() },
      uMorph: { value: 0 }, uH: { value: 4 }, uHP: { value: 2 }, uR0: { value: 0.12 },
      uUnit: { value: 1 }, uViewportH: { value: 800 },
      uMinPx: { value: 1.1 }, uKnee: { value: 3 }, uMaxPx: { value: 11 }, uExposure: { value: 1 }, uHaloPx: { value: 3 }, uFalloff: { value: 2.4 },
      uRingMaxPx: { value: 48 },
      uStyle: { value: 1 }, uPointPx: { value: 2.5 }, uBeta: { value: 0.55 },
      uKindAlpha: { value: new THREE.Vector4(1, 0.55, 0.45, 0.9) },
      uDepth: { value: 0 }, uBall: { value: reach.ball }, uMultiples: { value: 1 },
      uPlane: { value: new THREE.Vector3() }, uPlaneOn: { value: 0 },
      uShell: { value: 0 },
      uRamp: { value: paletteTexture(palette) },
      uKindColor: { value: kindColors(palette) },
      uLogLo: { value: Math.log(DELTA_RANGE[0]) }, uLogSpan: { value: Math.log(DELTA_RANGE[1] / DELTA_RANGE[0]) },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader,
      transparent: true, depthWrite: false, depthTest: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    this.points = new THREE.Points(new THREE.BufferGeometry(), material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.g = [...G.identity];
    this.reach = this.padded(reach);
    this.jobs = 0; this.pending = null;
    this.onRebuild = null;   // called when a new catalogue replaces the buffer (point indices change)
    this.setLattice(catalogue({ ...this.reach }), [...G.identity], I);
    try {
      this.worker = new Worker(new URL('./catalogue-worker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => { if (data.id === this.pending?.id) this.receive(this.pending, data); };
      // Without module workers, enumerate on the main thread: a few milliseconds per rebuild.
      this.worker.onerror = () => { this.worker = null; const job = this.pending; if (job) this.receive(job, catalogue({ x: job.view.x, y: job.view.y, ...job.reach })); };
    } catch { this.worker = null; }
  }

  padded({ depth, ball }) { return { depth: Math.ceil(PAD * depth), ball: PAD * ball }; }
  /** The bounds the scene draws (star depth, dust radius); the catalogue follows them, padded. */
  setReach(reach) {
    this.uniforms.uBall.value = reach.ball;
    const r = this.padded(reach);
    if (r.depth === this.reach.depth && r.ball === this.reach.ball) return;
    this.reach = r;
    this.pending = null;   // a catalogue in flight has the old bounds
    this.rebase();
  }

  /** Replace the buffer with catalogue L, whose labels are ρ(frame)·f and whose viewpoint is `view` in that frame. */
  setLattice(L, frame, view) {
    const { gpu, meta } = L.gpu ? L : gpuArrays(L), geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(gpu, 3));
    geometry.setAttribute('meta', new THREE.BufferAttribute(meta, 2));
    // Positions are computed in the shader; a huge bounding sphere keeps three.js from culling the cloud.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const old = this.points.geometry;
    this.points.geometry = geometry;
    old.dispose();
    this.lattice = L; this.setFrame(frame); this.view = view;
    this.setG(this.g);
  }

  /** The app's g. The shader gets ρ(g·γ⁻¹) for the frame's labels; a drifting viewpoint asks for a new catalogue. */
  setG(g) {
    this.g = g;
    this.rho = G.displayPushforward(g);   // for the app's labels (stage, coefficients)
    const w = G.act(G.inverse(g), I), here = G.act(this.frame, w), r = reduce(w);
    let drift = G.hyperbolicDistance(here, this.view);
    // An integral move needs no new catalogue, only another frame: the catalogue seen from γ·z is ρ(γ) of the one
    // seen from z. So after a snap, or a cut to T or S, the frame that brings the viewpoint back is free. Either frame
    // covers the sky drawn, so switching never changes the picture.
    if (r) {
      const d = G.hyperbolicDistance(r.z, this.view);
      if (d <= drift + 1e-12) { this.setFrame(r.m); drift = d; }
    }
    this.rel = G.displayPushforward(G.multiply(g, G.inverse(this.frame)));
    this.uniforms.uRho.value.set(...this.rel);
    this.uniforms.uCull.value.set(...this.rel);
    const identity = g.every((x, j) => x === G.identity[j]);
    const home = this.frame.every((x, j) => x === G.identity[j]) && this.view.x === 0 && this.view.y === 1;
    if (home) this.homeward = false;
    if (!(drift <= DRIFT) || (this.homeward && identity && !home)) this.rebase();
  }
  /**
   * The app relabeled its labels by γ ∈ SL₂(ℤ) (and will set g = 1): the buffer keeps its points under new labels, so
   * nothing on screen changes. At rest the buffer then goes back to the catalogue seen from i, in the app's labels.
   */
  absorb(gamma) {
    const inv = G.inverse(gamma);
    this.setFrame(G.multiply(this.frame, inv));
    if (this.pending) this.pending.frame = G.multiply(this.pending.frame, inv);
    this.homeward = true;
  }
  /** The catalogue's integral frame γ, with the ρ(γ⁻¹) that turns its labels back into the app's (null at home). */
  setFrame(m) {
    this.frame = m;
    this.unframe = m.every((x, j) => x === G.identity[j]) ? null : G.pushforward(G.inverse(m));
  }
  /** ρ(g·γ⁻¹): what the shader needs to draw this field at g (the roots pane draws the Inside map at g = 1). */
  relative(g) { return G.displayPushforward(G.multiply(g, G.inverse(this.frame))); }

  /** Enumerate the catalogue around the current viewpoint, off the main thread when possible. One at a time. */
  rebase() {
    if (this.pending) return;
    // Out of reach of exact labels (dozens of units from i) the sky keeps its last catalogue.
    const r = reduce(G.act(G.inverse(this.g), I));
    if (!r) return;
    const job = { id: ++this.jobs, frame: r.m, view: r.z, reach: { ...this.reach } };
    this.pending = job;
    if (this.worker) this.worker.postMessage({ id: job.id, x: job.view.x, y: job.view.y, ...job.reach });
    else this.receive(job, catalogue({ x: job.view.x, y: job.view.y, ...job.reach }));
  }
  receive(job, L) {
    this.pending = null;
    this.setLattice(L, job.frame, job.view);
    this.onRebuild?.();
  }

  setPalette(name) {
    this.uniforms.uRamp.value.dispose();
    this.uniforms.uRamp.value = paletteTexture(name);
    this.uniforms.uKindColor.value = kindColors(name);
  }

  /** The app's label of point i: the frame's label pulled back by γ⁻¹. */
  coefficients(i) {
    const c = this.lattice.coefficients, f = [c[3 * i], c[3 * i + 1], c[3 * i + 2]];
    return this.unframe ? G.apply3(this.unframe, f).map(x => x + 0) : f;
  }
  /** A form in the app's labels relabeled into the frame's (for the shader's exact plane test). */
  framed(f) { return G.pushforwardExact(this.frame, f).map(Number); }

  /** CPU mirror of the shader's position and radius for one triple (display units): src/math/picture.js. */
  stage(a, b, c, rho = this.rho ?? I3, morph = this.uniforms.uMorph.value) {
    const u = this.uniforms;
    return stageAt(a, b, c, rho, morph, { H: u.uH.value, HP: u.uHP.value, R0: u.uR0.value, disks: u.uStyle.value < 0.5 });
  }
  /**
   * stage() for one of the app's labels at g, computed as the shader does, through the frame. Far from i the app's
   * labels grow large and ρ(g) cancels them in floating point; the frame's labels and ρ(g·γ⁻¹) stay small.
   */
  stageOf(coef, g = this.g, morph = this.uniforms.uMorph.value) { return this.stage(...this.framed(coef), this.relative(g), morph); }
  /** stage() for buffer point i in the live sky. */
  stageIndex(i, morph = this.uniforms.uMorph.value) {
    const c = this.lattice.coefficients;
    return this.stage(c[3 * i], c[3 * i + 1], c[3 * i + 2], this.rel, morph);
  }

  /**
   * Is point i drawn with the current filters, in a picture at `morph` under `rho` (the 3D view's by default; the roots
   * pane passes its own)? Mirrors the shader: its edge fades, kind alpha, multiples and roots at ∞ hidden. Which stars
   * exist is decided by the live sky, as the shader's uCull. A point fading below 5% counts as gone, so faint edges are
   * not picked.
   */
  visible(i, morph = this.uniforms.uMorph.value, rho = this.rel) {
    const u = this.uniforms, L = this.lattice, kind = L.kinds[i], r = this.rel;
    const a = L.coefficients[3 * i], b = L.coefficients[3 * i + 1], c = L.coefficients[3 * i + 2];
    const X0 = -b, Y0 = a + c, Z0 = c - a;
    const x = r[0] * X0 + r[1] * Y0 + r[2] * Z0, y = r[3] * X0 + r[4] * Y0 + r[5] * Z0, z = r[6] * X0 + r[7] * Y0 + r[8] * Z0;
    const deep = kind === 0 || (kind === 3 && a + c > 0);
    const present = deep && u.uDepth.value > 0 ? edge(y, u.uDepth.value) : edge(Math.hypot(x, y, z), u.uBall.value);
    const ka = [u.uKindAlpha.value.x, u.uKindAlpha.value.y, u.uKindAlpha.value.z, u.uKindAlpha.value.w][kind];
    if (present * ka < 0.05) return false;
    if (!L.primitive[i] && u.uMultiples.value * (kind === 0 ? 1 - smoothstep(0, 1, morph) : 1) < 0.05) return false;
    if (kind !== 2 && a + c < 0 && 1 - smoothstep(0, 1, morph) < 0.05) return false;
    if (kind === 2 && morph > 0.5) return false;
    if (kind === 3 && this.stage(a, b, c, rho, morph).hidden) return false;
    // A shown shell only dims the stars off it (the shader's emphasis), so they stay pickable.
    return true;
  }

  /**
   * Nearest drawn star to a pointer, in screen space. `toClip` maps display coordinates to clip space
   * (projection · view · lattice group). Returns the index or −1.
   */
  pick(ndcX, ndcY, toClip, viewportH, { radiusPx = 12, aspect = 1 } = {}) {
    const e = toClip.elements, n = this.lattice.count, rho = this.rel, co = this.lattice.coefficients;
    let best = -1, bestScore = Infinity;
    const halfH = viewportH / 2, fast = this.uniforms.uMorph.value === 0;
    for (let i = 0; i < n; i++) {
      if (!this.visible(i)) continue;
      const a = co[3 * i], b = co[3 * i + 1], c = co[3 * i + 2];
      let x, y, z;
      if (fast) {
        const X0 = -b, Y0 = a + c, Z0 = c - a;
        x = rho[0] * X0 + rho[1] * Y0 + rho[2] * Z0; y = rho[3] * X0 + rho[4] * Y0 + rho[5] * Z0; z = rho[6] * X0 + rho[7] * Y0 + rho[8] * Z0;
      } else [x, y, z] = this.stage(a, b, c, rho).position;
      const w = e[3] * x + e[7] * y + e[11] * z + e[15];
      if (w <= 1e-6) continue;
      const cx = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w, cy = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
      const dx = (cx - ndcX) * halfH * aspect, dy = (cy - ndcY) * halfH, d = Math.hypot(dx, dy);
      if (d > radiusPx) continue;
      // Prefer nearer (brighter) stars when several are under the pointer.
      const score = d + 4 * Math.log(w) + (a + c < 0 ? 1e-3 : 0);   // ±f coincide in the pictures: prefer the future nappe
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
}
