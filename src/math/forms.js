// Integer binary quadratic forms ax² + bx + c as points of ℤ³.
//
// Display basis (X, Y, Z) = (−b, a+c, c−a). In it the discriminant is the Lorentz form
// Δ = b² − 4ac = X² + Z² − Y², Y is the time axis, the light cone Δ = 0 is the ordinary
// 45° double cone, and the forms with complex roots (Δ < 0) are the timelike vectors.

/** @typedef {[number, number, number]} Triple */

export const discriminant = (a, b, c) => b * b - 4 * a * c;

/** 'upper' (Δ<0, a>0), 'lower' (Δ<0, a<0), 'exterior' (Δ>0, two real roots) or 'null' (Δ=0). */
export function kind(a, b, c) {
  const d = discriminant(a, b, c);
  return d === 0 ? 'null' : d > 0 ? 'exterior' : a > 0 ? 'upper' : 'lower';
}
export const KIND_CODE = { upper: 0, lower: 1, exterior: 2, null: 3 };

/** @returns {Triple} */
export const toDisplay = (a, b, c) => [-b, a + c, c - a];
/** Inverse of toDisplay; exact when X, Y+Z are integers of matching parity. @returns {Triple} */
export const fromDisplay = (X, Y, Z) => [(Y - Z) / 2, -X, (Y + Z) / 2];

export function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export const content = (a, b, c) => gcd(gcd(a, b), c);
export const isPrimitive = (a, b, c) => content(a, b, c) === 1;

/** The form in the source viewer's typography: x² + x + 1, 2x² − 2x + 4, −x² + x − 2. Multiples stay unreduced. */
export function polynomialText(a, b, c) {
  const terms = [[a, 'x²'], [b, 'x'], [c, '']].filter(([k]) => k !== 0);
  if (!terms.length) return '0';
  return terms.map(([k, power], i) => {
    const m = Math.abs(k), body = (power && m === 1 ? '' : m) + power;
    return i ? (k < 0 ? ' − ' : ' + ') + body : (k < 0 ? '−' : '') + body;
  }).join('');
}

/** Root in the upper half-plane of a form with Δ < 0 (of either sign), else null. */
export function upperRoot(a, b, c) {
  const d = discriminant(a, b, c);
  if (!(d < 0)) return null;
  if (a < 0) [a, b, c] = [-a, -b, -c];
  return { x: -b / (2 * a), y: Math.sqrt(-d) / (2 * a) };
}

/** Real roots of a form with Δ ≥ 0, as numbers (∞ when a = 0). */
export function realRoots(a, b, c) {
  const d = discriminant(a, b, c);
  if (d < 0) return null;
  if (a === 0) return b === 0 ? [] : [-c / b, Infinity];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((x, y) => x - y);
}

/**
 * Exact text for the roots of an integer form: "(−1 + i√3)/2" (upper root only when Δ < 0),
 * "i", "(3 ± √5)/2", "−1, 1", "1/2 (double)", "−2 and ∞".
 */
export function rootText(a, b, c) {
  const d = discriminant(a, b, c);
  if (a === 0) {
    if (b === 0) return c === 0 ? 'every x' : 'none';
    return fraction(-c, b) + ' and ∞';
  }
  if (a < 0) [a, b, c] = [-a, -b, -c];
  if (d === 0) return fraction(-b, 2 * a) + ' (double)';
  const [s, r] = squarePart(Math.abs(d));
  if (d > 0 && r === 1) return fraction(-b - s, 2 * a) + ', ' + fraction(-b + s, 2 * a);
  // (−b ± k·√r)/q in lowest terms; for Δ < 0 the upper root takes +.
  const g = gcd(gcd(b, s), 2 * a), p = -b / g, q = (2 * a) / g, k = s / g;
  const rad = (k === 1 ? '' : k) + (d < 0 ? 'i' : '') + (r === 1 ? '' : '√' + r);
  const sign = d < 0 ? '+' : '±';
  const body = p === 0 ? (d < 0 ? rad : '±' + rad) : `${minus(p)} ${sign} ${rad}`;
  return q === 1 ? body : `(${body})/${q}`;
}
const minus = n => (n < 0 ? '−' + -n : String(n));
function fraction(p, q) {
  if (q < 0) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1;
  p /= g; q /= g;
  return q === 1 ? minus(p) : `${minus(p)}/${q}`;
}
/** n = s²·r with r squarefree. */
export function squarePart(n) {
  let s = 1, r = n;
  for (let f = 2; f * f <= r; f++) while (r % (f * f) === 0) { r /= f * f; s *= f; }
  return [s, r];
}

