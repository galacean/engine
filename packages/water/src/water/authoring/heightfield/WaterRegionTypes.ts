/** Versioned terrain-to-water region and Water-owned bathymetry contracts. */

export enum WaterRegionSchemaVersion {
  V1 = 1
}

export interface WaterRegionBoundsXZ {
  readonly minimumXZ: readonly [x: number, z: number];
  readonly maximumXZ: readonly [x: number, z: number];
}

export interface WaterRegionMetrics {
  readonly sampledTexelCount: number;
  readonly candidateWetTexelCount: number;
  readonly wetTexelCount: number;
  readonly componentCount: number;
  readonly repairedTexelCount: number;
  readonly discardedTexelCount: number;
}

/**
 * Immutable-by-ownership binary region handed from a terrain adapter to Water
 * PCG. It intentionally contains no terrain texture, material, or query handle.
 */
export interface WaterRegionMaskV1 {
  readonly schemaVersion: WaterRegionSchemaVersion.V1;
  readonly id: string;
  readonly bounds: WaterRegionBoundsXZ;
  readonly waterLevel: number;
  readonly resolution: readonly [width: number, height: number];
  readonly wetMask: Uint8Array;
  readonly contentHash: string;
  readonly metrics: WaterRegionMetrics;
}

export interface CompiledWaterRegionBathymetryV1 {
  readonly grid: {
    readonly originXZ: readonly [x: number, z: number];
    readonly cellSizeXZ: readonly [x: number, z: number];
    readonly width: number;
    readonly height: number;
  };
  readonly wetTexelIndices: Uint32Array;
  readonly surfaceHeights: Float32Array;
  readonly bedHeights: Float32Array;
  readonly flowVectorsXZ: Float32Array;
  readonly shoreDistances: Float32Array;
  readonly minimumDepth: number;
  readonly maximumDepth: number;
}
