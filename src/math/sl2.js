// SL₂(ℝ) acting on roots (Möbius maps) and on coefficients (the Lorentz group SO⁺(2,1)).
// After Harriss–Stange–Trettel, Algebraic Number Starscapes §4.2. Matrices [p, q, r, s] = [[p, q], [r, s]].
//
// A form Q is pushed forward by g as Q∘g⁻¹, which moves every root z to g·z = (pz+q)/(rz+s) and keeps
// Δ when det g = 1. Only SL₂(ℤ) maps the integer lattice to itself.

export const identity = Object.freeze([1, 0, 0, 1]);
export const T = Object.freeze([1, 1, 0, 1]);
export const S = Object.freeze([0, -1, 1, 0]);

export const multiply = (g, h) => [
  g[0] * h[0] + g[1] * h[2], g[0] * h[1] + g[1] * h[3],
  g[2] * h[0] + g[3] * h[2], g[2] * h[1] + g[3] * h[3],
];
export const determinant = g => g[0] * g[3] - g[1] * g[2];
/** Inverse of a determinant-one matrix. */
export const inverse = g => [g[3], -g[1], -g[2], g[0]];
export const isIntegral = g => g.every(Number.isInteger) && determinant(g) === 1;

/** Rescale to determinant 1, removing floating-point drift. */
export function normalize(g) {
  const d = determinant(g);
  if (!(d > 0) || !g.every(Number.isFinite)) return [...identity];
  const k = 1 / Math.sqrt(d);
  return g.map(x => x * k);
}

/** g·z on the upper half-plane, z = {x, y}. */
export function act(g, z) {
  const [p, q, r, s] = g;
  const nx = p * z.x + q, ny = p * z.y, dx = r * z.x + s, dy = r * z.y, d = dx * dx + dy * dy;
  return { x: (nx * dx + ny * dy) / d, y: (ny * dx - nx * dy) / d };
}
/** g·t on the real projective line (∞ = Infinity). */
export function actReal(g, t) {
  const [p, q, r, s] = g;
  if (!Number.isFinite(t)) return r === 0 ? Infinity : p / r;
  const d = r * t + s;
  return d === 0 ? Infinity : (p * t + q) / d;
}

/** z ↦ (z − x)/y, the determinant-one map sending z to i. */
export const toI = z => { const t = Math.sqrt(z.y); return [1 / t, -z.x / t, 0, t]; };
/** The symmetric positive element of SL₂(ℝ) sending i to w: pure translation along the geodesic. */
export function fromI(w) {
  const m = (w.x * w.x + w.y * w.y) / w.y, n = w.x / w.y, k = 1 / w.y, t = Math.sqrt(m + k + 2);
  return [(m + 1) / t, n / t, n / t, (k + 1) / t];
}
/** The hyperbolic transvection carrying z0 to z1 along their geodesic, with no rotation about z1. */
export function transvection(z0, z1) {
  const h = toI(z0);
  return multiply(inverse(h), multiply(fromI(act(h, z1)), h));
}
/** One drag step: the point under the pointer at z0 follows it to z1 (composed on the left). */
export const dragStep = (g, z0, z1) => normalize(multiply(transvection(z0, z1), g));

/** ρ(g): the coefficient pushforward acting on (a, b, c) column vectors, row-major 3×3. */
export function pushforward(g) {
  const [p, q, r, s] = g;
  return [s * s, -r * s, r * r, -2 * q * s, p * s + q * r, -2 * p * r, q * q, -p * q, p * p];
}

// Display basis D = (X, Y, Z) = (−b, a+c, c−a) and its inverse.
const D = [0, -1, 0, 1, 0, 1, -1, 0, 1];
const Dinv = [0, 0.5, -0.5, -1, 0, 0, 0, 0.5, 0.5];
export const mul3 = (m, n) => {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    o[3 * i + j] = m[3 * i] * n[j] + m[3 * i + 1] * n[3 + j] + m[3 * i + 2] * n[6 + j];
  }
  return o;
};
export const apply3 = (m, [x, y, z]) => [
  m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z,
];
/** ρ(g) in display coordinates: a Lorentz transformation preserving X²+Z²−Y² and the future cone. */
export const displayPushforward = g => mul3(D, mul3(pushforward(g), Dinv));

/** Exact pushforward for g ∈ SL₂(ℤ) using BigInt; null for any other g. */
export function pushforwardExact(g, [a, b, c]) {
  if (!isIntegral(g)) return null;
  const [p, q, r, s] = g.map(BigInt), [A, B, C] = [a, b, c].map(BigInt);
  return [s * s * A - r * s * B + r * r * C, -2n * q * s * A + (p * s + q * r) * B - 2n * p * r * C,
    q * q * A - p * q * B + p * p * C];
}

