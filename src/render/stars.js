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
import * as THREE from 'three';
import { paletteTexture, kindColors, DELTA_RANGE } from './palette.js';
import { stageAt } from '../math/picture.js';

const vertexShader = /* glsl */ `
attribute vec3 coef;
attribute vec2 meta;
uniform mat3 uRho;
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

void main() {
  float a = coef.x, b = coef.y, c = coef.z;
  int kind = int(meta.x + 0.5);
  float delta = b * b - 4.0 * a * c;
  vec3 v0 = vec3(-b, a + c, c - a);

  // Which points exist in this scene: stars and the upper cone (the Ford circles) by depth, the rest by the ball.
  bool deep = kind == 0 || (kind == 3 && a > 0.0);
  float present = deep && uDepth > 0.0 ? (a + c <= uDepth ? 1.0 : 0.0) : (dot(v0, v0) <= uBall * uBall ? 1.0 : 0.0);
  float alpha = present * uKindAlpha[kind];
  if (meta.y < 0.5) alpha *= uMultiples;

  vec3 v = uRho * v0;
  float Y = v.y;
  float m = clamp(uMorph, 0.0, 3.0);

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

export class StarField {
  /** @param {{count:number, coefficients:Int32Array, kinds:Uint8Array, primitive:Uint8Array}} lattice */
  constructor(lattice, { palette = 'spectrum' } = {}) {
    this.lattice = lattice;
    const n = lattice.count, coef = new Float32Array(3 * n), meta = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      coef[3 * i] = lattice.coefficients[3 * i];
      coef[3 * i + 1] = lattice.coefficients[3 * i + 1];
      coef[3 * i + 2] = lattice.coefficients[3 * i + 2];
      meta[2 * i] = lattice.kinds[i];
      meta[2 * i + 1] = lattice.primitive[i];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('coef', new THREE.BufferAttribute(coef, 3));
    geometry.setAttribute('meta', new THREE.BufferAttribute(meta, 2));
    // Positions are computed in the shader; a dummy attribute keeps three.js happy and the cloud never culled.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * n), 3));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uRho: { value: new THREE.Matrix3() },
      uMorph: { value: 0 }, uH: { value: 4 }, uHP: { value: 2 }, uR0: { value: 0.12 },
      uUnit: { value: 1 }, uViewportH: { value: 800 },
      uMinPx: { value: 1.1 }, uKnee: { value: 3 }, uMaxPx: { value: 11 }, uExposure: { value: 1 }, uHaloPx: { value: 3 }, uFalloff: { value: 2.4 },
      uRingMaxPx: { value: 48 },
      uStyle: { value: 1 }, uPointPx: { value: 2.5 }, uBeta: { value: 0.55 },
      uKindAlpha: { value: new THREE.Vector4(1, 0.55, 0.45, 0.9) },
      uDepth: { value: 0 }, uBall: { value: 6 }, uMultiples: { value: 1 },
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
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  setPalette(name) {
    this.uniforms.uRamp.value.dispose();
    this.uniforms.uRamp.value = paletteTexture(name);
    this.uniforms.uKindColor.value = kindColors(name);
  }
  /** ρ(g) in display coordinates, row-major. */
  setRho(m) { this.uniforms.uRho.value.set(...m); this.rho = m; }

  coefficients(i) {
    const c = this.lattice.coefficients;
    return [c[3 * i], c[3 * i + 1], c[3 * i + 2]];
  }

  /** CPU mirror of the shader's position and radius for one triple (display units): src/math/picture.js. */
  stage(a, b, c, rho = this.rho ?? [1, 0, 0, 0, 1, 0, 0, 0, 1], morph = this.uniforms.uMorph.value) {
    const u = this.uniforms;
    return stageAt(a, b, c, rho, morph, { H: u.uH.value, HP: u.uHP.value, R0: u.uR0.value, disks: u.uStyle.value < 0.5 });
  }

  /**
   * Is point i drawn with the current filters? Mirrors the shader's `present`, kind alpha and hidden roots at ∞, in the
   * picture `morph` under `rho`: the 3D view's by default; the roots pane passes its own.
   */
  visible(i, morph = this.uniforms.uMorph.value, rho = this.rho) {
    const u = this.uniforms, [a, b, c] = this.coefficients(i), kind = this.lattice.kinds[i];
    const X = -b, Y = a + c, Z = c - a, inBall = X * X + Y * Y + Z * Z <= u.uBall.value ** 2;
    const deep = kind === 0 || (kind === 3 && a > 0);
    const present = deep && u.uDepth.value > 0 ? Y <= u.uDepth.value : inBall;
    const ka = [u.uKindAlpha.value.x, u.uKindAlpha.value.y, u.uKindAlpha.value.z, u.uKindAlpha.value.w][kind];
    if (!present || ka < 0.05) return false;
    if (!this.lattice.primitive[i] && u.uMultiples.value < 0.05) return false;
    if (kind === 2 && morph > 0.5) return false;
    if (kind === 3 && this.stage(a, b, c, rho, morph).hidden) return false;
    if (u.uShell.value > 0.5 && !(kind === 0 && Math.abs(Math.abs(b * b - 4 * a * c) - u.uShell.value) < 0.5)) return false;
    return true;
  }

  /**
   * Nearest drawn star to a pointer, in screen space. `toClip` maps display coordinates to clip space
   * (projection · view · lattice group). Returns the index or −1.
   */
  pick(ndcX, ndcY, toClip, viewportH, { radiusPx = 12, aspect = 1 } = {}) {
    const e = toClip.elements, n = this.lattice.count, rho = this.rho ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let best = -1, bestScore = Infinity;
    const halfH = viewportH / 2, fast = this.uniforms.uMorph.value === 0;
    for (let i = 0; i < n; i++) {
      if (!this.visible(i)) continue;
      const a = this.lattice.coefficients[3 * i], b = this.lattice.coefficients[3 * i + 1], c = this.lattice.coefficients[3 * i + 2];
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
      const score = d + 4 * Math.log(w) + (a < 0 ? 1e-3 : 0);   // ±f coincide in the pictures: prefer a > 0
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
}
