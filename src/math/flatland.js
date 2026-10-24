// Living inside the hyperbolic plane: the pure mathematics (no DOM, no three.js).
// You are always at the center of the Poincaré disk, which is the point i under the current g; walking applies a
// hyperbolic transvection to the world. The ground carries the Farey tessellation, whose edges are exactly the
// planes of the Δ = 1 forms: (qx − p)(sx − r) has discriminant (ps − qr)². Walking straight, the turns L/R you make
// through its triangles spell the continued fraction of where you are heading (Series, 1985).
import * as G from './sl2.js';
import { kleinToHalfPlane, poincareToKlein } from './models.js';

/** The half-plane point at Poincaré position (u, v) of the current picture. */
export const diskToRoot = (u, v) => kleinToHalfPlane(...poincareToKlein(u, v));

/**
 * One step of walking: move the world so that the point at hyperbolic distance `step` in direction `angle`
 * (an angle in the disk, measured from +u toward +v) comes to the center.
 */
export function walk(g, angle, step) {
  const t = Math.tanh(step / 2);
  const ahead = diskToRoot(t * Math.cos(angle), t * Math.sin(angle));
  return G.normalize(G.multiply(G.transvection(ahead, { x: 0, y: 1 }), g));
}

// ---- The Farey triangle you are standing in, and the L/R cutting sequence --------------------------------------
const frac = (p, q) => ({ p, q });
const fracValue = f => (f.q === 0 ? Infinity : f.p / f.q);
const fracKey = f => `${f.p}/${f.q}`;
/**
 * The Farey triangle containing z (half-plane), as three fractions. Reduction mirrors the shader: translate by
 * n, or apply z ↦ z/(1 − z); the triangle is the image of (0, 1, ∞) under the inverse of that word.
 */
export function fareyTriangle(z) {
  let w = { ...z }, m = [1, 0, 0, 1];
  for (let i = 0; i < 200; i++) {
    const n = Math.floor(w.x);
    if (n) { w = { x: w.x - n, y: w.y }; m = G.multiply([1, -n, 0, 1], m); }
    if ((w.x - 0.5) ** 2 + w.y ** 2 >= 0.25) break;
    const A = [1, 0, -1, 1];
    w = G.act(A, w); m = G.multiply(A, m);
  }
  const inv = G.inverse(m).map(Math.round);
  const image = ([p, q]) => {
    let a = inv[0] * p + inv[1] * q, b = inv[2] * p + inv[3] * q;
    if (b < 0 || (b === 0 && a < 0)) { a = -a; b = -b; }
    return frac(a, b);
  };
  const verts = [[0, 1], [1, 1], [1, 0]].map(image);
  return { verts, key: verts.map(fracKey).sort().join(' ') };
}

/**
 * Track turns while walking. Each time you cross a Farey edge, the edge you entered by and the edge you leave by
 * share a vertex; it lies on your left (L) or right (R).
 */
export class CuttingSequence {
  constructor() { this.reset(); }
  reset() { this.tri = null; this.entry = null; this.letters = ''; }
  /** `z` is your position (half-plane, base coordinates); `leftOf(rational)` says if it is on your left. */
  update(z, leftOf) {
    const t = fareyTriangle(z);
    if (!this.tri) { this.tri = t; return null; }
    if (t.key === this.tri.key) return null;
    const shared = this.tri.verts.filter(v => t.verts.some(w => fracKey(w) === fracKey(v)));
    let letter = null;
    if (shared.length === 2 && this.entry) {
      const pivot = shared.find(v => this.entry.some(w => fracKey(w) === fracKey(v)));
      if (pivot) { letter = leftOf(fracValue(pivot)) ? 'L' : 'R'; this.letters += letter; }
    }
    this.entry = shared.length === 2 ? shared : null;
    this.tri = t;
    return letter;
  }
  /** Run lengths of the letters, e.g. LLLRRL → [3, 2, 1], as a continued-fraction reading. */
  runs() {
    const out = [];
    for (const ch of this.letters) {
      if (out.length && out[out.length - 1].ch === ch) out[out.length - 1].n++;
      else out.push({ ch, n: 1 });
    }
    return out;
  }
}

/**
 * The true Flatland view: what a creature at the center of the disk sees, one pixel per direction.
 * Each star is a disk of hyperbolic radius ρ = r0/√|Δ| at distance d; it subtends sin(α) = sinh ρ / sinh d and
 * hides whatever lies behind it. As in Abbott's Flatland, fog dims distant things (light ∝ e^(−d/λ)), which is how a
 * Flatlander judges distance; without it every direction would end on some faint star (Olbers' paradox in 2D).
 */
export function flatlandRetina(stars, g, { width = 720, r0 = 0.5, fog = 1.0, beta = 1, palette } = {}) {
  const n = stars.lattice.count, rho = G.displayPushforward(g), hits = [];
  for (let i = 0; i < n; i++) {
    if (stars.lattice.kinds[i] !== 0 || !stars.visible(i)) continue;
    const [a, b, c] = stars.coefficients(i);
    if (!stars.lattice.primitive[i]) continue;   // multiples share the point
    const X0 = -b, Y0 = a + c, Z0 = c - a;
    const X = rho[0] * X0 + rho[1] * Y0 + rho[2] * Z0, Y = rho[3] * X0 + rho[4] * Y0 + rho[5] * Z0, Z = rho[6] * X0 + rho[7] * Y0 + rho[8] * Z0;
    const ku = X / Y, kv = Z / Y, kk = Math.min(ku * ku + kv * kv, 1 - 1e-12);
    // Klein radius κ = tanh d.
    const d = Math.atanh(Math.sqrt(kk)), delta = b * b - 4 * a * c;
    const radius = r0 / Math.sqrt(-delta);
    if (d < radius) continue;   // the star you are standing in fills your whole view; look past it
    // The same weight as the point picture: light ∝ fog · (3/|Δ|)^β. Points too faint to see are dust, not walls.
    const light = Math.exp(-d / fog) * Math.min(1, (3 / -delta) ** beta);
    if (light < 0.06) continue;
    const alpha = Math.asin(Math.min(1, Math.sinh(radius) / Math.sinh(d)));
    hits.push({ theta: Math.atan2(kv, ku), d, alpha, delta, light, i });
  }
  hits.sort((x, y) => x.d - y.d);
  // Composite front to back. A star is as opaque as it is bright, so faint dust veils what lies behind it
  // without walling it off, the way haze does.
  const depth = new Float32Array(width).fill(Infinity), color = new Float32Array(width * 3), cover = new Float32Array(width);
  for (const h of hits) {
    const span = Math.max(h.alpha, Math.PI / width);
    const c = palette(-h.delta), light = Math.min(1, 1.6 * h.light), opacity = Math.min(1, 1.4 * light);
    const i0 = Math.floor(((h.theta - span) / (2 * Math.PI)) * width), i1 = Math.ceil(((h.theta + span) / (2 * Math.PI)) * width);
    for (let j = i0; j <= i1; j++) {
      const k = ((j % width) + width) % width, left = 1 - cover[k];
      if (left < 0.02) continue;
      if (depth[k] === Infinity) depth[k] = h.d;
      for (let ch = 0; ch < 3; ch++) color[3 * k + ch] += left * light * c[ch];
      cover[k] += left * opacity;
    }
  }
  return { depth, color, width };
}

