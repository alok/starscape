// Where a lattice point is drawn in each picture, and how big: the CPU mirror of the vertex shader in
// src/render/stars.js (keep the two in step). Pure, so the geometry can be tested without a GPU.
//
// Stages, in display units: 0 the lattice point v = ρ(g)·(−b, a+c, c−a); 1 Klein, on the screen Y = H; 2 Poincaré;
// 3 the upper half-plane, x + iy drawn at (x·HP, H, (y − 1)·HP). A star of discriminant Δ is a hyperbolic disk of
// radius R₀/√|Δ|, which the half-plane shows with Euclidean radius R₀/(2a′), a′ = ρ(g)'s leading coefficient.
//
// A double-root form k(qx − p)² is a horocycle at its root. Drawn as disks (rings, in the shader), it is the circle
// tangent to the boundary there: in the half-plane its radius is R₀/(2kq²), and in the Poincaré disk R₀/(R₀ + |Y′|),
// the conformal image of the same circle. For k = 1 and R₀ = 1 these are exactly the Ford circles; for R₀ < 1 each is
// its Ford circle shrunk about the point of tangency, so circles at different roots never meet, and the multiples
// k(qx − p)² nest inside at the same point. Drawn as points, a null form stays at its root.
//
// The shader lifts a ring from its root by the radius it actually draws, which its size limits can shrink; this
// mirror lifts by the geometric radius. The two agree until a ring reaches the shader's size cap (uRingMaxPx).

export const KIND = { upper: 0, lower: 1, exterior: 2, null: 3 };
const ZERO = [0, 0, 0];

/**
 * @param {number[]} rho  ρ(g) in display coordinates, row-major mat3
 * @param {{H:number, HP:number, R0:number, disks:boolean}} opts
 * @returns {{kind:number, hidden:boolean, stages:[number[], number, number[]][]}}
 *   per stage: the root's position, the radius, and the unit direction from the root to the drawn center
 */
export function stages(a, b, c, rho, { H, HP, R0, disks }) {
  const X0 = -b, Y0 = a + c, Z0 = c - a;
  const X = rho[0] * X0 + rho[1] * Y0 + rho[2] * Z0, Y = rho[3] * X0 + rho[4] * Y0 + rho[5] * Z0, Z = rho[6] * X0 + rho[7] * Y0 + rho[8] * Z0;
  const delta = b * b - 4 * a * c, kind = delta === 0 ? KIND.null : delta > 0 ? KIND.exterior : a > 0 ? KIND.upper : KIND.lower;
  const isNull = kind === KIND.null;
  const Ys = Math.abs(Y) > 1e-6 ? Y : 1e-6, ku = X / Ys, kv = Z / Ys;
  // On the cone 1 − |k|² is exactly 0; computed, it is ±ε, and √ε would lift a root off the boundary.
  const s = isNull ? 0 : Math.sqrt(Math.max(0, 1 - ku * ku - kv * kv)), pu = ku / (1 + s), pv = kv / (1 + s);
  const r1 = (R0 * H) / Math.max(Math.abs(Y), 1e-6);
  const r2 = isNull ? (H * R0) / (Math.abs(Y) + R0)
    : H * (R0 / Math.sqrt(Math.max(Math.abs(delta), 1))) * Math.max(0, 1 - pu * pu - pv * pv) * 0.5;
  const den = Math.max(1 - kv, 1e-6), aT = 0.5 * (Y - Z);
  const r3 = (HP * R0) / (2 * Math.max(Math.abs(aT), 1e-3));
  const ring = isNull && disks;
  return {
    kind,
    // The shader drops a null form whose root is ∞ once the picture is the half-plane.
    hidden: isNull && Math.abs(aT) < 1e-3,
    stages: [
      [[X, Y, Z], R0, ZERO],
      [[ku * H, H, kv * H], r1, ZERO],
      [[pu * H, H, pv * H], r2, ring ? [-pu, 0, -pv] : ZERO],
      [[(ku / den) * HP, H, (s / den - 1) * HP], r3, ring ? [0, 0, 1] : ZERO],
    ],
  };
}

/**
 * Position and radius at morph m ∈ [0, 3], interpolated between consecutive stages as the shader does. `position` is
 * the drawn center, `root` the point it is tangent at (they differ only for rings).
 */
export function stageAt(a, b, c, rho, morph, opts) {
  const { kind, hidden, stages: st } = stages(a, b, c, rho, opts), m = Math.min(3, Math.max(0, morph));
  const i = m <= 1 ? 0 : m <= 2 ? 1 : 2, f = m - i;
  const [Pa, ra, La] = st[i], [Pb, rb, Lb] = st[i + 1];
  const mix = (u, v) => u.map((x, j) => x + (v[j] - x) * f);
  const root = mix(Pa, Pb), radius = ra + (rb - ra) * f, lift = mix(La, Lb);
  return { position: root.map((x, j) => x + lift[j] * radius), root, lift, radius, kind, hidden: hidden && m > 2 };
}
