import Starscape.Lattice

/-!
# The shared fixtures

The parity fixtures that every Starscape implementation (browser, native, Lean) must agree on. Statements proved
with `decide` or `rfl` are checked by the kernel. Statements marked `#guard` are evaluated by the compiled program,
which is a test, not a proof.
-/

namespace Starscape

/-! ## Kernel-checked -/

/-- Snap absorbs `T⁴`: the recorded counterexample from `−0.4 + 0.1i` to `−0.4 + i` settles on `T⁴`, which sends
`(13, 20, 34)` to `(13, −84, 162)`. (That the drag settles on `T⁴` is a floating-point fact about the viewer;
this is the exact relabeling that follows.) -/
theorem snap_T4 : rho ⟨1, 4, 0, 1⟩ ⟨13, 20, 34⟩ = ⟨13, -84, 162⟩ := by decide

/-- The stars `x² + 1` and `x² + x + 1` span the plane with normal `2·(1, 0, −1)`: `2a − 2c = 0`, the unit
circle, from −1 to 1. -/
theorem pair_unit_circle : pairNormal ⟨1, 0, 1⟩ ⟨1, 1, 1⟩ = ⟨2, 0, -2⟩ := by decide

/-- `x² − 1` is dust with `Δ = 4`, and both stars lie on its plane. -/
theorem unit_circle_members : bil ⟨1, 0, -1⟩ ⟨1, 0, 1⟩ = 0 ∧ bil ⟨1, 0, -1⟩ ⟨1, 1, 1⟩ = 0 ∧
    (Form.disc ⟨1, 0, -1⟩) = 4 := by decide

/-- The `√5` fixture, scaled to integers: `g = [[3, 1], [1, 2]]` has determinant 5 and sends `(1, 0, 1)` to
`5 · (1, −2, 2)`, i.e. `i ↦ 1 + i`. -/
theorem sqrt5_fixture : rho ⟨3, 1, 1, 2⟩ ⟨1, 0, 1⟩ = (5 : Int) • (⟨1, -2, 2⟩ : Form) := by decide

/-- `T` and `S` generate the familiar moves: `x² + 1` is fixed by `S` (its root `i` is), and `T` sends it to
`x² − 2x + 2` (root `1 + i`). -/
theorem S_fixes_i : rho Mat.S ⟨1, 0, 1⟩ = ⟨1, 0, 1⟩ := by decide
theorem T_moves_i : rho Mat.T ⟨1, 0, 1⟩ = ⟨1, -2, 2⟩ := by decide

/-- A multiple keeps its line of sight and is `k²` times dimmer: `(2, 2, 4) = 2 · (1, 1, 2)` and `Δ = −28 = 4 · −7`. -/
theorem multiple_dimmer : ((2 : Int) • (⟨1, 1, 2⟩ : Form)).disc = 4 * (Form.disc ⟨1, 1, 2⟩) := by decide

/-! ## Evaluated (tests, not proofs) -/

#guard (ball 6).length == 480
#guard (stars 48).length == 59084
#guard (stars 57).length == 98696
#guard [3, 4, 7, 8, 11, 15, 20, 23, 47, 71].map classNumber == [1, 1, 1, 1, 1, 2, 2, 3, 5, 7]
#guard (reduced 23).map (fun f => (f.a, f.b, f.c)) == [(1, 1, 6), (2, -1, 3), (2, 1, 3)]

end Starscape
