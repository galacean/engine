import layers from "./window-cuts-data";
export { default as windowCutLayers } from "./window-cuts-data";
const decoded = new Map<number, Int8Array>();
/** Shared immutable R8_SNORM samples. Negative inside, decoded distance × 0.25m. */
export function windowCutSamples(layer: number): Int8Array {
  if (!Number.isInteger(layer) || layer < 0 || layer >= layers.length) throw Error("Unknown window cut layer " + layer);
  let bytes = decoded.get(layer);
  if (!bytes) {
    const text = atob(layers[layer].samplesBase64);
    bytes = Int8Array.from(text, (c) => c.charCodeAt(0));
    decoded.set(layer, bytes);
  }
  return bytes;
}
