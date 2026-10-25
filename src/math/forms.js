// Integer binary quadratic forms ax² + bx + c as points of ℤ³.
//
// Display basis (X, Y, Z) = (−b, a+c, c−a). In it the discriminant is the Lorentz form
// Δ = b² − 4ac = X² + Z² − Y², Y is the time axis, the light cone Δ = 0 is the ordinary
// 45° double cone, and the forms with complex roots (Δ < 0) are the timelike vectors.

/** @typedef {[number, number, number]} Triple */
// A label relabeled by SL₂(ℤ) can outgrow the safe integers, so the text below also takes BigInt coefficients.

/** Δ = b² − 4ac exactly, as a BigInt; the coefficients may be Numbers or BigInts. */
export const discriminantExact = (a, b, c) => BigInt(b) * BigInt(b) - 4n * BigInt(a) * BigInt(c);
const isNumber = x => typeof x === 'number';
/** Δ as a Number: exact whenever |Δ| ≤ 2⁵³, and of the right sign for any integer label. */
export function discriminant(a, b, c) {
  // b² and 4ac are exact doubles while |b| ≤ 2²⁶ and |ac| ≤ 2⁵⁰, and then so is their difference, |Δ| ≤ 2⁵³.
  if (isNumber(a) && isNumber(b) && isNumber(c) && Math.abs(b) <= 2 ** 26 && Math.abs(a * c) <= 2 ** 50) return b * b - 4 * a * c;
  return Number(discriminantExact(a, b, c));
}

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

