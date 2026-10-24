// The Inside HUD: where you are in H², where your heading ends, the L/R turns you have made, and the Flatland
// retina (shown when your eye is in the plane).
import * as G from '../math/sl2.js';
import * as Mo from '../math/models.js';
import { CuttingSequence, flatlandRetina } from '../math/flatland.js';
import { PALETTES, deltaPosition } from '../render/palette.js';
import { minus, complexText, continuedFraction, continuedFractionText } from './format.js';

const $ = id => document.getElementById(id);
const RETINA_WIDTH = 720;

export class InsideHud {
  /** `heading()` gives your facing direction in the plane's own coordinates (standard orientation). */
  constructor({ state, rig, stars, heading }) {
    Object.assign(this, { state, rig, stars, heading });
    this.cutting = new CuttingSequence();
    this.retina = $('retina'); this.ctx = this.retina.getContext('2d');
    this.lastText = ''; this.lastRetina = '';
  }
  show(on) {
    $('inside-hud').hidden = !on;
    if (!on) this.retina.hidden = $('retina-caption').hidden = true;
  }
  reset() { this.cutting.reset(); this.lastText = ''; }
  eyeLabel() {
    const h = this.rig.inside.eye;
    $('eye-v').textContent = h < 0.12 ? 'in the plane' : h < 1.2 ? 'crouching' : h < 2.6 ? 'standing' : 'above';
    this.lastRetina = '';
  }

  /** Call each rendered frame while inside. */
  update() {
    const { state, rig } = this, g = state.g;
    const here = G.act(G.inverse(g), { x: 0, y: 1 });
    const [hx, hz] = this.heading(), heading = Math.atan2(hz, hx);
    // In the standard orientation your left is your heading turned a quarter counterclockwise: (−h_v, h_u).
    const leftOf = t => {
      const [bu, bv] = Mo.boundaryPoint(G.actReal(g, t));
      return -bu * hz + bv * hx > 0;
    };
    this.cutting.update(here, leftOf);
    // The rim point straight ahead, pulled back to the base picture: where this geodesic ends.
    const u = Math.cos(heading), v = Math.sin(heading);
    const xi = G.actReal(G.inverse(g), v >= 1 - 1e-12 ? Infinity : u / (1 - v));
    const key = `${complexText(here, 4)}|${heading.toFixed(3)}|${this.cutting.letters.length}`;
    if (key !== this.lastText) {
      this.lastText = key;
      $('h-here').textContent = `${complexText(here)}  ·  ${G.hyperbolicDistance(here, { x: 0, y: 1 }).toFixed(2)} from i`;
      $('h-heading').textContent = Number.isFinite(xi) ? `${minus(xi.toFixed(5))} = ${continuedFractionText(continuedFraction(xi))}` : '∞';
      $('h-turns').textContent = this.cutting.runs().map(r => r.ch + (r.n > 1 ? r.n : '')).join(' ') || 'walk across a line';
    }
    this.updateRetina(heading);
  }

  /** One pixel per direction, recomputed only when you move or turn. */
  updateRetina(heading) {
    const inPlane = this.rig.inside.eye < 0.12;
    this.retina.hidden = $('retina-caption').hidden = !inPlane;
    if (!inPlane) return;
    const key = this.state.g.map(x => x.toFixed(6)).join() + heading.toFixed(4) + this.state.palette;
    if (key === this.lastRetina) return;
    this.lastRetina = key;
    const ramp = PALETTES[this.state.palette].ramp, W = RETINA_WIDTH;
    const view = flatlandRetina(this.stars, this.state.g, { width: W, r0: 0.18, palette: d => ramp(deltaPosition(d)) });
    this.retina.width = W; this.retina.height = 1;
    const img = this.ctx.createImageData(W, 1);
    for (let x = 0; x < W; x++) {
      // Column x looks toward heading − φ, φ = 0 in the middle: left of center is counterclockwise of your
      // heading, which is your left. Retina bin k covers the directions [2πk/W, 2π(k+1)/W).
      const theta = heading - ((x + 0.5) / W - 0.5) * 2 * Math.PI;
      const k = ((Math.floor((theta / (2 * Math.PI)) * W) % W) + W) % W;
      for (let c = 0; c < 3; c++) img.data[4 * x + c] = Math.min(255, 255 * view.color[3 * k + c]);
      img.data[4 * x + 3] = 255;
    }
    this.ctx.putImageData(img, 0, 0);
  }
}
