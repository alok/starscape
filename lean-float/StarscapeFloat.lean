import FloatLib.Floats.Formats.BinaryInterchange.Rounding.Proof
import FloatLib.Floats.Formats.BinaryInterchange.Format.Catalog

/-!
# The shader's float32 arithmetic is exact where Starscape relies on it

The vertex shader in `src/render/stars.js` recomputes two integer quantities in IEEE binary32:

* the discriminant, `float delta = b * b - 4.0 * a * c;`, used to emphasize a shell `|Δ| = k`;
* the plane test, `abs(-2.0 * uPlane.z * a + uPlane.y * b - 2.0 * uPlane.x * c) < 0.5`, which marks the
  stars on a chosen geodesic plane `B(n, f) = 0`.

Each GLSL operation is modeled as FloatLib's `roundAt binary32` of the exact real result: one rounding to
nearest, ties to even, which is what IEEE 754 requires and what FloatLib proves its executable binary32
implements (`ExecFloat.Binary.toReal_add`, `toReal_mul`, …). Overflow cannot occur at these magnitudes.
A fused multiply-add, which a GPU compiler may substitute, rounds once instead of twice; every step below is
exact anyway, so the results are the same.

The theorems: Δ is computed exactly for coefficients up to 1024 in size, and the plane test decides
membership exactly whenever each of its three products is below 2²⁴, even though its partial sum may
exceed 2²⁴ and round. The app checks that hypothesis whenever it sets a plane (`gpuPlaneExact`).
-/

open FloatLib.Floats.Formats.BinaryInterchange FloatLib.Floats.Formats.Flocq

namespace StarscapeFloat

/-- One binary32 operation: the exact result rounded once, to nearest with ties to even. -/
noncomputable def fl (x : ℝ) : ℝ := Model.roundAt FloatFormat.binary32 x

/-! ## Integers below 2²⁴ are binary32 values -/

/-- Binary32 carries 24 significant bits, so every integer of magnitude below 2²⁴ rounds to itself. -/
theorem fl_int (n : ℤ) (hn : |n| < 2 ^ 24) : fl n = n := by
  have hn' : n.natAbs < 2 ^ 24 := by rw [abs_lt] at hn; omega
  unfold fl Model.roundAt
  apply round_preserves_generic
  apply generic_of_fltFormat
  · positivity
  · refine ⟨by positivity, ⟨n, 0⟩, ?_, ?_, ?_⟩
    · simp [toReal, bpow]
    · simpa [FloatFormat.binary32, FloatLib.Numerics.binaryRadix] using hn'
    · show FloatFormat.binary32.minSubnormalExponent ≤ 0
      decide

/-- 2²⁴ itself is a binary32 value (as 2²³ · 2). -/
theorem fl_two_pow_24 : fl (2 ^ 24) = 2 ^ 24 := by
  unfold fl Model.roundAt
  apply round_preserves_generic
  apply generic_of_fltFormat
  · positivity
  · refine ⟨by positivity, ⟨2 ^ 23, 1⟩, ?_, ?_, ?_⟩
    · simp [toReal, bpow, FloatLib.Numerics.binaryRadix, FloatLib.Numerics.Radix.toReal]; norm_num
    · simp [FloatFormat.binary32, FloatLib.Numerics.binaryRadix]
    · show FloatFormat.binary32.minSubnormalExponent ≤ 1
      decide

/-- Rounding is monotone. -/
theorem fl_mono {x y : ℝ} (h : x ≤ y) : fl x ≤ fl y := Model.roundAt_mono _ h

