/**
 * Hashes one deterministic generation stage into an unsigned 32-bit value.
 * @param seed Root or parent seed.
 * @param values Integer stage identifiers or world-cell coordinates.
 * @returns Unsigned 32-bit hash shared by generation stages.
 */
export function hashPromptNoise(seed: number, ...values: readonly number[]): number {
  let hash = seed >>> 0;
  for (const value of values) {
    hash ^= Math.imul(value | 0, 0x9e3779b9) >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x7feb352d) >>> 0;
    hash ^= hash >>> 15;
    hash = Math.imul(hash, 0x846ca68b) >>> 0;
    hash ^= hash >>> 16;
  }
  return hash >>> 0;
}

/**
 * Converts the low 24 hash bits into a stable unit interval value.
 * @param hash Unsigned hash value.
 * @returns Inclusive value in `[0, 1]` matching the GLSL implementation.
 */
export function promptNoiseUnit(hash: number): number {
  return (hash & 0x00ff_ffff) / 0x00ff_ffff;
}
