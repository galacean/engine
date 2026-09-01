const CUBEMAP_FACE_COUNT = 6;

/** @internal */
export interface RealtimeIBLPrefilterScheduleOptions {
  readonly resolution: number;
  readonly mipCount: number;
  readonly sampleCount: number;
  readonly sampleBatchSize: number;
  readonly frameCount: number;
}

/** @internal */
export interface RealtimeIBLPrefilterWorkItem {
  readonly face: number;
  readonly mip: number;
  readonly batchIndex: number;
  readonly resolveSurface: boolean;
  readonly estimatedSampleWork: number;
  readonly estimatedDrawCount: number;
}

/** @internal */
export interface RealtimeIBLPrefilterFrame {
  readonly items: readonly RealtimeIBLPrefilterWorkItem[];
  readonly estimatedSampleWork: number;
  readonly estimatedDrawCount: number;
}

interface MutablePrefilterFrame {
  items: RealtimeIBLPrefilterWorkItem[];
  estimatedSampleWork: number;
  estimatedDrawCount: number;
}

interface CandidateScore {
  frameIndices: readonly number[];
  maxNormalizedLoad: number;
  squaredNormalizedLoad: number;
  maxSampleWorkRatio: number;
  maxDrawCountRatio: number;
}

/**
 * Build a deterministic GGX schedule that balances texel/sample work and draw count across frames.
 *
 * @internal
 */
export function createRealtimeIBLPrefilterSchedule(
  options: RealtimeIBLPrefilterScheduleOptions
): readonly RealtimeIBLPrefilterFrame[] {
  const { resolution, mipCount, sampleCount, sampleBatchSize, frameCount } = options;
  const batchesPerSurface = sampleCount / sampleBatchSize;
  const surfaceWorkItems: RealtimeIBLPrefilterWorkItem[][] = [];
  let totalSampleWork = 0;
  let totalDrawCount = 0;

  for (let mip = 1; mip < mipCount; mip++) {
    const mipResolution = Math.max(1, Math.floor(resolution / 2 ** mip));
    const texelCount = mipResolution * mipResolution;
    for (let face = 0; face < CUBEMAP_FACE_COUNT; face++) {
      const items: RealtimeIBLPrefilterWorkItem[] = [];
      for (let batchIndex = 0; batchIndex < batchesPerSurface; batchIndex++) {
        const resolveSurface = batchIndex === batchesPerSurface - 1;
        const estimatedSampleWork = texelCount * (sampleBatchSize + (resolveSurface ? 1 : 0));
        const estimatedDrawCount = resolveSurface ? 2 : 1;
        items.push({ face, mip, batchIndex, resolveSurface, estimatedSampleWork, estimatedDrawCount });
        totalSampleWork += estimatedSampleWork;
        totalDrawCount += estimatedDrawCount;
      }
      surfaceWorkItems.push(items);
    }
  }

  const frames: MutablePrefilterFrame[] = Array.from({ length: frameCount }, () => ({
    items: [],
    estimatedSampleWork: 0,
    estimatedDrawCount: 0
  }));
  const idealSampleWork = totalSampleWork / frameCount;
  const idealDrawCount = totalDrawCount / frameCount;

  // Expensive surfaces are placed first. Each surface keeps nondecreasing frame indices, so its accumulation
  // batches remain ordered while independent faces and mips fill the lightest frames
  for (let surfaceIndex = 0; surfaceIndex < surfaceWorkItems.length; surfaceIndex++) {
    const items = surfaceWorkItems[surfaceIndex];
    const frameIndices = findBestFrameIndices(frames, items, idealSampleWork, idealDrawCount);
    applyAssignment(frames, items, frameIndices);
  }

  return frames;
}

