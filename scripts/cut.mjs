// A highlights cut of a rendered film: chosen spans of it, joined by short crossfades, re-encoded once.
//
//   node scripts/cut.mjs starscape-tour.mp4 starscape-highlights.mp4 [--fade 0.4]
//
// The spans are times in scripts/reel.mjs, chosen inside caption windows so no caption is cut mid-fade.
import { spawn } from 'node:child_process';

const SPANS = [
  [0.8, 5.6],      // title over the sky from the origin
  [22.6, 30.6],    // II: a star in the lattice, then its root in the pane
  [34.2, 39.8],    // III: standing at the origin
  [51.4, 59.2],    // IV: step outside; the stars lie on the Klein disk
  [67.4, 73.4],    // V: the half-plane, seen from below
  [76.0, 84.6],    // V: Ford circles
  [88.2, 101.2],   // VI: drag the sky, let go, it lands on the lattice; then T and S
  [104.8, 111.2],  // VIII: a necklace through two stars
  [113.8, 125.6],  // IX: inside, a step, then a Flatlander
  [127.0, 133.5],  // end card
];

const args = process.argv.slice(2);
const [input, output] = args;
const fadeAt = args.indexOf('--fade');
const fade = fadeAt < 0 ? 0.4 : Number(args[fadeAt + 1]);
if (!input || !output) throw new Error('usage: node scripts/cut.mjs in.mp4 out.mp4 [--fade s]');

const parts = SPANS.map(([a, b], i) => `[0:v]trim=${a}:${b},setpts=PTS-STARTPTS[s${i}]`);
let last = 's0', length = SPANS[0][1] - SPANS[0][0];
for (let i = 1; i < SPANS.length; i++) {
  const out = i === SPANS.length - 1 ? 'v' : `x${i}`;
  parts.push(`[${last}][s${i}]xfade=transition=fade:duration=${fade}:offset=${(length - fade).toFixed(3)}[${out}]`);
  length += SPANS[i][1] - SPANS[i][0] - fade;
  last = out;
}
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-filter_complex', parts.join(';'), '-map', '[v]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', output], { stdio: 'inherit' });
ff.on('close', code => {
  if (code) process.exit(code);
  console.log(`${output}: ${length.toFixed(1)} s from ${SPANS.length} spans`);
});
