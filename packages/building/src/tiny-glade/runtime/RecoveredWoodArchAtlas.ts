/** Original wooden_arch_frame atlas: startup 0x1015231cc, grid 0x101574888,
 * position iterator 0x101a07908 / 0x1017d4780. The vertex shader wraps the
 * nine columns around its bevelled section; these are parameter coordinates,
 * not finished world-space geometry. */
export interface WoodArchAtlasMesh {
  positions: Float32Array;
  indices: Uint16Array;
}

/** Native maintain_wooden_arch_frames 0x101035bb4 chooses the smallest
 * power-of-two interval count containing the samples plus collapsed cap rows.
 * The source atlas has levels 0..5; frame publication uses levels 1..5.
 * This is curve tessellation, not the building's screen-scale LOD policy. */
export function woodArchAtlasLevel(sampleCount: number, caps: number): number {
  if (
    !Number.isSafeInteger(sampleCount) ||
    sampleCount < 2 ||
    sampleCount > 0xffffffff ||
    !Number.isInteger(caps) ||
    caps < 0 ||
    caps > 15
  )
    throw Error("Invalid wood arch atlas frame");
  const intervals = sampleCount - 1 + (caps & 1) + ((caps >>> 1) & 1);
  // The original u32 next-power-of-two overflows above 2^31 and rejects it;
  // clamping the level first would turn a failed publication into a valid mesh.
  if (intervals > 0x80000000) throw Error("Wood arch atlas interval overflow");
  return Math.max(1, Math.min(5, Math.ceil(Math.log2(intervals))));
}

/** Returns caller-owned arrays; resource caching belongs to the renderer. */
export function createWoodArchAtlasMesh(level: number): WoodArchAtlasMesh {
  if (!Number.isInteger(level) || level < 0 || level > 5) throw Error("Invalid wood arch atlas level");
  const intervals = 1 << level;
  const positions = new Float32Array((intervals + 1) * 9 * 3);
  for (let row = 0; row <= intervals; row++) {
    for (let column = 0; column <= 8; column++) {
      const offset = (row * 9 + column) * 3;
      positions[offset] = column / 8;
      positions[offset + 2] = row / intervals;
    }
  }
  const indices = new Uint16Array(intervals * 8 * 6);
  let cursor = 0;
  // Native grid recursion emits strips of four columns, each spanning all
  // rows. Keep its triangle order as well as winding and connectivity.
  for (let strip = 0; strip < 8; strip += 4) {
    for (let row = 0; row < intervals; row++) {
      for (let column = strip; column < strip + 4; column++) {
        const a = row * 9 + column;
        indices[cursor++] = a;
        indices[cursor++] = a + 1;
        indices[cursor++] = a + 9;
        indices[cursor++] = a + 9;
        indices[cursor++] = a + 1;
        indices[cursor++] = a + 10;
      }
    }
  }
  return { positions, indices };
}
