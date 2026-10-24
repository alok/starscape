// The roots pane: the starscape itself, side by side with the 3D lattice and linked to it.
//
// It renders the same GPU point cloud a second time, through an orthographic camera looking straight down at the
// screen Y = h, with the picture set to Klein, Poincaré or the half-plane. A drag moves every star by the Möbius
// map that carries the point under the pointer along with it, which is the same g that moves the 3D lattice.
// A 2D overlay draws what points cannot: the boundary and its rationals, the selected geodesic as a curve, rings,
// hover readouts, the Farey tessellation, and (inside) where you stand and where you are heading.
import * as THREE from 'three';
import * as F from '../math/forms.js';
import * as G from '../math/sl2.js';
import * as Mo from '../math/models.js';
import { minus } from './format.js';

const $ = id => document.getElementById(id);
const MODELS = ['Klein', 'Poincaré', 'Half-plane'];
const BOUNDARY_LABELS = [[0, '0'], [1, '1'], [-1, '−1'], [Infinity, '∞'], [2, '2'], [-2, '−2'], [0.5, '½'], [-0.5, '−½'], [1 / 3, '⅓'], [2 / 3, '⅔'], [-1 / 3, '−⅓'], [-2 / 3, '−⅔'], [3, '3'], [-3, '−3']];

/** Farey neighbors p/q < r/s with q, s ≤ n (and the edges to ∞), as pairs of reals. */
function fareyEdges(n) {
  const out = [];
  for (let k = -4; k <= 4; k++) out.push([k, Infinity]);
  // The Farey sequence of order n on [0, 1], then its translates by integers in [−4, 4).
  let [a, b, c, d] = [0, 1, 1, n];
  const seq = [[0, 1]];
  while (c <= n) {
    const k = Math.floor((n + b) / d);
    [a, b, c, d] = [c, d, k * c - a, k * d - b];
    seq.push([a, b]);
  }
  // Neighbors in the tessellation: every pair with |ps − qr| = 1 among the sequence (not only consecutive ones).
  for (let i = 0; i < seq.length; i++) for (let j = i + 1; j < seq.length; j++) {
    const [p, q] = seq[i], [r, s] = seq[j];
    if (Math.abs(p * s - q * r) === 1) for (let t = -4; t < 4; t++) out.push([p / q + t, r / s + t]);
  }
  return out;
}

