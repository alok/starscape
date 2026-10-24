# Starscape on FloatLib: the shader's float32 arithmetic is exact

The browser draws ~470,000 lattice points on the GPU, where the only arithmetic is IEEE binary32. Two integer
quantities are recomputed there, and `StarscapeFloat.lean` proves, on [FloatLib](https://github.com/lean-dojo/FloatLib)'s
binary32 rounding (`Model.roundAt binary32`, nearest-even), that the shader gets them right:

| Theorem | Says |
|---|---|
| `fl_int` | every integer of size below 2²⁴ is a binary32 value, so rounding fixes it |
| `deltaF_eq_of_le` | the shader's `b * b - 4.0 * a * c` is exactly Δ for coefficients up to 1024 (Starscape draws up to 96) |
| `planeF_decides` | the plane test `abs(-2.0*n.z*a + n.y*b - 2.0*n.x*c) < 0.5` is true exactly on the plane, whenever each of its three products is below 2²⁴ — even when the partial sum exceeds 2²⁴ and rounds |
| `planeF_decides_of_le` | the same from bounds: normal factors ≤ N, coefficients ≤ M, N·M < 2²⁴ |

All four depend only on `propext`, `Classical.choice` and `Quot.sound` (`#print axioms` at the end of the file).

The hypothesis of `planeF_decides_of_le` is checked at runtime: `gpuPlaneExact` in `src/math/planes.js` turns off the
star marking for a plane past the bound, which can happen after absorbing a large γ. `test/float32.test.js` replays the
shader with `Math.fround` over the whole drawn lattice. It also keeps a counterexample past the bound: the plane with
normal (5840707, −33016826, −17578201) passes through the star (37, 21, 52), but float32 evaluates the test to −64.

## Modeling

Each GLSL operation is one rounding of the exact real result, which is what IEEE 754 requires for `+ − ×` and what
FloatLib proves its executable binary32 does (`ExecFloat.Binary.toReal_add`, `toReal_mul`, …). A GPU may fuse a multiply
and an add into one rounding; every step here is exact anyway. WebGL's GLSL ES 3.00 asks only that `highp` stay within
1 ULP, so the theorem is about IEEE-conformant hardware, which current desktop and mobile GPUs are for these operations.

## Checking it

This package pins FloatLib v2.0.0 (which brings Mathlib v4.35.0):

```bash
lake exe cache get   # Mathlib's prebuilt oleans
lake build           # builds FloatLib, then StarscapeFloat
```

With FloatLib already built in another workspace at the same revision (e.g. `~/softmax-float`), checking the one file
takes seconds:

```bash
cd ~/softmax-float && lake env lean ~/starscape/lean-float/StarscapeFloat.lean
```

That second route is how it was checked on 2026-10-24; the `lake build` route was not run end to end.
