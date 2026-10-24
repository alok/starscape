// The browser's exact arithmetic agrees with the Lean definitions (lean/Starscape/*.lean), whose properties are
// kernel-checked there. Regenerate the data with `cd lean && lake exe starscape-bridge`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../src/math/forms.js';
import * as G from '../src/math/sl2.js';
import * as P from '../src/math/planes.js';

const lean = JSON.parse(readFileSync(new URL('../data/lean-bridge.json', import.meta.url), 'utf8'));

test('lattice counts match Lean', () => {
  assert.equal(F.buildLattice({ ball: 6, depth: 0 }).count, lean.ball6);
  for (const [d, n] of Object.entries(lean.stars)) assert.equal(F.starCount(Number(d)), n, `depth ${d}`);
});

test('reduced forms and class numbers match Lean for every |Δ| < 400', () => {
  for (const { k, h, reduced } of lean.classes) {
    const ours = F.reducedForms(k);
    assert.equal(ours.length, h, `h(−${k})`);
    assert.deepEqual(ours, reduced, `reduced forms of −${k}`);
  }
});

test('ρ(g) on integer forms matches Lean exactly', () => {
  for (const { g, form, image } of lean.images) {
    const det = g[0] * g[3] - g[1] * g[2];
    // pushforwardExact is defined for SL₂(ℤ); for other integer g use the row formula directly.
    const ours = det === 1 ? G.pushforwardExact(g, form).map(Number) : G.apply3(G.pushforward(g), form);
    assert.deepEqual(ours, image, `ρ(${g}) (${form})`);
  }
});

test('pair planes match Lean up to the primitive normal', () => {
  for (const { first, second, normal } of lean.pairs) {
    const plane = P.planeThrough(first, second);
    const g = F.content(...normal), sign = normal.find(x => x) < 0 ? -1 : 1;
    assert.deepEqual(plane.normal, normal.map(x => (sign * x) / g + 0));
  }
});
