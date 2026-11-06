/** Engine-object-free, render-only output of the Ocean shore-field compiler. */
import type {
  OceanNearshoreDiagnostic,
  OceanNearshoreGridConfig,
  OceanNearshoreOutsidePolicies,
  OceanNearshoreSchemaVersion,
  OceanNearshoreVector4
} from "../../authoring/ocean/OceanNearshoreTypes";

export interface OceanNearshoreReadonlyUint8Buffer extends Iterable<number> {
  readonly length: number;
  readonly byteLength: number;
  at(index: number): number | undefined;
  borrowTypedArray(): Uint8Array;
  toTypedArray(): Uint8Array;
}

/**
 * Static RGBA8 field sampled by the dedicated Ocean shader.
 * R = wet coverage, G = reserved, B = vertical depth, A = signed shore SDF.
 */
export interface OceanNearshoreStaticAtlas {
  readonly width: number;
  readonly height: number;
  readonly pixels: OceanNearshoreReadonlyUint8Buffer;
  /** u = worldX * x + z; v = worldZ * y + w. */
  readonly worldToUv: OceanNearshoreVector4;
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
  readonly atlasByteLength: number;
  readonly minimumBedHeight: number;
  readonly maximumBedHeight: number;
  readonly maximumDepth: number;
  readonly shoreDistanceRange: number;
}

export interface OceanNearshoreCompiledData {
  readonly schemaVersion: OceanNearshoreSchemaVersion.V1;
  readonly sourceId: string;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly grid: OceanNearshoreGridConfig;
  readonly waterLevel: number;
  readonly outsidePolicy: OceanNearshoreOutsidePolicies;
  readonly staticAtlas: OceanNearshoreStaticAtlas;
  readonly diagnostics: readonly OceanNearshoreDiagnostic[];
  readonly stats: OceanNearshoreCompileStats;
}

export interface OceanNearshoreCompileResult {
  readonly valid: boolean;
  readonly data?: OceanNearshoreCompiledData;
  readonly diagnostics: readonly OceanNearshoreDiagnostic[];
}
