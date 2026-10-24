// The guided tour: one idea per chapter, each a scene preset plus a few things to try.
// Scene fields (all optional): view 'outside'|'origin', pose overrides, morph 0–3, alpha {upper, lower, exterior,
// null}, depth (max a+c for stars; 0 = only the ball), ball, cone, screen, select [a,b,c], plane [A,B,C], shell k.
// Following the source viewer, the narrative is hers (Stange's seven chapters); what is new is said in the text.

const m = s => `<span class="math">${s}</span>`;

export const CHAPTERS = [
  {
    eyebrow: 'I · the lattice',
    title: 'Every quadratic is a point',
    body: `<p>The polynomial ${m('ax² + bx + c')} is the point ${m('(a, b, c)')} of ℤ³. The discriminant ${m('Δ = b² − 4ac')} is a quadratic form of signature (2, 1), so its zero set is a light cone.</p>
<p>Outside the cone (blue dust) a polynomial has two real roots. On it (mint) a double root. Inside it a complex pair. Drag to turn the lattice and tap any point.</p>`,
    scene: { view: 'outside', pose: { radius: 23, theta: 0.75, phi: 1.2, target: [0, 0.4, 0], fov: 40 }, morph: 0, depth: 0, ball: 6,
      alpha: { upper: 1, lower: 0.8, exterior: 0.75, null: 1 }, cone: true, screen: false },
  },
  {
    eyebrow: 'II · the stars',
    title: 'Inside the cone',
    body: `<p>Keep the polynomials with complex roots and ${m('a > 0')}: the inside of the upper cone, out to depth ${m('a + c')}. These are the <em>stars</em>. Each has one root in the upper half-plane.</p>
<p>Color is the invariant ${m('|Δ|')} read as a spectrum: violet for the simplest numbers (${m('Δ = −3')} is ${m('x² + x + 1')}, ${m('Δ = −4')} is ${m('x² + 1')}), running to red as the discriminant grows. Brightness is the light you would receive standing at the origin. The roots pane on the right is the same sky, flattened: drag either one.</p>`,
    scene: { view: 'outside', pose: { radius: 30, theta: 0.6, phi: 1.2, target: [0, 9, 0] }, morph: 0, depth: 'deep', ball: 6,
      alpha: { upper: 1, lower: 0.12, exterior: 0.1, null: 0.4 }, cone: true, screen: false },
  },
  {
    eyebrow: 'III · the view from zero',
    title: 'Stand at the origin',
    body: `<p>You are now the zero polynomial. Roots ignore scale, so each polynomial is really a <em>direction</em> from you, and the sky you see is the starscape.</p>
<p>Nothing here is drawn to look like stars. It is just perspective. Along a line of sight, ${m('k·f')} sits ${m('k')} times farther than ${m('f')} and has ${m('Δ = k²Δ_f')}, so a star's brightness falls like ${m('1/|Δ|')}: <b>simpler numbers shine brighter.</b> The same rule dims complicated numbers in pictures of algebraic numbers.</p>
<p>Every multiple hides exactly behind its primitive form. Lean your eye off the origin (W A S D, or move your head in VR) and they peek out: parallax separates them.</p>`,
    scene: { view: 'origin', pose: { pitch: Math.PI / 2 - 1e-4, yaw: 0, fov: 92 }, lean: [0, 0, 0], morph: 0, depth: 'deep',
      alpha: { upper: 1, lower: 0.15, exterior: 0.06, null: 0.9 }, cone: true, screen: false, select: [2, 2, 2] },
    actions: [
      { label: 'Lean to the side', run: app => app.leanTo([1.1, 0, 0]) },
      { label: 'Back to the origin', run: app => app.leanTo([0, 0, 0]) },
    ],
  },
  {
    eyebrow: 'IV · the Klein model',
    title: 'Your sky is the hyperbolic plane',
    body: `<p>Slide every star along its line of sight onto the screen ${m('a + c = 4')}. From your eye nothing changes. The disk you now see is the Klein model of the hyperbolic plane (§4.2.4).</p>
<p>A plane through your eye is seen edge-on, as a line. That is why geodesics are <em>straight</em> in the Klein model. The form ${m('x² − 1')}, with real roots ±1, cuts the plane ${m('2a − 2c = 0')}. You see it as a chord from −1 to 1, threading every star with ${m('a = c')}: the roots on the unit circle, like ${m('i')} (ringed).</p>`,
    scene: { view: 'origin', pose: { pitch: Math.PI / 2 - 1e-4, yaw: 0, fov: 96 }, lean: [0, 0, 0], morph: 1, depth: 'deep',
      alpha: { upper: 1, lower: 0, exterior: 0, null: 0.9 }, cone: true, screen: true, plane: [1, 0, -1], select: [1, 0, 1] },
    actions: [
      { label: 'Step outside to see the plane', run: app => app.goOutside({ radius: 18, theta: 0.9, phi: 1.05, target: [0, 3, 0] }) },
      { label: 'Back to the origin', run: app => app.goOrigin() },
    ],
  },
  {
    eyebrow: 'V · the quadratic formula',
    title: 'An isometry onto the half-plane',
    body: `<p>${m('[a : b : c] ↦ (−b + i√(4ac − b²)) / 2a')} is an isometry from the Klein model onto the upper half-plane (Thm 4.9). Drag the picture slider from Klein through Poincaré to the half-plane: straight chords bend into circles orthogonal to ℝ.</p>
<p>Each star is a disk of hyperbolic radius ${m('∝ 1/√|Δ|')}, which in the half-plane is ${m('1/2a')}. The double-root forms ${m('k(qx − p)²')} obey the same rule on the real line, with radius ${m('1/2kq²')}: the <b>Ford circles</b> are the stars on the horizon.</p>`,
    scene: { view: 'outside', pose: { radius: 9.5, theta: 0, phi: Math.PI - 0.0001, target: [0, 4, 1.4], fov: 50 }, morph: 3, depth: 'deep',
      alpha: { upper: 1, lower: 0, exterior: 0, null: 1 }, cone: false, screen: false, plane: null, select: [1, 1, 1] },
    actions: [
      { label: 'Klein', run: app => app.setMorph(1) },
      { label: 'Poincaré', run: app => app.setMorph(2) },
      { label: 'Half-plane', run: app => app.setMorph(3) },
    ],
  },
  {
    eyebrow: 'VI · symmetry',
    title: 'Moving the sky moves spacetime',
    body: `<p>Drag the sky. A Möbius map ${m('A')} moves the roots, and ${m('ρ(A)')} moves the coefficients, with ${m('R(ρ(A)f) = A·R(f)')}: ρ identifies PSL₂(ℝ) with the Lorentz group SO⁰(Δ). Every star slides along its own shell ${m('Δ = const')}, and the cone's rulings sweep around it like a relativistic boost.</p>
<p>Let go and the sky settles on the nearest element of SL₂(ℤ), which preserves ℤ³: the lattice lands exactly on itself, with every star relabeled. Try T and S.</p>`,
    scene: { view: 'origin', pose: { pitch: Math.PI / 2 - 1e-4, yaw: 0, fov: 96 }, lean: [0, 0, 0], morph: 1, depth: 'deep',
      alpha: { upper: 1, lower: 0, exterior: 0, null: 0.9 }, cone: true, screen: true, plane: null, select: [1, 0, 1] },
    actions: [
      { label: 'Apply T', run: app => app.applyIntegral('T') },
      { label: 'Apply S', run: app => app.applyIntegral('S') },
      { label: 'Watch it from outside', run: app => app.goOutside({ radius: 22, theta: 0.7, phi: 1.15, target: [0, 6, 0] }) },
    ],
  },
  {
    eyebrow: 'VII · shells',
    title: 'Discriminant shells and class numbers',
    body: `<p>Δ is invariant, so each hyperboloid ${m('Δ = −k')} is preserved. Its lattice points are the stars of discriminant ${m('−k')}, and SL₂(ℤ) permutes them in finitely many orbits, one reduced form ${m('|b| ≤ a ≤ c')} for each: ${m('h(−k)')} of them.</p>
<p id="shell-readout"></p>`,
    scene: { view: 'outside', pose: { radius: 26, theta: 0.5, phi: 1.25, target: [0, 8, 0] }, morph: 0, depth: 'deep',
      alpha: { upper: 1, lower: 0, exterior: 0, null: 0.3 }, cone: true, screen: false, plane: null, shell: 23, select: [2, 1, 3] },
    actions: [
      { label: 'k − 1', run: app => app.stepShell(-1) },
      { label: 'k + 1', run: app => app.stepShell(1) },
      { label: 'View its shell from zero', run: app => app.goOrigin() },
    ],
  },
  {
    eyebrow: 'VIII · rational geodesics',
    title: 'The necklaces',
    body: `<p>A plane through the origin meets the cone in a line of the Klein model, so its roots trace a geodesic. Planes spanned by lattice points give the <em>rational geodesics</em>: the necklaces that structure the picture (Obs. 4.12).</p>
<p>Tap any blue dust point for its plane, or Shift-tap two stars for the necklace through both. The pair ${m('x² + 1')}, ${m('x² + x + 1')} spans ${m('2a − 2c = 0')} again: the unit circle, from −1 to 1.</p>`,
    scene: { view: 'outside', pose: { radius: 18, theta: 1.1, phi: 1.0, target: [0, 3, 0] }, morph: 0, depth: 'deep',
      alpha: { upper: 1, lower: 0.15, exterior: 0.8, null: 0.8 }, cone: true, screen: true, shell: 0, plane: [1, 0, -1], select: [1, 1, 1] },
  },
  {
    eyebrow: 'IX · inside',
    title: 'Live in the plane',
    body: `<p>Until now you have looked <em>at</em> the hyperbolic plane. Now stand in it. The ground is the plane itself, drawn in the Poincaré model centered on you. Walk (W A S D, or drag the ground) and every step is a true hyperbolic translation: the stars and the Farey triangles flow past you, and the 3D lattice is being Lorentz-boosted the whole time.</p>
<p>The lines on the ground are the Farey tessellation. Its edges are exactly the planes of the dust points with ${m('Δ = 1')}, because ${m('(qx − p)(sx − r)')} has discriminant ${m('(ps − qr)²')}. Walk straight and note whether each triangle's pivot vertex passes on your left or right. The run lengths of L and R are the continued fraction of where you are heading (Series).</p>
<p>Lower your eye to zero and you are a Flatlander. Your whole world is one line, the strip across the middle. Because the disk is conformal and centered on you, its angles are exactly what a creature in H² sees.</p>`,
    scene: { view: 'inside', pose: { yaw: 0, pitch: -0.22, eye: 1.7, fov: 72 }, select: [1, 1, 1] },
    actions: [
      { label: 'Stand', run: app => app.setEye(1.7) },
      { label: 'Fly above', run: app => app.setEye(5) },
      { label: 'Become a Flatlander', run: app => app.setEye(0) },
    ],
  },
  {
    eyebrow: 'free play',
    title: 'Explore',
    body: `<p>Everything is live. Fly out and back, drag the sky, morph the picture, cut planes. In a headset, <b>Enter VR</b> puts your head at the origin: the cone opens above you, and leaning really does reveal the hidden multiples.</p>
<p>Inspired by Katherine Stange’s <a href="https://www.katestange.net/starscape-lattice/" target="_blank" rel="noopener">Starscape / Lattice</a>; mathematics from Harriss, Stange and Trettel, <a href="https://arxiv.org/abs/2008.07655" target="_blank" rel="noopener">Algebraic Number Starscapes</a>.</p>`,
    scene: { view: 'outside', pose: { radius: 24, theta: 0.8, phi: 1.1, target: [0, 6, 0] }, morph: 0, depth: 'deep',
      alpha: { upper: 1, lower: 0.25, exterior: 0.3, null: 0.8 }, cone: true, screen: false, shell: 0, plane: null },
  },
];
