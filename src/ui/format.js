// Text for numbers, matrices and tuples, with true minus signs. No DOM.

export const minus = s => String(s).replaceAll('-', '−');
/** An integer stays exact; anything else gets two decimals. */
export const num = (x, digits = 2) => {
  const r = Math.round(x);
  return minus(Math.abs(x - r) < 1e-9 ? r : x.toFixed(digits));
};
export const matrixText = g => `[${num(g[0])} ${num(g[1])}; ${num(g[2])} ${num(g[3])}]`;
export const tupleText = t => `(${minus(t.join(', '))})`;
/** A point of the upper half-plane as "x + yi". */
export const complexText = (z, digits = 3) => `${minus(z.x.toFixed(digits))} ${z.y >= 0 ? '+' : '−'} ${Math.abs(z.y).toFixed(digits)}i`;

/** The continued fraction [a0; a1, …] of x, up to n terms. */
export function continuedFraction(x, n = 7) {
  const out = [];
  for (let i = 0; i < n && Number.isFinite(x); i++) {
    const a = Math.floor(x);
    out.push(a);
    const f = x - a;
    if (f < 1e-9) break;
    x = 1 / f;
  }
  return out;
}
export const continuedFractionText = (a, n = 7) =>
  a.length ? `[${minus(a[0])}${a.length > 1 ? '; ' + a.slice(1).join(', ') : ''}${a.length >= n ? ', …' : ''}]` : '';
