/** Bounded broad phase and deterministic overlap selection for active water bodies. */
import type { Vector3 } from "@galacean/engine-math";
import {
  createWaterSurfaceSample,
  resetWaterSurfaceSample,
  type WaterSurfaceProvider,
  type WaterSurfaceSample
} from "../query/WaterSurfaceProvider";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import { containsWaterBounds, type WaterBodyRuntime } from "./WaterBodyRuntime";
import { createWaterVolumeSample, resetWaterVolumeSample, type WaterVolumeSample } from "./WaterVolumeProvider";

const DEFAULT_MAX_CANDIDATES = 16;
const QUERY_TIMING_CAPACITY = 256;

interface RegisteredWaterBody {
  readonly body: WaterBodyRuntime;
  readonly sample: WaterSurfaceSample;
  readonly volumeSample: WaterVolumeSample;
}

export interface WaterWorldMetrics {
  readonly registeredBodyCount: number;
  readonly queryCount: number;
  readonly hitCount: number;
  readonly lastCandidateCount: number;
  readonly maximumCandidateCount: number;
  readonly lastPreciseQueryCount: number;
  readonly candidateLimitExceededCount: number;
  readonly volumeQueryCount: number;
  readonly volumeHitCount: number;
  readonly lastVolumeCandidateCount: number;
  readonly lastVolumePreciseQueryCount: number;
  readonly volumeCandidateLimitExceededCount: number;
  readonly queryP50Ms: number;
  readonly queryP95Ms: number;
}

export interface WaterWorldVolumeSample extends WaterVolumeSample {
  priority: number;
  opticalProfile?: WaterOpticalProfile;
}

export function createWaterWorldVolumeSample(): WaterWorldVolumeSample {
  return {
    ...createWaterVolumeSample(),
    priority: Number.NEGATIVE_INFINITY,
    opticalProfile: undefined
  };
}

export function resetWaterWorldVolumeSample(sample: WaterWorldVolumeSample): void {
  resetWaterVolumeSample(sample);
  sample.priority = Number.NEGATIVE_INFINITY;
  sample.opticalProfile = undefined;
}

export interface WaterWorldBodySnapshot {
  readonly id: string;
  readonly type: WaterBodyRuntime["type"];
  readonly enabled: boolean;
  readonly priority: number;
  readonly meshUploadCount: number;
  readonly drawCount: number;
  readonly triangleCount: number;
  readonly resourceBytes: number;
}

export interface WaterWorldOptions {
  readonly maxCandidates?: number;
  readonly now?: () => number;
}

export class WaterWorld implements WaterSurfaceProvider {
  private readonly _entries: RegisteredWaterBody[] = [];
  private readonly _queryTimings = new Float64Array(QUERY_TIMING_CAPACITY);
  private readonly _maxCandidates: number;
  private readonly _now: () => number;
  private _queryTimingCount = 0;
  private _queryTimingCursor = 0;
  private _queryCount = 0;
  private _hitCount = 0;
  private _lastCandidateCount = 0;
  private _maximumCandidateCount = 0;
  private _lastPreciseQueryCount = 0;
  private _candidateLimitExceededCount = 0;
  private _volumeQueryCount = 0;
  private _volumeHitCount = 0;
  private _lastVolumeCandidateCount = 0;
  private _lastVolumePreciseQueryCount = 0;
  private _volumeCandidateLimitExceededCount = 0;
  private _lastSelectedBodyId = "";

  constructor(options: WaterWorldOptions = {}) {
    this._maxCandidates = Math.max(1, Math.floor(options.maxCandidates ?? DEFAULT_MAX_CANDIDATES));
    this._now = options.now ?? (() => performance.now());
  }

  get lastSelectedBodyId(): string {
    return this._lastSelectedBodyId;
  }

