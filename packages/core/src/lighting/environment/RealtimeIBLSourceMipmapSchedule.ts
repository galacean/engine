const CUBEMAP_FACE_COUNT = 6;
const PASSES_PER_MIP = 2;

/** @internal */
export interface RealtimeIBLSourceMipmapScheduleOptions {
  readonly resolution: number;
  readonly mipCount: number;
  readonly maximumDrawCount: number;
}

/** @internal */
export interface RealtimeIBLSourceMipmapFrame {
  readonly mips: readonly number[];
  readonly estimatedTexelWork: number;
  readonly estimatedDrawCount: number;
}

/**
 * Packs dependent source mips into ordered frames without exceeding the first mip's texel work or a draw budget.
 *
 * @internal
 */
export function createRealtimeIBLSourceMipmapSchedule(
  options: RealtimeIBLSourceMipmapScheduleOptions
): readonly RealtimeIBLSourceMipmapFrame[] {
  const { resolution, mipCount, maximumDrawCount } = options;
  const drawCountPerMip = CUBEMAP_FACE_COUNT * PASSES_PER_MIP;
  if (mipCount <= 1) {
    return [];
  }
  if (!Number.isInteger(maximumDrawCount) || maximumDrawCount < drawCountPerMip) {
    throw new RangeError(`Realtime IBL source mip draw budget must be at least ${drawCountPerMip}.`);
  }

  const maximumTexelWork = estimateTexelWork(resolution, 1);
  const frames: RealtimeIBLSourceMipmapFrame[] = [];
  let mips: number[] = [];
  let estimatedTexelWork = 0;
  let estimatedDrawCount = 0;

  const flush = (): void => {
    if (mips.length === 0) {
      return;
    }
    frames.push({ mips, estimatedTexelWork, estimatedDrawCount });
    mips = [];
    estimatedTexelWork = 0;
    estimatedDrawCount = 0;
  };

  for (let mip = 1; mip < mipCount; mip++) {
    const texelWork = estimateTexelWork(resolution, mip);
    if (
      mips.length > 0 &&
      (estimatedTexelWork + texelWork > maximumTexelWork || estimatedDrawCount + drawCountPerMip > maximumDrawCount)
    ) {
      flush();
    }
    mips.push(mip);
    estimatedTexelWork += texelWork;
    estimatedDrawCount += drawCountPerMip;
  }
  flush();
  return frames;
}

function estimateTexelWork(resolution: number, mip: number): number {
  const mipResolution = Math.max(1, Math.floor(resolution / 2 ** mip));
  return mipResolution * mipResolution * CUBEMAP_FACE_COUNT * PASSES_PER_MIP;
}
