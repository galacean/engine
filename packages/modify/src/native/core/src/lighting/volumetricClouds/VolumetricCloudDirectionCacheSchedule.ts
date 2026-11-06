/** One frame of the checkerboard/slice direction-cache update schedule. */
export interface VolumetricCloudDirectionCacheSchedule {
  readonly checkerParity: 0 | 1;
  readonly sliceIndex: number;
  readonly sliceCount: number;
  readonly publishAfterUpdate: boolean;
  readonly burstRefreshActive: boolean;
}

const DIRECTION_CACHE_PARITY_COUNT = 2;

interface VolumetricCloudWindOffsetLike {
  readonly x: number;
  readonly z: number;
}

interface MutableVolumetricCloudMotionLike {
  set(x: number, y: number, z: number): unknown;
}

/** Minimum temporally jittered sweeps required before the direction cache is exposed to consumers. @internal */
export const VOLUMETRIC_CLOUD_DIRECTION_CACHE_WARMUP_SWEEPS = 4;

/**
 * Use an unbiased running mean while temporal evidence is sparse, then transition
 * to the quality preset's steady exponential history weight.
 * @internal
 */
export function resolveVolumetricCloudDirectionHistoryWeight(
  accumulatedSweepCount: number,
  steadyHistoryWeight: number
): number {
  const boundedSweepCount = Math.max(0, Math.floor(accumulatedSweepCount));
  if (boundedSweepCount === 0) return 0;
  return Math.min(steadyHistoryWeight, boundedSweepCount / (boundedSweepCount + 1));
}

/**
 * Returns the previous density position relative to its current advected position.
 * Cloud density is sampled at `x - windOffset`, so a cache recorded at `displayed`
 * must be reprojected by `displayed - current` to preserve +velocity transport.
 * @internal
 */
export function resolveVolumetricCloudDirectionHistoryMotion(
  displayedWindOffsetWS: VolumetricCloudWindOffsetLike,
  currentWindOffsetWS: VolumetricCloudWindOffsetLike,
  out: MutableVolumetricCloudMotionLike
): void {
  out.set(displayedWindOffsetWS.x - currentWindOffsetWS.x, 0, displayedWindOffsetWS.z - currentWindOffsetWS.z);
}

/**
 * Spread one full direction-cache refresh over checkerboard Even/Odd pixels and 4-16 horizontal slices.
 *
 * The working cache is published only after both parities complete, so consumers
 * never observe a texture assembled from two different cloud times. Invalidated
 * histories temporarily use the burst slice count provided by the active quality preset.
 */
export function createVolumetricCloudDirectionCacheSchedule(
  frameIndex: number,
  requestedSliceCount: number,
  burstFramesRemaining: number,
  requestedBurstSliceCount = requestedSliceCount
): VolumetricCloudDirectionCacheSchedule {
  const regularSliceCount = Math.max(1, Math.floor(requestedSliceCount));
  const burstRefreshActive = burstFramesRemaining > 0;
  const burstSliceCount = Math.max(1, Math.floor(requestedBurstSliceCount));
  const sliceCount = burstRefreshActive ? Math.min(burstSliceCount, regularSliceCount) : regularSliceCount;
  const phase = positiveModulo(Math.floor(frameIndex), sliceCount * DIRECTION_CACHE_PARITY_COUNT);
  const checkerParity = phase < sliceCount ? 0 : 1;
  const sliceIndex = phase % sliceCount;
  return Object.freeze({
    checkerParity: checkerParity as 0 | 1,
    sliceIndex,
    sliceCount,
    publishAfterUpdate: checkerParity === DIRECTION_CACHE_PARITY_COUNT - 1 && sliceIndex === sliceCount - 1,
    burstRefreshActive
  });
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