  get metrics(): WaterWorldMetrics {
    const timings = Array.from(this._queryTimings.slice(0, this._queryTimingCount)).sort((a, b) => a - b);
    const percentile = (ratio: number): number =>
      timings.length === 0 ? 0 : timings[Math.min(timings.length - 1, Math.floor((timings.length - 1) * ratio))];
    return Object.freeze({
      registeredBodyCount: this._entries.length,
      queryCount: this._queryCount,
      hitCount: this._hitCount,
      lastCandidateCount: this._lastCandidateCount,
      maximumCandidateCount: this._maximumCandidateCount,
      lastPreciseQueryCount: this._lastPreciseQueryCount,
      candidateLimitExceededCount: this._candidateLimitExceededCount,
      volumeQueryCount: this._volumeQueryCount,
      volumeHitCount: this._volumeHitCount,
      lastVolumeCandidateCount: this._lastVolumeCandidateCount,
      lastVolumePreciseQueryCount: this._lastVolumePreciseQueryCount,
      volumeCandidateLimitExceededCount: this._volumeCandidateLimitExceededCount,
      queryP50Ms: percentile(0.5),
      queryP95Ms: percentile(0.95)
    });
  }

  get bodyMetrics(): readonly WaterWorldBodySnapshot[] {
    return Object.freeze(
      this._entries.map(({ body }) =>
        Object.freeze({
          id: body.id,
          type: body.type,
          enabled: body.enabled,
          priority: body.priority,
          meshUploadCount: body.metrics.meshUploadCount,
          drawCount: body.metrics.drawCount,
          triangleCount: body.metrics.triangleCount,
          resourceBytes: body.metrics.resourceBytes
        })
      )
    );
  }

  register(body: WaterBodyRuntime): void {
    if (this._entries.some((entry) => entry.body.id === body.id)) {
      throw new Error(`Water body '${body.id}' is already registered.`);
    }
    this._entries.push({ body, sample: createWaterSurfaceSample(), volumeSample: createWaterVolumeSample() });
    this._entries.sort((a, b) => b.body.priority - a.body.priority || a.body.id.localeCompare(b.body.id));
  }