export class RootsPane {
  constructor({ world, stars, state, H, HP, onModel }) {
    Object.assign(this, { world, stars, state, H, HP, onModel });
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
    this.camera.layers.set(1);
    stars.points.layers.enable(1);
    this.overlay = $('roots-overlay'); this.ctx = this.overlay.getContext('2d');
    this.rect = { x: 0, y: 0, w: 0, h: 0 };
    this.model = 3;              // picture: 1 Klein, 2 Poincaré, 3 half-plane
    this.morph = 3;              // eased toward model
    this.user = { zoom: 1, dx: 0, dz: 0 };
    this.showFarey = false;
    this.farey = fareyEdges(12);
    this.hover = -1;
    this.inside = null;          // { heading } while inside: the pane becomes a fixed map with you moving on it
    $('roots-models').addEventListener('click', e => {
      const b = e.target.closest('button[data-model]');
      if (b) this.setModel(Number(b.dataset.model));
    });
    $('roots-farey').addEventListener('click', () => {
      this.showFarey = !this.showFarey;
      $('roots-farey').setAttribute('aria-pressed', String(this.showFarey));
      this.onModel?.();
    });
    this.setModel(3, 0);
  }
  setModel(m, seconds = 0.8) {
    this.model = m; this.morphSeconds = seconds;
    if (seconds <= 0) this.morph = m;
    for (const b of document.querySelectorAll('#roots-models button')) b.setAttribute('aria-pressed', String(Number(b.dataset.model) === m));
    this.onModel?.();
  }
  /** Ease the picture; returns true while moving. */
  step(dt) {
    if (this.morph === this.model) return false;
    this.morph += (this.model - this.morph) * (1 - Math.exp((-dt * 5.5) / Math.max(0.05, this.morphSeconds)));
    if (Math.abs(this.model - this.morph) < 1e-3) this.morph = this.model;
    return true;
  }
  layout(rect) {
    this.rect = rect;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Object.assign(this.overlay.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    this.overlay.width = Math.round(rect.w * dpr); this.overlay.height = Math.round(rect.h * dpr);
    this.dpr = dpr;
  }

  // ---- view: plane coordinates (x, z) on the screen Y = h  <->  pane pixels ------------------------------------
  view() {
    const { H, HP, morph, user } = this;
    // The disk pictures frame the disk; the half-plane frames y ∈ (−0.3, 2.5) above the real line.
    const disk = { cx: 0, cz: 0, half: 1.1 * H }, half = { cx: 0, cz: 0.15 * HP, half: 1.4 * HP };
    const f = Math.min(1, Math.max(0, morph - 2));
    const base = { cx: disk.cx + (half.cx - disk.cx) * f, cz: disk.cz + (half.cz - disk.cz) * f, half: disk.half + (half.half - disk.half) * f };
    return { cx: base.cx + user.dx, cz: base.cz + user.dz, half: base.half / user.zoom };
  }
  toPixel(x, z) {
    const v = this.view(), s = this.rect.h / (2 * v.half);
    return [this.rect.w / 2 + (x - v.cx) * s, this.rect.h / 2 - (z - v.cz) * s];
  }
  toPlane(px, py) {
    const v = this.view(), s = (2 * v.half) / this.rect.h;
    return [v.cx + (px - this.rect.w / 2) * s, v.cz - (py - this.rect.h / 2) * s];
  }
  contains(e) {
    const r = this.rect;
    return r.w > 0 && e.clientX >= r.x && e.clientX < r.x + r.w && e.clientY >= r.y && e.clientY < r.y + r.h;
  }
  rootAt(e) {
    const [x, z] = this.toPlane(e.clientX - this.rect.x, e.clientY - this.rect.y);
    return Mo.screenToRoot(x, z, this.morph, this.H, this.HP);
  }
  pan(dx, dy) {
    const v = this.view(), s = (2 * v.half) / this.rect.h;
    this.user.dx -= dx * s; this.user.dz += dy * s;
  }
  /** Zoom by `factor` about the pointer. */
  zoom(factor, e) {
    const px = e.clientX - this.rect.x, py = e.clientY - this.rect.y, [x0, z0] = this.toPlane(px, py);
    this.user.zoom = Math.min(400, Math.max(0.3, this.user.zoom / factor));
    const [x1, z1] = this.toPlane(px, py);
    this.user.dx += x0 - x1; this.user.dz += z0 - z1;
  }
  resetView() { this.user = { zoom: 1, dx: 0, dz: 0 }; }

  /** The g the pane draws with: the live g, or the identity when it is a fixed map (inside). */
  g() { return this.inside ? G.identity : this.state.g; }

  // ---- rendering ------------------------------------------------------------------------------------------------
  /** Draw the stars into the pane's viewport with the shared renderer (scissored). */
  render(renderer, scene) {
    const { rect, camera, world, H } = this, v = this.view(), aspect = rect.w / rect.h;
    const s = world.scale.y;
    camera.left = -v.half * aspect * s; camera.right = v.half * aspect * s; camera.top = v.half * s; camera.bottom = -v.half * s;
    // Look up at the screen from below, as the eye at the origin does: then +X is right and +Z (toward ∞) is up,
    // the usual orientation of the half-plane. From above, the picture would be mirrored.
    camera.up.set(0, 0, 1);
    const target = world.localToWorld(new THREE.Vector3(v.cx, H, v.cz));
    camera.position.copy(target).add(new THREE.Vector3(0, -50 * s, 0));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    const u = this.stars.uniforms, saved = { m: u.uMorph.value, h: u.uViewportH.value, rho: u.uRho.value.clone(), e: u.uExposure.value };
    u.uMorph.value = this.morph;
    // Flat on a page every star is in front of you, so the pane can afford more light than the 3D view.
    u.uExposure.value = saved.e * 2.2;
    if (this.inside) u.uRho.value.identity();
    u.uViewportH.value = rect.h * this.dpr;
    const W = renderer.domElement.clientWidth, Hc = renderer.domElement.clientHeight;
    renderer.setViewport(rect.x, Hc - rect.y - rect.h, rect.w, rect.h);
    renderer.setScissor(rect.x, Hc - rect.y - rect.h, rect.w, rect.h);
    renderer.render(scene, camera);
    u.uMorph.value = saved.m; u.uViewportH.value = saved.h; u.uRho.value.copy(saved.rho); u.uExposure.value = saved.e;
    void W;
  }

  /** Pane pixel position of a lattice point under the current g and picture, or null. */
  pixelOf(coef) {
    const st = this.stars.stage(...coef, G.displayPushforward(this.g()), this.morph);
    return st.kind === 2 ? null : this.toPixel(st.position[0], st.position[2]);
  }
  /** Pane pixel of a Klein point. */
  pixelOfKlein(ku, kv) { return this.toPixel(...Mo.pictureOf(ku, kv, this.morph, this.H, this.HP)); }
  /** Pane pixel of a boundary point t ∈ ℝ ∪ {∞} after g. */
  pixelOfBoundary(t) { const [u, v] = Mo.boundaryPoint(G.actReal(this.g(), t)); return this.pixelOfKlein(u, v); }

  /** A geodesic between two base-picture boundary points, moved by g, sampled straight in Klein and mapped. */
  geodesicPath(ctx, t1, t2, n = 48) {
    const [a, b] = [t1, t2].map(t => Mo.boundaryPoint(G.actReal(this.g(), t)));
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      // Ease the samples toward the ends, where the curve bends most in the conformal pictures.
      const s = 0.5 - 0.5 * Math.cos((Math.PI * i) / n), ku = a[0] + (b[0] - a[0]) * s, kv = a[1] + (b[1] - a[1]) * s;
      const [px, py] = this.pixelOfKlein(ku * 0.99999, kv * 0.99999);
      if (!Number.isFinite(px) || !Number.isFinite(py) || Math.abs(px) > 1e5 || Math.abs(py) > 1e5) { pen = false; continue; }
      if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      pen = true;
    }
  }

