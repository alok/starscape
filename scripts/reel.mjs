// The demo reel: a two-and-a-half-minute tour of the app, rendered frame by frame by scripts/film.mjs.
//
//   node scripts/film.mjs scripts/reel.mjs starscape-tour.mp4                      # 1920×1080, 60 fps
//   node scripts/film.mjs scripts/reel.mjs draft.mp4 --fps 15 --scale 1            # quick draft
//   node scripts/film.mjs scripts/reel.mjs --stills 20,48 --fps 10                 # check a composition
//
// Everything on screen is the app itself, driven through its own API, settings and mouse input; the film layer
// adds captions, title cards and a drawn cursor. Camera moves are slow and eased, with no continuous spin.
// Brightness, β and star size are set per shot with the app's own controls, within their slider ranges.
const m = s => `<span class="math">${s}</span>`;

// Pointer targets, evaluated in the page (no closures: each is sent as source).
const at = {
  star: coef => new Function('{ film }', `return film.starPx(${JSON.stringify(coef)});`),
  root: coef => new Function('{ film }', `return film.rootPx(${JSON.stringify(coef)});`),
  rootPlus: (coef, dx, dy) => new Function('{ film }', `const p = film.rootPx(${JSON.stringify(coef)}); return [p[0] + ${dx}, p[1] + ${dy}];`),
};
// Somewhere empty in the roots pane (below the real axis), to clear a hover when the cursor leaves the shot.
const park = t => ({ t, x: 1425, y: 802, hide: true });
const dip = (t0, t1) => ({ t0, t1, fadeIn: 0.4, fadeOut: 0.45, solid: true, html: '' });

const title = `<div style="padding: 60px 90px; background: radial-gradient(closest-side, rgba(3,5,11,0.82), rgba(3,5,11,0));">
  <div style="font: 600 13px/1 var(--sans); letter-spacing: 0.32em; text-transform: uppercase; color: var(--accent);">a short tour</div>
  <div style="font: 400 104px/1 var(--serif); color: #f4f6fb; margin-top: 20px; letter-spacing: 0.005em;">Starscape</div>
  <div style="font: italic 400 27px/1.3 var(--serif); color: var(--ink-2); margin-top: 16px;">the integer quadratics as a night sky</div>
</div>`;
const end = `<div style="max-width: 860px;">
  <div style="font: 400 76px/1 var(--serif); color: #f4f6fb;">Starscape</div>
  <div style="font: 500 24px/1 var(--sans); color: var(--accent); margin-top: 22px; letter-spacing: 0.02em;">alok.blog/starscape</div>
  <div style="font: 400 16px/1.5 var(--sans); color: var(--ink-2); margin-top: 14px;">In any browser. In a WebXR headset, <i>Enter VR</i> follows your vantage:<br>your head at the origin, the lattice on a table, or the plane on your floor.</div>
  <div style="font: italic 400 18px/1.5 var(--serif); color: rgba(225, 232, 245, 0.88); margin-top: 34px;">
    Kernel-checked in Lean 4: Δ is the Lorentz form, SL₂(ℤ) preserves it, Farey edges have Δ = 1.<br>
    Proved on FloatLib: the shader computes Δ exactly in float32 at every drawn point.</div>
  <div style="font: 400 14.5px/1.6 var(--sans); color: var(--ink-3); margin-top: 34px;">
    After Katherine Stange’s <i>Starscape / Lattice</i>, and Harriss, Stange and Trettel, <i>Algebraic Number Starscapes</i>.<br>
    Alok Singh · 2026</div>
</div>`;

