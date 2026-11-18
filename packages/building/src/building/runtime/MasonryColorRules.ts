export function masonryColorSeed(building: { id: string; seed?: number }): number {
  return building.seed ?? colorHash(building.id);
}
function colorHash(text: string, seed = 2166136261) {
  let h = seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  // Avalanche the stable identity so nearby IDs do not produce nearby colors.
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** Reorder complete source Colors, preserving each RGB tuple's hue/exposure.
 * Zero restores the source layer mapping. No synthetic color domain or RGB presets.
 */
export function masonrySourcePalette(colors: Float32Array, seed: number): Float32Array {
  if (colors.length % 4 || !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw Error("Invalid masonry source palette");
  if (!seed) return colors;
  const order = Array.from({ length: colors.length / 4 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = colorHash(String(i), seed) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Float32Array.from(order.flatMap((i) => Array.from(colors.subarray(i * 4, i * 4 + 4))));
}
