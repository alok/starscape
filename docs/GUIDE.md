# Building Starscape yourself

A guide to rebuilding this project by hand. It covers the mathematics underneath, how the code is laid out, why each piece is built the way it is, and the traps I fell into while writing it. Read it alongside the source. Each section names the file it explains.

---

## 0. The one idea

Every integer polynomial `ax² + bx + c` is a point `(a, b, c)` of ℤ³. Roots ignore scale (`2x² + 2` has the same roots as `x² + 1`), so what really matters about a polynomial is the **line through the origin** it lies on. If you stand at the origin, which is the zero polynomial, each line is a direction you can look in. The sky you see is the space of polynomials up to scale.

The discriminant `Δ = b² − 4ac` makes that sky geometric. Δ is a quadratic form of signature (2, 1), the same kind as the spacetime interval of special relativity in 2+1 dimensions. Its zero set is a light cone. The directions inside the cone form a disk, and the geometry that the symmetries of Δ preserve on that disk is hyperbolic. So the sky above the origin is the hyperbolic plane, and its stars are the lattice points: the algebraic numbers of degree two, each sitting at the root of its polynomial.

Everything else in the project unfolds from that: the tour, the views, the gestures, the Lean proofs.

Sources: Harriss, Stange and Trettel, *Algebraic Number Starscapes* (arXiv:2008.07655, §4.2), and Katherine Stange's [Starscape / Lattice viewer](https://www.katestange.net/starscape-lattice/), whose seven chapters the tour follows.

---

## 1. Mathematics, with derivations

### 1.1 The display basis and the light cone

Put `X = −b`, `Y = a + c`, `Z = c − a`. Then

```
X² + Z² − Y² = b² + (c − a)² − (a + c)² = b² − 4ac = Δ.
```

In these coordinates Δ is the Lorentz form with `Y` as time. Three consequences:

- `Δ = 0` is the ordinary 45° double cone, so the light cone can be drawn as a cone.
- `Δ < 0` (complex roots) are the *timelike* vectors, inside the cone. `a > 0` is the upper nappe.
- `Δ > 0` (two real roots) are the *spacelike* vectors, outside the cone. We call them dust.

Code: `src/math/forms.js` (`toDisplay`, `fromDisplay`). Lean: `Form.disc_eq_lorentz`.

The inverse is `a = (Y − Z)/2`, `b = −X`, `c = (Y + Z)/2`, so the integer lattice in display coordinates is not all of ℤ³ but a sublattice of index 2 (`Y ≡ Z mod 2`). That is why a "ball of radius R" in display coordinates is the natural finite crop: it is round in the picture you see.

### 1.2 Seen from the origin: the Klein model

A timelike direction `(X, Y, Z)` meets the plane `Y = 1` at `(u, v) = (X/Y, Z/Y)` with `u² + v² < 1`. That unit disk, with the geometry Δ induces on it, is the **Klein model** of the hyperbolic plane. In the app the projection screen is `Y = h = 4` (`H` in the code). Sliding each star along its ray onto that screen changes nothing for an eye at the origin. That is chapter IV.

Why are geodesics straight in Klein? A geodesic of the hyperbolic plane is the intersection of the cone with a plane through the origin. From the origin, a plane through your eye is seen edge-on, so it projects to a straight line. The 3D view makes this obvious in a way a flat picture cannot.

### 1.3 The quadratic formula is an isometry

For `a > 0, Δ < 0` the upper root is `z = (−b + i√(−Δ))/(2a)`. In terms of Klein coordinates this is

```
x = u / (1 − v),   y = √(1 − u² − v²) / (1 − v)
```

(`kleinToHalfPlane` in `src/math/models.js`). The boundary point `v = 1` goes to ∞. The Poincaré disk sits between: `p = k / (1 + √(1 − |k|²))`. The vertex shader interpolates the position of every star through Klein → Poincaré → half-plane, which is why chords bend smoothly into circles orthogonal to ℝ as you drag the picture slider. `pictureOf` in `models.js` is the same map in JavaScript; the roots pane uses it to draw curves that bend exactly as the stars do.

### 1.4 How big is a star? One rule

Give every star a hyperbolic radius `ρ = R₀/√|Δ|`. Then:

