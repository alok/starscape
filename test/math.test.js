import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/math/forms.js';
import * as G from '../src/math/sl2.js';
import * as M from '../src/math/models.js';
import * as P from '../src/math/planes.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const lorentz = ([X, Y, Z]) => X * X + Z * Z - Y * Y;

test('display basis turns Δ into the Lorentz form', () => {
  for (const [a, b, c] of [[1, 0, 1], [2, -3, 5], [-4, 7, 1], [0, 1, 0]]) {
    assert.equal(lorentz(F.toDisplay(a, b, c)), F.discriminant(a, b, c));
    assert.deepEqual(F.fromDisplay(...F.toDisplay(a, b, c)), [a, b, c]);
  }
});

test('the radius-6 fixture has 480 points with both nappes', () => {
  const L = F.buildLattice({ ball: 6, depth: 0 });
  assert.equal(L.count, 480);
  const kinds = new Set(L.kinds);
  for (const k of Object.values(F.KIND_CODE)) assert.ok(kinds.has(k));
});

test('star counts by depth a + c ≤ R', () => {
  // Her viewer labels its cloud "a + c ≤ 48 · 98,696"; 98,696 is exactly the count at R = 57.
  assert.equal(F.starCount(48), 59084);
  assert.equal(F.starCount(57), 98696);
});

test('polynomial and root text', () => {
  assert.equal(F.polynomialText(1, 1, 1), 'x² + x + 1');
  assert.equal(F.polynomialText(2, -2, 4), '2x² − 2x + 4');
  assert.equal(F.polynomialText(-1, 1, -2), '−x² + x − 2');
  assert.equal(F.rootText(1, 0, 1), 'i');
  assert.equal(F.rootText(1, 1, 1), '(−1 + i√3)/2');
  assert.equal(F.rootText(2, 0, 2), 'i');
  assert.equal(F.rootText(1, 0, -1), '−1 and 1');
  assert.equal(F.rootText(1, -1, -1), '(1 ± √5)/2');
  assert.equal(F.rootText(4, -4, 1), '1/2 (double)');
  assert.equal(F.rootText(0, 1, 2), '−2 and ∞');
  assert.equal(F.rootText(4, 0, 1), 'i/2');
  assert.equal(F.rootText(9, 0, 4), '2i/3');
  assert.equal(F.rootText(4, 0, 3), 'i√3/2');
  assert.equal(F.rootText(-25, 0, -1), 'i/5');
  assert.equal(F.rootText(4, 0, -5), '(±√5)/2');
  // A constant c is the binary form c·y², with a double root at ∞, as the card's "a double root" says.
  for (const c of [1, -3, 4]) {
    assert.equal(F.rootText(0, 0, c), '∞ (double)');
    assert.deepEqual(F.realRoots(0, 0, c), [Infinity, Infinity]);
  }
});

test('Δ, kind and root text stay exact past 2⁵³', () => {
  // 12-digit coefficients: Δ needs 25 digits, and b² − 4ac in doubles loses the last 11.
  assert.equal(F.discriminantExact(999999999999, 1, 999999999999), -3999999999992000000000003n);
  assert.equal(F.discriminantExact(0n, 999999999999n, 1n), 999999999998000000000001n);
  // Δ = (2n+1)² − 4n(n+1) = 1 and Δ = 1 − 4·47453133²: doubles round them to 0 and to −…756.
  for (const [t, d, kind, root] of [
    [[47453133, 94906267, 47453134], 1, 'exterior', '−47453134/47453133 and −1'],
    [[499999999999, 999999999999, 500000000000], 1, 'exterior', '−500000000000/499999999999 and −1'],
    [[-47453133, 1, -47453133], -9007199326062755n, 'lower', '(1 + 167i√322966019795)/94906266'],
    [[42443373, 42443373, -42443373], 9007199558085645n, 'exterior', '(−1 ± √5)/2'],
    [[10000, 100000001, 250000005001], -39999, 'upper', '(−100000001 + i√39999)/20000'],
    [[1, 0, 4012009], -16048036, 'upper', '2003i'],
  ]) {
    assert.equal(F.discriminantExact(...t), BigInt(d), `Δ${t}`);
    assert.equal(F.kind(...t), kind, `kind ${t}`);
    assert.equal(F.rootText(...t), root, `root ${t}`);
    assert.equal(F.rootText(...t.map(BigInt)), root, 'BigInt coefficients give the same text');
  }
  // The Number Δ is exact up to 2⁵³ and keeps its sign beyond.
  for (let i = 0; i < 2000; i++) {
    const t = [0, 1, 2].map(() => Math.round((Math.random() - 0.5) * 2 ** (10 + (i % 44))));
    const exact = F.discriminantExact(...t), d = F.discriminant(...t);
    assert.equal(Math.sign(d), Number(exact > 0n) - Number(exact < 0n), `sign of Δ${t}`);
    if (exact <= 2n ** 53n && exact >= -(2n ** 53n)) assert.equal(BigInt(d), exact, `Δ${t}`);
  }
  assert.equal(F.polynomialText(999999999999n * 10n ** 9n, -1n, 0n), '999999999999000000000x² − x');
  assert.deepEqual(F.squarePart(9007199326062755n), [167n, 322966019795n]);
  assert.deepEqual(F.squarePart(4n * 2003n ** 2n), [4006n, 1n]);
});

