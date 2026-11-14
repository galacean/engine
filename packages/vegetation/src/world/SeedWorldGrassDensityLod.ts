/** Retained fraction, smoothly decreasing from 100% at the camera to 20% at the original draw limit. */
export function grassDensityLodFraction(distance: number, maximumDistance: number): number {
  const t = Math.max(0, Math.min(1, distance / Math.max(maximumDistance, 0.001)));
  return 1 - 0.8 * t * t * (3 - 2 * t);
}

/** Distributes stable prefixes over an entire patch, without changing any transform or population count. */
export function shuffleGrassDensityRecords(records: Float32Array, count: number, stride: number): void {
  advanceGrassDensityShuffle(records, stride, createGrassDensityShuffle(count), count);
}

export interface GrassDensityShuffle {
  index: number;
  seed: number;
}

export function createGrassDensityShuffle(count: number): GrassDensityShuffle {
  return { index: count - 1, seed: 0x6d2b79f5 };
}

/** Resumable Fisher-Yates, retaining the exact bulk order regardless of slice boundaries. */
export function advanceGrassDensityShuffle(
  records: Float32Array,
  stride: number,
  state: GrassDensityShuffle,
  maximumRecords: number
): boolean {
  const end = Math.max(0, state.index - maximumRecords);
  for (; state.index > end; state.index--) {
    const i = state.index;
    state.seed ^= state.seed << 13;
    state.seed ^= state.seed >>> 17;
    state.seed ^= state.seed << 5;
    const j = (state.seed >>> 0) % (i + 1);
    for (let k = 0; k < stride; k++) {
      const a = i * stride + k,
        b = j * stride + k;
      const value = records[a]!;
      records[a] = records[b]!;
      records[b] = value;
    }
  }
  return state.index <= 0;
}
