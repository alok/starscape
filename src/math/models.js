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
  return [(2 * t) / (1 + t * t), (t * t - 1) / (1 + t * t)];
}
/** The upper half-plane root z of a timelike display vector, via Klein. */
export const displayToRoot = (X, Y, Z) => kleinToHalfPlane(X / Y, Z / Y);
/** A unit-scale display direction (on Y = 1) for a root z. */
export function rootToDisplay(z) {
  const [u, v] = halfPlaneToKlein(z);
  return [u, 1, v];
}
