/-!
# Integer binary quadratic forms as points of ℤ³

The polynomial `a x² + b x + c` is the point `(a, b, c)`. Its discriminant `Δ = b² − 4ac` is a quadratic
form of signature (2, 1): in the display basis `(X, Y, Z) = (−b, a + c, c − a)` it is the Lorentz form
`X² + Z² − Y²`, so the polynomials with a double root form a light cone (Harriss–Stange–Trettel,
*Algebraic Number Starscapes*, §4.2).
-/

namespace Starscape

/-- An integer binary quadratic form `a x² + b x y + c y²`, or the polynomial `a x² + b x + c`. -/
structure Form where
  a : Int
  b : Int
  c : Int
deriving Repr, DecidableEq, Inhabited

namespace Form

/-- The discriminant `b² − 4ac`. -/
def disc (f : Form) : Int := f.b * f.b - 4 * f.a * f.c

/-- The display basis `(X, Y, Z) = (−b, a + c, c − a)` used by the viewer. -/
def display (f : Form) : Int × Int × Int := (-f.b, f.a + f.c, f.c - f.a)

/-- The Lorentz form `X² + Z² − Y²` on display coordinates. -/
def lorentz (v : Int × Int × Int) : Int := v.1 * v.1 + v.2.2 * v.2.2 - v.2.1 * v.2.1

/-- In the display basis the discriminant is the Lorentz form. This is why the double-root forms make a
light cone, and why SL₂ acts by Lorentz transformations. -/
theorem disc_eq_lorentz (f : Form) : f.disc = lorentz f.display := by
  unfold disc lorentz display; grind

/-- The homogeneous form evaluated at `(x, y)`: `a x² + b x y + c y²`. -/
def eval (f : Form) (x y : Int) : Int := f.a * x * x + f.b * x * y + f.c * y * y

instance : HSMul Int Form Form := ⟨fun k f => ⟨k * f.a, k * f.b, k * f.c⟩⟩

@[simp] theorem smul_a (k : Int) (f : Form) : (k • f).a = k * f.a := rfl
@[simp] theorem smul_b (k : Int) (f : Form) : (k • f).b = k * f.b := rfl
@[simp] theorem smul_c (k : Int) (f : Form) : (k • f).c = k * f.c := rfl

/-- Seen from the origin, `k • f` lies on the same line of sight as `f`, `k` times as far: the display map is
linear. -/
theorem display_smul (k : Int) (f : Form) :
    (k • f).display = (k * (-f.b), k * (f.a + f.c), k * (f.c - f.a)) := by
  simp only [display, smul_a, smul_b, smul_c, Prod.mk.injEq]; grind

/-- …and its discriminant is `k²` times larger. A point source `k` times farther is `k²` times dimmer, so the
apparent brightness of a star seen from the origin falls like `1/|Δ|` along each line of sight. -/
theorem disc_smul (k : Int) (f : Form) : (k • f).disc = k * k * f.disc := by
  simp only [disc, smul_a, smul_b, smul_c]; grind

/-- The four kinds of points: stars (complex roots, `a > 0`), the lower cone, dust (two real roots), and the
light cone (a double root). -/
inductive Kind
  | upper | lower | exterior | null
deriving Repr, DecidableEq

def kind (f : Form) : Kind :=
  if f.disc = 0 then .null else if f.disc > 0 then .exterior else if f.a > 0 then .upper else .lower

theorem mul_self_nonneg' (b : Int) : 0 ≤ b * b := by
  rcases Int.le_total 0 b with h | h
  · exact Int.mul_nonneg h h
  · have := Int.mul_nonneg (Int.neg_nonneg_of_nonpos h) (Int.neg_nonneg_of_nonpos h)
    rwa [Int.neg_mul_neg] at this

/-- A star never has `a = 0`: if `b² < 4ac` then `ac > 0`. -/
theorem a_ne_zero_of_disc_neg (f : Form) (h : f.disc < 0) : f.a ≠ 0 := by
  intro ha; unfold disc at h; rw [ha] at h
  have := mul_self_nonneg' f.b
  omega

end Form
end Starscape
