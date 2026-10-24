// In-world glass panels for WebXR, styled after visionOS windows and ornaments: a frosted rounded rectangle,
// soft edge light, pill buttons that brighten under the pointer, and a grabber bar for moving the window.
// A panel is a canvas texture on a plane; buttons are rectangles in canvas pixels, hit-tested by UV.
import * as THREE from 'three';

const SERIF = "'Newsreader', 'Iowan Old Style', Georgia, serif";
const SANS = "'Inter', -apple-system, 'Segoe UI', sans-serif";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Wrap text to a width; returns lines. */
function wrap(ctx, text, width) {
  const words = text.split(/\s+/), lines = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export class GlassPanel {
  /** @param {{width: number, height: number, ppm?: number, radius?: number}} o  size in meters */
  constructor({ width, height, ppm = 1100, radius = 0.05 }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * ppm); this.canvas.height = Math.round(height * ppm);
    this.ctx = this.canvas.getContext('2d');
    this.ppm = ppm; this.radiusPx = radius * ppm;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, depthTest: false }));
    this.mesh.renderOrder = 50;
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.hovered = null;
    this.draw = () => {};
  }
  /** Redraw: glass background, then the content callback, then buttons. */
  render() {
    const { ctx, canvas } = this, W = canvas.width, Hh = canvas.height, r = this.radiusPx;
    ctx.clearRect(0, 0, W, Hh);
    roundRect(ctx, 2, 2, W - 4, Hh - 4, r);
    const bg = ctx.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, 'rgba(58, 66, 86, 0.78)'); bg.addColorStop(1, 'rgba(26, 30, 42, 0.80)');
    ctx.fillStyle = bg; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)'; ctx.stroke();
    // A soft specular band along the top edge, as on visionOS glass.
    ctx.save(); roundRect(ctx, 2, 2, W - 4, Hh - 4, r); ctx.clip();
    const shine = ctx.createLinearGradient(0, 0, 0, Math.min(140, Hh * 0.4));
    shine.addColorStop(0, 'rgba(255,255,255,0.10)'); shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine; ctx.fillRect(0, 0, W, Hh);
    ctx.restore();
    this.buttons = [];
    this.draw(this);
    for (const b of this.buttons) this.drawButton(b);
    this.texture.needsUpdate = true;
  }
  /** Declare a pill button inside draw(). */
  button(id, label, x, y, w, h, { selected = false, onPress, size = 30 } = {}) {
    this.buttons.push({ id, label, x, y, w, h, selected, onPress, size });
  }
  drawButton(b) {
    const { ctx } = this, hover = this.hovered === b.id;
    roundRect(ctx, b.x, b.y, b.w, b.h, b.h / 2);
    ctx.fillStyle = b.selected ? 'rgba(255,255,255,0.88)' : hover ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.11)';
    ctx.fill();
    if (hover && !b.selected) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke(); }
    ctx.fillStyle = b.selected ? '#151924' : '#f4f6fb';
    ctx.font = `500 ${b.size}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  /** Draw text (wrapped to `width`, at most `maxLines`, ending in an ellipsis if cut); returns the y below it. */
  text(str, x, y, { size = 30, font = SERIF, weight = 400, color = '#eef1f7', italic = false, align = 'left', width, lineHeight = 1.32, maxLines = Infinity } = {}) {
    const { ctx } = this;
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'top';
    let lines = width ? wrap(ctx, str, width) : [str];
    if (lines.length > maxLines) { lines = lines.slice(0, maxLines); lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, ' …'); }
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * size * lineHeight));
    return y + lines.length * size * lineHeight;
  }
  /** Button under a UV point (from a raycast), or null. */
  hit(uv) {
    const x = uv.x * this.canvas.width, y = (1 - uv.y) * this.canvas.height;
    return this.buttons.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) ?? null;
  }
  setHover(id) { if (id !== this.hovered) { this.hovered = id; this.render(); } }
}

export const FONTS = { SERIF, SANS };

/** The small grabber pill under a window; dragging it moves the window. */
export function makeGrabber(width = 0.12) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  roundRect(g, 8, 14, 240, 20, 10); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 48 / 256),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 50;
  mesh.userData.grabber = true;
  return mesh;
}
