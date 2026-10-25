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
 * The points a scene draws: stars and the upper cone by depth, everything else by a ball. `deep` says which test a
 * point takes. The upper cone (Δ = 0, a + c > 0) goes with the stars it bounds; a + c > 0 is the future nappe, which
 * SL₂(ℝ) preserves, so a point never changes test as the sky moves.
 */
export const deep = (a, b, c) => (a > 0 && b * b < 4 * a * c) || (b * b === 4 * a * c && a + c > 0);

/**
 * Depth of a form seen from the point x + iy of the root picture: the a + c of its image under any h ∈ SL₂(ℝ) with
 * h·(x + iy) = i, namely y·a + f(x)/y. It is ℓ·(a, b, c) for ℓ = (y + x²/y, x/y, 1/y), with ℓ_a·ℓ_c − ℓ_b² = 1.
 * For a star it is √|Δ|·cosh d(root, x + iy), so it bounds a hyperbolic disk around the viewpoint.
 */
export const depthFrom = (x, y, a, b, c) => y * a + (a * x * x + b * x + c) / y;

/**
 * The lattice points a scene needs around the viewpoint x + iy, packed for the GPU. Seen from there a form has depth
 * Y′ = depthFrom(x, y, …) and display length |v′|² = Δ + 2Y′² (since X′² + Z′² − Y′² = Δ), so the catalogue is
 *  - every star (Δ < 0, a > 0) with Y′ ≤ depth,
 *  - every upper-cone form k(qx − p)² (Δ = 0, a + c > 0) with Y′ ≤ depth: its half-plane picture is a Ford circle.
 *    Only k ≤ depth is kept; that bites only high in a cusp, where (0, 0, k) has Y′ = k/y and would be unbounded,
 *  - every other nonzero point with |v′| ≤ ball (the "dust"), at most maxDust of them (again only a cusp can reach it).
 * At x + iy = i this is the old fixed crop: stars and cone with a + c ≤ depth, the rest in the display ball.
 *
 * Each loop solves its bound for the next coefficient, so the work is proportional to the output. In the moved
 * coordinates a′ = y·a, b′ = b + 2x·a, c′ = f(x)/y (an SL₂(ℝ) image, so b′² − 4a′c′ = Δ) the bounds read as at i:
 * a′ + c′ ≤ depth for the stars, and b′² + 2a′² + 2c′² ≤ ball² for the dust.
 * Returns typed arrays: coefficients (Int32, 3 per point), kind code (Uint8), primitive flag (Uint8), and the
 * largest |coefficient|, which bounds the shader's float32 products (see gpuPlaneExact).
 * @returns {{count:number, coefficients:Int32Array, maxCoefficient:number, kinds:Uint8Array, primitive:Uint8Array}}
 */
export function catalogue({ x = 0, y = 1, depth = 48, ball = 6, maxDust = 60000 } = {}) {
  let n = 0, cap = 1 << 16, coef = new Int32Array(3 * cap), kinds = new Uint8Array(cap), prim = new Uint8Array(cap), max = 0;
  const push = (a, b, c, k, p) => {
    if (n === cap) {
      cap *= 2;
      const grow = (old, m) => { const t = new old.constructor(m * cap); t.set(old); return t; };
      coef = grow(coef, 3); kinds = grow(kinds, 1); prim = grow(prim, 1);
    }
    coef[3 * n] = a; coef[3 * n + 1] = b; coef[3 * n + 2] = c; kinds[n] = k; prim[n] = p; n++;
    max = Math.max(max, Math.abs(a), Math.abs(b), Math.abs(c));
  };
  const eps = 1e-9, D = depth;
  // Stars: a′ = y·a < D (as c′ > 0), |b′| < 2√(a′(D − a′)), then b²/4a < c ≤ y(D − a′) − a·x² − b·x.
  for (let a = 1; a * y < D; a++) {
    const A = a * y, half = 2 * Math.sqrt(A * (D - A)) + eps, mid = -2 * x * a;
    for (let b = Math.ceil(mid - half); b <= mid + half; b++) {
      const top = Math.floor(y * (D - A) - a * x * x - b * x + eps);
      for (let c = Math.floor((b * b) / (4 * a)) + 1; c <= top; c++) push(a, b, c, 0, gcd(gcd(a, b), c) === 1 ? 1 : 0);
    }
  }
  // Upper cone: k(qx − p)² with gcd(p, q) = 1 has Y′ = k·(y·q² + (qx − p)²/y), so y·q² ≤ D. q = 0 is (0, 0, k).
  for (let q = 0; y * q * q <= D; q++) {
    const r = Math.sqrt(y * (D - y * q * q)) + eps;
    for (let p = q ? Math.ceil(q * x - r) : 1; q ? p <= q * x + r : p === 1; p++) {
      if (gcd(p, q) !== 1) continue;
      const kmax = Math.min(D, Math.floor(D / (y * q * q + (q * x - p) ** 2 / y) + eps));
      for (let k = 1; k <= kmax; k++) push(k * q * q, -2 * k * p * q, k * p * p, 3, k === 1 ? 1 : 0);
    }
  }
  // Dust: b′² + 2a′² + 2c′² ≤ ball², less the points the loops above hold already.
  const r2 = ball * ball + eps;
  let dust = 0;
  for (let a = Math.ceil(-ball / (Math.SQRT2 * y)); a * y * Math.SQRT2 <= ball; a++) {
    const ra = r2 - 2 * (a * y) ** 2, mid = -2 * x * a, sa = Math.sqrt(Math.max(0, ra));
    for (let b = Math.ceil(mid - sa); b <= mid + sa; b++) {
      const rb = ra - (b + 2 * x * a) ** 2;
      if (rb < 0) continue;
      const sc = y * Math.sqrt(rb / 2), base = -a * x * x - b * x;
      for (let c = Math.ceil(base - sc); c <= base + sc; c++) {
        if (!a && !b && !c) continue;
        const d = b * b - 4 * a * c, k = content(a, b, c);
        // The same comparisons as the loops above, so a deep point is taken exactly once.
        if (deep(a, b, c) && (d < 0 ? c <= y * (D - a * y) - a * x * x - b * x + eps : k <= D && k <= (D * k) / depthFrom(x, y, a, b, c) + eps)) continue;
        if (dust++ >= maxDust) break;
        push(a, b, c, d === 0 ? 3 : d > 0 ? 2 : a > 0 ? 0 : 1, k === 1 ? 1 : 0);
      }
    }
  }
  return { count: n, coefficients: coef.slice(0, 3 * n), maxCoefficient: max, kinds: kinds.slice(0, n), primitive: prim.slice(0, n) };
}

/** The catalogue seen from i: stars and the upper cone with a + c ≤ depth, the rest in the display ball. */
export const buildLattice = ({ ball = 6, depth = 48 } = {}) => catalogue({ depth, ball });

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