- **Seen from the origin**, the apparent size is plain perspective. A star at height `Y` on the screen has Euclidean radius `R₀ h/Y`, and on the shell `|Δ|` you have `Y = √|Δ| / √(1 − |k|²)`, which is exactly the Klein-model size of a hyperbolic disk of radius ρ (tangentially).
- **In the half-plane**, a hyperbolic disk of radius ρ at height `y` has Euclidean radius ≈ `y·ρ`. With `y = √|Δ|/(2a)` that is `R₀/(2a)`, the sizes in Stange's viewer and in the paper.
- **On the real line**, the double-root forms `k(qx − p)²` have `a = kq²`, so the same rule gives radius `1/(2kq²)`. A null form is a horocycle, not a disk around its root, so in disk style it is drawn as a ring tangent to ℝ at `p/q`: center `p/q + i·r`, radius `r = R₀/(2kq²)`. For `k = 1` and `R₀ = 1` these are exactly the **Ford circles** (center `p/q + i/2q²`, radius `1/2q²`), which touch exactly when `|ps − qr| = 1`. At `R₀ < 1` each is its Ford circle shrunk about the tangency, so rings at different roots never meet, and the multiples nest inside at the same point. In the Poincaré disk the ring is the conformal image of the same circle, radius `R₀/(R₀ + |Y|)` of the disk, tangent inside at the root. In point style a null form stays at its root.
  - **They are in the lattice.** The upper cone `Δ = 0, a > 0` bounds the stars, so its points with `a + c ≤ depth` are drawn with them: every Ford circle with `p² + q² ≤ depth/k`. (The radius-6 ball alone holds only the roots 0, ±1 and ∞.)
  - **Tangent on screen, not just in the formula.** The shader caps and compresses sprite sizes, so it lifts each ring from its root by the radius it actually draws; rings skip the compression and keep their true size up to a cap. `src/math/picture.js` is the CPU mirror; `test/picture.test.js` checks its geometry, and the roots pane hit-tests rings where they are drawn.
  - **A floating-point trap.** On the cone `1 − |k|²` is exactly 0, so the code sets it to 0 for null forms rather than taking `√ε`, which lifted roots off ℝ by about 1e-8 in double precision and about 3e-4 in float32.

`stars.js` computes these radii (`r0…r3`) per stage and interpolates. `StarField.stage()` is the CPU mirror, used for picking and markers.

### 1.5 Brightness, and Olbers

Along one line of sight, `k·f` sits `k` times farther than `f` and has `Δ = k²Δ_f` (Lean: `Form.disc_smul`). A point source `k` times farther is `k²` times dimmer, so **along a ray, brightness falls like 1/|Δ|**: simpler numbers shine brighter. Every multiple hides exactly behind its primitive form. Lean your eye off the origin and parallax reveals them (chapter III).

The default *points* style makes this the encoding. Every point has the same tiny size, and brightness is `(4/|v|²)^β`, where `v` is the point after the current symmetry. That is literally the light you would receive at the origin, normalized so `(1,0,1)` has weight 1. With `β = 1` it is the inverse-square law. A softer default, `β = 0.55`, keeps the faint structure visible.

Why not just `1/|Δ|`? Because it ignores where the star is. Two primitive forms can share a discriminant while one has small `a` and the other large `a`. The second's root sits near the real axis, and the form itself sits far from you in ℤ³. `1/|v|²` dims it, and `1/|Δ|` does not. Stange sizes stars by `1/2a` for the same reason.

If you let the depth bound grow, the sky glows uniformly. Each shell at distance `d` holds about `d²` stars, each `1/d²` bright, so every shell contributes the same light. That is Olbers' paradox in miniature. The vertex shader's dimming exponent `uFalloff` (slightly above 2) and the depth bound keep the sky dark.

### 1.6 Color

Color carries the invariant `|Δ|`, so a whole shell keeps one hue under every symmetry. The default palette reads it as photon energy. `t = log(|Δ|/3)/log(80)` runs from 0 (simplest) to 1. Map `1/λ` linearly from violet (400 nm) to red (690 nm), and convert the wavelength to sRGB with an analytic fit of the CIE 1931 colour-matching functions (Wyman, Sloan and Shirley). Spectral colors lie outside sRGB, so add just enough white. Then normalize to **equal luminance**, because violet at full value looks dim and would make the most important stars look faint. The light cone (double roots) is white light.

Code: `src/render/palette.js` (`wavelengthRGB`, `PALETTES.spectrum`).

