// WebXR as a progressive enhancement, with visionOS-style glass panels in the world (DOM does not render in an
// immersive session). The lattice follows the current vantage:
//   origin  — your head is the zero polynomial; the cone opens overhead and the sky is the starscape;
//   outside — a tabletop model in front of you;
//   inside  — the hyperbolic plane on your real floor. Walking in the room is converted into hyperbolic
//             translation (you stay at the center and the plane flows), and "Rise into the plane" lifts the plane
//             to eye level, where you see it edge-on as a Flatlander does.
// Controllers, hands or gaze-and-pinch: point and pull/pinch to press buttons or select a star; hold and sweep the
// sky (or the ground, inside) to move it by a Möbius map. Thumbsticks walk inside.
import * as THREE from 'three';
import * as G from '../math/sl2.js';
import * as Mo from '../math/models.js';
import * as F from '../math/forms.js';
import { walk } from '../math/flatland.js';
import { GlassPanel, makeGrabber, FONTS } from './xrpanel.js';

const ORIGIN_SCALE = 0.45, TABLE_SCALE = 0.035, FLOOR_SCALE = 3;   // meters per display unit

export function setupXR({ renderer, scene, world, stars, state, api, markDirty, setG, animateG, absorb, H, HP }) {
  const xr = navigator.xr;
  const vrButton = document.getElementById('xr-vr'), arButton = document.getElementById('xr-ar');
  if (!xr) return { update: () => false };
  renderer.xr.enabled = true;
  renderer.xr.setReferenceSpaceType('local-floor');

  let session = null, mode = null, planeLift = 0;
  const saved = { position: new THREE.Vector3(), scale: 1 };
  const head = new THREE.Vector3(), headQ = new THREE.Quaternion();
  const center = new THREE.Vector3(0, 0, 0);     // inside: where in the room the center of the disk sits

  // ---- placement -----------------------------------------------------------------------------------------------
  function place(dt = 0) {
    const vantage = api.rig.mode;
    world.rotation.set(0, 0, 0);
    if (vantage === 'origin') {
      world.scale.setScalar(ORIGIN_SCALE);
      world.position.set(0, 1.55, 0);
    } else if (vantage === 'outside') {
      world.scale.setScalar(TABLE_SCALE);
      world.position.set(0, mode === 'immersive-ar' ? 0.95 : 1.0, -0.9);
    } else {
      world.scale.setScalar(FLOOR_SCALE);
      // The plane Y = h in display units lies on the floor; lifting it raises it toward the eyes.
      const target = planeLiftTarget * (head.y - 0.02);
      planeLift += (target - planeLift) * Math.min(1, dt * 3);
      world.position.set(center.x, -H * FLOOR_SCALE + planeLift, center.z);
    }
  }
  let planeLiftTarget = 0;

  /** Inside: turn the head's horizontal drift from the disk's center into hyperbolic walking, and recenter. */
  function walkWithBody() {
    if (api.rig.mode !== 'inside') return;
    const dx = head.x - center.x, dz = head.z - center.z, d = Math.hypot(dx, dz);
    if (d < 0.004) return;
    // At the center of the Poincaré disk of radius R (meters), ds = 2|dp|/R in hyperbolic units.
    const R = H * FLOOR_SCALE, step = (2 * d) / R;
    setG(walk(state.g, Math.atan2(dz, dx), step));
    center.x = head.x; center.z = head.z;
  }

  async function start(m) {
    if (session) { session.end(); return; }
    const opts = { optionalFeatures: ['local-floor', 'hand-tracking', 'layers'] };
    try { session = await xr.requestSession(m, opts); } catch (e) { flashError(e); return; }
    mode = m;
    saved.position.copy(world.position); saved.scale = world.scale.x;
    document.body.classList.add('immersive');
    await renderer.xr.setSession(session);
    if (m === 'immersive-ar' && api.rig.mode === 'origin') api.goOutside();
    ui.group.visible = true; uiPlaced = false;
    renderAll();
    session.addEventListener('end', () => {
      session = null; mode = null; planeLiftTarget = planeLift = 0;
      world.position.copy(saved.position); world.scale.setScalar(saved.scale); world.rotation.set(0, 0, 0);
      ui.group.visible = false;
      document.body.classList.remove('immersive');
      api.restoreFrame?.();
      markDirty();
    });
  }
  function flashError(e) {
    const r = document.getElementById('g-readout'); r.textContent = `Could not start XR: ${e.message}`;
    setTimeout(() => { r.textContent = ''; }, 4000);
  }
  xr.isSessionSupported?.('immersive-vr').then(ok => { if (ok) { vrButton.hidden = false; vrButton.onclick = () => start('immersive-vr'); } }).catch(() => {});
  xr.isSessionSupported?.('immersive-ar').then(ok => { if (ok) { arButton.hidden = false; arButton.onclick = () => start('immersive-ar'); } }).catch(() => {});

  // ---- glass UI ------------------------------------------------------------------------------------------------
  const ui = { group: new THREE.Group() };
  ui.group.visible = false;
  scene.add(ui.group);
  ui.window = new GlassPanel({ width: 0.64, height: 0.50 });
  ui.ornament = new GlassPanel({ width: 0.62, height: 0.075, radius: 0.0375 });
  ui.card = new GlassPanel({ width: 0.26, height: 0.17, radius: 0.03 });
  ui.grabber = makeGrabber(0.1);
  ui.window.mesh.position.set(0, 0, 0);
  ui.ornament.mesh.position.set(0, -0.305, 0.03);
  ui.grabber.position.set(0, -0.36, 0.02);
  ui.card.mesh.position.set(0.47, 0.08, 0.06);
  ui.card.mesh.rotation.y = -0.28;
  ui.group.add(ui.window.mesh, ui.ornament.mesh, ui.grabber, ui.card.mesh);
  let uiPlaced = false;

  const paragraphs = html => {
    const div = document.createElement('div'); div.innerHTML = html;
    return [...div.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean);
  };
  ui.window.draw = p => {
    const c = api.chapter(), W = p.canvas.width, pad = 46;
    p.text(c.eyebrow.toUpperCase(), pad, 34, { size: 22, font: "'Inter', sans-serif", weight: 600, color: '#ffd58a' });
    // Shrink a long title until it fits on one line.
    let size = 46;
    p.ctx.font = `400 ${size}px ${FONTS.SERIF}`;
    while (size > 30 && p.ctx.measureText(c.title).width > W - 2 * pad) { size -= 2; p.ctx.font = `400 ${size}px ${FONTS.SERIF}`; }
    let y = p.text(c.title, pad, 66, { size, color: '#ffffff', width: W - 2 * pad, maxLines: 1 }) + 10;
    // The body gets the space above the action row; each paragraph takes what is left, cut with an ellipsis.
    const by = p.canvas.height - 82, bodyEnd = by - (c.actions?.length ? 84 : 20), line = 25 * 1.32;
    for (const para of paragraphs(c.body)) {
      const room = Math.floor((bodyEnd - y) / line);
      if (room < 1) break;
      y = p.text(para, pad, y, { size: 25, color: '#dfe5ef', width: W - 2 * pad, maxLines: room }) + 10;
    }
    p.button('prev', '‹', pad, by, 64, 54, { size: 34, onPress: () => api.renderChapter(c.index - 1) });
    p.text(`${c.index + 1} / ${c.count}`, W / 2, by + 14, { size: 24, font: "'Inter', sans-serif", color: '#aeb8c9', align: 'center' });
    p.button('next', '›', W - pad - 64, by, 64, 54, { size: 34, onPress: () => api.renderChapter(c.index + 1) });
    (c.actions ?? []).slice(0, 3).forEach((a, i) => {
      const w = Math.min(220, (W - 2 * pad - 20) / 3);
      p.button('act' + i, a.label.length > 18 ? a.label.slice(0, 17) + '…' : a.label, pad + i * (w + 10), by - 70, w, 50, { size: 20, onPress: () => a.run(api) });
    });
  };
  ui.ornament.draw = p => {
    const v = api.rig.mode, m = Math.round(state.morphTarget ?? 0), h = p.canvas.height, y = 12, bh = h - 24;
    let x = 16;
    const seg = (id, label, sel, fn, w = 104) => { p.button(id, label, x, y, w, bh, { selected: sel, onPress: fn, size: 22 }); x += w + 6; };
    seg('outside', 'Outside', v === 'outside', () => api.goOutside());
    seg('origin', 'Origin', v === 'origin', () => api.goOrigin());
    seg('inside', 'Inside', v === 'inside', () => api.goInside());
    x += 12;
    if (v === 'inside') {
      seg('lift', planeLiftTarget ? 'Stand on it' : 'Rise into it', false, () => { planeLiftTarget = planeLiftTarget ? 0 : 1; renderAll(); }, 150);
      seg('home', 'Back to i', false, () => animateG([...G.identity]), 120);
    } else {
      seg('pic', ['Lattice', 'Klein', 'Poincaré', 'Half-plane'][m], false, () => { api.setMorph((m + 1) % 4); setTimeout(renderAll, 50); }, 136);
      seg('T', 'T', false, () => api.applyIntegral('T'), 56);
      seg('S', 'S', false, () => api.applyIntegral('S'), 56);
    }
  };
  ui.card.draw = p => {
    const sel = state.selected, pad = 24;
    if (!sel) { p.text('Point at a star and pinch', pad, 30, { size: 22, italic: true, color: '#aeb8c9', width: p.canvas.width - 2 * pad }); return; }
    const [a, b, c] = sel, d = F.discriminant(a, b, c);
    p.text(F.polynomialText(a, b, c), pad, 22, { size: 34, color: '#fff' });
    p.text(`Δ = ${String(d).replace('-', '−')}`, pad, 78, { size: 23, color: '#cfd6e2' });
    p.text(F.rootText(a, b, c), pad, 112, { size: 23, color: '#cfd6e2', italic: true, width: p.canvas.width - 2 * pad });
  };
  function renderAll() { ui.window.render(); ui.ornament.render(); ui.card.render(); }
  const panels = () => [ui.window, ui.ornament, ui.card];

  /** Put the UI in front of the user, below their gaze, facing them. */
  function placeUI() {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ); fwd.y = 0; fwd.normalize();
    const pos = head.clone().addScaledVector(fwd, 0.85); pos.y = head.y - 0.28;
    ui.group.position.copy(pos);
    ui.group.lookAt(head.x, pos.y, head.z);
    uiPlaced = true;
  }

  // ---- controllers ---------------------------------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const controllers = [0, 1].map(i => {
    const c = renderer.xr.getController(i);
    const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
    ray.scale.z = 3; c.add(ray);
    c.userData = { ray, held: null, gamepad: null, pressed: {}, mode: null };
    c.addEventListener('connected', e => {
      c.userData.gamepad = e.data.gamepad; c.userData.mode = e.data.targetRayMode;
      ray.visible = e.data.targetRayMode === 'tracked-pointer';
    });
    c.addEventListener('disconnected', () => { c.userData.gamepad = null; });
    c.addEventListener('selectstart', () => onSelectStart(c));
    c.addEventListener('selectend', () => onSelectEnd(c));
    scene.add(c);
    return c;
  });
  const tmp = new THREE.Matrix4();
  function worldRay(c) {
    tmp.identity().extractRotation(c.matrixWorld);
    return { o: new THREE.Vector3().setFromMatrixPosition(c.matrixWorld), d: new THREE.Vector3(0, 0, -1).applyMatrix4(tmp) };
  }
  function uiHit(c) {
    if (!ui.group.visible) return null;
    const { o, d } = worldRay(c);
    raycaster.set(o, d);
    const hits = raycaster.intersectObjects([...panels().map(p => p.mesh), ui.grabber], false);
    if (!hits.length) return null;
    const h = hits[0];
    if (h.object.userData.grabber) return { grabber: true, point: h.point, distance: h.distance };
    const panel = h.object.userData.panel;
    return { panel, button: panel.hit(h.uv), point: h.point, distance: h.distance };
  }
  function rayLocal(c) {
    const { o, d } = worldRay(c), inv = world.matrixWorld.clone().invert();
    return { o: o.applyMatrix4(inv), d: d.transformDirection(inv) };
  }
  function pickRay(c) {
    const { o, d } = rayLocal(c), n = stars.lattice.count, v = new THREE.Vector3();
    let best = -1, bestCos = Math.cos(0.03);
    for (let i = 0; i < n; i++) {
      if (!stars.visible(i)) continue;
      const st = stars.stage(...stars.coefficients(i));
      v.set(...st.position).sub(o);
      const len = v.length(); if (len < 1e-6) continue;
      const score = v.dot(d) / len + Math.min(0.0008, (st.radius / len) * 0.3);
      if (score > bestCos) { bestCos = score; best = i; }
    }
    return best;
  }
  function rootOfRay(c) {
    const { o, d } = rayLocal(c);
    return Mo.rayToRoot(o, d, stars.uniforms.uMorph.value, H, HP);
  }
  function onSelectStart(c) {
    const hit = uiHit(c);
    if (hit?.grabber) { c.userData.held = { grab: true, offset: ui.group.position.clone().sub(hit.point), distance: hit.distance }; return; }
    if (hit) { c.userData.held = { ui: hit }; return; }
    c.userData.held = { z: rootOfRay(c), moved: 0, start: performance.now() };
  }
  function onSelectEnd(c) {
    const h = c.userData.held; c.userData.held = null;
    if (!h || h.grab) return;
    if (h.ui) { h.ui.button?.onPress?.(); setTimeout(renderAll, 30); return; }
    if (h.moved < 0.02 && performance.now() - h.start < 650) {
      const i = pickRay(c);
      api.select(i >= 0 ? stars.coefficients(i) : null);
      ui.card.render();
    } else if (state.snap && api.rig.mode !== 'inside') {
      const gamma = G.nearestIntegral(state.g);
      if (gamma) animateG(gamma, absorb);
    }
  }

  let lastChapter = -1, lastMode = '', lastSel = '';
  function update(dt) {
    if (!renderer.xr.isPresenting) return false;
    const cam = renderer.xr.getCamera();
    head.setFromMatrixPosition(cam.matrixWorld); headQ.setFromRotationMatrix(cam.matrixWorld);
    if (!uiPlaced && head.lengthSq() > 0) { placeUI(); center.set(head.x, 0, head.z); }
    walkWithBody();
    place(dt);
    // Keep the glass in sync with the app.
    const ch = api.chapter().index, sel = String(state.selected);
    if (ch !== lastChapter || api.rig.mode !== lastMode || sel !== lastSel) { lastChapter = ch; lastMode = api.rig.mode; lastSel = sel; renderAll(); }
    for (const c of controllers) {
      const u = c.userData, h = u.held;
      // Hover glow on glass buttons.
      if (!h) {
        const hit = uiHit(c);
        for (const p of panels()) p.setHover(hit?.panel === p ? hit.button?.id ?? null : null);
        u.ray.scale.z = hit ? hit.distance : 3;
      }
      if (h?.grab) {
        const { o, d } = worldRay(c);
        ui.group.position.copy(o.addScaledVector(d, h.distance)).add(h.offset);
        ui.group.lookAt(head.x, ui.group.position.y, head.z);
      } else if (h && !h.ui) {
        const z1 = rootOfRay(c);
        if (z1 && h.z) {
          h.moved += Math.hypot(z1.x - h.z.x, z1.y - h.z.y);
          if (h.moved > 0.02) setG(G.dragStep(state.g, h.z, z1));
          h.z = z1;
        } else if (z1) h.z = z1;
      }
      const gp = u.gamepad;
      if (gp && api.rig.mode === 'inside') {
        // Thumbstick walks along your gaze (forward/back) and sideways.
        const ax = gp.axes[2] ?? 0, ay = gp.axes[3] ?? 0;
        if (Math.hypot(ax, ay) > 0.15) {
          const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(headQ);
          const heading = Math.atan2(fwd.z, fwd.x), angle = heading + Math.atan2(ax, -ay);
          setG(walk(state.g, angle, 1.0 * dt * Math.min(1, Math.hypot(ax, ay))));
        }
      }
      if (gp) {
        const press = (idx, fn) => { const b = gp.buttons[idx]?.pressed; if (b && !u.pressed[idx]) fn(); u.pressed[idx] = b; };
        press(4, () => api.renderChapter(api.chapter().index + 1));   // A / X
        press(5, () => placeUI());                                     // B / Y recenters the glass
      }
    }
    markDirty();
    return true;
  }
  return { update, get presenting() { return !!session; } };
}
