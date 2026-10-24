// Planes through the origin of coefficient space = geodesics of the starscape.
// The plane Lorentz-orthogonal to a form n = (A, B, C) is  −2C·a + B·b − 2A·c = 0. When Δ(n) > 0 it cuts the
// light cone in two lines, so it meets the Klein disk in a chord: the geodesic whose endpoints are the real roots
// of n (Harriss–Stange–Trettel, Obs. 4.11–4.12). Exact arithmetic is BigInt.
import { boundaryPoint } from './models.js';

const big = x => BigInt(x);
const abs = x => (x < 0n ? -x : x);
const gcdBig = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];

/** Primitive representative with positive leading nonzero entry. */
export function primitiveBig(p) {
  const g = p.reduce(gcdBig, 0n) || 1n, sign = p.find(x => x !== 0n) < 0n ? -1n : 1n;
  return p.map(x => (x / g) * sign);
}

/** The dual of a form under the bilinear form of Δ: B_n(p) = n_b·b − 2n_a·c − 2n_c·a. */
const dual = ([a, b, c]) => [-2n * c, b, -2n * a];

/** Is the integer form p on the plane of normal n? */
export function onPlane(normal, point) {
  const [A, B, C] = normal.map(big), [a, b, c] = point.map(big);
  return -2n * C * a + B * b - 2n * A * c === 0n;
}

/** The plane of an exterior form n (Δ(n) > 0), with its geodesic endpoints. */
export function planeFromNormal(normal) {
  const n = primitiveBig(normal.map(big)), [a, b, c] = n, delta = b * b - 4n * a * c;
  if (n.every(x => x === 0n)) return { error: 'The zero form has no plane.' };
  if (delta <= 0n) return { error: 'Only a form with two real roots (Δ > 0) cuts a geodesic.' };
  const A = Number(a), B = Number(b), C = Number(c), d = Number(delta);
  const ends = A === 0 ? [-C / B, Infinity] : [(-B - Math.sqrt(d)) / (2 * A), (-B + Math.sqrt(d)) / (2 * A)];
  return { normal: n.map(Number), endpoints: ends };
}

/** The plane through two interior forms (two stars): its normal is the cross product of their duals. */
export function planeThrough(p, q) {
  const raw = cross(dual(p.map(big)), dual(q.map(big)));
  if (raw.every(x => x === 0n)) return { error: 'These two forms have the same root.' };
  return planeFromNormal(raw.map(Number));
}

/** Euclidean normal of the plane in display coordinates (X, Y, Z) = (−b, a+c, c−a). */
export function displayNormal([A, B, C]) {
  const e = [-B, -(A + C), C - A], n = Math.hypot(...e);
  return e.map(x => x / n);
}

/** Klein-disk endpoints of the geodesic (on the unit circle). */
export const kleinChord = plane => plane.endpoints.map(boundaryPoint);

/** Equation in the source viewer's style, e.g. "2a − 2c = 0". */
export function planeEquation([A, B, C]) {
  const terms = [];
  for (const [k, name] of [[-2 * C, 'a'], [B, 'b'], [-2 * A, 'c']]) {
    if (!k) continue;
    const m = Math.abs(k);
    terms.push(`${k < 0 ? (terms.length ? ' − ' : '−') : terms.length ? ' + ' : ''}${m === 1 ? '' : m}${name}`);
  }
  return `${terms.join('')} = 0`;
}
