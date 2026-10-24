// Pointer and keyboard input, translated into intentions. The canvas owner supplies handlers; this module knows
// gestures (drag, two-finger pinch/pan, wheel, click, hover), not mathematics.

export class PointerInput {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{
   *   classify(e): 'sky'|'orbit'|'look'|'pan',   // what a primary drag starting at this event should do
   *   secondary(e): string,                      // what a right/ctrl/alt drag starting here does
   *   drag(kind, dx, dy, e, px, py),             // dx, dy as fractions of the canvas height; px, py in pixels
   *   pinch(scale, dx, dy),                      // two fingers: zoom ratio and centroid motion
   *   wheel(factor, e),
   *   end(kind),                                 // a drag finished (not a click)
   *   click(e, shift),
   *   hover(e),                                  // mouse moved with no button down
   *   start(),                                   // any pointer went down
   * }} handlers
   */
  constructor(canvas, handlers) {
    this.canvas = canvas; this.h = handlers;
    this.pointers = new Map(); this.drag = null;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e));
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.h.wheel(Math.exp(e.deltaY * 0.0012), e); }, { passive: false });
  }
  two() {
    const [a, b] = [...this.pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  down(e) {
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.h.start();
    if (this.pointers.size === 2) { this.drag = { kind: 'two', ...this.two() }; return; }
    const kind = e.button === 2 || e.ctrlKey || e.altKey ? this.h.secondary(e) : this.h.classify(e);
    this.drag = { kind, x: e.clientX, y: e.clientY, shift: e.shiftKey, moved: 0 };
    this.canvas.classList.add('dragging');
  }
  move(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = this.drag, H = this.canvas.clientHeight;
    if (!d) { if (e.pointerType === 'mouse') this.h.hover(e); return; }
    if (d.kind === 'two') {
      if (this.pointers.size !== 2) return;
      const now = this.two();
      this.h.pinch(d.dist / Math.max(now.dist, 1), (now.cx - d.cx) / H, (now.cy - d.cy) / H);
      Object.assign(d, now);
      return;
    }
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.moved += Math.hypot(dx, dy); d.x = e.clientX; d.y = e.clientY;
    this.h.drag(d.kind, dx / H, dy / H, e, dx, dy);
  }
  up(e) {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!d) return;
    if (this.pointers.size > 0) { if (d.kind === 'two') this.drag = null; return; }
    this.drag = null;
    this.canvas.classList.remove('dragging');
    if (d.kind !== 'two' && d.moved < 6) this.h.click(e, d.shift || e.shiftKey);
    else if (d.kind !== 'two') this.h.end(d.kind);
  }
}

/** Keys held down, for continuous movement; `owns(key)` decides which keys a vantage takes over. */
export class HeldKeys {
  constructor({ owns, press }) {
    this.down = new Set();
    window.addEventListener('keydown', e => {
      if (e.target?.closest?.('input, select, textarea')) return;
      const lower = e.key.toLowerCase();
      if (owns(lower)) { this.down.add(lower); e.preventDefault(); return; }
      press(e.key);
    });
    window.addEventListener('keyup', e => this.down.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.down.clear());
  }
  held(k) { return this.down.has(k) ? 1 : 0; }
  get any() { return this.down.size > 0; }
}
