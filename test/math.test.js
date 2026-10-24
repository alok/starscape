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
  assert.equal(F.rootText(1, 0, -1), '−1, 1');
  assert.equal(F.rootText(1, -1, -1), '(1 ± √5)/2');
  assert.equal(F.rootText(4, -4, 1), '1/2 (double)');
  assert.equal(F.rootText(0, 1, 2), '−2 and ∞');
});

test('reduced forms count class numbers', () => {
  const h = k => F.reducedForms(k).length;
  assert.deepEqual([3, 4, 7, 8, 15, 20, 23, 47, 71].map(h), [1, 1, 1, 1, 2, 2, 3, 5, 7]);
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
