import { Vector3 } from "@galacean/engine-math";

/** Caller-owned world-space sample populated by a {@link WaterSurfaceProvider}. */
export interface WaterSurfaceSample {
  waterBodyId: string;
  surfacePosition: Vector3;
  surfaceNormal: Vector3;
  waterVelocity: Vector3;
  waterDepth: number;
}

/** Bit flags explaining why a query could not use its ideal path. */
export enum WaterSurfaceQueryFallback {
  None = 0,
  OutsideFootprint = 1 << 0,
  NonConverged = 1 << 1,
  CandidateLimit = 1 << 2,
  Unsupported = 1 << 3
}

/** Caller-owned status for inverse/fallback diagnostics. */
export interface WaterSurfaceQueryStatus {
  hit: boolean;
  converged: boolean;
  iterations: number;
  horizontalError: number;
  capabilityFallback: number;
}

/** Caller-owned structure-of-arrays output for allocation-free batch queries. */
export interface WaterSurfaceBatchOutput {
  readonly hits: Uint8Array;
  readonly converged: Uint8Array;
  readonly iterations: Uint8Array;
  readonly capabilityFallbacks: Uint8Array;
  readonly horizontalErrors: Float32Array;
  readonly surfacePositions: Float32Array;
  readonly surfaceNormals: Float32Array;
  readonly waterVelocities: Float32Array;
  readonly waterDepths: Float32Array;
  readonly waterBodyIds: string[];
}

/** Internal contract for querying a water body's current visible macro surface. */
export interface WaterSurfaceProvider {
  /**
   * Returns true only when the query's horizontal projection is inside the
   * provider's actual water footprint and all fields in `outSample` are valid.
   */
  sampleSurface(worldPosition: Vector3, outSample: WaterSurfaceSample): boolean;
}

/** Optional extension implemented by providers with a native allocation-free batch path. */
export interface BatchWaterSurfaceProvider extends WaterSurfaceProvider {
  sampleSurfaceBatch(positions: Float32Array, out: WaterSurfaceBatchOutput): number;
}

/** Creates storage for repeated allocation-free water-surface queries. */
export function createWaterSurfaceSample(): WaterSurfaceSample {
  return {
    waterBodyId: "",
    surfacePosition: new Vector3(),
    surfaceNormal: new Vector3(0, 1, 0),
    waterVelocity: new Vector3(),
    waterDepth: 0
  };
}

export function createWaterSurfaceQueryStatus(): WaterSurfaceQueryStatus {
  return {
    hit: false,
    converged: false,
    iterations: 0,
    horizontalError: Number.POSITIVE_INFINITY,
    capabilityFallback: WaterSurfaceQueryFallback.None
  };
}

export function createWaterSurfaceBatchOutput(capacity: number): WaterSurfaceBatchOutput {
  const safeCapacity = Math.max(0, Math.floor(capacity));
  return {
    hits: new Uint8Array(safeCapacity),
    converged: new Uint8Array(safeCapacity),
    iterations: new Uint8Array(safeCapacity),
    capabilityFallbacks: new Uint8Array(safeCapacity),
    horizontalErrors: new Float32Array(safeCapacity),
    surfacePositions: new Float32Array(safeCapacity * 3),
    surfaceNormals: new Float32Array(safeCapacity * 3),
    waterVelocities: new Float32Array(safeCapacity * 3),
    waterDepths: new Float32Array(safeCapacity),
    waterBodyIds: Array.from({ length: safeCapacity }, () => "")
  };
}

/** Restores a caller-owned sample without replacing its vector instances. */
export function resetWaterSurfaceSample(sample: WaterSurfaceSample): void {
  sample.waterBodyId = "";
  sample.surfacePosition.set(0, 0, 0);
  sample.surfaceNormal.set(0, 1, 0);
  sample.waterVelocity.set(0, 0, 0);
  sample.waterDepth = 0;
}

export function resetWaterSurfaceQueryStatus(status: WaterSurfaceQueryStatus): void {
  status.hit = false;
  status.converged = false;
  status.iterations = 0;
  status.horizontalError = Number.POSITIVE_INFINITY;
  status.capabilityFallback = WaterSurfaceQueryFallback.None;
}
