// WebXR as a progressive enhancement. Two placements of the same lattice:
//   'origin'  — your head is the zero polynomial; the cone opens overhead and the sky is the starscape;
//   'outside' — a tabletop model floating in front of you.
// Controllers or hands (transient-pointer on visionOS): point and pull the trigger / pinch to select a star; hold
// and sweep across the sky to move it by a Möbius map (snapping to SL₂(ℤ) on release). Buttons: A/X toggles the
// placement, B/Y steps the picture (lattice → Klein → Poincaré → half-plane).
import * as THREE from 'three';
import * as G from '../math/sl2.js';
import * as Mo from '../math/models.js';

export function setupXR({ renderer, scene, world, stars, state, api, markDirty, setG, animateG, absorb, H }) {
  const xr = navigator.xr;
  const vrButton = document.getElementById('xr-vr'), arButton = document.getElementById('xr-ar');
  if (!xr) return { update: () => false };
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  let placement = 'origin', session = null;
  const saved = { position: new THREE.Vector3(), scale: 1 };
  const EYE = 1.55;

  function place(kind, mode) {
    placement = kind;
    if (kind === 'origin') {
      // Head at the origin; 0.45 m per unit puts the Klein screen 1.8 m overhead.
      world.position.set(0, EYE, 0); world.scale.setScalar(0.45); world.rotation.set(0, 0, 0);
    } else {
      world.position.set(0, mode === 'immersive-ar' ? 0.95 : 1.0, -0.9); world.scale.setScalar(0.035);
      world.rotation.set(0, 0, 0);
    }
    markDirty();
  }

  async function start(mode) {
    if (session) { session.end(); return; }
    const opts = { optionalFeatures: ['local-floor', 'hand-tracking', 'layers'] };
    try { session = await xr.requestSession(mode, opts); } catch (e) { flashError(e); return; }
    saved.position.copy(world.position); saved.scale = world.scale.x;
    document.body.classList.add('immersive');
    if (mode === 'immersive-ar') renderer.setClearAlpha(0);
    await renderer.xr.setSession(session);
    place(mode === 'immersive-ar' ? 'outside' : 'origin', mode);
    session.addEventListener('end', () => {
      session = null;
      world.position.copy(saved.position); world.scale.setScalar(saved.scale); world.rotation.set(0, 0, 0);
      document.body.classList.remove('immersive');
      markDirty();
    });
  }
  function flashError(e) {
    const r = document.getElementById('g-readout'); r.textContent = `Could not start XR: ${e.message}`;
    setTimeout(() => { r.textContent = ''; }, 4000);
  }

  xr.isSessionSupported?.('immersive-vr').then(ok => { if (ok) { vrButton.hidden = false; vrButton.onclick = () => start('immersive-vr'); } }).catch(() => {});
  xr.isSessionSupported?.('immersive-ar').then(ok => { if (ok) { arButton.hidden = false; arButton.onclick = () => start('immersive-ar'); } }).catch(() => {});

  // ---- controllers ------------------------------------------------------------------------------------------
  const controllers = [0, 1].map(i => {
    const c = renderer.xr.getController(i);
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffe3b0, transparent: true, opacity: 0.55 }));
    ray.scale.z = 4; c.add(ray);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe3b0 }));
    dot.visible = false; scene.add(dot);
    c.userData = { ray, dot, held: null, gamepad: null, pressed: {} };
    c.addEventListener('connected', e => { c.userData.gamepad = e.data.gamepad; c.userData.hand = !!e.data.hand; ray.visible = e.data.targetRayMode !== 'transient-pointer'; });
    c.addEventListener('disconnected', () => { c.userData.gamepad = null; });
    c.addEventListener('selectstart', () => onSelectStart(c));
    c.addEventListener('selectend', () => onSelectEnd(c));
    scene.add(c);
    return c;
  });

  const tmp = new THREE.Matrix4();
  function rayLocal(c) {
    tmp.identity().extractRotation(c.matrixWorld);
    const o = new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), d = new THREE.Vector3(0, 0, -1).applyMatrix4(tmp);
    const inv = world.matrixWorld.clone().invert();
    return { o: o.applyMatrix4(inv), d: d.transformDirection(inv) };
  }
  /** Nearest visible star to a controller ray, by angle (within ~1.6°). */
  function pickRay(c) {
    const { o, d } = rayLocal(c), n = stars.lattice.count;
    let best = -1, bestCos = Math.cos(0.028);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      if (!stars.visible(i)) continue;
      const st = stars.stage(...stars.coefficients(i));
      v.set(...st.position).sub(o);
      const len = v.length(); if (len < 1e-6) continue;
      const cos = v.dot(d) / len;
      // Bias toward nearer stars: they are bigger and brighter.
      const score = cos + Math.min(0.0006, st.radius / len * 0.2);
      if (score > bestCos) { bestCos = score; best = i; }
    }
    return best;
  }
  function rootOfRay(c) {
    const { o, d } = rayLocal(c), m = stars.uniforms.uMorph.value;
    if (Math.abs(d.y) < 1e-6) return null;
    const t = (H - o.y) / d.y; if (t <= 0) return null;
    const x = o.x + t * d.x, z = o.z + t * d.z;
    if (m < 1.5) { const u = x / H, v = z / H; return u * u + v * v < 0.999 ? Mo.kleinToHalfPlane(u, v) : null; }
    if (m < 2.5) { const p = x / H, q = z / H; return p * p + q * q < 0.999 ? Mo.kleinToHalfPlane(...Mo.poincareToKlein(p, q)) : null; }
    const zz = { x: x / 2, y: z / 2 + 1 }; return zz.y > 1e-3 ? zz : null;
  }
  function onSelectStart(c) {
    c.userData.held = { z: rootOfRay(c), moved: 0, start: performance.now() };
  }
  function onSelectEnd(c) {
    const h = c.userData.held; c.userData.held = null;
    if (!h) return;
    if (h.moved < 0.02 && performance.now() - h.start < 600) {
      const i = pickRay(c);
      api.select(i >= 0 ? stars.coefficients(i) : null);
    } else if (state.snap) {
      const gamma = G.nearestIntegral(state.g);
      if (gamma) animateG(gamma, absorb);
    }
  }

  function update() {
    if (!renderer.xr.isPresenting) return false;
    for (const c of controllers) {
      const u = c.userData, h = u.held;
      if (h) {
        const z1 = rootOfRay(c);
        if (z1 && h.z) {
          const step = Math.hypot(z1.x - h.z.x, z1.y - h.z.y);
          h.moved += step;
          if (h.moved > 0.02) setG(G.dragStep(state.g, h.z, z1));
          h.z = z1;
        } else if (z1) h.z = z1;
      }
      const gp = u.gamepad;
      if (gp) {
        const press = (idx, fn) => { const b = gp.buttons[idx]?.pressed; if (b && !u.pressed[idx]) fn(); u.pressed[idx] = b; };
        press(4, () => place(placement === 'origin' ? 'outside' : 'origin', session?.mode));
        press(5, () => api.setMorph((Math.round(stars.uniforms.uMorph.value) + 1) % 4));
      }
    }
    return true;
  }
  return { update, place, get placement() { return placement; } };
}