test('reduced forms count class numbers', () => {
  const h = k => F.reducedForms(k).length;
  assert.deepEqual([3, 4, 7, 8, 15, 20, 23, 47, 71].map(h), [1, 1, 1, 1, 2, 2, 3, 5, 7]);
});

/** Gauss reduction of a positive definite form by T^±1 and S: the reduced representative of its orbit. */
function gaussReduce([a, b, c]) {
  for (;;) {
    while (b > a) { c += a - b; b -= 2 * a; }
    while (b <= -a) { c += a + b; b += 2 * a; }
    if (c < a) { [a, b, c] = [c, -b, a]; continue; }
    if (c === a && b < 0) b = -b;
    return [a, b, c];
  }
}

test('shell orbits: every star of Δ = −k reduces into shellClasses(k), and h(−k) counts the primitive ones', () => {
  for (let k = 3; k <= 160; k++) {
    const want = F.shellClasses(k).map(c => c.form.join()).sort(), got = new Set();
    // Every orbit's reduced form has a ≤ √(k/3) < 30, so this box meets every orbit.
    for (let a = 1; a <= 30; a++) for (let b = -30; b <= 30; b++) {
      if ((b * b + k) % (4 * a)) continue;
      const f = [a, b, (b * b + k) / (4 * a)], r = gaussReduce(f);
      assert.equal(r[1] * r[1] - 4 * r[0] * r[2], -k);
      assert.equal(F.content(...r), F.content(...f), 'content is constant on an orbit');
      got.add(r.join());
    }
    assert.deepEqual([...got].sort(), want, `k = ${k}`);
    assert.equal(F.shellClasses(k).filter(c => c.content === 1).length, F.reducedForms(k).length);
  }
  // (1,0,3) and (2,2,2) share the shell Δ = −12 but not an orbit: contents 1 and 2.
  assert.deepEqual(F.shellClasses(12).map(c => c.form), [[1, 0, 3], [2, 2, 2]]);
  assert.equal(F.reducedForms(12).length, 1);
});

const isReduced = ([a, b, c]) => Math.abs(b) <= a && a <= c && (b >= 0 || (-b !== a && a !== c));

test('reduce finds the one reduced form in the orbit, by brute force over SL₂(ℤ)', () => {
  // Every γ ∈ SL₂(ℤ) with entries in [−6, 6]: enough to reach the reduced form of any star with |coef| ≤ 10.
  const gammas = [];
  for (let p = -6; p <= 6; p++) for (let q = -6; q <= 6; q++) for (let r = -6; r <= 6; r++) for (let s = -6; s <= 6; s++) {
    if (p * s - q * r === 1) gammas.push(G.pushforward([p, q, r, s]));
  }
  for (let a = 1; a <= 10; a++) for (let b = -10; b <= 10; b++) for (let c = 1; c <= 10; c++) {
    if (b * b >= 4 * a * c) continue;
    const found = new Set();
    for (const m of gammas) { const g = G.apply3(m, [a, b, c]); if (isReduced(g)) found.add(g.join()); }
    assert.equal(found.size, 1, `one reduced form in the orbit of (${a}, ${b}, ${c})`);
    assert.equal(F.reduce(a, b, c).join(), [...found][0], `(${a}, ${b}, ${c})`);
    assert.equal(F.reduce(-a, -b, -c).map(x => -x).join(), [...found][0], 'a lower star reduces through −f');
  }
  assert.equal(F.reduce(1, 0, -1), null);
  assert.equal(F.reduce(0, 0, 1), null);
});

