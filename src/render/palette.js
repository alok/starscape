// Star colors. Upper-interior stars are colored by |Δ| on Stange's fixed logarithmic range 3…240, so a given
// discriminant has one color everywhere. Palettes are sampled into a 256×1 texture for the shader.
import * as THREE from 'three';

export const DELTA_RANGE = [3, 240];

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const toLinear = x => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const toGamma = x => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const clamp01 = x => Math.min(1, Math.max(0, x));
function oklab(rgb) {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map(x => clamp01(toGamma(clamp01(x))));
}
const ramp = stops => t => {
  const labs = stops.map(s => oklab(hex(s)));
  const x = clamp01(t) * (labs.length - 1), i = Math.min(labs.length - 2, Math.floor(x)), f = x - i;
  return fromOklab(labs[i].map((v, j) => v * (1 - f) + labs[i + 1][j] * f));
};

// The visible spectrum, from the CIE 1931 colour-matching functions (Wyman, Sloan and Shirley's analytic fit),
// pushed into sRGB by adding just enough white and normalized to full value: hue only, since brightness is
// carried separately by the weight.
const lobe = (l, mu, s1, s2) => Math.exp(-0.5 * ((l - mu) / (l < mu ? s1 : s2)) ** 2);
export function wavelengthRGB(nm) {
  const X = 1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2);
  const Y = 0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1);
  const Z = 1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8);
  let rgb = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  const lift = Math.max(0, -Math.min(...rgb));
  rgb = rgb.map(c => c + lift);
  const top = Math.max(...rgb, 1e-9);
  rgb = rgb.map(c => c / top);
  // Equal luminance, so violet does not read as dim: darker hues are lifted toward white, lighter ones scaled down.
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2], target = 0.42;
  rgb = lum < target ? rgb.map(c => c + ((target - lum) / (1 - lum)) * (1 - c)) : rgb.map(c => (c * target) / lum);
  return rgb.map(c => clamp01(toGamma(c)));
}
/** A star's weight read as photon energy: t = 0 (the simplest numbers, most energy) is violet, t = 1 is red. */
export const SPECTRUM_NM = [400, 690];
const spectrum = t => {
  const [v, r] = SPECTRUM_NM, inv = 1 / r + (1 / v - 1 / r) * (1 - clamp01(t));
  return wavelengthRGB(1 / inv);
};

/**
 * Each palette: a ramp for upper-interior stars (t = 0 is the smallest |Δ|) and flat colors for the other kinds.
 * 'starlight' runs like stellar temperature, hot blue-white for the simplest numbers to ember for the most
 * complex, so color and brightness tell the same story. 'stange' interpolates her six anchors in OKLab.
 */
export const PALETTES = {
  spectrum: {
    label: 'Spectrum (weight as energy)',
    ramp: spectrum,
    // The light cone (double roots) is white light; real-root dust is a cool gray.
    exterior: '#6b7894', null: '#f4f5ff', lower: '#77708a',
  },
  starlight: {
    label: 'Starlight',
    ramp: ramp(['#e9f1ff', '#bcd4ff', '#fff4e0', '#ffd08a', '#ff9f5a', '#e2604f', '#a8466e']),
    exterior: '#5f7396', null: '#8ef0d2', lower: '#7a6f8c',
  },
  stange: {
    label: 'Stange anchors',
    ramp: ramp(['#F06A6A', '#E99456', '#D6BD69', '#7AB89B', '#70A6D8', '#AD92D0']),
    exterior: '#448abb', null: '#d6bd69', lower: '#64717d',
  },
  aurora: {
    label: 'Aurora',
    ramp: ramp(['#f2fbff', '#9ff0e0', '#5ad1c8', '#4a9fe0', '#6a6ee8', '#8e4fc9', '#6a2e8f']),
    exterior: '#6d7a99', null: '#ffe08a', lower: '#5d6577',
  },
};

export const deltaPosition = d => clamp01(Math.log(Math.abs(d) / DELTA_RANGE[0]) / Math.log(DELTA_RANGE[1] / DELTA_RANGE[0]));

export function paletteTexture(name) {
  const p = PALETTES[name] ?? PALETTES.spectrum, n = 256, data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = p.ramp(i / (n - 1));
    data.set([...c.map(x => Math.round(x * 255)), 255], 4 * i);
  }
  // The star shader writes its color straight to the sRGB canvas, as Stange's does, with no output encoding (one
  // would have to come before the additive blend). So the ramp must reach it still sRGB-encoded: NoColorSpace stops
  // the GPU decoding it to linear on sampling, which drew every star darker and more saturated than its palette.
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}
/** The flat colors of the other kinds, as raw sRGB values for the same reason (Color(hex) would linearize them). */
export const kindColors = name => {
  const p = PALETTES[name] ?? PALETTES.spectrum;
  return ['ramp', p.lower, p.exterior, p.null].map(h => (h === 'ramp' ? new THREE.Color(1, 1, 1) : new THREE.Color(...hex(h))));
};
export function gradientCSS(name) {
  const p = PALETTES[name] ?? PALETTES.spectrum;
  const stops = Array.from({ length: 13 }, (_, i) => `rgb(${p.ramp(i / 12).map(x => Math.round(x * 255)).join(' ')}) ${(i * 100) / 12}%`);
  return `linear-gradient(90deg, ${stops.join(',')})`;
}
