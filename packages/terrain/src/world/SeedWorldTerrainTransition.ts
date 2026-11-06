/** Maximum authored terrain transition duration accepted by the public runtime API. */
export const SEED_WORLD_TERRAIN_TRANSITION_MAXIMUM_DURATION_SECONDS = 30;

/** Default presentation duration for authored terrain edits which omit an explicit transition. */
export const SEED_WORLD_TERRAIN_TRANSITION_DEFAULT_DURATION_SECONDS = 1;

export interface SeedWorldTerrainHeightEncoding {
  readonly samples: Uint16Array;
  readonly offset: number;
  readonly scale: number;
}

/** Detached transient frames in one physical height range; persisted endpoint encodings stay unchanged. */
export function createSeedWorldTerrainHeightTransition(
  previous: SeedWorldTerrainHeightEncoding,
  next: SeedWorldTerrainHeightEncoding
) {
  if (previous.samples.length !== next.samples.length || !previous.samples.length)
    throw new RangeError("Terrain transition requires equal non-empty height grids");
  for (const source of [previous, next]) {
    if (
      !Number.isFinite(source.offset) ||
      !Number.isFinite(source.scale) ||
      source.scale <= 0 ||
      !Number.isFinite(source.offset + source.scale)
    )
      throw new RangeError("Invalid terrain height encoding");
  }
  const offset = Math.min(previous.offset, next.offset);
  const scale = Math.max(previous.offset + previous.scale, next.offset + next.scale) - offset;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Invalid terrain transition range");
  const from = new Float64Array(previous.samples.length);
  const delta = new Float64Array(from.length);
  const changed = new Uint32Array(from.length);
  const samples = new Uint16Array(from.length);
  let changedCount = 0;
  const encodeScale = 65535 / scale;
  for (let i = 0; i < from.length; i++) {
    const first = (previous.offset + (previous.samples[i] / 65535) * previous.scale - offset) * encodeScale;
    const last = (next.offset + (next.samples[i] / 65535) * next.scale - offset) * encodeScale;
    from[i] = first;
    delta[i] = last - first;
    samples[i] = Math.max(0, Math.min(65535, Math.round(first)));
    // A monotone interpolation within one quantization bucket always produces the same R16 sample.
    if (samples[i] !== Math.max(0, Math.min(65535, Math.round(last)))) changed[changedCount++] = i;
  }
  return {
    offset,
    scale,
    /** Reuses one upload buffer; callers must consume the returned frame before requesting the next. */
    frame(progress: number): Uint16Array {
      if (!Number.isFinite(progress)) throw new RangeError("Terrain transition progress must be finite");
      const p = Math.max(0, Math.min(1, progress)),
        eased = p * p * (3 - 2 * p);
      for (let index = 0; index < changedCount; index++) {
        const i = changed[index];
        samples[i] = Math.max(0, Math.min(65535, Math.round(from[i] + delta[i] * eased)));
      }
      return samples;
    }
  };
}

/**
 * Resolves an optional authored terrain transition duration.
 * @param durationSeconds Requested presentation duration in seconds; omission uses the one-second authored default.
 * @returns A finite duration in the inclusive range zero to thirty seconds.
 * @throws {RangeError} When the duration is non-finite, negative, or greater than thirty seconds.
 */
export function resolveSeedWorldTerrainTransitionDurationSeconds(durationSeconds?: number): number {
  const resolved = durationSeconds ?? SEED_WORLD_TERRAIN_TRANSITION_DEFAULT_DURATION_SECONDS;
  if (!Number.isFinite(resolved) || resolved < 0 || resolved > SEED_WORLD_TERRAIN_TRANSITION_MAXIMUM_DURATION_SECONDS) {
    throw new RangeError(
      `Seed World terrain transition duration must remain within 0-${SEED_WORLD_TERRAIN_TRANSITION_MAXIMUM_DURATION_SECONDS} seconds`
    );
  }
  return resolved;
}

/**
 * Writes one eased R16 height frame between immutable source and destination samples.
 * @param previousSamples Height samples visible before the authored transaction.
 * @param nextSamples Final height samples persisted by the authored transaction.
 * @param progress Linear transition progress in the inclusive range zero to one.
 * @param outputSamples Reusable R16 buffer receiving the interpolated frame.
 * @returns The supplied output buffer after every sample has been written.
 * @throws {RangeError} When sample lengths differ or progress is non-finite.
 */
export function interpolateSeedWorldTerrainHeightSamples(
  previousSamples: Uint16Array,
  nextSamples: Uint16Array,
  progress: number,
  outputSamples: Uint16Array
): Uint16Array {
  if (previousSamples.length !== nextSamples.length || previousSamples.length !== outputSamples.length) {
    throw new RangeError("Seed World terrain transition sample lengths must match");
  }
  if (!Number.isFinite(progress)) throw new RangeError("Seed World terrain transition progress must be finite");
  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (clampedProgress === 0) {
    outputSamples.set(previousSamples);
    return outputSamples;
  }
  if (clampedProgress === 1) {
    outputSamples.set(nextSamples);
    return outputSamples;
  }
  const easedProgress = clampedProgress * clampedProgress * (3 - 2 * clampedProgress);
  for (let index = 0; index < outputSamples.length; index++) {
    outputSamples[index] = Math.round(
      previousSamples[index]! + (nextSamples[index]! - previousSamples[index]!) * easedProgress
    );
  }
  return outputSamples;
}