/** gcd of two Numbers or of two BigInts. */
export function gcd(a, b) {
  a = a < 0 ? -a : a; b = b < 0 ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
export const content = (a, b, c) => gcd(gcd(a, b), c);
export const isPrimitive = (a, b, c) => content(a, b, c) === 1;

/** The form in the source viewer's typography: x² + x + 1, 2x² − 2x + 4, −x² + x − 2. Multiples stay unreduced. */
export function polynomialText(a, b, c) {
  const terms = [[a, 'x²'], [b, 'x'], [c, '']].map(([k, power]) => [BigInt(k), power]).filter(([k]) => k !== 0n);
  if (!terms.length) return '0';
  return terms.map(([k, power], i) => {
    const m = k < 0n ? -k : k, body = (power && m === 1n ? '' : m) + power;
    return i ? (k < 0n ? ' − ' : ' + ') + body : (k < 0n ? '−' : '') + body;
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
  if (a === 0) return b === 0 ? (c === 0 ? [] : [Infinity, Infinity]) : [-c / b, Infinity];
  const s = Math.sqrt(d);
  return [(-b - s) / (2 * a), (-b + s) / (2 * a)].sort((x, y) => x - y);
}

/**
 * Exact text for the roots of an integer form (Numbers or BigInts): "(−1 + i√3)/2" (upper root only when Δ < 0),
 * "i", "(3 ± √5)/2", "−1 and 1", "1/2 (double)", "−2 and ∞".
 */
export function rootText(a, b, c) {
  [a, b, c] = [a, b, c].map(BigInt);
  const d = b * b - 4n * a * c;
  if (a === 0n) {
    // c·y² vanishes only at [1 : 0] = ∞, to second order.
    if (b === 0n) return c === 0n ? 'every x' : '∞ (double)';
    return fraction(-c, b) + ' and ∞';
  }
  if (a < 0n) [a, b, c] = [-a, -b, -c];
  if (d === 0n) return fraction(-b, 2n * a) + ' (double)';
  const [s, r] = squarePart(d < 0n ? -d : d);
  if (d > 0n && r === 1n) return fraction(-b - s, 2n * a) + ' and ' + fraction(-b + s, 2n * a);
  // (−b ± k·√r)/q in lowest terms; for Δ < 0 the upper root takes +.
  const g = gcd(gcd(b, s), 2n * a), p = -b / g, q = (2n * a) / g, k = s / g;
  const rad = (k === 1n ? '' : k) + (d < 0n ? 'i' : '') + (r === 1n ? '' : '√' + r);
  const sign = d < 0n ? '+' : '±';
  const body = p === 0n ? (d < 0n ? rad : '±' + rad) : `${minus(p)} ${sign} ${rad}`;
  // A single term needs no parentheses: i/2, 2i/3, i√3/2; a sum or ± keeps them, (±√5)/2.
  return q === 1n ? body : p === 0n && d < 0n ? `${body}/${q}` : `(${body})/${q}`;
}
const minus = n => (n < 0n ? '−' + -n : String(n));
function fraction(p, q) {
  if (q < 0n) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1n;
  p /= g; q /= g;
  return q === 1n ? minus(p) : `${minus(p)}/${q}`;
}
const TRIAL = 2n ** 18n;
/**
 * n = s²·r for an integer n > 0, as BigInts. Trial division runs to ∛n, where the cofactor has at most two prime
 * factors and so is a square or squarefree: then r is squarefree. Past n = 2⁵⁴ it stops at 2¹⁸ (≈ 6 ms), and r may
 * keep the square of a prime above that: the text is still exact, only not fully simplified.
 */
export function squarePart(n) {
  let s = 1n, r = 1n, m = BigInt(n);
  for (let p = 2n; p <= TRIAL && p * p * p <= m; p += p === 2n ? 1n : 2n) {
    for (; m % (p * p) === 0n; m /= p * p) s *= p;
    if (m % p === 0n) { m /= p; r *= p; }
  }
  const t = isqrt(m);
  return t * t === m ? [s * t, r] : [s, r * m];
}
/** ⌊√n⌋ for a BigInt n ≥ 0: Newton's method decreases to it from any start above, here 2^⌈bits/2⌉. */
function isqrt(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  for (let y = (x + n / x) / 2n; y < x; y = (x + n / x) / 2n) x = y;
  return x;
}

/**
 * Lattice points for the scene, packed for the GPU:
 *  - every nonzero triple in the display ball X²+Y²+Z² ≤ ball² (all four kinds; the "dust"),
 *  - plus every upper-interior triple (Δ<0, a>0) with depth a+c ≤ depth (the stars, as in Stange's viewer),
 *  - plus every upper-cone triple (Δ=0, a>0) with a+c ≤ depth: the double-root forms k(qx − p)², whose half-plane
 *    pictures are the Ford circles (p² + q² ≤ depth/k).
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
    // Upper points (interior and cone) inside the depth bound are added by the loops below.
    if (a > 0 && Y <= depth && discriminant(a, b, c) <= 0) continue;
    push(a, b, c);
  }
  // Upper interior: a > 0, c > 0 (since 4ac > b² ≥ 0), a + c ≤ depth, b² < 4ac.
  for (let a = 1; a < depth; a++) for (let c = 1; c <= depth - a; c++) {
    const bmax = Math.ceil(2 * Math.sqrt(a * c)) - 1;
    for (let b = -bmax; b <= bmax; b++) if (b * b < 4 * a * c) push(a, b, c);
  }
  // Upper cone: b² = 4ac with a > 0, c ≥ 0, a + c ≤ depth.
  for (let a = 1; a <= depth; a++) for (let c = 0; a + c <= depth; c++) {
    const b = Math.round(Math.sqrt(4 * a * c));
    if (b * b !== 4 * a * c) continue;
    push(a, b, c);
    if (b) push(a, -b, c);
  }
  return {
    count: kinds.length,
    coefficients: Int32Array.from(coef),
    maxCoefficient: coef.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    kinds: Uint8Array.from(kinds),
    primitive: Uint8Array.from(prim),
  };
}

/**
 * Every positive definite form of discriminant −k up to SL₂(ℤ), one reduced representative per orbit. ρ(g) and its
 * inverse are integer matrices, so the content f = gcd(a, b, c) is constant on an orbit; ρ is linear, so the orbit of
 * f·g is f times the orbit of g. The orbits of content f are therefore f times the h(−k/f²) primitive classes of
 * discriminant −k/f², and the primitive ones (f = 1) are the class number h(−k).
 * @returns {{content:number, form:Triple, primitive:Triple}[]}
 */
export function shellClasses(k) {
  const out = [];
  for (let f = 1; f * f <= k; f++) {
    if (k % (f * f)) continue;
    for (const g of reducedForms(k / (f * f))) out.push({ content: f, form: g.map(x => f * x), primitive: g });
  }
  return out;
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

/**
 * The reduced form in the SL₂(ℤ)-orbit of a definite form (Δ < 0), as BigInts, else null: |b| ≤ a ≤ c, b ≥ 0
 * if |b| = a or a = c, for −f when a < 0 (then negated back). Gauss reduction, translating by the whole multiple at
 * once, so it takes O(log) steps for labels of any size. ρ is linear, so content and sign come along unchanged.
 */
export function reduce(a, b, c) {
  [a, b, c] = [a, b, c].map(BigInt);
  if (b * b - 4n * a * c >= 0n) return null;
  const sign = a < 0n ? -1n : 1n;
  [a, b, c] = [sign * a, sign * b, sign * c];
  for (;;) {
    // x ↦ x + ny takes (a, b, c) to (a, b + 2an, an² + bn + c); n = ⌊(a − b)/2a⌋ puts b in (−a, a].
    const n = floorDiv(a - b, 2n * a);
    c += (a * n + b) * n; b += 2n * a * n;
    if (c < a) { [a, b, c] = [c, -b, a]; continue; }   // S: (x, y) ↦ (−y, x)
    if (a === c && b < 0n) b = -b;
    return [sign * a, sign * b, sign * c];
  }
}
const floorDiv = (x, y) => (x % y < 0n ? x / y - 1n : x / y);   // y > 0; BigInt division truncates toward 0

/**
 * A definite form's class: the reduced form of its orbit, written as sign and content times the reduced primitive
 * form, "13x² − 6x + 27", "2(x² + x + 1)", "−(x² + 1)"; null unless Δ < 0.
 */
export function classText(a, b, c) {
  const r = reduce(a, b, c);
  if (!r) return null;
  const s = r[0] < 0n ? -1n : 1n, k = content(...r), g = r.map(x => x / (s * k));
  const factor = (s < 0n ? '−' : '') + (k > 1n ? k : '');
  return factor ? `${factor}(${polynomialText(...g)})` : polynomialText(...g);
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
