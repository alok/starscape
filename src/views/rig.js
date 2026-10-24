// Camera rig with two vantage points:
//   'outside' — orbit the lattice from a distance (drag to orbit, scroll/pinch to zoom, right-drag to pan);
//   'origin'  — the eye at the zero polynomial, looking out (look with right-drag/two fingers, scroll to widen);
//   'inside'  — standing on the hyperbolic plane at its center, eye `eye` above the ground (0 = in the plane).
// Nothing moves unless the user moves it. Transitions between vantage points run only on request, ease in and out,
// and become a hard cut under prefers-reduced-motion.
import * as THREE from 'three';

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

export class Rig {
  constructor(camera, { reducedMotion = false } = {}) {
    this.camera = camera;
    this.reducedMotion = reducedMotion;
    this.mode = 'outside';
    this.outside = { target: new THREE.Vector3(0, 1.6, 0), radius: 17, theta: 0.75, phi: 1.12, fov: 42 };
    this.origin = { lean: new THREE.Vector3(), yaw: 0, pitch: Math.PI / 2 - 0.0001, fov: 92 };
    this.inside = { yaw: 0, pitch: -0.2, eye: 1.7, fov: 72 };
    this.anim = null;
    this.velocity = { theta: 0, phi: 0 };
    this.apply();
  }

  // --- pose computation -------------------------------------------------------------------------------------
  outsidePose(o = this.outside) {
    const p = new THREE.Vector3().setFromSphericalCoords(o.radius, o.phi, o.theta).add(o.target);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(p, o.target, new THREE.Vector3(0, 1, 0)));
    return { position: p, quaternion: q, fov: o.fov };
  }
  originPose(o = this.origin) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.pitch, o.yaw, 0, 'YXZ'));
    return { position: o.lean.clone(), quaternion: q, fov: o.fov };
  }
  insidePose(o = this.inside) {
    // In the plane itself (eye → 0) a creature can only look along the ground.
    // Higher up, look further down at the ground beneath you.
    const pitch = (o.pitch - 0.07 * Math.max(0, o.eye - 1.7)) * Math.min(1, o.eye / 0.4);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, o.yaw, 0, 'YXZ'));
    return { position: new THREE.Vector3(0, Math.max(o.eye, 0.004), 0), quaternion: q, fov: o.fov };
  }
  pose() { return this.mode === 'outside' ? this.outsidePose() : this.mode === 'origin' ? this.originPose() : this.insidePose(); }

  /** Poses store a field of view for landscape; in portrait we widen it so the same width stays in view. */
  fitFov(fov) {
    const aspect = this.camera.aspect || 1;
    if (aspect >= 1) return fov;
    const v = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect) * (180 / Math.PI);
    return Math.min(v, fov < 60 ? 90 : 118);
  }
  apply(pose = this.pose()) {
    this.camera.position.copy(pose.position);
    this.camera.quaternion.copy(pose.quaternion);
    const fov = this.fitFov(pose.fov);
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
  }

  // --- transitions --------------------------------------------------------------------------------------------
  /** Go to a vantage point. Optional overrides set the destination pose. Returns a promise that resolves on arrival. */
  go(mode, overrides = {}, duration = 1.4) {
    const from = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone(), fov: this.camera.fov };
    this.mode = mode;
    Object.assign(this[mode], overrides);
    if (overrides.lean) this.origin.lean = overrides.lean.clone();
    const to = this.pose();
    if (this.reducedMotion || duration <= 0) { this.anim = null; this.apply(to); return Promise.resolve(); }
    return new Promise(resolve => { this.anim = { from, to, t: 0, duration, resolve }; });
  }
  get animating() { return !!this.anim; }

  update(dt) {
    if (this.anim) {
      const a = this.anim;
      a.t = Math.min(1, a.t + dt / a.duration);
      const e = ease(a.t);
      // Travel along an arc that stays above the cone so the path never cuts through the dense star field.
      const pos = a.from.position.clone().lerp(a.to.position, e);
      this.camera.position.copy(pos);
      this.camera.quaternion.copy(a.from.quaternion).slerp(a.to.quaternion, e);
      this.camera.fov = lerp(a.from.fov, this.fitFov(a.to.fov), e);
      this.camera.updateProjectionMatrix();
      if (a.t >= 1) { this.anim = null; this.apply(); a.resolve(); }
      return true;
    }
    // Inertia from the user's own flick only, decaying quickly.
    if (this.mode === 'outside' && (Math.abs(this.velocity.theta) > 1e-5 || Math.abs(this.velocity.phi) > 1e-5)) {
      this.orbit(this.velocity.theta * dt * 60, this.velocity.phi * dt * 60, false);
      const k = Math.exp(-dt * 7);
      this.velocity.theta *= k; this.velocity.phi *= k;
      return true;
    }
    return false;
  }

  // --- user input ---------------------------------------------------------------------------------------------
  orbit(dTheta, dPhi, track = true) {
    if (this.anim) return;
    const o = this.outside;
    o.theta = wrapAngle(o.theta - dTheta);
    o.phi = clamp(o.phi - dPhi, 0.08, Math.PI - 0.08);
    if (track) { this.velocity.theta = dTheta * 0.5; this.velocity.phi = dPhi * 0.5; }
    this.apply();
  }
  stopInertia() { this.velocity.theta = this.velocity.phi = 0; }
  zoom(factor) {
    if (this.anim) return;
    if (this.mode === 'outside') this.outside.radius = clamp(this.outside.radius * factor, 2.5, 80);
    else this[this.mode].fov = clamp(this[this.mode].fov * factor, 20, 125);
    this.apply();
  }
  pan(dx, dy) {
    if (this.anim || this.mode !== 'outside') return;
    const o = this.outside, cam = this.camera;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const k = o.radius * Math.tan((o.fov * Math.PI) / 360) * 2;
    o.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    this.apply();
  }
  look(dYaw, dPitch) {
    if (this.anim || this.mode === 'outside') return;
    const o = this[this.mode];
    o.yaw = wrapAngle(o.yaw - dYaw);
    o.pitch = clamp(o.pitch + dPitch, -Math.PI / 2 + 1e-4, Math.PI / 2 - 1e-4);
    this.apply();
  }
  setEye(h) { this.inside.eye = clamp(h, 0, 8); if (this.mode === 'inside' && !this.anim) this.apply(); }
  /** The direction you face, projected onto the ground (unit (x, z) in world coordinates). */
  heading() {
    const yaw = this[this.mode]?.yaw ?? 0;
    return [-Math.sin(yaw), -Math.cos(yaw)];
  }
  /** Move the eye slightly off the origin (display units, in the camera's horizontal frame). */
  lean(dx, dy, dz) {
    if (this.anim || this.mode !== 'origin') return;
    const o = this.origin, yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), o.yaw);
    o.lean.add(new THREE.Vector3(dx, dy, dz).applyQuaternion(yaw));
    if (o.lean.length() > 3) o.lean.setLength(3);
    this.apply();
  }
}
