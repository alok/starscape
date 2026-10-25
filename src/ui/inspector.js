// The inspector card: the exact identity of a lattice point, read in words.
import * as F from '../math/forms.js';
import * as G from '../math/sl2.js';
import * as Pl from '../math/planes.js';
import { PALETTES, deltaPosition } from '../render/palette.js';
import { minus, tupleText, complexText } from './format.js';

const $ = id => document.getElementById(id);
/** A row of the card, hidden with its label when `text` is null. */
const row = (id, text) => {
  $(id).hidden = $(`${id}-label`).hidden = text == null;
  $(id).textContent = text ?? '';
};
const KIND_TEXT = {
  upper: ['a star', 'complex roots, a > 0'], lower: ['lower cone', 'complex roots, a < 0'],
  exterior: ['dust', 'two real roots'], null: ['on the cone', 'a double root'],
};
// Counting the orbits on Δ = −k enumerates reduced forms, O(k): a few ms at 10⁶, minutes at 10¹¹. Drawn stars
// have k ≤ 9216; only a typed or relabeled label goes past this.
const ORBIT_LIMIT = 1e6;
export function button(label, run) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = label; b.addEventListener('click', run);
  return b;
}
/**
 * The exact label to describe, as BigInts. `state.selected` is Numbers, for drawing; a relabel past 2⁵³ keeps the
 * exact label in `state.selectedExact`, which is used whenever it is the one `coef` rounds from.
 */
export function exactLabel(coef, state) {
  const x = state.selectedExact;
  return x && coef === state.selected && x.every((v, i) => Number(v) === coef[i]) ? x : coef.map(BigInt);
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
  /** Show `coef` (Numbers or BigInts); a preview (hover) leaves out the actions. */
  show(coef, { preview = false } = {}) {
    if (!coef) return this.hide();
    // Every word is computed from the exact label; the Number d only places the swatch and gates the actions.
    const { state } = this, e = exactLabel(coef, state), [a, b, c] = e, kind = F.kind(a, b, c);
    const D = F.discriminantExact(a, b, c), d = Number(D), root = F.rootText(a, b, c);
    this.el.hidden = false; this.el.classList.toggle('preview', preview);
    const p = PALETTES[state.palette];
    const swatch = kind === 'upper' ? `rgb(${p.ramp(deltaPosition(d)).map(x => Math.round(x * 255)).join(',')})` : p[kind];
    $('i-kind').innerHTML = `<span class="swatch" style="background:${swatch}"></span>${KIND_TEXT[kind].join(' · ')}`;
    $('i-poly').textContent = F.polynomialText(a, b, c);
    $('i-coef').textContent = tupleText(e);
    $('i-delta').textContent = `Δ = ${minus(D)}`;
    $('i-root-label').textContent = kind === 'exterior' ? 'roots' : 'root';
    $('i-root').textContent = root;
    // Which orbit a star is in, how deep it lies (the Stars setting bounds a + c), and a dust point's own plane.
    row('i-class', F.classText(a, b, c));
    row('i-depth', kind === 'upper' ? String(a + c) : null);
    row('i-plane', kind === 'exterior' ? Pl.planeEquation(Pl.primitiveBig(e)) : null);
    $('i-compact').textContent = `Δ = ${minus(D)} · ${root}`;
    $('i-note').textContent = this.notes(e, kind, D).join(' ');
    const acts = $('i-actions');
    acts.replaceChildren();
    if (!preview) {
      if (kind === 'upper' || kind === 'lower') acts.append(button('Look at it from zero', () => this.actions.lookAt(coef)));
      if (kind === 'upper' && -d <= ORBIT_LIMIT) acts.append(button('Its shell', () => this.actions.showShell(-d)));
      if (state.plane) acts.append(button('Clear plane', () => this.actions.clearPlane()));
      if (state.shellK) acts.append(button('Clear shell', () => this.actions.clearShell()));
    }
    const moved = state.g.some((x, i) => Math.abs(x - G.identity[i]) > 1e-9) && d < 0;
    $('i-g-label').hidden = $('i-g').hidden = !moved;
    if (moved) $('i-g').textContent = `g·root ≈ ${complexText(G.act(state.g, F.upperRoot(...e.map(Number))))}`;
  }
  /** Sentences about the exact label `coef` (BigInts) of kind `kind` and discriminant `D`. */
  notes(coef, kind, D) {
    const [a, b, c] = coef, k = F.content(a, b, c), out = [], d = Number(D);
    // Physics, not pixels: the picture dims k·f by k^(2β), which is k² only at β = 1.
    if (k > 1n) out.push(`${k} × ${tupleText([a / k, b / k, c / k])}: same ${kind === 'exterior' ? 'roots' : 'root'}, ${k} times farther from the origin, so hidden behind it; by the inverse-square law you receive 1/${k * k} of its light.`);
    if (kind === 'upper' && -d > ORBIT_LIMIT) {
      out.push(`In one of the finitely many SL₂(ℤ)-orbits of stars on Δ = ${minus(D)} (counted here only for |Δ| ≤ 10⁶).`);
    } else if (kind === 'upper') {
      // Orbits of stars on Δ = d: h(d) primitive ones, and f times each primitive orbit of discriminant d/f².
      const classes = F.shellClasses(-d), h = classes.filter(c => c.content === 1).length, n = classes.length;
      out.push(k === 1n
        ? `In one of the h(${minus(D)}) = ${h} primitive SL₂(ℤ)-orbits of stars on Δ = ${minus(D)}${n > h ? `, which has ${n} orbits counting multiples` : ''}.`
        : `In ${k} times the orbit of ${tupleText([a / k, b / k, c / k])}: one of the ${n} orbits of stars on Δ = ${minus(D)}, of which h(${minus(D)}) = ${h} are primitive.`);
    }
    const plane = this.state.plane;
    if (kind === 'exterior') {
      // A hover preview of a dust point does not draw its plane; only selecting it does.
      const [A, B, C] = (plane?.normal ?? [0, 0, 0]).map(BigInt);
      const drawn = plane && A * b - B * a === 0n && B * c - C * b === 0n && A * c - C * a === 0n;
      out.push(drawn ? 'Its plane is drawn: the geodesic between its roots.' : 'Select it to draw its plane: the geodesic between its roots.');
    }
    if (plane && kind !== 'exterior' && Pl.onPlane(plane.normal, coef)) {
      out.push(`On the plane ${Pl.planeEquation(plane.normal)}: the geodesic with ends ${F.rootText(...plane.normal)}.`);
    }
    return out;
  }
}
