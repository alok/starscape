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
  // Her viewer labels its cloud "a + c ≤ 48 · 98,696", but 98,696 is the count at ⌊1.2 · 48⌋ = 57: her catalogue is
  // padded for dragging, and she draws only a + c < 48.
  assert.equal(F.starCount(48), 59084);
  assert.equal(F.starCount(57), 98696);
});

/** Every point the catalogue seen from x + iy should hold, by brute force over a box that contains it. */
function catalogueByBrute(x, y, depth, ball) {
  const out = new Map(), M = Math.max(depth, ball), A = Math.ceil(M / y) + 2;
  for (let a = -A; a <= A; a++) for (let b = -Math.ceil(2 * Math.abs(x * a) + 4 * M + 4); b <= 2 * Math.abs(x * a) + 4 * M + 4; b++) {
    const reach = y * (M + y * Math.abs(a)), base = -a * x * x - b * x;
    for (let c = Math.floor(base - reach) - 2; c <= base + reach + 2; c++) {
      if (!a && !b && !c) continue;
      const d = F.discriminant(a, b, c), Y = F.depthFrom(x, y, a, b, c), k = F.content(a, b, c);
      const inBall = d + 2 * Y * Y <= ball * ball + 1e-9, byDepth = Y <= depth + 1e-9 && (d < 0 || k <= depth);
      if (F.deep(a, b, c) ? byDepth || inBall : inBall) out.set(`${a},${b},${c}`, `${d === 0 ? 3 : d > 0 ? 2 : a > 0 ? 0 : 1}/${+(k === 1)}`);
    }
  }
  return out;
}
const catalogueMap = L => {
  const m = new Map();
  for (let i = 0; i < L.count; i++) {
    const key = [0, 1, 2].map(j => L.coefficients[3 * i + j]).join();
    assert.ok(!m.has(key), `${key} twice`);
    m.set(key, `${L.kinds[i]}/${L.primitive[i]}`);
  }
  return m;
};

test('the catalogue seen from any point holds exactly the stars, cone and dust within its bounds, once each', () => {
  for (const [x, y, depth, ball] of [[0, 1, 20, 6], [0, 1, 0, 6], [0.3, 0.8, 20, 6], [0.37, 1.9, 15, 7.3], [-0.5, 0.866, 12, 5], [0.1, 3.5, 18, 6], [0.25, 0.3, 10, 6], [3.2, 0.7, 14, 6]]) {
    assert.deepEqual(catalogueMap(F.catalogue({ x, y, depth, ball })), catalogueByBrute(x, y, depth, ball), `${x} + ${y}i`);
  }
  // Seen from i it is the old fixed crop.
  assert.equal(F.buildLattice({ ball: 6, depth: 0 }).count, 480);
  assert.equal(F.catalogue({ depth: 57, ball: 0.5 }).kinds.filter(k => k === F.KIND_CODE.upper).length, F.starCount(57));
});

test('depth seen from z is the a + c of the form moved by any h with h·z = i, and the catalogue moves with SL₂(ℤ)', () => {
  const z = { x: 0.31, y: 0.62 }, h = G.toI(z);
  for (const f of [[1, 0, 1], [3, -2, 5], [7, 13, 6], [0, 0, 1]]) {
    const [a, , c] = G.apply3(G.pushforward(h), f);
    close(F.depthFrom(z.x, z.y, ...f), a + c);
  }
  // Seen from γ·z the catalogue is ρ(γ) of the one seen from z: labels change, the drawn sky does not.
  for (const gamma of [G.T, G.S, G.multiply(G.T, G.S), [2, 1, 1, 1]]) {
    const w = G.act(gamma, z), there = catalogueMap(F.catalogue({ x: w.x, y: w.y, depth: 16, ball: 6 }));
    const here = F.catalogue({ x: z.x, y: z.y, depth: 16, ball: 6 }), moved = new Map();
    for (let i = 0; i < here.count; i++) {
      const f = [0, 1, 2].map(j => here.coefficients[3 * i + j]);
      moved.set(G.pushforwardExact(gamma, f).map(Number).join(), `${here.kinds[i]}/${here.primitive[i]}`);
    }
    assert.deepEqual(there, moved, `γ = ${gamma}`);
  }
});

test('polynomial and root text', () => {
  assert.equal(F.polynomialText(1, 1, 1), 'x² + x + 1');
  assert.equal(F.polynomialText(2, -2, 4), '2x² − 2x + 4');
  assert.equal(F.polynomialText(-1, 1, -2), '−x² + x − 2');
  assert.equal(F.rootText(1, 0, 1), 'i');
  assert.equal(F.rootText(1, 1, 1), '(−1 + i√3)/2');
  assert.equal(F.rootText(2, 0, 2), 'i');
  assert.equal(F.rootText(1, 0, -1), '−1, 1');
  assert.equal(F.rootText(1, -1, -1), '(1 ± √5)/2');
  assert.equal(F.rootText(4, -4, 1), '1/2 (double)');
  assert.equal(F.rootText(0, 1, 2), '−2 and ∞');
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