### 1.7 Symmetry: Möbius on roots, Lorentz on coefficients

A matrix `g = [[p, q], [r, s]]` acts on roots by `z ↦ (pz + q)/(rz + s)`. On coefficients it acts by the pushforward `ρ(g): Q ↦ Q ∘ adj(g)`. Written out:

```
a′ = s²a − rs·b + r²c
b′ = −2qs·a + (ps + qr)·b − 2pr·c
c′ = q²a − pq·b + p²c
```

Two facts make this the right action, both proved in Lean (`Starscape/Action.lean`) and in lean-starscape's `Polynomial/StarscapeProofs.lean`:

1. `Δ(ρ(g)f) = det(g)² · Δ(f)`. So for `det g = 1` every shell `Δ = const` is preserved, and ρ(g) is a Lorentz transformation of display space. This is the identification PSL₂(ℝ) ≅ SO⁺(2,1).
2. `(ρ(g)Q)(g·v) = det(g)² · Q(v)`. So if `Q` vanishes at `v`, then `ρ(g)Q` vanishes at `g·v`. **Roots move by g.**

In display coordinates the shader needs the 3×3 matrix `D·ρ(g)·D⁻¹`, where `D` is the display basis change (`displayPushforward` in `sl2.js`). That matrix is a uniform, so dragging costs nothing on the CPU.

**Dragging.** The pointer sits over a root `z₀`, and you move it to `z₁`. The update is `g ← τ(z₀ → z₁) · g`, where τ is the *transvection*: the hyperbolic translation along the geodesic from `z₀` to `z₁`, with no rotation about `z₁`. Build it by conjugating to `i`: `τ = h⁻¹ · P(h·z₁) · h`, where `h` sends `z₀` to `i` and `P(w)` is the symmetric positive matrix sending `i` to `w` (`fromI`). Because you compose on the left and recompute the root under the pointer each move, the star under your finger follows your finger exactly.

