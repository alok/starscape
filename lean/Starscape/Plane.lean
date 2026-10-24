import Starscape.Action

/-!
# Planes through the origin are geodesics

The polarization of `Δ` is the bilinear form `B(n, f) = n_b f_b − 2 n_a f_c − 2 n_c f_a`, with `B(f, f) = Δ(f)`.
The plane Lorentz-orthogonal to a form `n` is `{f | B(n, f) = 0}`. When `Δ(n) > 0` it cuts the light cone in two
lines, so it meets the Klein disk in a chord: the geodesic whose endpoints are the real roots of `n`
(Harriss–Stange–Trettel, Obs. 4.11). Two stars span such a plane, the *necklace* through both (Obs. 4.12).
-/

namespace Starscape

/-- The bilinear form of `Δ`. -/
def bil (n f : Form) : Int := n.b * f.b - 2 * n.a * f.c - 2 * n.c * f.a

theorem bil_self (f : Form) : bil f f = f.disc := by unfold bil Form.disc; grind
theorem bil_comm (n f : Form) : bil n f = bil f n := by unfold bil; grind

/-- `ρ(g)` scales the bilinear form by `det(g)²`… -/
theorem bil_rho (g : Mat) (n f : Form) : bil (rho g n) (rho g f) = g.det ^ 2 * bil n f := by
  unfold bil rho Mat.det; grind

/-- …so a plane moves with the lattice: if `f` lies on the plane of `n`, then `ρ(g)f` lies on the plane of
`ρ(g)n`. Dragging the sky carries each necklace along as a necklace. -/
theorem onPlane_rho (g : Mat) (n f : Form) (h : bil n f = 0) : bil (rho g n) (rho g f) = 0 := by
  rw [bil_rho, h]; grind

/-- The dual vector of a form under `B`, as a plain triple: `B(n, f) = dual(f) · n`. -/
def dual (f : Form) : Int × Int × Int := (-2 * f.c, f.b, -2 * f.a)

def cross (u v : Int × Int × Int) : Form :=
  ⟨u.2.1 * v.2.2 - u.2.2 * v.2.1, u.2.2 * v.1 - u.1 * v.2.2, u.1 * v.2.1 - u.2.1 * v.1⟩

/-- The normal of the plane through two forms. -/
def pairNormal (f g : Form) : Form := cross (dual f) (dual g)

/-- Both forms lie on the plane of their pair normal. -/
theorem pairNormal_spans (f g : Form) : bil (pairNormal f g) f = 0 ∧ bil (pairNormal f g) g = 0 := by
  unfold pairNormal cross dual bil; constructor <;> grind

end Starscape
