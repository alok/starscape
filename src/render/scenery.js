// Everything drawn besides the stars: the light cone Δ = 0, the screen disk Y = h, a selected star's line of
// sight, a cutting plane (geodesic) and a discriminant shell. All live in display coordinates inside the lattice
// group; the parts that belong to the lattice are moved by ρ(g) in their shaders so they slide with the stars.
import * as THREE from 'three';

const lineMaterial = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

/** Light cone with faint rulings and level circles. Rulings are moved by ρ(g), so a boost visibly slides them. */
export function makeCone(height = 7) {
  const group = new THREE.Group();
  const uniforms = { uRho: { value: new THREE.Matrix3() }, uOpacity: { value: 1 }, uH: { value: height } };
  // Surface: a soft gradient that is brightest edge-on, so the cone reads as a shape without hiding stars.
  const surf = new THREE.Mesh(
    new THREE.CylinderGeometry(height, 0, height, 128, 1, true).translate(0, height / 2, 0),
    new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz);
          vN = normalize(normalMatrix*normal); vY = position.y; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: /* glsl */`
        uniform float uOpacity, uH; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float f = (0.02 + 0.20 * pow(edge, 2.5)) * uOpacity * smoothstep(uH, uH*0.55, abs(vY));
          gl_FragColor = vec4(vec3(0.55,0.68,0.95)*f, f); }`,
    }));
  const lower = surf.clone(); lower.scale.y = -1;
  group.add(surf, lower);

  // Rulings through the origin and level circles a + c = ±y, moved by ρ(g) in the vertex shader. From outside the
  // circles are ellipses, whose eccentricity shows the cone's depth and tilt in a still frame; from the origin they
  // all lie on the rim of the sky.
  const lines = (pts, gain) => new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`uniform mat3 uRho; varying float vD;
        void main(){ vec3 p = uRho*position; float s = length(p); vec3 q = p * min(1.0, ${height.toFixed(1)}*1.414/max(s,1e-6));
          vD = length(q)/${(height * 1.414).toFixed(2)}; gl_Position = projectionMatrix*modelViewMatrix*vec4(q,1.0); }`,
      fragmentShader: /* glsl */`uniform float uOpacity; varying float vD;
        void main(){ float f = ${gain.toFixed(2)}*uOpacity*(1.0-smoothstep(0.55,1.0,vD))*smoothstep(0.0,0.08,vD); gl_FragColor=vec4(vec3(0.6,0.72,1.0)*f,f);} `,
    }));
  const rulings = [], rings = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2, x = Math.cos(t), z = Math.sin(t);
    rulings.push(-x * height, -height, -z * height, x * height, height, z * height);
  }
  for (const y of [-0.75, -0.5, -0.25, 0.25, 0.5, 0.75].map(f => f * height)) for (let i = 0; i < 96; i++) {
    const t0 = (i / 96) * Math.PI * 2, t1 = ((i + 1) / 96) * Math.PI * 2, r = Math.abs(y);
    rings.push(r * Math.cos(t0), y, r * Math.sin(t0), r * Math.cos(t1), y, r * Math.sin(t1));
  }
  group.add(lines(rulings, 0.2), lines(rings, 0.42));
  group.userData = { uniforms };
  return group;
}

/**
 * The coefficient axes through the origin, for orientation from outside: a, b and c are oblique in the display
 * basis (X, Y, Z) = (−b, a + c, c − a), so a ↦ (0, 1, −1), b ↦ (−1, 0, 0), c ↦ (0, 1, 1). Each runs from −n to n
 * in its coefficient; `ends` are the positive tips, where the labels go.
 */
export function makeAxes(n = 4) {
  const dirs = { a: [0, 1, -1], b: [-1, 0, 0], c: [0, 1, 1] }, pts = [], ends = {};
  for (const [k, d] of Object.entries(dirs)) {
    pts.push(...d.map(x => -n * x), ...d.map(x => n * x));
    ends[k] = new THREE.Vector3(...d.map(x => (n + 0.6) * x));
  }
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    lineMaterial(0xb8c8e8, 0.22));
  const group = new THREE.Group();
  group.add(lines);
  group.userData = { lines, ends };
  return group;
}

/** The screen disk a + c = h where radial projection lands: the Klein model. */
export function makeScreen(h = 4) {
  const group = new THREE.Group();
  const ring = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(Array.from({ length: 256 }, (_, i) => {
      const t = (i / 256) * Math.PI * 2; return new THREE.Vector3(Math.cos(t), 0, Math.sin(t));
    })),
    lineMaterial(0xcfe0ff, 0.5));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 128).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x0b1530, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  fill.renderOrder = -1;
  group.add(fill, ring);
  group.position.y = h; group.scale.setScalar(h);
  group.userData = { ring, fill };
  return group;
}

/** A star's line of sight from the origin (its projective point), and a ring marking the star itself. */
export function makeSelection() {
  const group = new THREE.Group();
  const ray = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]),
    new THREE.LineDashedMaterial({ color: 0xffd58a, transparent: true, opacity: 0.55, dashSize: 0.12, gapSize: 0.1, depthWrite: false }));
  const ringTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.strokeStyle = '#ffd58a'; g.lineWidth = 7;
    g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const ring = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTex, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
  ring.renderOrder = 20;
  const hover = ring.clone(); hover.material = ring.material.clone(); hover.material.opacity = 0.45;
  group.add(ray, ring, hover);
  group.userData = { ray, ring, hover };
  return group;
}

/** A plane through the origin with given Euclidean display normal, as a soft disk of radius R plus its rim. */
export function makePlane() {
  const group = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CircleGeometry(1, 96),
    new THREE.MeshBasicMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
  const rim = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 128 }, (_, i) => {
    const t = (i / 128) * Math.PI * 2; return new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
  })), lineMaterial(0x9cc6ff, 0.35));
  const chord = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    lineMaterial(0xa8d0ff, 0.9));
  const plate = new THREE.Group(); plate.add(disk, rim);
  group.add(plate, chord);
  group.visible = false;
  group.userData = { plate, chord };
  return group;
}
/** Orient the plane group: `normal` is the current (transformed) Euclidean display normal. */
export function setPlane(group, normal, radius, chordEnds) {
  const { plate, chord } = group.userData;
  plate.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...normal).normalize());
  plate.scale.setScalar(radius);
  if (chordEnds) chord.geometry.setFromPoints(chordEnds.map(p => new THREE.Vector3(...p)));
  chord.visible = !!chordEnds;
  group.visible = true;
}

/** The upper sheet of a hyperboloid Y² − X² − Z² = k (a discriminant shell) as faint latitude rings. */
export function makeShell() {
  const group = new THREE.Group();
  group.visible = false;
  group.userData.set = (k, maxY) => {
    group.clear();
    const mat = lineMaterial(0xffe2a8, 0.16);
    for (let j = 1; j <= 14; j++) {
      const Y = Math.sqrt(k) + ((maxY - Math.sqrt(k)) * j * j) / 196, r = Math.sqrt(Math.max(0, Y * Y - k));
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 96 }, (_, i) => {
        const t = (i / 96) * Math.PI * 2; return new THREE.Vector3(r * Math.cos(t), Y, r * Math.sin(t));
      })), mat);
      group.add(loop);
    }
    group.visible = true;
  };
  return group;
}