/** Rotation angle of g about i in its polar decomposition, folded into (−π/2, π/2] because ±g act alike. */
export function polarAngle(g) {
  let theta = Math.atan2(g[2] - g[1], g[0] + g[3]);
  while (theta > Math.PI / 2) theta -= Math.PI;
  while (theta <= -Math.PI / 2) theta += Math.PI;
  return theta;
}

/**
 * Snap g to SL₂(ℤ) with Stange's criterion: reduce g·i into the standard fundamental domain by integer
 * translations (halves round toward +∞) and inversions m; of γ = m⁻¹ and γS take the one whose residual
 * γ⁻¹g turns least about i. Returns null if the reduction leaves the exact range.
 */
export function nearestIntegral(g) {
  let w = act(g, { x: 0, y: 1 }), m = [...identity], reduced = false;
  for (let step = 0; step < 200; step++) {
    if (!(Number.isFinite(w.x) && w.y > 0 && Number.isFinite(w.y) && Math.abs(w.x) <= 2 ** 20)) return null;
    const n = Math.round(w.x);
    if (n) { w = { x: w.x - n, y: w.y }; m = multiply([1, -n, 0, 1], m); }
    // Checked after each translation, including the last; S only permutes and negates m's entries.
    if (m.some(x => Math.abs(x) > 2 ** 20)) return null;
    if (w.x * w.x + w.y * w.y < 1 - 1e-12) { w = act(S, w); m = multiply(S, m); } else { reduced = true; break; }
  }
  if (!reduced) return null;
  const gamma = inverse(m), candidates = [gamma, multiply(gamma, S)];
  const turn = c => Math.abs(polarAngle(multiply(inverse(c), g)));
  const best = turn(candidates[1]) < turn(candidates[0]) - 1e-12 ? candidates[1] : candidates[0];
  const sign = best[0] + best[3] > 0 || (best[0] + best[3] === 0 && (best[0] || best[2]) > 0) ? 1 : -1;
  return best.map(x => sign * x + 0);
}

/** Rotation about i by angle φ in the polar convention of polarAngle: [[cos φ, −sin φ], [sin φ, cos φ]]. */
export const rotationAboutI = phi => [Math.cos(phi), -Math.sin(phi), Math.sin(phi), Math.cos(phi)];

/** Pᵗ for a symmetric positive definite 2×2 matrix P = [α, β, β, γ]. */
export function symmetricPower(P, t) {
  const [a, b, , c] = P, m = (a + c) / 2, r = Math.hypot((a - c) / 2, b);
  const l1 = m + r, l2 = Math.max(m - r, 1e-300);
  if (r < 1e-15) return [l1 ** t, 0, 0, l1 ** t];
  // Unit eigenvector for l1.
  let vx = b, vy = l1 - a;
  if (Math.hypot(vx, vy) < 1e-15) { vx = l1 - c; vy = b; }
  const n = Math.hypot(vx, vy); vx /= n; vy /= n;
  const p1 = l1 ** t, p2 = l2 ** t;
  return [p1 * vx * vx + p2 * vy * vy, (p1 - p2) * vx * vy, (p1 - p2) * vx * vy, p1 * vy * vy + p2 * vx * vx];
}

/**
 * A smooth path from g0 (t = 0) to g1 (t = 1) in PSL₂(ℝ), for gentle snapping: write R = g0⁻¹g1 = P·K
 * (P symmetric positive definite, K a rotation about i, sign chosen so the turn is under a quarter) and
 * return g0 · Pᵗ · K(tθ).
 */
export function interpolate(g0, g1, t) {
  let R = multiply(inverse(g0), g1);
  let theta = Math.atan2(R[2] - R[1], R[0] + R[3]);
  if (theta > Math.PI / 2 || theta <= -Math.PI / 2) { R = R.map(x => -x); theta = Math.atan2(R[2] - R[1], R[0] + R[3]); }
  const K = rotationAboutI(theta), P = multiply(R, inverse(K));
  const Ps = [P[0], (P[1] + P[2]) / 2, (P[1] + P[2]) / 2, P[3]];
  return normalize(multiply(g0, multiply(symmetricPower(Ps, t), rotationAboutI(theta * t))));
}
/** Point at fraction t along the hyperbolic geodesic from z0 to z1. */
export function geodesicPoint(z0, z1, t) {
  const h = toI(z0);
  return act(inverse(h), act(symmetricPower(fromI(act(h, z1)), t), { x: 0, y: 1 }));
}
export function hyperbolicDistance(z, w) {
  const num = (z.x - w.x) ** 2 + (z.y - w.y) ** 2;
  return Math.acosh(1 + num / (2 * z.y * w.y));
}