**Snapping.** On release, `nearestIntegral` (Stange's criterion) reduces `g·i` into the standard fundamental domain by translations and `S`, giving an integer γ. Of γ and γS it keeps whichever leaves the smaller residual rotation about `i`. The animation follows a true one-parameter path `g₀·Pᵗ·K(tθ)` from the polar decomposition (`interpolate`). Then **absorb**: set g back to the identity and relabel the selection by `ρ(γ)`. The lattice landed on itself, so nothing visibly jumps, but the exact labels change. The test pins the counterexample from her notes: dragging `−0.4 + 0.1i → −0.4 + i` settles on `T⁴`, which sends `(13, 20, 34)` to `(13, −84, 162)`.

### 1.8 Planes and necklaces

The polarization of Δ is `B(n, f) = n_b f_b − 2n_a f_c − 2n_c f_a`, with `B(f, f) = Δ(f)`. The plane Lorentz-orthogonal to a form `n` is `{f : B(n, f) = 0}`. If `Δ(n) > 0` it cuts the cone in two lines, which are the geodesic whose endpoints are the real roots of `n`. Two stars `p, q` span the plane whose normal is `dual(p) × dual(q)`, where `dual(a,b,c) = (−2c, b, −2a)`; Lean proves both forms lie on it. Under ρ(g) the bilinear form scales by `det²`, so planes move with the lattice (`onPlane_rho`).

### 1.9 The Farey tessellation is the dust at Δ = 1

The Farey edge between neighbors `p/q, r/s` (with `|ps − qr| = 1`) is the geodesic with those endpoints, so it is the plane of `(qx − p)(sx − r) = qs·x² − (qr + ps)·x + pr`. Its discriminant is

```
(qr + ps)² − 4pqrs = (ps − qr)² = 1.
```

So **Farey edges are planes of the Δ = 1 dust**, the lattice points nearest the light cone. The test `test/flatland.test.js` checks the converse in a box: every form with Δ = 1 factors this way. Lean also proves `ρ(g)` sends the edge between `p/q, r/s` to the edge between their images, so SL₂(ℤ) permutes the tessellation.

### 1.10 Living inside: the egocentric view

You stand at the center of the Poincaré disk, which is your own position in H². In base coordinates that is `g⁻¹·i`, and the world is drawn moved by `g`. Walking one step `s` in direction θ applies the transvection that brings the point at hyperbolic distance `s` ahead to the center (`walk` in `math/flatland.js`). This is true hyperbolic navigation, unlike Origin's Euclidean leaning.

**Why the angles are honest.** In the Poincaré model geodesics through the center are diameters, and the model is conformal. The visual angle a creature at the center sees between two objects is the angle between the geodesics to them, which equals the Euclidean angle in the disk. So with your eye at the center and in the plane, the 1D image you see is exactly what a Flatlander in H² would see.

**The retina.** A star of hyperbolic radius `ρ` at distance `d` subtends `sin α = sinh ρ / sinh d`. Nearer stars hide farther ones. As in Abbott's *Flatland*, fog dims distance (`e^(−d/λ)`), which is how Flatlanders judge depth. Without it every direction ends on some faint star, which is Olbers again, in 2D. Faint stars are composited front to back with opacity equal to their light, so dust veils bright stars without walling them off.

**Turns spell continued fractions.** Walking straight through the Farey tessellation, each triangle you cross has a pivot vertex shared by your entry and exit edges, on your left (L) or right (R). The run lengths `L^{a₀} R^{a₁} …` are the continued fraction of where you are heading. This is Caroline Series' coding of geodesics. `CuttingSequence` tracks it: it finds your Farey triangle by reducing your position into `(0, 1, ∞)` and records the pivot side at each crossing. The test walks from `i` toward φ and checks that the letters alternate (φ = [1; 1, 1, …]).

---

## 2. Architecture

```mermaid
flowchart LR
  subgraph math [src/math — pure, tested]
    forms[forms.js<br/>Δ, kinds, lattice, text]
    sl2[sl2.js<br/>Möbius, ρ(g), drag, snap]
    models[models.js<br/>Klein ↔ Poincaré ↔ half-plane]
    planes[planes.js<br/>bilinear form, necklaces]
    flat[flatland.js<br/>walk, Farey, L/R, retina]
    picture[picture.js<br/>where each star is drawn: the shader's CPU mirror]
  end
  subgraph render [src/render — three.js]
    stars[stars.js<br/>one point cloud, shader]
    scenery[scenery.js<br/>cone, screen, rays, planes]
    floor[flatland.js<br/>Farey ground shader]
    palette[palette.js<br/>spectrum, ramps]
  end
  subgraph ui [src/ui + src/views]
    rig[views/rig.js<br/>Outside · Origin · Inside]
    input[views/input.js<br/>gestures → intentions]
    pane[ui/rootspane.js<br/>2D linked view]
    hud[ui/inside.js]
    insp[ui/inspector.js]
    xr[ui/xr.js + xrpanel.js<br/>glass UI, gestures]
  end
  app((app.js<br/>wiring + frame loop))
  lean[[lean/ — Lean 4<br/>kernel-checked identities]]
  bridge[(data/lean-bridge.json)]
  leanf[[lean-float/ — on FloatLib<br/>float32 Δ and plane test exact]]

  forms -- lattice arrays --> stars
  sl2 -- "ρ(g) as mat3 uniform" --> stars
  models -- "pictureOf / rayToRoot" --> pane
  models -- rayToRoot --> xr
  planes -- "plane normal" --> scenery
  flat -- "walk(g)" --> app
  palette -- "ramp texture" --> stars
  picture -- "stage(): picking, rings" --> stars
  input -- "drag / click / pinch" --> app
  app -- "g, morph, alphas" --> stars
  app -- render --> pane
  rig -- "camera pose" --> app
  lean -- "lake exe starscape-bridge" --> bridge
  bridge -- "node --test" --> forms
  leanf -- "N·M < 2²⁴ (gpuPlaneExact)" --> planes
  planes -- "uPlane, only when exact" --> stars
```

The rules that keep it reusable:

- `src/math` never touches the DOM or three.js, so it runs under `node --test` and anything else can import it.
- The renderer knows formulas but not intentions. `views/input.js` knows gestures but not mathematics. `app.js` is the only place that knows what a drag *means* in each vantage.
- Duplicated logic was removed in the edit pass. `rayToRoot` is the one function both the desktop pointer and the XR controllers use to turn a ray into a root.

---

## 3. Rendering

### 3.1 One cloud, many pictures

`StarField` stores each point's integer coefficients and its kind as vertex attributes. Nothing else lives per point on the CPU. The vertex shader:

1. Computes `v = ρ(g)·(−b, a+c, c−a)`.
2. Computes the four stage positions (lattice, Klein, Poincaré, half-plane) and radii, then interpolates by `uMorph`.
3. Fades exterior dust as the morph begins (it has no Klein point) and applies emphasis for a selected plane or shell.
4. Sizes the sprite: `px = r · scale · P[1][1] · ½viewportH / depth`. Under an orthographic camera (the roots pane) it skips the division by depth; detect this with `projectionMatrix[3][3] == 1`.
5. Conserves energy. Below `uMinPx` a sprite keeps that size and its brightness scales by `(px/min)^falloff`, so distant stars dim instead of vanishing or turning into big squares.

Blending is additive (`ONE, ONE`), with no depth writes, so draw order doesn't matter.

### 3.2 The roots pane

The pane renders the **same buffer** a second time with the same renderer, scissored into the right side. A root is a property of the class `[a : b : c]`, so as the morph leaves the lattice (0 → 1) the non-primitive stars fade out, in the 3D view and in the pane alike, as in Stange's viewer; otherwise `k·f`, drawn at the same root, would mix the color of `|Δ| = k²|Δ_f|` into the primitive's (28 forms sit at ω at depth 57). The null multiples `k(qx − p)²` stay, nested inside their Ford circles. Seen from the origin in the lattice itself they are still there, one behind another, for parallax to separate. An orthographic camera looks straight down at the screen `Y = h`, `uMorph` is set to the pane's picture (Klein, Poincaré or half-plane), and exposure is raised. The stars are on layers 0 and 1, and only layer 1 is visible to the pane camera, so the cone and floor stay out of it. A 2D canvas overlay draws what points cannot: the boundary (a circle that bends into ℝ), rationals moved by g, the selected geodesic sampled straight in Klein and mapped through `pictureOf`, rings, hover readouts, the Farey tessellation, and you.

Inside, the 3D view is egocentric (you stay put, the world flows) and the pane becomes the allocentric map. It renders with `ρ = identity`, so the starscape is fixed while your position and heading move across it. Two complementary views of the same walk.

### 3.3 A bug worth remembering

At the Poincaré stage the formula `(1 − |p|²)` is negative for exterior points (`|p| > 1`), so the radius went negative. `pow(negative, 2.4)` returns NaN, and `0 · NaN` is NaN, which slips past `if (alpha < 0.002)`. Those points then drew as **white dots floating in the sky**. The fix has three parts: clamp the factor at 0, clamp `px ≥ 0`, and exit early from the vertex shader for any point whose alpha is ≤ 0. The general lesson: in a shader, a multiplication by zero does not protect you from NaN.

---

## 4. Interaction

- **Outside:** drag orbits, right-drag pans, scroll zooms.
- **Origin:** drag the sky (a root under the pointer) to apply a Möbius drag, right-drag to look, W A S D to lean.
- **Inside:** drag the ground to walk (same drag, but no snap), W A S D or arrows to walk, Q/E or ←/→ to turn, and the eye slider down to a Flatlander.
- **Roots pane:** drag to Möbius-drag, Shift-drag or right-drag to pan, scroll to zoom about the pointer. Click selects, and Shift-click a second star pairs them.

`select(coef, { quiet })` is the single entry point. A *quiet* selection (from the tour) rings a star without opening the inspector or cutting planes, which keeps first impressions calm. Everything else (pane rings, 3D ring, inspector, URL hash) derives from `state.selected`.

Motion respects `prefers-reduced-motion`: transitions become a short fade through black, and nothing moves on its own. Katherine Stange has vertigo; this is not optional.

---

## 5. WebXR

`ui/xr.js` places the lattice according to the vantage:

- **Origin:** your head at the origin, 0.45 m per unit, so the Klein screen is 1.8 m overhead.
- **Outside:** a tabletop model 0.9 m in front of you.
- **Inside:** the hyperbolic plane on your real floor. Physically walking is converted into hyperbolic translation. At the center of a Poincaré disk of radius `R` meters, `ds = 2|dp|/R`, so a step of `δ` meters is `2δ/R` hyperbolic units, and the disk recenters under you. **Rise into it** lifts the plane to eye level, where you see it edge-on, as a Flatlander does.

DOM does not render inside an immersive session, so the UI is in-world glass (`ui/xrpanel.js`). Panels are canvas textures on planes, styled after visionOS: frosted gradient, edge light, pill buttons that glow under the pointer, an ornament toolbar, and a grabber to move the window. Hit testing is a raycast to the panel followed by a UV lookup in the button rectangles.

Gestures, chosen to feel obvious once tried:

- **Two points make a line.** Pinch a star with each hand and the necklace through both appears.
- **Turn the dial.** Pinch and twist your wrist. The roll about the pointing ray becomes a rotation about `i`, an elliptic element.
- **Palm up.** Hold an open palm up for 0.6 s and the window comes to your hand. In WebXR joint space +Y is the back of the hand, so the test is that the wrist's +Y points down.

---

## 6. Lean

`lean/` is a standalone Lake package on core Lean 4.30 with no Mathlib. Core `grind` closes the polynomial identities in under a second each, so the package builds in seconds anywhere.

| File | What is kernel-checked |
|---|---|
| `Form.lean` | Δ is the Lorentz form in the display basis; `Δ(k·f) = k²Δ(f)`; stars have `a ≠ 0` |
| `Action.lean` | `Δ(ρ(g)f) = det(g)²Δ(f)`; roots move by g; ρ is a homomorphism; `ρ(1) = id`; ρ commutes with scaling |
| `Plane.lean` | `B(f,f) = Δ(f)`; B scales by det²; planes move with the lattice; pair normals span both forms |
| `Farey.lean` | Farey edges have `Δ = (ps − qr)²`; neighbors give Δ = 1; ρ(g) maps edges to edges |
| `Fixtures.lean` | the parity fixtures by `decide`: T⁴ snap image, the unit-circle pair, the √5 fixture, S fixes `i`, T moves `i` |

`#guard` lines in `Fixtures.lean` are compiled tests, not proofs: lattice counts (480 at R6; 59,084 and 98,696 stars) and class numbers.

**The bridge.** `lake exe starscape-bridge` writes `data/lean-bridge.json`, containing counts, every reduced form and class number for `|Δ| < 400`, ρ images and pair normals. `test/lean-bridge.test.js` checks the browser's exact arithmetic against it. The direction matters. Lean is the reference, the browser is tested against it, and the hosted app needs no server.

**Building on lean-starscape.** The live, Lean-backed service in `alok/lean-starscape` already proves several of these facts for its own `Point`/`Matrix`. Rather than fork it, PR [alok/lean-starscape#1](https://github.com/alok/lean-starscape/pull/1) adds `Polynomial/StarscapeProofs.lean` on top of its definitions: roots move by g in its general `det²` form, Farey edges are Δ = 1, edges map to edges, and the fixtures (which depend on no axioms at all). Its `apply` is exactly ρ, and its `incidence` is exactly B.

### 6.1 The GPU's float32 arithmetic, on FloatLib

Everything above is exact integer mathematics. The picture, though, is drawn by a vertex shader whose only arithmetic is IEEE binary32, and it recomputes two integer quantities there: Δ (`b * b - 4.0 * a * c`, for the shell emphasis) and the plane test (`abs(-2.0*n.z*a + n.y*b - 2.0*n.x*c) < 0.5`, which marks a geodesic's stars). `lean-float/StarscapeFloat.lean` proves both are right, on [FloatLib](https://github.com/lean-dojo/FloatLib)'s binary32. FloatLib needs Mathlib, so this is a separate package; `lean/` stays dependency-free.

**The model.** IEEE 754 defines `x ∘ y` as the exact result rounded once. FloatLib's `Model.roundAt binary32` is that rounding (nearest, ties to even), and FloatLib proves its executable binary32 implements it (`ExecFloat.Binary.toReal_add`, `toReal_mul`, …). So the file models each GLSL operation as `fl (x ∘ y)` with `fl := roundAt binary32`.

**Integers below 2²⁴ are floats.** Binary32 has a 24-bit significand, so an integer `n` with `|n| < 2²⁴` is `n · 2⁰` with a mantissa that fits. In Flocq's language (which FloatLib ports) it is in the FLT format, hence in the generic format, and rounding preserves the generic format (`round_preserves_generic`). That is `fl_int`, four lines of proof.

**Δ.** With coefficients of size at most 1024, `|b²| ≤ 2²⁰`, `|4ac| ≤ 2²²` and `|Δ| < 2²⁴`. Every intermediate is an integer below 2²⁴, so each rounding is the identity (`deltaF_eq_of_le`). Starscape draws coefficients up to 96.

**The plane test is subtler.** Write `P = −2n_c·a`, `T = n_b·b`, `Q = 2n_a·c` and `V = P + T − Q = B(n, f)`. Assume only that each product is below 2²⁴. Then `P`, `T`, `Q` are exact, but `P + T` can reach 2²⁵ and round. Two cases:

1. `|P + T| < 2²⁴`. The sum is exact, and the final value is `fl(V)`. If `V = 0` it is 0. If not, `|V| ≥ 1` (it is an integer), and rounding is monotone with `fl(±1) = ±1`, so `|fl(V)| ≥ 1`.
2. `|P + T| ≥ 2²⁴`. Then `V ≠ 0`, because `|Q| < 2²⁴`. Monotonicity and `fl(2²⁴) = 2²⁴` give `|fl(P + T)| ≥ 2²⁴`, so `|fl(P+T) − Q| ≥ 1`, and the last rounding keeps it at least 1.

Either way `|result| < ½ ⟺ V = 0`. That is `planeF_decides`. The decision is exact even where the arithmetic is not.

**The hypothesis becomes a runtime check.** `planeF_decides_of_le` restates the condition as `N·M < 2²⁴`, where `N` bounds `|2n_c|, |n_b|, |2n_a|` and `M` bounds the drawn coefficients. For a plane through two drawn stars, `N ≤ 8·96² = 73 728`, and `73 728 · 96 ≈ 7.1M < 2²⁴ ≈ 16.8M`, so it always holds. But "absorb" relabels the plane by γ, and the normal can grow without limit. `gpuPlaneExact` (`src/math/planes.js`) checks the bound whenever a plane is set. Past it, the app still draws the chord (computed exactly on the CPU) but leaves the stars unmarked and says why. The guard is needed: `test/float32.test.js` keeps a plane with normal (5840707, −33016826, −17578201) that passes through the star (37, 21, 52), where float32 evaluates the test to −64.

**An executable mirror.** The same test file replays the shader with `Math.fround`, operation by operation, over all ~470,000 drawn points. Computing in double and rounding to float is the correctly rounded binary32 result, because 53 ≥ 2·24 + 2 makes double rounding harmless for `+ − ×`. The proof covers every lattice and every plane under the bound. The test covers this lattice and is a cheap regression check.

**What it is not.** WebGL's GLSL ES 3.00 asks only that `highp` stay within 1 ULP, so the theorem is about IEEE-conformant hardware, which current GPUs are for these operations. A compiler may fuse a multiply-add into one rounding; every step here is exact anyway.

---

## 7. Rebuild it yourself: a sequence of exercises

1. Write `discriminant`, `toDisplay`, and a test that `X² + Z² − Y² = Δ`. Then prove it in Lean with `grind`.
2. Enumerate the radius-6 ball and get 480. Draw it as `THREE.Points` with a fixed size. You have chapter I.
3. Put the camera at the origin looking up. Notice the necklaces: they are planes seen edge-on.
4. Move the radius computation into a vertex shader and add energy conservation. Find the falloff exponent that keeps the sky dark (Olbers).
5. Implement ρ(g) and `displayPushforward`. Test that Δ is preserved and that `(1,0,1) ↦ (1,−2,2)` for `[[3,1],[1,2]]/√5`.
6. Implement `dragStep`. Make sure the star under the pointer stays under the pointer.
7. Implement `nearestIntegral` and reproduce the T⁴ counterexample.
8. Add the morph to the half-plane and check that radii become `1/(2a)`. Find the Ford circles.
9. Prove `(qr + ps)² − 4pqrs = (ps − qr)²` and draw the Farey tessellation with a reduction shader.
10. Put yourself at the center of the Poincaré disk, implement `walk`, and record the L/R turns toward φ.

---

## 8. Pitfalls I hit, so you don't

- **Temporal dead zone.** A `let` read by a function called during module setup throws. Declare shared state before anything that might touch it.
- **ES module caching.** Changing `?v=` on the page does not refetch imported modules. A dev server must send `Cache-Control: no-store` (`scripts/serve.py`). If a browser cached modules from an earlier server, switch ports.
- **Hidden pages don't animate.** A background tab or pane throttles `requestAnimationFrame` and timers. Don't trust timing or animation in a hidden page, and don't await rAF in test scripts there.
- **Name shadowing in one function.** `const Y` for CIE luminance-Y and `const Y` for relative luminance in the same scope is a syntax error at import. `node --check` every module.
- **Headless Chrome's minimum window.** `--window-size=390,844` gives a ~500px layout cropped to 390px. Emulate the device over CDP instead (`Emulation.setDeviceMetricsOverride`; see `scripts/shoot.mjs`).
- **A dev server's listen backlog.** Python's `ThreadingHTTPServer` queues 5 connections. A module graph opens ~20 at once, the kernel drops some, and the page stalls for seconds on SYN retries. `scripts/serve.py` raises it to 128.
- **Projecting through stale matrices.** `vector.project(camera)` uses `camera.matrixWorldInverse`, which `render()` refreshes. HTML labels placed before the render, after a camera cut with nothing moving afterward, stay where the previous view put them. Call `updateMatrixWorld()` before projecting.
- **One view's exposure leaking into another.** The roots pane used to scale the 3D view's exposure. When portrait aspect began to dim the 3D view, the pane went black in roots-only mode, where the 3D view has zero width. Each view now owns its exposure.
- **Recording a live WebGL page.** Screen capture drops frames whenever the GPU or the encoder falls behind. `scripts/film.mjs` instead installs a virtual clock before the page loads: `requestAnimationFrame`, timers, `performance.now` and CSS animation time all advance only when the recorder steps them, one frame at a time, and each frame is screenshotted and piped to ffmpeg. A slow GPU then makes the render slower, not the video choppier.
- **Synthetic pointer events can't capture.** `setPointerCapture` throws for a pointer id the browser didn't issue, so a scripted drag built from `new PointerEvent(...)` fails at `pointerdown`. Send real input with CDP's `Input.dispatchMouseEvent`. Chrome delivers `mousemove` aligned to the next real frame, so wait one real animation frame before stepping the virtual clock.
- **A page that draws only when something moved.** The frame loop returns early unless something it tracks moved, so a script that sets the camera directly also has to mark the scene dirty (`window.starscape.markDirty()`). Without that, the frame doesn't redraw and a scripted camera glide renders as a still.
- **Vision Pro's gaze-and-pinch.** With hand tracking granted, the first two input sources are the hands, for pose only, and the pinch arrives as a transient pointer after them. three only routes events to controller slots that exist, so create four. Its pose comes with the event, and `matrixWorld` is stale until you call `updateMatrixWorld()`.
- **A headset's camera outlives the session.** three copies the headset's pose, projection and fov into your camera every frame and leaves them there on `end`. Re-apply your own camera when the session ends.
- **Throwing `decide` at big things.** Kernel `decide` is great for fixtures but slow for counting tens of thousands of points. Those are `#guard` tests, labeled as such.

---

## 9. What is verified, and how

- **Kernel-checked (Lean):** the identities in §6's table.
- **Proved on FloatLib (Lean + Mathlib):** float32 Δ is exact for coefficients ≤ 1024, and the float32 plane test decides membership under `N·M < 2²⁴` (§6.1). Checked against FloatLib v2.0.0 as built in `~/softmax-float`. The package's own `lake build` was not run end to end.
- **Unit tests (`node --test`, 35):** fixtures, invariants, models, planes, snap, interpolation, Farey ⇔ Δ = 1 in a box, walking distances, L/R toward φ, agreement with the Lean bridge, the float32 replay of the shader, shell orbits (primitive classes and multiples) against Gauss reduction, and the picture geometry of `src/math/picture.js`: Ford circles (centers, radii, Farey tangency, SL₂(ℤ)), their Poincaré pictures as conformal images, morph continuity, and the Ford forms in the lattice.
- **Checked by eye in a browser:** every chapter on desktop (1440×900) and under true phone emulation (390×844, touch, via `scripts/shoot.mjs`), side-by-side and roots-only panes, Inside with the map and the retina.
- **WebXR in the Immersive Web Emulator:** stereo session, glass window, ornament and inspector card, Inside floor placement. `scripts/xrshot.mjs` runs the same emulator headless: the glass sits below the tabletop model, the Origin is at a seated or standing head, and the Inside floor is in place.
- **Not yet verified:** physical Quest or Vision Pro, hand-tracking gestures (they need a real headset), and performance on low-end phones.
