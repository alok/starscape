import Starscape.Form

/-!
# The action of 2 × 2 matrices: Möbius on roots, Lorentz on coefficients

A matrix `g = [[p, q], [r, s]]` moves roots by `z ↦ (pz + q)/(rz + s)` and moves coefficients by `ρ(g)`, the
pushforward `Q ↦ Q ∘ adj(g)`. When `det g = 1` this is `Q ∘ g⁻¹`, so a root of `Q` at `z` becomes a root of
`ρ(g)Q` at `g · z` (Harriss–Stange–Trettel, equation (1)). The discriminant scales by `det(g)²`, so SL₂ acts by
Lorentz transformations: every star slides along its own shell `Δ = const`.
-/

namespace Starscape

/-- An integer 2 × 2 matrix `[[p, q], [r, s]]`. -/
structure Mat where
  p : Int
  q : Int
  r : Int
  s : Int
deriving Repr, DecidableEq, Inhabited

namespace Mat

def det (g : Mat) : Int := g.p * g.s - g.q * g.r

def mul (g h : Mat) : Mat :=
  ⟨g.p * h.p + g.q * h.r, g.p * h.q + g.q * h.s, g.r * h.p + g.s * h.r, g.r * h.q + g.s * h.s⟩

instance : Mul Mat := ⟨mul⟩

def one : Mat := ⟨1, 0, 0, 1⟩
/-- `T : x ↦ x + 1`. -/
def T : Mat := ⟨1, 1, 0, 1⟩
/-- `S : x ↦ −1/x`. -/
def S : Mat := ⟨0, -1, 1, 0⟩

theorem det_mul (g h : Mat) : (g * h).det = g.det * h.det := by
  show (mul g h).det = _
  unfold mul det; grind

/-- `g` applied to the vector `(x, y)`; on roots `x/y ↦ (px + qy)/(rx + sy)`. -/
def apply (g : Mat) (x y : Int) : Int × Int := (g.p * x + g.q * y, g.r * x + g.s * y)

end Mat

/-- `ρ(g)`, the coefficient pushforward `Q ↦ Q ∘ adj(g)`. -/
def rho (g : Mat) (f : Form) : Form :=
  ⟨g.s * g.s * f.a - g.r * g.s * f.b + g.r * g.r * f.c,
   -2 * g.q * g.s * f.a + (g.p * g.s + g.q * g.r) * f.b - 2 * g.p * g.r * f.c,
   g.q * g.q * f.a - g.p * g.q * f.b + g.p * g.p * f.c⟩

/-- The discriminant scales by `det(g)²`. -/
theorem disc_rho (g : Mat) (f : Form) : (rho g f).disc = g.det ^ 2 * f.disc := by
  unfold rho Form.disc Mat.det; grind

/-- For `g ∈ SL₂(ℤ)` the discriminant is invariant: `ρ(g)` is a Lorentz transformation of the display
coordinates, and each shell `Δ = −k` is preserved. -/
theorem disc_rho_of_det_one (g : Mat) (h : g.det = 1) (f : Form) : (rho g f).disc = f.disc := by
  rw [disc_rho, h]; grind

/-- **Roots move by `g`.** If `det g = 1` then `(ρ(g)Q)(g · v) = Q(v)`: `Q` vanishes at `v` exactly when
`ρ(g)Q` vanishes at `g · v`. This is the identity `R(ρ(A)f) = A · R(f)` behind dragging the starscape. -/
theorem eval_rho (g : Mat) (h : g.det = 1) (f : Form) (x y : Int) :
    (rho g f).eval (g.apply x y).1 (g.apply x y).2 = f.eval x y := by
  unfold rho Form.eval Mat.apply; unfold Mat.det at h; grind

/-- `ρ` is a homomorphism: `ρ(gh) = ρ(g) ∘ ρ(h)`. -/
theorem rho_mul (g h : Mat) (f : Form) : rho (g * h) f = rho g (rho h f) := by
  show rho (Mat.mul g h) f = _
  unfold rho Mat.mul; congr 1 <;> grind

theorem rho_one (f : Form) : rho Mat.one f = f := by
  unfold rho Mat.one; cases f; simp only [Form.mk.injEq]; grind

/-- `ρ` commutes with scaling, so the line of sight of a star moves as a whole. -/
theorem rho_smul (g : Mat) (k : Int) (f : Form) : rho g (k • f) = k • rho g f := by
  unfold rho; simp only [Form.smul_a, Form.smul_b, Form.smul_c]
  show Form.mk _ _ _ = Form.mk _ _ _
  congr 1 <;> grind

end Starscape
