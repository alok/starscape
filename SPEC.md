# Starscape — spec (2026-10-24, overnight push)

## Who it is for

Katherine Stange (author of the original viewer; has vertigo, so the
non-headset browser version must be the best one), Steve Trettel, and
Charles Arnal and Vivienne at Meta's AI for Math group. Alok wants all of his
Starscape work to be legible to them without overwhelming them: lead with one
beautiful visual they can play with, then let them dig into the WebXR, native
and Lean versions.

## The one idea

Every integer quadratic `ax² + bx + c` is a point of ℤ³. The discriminant
`Δ = b² − 4ac` is a Lorentzian form, so the lattice lives in 2+1 Minkowski
space. Stand at the origin (the zero polynomial) and look up: your sky is the
hyperbolic plane, and the lattice points are its stars. Nearer stars look
brighter and simpler. This is the starscape of Harriss, Stange and Trettel
(arXiv:2008.07655, §4.2), seen from the inside.

## Requirements

1. Runs in any modern browser with WebGL2: desktop Chrome/Safari/Firefox/Edge,
   iOS Safari, Android Chrome, Quest Browser and visionOS Safari. WebXR
   (immersive-vr; immersive-ar where offered) is a progressive enhancement.
2. Truly 3D but easy to handle: drag to orbit, pinch or scroll to zoom, tap to
   select. On phones, an optional tilt-to-look mode. No automatic camera motion
   and no forced transitions. Honor `prefers-reduced-motion`, which cuts
   instead of animating (vertigo).
3. Exact mathematics. Integer identities stay exact (BigInt where needed);
   floating point is only for drawing.
4. Insight through the medium: each chapter teaches one thing that a flat
   picture cannot:
   - Seen from the origin, multiples of a form hide behind it. Moving the eye
     slightly (lean in VR, or nudge on desktop) shows them through parallax.
   - A plane through your eye is seen edge-on, so it looks like a line. That
     is why geodesics are straight in the Klein model.
   - Apparent brightness is perspective. Along a ray, `k·p` has `Δ = k²Δ_p`,
     so a star's brightness falls like `1/|Δ|`. The plots of algebraic numbers
     (Harriss–Stange–Trettel, Baez/Christensen) use the same rule:
     complexity dims a number.
   - Dragging the sky is a Lorentz transformation of the lattice: points slide
     along their shells `Δ = const`. Releasing snaps to SL₂(ℤ`), and the
     lattice lands on itself.
   - The egocentric view: live inside the hyperbolic plane (definition pending
     from Dots; see §Open).
5. Credit Katherine Stange's viewer and talk, the starscapes paper, and
   Caroline Series for the L/R coding, prominently and next to the links.
6. Reusable code: a pure math module with no DOM, a renderer module, view
   controllers and a thin UI. Tested with `node --test`.
7. Code on GitHub (all versions), served by GitHub Pages.

## Architecture

```
src/math/     forms.js (Δ, kinds, polynomial text, display basis),
              sl2.js (Möbius, ρ(g) pushforward, snap to SL₂(ℤ)),
              models.js (Klein ↔ Poincaré ↔ half-plane), planes.js
src/render/   stars.js (one GPU point cloud; ρ(g), projection morph and
              eye-relative brightness are all in the vertex shader),
              cone.js, planes.js, labels
src/views/    outside (orbit), origin (eye at 0), inside (egocentric)
src/ui/       chapters, inspector, controls, xr
```

A single `THREE.Points` buffer holds every lattice point (integer a,b,c as
attributes). Uniforms carry ρ(g) in display coordinates, the morph parameter
(lattice → Klein screen → Poincaré → half-plane) and the eye position, so
dragging, morphing and moving cost nothing on the CPU.

## Open (waiting on Dots)

- The exact meaning of the egocentric, Flatland-esque view.
- Alok's UI ideas and the blog post.
- Lean plan for `alok/exterior-room`.