  drawOverlay({ selected, hovered, plane, palette }) {
    const { ctx, dpr, rect } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.w, rect.h);
    // The boundary: a circle, bending into the real line.
    ctx.strokeStyle = 'rgba(200, 215, 245, 0.45)'; ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 360; i++) {
      const th = (i / 360) * 2 * Math.PI, [px, py] = this.pixelOfKlein(Math.cos(th), Math.sin(th));
      if (!Number.isFinite(px) || Math.abs(px) > 1e5 || Math.abs(py) > 1e5) { pen = false; continue; }
      if (pen) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      pen = true;
    }
    ctx.stroke();
    // The Farey tessellation (optional, and always on inside, where it is the ground you walk on).
    if (this.showFarey || this.inside) {
      ctx.strokeStyle = 'rgba(156, 198, 255, 0.28)'; ctx.lineWidth = 0.8;
      for (const [t1, t2] of this.farey) { this.geodesicPath(ctx, t1, t2, 40); ctx.stroke(); }
    }
    // The selected plane's geodesic: a chord in Klein, a circle orthogonal to the boundary in the conformal pictures.
    if (plane) {
      ctx.strokeStyle = 'rgba(168, 208, 255, 0.95)'; ctx.lineWidth = 1.6;
      this.geodesicPath(ctx, ...plane.endpoints, 96); ctx.stroke();
    }
    // Rationals on the boundary.
    ctx.font = 'italic 14px Newsreader, Georgia, serif'; ctx.fillStyle = 'rgba(220, 230, 250, 0.8)'; ctx.textAlign = 'center';
    for (const [t, text] of BOUNDARY_LABELS) {
      const [px, py] = this.pixelOfBoundary(t);
      if (px < 8 || px > rect.w - 8 || py < 8 || py > rect.h - 4) continue;
      const below = this.morph > 2.5;
      ctx.fillText(text, px, below ? py + 16 : py + (py > rect.h / 2 ? 16 : -6));
    }
    // You, inside: the center of the picture is your position; the ray ahead ends where your geodesic does.
    if (this.inside) {
      // Your geodesic ray: straight out of the center in your own (egocentric) picture, pulled back by g⁻¹ onto
      // the fixed map, where it curves as geodesics do.
      const h = this.inside.heading, ginv = G.inverse(this.state.g), pts = [];
      for (let i = 0; i <= 60; i++) {
        const r = Math.tanh((i / 60) * 4), z = Mo.kleinToHalfPlane(r * Math.cos(h), r * Math.sin(h));
        if (!z) continue;
        pts.push(this.pixelOfKlein(...Mo.halfPlaneToKlein(G.act(ginv, z))));
      }
      ctx.strokeStyle = 'rgba(255, 213, 138, 0.9)'; ctx.lineWidth = 1.6; ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
      const [cx, cy] = pts[0] ?? [0, 0];
      ctx.fillStyle = '#ffd58a'; ctx.beginPath(); ctx.arc(cx, cy, 5, 0, 2 * Math.PI); ctx.fill();
      ctx.font = '500 12px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('you', cx + 8, cy - 6);
    }
    const ring = (coef, color, r) => {
      const p = coef && this.pixelOf(coef);
      if (!p) return null;
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI); ctx.stroke();
      return p;
    };
    ring(selected, '#ffd58a', 9);
    const hp = ring(hovered, 'rgba(255, 213, 138, 0.55)', 7);
    if (hp && hovered) {
      const [a, b, c] = hovered, text = `${F.polynomialText(a, b, c)}   Δ = ${minus(F.discriminant(a, b, c))}`;
      ctx.font = '500 13px Inter, sans-serif';
      const w = ctx.measureText(text).width + 14, x = Math.min(rect.w - w - 4, hp[0] + 12), y = Math.max(4, hp[1] - 30);
      ctx.fillStyle = 'rgba(12, 16, 28, 0.82)'; ctx.beginPath(); ctx.roundRect(x, y, w, 22, 8); ctx.fill();
      ctx.fillStyle = '#eef1f7'; ctx.textAlign = 'left'; ctx.fillText(text, x + 7, y + 15);
    }
    void palette;
  }

  /** The nearest drawn star to a pointer in the pane, or −1. Allocation-free over the whole cloud. */
  pick(e, radiusPx = 10) {
    const { stars, H, HP } = this, rho = G.displayPushforward(this.g()), L = stars.lattice, co = L.coefficients;
    const px0 = e.clientX - this.rect.x, py0 = e.clientY - this.rect.y;
    const v = this.view(), s = this.rect.h / (2 * v.half), m = Math.min(3, Math.max(1, this.morph));
    let best = -1, bestD = radiusPx;
    for (let i = 0; i < L.count; i++) {
      if (L.kinds[i] === 2 || !stars.visible(i)) continue;
      const a = co[3 * i], b = co[3 * i + 1], c = co[3 * i + 2], X0 = -b, Y0 = a + c, Z0 = c - a;
      const Y = rho[3] * X0 + rho[4] * Y0 + rho[5] * Z0;
      const ku = (rho[0] * X0 + rho[1] * Y0 + rho[2] * Z0) / Y, kv = (rho[6] * X0 + rho[7] * Y0 + rho[8] * Z0) / Y;
      const [x, z] = Mo.pictureOf(ku, kv, m, H, HP);
      const dx = this.rect.w / 2 + (x - v.cx) * s - px0, dy = this.rect.h / 2 - (z - v.cz) * s - py0;
      if (Math.abs(dx) > bestD || Math.abs(dy) > bestD) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
}

export { MODELS };