/-- Rounding preserves "at least 1 away from zero" for integers: the key to deciding `= 0` after rounding. -/
theorem one_le_abs_fl {x : ℝ} (h : 1 ≤ |x|) : 1 ≤ |fl x| := by
  have h1 : fl 1 = 1 := by simpa using fl_int 1 (by norm_num)
  have hm1 : fl (-1) = -1 := by simpa using fl_int (-1) (by norm_num)
  rcases le_abs'.mp h with hx | hx
  · have := fl_mono hx; rw [hm1] at this; rw [le_abs']; left; exact this
  · have := fl_mono hx; rw [h1] at this; rw [le_abs']; right; exact this

/-! ## The discriminant -/

/-- The shader's `b * b - 4.0 * a * c`, one rounding per operation (GLSL multiplies left to right). -/
noncomputable def deltaF (a b c : ℝ) : ℝ := fl (fl (b * b) - fl (fl (4 * a) * c))

/-- Δ is exact when every intermediate value is below 2²⁴. -/
theorem deltaF_eq (a b c : ℤ) (h4a : |4 * a| < 2 ^ 24) (hbb : |b * b| < 2 ^ 24) (hac : |4 * a * c| < 2 ^ 24)
    (hΔ : |b * b - 4 * a * c| < 2 ^ 24) :
    deltaF a b c = ((b * b - 4 * a * c : ℤ) : ℝ) := by
  unfold deltaF
  have e1 : fl ((b : ℝ) * b) = ((b * b : ℤ) : ℝ) := by rw [← fl_int _ hbb]; push_cast; rfl
  have e2 : fl (4 * (a : ℝ)) = ((4 * a : ℤ) : ℝ) := by rw [← fl_int _ h4a]; push_cast; rfl
  have e3 : fl (((4 * a : ℤ) : ℝ) * c) = ((4 * a * c : ℤ) : ℝ) := by rw [← fl_int _ hac]; push_cast; rfl
  rw [e1, e2, e3, ← fl_int _ hΔ]; push_cast; rfl

/-- On every lattice with coefficients of size at most 1024 (Starscape draws up to 96), Δ is exact. -/
theorem deltaF_eq_of_le (a b c : ℤ) (ha : |a| ≤ 1024) (hb : |b| ≤ 1024) (hc : |c| ≤ 1024) :
    deltaF a b c = ((b * b - 4 * a * c : ℤ) : ℝ) := by
  have hb2 : |b * b| ≤ 1024 * 1024 := by rw [abs_mul]; exact mul_le_mul hb hb (abs_nonneg _) (by norm_num)
  have hac : |a * c| ≤ 1024 * 1024 := by rw [abs_mul]; exact mul_le_mul ha hc (abs_nonneg _) (by norm_num)
  have h4ac : |4 * a * c| = 4 * |a * c| := by rw [mul_assoc, abs_mul]; norm_num
  apply deltaF_eq
  · rw [abs_mul]; norm_num; linarith
  · linarith
  · linarith
  · calc |b * b - 4 * a * c| ≤ |b * b| + |4 * a * c| := abs_sub _ _
      _ < 2 ^ 24 := by linarith

/-! ## The plane test -/

/-- The shader's `-2.0 * n.z * a + n.y * b - 2.0 * n.x * c` for the plane `B(n, ·) = 0`, one rounding per
operation, where `B(n, f) = n_b f_b − 2 n_a f_c − 2 n_c f_a` is the polar form of Δ. -/
noncomputable def planeF (na nb nc a b c : ℝ) : ℝ :=
  fl (fl (fl (fl (-2 * nc) * a) + fl (nb * b)) - fl (fl (2 * na) * c))

/--
The plane test decides membership exactly, provided each product is below 2²⁴. The partial sum
`P + T` may exceed 2²⁴ and round; then it is so large that `B(n, f)` cannot vanish, and the rounded result
still stays at least 1 away from zero.
-/
theorem planeF_decides (na nb nc a b c : ℤ) (h2nc : |2 * nc| < 2 ^ 24) (h2na : |2 * na| < 2 ^ 24)
    (hP : |2 * nc * a| < 2 ^ 24) (hT : |nb * b| < 2 ^ 24) (hQ : |2 * na * c| < 2 ^ 24) :
    |planeF na nb nc a b c| < 1 / 2 ↔ -2 * nc * a + nb * b - 2 * na * c = 0 := by
  unfold planeF
  have hP' : |-2 * nc * a| < 2 ^ 24 := by rw [neg_mul, neg_mul, abs_neg]; exact hP
  have h2nc' : |-2 * nc| < 2 ^ 24 := by rw [neg_mul, abs_neg]; exact h2nc
  have e1 : fl (-2 * (nc : ℝ)) = ((-2 * nc : ℤ) : ℝ) := by rw [← fl_int _ h2nc']; push_cast; rfl
  have e2 : fl (((-2 * nc : ℤ) : ℝ) * a) = ((-2 * nc * a : ℤ) : ℝ) := by rw [← fl_int _ hP']; push_cast; rfl
  have e3 : fl ((nb : ℝ) * b) = ((nb * b : ℤ) : ℝ) := by rw [← fl_int _ hT]; push_cast; rfl
  have e4 : fl (2 * (na : ℝ)) = ((2 * na : ℤ) : ℝ) := by rw [← fl_int _ h2na]; push_cast; rfl
  have e5 : fl (((2 * na : ℤ) : ℝ) * c) = ((2 * na * c : ℤ) : ℝ) := by rw [← fl_int _ hQ]; push_cast; rfl
  rw [e1, e2, e3, e4, e5]
  set P := -2 * nc * a; set T := nb * b; set Q := 2 * na * c
  -- From here on the operands are exact integers; only the sum and the difference round.
  rcases lt_or_ge |P + T| (2 ^ 24) with hs | hs
  · have es : fl (((P : ℤ) : ℝ) + ((T : ℤ) : ℝ)) = ((P + T : ℤ) : ℝ) := by rw [← fl_int _ hs]; push_cast; rfl
    rw [es]
    by_cases hV : P + T - Q = 0
    · have h0 : ((P + T : ℤ) : ℝ) - ((Q : ℤ) : ℝ) = 0 := by exact_mod_cast hV
      have hfl0 : fl 0 = 0 := by simpa using fl_int 0 (by norm_num)
      rw [h0, hfl0]; simp [hV]
    · have h1 : (1 : ℝ) ≤ |((P + T : ℤ) : ℝ) - ((Q : ℤ) : ℝ)| := by
        have : (1 : ℤ) ≤ |P + T - Q| := Int.one_le_abs hV
        exact_mod_cast this
      have := one_le_abs_fl h1
      simp only [hV, iff_false, not_lt]
      linarith
  · -- |P + T| ≥ 2²⁴ > |Q|: the plane value cannot vanish, and the rounded sum is at least 2²⁴ in size.
    have hQ1 : |Q| ≤ 2 ^ 24 - 1 := by have h := abs_lt.mp hQ; rw [abs_le]; omega
    have hV : P + T - Q ≠ 0 := by
      intro h; have h1 := abs_le.mp hQ1; rcases le_abs'.mp hs with h2 | h2 <;> omega
    simp only [hV, iff_false, not_lt]
    have hfar : (1 : ℝ) ≤ |fl (((P : ℤ) : ℝ) + ((T : ℤ) : ℝ)) - ((Q : ℤ) : ℝ)| := by
      have hQr : |((Q : ℤ) : ℝ)| ≤ 2 ^ 24 - 1 := by exact_mod_cast hQ1
      rcases le_abs'.mp hs with hn | hp
      · have hn' : ((P : ℤ) : ℝ) + ((T : ℤ) : ℝ) ≤ -2 ^ 24 := by exact_mod_cast (by push_cast; linarith : P + T ≤ -2 ^ 24)
        have := fl_mono hn'
        rw [show (-2 ^ 24 : ℝ) = -(2 ^ 24) by ring, show fl (-(2 ^ 24)) = -fl (2 ^ 24) by
          simp [fl], fl_two_pow_24] at this
        rw [abs_le] at hQr
        rw [le_abs']; left; linarith
      · have hp' : (2 ^ 24 : ℝ) ≤ ((P : ℤ) : ℝ) + ((T : ℤ) : ℝ) := by exact_mod_cast (by push_cast; linarith : 2 ^ 24 ≤ P + T)
        have := fl_mono hp'
        rw [fl_two_pow_24] at this
        rw [abs_le] at hQr
        rw [le_abs']; right; linarith
    have := one_le_abs_fl hfar
    linarith

/-- The hypothesis the app checks (`gpuPlaneExact`): coefficients up to `M`, normal factors up to `N`. -/
theorem planeF_decides_of_le (na nb nc a b c M N : ℤ) (hM : 1 ≤ M) (hN : |2 * nc| ≤ N) (hN' : |nb| ≤ N)
    (hN'' : |2 * na| ≤ N) (ha : |a| ≤ M) (hb : |b| ≤ M) (hc : |c| ≤ M) (hMN : N * M < 2 ^ 24) :
    |planeF na nb nc a b c| < 1 / 2 ↔ -2 * nc * a + nb * b - 2 * na * c = 0 := by
  have hN0 : 0 ≤ N := le_trans (abs_nonneg _) hN
  have bound : ∀ x y : ℤ, |x| ≤ N → |y| ≤ M → |x * y| < 2 ^ 24 := fun x y hx hy => by
    rw [abs_mul]; exact lt_of_le_of_lt (mul_le_mul hx hy (abs_nonneg _) hN0) hMN
  have hN24 : N < 2 ^ 24 := lt_of_le_of_lt (le_mul_of_one_le_right hN0 hM) hMN
  apply planeF_decides
  · exact lt_of_le_of_lt hN hN24
  · exact lt_of_le_of_lt hN'' hN24
  · exact bound _ _ hN ha
  · exact bound _ _ hN' hb
  · exact bound _ _ hN'' hc

end StarscapeFloat

#print axioms StarscapeFloat.fl_int
#print axioms StarscapeFloat.deltaF_eq_of_le
#print axioms StarscapeFloat.planeF_decides
#print axioms StarscapeFloat.planeF_decides_of_le
