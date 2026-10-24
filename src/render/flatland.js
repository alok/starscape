// The ground of the Inside view: the Poincaré disk centered on you, carrying the Farey tessellation.
// Because the model is conformal and its geodesics through the center are diameters, the angles you see at your
// own feet are exactly the visual angles a creature living in H² would see; distances shrink toward the rim,
// which is infinitely far away. The mathematics is in math/flatland.js.
import * as THREE from 'three';
import * as G from '../math/sl2.js';

const floorVertex = /* glsl */ `
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// For a point p of the disk: to the half-plane, pull back by g, reduce into the Farey triangle (0, 1, ∞) by
// translations and z ↦ z/(1 − z), then measure hyperbolic distance to its three sides. Isometries preserve that
// distance, so the lines keep a constant hyperbolic width and thin out toward the rim, as they should.
const floorFragment = /* glsl */ `
uniform vec4 uGinv;        // g⁻¹ = [p q; r s]
uniform float uOpacity, uWidth;
uniform vec3 uLine, uTint;
varying vec2 vP;
vec2 cdiv(vec2 a, vec2 b) { return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / dot(b, b); }
void main() {
  float r2 = dot(vP, vP);
  if (r2 >= 1.0) discard;
  vec2 k = 2.0 * vP / (1.0 + r2);
  float den = max(1.0 - k.y, 1e-7);
  vec2 z = vec2(k.x / den, sqrt(max(0.0, 1.0 - dot(k, k))) / den);
  z = cdiv(vec2(uGinv.x * z.x + uGinv.y, uGinv.x * z.y), vec2(uGinv.z * z.x + uGinv.w, uGinv.z * z.y));
  float flips = 0.0;
  for (int i = 0; i < 48; i++) {
    z.x -= floor(z.x);
    vec2 c = z - vec2(0.5, 0.0);
    if (dot(c, c) >= 0.25) break;
    z = cdiv(z, vec2(1.0 - z.x, -z.y));
    flips += 1.0;
  }
  float d0 = asinh(z.x / z.y), d1 = asinh((1.0 - z.x) / z.y);
  vec2 c = z - vec2(0.5, 0.0);
  float d2 = asinh(abs(dot(c, c) - 0.25) / z.y);
  float d = min(d0, min(d1, d2));
  float aa = fwidth(d) * 1.2 + 1e-4;
  float line = 1.0 - smoothstep(uWidth, uWidth + aa, d);
  // A faint alternation of the triangles helps the eye find them; it fades toward the rim with the detail.
  float rim = smoothstep(1.0, 0.82, sqrt(r2));
  float parity = mod(flips, 2.0);
  vec3 col = uTint * (0.6 + 0.4 * parity) * rim + uLine * line * (0.45 + 0.55 * rim);
  float a = (0.6 * rim + 0.9 * line) * uOpacity;
  gl_FragColor = vec4(col * uOpacity, a);
}`;

/** The ground disk, in display coordinates: the plane Y = h, radius h, like the projection screen. */
export function makeFloor(h) {
  const uniforms = {
    uGinv: { value: new THREE.Vector4(1, 0, 0, 1) }, uOpacity: { value: 0 }, uWidth: { value: 0.008 },
    uLine: { value: new THREE.Color(0xa9cdff) }, uTint: { value: new THREE.Color(0x0d1730) },
  };
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 256),
    new THREE.ShaderMaterial({ uniforms, vertexShader: floorVertex, fragmentShader: floorFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } }));
  // CircleGeometry lies in XY; map its (x, y) to display (X, Z) so the shader's vP is the Poincaré coordinate (u, v).
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.setScalar(h);
  mesh.position.y = h - 0.002;
  mesh.renderOrder = 1;
  const horizon = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => {
    const t = (i / 256) * Math.PI * 2; return new THREE.Vector3(Math.cos(t) * h, h, Math.sin(t) * h);
  })), new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0 }));
  const group = new THREE.Group();
  group.add(mesh, horizon);
  group.visible = false;
  group.userData = { uniforms, horizon };
  return group;
}
export function setFloorG(floor, g, opacity) {
  const [p, q, r, s] = G.inverse(g);
  floor.userData.uniforms.uGinv.value.set(p, q, r, s);
  floor.userData.uniforms.uOpacity.value = opacity;
  floor.userData.horizon.material.opacity = 0.55 * opacity;
  floor.visible = opacity > 0.01;
}

