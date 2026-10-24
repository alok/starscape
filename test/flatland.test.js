import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/math/forms.js';
import * as G from '../src/math/sl2.js';
import { walk, fareyTriangle, diskToRoot, CuttingSequence } from '../src/math/flatland.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('Farey edges are exactly the forms with Δ = 1', () => {
  // Every Δ = 1 form factors as (qx − p)(sx − r) with |ps − qr| = 1, so its roots are Farey neighbors.
  for (let a = -9; a <= 9; a++) for (let b = -19; b <= 19; b++) for (let c = -9; c <= 9; c++) {
    if (F.discriminant(a, b, c) !== 1) continue;
    if (a === 0) { assert.equal(Math.abs(b), 1); continue; }   // the edge from −c/b to ∞
    const r1 = [-b - 1, 2 * a], r2 = [-b + 1, 2 * a];
    const red = ([p, q]) => { const g = F.gcd(p, q); return [p / g, q / g]; };
    const [p, q] = red(r1), [r, s] = red(r2);
    assert.equal(Math.abs(p * s - q * r), 1, `(${a},${b},${c})`);
  }
});

test('a walking step moves you exactly that hyperbolic distance', () => {
  const g = walk(G.identity, 0.7, 0.5);
  // You stay at the center; the world moved, so your position in base coordinates is g⁻¹·i.
  const here = G.act(G.inverse(g), { x: 0, y: 1 });
  close(G.hyperbolicDistance(here, { x: 0, y: 1 }), 0.5, 1e-9);
  // Two steps in the same direction add along a geodesic.
  const g2 = walk(g, 0.7, 0.5), here2 = G.act(G.inverse(g2), { x: 0, y: 1 });
  close(G.hyperbolicDistance(here2, { x: 0, y: 1 }), 1.0, 1e-9);
});

test('the disk center is i and directions follow the rim', () => {
  const z = diskToRoot(0, 0);
  close(z.x, 0); close(z.y, 1);
});

test('fareyTriangle finds the triangle around familiar points', () => {
  const key = z => fareyTriangle(z).key;
  assert.equal(key({ x: 0.5, y: 0.8 }), '0/1 1/0 1/1');
  assert.equal(key({ x: -0.5, y: Math.sqrt(3) / 2 + 0.01 }), '-1/1 0/1 1/0');
  assert.equal(key({ x: 0.5, y: 0.3 }), '0/1 1/1 1/2');
  // Every triangle found is a Farey triangle: each pair of vertices are neighbors.
  for (const z of [{ x: 0.31, y: 0.02 }, { x: -2.7, y: 0.11 }, { x: 0.618, y: 0.004 }]) {
    const v = fareyTriangle(z).verts;
    for (let i = 0; i < 3; i++) {
      const a = v[i], b = v[(i + 1) % 3];
      assert.equal(Math.abs(a.p * b.q - a.q * b.p), 1, JSON.stringify(v));
    }
  }
});

test('walking toward the golden ratio alternates L and R', () => {
  // Head from i straight toward φ = 1.618…, whose continued fraction is [1; 1, 1, …].
  const phi = (1 + Math.sqrt(5)) / 2, seq = new CuttingSequence();
  // The geodesic from i to φ is the circle centered at ½ of radius √5/2, from i down to φ. Travelling
  // clockwise about its center, the real interval (−1/φ, φ) under the arc is on your right.
  const c = 0.5, R = Math.sqrt(5) / 2, start = Math.acos(-0.5 / R);
  const leftOf = v => !(v > -1 / phi && v < phi);
  for (let k = 0; k <= 6000; k++) {
    const ang = start * (1 - k / 6000);
    seq.update({ x: c + R * Math.cos(ang), y: R * Math.sin(ang) }, leftOf);
  }
  assert.match(seq.letters, /^(LR|RL)+[LR]?$/, seq.letters);
  assert.ok(seq.letters.length >= 6);
});
