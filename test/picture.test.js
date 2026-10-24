// The picture geometry (src/math/picture.js, the CPU mirror of the vertex shader): null forms are Ford circles.
// This checks the mirror's geometry. The shader lifts a ring by the radius it actually draws, which equals this
// geometric radius until the ring reaches its size cap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageAt, KIND } from '../src/math/picture.js';
import * as G from '../src/math/sl2.js';
import * as M from '../src/math/models.js';
import { gcd, buildLattice } from '../src/math/forms.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1], H = 4, HP = 2;
const opts = ({ R0 = 1, disks = true } = {}) => ({ H, HP, R0, disks });

/** The half-plane circle of a form: center x + iy and radius, in half-plane units. */
function circle(form, { R0 = 1, disks = true, rho = I } = {}) {
  const st = stageAt(...form, rho, 3, opts({ R0, disks }));
  return { kind: st.kind, x: st.position[0] / HP, y: st.position[2] / HP + 1, r: st.radius / HP };
}
const square = (p, q, k = 1) => [k * q * q, -2 * k * p * q, k * p * p];   // k(qx − p)²

/** The circle through three points. */
function circumcircle([ax, ay], [bx, by], [cx, cy]) {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  return { x: ux, y: uy, r: Math.hypot(ax - ux, ay - uy) };
}

const fractions = [];
for (let q = 1; q <= 9; q++) for (let p = -2 * q; p <= 2 * q; p++) if (gcd(p, q) === 1) fractions.push([p, q]);

test('(qx − p)² is drawn as the Ford circle at p/q: center p/q + i/2q², radius 1/2q²', () => {
  for (const [p, q] of fractions) {
    const c = circle(square(p, q));
    assert.equal(c.kind, KIND.null);
    close(c.x, p / q); close(c.y, 1 / (2 * q * q)); close(c.r, 1 / (2 * q * q));
  }
});

test('Ford circles touch exactly when the fractions are Farey neighbors, and never overlap', () => {
  const cs = fractions.map(([p, q]) => ({ p, q, ...circle(square(p, q)) }));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const A = cs[i], B = cs[j], gap = Math.hypot(A.x - B.x, A.y - B.y) - (A.r + B.r);
    if (Math.abs(A.p * B.q - B.p * A.q) === 1) close(gap, 0, 1e-12);
    else assert.ok(gap > 1e-6, `${A.p}/${A.q} and ${B.p}/${B.q} overlap`);
  }
});

test('at R₀ < 1 each circle is its Ford circle shrunk about the tangency: different roots never meet', () => {
  const R0 = 0.11, cs = fractions.map(([p, q]) => circle(square(p, q), { R0 }));
  fractions.forEach(([p, q], i) => { close(cs[i].x, p / q); close(cs[i].y, cs[i].r); close(cs[i].r, R0 / (2 * q * q)); });
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++)
    assert.ok(Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) > cs[i].r + cs[j].r);
  // A multiple k(qx − p)² is a smaller circle tangent at the same point, inside it.
  const c2 = circle(square(3, 2, 2), { R0 });
  close(c2.x, 1.5); close(c2.y, c2.r); close(c2.r, R0 / 16);
});

test('drawn as points, a null form stays at its root on ℝ', () => {
  const c = circle(square(1, 3), { disks: false });
  close(c.x, 1 / 3); close(c.y, 0);
});

test('SL₂(ℤ) carries Ford circles to Ford circles', () => {
  for (const g of [G.T, G.S, G.multiply(G.T, G.S), [2, 1, 1, 1]]) {
    const rho = G.displayPushforward(g);
    for (const [p, q] of fractions) {
      // g·(p/q) = (αp + βq)/(γp + δq); the image is the Ford circle there unless it is ∞.
      let pp = g[0] * p + g[1] * q, qq = g[2] * p + g[3] * q;
      if (qq === 0) continue;
      if (qq < 0) { pp = -pp; qq = -qq; }
      const c = circle(square(p, q), { rho });
      close(c.x, pp / qq); close(c.y, 1 / (2 * qq * qq)); close(c.r, 1 / (2 * qq * qq));
    }
  }
});

test('in the Poincaré disk a null circle is the conformal image of its half-plane circle, tangent inside', () => {
  for (const R0 of [1, 0.11]) for (const [p, q] of fractions) {
    const st = stageAt(...square(p, q), I, 2, opts({ R0 })), r = st.radius / H;
    const [cx, cz] = [st.position[0] / H, st.position[2] / H], [bx, bz] = [st.root[0] / H, st.root[2] / H];
    close(Math.hypot(bx, bz), 1);                    // the root is on the boundary circle
    close(Math.hypot(cx, cz) + r, 1);                // internally tangent there
    close(cx * bz - cz * bx, 0);                     // its center on the radius through the root
    // Map three points of the half-plane circle (center p/q + iρ, radius ρ = R₀/2q²) into the disk; Möbius maps send
    // circles to circles, so the circle through their images is the true image. Compare center and radius.
    const rho = R0 / (2 * q * q), image = [0.5, 2, 4].map(t => M.kleinToPoincare(...M.halfPlaneToKlein({
      x: p / q + rho * Math.cos(t), y: rho + rho * Math.sin(t) }))), fit = circumcircle(...image);
    close(fit.r, r, 1e-9); close(fit.x, cx, 1e-9); close(fit.y, cz, 1e-9);
  }
});

test('the morph is continuous through every stage, rings included', () => {
  for (const form of [square(1, 2), square(-3, 4, 2), [2, 1, 3], [1, 0, 1]]) for (const m of [1, 2]) {
    const lo = stageAt(...form, I, m - 1e-9, opts({ R0: 0.11 })), hi = stageAt(...form, I, m + 1e-9, opts({ R0: 0.11 }));
    lo.position.forEach((x, j) => close(x, hi.position[j], 1e-6));
    close(lo.radius, hi.radius, 1e-6);
  }
});

test('a null form whose root is ∞ is hidden in the half-plane only', () => {
  assert.equal(stageAt(0, 0, 1, I, 3, opts()).hidden, true);
  assert.equal(stageAt(0, 0, 1, I, 1.5, opts()).hidden, false);
  assert.equal(stageAt(1, 0, 0, I, 3, opts()).hidden, false);
});

test('a star sits at its root with radius R₀/2a', () => {
  const c = circle([2, 2, 1], { R0: 0.5 });          // 2x² + 2x + 1, root (−1 + i)/2
  close(c.x, -0.5); close(c.y, 0.5); close(c.r, 0.125);
});

test('the lattice holds the Ford circles: every k(qx − p)² with a > 0 and a + c ≤ depth, once', () => {
  const depth = 57, L = buildLattice({ ball: 6, depth }), seen = new Set();
  for (let i = 0; i < L.count; i++) if (L.kinds[i] === KIND.null) seen.add([0, 1, 2].map(j => L.coefficients[3 * i + j]).join());
  let want = 0;
  for (let q = 1; q * q <= depth; q++) for (let p = -depth; p <= depth; p++) {
    if (gcd(p, q) !== 1) continue;
    for (let k = 1; k * (p * p + q * q) <= depth; k++) { want++; assert.ok(seen.has(square(p, q, k).join()), `${k}(${q}x − ${p})²`); }
  }
  const upper = [...seen].filter(t => Number(t.split(',')[0]) > 0 && Number(t.split(',')[0]) + Number(t.split(',')[2]) <= depth);
  assert.equal(upper.length, want);
});
