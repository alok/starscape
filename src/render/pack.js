// A catalogue (src/math/forms.js) as vertex attributes. Kept free of three.js so the catalogue worker can load it:
// module workers do not see the page's import map.

/** Coefficients as floats (exact below 2²⁴, far above anything a catalogue holds) and (kind, primitive) pairs. */
export function gpuArrays(L) {
  const meta = new Float32Array(2 * L.count);
  for (let i = 0; i < L.count; i++) { meta[2 * i] = L.kinds[i]; meta[2 * i + 1] = L.primitive[i]; }
  return { gpu: Float32Array.from(L.coefficients), meta };
}