/**
 * Lattice points for the scene, packed for the GPU:
 *  - every nonzero triple in the display ball X²+Y²+Z² ≤ ball² (all four kinds; the "dust"),
 *  - plus every upper-interior triple (Δ<0, a>0) with depth a+c ≤ depth (the stars, as in Stange's viewer).
 * Returns typed arrays: coefficients (Int32, 3 per point), kind code (Uint8), primitive flag (Uint8), and the
 * largest |coefficient|, which bounds the shader's float32 products (see gpuPlaneExact).
 * @returns {{count:number, coefficients:Int32Array, maxCoefficient:number, kinds:Uint8Array, primitive:Uint8Array}}
 */
export function buildLattice({ ball = 6, depth = 48 } = {}) {
  const coef = [], kinds = [], prim = [];
  const push = (a, b, c) => {
    coef.push(a, b, c);
    kinds.push(KIND_CODE[kind(a, b, c)]);
    prim.push(isPrimitive(a, b, c) ? 1 : 0);
  };
  const R = Math.ceil(ball);
  for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (let c = -R; c <= R; c++) {
    if (!a && !b && !c) continue;
    const Y = a + c, Z = c - a;
    if (b * b + Y * Y + Z * Z > ball * ball) continue;
    // Upper interior points inside the depth bound are added by the star loop below.
    if (discriminant(a, b, c) < 0 && a > 0 && Y <= depth) continue;
    push(a, b, c);
  }
  // Upper interior: a > 0, c > 0 (since 4ac > b² ≥ 0), a + c ≤ depth, b² < 4ac.
  for (let a = 1; a < depth; a++) for (let c = 1; c <= depth - a; c++) {
    const bmax = Math.ceil(2 * Math.sqrt(a * c)) - 1;
    for (let b = -bmax; b <= bmax; b++) if (b * b < 4 * a * c) push(a, b, c);
  }
  return {
    count: kinds.length,
    coefficients: Int32Array.from(coef),
    maxCoefficient: coef.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    kinds: Uint8Array.from(kinds),
    primitive: Uint8Array.from(prim),
  };
}

/** Number of upper-interior stars with a + c ≤ depth (her viewer reports 98,696 at depth 48). */
export function starCount(depth) {
  let n = 0;
  for (let a = 1; a < depth; a++) for (let c = 1; c <= depth - a; c++) {
    const bmax = Math.ceil(2 * Math.sqrt(a * c)) - 1;
    for (let b = -bmax; b <= bmax; b++) if (b * b < 4 * a * c) n++;
  }
  return n;
}

/** Reduced positive definite forms of discriminant −k: |b| ≤ a ≤ c, b ≥ 0 if |b| = a or a = c, primitive. */
export function reducedForms(k) {
  const out = [];
  if (k <= 0 || ((-k % 4) + 4) % 4 > 1) return out;
  for (let a = 1; 3 * a * a <= k; a++) for (let b = -a + 1; b <= a; b++) {
    if ((b * b + k) % (4 * a)) continue;
    const c = (b * b + k) / (4 * a);
    if (c < a || (b < 0 && a === c) || !isPrimitive(a, b, c)) continue;
    out.push([a, b, c]);
  }
  return out;
}
