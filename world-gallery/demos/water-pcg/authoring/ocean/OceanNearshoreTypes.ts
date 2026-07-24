/** Authoring-side value objects for the finite field attached to an unbounded Ocean. */
import type { OceanObstacleDescriptor } from "./OceanObstacleTypes";

export enum OceanNearshoreSchemaVersion {
  V1 = 1
}

export enum OceanNearshoreOutsidePolicy {
  DeepOcean = "deep-ocean",
  Dry = "dry"
}

export enum OceanNearshoreDiagnosticSeverity {
  Info = "info",
  Warning = "warning",
  Error = "error"
}

export enum OceanNearshoreDiagnosticCode {
  InvalidRootType = "OCEAN_NEARSHORE_INVALID_ROOT_TYPE",
  UnsupportedSchemaVersion = "OCEAN_NEARSHORE_UNSUPPORTED_SCHEMA_VERSION",
  MissingField = "OCEAN_NEARSHORE_MISSING_FIELD",
  InvalidType = "OCEAN_NEARSHORE_INVALID_TYPE",
  InvalidNumber = "OCEAN_NEARSHORE_INVALID_NUMBER",
  InvalidEnum = "OCEAN_NEARSHORE_INVALID_ENUM",
  ValueOutOfRange = "OCEAN_NEARSHORE_VALUE_OUT_OF_RANGE",
  BufferLengthMismatch = "OCEAN_NEARSHORE_BUFFER_LENGTH_MISMATCH",
  InvalidDepth = "OCEAN_NEARSHORE_INVALID_DEPTH",
  DuplicateObstacleId = "OCEAN_NEARSHORE_DUPLICATE_OBSTACLE_ID",
  ObstacleOutOfBounds = "OCEAN_NEARSHORE_OBSTACLE_OUT_OF_BOUNDS",
  BudgetExceeded = "OCEAN_NEARSHORE_BUDGET_EXCEEDED",
  NoWetTexels = "OCEAN_NEARSHORE_NO_WET_TEXELS",
  NoShoreBoundary = "OCEAN_NEARSHORE_NO_SHORE_BOUNDARY"
}

export type OceanNearshoreVector2 = readonly [number, number];
export type OceanNearshoreVector4 = readonly [number, number, number, number];

export interface OceanNearshoreGridConfig {
  /** World XZ position of the centre of texel (0, 0). */
  readonly originXZ: OceanNearshoreVector2;
  /** Positive world-space size of one source texel. */
  readonly cellSizeXZ: OceanNearshoreVector2;
  readonly width: number;
  readonly height: number;
}

export interface OceanNearshoreOutsidePolicies {
  readonly negativeX: OceanNearshoreOutsidePolicy;
  readonly positiveX: OceanNearshoreOutsidePolicy;
  readonly negativeZ: OceanNearshoreOutsidePolicy;
  readonly positiveZ: OceanNearshoreOutsidePolicy;
}

export interface OceanNearshoreWaterLevelWetSource {
  readonly kind: "water-level";
  /** A cell is wet only when waterLevel - bedHeight exceeds this value. */
  readonly minimumDepth?: number;
}

export interface OceanNearshoreMaskWetSource {
  readonly kind: "mask";
  /** Dense row-major 0/1 occupancy. */
  readonly mask: Uint8Array;
  /** Masked cells must also have at least this much physical water depth. */
  readonly minimumDepth?: number;
}

export type OceanNearshoreWetSource =
  | OceanNearshoreWaterLevelWetSource
  | OceanNearshoreMaskWetSource;

export interface OceanNearshoreBudgetConfig {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly maxTexelCount: number;
  readonly maxObstacleCount: number;
  readonly maxAtlasByteLength: number;
}

export interface OceanNearshoreDiagnostic {
  readonly code: OceanNearshoreDiagnosticCode;
  readonly severity: OceanNearshoreDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface OceanNearshoreValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly diagnostics: readonly OceanNearshoreDiagnostic[];
}

export interface ValidatedOceanNearshoreDescriptor {
  readonly schemaVersion: OceanNearshoreSchemaVersion.V1;
  readonly id: string;
  readonly waterLevel: number;
  readonly grid: OceanNearshoreGridConfig;
  readonly bedHeights: Float32Array;
  readonly baseCurrentsXZ: Float32Array;
  readonly wetSource: OceanNearshoreWetSource;
  readonly outsidePolicy: OceanNearshoreOutsidePolicies;
  readonly obstacles: readonly OceanObstacleDescriptor[];
  readonly budget: OceanNearshoreBudgetConfig;
}
