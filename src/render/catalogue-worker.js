// Enumerates the star catalogue off the main thread (see StarField.rebase), so re-centering the sky while it is
// dragged never costs a frame. The arrays are transferred, not copied, and arrive packed for the GPU.
import { catalogue } from '../math/forms.js';
import { gpuArrays } from './pack.js';

self.onmessage = ({ data: { id, x, y, depth, ball } }) => {
  const L = catalogue({ x, y, depth, ball }), { gpu, meta } = gpuArrays(L);
  self.postMessage({ id, ...L, gpu, meta }, [L.coefficients.buffer, L.kinds.buffer, L.primitive.buffer, gpu.buffer, meta.buffer]);
};
