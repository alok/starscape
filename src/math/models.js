// The three pictures of the hyperbolic plane used in the starscape, and the maps between them.
// Klein coordinates of a timelike display vector (X, Y, Z) are (u, v) = (X/Y, Z/Y): the point where its ray
// meets the screen Y = 1. The quadratic formula is an isometry from Klein onto the upper half-plane
// (Harriss–Stange–Trettel, Thm 4.9); in our basis the boundary point v = 1 goes to ∞.
// The GLSL in render/stars.js mirrors these formulas; keep them in sync.

export const klein = (X, Y, Z) => [X / Y, Z / Y];

export function kleinToHalfPlane(u, v) {
  const h = 1 - u * u - v * v;
  if (!(h > 0) || !(1 - v > 0)) return null;
  return { x: u / (1 - v), y: Math.sqrt(h) / (1 - v) };
}
export function halfPlaneToKlein({ x, y }) {
  const n = x * x + y * y;
  return [(2 * x) / (1 + n), (n - 1) / (1 + n)];
}
export function kleinToPoincare(u, v) {
  const k = 1 + Math.sqrt(Math.max(0, 1 - u * u - v * v));
  return [u / k, v / k];
}
export function poincareToKlein(p, q) {
  const k = 2 / (1 + p * p + q * q);
  return [p * k, q * k];
}
/** Boundary point t ∈ ℝ ∪ {∞} on the unit circle of the Klein (and Poincaré) disk. */
export function boundaryPoint(t) {
  if (!Number.isFinite(t)) return [0, 1];
  if (Math.abs(t) <= 1) return [(2 * t) / (1 + t * t), (t * t - 1) / (1 + t * t)];
  // The same point in s = 1/t, where t² cannot overflow (it does past |t| ≈ 1.3e154, giving ∞/∞).
  const s = 1 / t;
  return [(2 * s) / (1 + s * s), (1 - s * s) / (1 + s * s)];
}
/** The upper half-plane root z of a timelike display vector, via Klein. */
export const displayToRoot = (X, Y, Z) => kleinToHalfPlane(X / Y, Z / Y);
/**
 * The half-plane point shown at (x, h, z) on the screen Y = h of the current picture (`morph` 0–1 Klein, ~2
 * Poincaré, ~3 the half-plane with scale `hp`), or null off the picture. Mirrors the shader in render/stars.js.
 */
export function screenToRoot(x, z, morph, h, hp) {
  if (morph < 1.5) {
    const u = x / h, v = z / h;
    return u * u + v * v < 0.9995 ? kleinToHalfPlane(u, v) : null;
  }
  if (morph < 2.5) {
    const p = x / h, q = z / h;
    return p * p + q * q < 0.9995 ? kleinToHalfPlane(...poincareToKlein(p, q)) : null;
  }
  const w = { x: x / hp, y: z / hp + 1 };
  return w.y > 1e-3 ? w : null;
}
/** Where a ray (origin o, direction d, display coordinates) meets the screen Y = h, as a root; or null. */
export function rayToRoot(o, d, morph, h, hp) {
  if (Math.abs(d.y) < 1e-6) return null;
  const t = (h - o.y) / d.y;
  return t > 0 ? screenToRoot(o.x + t * d.x, o.z + t * d.z, morph, h, hp) : null;
}

/**
 * Where a Klein point (ku, kv) is drawn on the screen Y = h for a picture `morph` in [1, 3] (Klein → Poincaré →
 * half-plane), as [x, z]. The stars' shader interpolates these same positions, so curves drawn through this map
 * bend exactly as the stars do. A boundary point of the half-plane is returned on the real line.
 */
export function pictureOf(ku, kv, morph, h, hp) {
  const s = Math.sqrt(Math.max(0, 1 - ku * ku - kv * kv));
  const K = [ku * h, kv * h], P = [(ku / (1 + s)) * h, (kv / (1 + s)) * h];
  const den = Math.max(1 - kv, 1e-9), Hp = [(ku / den) * hp, (s / den - 1) * hp];
  const m = Math.min(3, Math.max(1, morph));
  const [A, B, f] = m <= 2 ? [K, P, m - 1] : [P, Hp, m - 2];
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f];
}

/** A unit-scale display direction (on Y = 1) for a root z. */
export function rootToDisplay(z) {
  const [u, v] = halfPlaneToKlein(z);
  return [u, 1, v];
}
