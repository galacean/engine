/** Engine-object-free output contracts for heightfield-water compilation. */
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { CompiledWaterWaveSet } from "../wave/CompiledWaterWaveTypes";
import type { HeightfieldWaterSchemaVersion } from "../../authoring/heightfield/HeightfieldWaterEnums";
import type {
  HeightfieldWaterDiagnostic,
  HeightfieldWaterGridConfig,
  HeightfieldWaterMaterialConfig,
  HeightfieldWaterVector2
} from "../../authoring/heightfield/HeightfieldWaterTypes";

export interface HeightfieldReadonlyUint8Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Uint8Array;
}
export interface HeightfieldReadonlyUint16Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Uint16Array;
}
export interface HeightfieldReadonlyUint32Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Uint32Array;
}
export interface HeightfieldReadonlyInt32Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Int32Array;
}
export interface HeightfieldReadonlyFloat32Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Float32Array;
}

export type HeightfieldWaterVector3 = readonly [number, number, number];
export type HeightfieldWaterVector4 = readonly [number, number, number, number];

export interface HeightfieldWaterBounds {
  readonly min: HeightfieldWaterVector3;
  readonly max: HeightfieldWaterVector3;
}

export interface HeightfieldWaterGeometryData {
  /** Flat XYZ values relative to the owning chunk localOrigin. */
  readonly positions: HeightfieldReadonlyFloat32Buffer;
  readonly normals: HeightfieldReadonlyFloat32Buffer;
  readonly tangents: HeightfieldReadonlyFloat32Buffer;
  readonly uvs: HeightfieldReadonlyFloat32Buffer;
  readonly indices: HeightfieldReadonlyUint16Buffer;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly bounds: HeightfieldWaterBounds;
}

export interface HeightfieldWaterCompiledComponent {
  readonly id: string;
  readonly index: number;
  readonly wetTexelCount: number;
  readonly wetTexelIndices: HeightfieldReadonlyUint32Buffer;
  readonly minTexel: HeightfieldWaterVector2;
  readonly maxTexel: HeightfieldWaterVector2;
  readonly bounds: HeightfieldWaterBounds;
  readonly minSurfaceHeight: number;
  readonly maxSurfaceHeight: number;
}

export interface HeightfieldWaterCompiledChunk {
  readonly id: string;
  readonly tileX: number;
  readonly tileZ: number;
  readonly part: number;
  readonly localOrigin: HeightfieldWaterVector3;
  readonly componentIndices: readonly number[];
  readonly atlasUvRect: HeightfieldWaterVector4;
  readonly geometry: HeightfieldWaterGeometryData;
}

export interface HeightfieldWaterLocalMapAtlas {
  readonly width: number;
  readonly height: number;
  readonly pixels: HeightfieldReadonlyUint8Buffer;
  /** u = worldX * x + z; v = worldZ * y + w. */
  readonly worldToUv: HeightfieldWaterVector4;
  /** RG decode to signed XZ flow with ((channel / 255) * 2 - 1) * scale. */
  readonly flowDecodeScale: number;
  /** B decodes to depth with channel / 255 * maxDepth. */
  readonly maxDepth: number;
  /** A decodes to signed shore distance; wet is positive and dry is negative. */
  readonly signedDistanceRange: number;
}

export interface HeightfieldWaterQueryGrid {
  readonly grid: HeightfieldWaterGridConfig;
  readonly wetMask: HeightfieldReadonlyUint8Buffer;
  /** Dense component indices; dry texels contain -1. */
  readonly componentIndices: HeightfieldReadonlyInt32Buffer;
  /** Dense absolute water Y; dry texels contain NaN. */
  readonly surfaceHeights: HeightfieldReadonlyFloat32Buffer;
  /** Dense bed Y; dry texels contain NaN. */
  readonly bedHeights: HeightfieldReadonlyFloat32Buffer;
  /** Dense XZ flow vectors; dry texels contain zero. */
  readonly flowVectorsXZ: HeightfieldReadonlyFloat32Buffer;
}

export interface HeightfieldWaterCompileStats {
  readonly sourceWetTexelCount: number;
  readonly componentCount: number;
  readonly outputCellCount: number;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly chunkCount: number;
  readonly mapPixelCount: number;
  readonly minSurfaceHeight: number;
  readonly maxSurfaceHeight: number;
  readonly maxDepth: number;
}

export interface HeightfieldWaterCompiledData {
  readonly schemaVersion: HeightfieldWaterSchemaVersion;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly quality: WaterQualityTier;
  readonly aggregationScale: number;
  readonly grid: HeightfieldWaterGridConfig;
  readonly material: HeightfieldWaterMaterialConfig;
  readonly waveSet: CompiledWaterWaveSet;
  readonly components: readonly HeightfieldWaterCompiledComponent[];
  readonly chunks: readonly HeightfieldWaterCompiledChunk[];
  readonly localMapAtlas: HeightfieldWaterLocalMapAtlas;
  readonly queryGrid: HeightfieldWaterQueryGrid;
  readonly diagnostics: readonly HeightfieldWaterDiagnostic[];
  readonly stats: HeightfieldWaterCompileStats;
}

export interface HeightfieldWaterCompileResult {
  readonly valid: boolean;
  readonly data?: HeightfieldWaterCompiledData;
  readonly diagnostics: readonly HeightfieldWaterDiagnostic[];
}

export interface HeightfieldWaterQuerySample {
  readonly inside: boolean;
  readonly componentIndex: number;
  readonly surfaceHeight: number;
  readonly normal: HeightfieldWaterVector3;
  readonly depth: number;
  readonly shoreDistance: number;
  readonly flowVectorXZ: HeightfieldWaterVector2;
}