  unregister(bodyId: string): boolean {
    const index = this._entries.findIndex((entry) => entry.body.id === bodyId);
    if (index < 0) return false;
    this._entries.splice(index, 1);
    if (this._lastSelectedBodyId === bodyId) this._lastSelectedBodyId = "";
    return true;
  }

  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean {
    resetWaterSurfaceSample(outSample);
    const start = this._now();
    this._queryCount++;
    this._lastCandidateCount = 0;
    this._lastPreciseQueryCount = 0;
    this._lastSelectedBodyId = "";
    let bestPriority = Number.NEGATIVE_INFINITY;
    let bestHeight = Number.NEGATIVE_INFINITY;
    let bestBodyId = "";

    for (const entry of this._entries) {
      const body = entry.body;
      if (!body.enabled || !containsWaterBounds(body.bounds, worldPosition.x, worldPosition.z)) continue;
      let excluded = false;
      for (const bounds of body.exclusionBounds) {
        if (containsWaterBounds(bounds, worldPosition.x, worldPosition.z)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;
      this._lastCandidateCount++;
      if (this._lastCandidateCount > this._maxCandidates) {
        this._candidateLimitExceededCount++;
        break;
      }
      this._lastPreciseQueryCount++;
      const candidate = entry.sample;
      if (!body.surface.sampleSurface(worldPosition, candidate)) continue;
      const candidateHeight = candidate.surfacePosition.y;
      const wins =
        body.priority > bestPriority ||
        (body.priority === bestPriority && candidateHeight > bestHeight) ||
        (body.priority === bestPriority && candidateHeight === bestHeight && body.id < bestBodyId);
      if (!wins) continue;
      bestPriority = body.priority;
      bestHeight = candidateHeight;
      bestBodyId = body.id;
      this._copySample(candidate, outSample);
      outSample.waterBodyId = body.id;
    }

    this._maximumCandidateCount = Math.max(this._maximumCandidateCount, this._lastCandidateCount);
    const duration = Math.max(0, this._now() - start);
    this._queryTimings[this._queryTimingCursor] = duration;
    this._queryTimingCursor = (this._queryTimingCursor + 1) % QUERY_TIMING_CAPACITY;
    this._queryTimingCount = Math.min(QUERY_TIMING_CAPACITY, this._queryTimingCount + 1);
    if (bestBodyId === "") return false;
    this._lastSelectedBodyId = bestBodyId;
    this._hitCount++;
    return true;
  }

  /** Selects the highest-priority water body that vertically contains the point. */
  findContainingVolume(worldPosition: Vector3, outSample: WaterWorldVolumeSample): boolean {
    resetWaterWorldVolumeSample(outSample);
    this._volumeQueryCount++;
    this._lastVolumeCandidateCount = 0;
    this._lastVolumePreciseQueryCount = 0;
    let bestPriority = Number.NEGATIVE_INFINITY;
    let bestHeight = Number.NEGATIVE_INFINITY;
    let bestBodyId = "";

    for (const entry of this._entries) {
      const body = entry.body;
      const volume = body.volume;
      if (
        !volume ||
        !body.enabled ||
        !containsWaterBounds(body.bounds, worldPosition.x, worldPosition.z) ||
        this._isExcluded(body, worldPosition.x, worldPosition.z)
      ) {
        continue;
      }
      this._lastVolumeCandidateCount++;
      if (this._lastVolumeCandidateCount > this._maxCandidates) {
        this._volumeCandidateLimitExceededCount++;
        break;
      }
      this._lastVolumePreciseQueryCount++;
      const candidate = entry.volumeSample;
      resetWaterVolumeSample(candidate);
      if (!volume.sampleVolume(worldPosition, candidate) || !candidate.insideVolume) continue;
      const wins =
        body.priority > bestPriority ||
        (body.priority === bestPriority && candidate.surfaceHeight > bestHeight) ||
        (body.priority === bestPriority && candidate.surfaceHeight === bestHeight && body.id < bestBodyId);
      if (!wins) continue;
      bestPriority = body.priority;
      bestHeight = candidate.surfaceHeight;
      bestBodyId = body.id;
      this._copyVolumeSample(candidate, outSample);
      outSample.waterBodyId = body.id;
      outSample.priority = body.priority;
      outSample.opticalProfile = body.opticalProfile;
    }

    if (bestBodyId === "") return false;
    this._volumeHitCount++;
    return true;
  }

  /** Samples one registered body even just above its surface for controller hysteresis. */
  sampleBodyVolume(bodyId: string, worldPosition: Vector3, outSample: WaterWorldVolumeSample): boolean {
    resetWaterWorldVolumeSample(outSample);
    this._volumeQueryCount++;
    let entry: RegisteredWaterBody | undefined;
    for (let index = 0; index < this._entries.length; index++) {
      const candidate = this._entries[index];
      if (candidate.body.id === bodyId) {
        entry = candidate;
        break;
      }
    }
    if (!entry) return false;
    const body = entry.body;
    const volume = body.volume;
    if (
      !volume ||
      !body.enabled ||
      !containsWaterBounds(body.bounds, worldPosition.x, worldPosition.z) ||
      this._isExcluded(body, worldPosition.x, worldPosition.z)
    ) {
      return false;
    }
    const candidate = entry.volumeSample;
    resetWaterVolumeSample(candidate);
    if (!volume.sampleVolume(worldPosition, candidate)) return false;
    this._copyVolumeSample(candidate, outSample);
    outSample.waterBodyId = body.id;
    outSample.priority = body.priority;
    outSample.opticalProfile = body.opticalProfile;
    return true;
  }

  destroy(): void {
    this._entries.length = 0;
    this._lastSelectedBodyId = "";
  }

  private _copySample(source: WaterSurfaceSample, target: WaterSurfaceSample): void {
    target.waterBodyId = source.waterBodyId;
    target.surfacePosition.copyFrom(source.surfacePosition);
    target.surfaceNormal.copyFrom(source.surfaceNormal);
    target.waterVelocity.copyFrom(source.waterVelocity);
    target.waterDepth = source.waterDepth;
  }

  private _copyVolumeSample(source: WaterVolumeSample, target: WaterVolumeSample): void {
    target.waterBodyId = source.waterBodyId;
    target.insideFootprint = source.insideFootprint;
    target.insideVolume = source.insideVolume;
    target.surfaceHeight = source.surfaceHeight;
    target.bottomHeight = source.bottomHeight;
    target.signedSurfaceDistance = source.signedSurfaceDistance;
    target.submergedDepth = source.submergedDepth;
    target.waterDepth = source.waterDepth;
  }

  private _isExcluded(body: WaterBodyRuntime, worldX: number, worldZ: number): boolean {
    for (const bounds of body.exclusionBounds) {
      if (containsWaterBounds(bounds, worldX, worldZ)) return true;
    }
    return false;
  }
}
