// Planes through the origin of coefficient space = geodesics of the starscape.
// The plane Lorentz-orthogonal to a form n = (A, B, C) is  −2C·a + B·b − 2A·c = 0. When Δ(n) > 0 it cuts the
// light cone in two lines, so it meets the Klein disk in a chord: the geodesic whose endpoints are the real roots
// of n (Harriss–Stange–Trettel, Obs. 4.11–4.12). Exact arithmetic is BigInt.
import { boundaryPoint } from './models.js';

const big = x => BigInt(x);
const abs = x => (x < 0n ? -x : x);
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
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

/**
 * Can the shader's float32 test `|−2C·a + B·b − 2A·c| < ½` mark this plane's stars exactly? It can when
 * N·M < 2²⁴, with N the largest of |2C|, |B|, |2A| and M the largest drawn coefficient: then every product is
 * a binary32 integer, and a partial sum that rounds is too large for the plane value to vanish. Proved over
 * FloatLib's binary32 in lean-float/StarscapeFloat.lean (`planeF_decides_of_le`).
 */
export function gpuPlaneExact([A, B, C], maxCoefficient) {
  const N = Math.max(Math.abs(2 * C), Math.abs(B), Math.abs(2 * A));
  return Number.isSafeInteger(2 * N) && N * Math.max(1, maxCoefficient) < 2 ** 24;
}

/** The plane of an exterior form n (Δ(n) > 0, Numbers or BigInts), with its geodesic endpoints. */
export function planeFromNormal(normal) {
  const n = primitiveBig(normal.map(big)), [a, b, c] = n, delta = b * b - 4n * a * c;
  if (n.every(x => x === 0n)) return { error: 'The zero form has no plane.' };
  if (delta <= 0n) return { error: 'Only a form with two real roots (Δ > 0) cuts a geodesic.' };
  // The normal is kept as Numbers; past 2⁵³ they would name a nearby plane through neither point.
  if (n.some(x => abs(x) > MAX_SAFE)) return { error: 'This plane is too large to label exactly.' };
  const A = Number(a), B = Number(b), C = Number(c), d = Number(delta);
  const ends = A === 0 ? [-C / B, Infinity] : [(-B - Math.sqrt(d)) / (2 * A), (-B + Math.sqrt(d)) / (2 * A)];
  return { normal: n.map(Number), endpoints: ends };
}

/** The plane through two interior forms (two stars): its normal is the cross product of their duals. */
export function planeThrough(p, q) {
  const raw = cross(dual(p.map(big)), dual(q.map(big)));
  if (raw.every(x => x === 0n)) return { error: 'These two forms have the same root.' };
  // Exact all the way to the primitive part: the raw product can pass 2⁵³ when the primitive normal does not.
  return planeFromNormal(raw);
}

/** Euclidean normal of the plane in display coordinates (X, Y, Z) = (−b, a+c, c−a). */
export function displayNormal([A, B, C]) {
  const e = [-B, -(A + C), C - A], n = Math.hypot(...e);
  return e.map(x => x / n);
}

/** Klein-disk endpoints of the geodesic (on the unit circle). */
export const kleinChord = plane => plane.endpoints.map(boundaryPoint);

/** Equation in the source viewer's style, e.g. "2a − 2c = 0", exact for a normal of Numbers or BigInts. */
export function planeEquation(normal) {
  const [A, B, C] = normal.map(big), terms = [];
  for (const [k, name] of [[-2n * C, 'a'], [B, 'b'], [-2n * A, 'c']]) {
    if (!k) continue;
    const m = abs(k);
    terms.push(`${k < 0n ? (terms.length ? ' − ' : '−') : terms.length ? ' + ' : ''}${m === 1n ? '' : m}${name}`);
  }
  return `${terms.join('')} = 0`;
}
