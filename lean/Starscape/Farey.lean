import Starscape.Plane

/-!
# The Farey tessellation is the dust at `Δ = 1`

The edge of the Farey tessellation between neighbors `p/q` and `r/s` (`|ps − qr| = 1`) is the geodesic with
those endpoints, the plane of the form `(qx − p)(sx − r)`. Its discriminant is `(ps − qr)²`, so Farey edges are
planes of exterior lattice points with `Δ = 1`: the dust nearest the light cone. The viewer's *Inside* mode draws
this tessellation on the ground, and the left/right turns you make walking through it are Series' coding of
geodesics by continued fractions.
-/

namespace Starscape

/-- `(qx − p)(sx − r)`, whose roots are `p/q` and `r/s`. -/
def farey (p q r s : Int) : Form := ⟨q * s, -(q * r + p * s), p * r⟩

theorem farey_disc (p q r s : Int) : (farey p q r s).disc = (p * s - q * r) ^ 2 := by
  unfold farey Form.disc; grind

/-- Farey neighbors give a `Δ = 1` form. -/
theorem farey_disc_one (p q r s : Int) (h : p * s - q * r = 1 ∨ p * s - q * r = -1) :
    (farey p q r s).disc = 1 := by
  rw [farey_disc]; rcases h with h | h <;> rw [h] <;> decide

/-- The roots really are `p/q` and `r/s`: the form vanishes at `(p, q)` and `(r, s)`. -/
theorem farey_roots (p q r s : Int) : (farey p q r s).eval p q = 0 ∧ (farey p q r s).eval r s = 0 := by
  unfold farey Form.eval; constructor <;> grind

/-- Matrices permute Farey edges exactly: `ρ(g)` sends the edge form of `p/q – r/s` to the edge form between the
images `g·(p, q)` and `g·(r, s)`. For `g ∈ SL₂(ℤ)` the images are again neighbors, so the tessellation lands on
itself. -/
theorem rho_farey (g : Mat) (p q r s : Int) :
    rho g (farey p q r s) =
      farey (g.p * p + g.q * q) (g.r * p + g.s * q) (g.p * r + g.q * s) (g.r * r + g.s * s) := by
  unfold rho farey
  show Form.mk _ _ _ = Form.mk _ _ _
  simp only [Form.mk.injEq]
  refine ⟨?_, ?_, ?_⟩ <;> grind

/-- The images of neighbors are neighbors (the determinant multiplies). -/
theorem farey_neighbors_image (g : Mat) (p q r s : Int) :
    (g.p * p + g.q * q) * (g.r * r + g.s * s) - (g.r * p + g.s * q) * (g.p * r + g.q * s) = g.det * (p * s - q * r) := by
  unfold Mat.det; grind

end Starscape
