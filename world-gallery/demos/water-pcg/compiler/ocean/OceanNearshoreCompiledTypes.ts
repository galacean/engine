/** Engine-object-free output contracts for deterministic Ocean nearshore compilation. */
import type { OceanObstacleDescriptor } from "../../authoring/ocean/OceanObstacleTypes";
import type {
  OceanNearshoreDiagnostic,
  OceanNearshoreGridConfig,
  OceanNearshoreOutsidePolicies,
  OceanNearshoreSchemaVersion,
  OceanNearshoreVector4
} from "../../authoring/ocean/OceanNearshoreTypes";

export interface OceanNearshoreReadonlyUint8Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Uint8Array;
}

export interface OceanNearshoreReadonlyFloat32Buffer extends Iterable<number> {
  readonly length: number;
  at(index: number): number | undefined;
  toTypedArray(): Float32Array;
}

export interface CompiledOceanObstacle {
  readonly id: string;
  readonly index: number;
  readonly descriptor: OceanObstacleDescriptor;
  /** Axis-aligned world XZ bounds. */
  readonly bounds: OceanNearshoreVector4;
}

export interface OceanNearshoreQueryGrid {
  readonly grid: OceanNearshoreGridConfig;
  readonly waterLevel: number;
  readonly wetMask: OceanNearshoreReadonlyUint8Buffer;
  readonly bedHeights: OceanNearshoreReadonlyFloat32Buffer;
  readonly waterDepths: OceanNearshoreReadonlyFloat32Buffer;
  readonly shoreDistances: OceanNearshoreReadonlyFloat32Buffer;
  /** Dense world XZ normals pointing from water toward dry land. */
  readonly shoreNormalsXZ: OceanNearshoreReadonlyFloat32Buffer;
  readonly baseCurrentsXZ: OceanNearshoreReadonlyFloat32Buffer;
}

export interface OceanNearshoreStaticAtlas {
  readonly width: number;
  readonly height: number;
  readonly pixels: OceanNearshoreReadonlyUint8Buffer;
  /** u = worldX * x + z; v = worldZ * y + w. */
  readonly worldToUv: OceanNearshoreVector4;
  /** RG decode: ((channel * 255 - 128) / 127) * currentDecodeScale. */
  readonly currentDecodeScale: number;
  /** B decode: channel * maximumDepth. */
  readonly maximumDepth: number;
  /** A decode: ((channel * 255 - 128) / 127) * shoreDistanceRange. */
  readonly shoreDistanceRange: number;
  /** 128 is exact zero; wet texel centres encode above this value. */
  readonly wetShoreDistanceCode: number;
}

export interface OceanNearshoreCompileStats {
  readonly texelCount: number;
  readonly wetTexelCount: number;
  readonly dryTexelCount: number;
  readonly obstacleCount: number;
  readonly atlasByteLength: number;
  readonly queryByteLength: number;
  readonly minimumBedHeight: number;
  readonly maximumBedHeight: number;
  readonly maximumDepth: number;
  readonly maximumCurrentSpeed: number;
  readonly shoreDistanceRange: number;
}

export interface OceanNearshoreCompiledData {
  readonly schemaVersion: OceanNearshoreSchemaVersion.V1;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly grid: OceanNearshoreGridConfig;
  readonly waterLevel: number;
  readonly outsidePolicy: OceanNearshoreOutsidePolicies;
  readonly queryGrid: OceanNearshoreQueryGrid;
  readonly staticAtlas: OceanNearshoreStaticAtlas;
  readonly obstacles: readonly CompiledOceanObstacle[];
  readonly diagnostics: readonly OceanNearshoreDiagnostic[];
  readonly stats: OceanNearshoreCompileStats;
}

export interface OceanNearshoreCompileResult {
  readonly valid: boolean;
  readonly data?: OceanNearshoreCompiledData;
  readonly diagnostics: readonly OceanNearshoreDiagnostic[];
}
