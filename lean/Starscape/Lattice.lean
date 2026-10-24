import Starscape.Farey

/-!
# Exact data for the viewer

Computable enumerations that the web app's tests compare against: the lattice points in a ball of the display
basis, the stars up to depth `a + c ≤ D`, and the reduced primitive positive definite forms of each discriminant, one
per `SL₂(ℤ)` orbit of primitive forms on a shell (so their number is the class number `h(−k)`). The shell's other orbits
are multiples `f·g` of the primitive classes `g` of discriminant `−k/f²`; the web app's `shellClasses` lists them all.
-/

namespace Starscape

/-- Integers `lo, lo + 1, …, hi`. -/
def irange (lo hi : Int) : List Int :=
  (List.range (hi - lo + 1).toNat).map (fun (i : Nat) => lo + (i : Int))

/-- Nonzero lattice points with `X² + Y² + Z² ≤ R²` in the display basis (both nappes, every kind). -/
def ball (R : Int) : List Form :=
  (irange (-R) R).flatMap fun a => (irange (-R) R).flatMap fun b => (irange (-R) R).filterMap fun c =>
    let f : Form := ⟨a, b, c⟩
    let (X, Y, Z) := f.display
    if (a, b, c) ≠ (0, 0, 0) ∧ X * X + Y * Y + Z * Z ≤ R * R then some f else none

/-- Stars: `Δ < 0`, `a > 0`, `a + c ≤ D`. -/
def stars (D : Int) : List Form :=
  (irange 1 D).flatMap fun a => (irange 1 (D - a)).flatMap fun c => (irange (-2 * D) (2 * D)).filterMap fun b =>
    let f : Form := ⟨a, b, c⟩
    if f.disc < 0 then some f else none

def content (f : Form) : Nat := Nat.gcd (Nat.gcd f.a.natAbs f.b.natAbs) f.c.natAbs

/-- Reduced primitive positive definite forms of discriminant `−k`: `|b| ≤ a ≤ c`, and `b ≥ 0` when `|b| = a` or
`a = c`. -/
def reduced (k : Nat) : List Form :=
  let K : Int := k
  (irange 1 K).flatMap fun a =>
    if 3 * a * a > K then [] else
    (irange (-a + 1) a).filterMap fun b =>
      if (b * b + K) % (4 * a) ≠ 0 then none else
      let c := (b * b + K) / (4 * a)
      let f : Form := ⟨a, b, c⟩
      if c < a ∨ (b < 0 ∧ a = c) ∨ content f ≠ 1 then none else some f

def classNumber (k : Nat) : Nat := (reduced k).length

/-- The discriminants `−k` that occur: `k ≡ 0, 3 (mod 4)`. -/
def isDiscriminant (k : Nat) : Bool := k > 0 ∧ (k % 4 = 0 ∨ k % 4 = 3)

end Starscape