test('reduce undoes long words in T and S, far past 2⁵³', () => {
  // T^n: (a, b, c) ↦ (a, b + 2an, an² + bn + c); S: (a, b, c) ↦ (c, −b, a). Both are in SL₂(ℤ).
  const T = ([a, b, c], n) => [a, b + 2n * a * n, (a * n + b) * n + c], S = ([a, b, c]) => [c, -b, a];
  let seed = 7;
  const rand = n => { seed = (seed * 48271) % 2147483647; return BigInt(seed % n) - BigInt(n >> 1); };
  for (const k of [3, 4, 23, 71, 1368, 39999]) {
    for (const r of F.shellClasses(k).map(o => o.form.map(BigInt))) {
      let f = r;
      for (let i = 0; i < 40; i++) f = S(T(f, rand(2001)));
      assert.ok(f.some(x => x > 2n ** 200n || x < -(2n ** 200n)), 'the word leaves the doubles far behind');
      assert.deepEqual(F.reduce(...f), r, `k = ${k}`);
      assert.deepEqual(F.reduce(...f.map(x => -x)), r.map(x => -x));
    }
  }
  // A multiple's class is the multiple of its primitive class (ρ is linear).
  assert.deepEqual(F.reduce(26, 40, 68), [26n, -12n, 54n]);
  assert.deepEqual(F.reduce(13, 20, 34), [13n, -6n, 27n]);
});

test('class text: content and sign times the reduced primitive form', () => {
  assert.equal(F.classText(13, 20, 34), '13x² − 6x + 27');
  assert.equal(F.classText(2, 3, 3), '2x² + x + 2');
  assert.equal(F.classText(2, 2, 2), '2(x² + x + 1)');
  assert.equal(F.classText(-1, 0, -1), '−(x² + 1)');
  assert.equal(F.classText(-26, -40, -68), '−2(13x² − 6x + 27)');
  assert.equal(F.classText(1n, 94906267n, 2251799878968823n), 'x² + x + 1');
  assert.equal(F.classText(1, 0, -1), null);
  assert.equal(P.planeEquation([1n, 0n, -1n]), '2a − 2c = 0');
  assert.equal(P.planeEquation([10n ** 20n, 1n, 0n]), 'b − 200000000000000000000c = 0');
});

test('ρ(g) moves roots by g and preserves Δ', () => {
  const g = G.normalize([3, 1, 1, 2]);
  const z = G.act(g, { x: 0, y: 1 });
  close(z.x, 1); close(z.y, 1);
  const image = G.apply3(G.pushforward(g), [1, 0, 1]);
  [1, -2, 2].forEach((x, i) => close(image[i], x));
  const m = G.displayPushforward(g);
  for (const p of [[1, 0, 1], [3, 2, 5], [1, 5, -2]]) {
    const v = F.toDisplay(...p);
    close(lorentz(G.apply3(m, v)), lorentz(v), 1e-8);
    const root = F.upperRoot(...p);
    if (root) {
      const moved = M.displayToRoot(...G.apply3(m, v)), expected = G.act(g, root);
      close(moved.x, expected.x); close(moved.y, expected.y);
    }
  }
});

test('Klein, Poincaré and half-plane round trip', () => {
  for (const z of [{ x: 0, y: 1 }, { x: -0.5, y: Math.sqrt(3) / 2 }, { x: 2, y: 0.25 }]) {
    const [u, v] = M.halfPlaneToKlein(z), back = M.kleinToHalfPlane(u, v);
    close(back.x, z.x); close(back.y, z.y);
    const [p, q] = M.kleinToPoincare(u, v), [u2, v2] = M.poincareToKlein(p, q);
    close(u2, u); close(v2, v);
  }
});

test('the (1,0,1)–(1,1,1) pair cuts 2a − 2c = 0 with endpoints ±1', () => {
  const plane = P.planeThrough([1, 0, 1], [1, 1, 1]);
  assert.deepEqual(plane.normal, [1, 0, -1]);
  assert.equal(P.planeEquation(plane.normal), '2a − 2c = 0');
  assert.deepEqual(plane.endpoints, [-1, 1]);
  assert.ok(P.onPlane(plane.normal, [2, 2, 2]));
  assert.ok(!P.onPlane(plane.normal, [1, 0, 2]));
});

test('snap: the −0.4+0.1i → −0.4+i drag settles on T⁴', () => {
  const g = G.dragStep(G.identity, { x: -0.4, y: 0.1 }, { x: -0.4, y: 1 });
  const gamma = G.nearestIntegral(g);
  assert.deepEqual(gamma, [1, 4, 0, 1]);
  assert.deepEqual(G.pushforwardExact(gamma, [13, 20, 34]), [13n, -84n, 162n]);
});

test('interpolate runs from g0 to g1', () => {
  const g0 = G.normalize([2, 1, 1, 1.3]), g1 = [1, 1, 0, 1];
  const a = G.interpolate(g0, g1, 0), b = G.interpolate(g0, g1, 1);
  const same = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9) || x.every((v, i) => Math.abs(v + y[i]) < 1e-9);
  assert.ok(same(a, g0)); assert.ok(same(b, g1));
  const z0 = { x: 0.3, y: 0.7 }, z1 = { x: -1, y: 2 };
  const m = G.geodesicPoint(z0, z1, 0.5);
  close(G.hyperbolicDistance(z0, m), G.hyperbolicDistance(m, z1), 1e-9);
});