export default {
  url: 'http://127.0.0.1:8849/#c=3',
  width: 1440, height: 810, scale: 4 / 3, fps: 60,
  duration: 142,
  settle: 3000,

  setup: ({ S, api, film }) => {
    // Page-side helpers shared by the cues below.
    window.R = {
      split(on) { if (S.state.split !== on) document.getElementById('v-split').click(); },
      /** Stretch the camera move that was just started to d seconds. */
      slow(d) { if (S.rig.anim) S.rig.anim.duration = d; },
      /** Cuts instead of moves (under a dip to black): the app's reduced-motion path. */
      instant(on) { S.rig.reducedMotion = S.tweens.reducedMotion = on; },
      ease: u => u * u * (3 - 2 * u),
      /** Ease the app's Brightness, β and Star size from a to b as u goes 0 → 1. */
      look(a, b, u) {
        const e = R.ease(u), mix = k => (a[k] ?? 1) + ((b[k] ?? 1) - (a[k] ?? 1)) * e;
        film.look({ exposure: mix('exposure'), beta: mix('beta'), size: mix('size') });
      },
    };
    R.split(false);
    api.renderChapter(2);
    api.select(null);
    film.look({ exposure: 4, beta: 0.3 });
  },

  cues: [
    // I · the lattice (split)
    { t: 7.1, run: ({ api, film }) => { R.instant(true); R.split(true); api.renderChapter(0); film.look({ exposure: 3, beta: 0.35 }); film.ui({ inspector: true }); } },
    { t: 7.6, run: () => R.instant(false) },
    // II · the stars
    { t: 18.0, run: ({ api }) => { api.renderChapter(1); R.slow(3.2); } },
    // III · the origin (full width)
    { t: 31.8, run: ({ film }) => { R.split(false); film.ui({ inspector: false }); } },
    { t: 32.2, run: ({ api }) => { api.renderChapter(2); R.slow(3.0); } },
    { t: 40.4, run: ({ api }) => { api.leanTo([1.1, 0, 0]); R.slow(2.6); } },
    // IV · Klein, then step outside
    { t: 46.4, run: ({ api }) => { api.renderChapter(3); R.slow(2.2); api.setMorph(0, 0); } },
    { t: 48.8, run: ({ api }) => api.setMorph(1, 2.4) },
    { t: 51.6, run: ({ api }) => { api.goOutside({ radius: 18, theta: 0.9, phi: 1.05, target: [0, 3, 0] }); R.slow(3.0); } },
    // V · back to the origin; Klein → Poincaré → half-plane
    { t: 60.0, run: ({ api, state }) => { state.plane = null; api.goOrigin(); R.slow(2.4); } },
    { t: 64.0, run: ({ api }) => api.setMorph(2, 2.4) },
    { t: 67.6, run: ({ api, S }) => { api.renderChapter(4); R.slow(3.0); api.setMorph(3, 2.8); S.tweens.set('screen', 0, 0.8); } },
    // Ford circles: the same picture drawn as disks
    { t: 73.8, run: ({ api }) => api.setStyle(0) },
    // VI · symmetry (split): the stars in the cone, seen from outside
    { t: 86.3, run: ({ api, film, S }) => {
      R.instant(true); api.setStyle(1); R.split(true); api.renderChapter(5);
      api.goOutside({ radius: 22, theta: 0.7, phi: 1.15, target: [0, 6, 0] });
      api.setMorph(0, 0); S.tweens.set('screen', 0, 0);
      film.look({ exposure: 2, beta: 0.45, size: 1 }); film.ui({ readout: true });
    } },
    { t: 86.8, run: () => R.instant(false) },
    { t: 96.6, run: ({ api }) => api.applyIntegral('T') },
    { t: 98.8, run: ({ api }) => api.applyIntegral('S') },
    // VIII · necklaces
    { t: 102.0, run: ({ api }) => { api.renderChapter(7); R.slow(3.0); } },
    // IX · inside (full width)
    { t: 112.3, run: ({ api, film }) => {
      R.instant(true); R.split(false); film.ui({ readout: false, hud: true }); film.look({ exposure: 1.5, beta: 0.55, size: 1 }); api.renderChapter(8);
    } },
    { t: 113.0, run: () => R.instant(false) },
    { t: 116.0, run: ({ film }) => film.key('w', true) },
    { t: 117.0, run: ({ film }) => film.key('w', false) },
    { t: 121.5, run: ({ api }) => api.select(null) },   // the ring would cut into the Flatland strip's caption
  ],

  spans: [
    // Title: the sky from the origin, turning very slowly.
    { t0: 0, t1: 7.0, run: ({ rig }, u) => { if (!rig.anim) { rig.origin.yaw = 0.18 * u; rig.apply(); } } },
    // I: a slow quarter-turn around the lattice.
    { t0: 7.7, t1: 18.0, run: ({ rig }, u) => { if (!rig.anim) { rig.outside.theta = 0.75 + 0.5 * u; rig.apply(); } } },
    // II: the deep field fills the roots pane at once, so bring the brightness down before it arrives; then a slow drift.
    { t0: 17.0, t1: 17.95, run: (c, u) => R.look({ exposure: 3, beta: 0.35 }, { exposure: 2, beta: 0.45 }, u) },
    { t0: 21.3, t1: 31.6, run: ({ rig }, u) => { if (!rig.anim) { rig.outside.theta = 0.6 + 0.3 * u; rig.apply(); } } },
    // III: the sky brightens as you arrive at the origin. The outside vantage draws 2.2× brighter than the
    // origin (app.js syncUniforms), so each change of vantage starts its ramp where the picture already was.
    { t0: 32.2, t1: 35.2, run: (c, u) => R.look({ exposure: 3, beta: 0.45 }, { exposure: 4, beta: 0.3 }, u) },
    // IV: stepping outside, the screen disk is seen whole; bring the exposure down with it.
    // Points on the screen are drawn 1.4× brighter (app.js syncUniforms); compensate so the slide looks like nothing.
    { t0: 48.8, t1: 50.6, run: (c, u) => R.look({ exposure: 4, beta: 0.3 }, { exposure: 2.9, beta: 0.3 }, u) },
    { t0: 51.6, t1: 54.6, run: (c, u) => R.look({ exposure: 2.9 / 2.2, beta: 0.3 }, { exposure: 1.8, beta: 0.45 }, u) },
    { t0: 54.6, t1: 60.0, run: ({ rig }, u) => { if (!rig.anim) { rig.outside.theta = 0.9 + 0.12 * u; rig.apply(); } } },
    { t0: 60.0, t1: 62.4, run: (c, u) => R.look({ exposure: 4, beta: 0.45 }, { exposure: 2.8, beta: 0.38 }, u) },
    // V: the Poincaré disk concentrates the light toward its center; then the half-plane, seen from below.
    { t0: 64.0, t1: 66.4, run: (c, u) => R.look({ exposure: 2.8, beta: 0.38 }, { exposure: 2.2, beta: 0.45 }, u) },
    { t0: 67.6, t1: 70.6, run: (c, u) => R.look({ exposure: 2.2 / 2.2, beta: 0.45 }, { exposure: 1.6, beta: 0.5 }, u) },
    // Disks fill area where points did not: start dim so the switch is level, and let them come up.
    { t0: 73.8, t1: 75.6, run: (c, u) => R.look({ exposure: 0.6, beta: 0.5, size: 1 }, { exposure: 1.3, beta: 0.55, size: 1.5 }, u) },
    // Ford circles: glide down to the real axis between 0 and 1.
    { t0: 75.0, t1: 83.0, run: ({ rig }, u) => {
      const e = R.ease(u), o = rig.outside;
      o.target.set(1 * e, 4, 1.4 + (-1.55 - 1.4) * e);
      o.radius = 9.5 + (3.4 - 9.5) * e;
      if (!rig.anim) rig.apply();
    } },
    // IX: lower the eye into the plane: a Flatlander.
    { t0: 119.5, t1: 122.5, run: ({ api }, u) => api.setEye(1.7 * (1 - R.ease(u))) },
  ],

  captions: [
    { t0: 7.9, t1: 17.8, kicker: 'I · the lattice', title: 'Every quadratic is a point',
      body: `${m('ax² + bx + c')} is the point ${m('(a, b, c)')} of ℤ³. Outside the light cone ${m('Δ = b² − 4ac = 0')}: two real roots. On it: a double root. Inside: a complex pair.` },
    { t0: 18.6, t1: 31.2, kicker: 'II · the stars', title: 'Inside the cone',
      body: `Polynomials with complex roots and ${m('a > 0')} are the stars. Each has one root in the upper half-plane, at right. Color is ${m('|Δ|')}, from violet (simplest) to red. The two views are linked.` },
    { t0: 34.0, t1: 40.2, kicker: 'III · the view from zero', title: 'Stand at the origin',
      body: `You are the zero polynomial. Each polynomial is a direction; simpler numbers shine brighter.` },
    { t0: 40.6, t1: 46.6, kicker: 'III · parallax', title: 'Hidden multiples',
      body: `Each multiple ${m('k·f')} hides behind ${m('f')}. Lean off the origin and the ringed ${m('2(x² + x + 1)')} peeks out.` },
    { t0: 47.0, t1: 59.6, kicker: 'IV · the Klein model', title: 'Your sky is the hyperbolic plane',
      body: `Slide each star along its line of sight onto a screen. From your eye nothing changes; from outside, they lie on a disk. Planes through your eye look edge-on, so geodesics are straight.` },
    { t0: 63.0, t1: 73.6, place: 'top', kicker: 'V · the quadratic formula', title: 'An isometry onto the half-plane',
      body: `${m('[a : b : c] ↦ (−b + i√(4ac − b²)) / 2a')} carries the Klein disk isometrically onto the upper half-plane. Straight lines of stars become circles orthogonal to ℝ, or vertical lines where they run to ∞.` },
    { t0: 74.4, t1: 85.6, place: 'top', kicker: 'V · horocycles', title: 'The Ford circles',
      body: `Double-root forms ${m('k(qx − p)²')} become circles tangent to ℝ at ${m('p/q')}, radius proportional to ${m('1/(2kq²)')}. The squares ${m('(qx − p)²')} give the Ford circles, shrunk so neighbors never touch; multiples nest inside.` },
    { t0: 87.3, t1: 101.6, place: 'top', kicker: 'VI · symmetry', title: 'Moving the sky moves spacetime',
      body: `A Möbius map ${m('g')} moves the roots; the Lorentz transformation ${m('ρ(g)')} moves the coefficients. Let go and ${m('g')} settles on the nearest element of SL₂(ℤ): the lattice lands on itself, relabeled. Then ${m('T: x ↦ x + 1')} and ${m('S: x ↦ −1/x')}.` },
    { t0: 102.6, t1: 111.6, place: 'top', kicker: 'VIII · rational geodesics', title: 'The necklaces',
      body: `Planes spanned by lattice points string the stars into necklaces: the rational geodesics. Shift-click a star to pair it with the ringed one.` },
    { t0: 113.4, t1: 126.4, kicker: 'IX · inside', title: 'Live in the plane',
      body: `Now stand in the hyperbolic plane, a Poincaré disk centered on you. Each step Lorentz-boosts the whole lattice. The lines are the Farey tessellation. Lower your eye to zero: you are a Flatlander.` },
  ],

  cards: [
    { t0: 0.5, t1: 6.5, fadeIn: 1.2, fadeOut: 0.9, html: title },
    dip(6.6, 7.8),
    dip(31.2, 32.5),
    dip(85.8, 87.1),
    dip(111.8, 113.2),
    { t0: 126.4, t1: 142, fadeIn: 0.9, fadeOut: 0, solid: true, html: end },
    { t0: 140.9, t1: 142, fadeIn: 1.0, fadeOut: 0, solid: true, html: '' },   // fade the end card to black
  ],

  pointer: [
    // I: hover an exterior point, a double root and a star.
    { t: 9.2, x: 700, y: 520 },
    { t: 10.6, at: at.star([1, 0, -1]), follow: true },
    { t: 12.2, at: at.star([1, 0, -1]), follow: true },
    { t: 13.2, at: at.star([1, -2, 1]), follow: true },
    { t: 14.6, at: at.star([1, -2, 1]), follow: true },
    { t: 15.6, at: at.star([1, 1, 1]), follow: true },
    { t: 17.3, at: at.star([1, 1, 1]), follow: true },
    park(17.5),
    // II: a star in 3D, then a root in the pane.
    { t: 23.0, x: 300, y: 560 },
    { t: 24.0, at: at.star([2, 1, 3]), follow: true },
    { t: 25.8, at: at.star([2, 1, 3]), follow: true },
    park(26.0),                                    // leave unseen, so the hover card doesn't flip through every star crossed
    { t: 26.7, at: at.rootPlus([3, 1, 5], 30, 50) },
    { t: 27.4, at: at.root([3, 1, 5]) },
    { t: 30.6, at: at.root([3, 1, 5]) },
    park(31.0),
    // VI: grab i in the pane and drag the sky; let go and it settles.
    { t: 88.4, at: at.rootPlus([1, 0, 1], 0, 280) },   // enter from the empty dome above 0
    { t: 89.6, at: at.root([1, 0, 1]) },
    { t: 90.0, down: true },
    // Toward the real axis: g·i ≈ 0.21 + 0.59i, which settles on z ↦ z/(z + 1), so T and S after it are new moves.
    { t: 93.6, at: at.rootPlus([1, 0, 1], 60, 120), down: true },
    { t: 94.6, down: false },
    park(95.1),
    // VIII: shift-click x² + 2 to pair it with the selected x² + x + 1.
    { t: 105.5, at: at.rootPlus([1, 0, 2], 0, 390) },
    { t: 107.0, at: at.root([1, 0, 2]) },
    { t: 107.6, down: true, shift: true },
    { t: 107.75, down: false, shift: true },
    { t: 110.2, at: at.root([1, 0, 2]) },
    park(110.6),
  ],
};
