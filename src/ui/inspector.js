// The inspector card: the exact identity of a lattice point, read in words.
import * as F from '../math/forms.js';
import * as G from '../math/sl2.js';
import * as Pl from '../math/planes.js';
import { PALETTES, deltaPosition } from '../render/palette.js';
import { minus, tupleText, complexText } from './format.js';

const $ = id => document.getElementById(id);
const KIND_TEXT = {
  upper: ['a star', 'complex roots, a > 0'], lower: ['lower cone', 'complex roots, a < 0'],
  exterior: ['dust', 'two real roots'], null: ['on the cone', 'a double root'],
};
export function button(label, run) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.addEventListener('click', run);
  return b;
}

export class Inspector {
  /**
   * @param {{ state: object, actions: { lookAt(coef), showShell(k), clearPlane(), clearShell() } }} o
   */
  constructor({ state, actions }) {
    this.state = state; this.actions = actions; this.el = $('inspector');
    this.narrow = matchMedia('(max-width: 760px)');
    this.el.addEventListener('click', e => {
      if (this.narrow.matches && !e.target.closest('button')) this.el.classList.toggle('expanded');
    });
  }
  hide() { this.el.hidden = true; }
  /** Show `coef`; a preview (hover) leaves out the actions. */
  show(coef, { preview = false } = {}) {
    if (!coef) return this.hide();
    const { state } = this, [a, b, c] = coef, kind = F.kind(a, b, c), d = F.discriminant(a, b, c);
    this.el.hidden = false; this.el.classList.toggle('preview', preview);
    const p = PALETTES[state.palette];
    const swatch = kind === 'upper' ? `rgb(${p.ramp(deltaPosition(d)).map(x => Math.round(x * 255)).join(',')})` : p[kind];
    $('i-kind').innerHTML = `<span class="swatch" style="background:${swatch}"></span>${KIND_TEXT[kind].join(' · ')}`;
    $('i-poly').textContent = F.polynomialText(a, b, c);
    $('i-coef').textContent = tupleText(coef);
    $('i-delta').textContent = `Δ = ${minus(d)}`;
    $('i-root-label').textContent = kind === 'exterior' ? 'roots' : 'root';
    $('i-root').textContent = F.rootText(a, b, c);
    $('i-compact').textContent = `Δ = ${minus(d)} · ${F.rootText(a, b, c)}`;
    $('i-note').textContent = this.notes(coef, kind, d).join(' ');
    const acts = $('i-actions');
    acts.replaceChildren();
    if (!preview) {
      if (kind === 'upper' || kind === 'lower') acts.append(button('Look at it from zero', () => this.actions.lookAt(coef)));
      if (kind === 'upper') acts.append(button('Its shell', () => this.actions.showShell(-d)));
      if (state.plane) acts.append(button('Clear plane', () => this.actions.clearPlane()));
      if (state.shellK) acts.append(button('Clear shell', () => this.actions.clearShell()));
    }
    const moved = state.g.some((x, i) => Math.abs(x - G.identity[i]) > 1e-9) && d < 0;
    $('i-g-label').hidden = $('i-g').hidden = !moved;
    if (moved) $('i-g').textContent = `g·root ≈ ${complexText(G.act(state.g, F.upperRoot(a, b, c)))}`;
  }
  notes(coef, kind, d) {
    const [a, b, c] = coef, k = F.content(a, b, c), out = [];
    if (k > 1) out.push(`${k} × ${tupleText([a / k, b / k, c / k])}: same root, ${k} times farther from the origin, so ${k * k} times dimmer.`);
    if (kind === 'upper' && k === 1) {
      const h = F.reducedForms(-d).length;
      out.push(`One of ${h} SL₂(ℤ)-orbit${h > 1 ? 's' : ''} on the shell Δ = ${minus(d)}.`);
    }
    if (kind === 'exterior') out.push('Its plane is drawn: the geodesic between its roots.');
    const plane = this.state.plane;
    if (plane && kind !== 'exterior' && Pl.onPlane(plane.normal, coef)) out.push(`On the plane ${Pl.planeEquation(plane.normal)}.`);
    return out;
  }
}
