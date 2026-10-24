// The shader's float32 arithmetic, replayed with Math.fround: the executable mirror of
// lean-float/StarscapeFloat.lean. A double product or sum of two binary32 values, rounded once by fround, is the
// correctly rounded binary32 result (53 ≥ 2·24 + 2, so double rounding is innocuous).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../src/math/forms.js';
import * as P from '../src/math/planes.js';

const f = Math.fround;
/** `b * b - 4.0 * a * c`, one rounding per GLSL operation. */
const deltaF = (a, b, c) => f(f(b * b) - f(f(4 * a) * c));
/** `-2.0 * n.z * a + n.y * b - 2.0 * n.x * c`, one rounding per GLSL operation. */
const planeF = ([A, B, C], [a, b, c]) => f(f(f(f(-2 * C) * a) + f(B * b)) - f(f(2 * A) * c));

const lattice = F.buildLattice({ ball: 6, depth: 96 });
const point = i => [0, 1, 2].map(k => lattice.coefficients[3 * i + k]);
let seed = 7;
const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const stars = [];
for (let i = 0; i < lattice.count; i++) if (lattice.kinds[i] === F.KIND_CODE.upper) stars.push(i);
const randomStar = () => point(stars[Math.floor(random() * stars.length)]);

test('the drawn lattice stays far below 2^10 (deltaF_eq_of_le)', () => {
  assert.equal(lattice.maxCoefficient, 96);   // 48(x − 1)² = (48, −96, 48), on the cone at depth 96
});

test('float32 Δ is exact on every drawn point', () => {
  for (let i = 0; i < lattice.count; i++) {
    const [a, b, c] = point(i);
    if (deltaF(a, b, c) !== b * b - 4 * a * c) assert.fail(`Δ(${a}, ${b}, ${c})`);
  }
});

test('planes through two drawn stars always satisfy the proved bound', () => {
  // |2C|, |B|, |2A| ≤ 8·96² = 73 728 for a cross product of duals, and 73 728 · 96 < 2^24.
  for (let t = 0; t < 4000; t++) {
    const plane = P.planeThrough(randomStar(), randomStar());
    if (!plane.error) assert.ok(P.gpuPlaneExact(plane.normal, lattice.maxCoefficient), String(plane.normal));
  }
});

test('under the bound, the float32 plane test marks exactly the points on the plane', () => {
  for (let t = 0; t < 12; t++) {
    const plane = P.planeThrough(randomStar(), randomStar());
    if (plane.error) continue;
    for (let i = 0; i < lattice.count; i++) {
      const p = point(i);
      if ((Math.abs(planeF(plane.normal, p)) < 0.5) !== P.onPlane(plane.normal, p)) assert.fail(`${plane.normal} at ${p}`);
    }
  }
});

test('past the bound float32 can miss a star on the plane, so the guard is needed', () => {
  const normal = [5840707, -33016826, -17578201], star = [37, 21, 52];
  assert.ok(P.onPlane(normal, star));
  assert.equal(planeF(normal, star), -64);
  assert.equal(P.gpuPlaneExact(normal, lattice.maxCoefficient), false);
});