function findBestFrameIndices(
  frames: readonly MutablePrefilterFrame[],
  items: readonly RealtimeIBLPrefilterWorkItem[],
  idealSampleWork: number,
  idealDrawCount: number
): readonly number[] {
  if (items.length <= 4) {
    const frameIndices = new Array<number>(items.length);
    let bestScore: CandidateScore | null = null;
    const search = (itemIndex: number, minimumFrame: number): void => {
      if (itemIndex === items.length) {
        const score = scoreAssignment(frames, items, frameIndices, idealSampleWork, idealDrawCount);
        if (!bestScore || isBetterScore(score, bestScore)) {
          bestScore = score;
        }
        return;
      }
      for (let frameIndex = minimumFrame; frameIndex < frames.length; frameIndex++) {
        frameIndices[itemIndex] = frameIndex;
        search(itemIndex + 1, frameIndex);
      }
    };
    search(0, 0);
    return bestScore!.frameIndices;
  }

  const frameIndices = new Array<number>(items.length);
  let minimumFrame = 0;
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    let bestScore: CandidateScore | null = null;
    for (let frameIndex = minimumFrame; frameIndex < frames.length; frameIndex++) {
      frameIndices[itemIndex] = frameIndex;
      const score = scoreAssignment(
        frames,
        items.slice(0, itemIndex + 1),
        frameIndices.slice(0, itemIndex + 1),
        idealSampleWork,
        idealDrawCount
      );
      if (!bestScore || isBetterScore(score, bestScore)) {
        bestScore = score;
      }
    }
    frameIndices[itemIndex] = bestScore!.frameIndices[itemIndex];
    minimumFrame = frameIndices[itemIndex];
  }
  return frameIndices;
}

function scoreAssignment(
  frames: readonly MutablePrefilterFrame[],
  items: readonly RealtimeIBLPrefilterWorkItem[],
  frameIndices: readonly number[],
  idealSampleWork: number,
  idealDrawCount: number
): CandidateScore {
  const addedSampleWork = new Array<number>(frames.length).fill(0);
  const addedDrawCount = new Array<number>(frames.length).fill(0);
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const frameIndex = frameIndices[itemIndex];
    addedSampleWork[frameIndex] += items[itemIndex].estimatedSampleWork;
    addedDrawCount[frameIndex] += items[itemIndex].estimatedDrawCount;
  }

  let maxNormalizedLoad = 0;
  let squaredNormalizedLoad = 0;
  let maxSampleWorkRatio = 0;
  let maxDrawCountRatio = 0;

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
    const frame = frames[frameIndex];
    const sampleWorkRatio = (frame.estimatedSampleWork + addedSampleWork[frameIndex]) / idealSampleWork;
    const drawCountRatio = (frame.estimatedDrawCount + addedDrawCount[frameIndex]) / idealDrawCount;
    const normalizedLoad = Math.max(sampleWorkRatio, drawCountRatio);
    maxNormalizedLoad = Math.max(maxNormalizedLoad, normalizedLoad);
    squaredNormalizedLoad += sampleWorkRatio * sampleWorkRatio + drawCountRatio * drawCountRatio;
    maxSampleWorkRatio = Math.max(maxSampleWorkRatio, sampleWorkRatio);
    maxDrawCountRatio = Math.max(maxDrawCountRatio, drawCountRatio);
  }

  return {
    frameIndices: frameIndices.slice(),
    maxNormalizedLoad,
    squaredNormalizedLoad,
    maxSampleWorkRatio,
    maxDrawCountRatio
  };
}

function isBetterScore(candidate: CandidateScore, current: CandidateScore): boolean {
  const candidateValues = [
    candidate.maxNormalizedLoad,
    candidate.squaredNormalizedLoad,
    candidate.maxSampleWorkRatio,
    candidate.maxDrawCountRatio,
    ...candidate.frameIndices
  ];
  const currentValues = [
    current.maxNormalizedLoad,
    current.squaredNormalizedLoad,
    current.maxSampleWorkRatio,
    current.maxDrawCountRatio,
    ...current.frameIndices
  ];
  for (let i = 0; i < candidateValues.length; i++) {
    if (candidateValues[i] !== currentValues[i]) {
      return candidateValues[i] < currentValues[i];
    }
  }
  return false;
}

function applyAssignment(
  frames: MutablePrefilterFrame[],
  items: readonly RealtimeIBLPrefilterWorkItem[],
  frameIndices: readonly number[]
): void {
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const frame = frames[frameIndices[itemIndex]];
    frame.items.push(item);
    frame.estimatedSampleWork += item.estimatedSampleWork;
    frame.estimatedDrawCount += item.estimatedDrawCount;
  }
}
