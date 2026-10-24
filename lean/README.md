# Starscape in Lean 4

A standalone Lake package on core Lean 4.30, with no Mathlib, holding the mathematics behind the browser viewer.
Polynomial identities close with core `grind`, and the package builds in seconds.

```bash
lake build                       # the library and the bridge
lake exe starscape-bridge        # writes ../data/lean-bridge.json
```

Three kinds of evidence live here. They are kept apart because they mean different things.

## 1. Kernel-checked theorems

Each depends on `propext`, `Classical.choice` and `Quot.sound` (through `grind`), except `a_ne_zero_of_disc_neg`,
which needs only `propext` and `Quot.sound`. To check, run `lake env lean Axioms.lean`.

| File | Theorem | Statement |
|---|---|---|
| `Form.lean` | `disc_eq_lorentz` | Δ is the Lorentz form `X² + Z² − Y²` in the display basis `(−b, a+c, c−a)` |
| | `display_smul`, `disc_smul` | scaling: `display(k·f) = k·display f`, `Δ(k·f) = k²Δ(f)` |
| | `a_ne_zero_of_disc_neg` | a form with `Δ < 0` has `a ≠ 0` |
| `Action.lean` | `Mat.det_mul` | `det(gh) = det g · det h` |
| | `disc_rho`, `disc_rho_of_det_one` | `Δ(ρ(g)f) = det(g)²·Δ(f)`, so SL₂(ℤ) preserves Δ |
| | `eval_rho` | for `det g = 1`, `(ρ(g)f)(g·v) = f(v)` for every integer vector `v` |
| | `rho_mul`, `rho_one`, `rho_smul` | ρ is an action, and it commutes with scaling |
| `Plane.lean` | `bil_self`, `bil_comm` | the bilinear form `B(n,f) = n_b f_b − 2n_a f_c − 2n_c f_a` polarizes Δ |
| | `bil_rho`, `onPlane_rho` | `B` scales by `det²`, so planes move with the lattice |
| | `pairNormal_spans` | the pair normal is orthogonal to both forms |
| `Farey.lean` | `farey_disc`, `farey_disc_one` | `(qx − p)(sx − r)` has `Δ = (ps − qr)²`; Farey neighbors give `Δ = 1` |
| | `farey_roots` | that form vanishes at `p/q` and `r/s` |
| | `rho_farey`, `farey_neighbors_image` | ρ(g) sends Farey edges to Farey edges |

`eval_rho` holds on all of ℤ², so it is a polynomial identity, and that is why complex roots move by `g`. That last
step, from ℤ² to ℂ, is not formalized here.

## 2. Kernel-checked fixtures, by `decide`

These depend on no axioms at all: `snap_T4` (`(13,20,34) ↦ (13,−84,162)`), `pair_unit_circle` (normal `(2,0,−2)`),
`unit_circle_members`, `sqrt5_fixture`, `S_fixes_i`, `T_moves_i`, `multiple_dimmer`.

## 3. Compiled tests, not proofs

The `#guard` lines in `Fixtures.lean` evaluate at compile time: 480 points in the radius-6 ball, 59,084 and 98,696 stars at
depths 48 and 57, the class numbers `h(−k)` for `k ∈ {3, 4, 7, 8, 11, 15, 20, 23, 47, 71}`, and the reduced forms of
`Δ = −23`. They check particular values; they prove nothing general.

`reduced k` lists the reduced **primitive** forms, one per orbit of primitive forms, so its length is `h(−k)`. The shell
`Δ = −k` has more orbits when `k/f²` is a discriminant for some `f > 1`. Those are multiples `f·g`. The web app's
`shellClasses` lists them all, and `test/math.test.js` checks it against Gauss reduction.

## The bridge

`lake exe starscape-bridge` writes counts, the reduced forms and class numbers for `|Δ| < 400`, ρ images and pair normals
to `data/lean-bridge.json`. `test/lean-bridge.test.js` checks the browser's exact arithmetic against that file. Lean is
the reference; the hosted page needs no server.

## Not covered here

- The GPU's float32 arithmetic: see [`../lean-float`](../lean-float/README.md) (on FloatLib, with Mathlib).
- Anything visual or interactive: rendering, layout, WebXR and hand gestures are checked by tests, screenshots or not at
  all, as the top-level README says. None of it is a Lean claim.

Some of these (roots move by `g`, Farey edges have `Δ = 1` and map to edges, the T⁴ and unit-circle fixtures) are restated
for the live Lean service's own types in the open PR [alok/lean-starscape#1](https://github.com/alok/lean-starscape/pull/1).
