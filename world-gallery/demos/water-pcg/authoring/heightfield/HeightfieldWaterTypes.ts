/** Authoring-side value objects for an arbitrary raster-defined water surface. */
import type { HeightfieldWaterDiagnosticCode, HeightfieldWaterDiagnosticSeverity } from "./HeightfieldWaterEnums";

export type HeightfieldWaterVector2 = readonly [number, number];
export type HeightfieldWaterColor = readonly [number, number, number, number];

export interface HeightfieldWaterGridConfig {
  /** World XZ position of the centre of texel (0, 0). */
  readonly originXZ: HeightfieldWaterVector2;
  /** Positive world-space size of one source texel. */
  readonly cellSizeXZ: HeightfieldWaterVector2;
  readonly width: number;
  readonly height: number;
}

export interface HeightfieldWaterMaterialConfig {
  readonly shallowColor: HeightfieldWaterColor;
  readonly deepColor: HeightfieldWaterColor;
  readonly opacity: number;
  readonly shoreFoamWidth: number;
  readonly microNormalStrength: number;
  readonly waveStrength: number;
}

export interface HeightfieldWaterBudgetConfig {
  readonly maxWetTexelCount: number;
  readonly maxQueryTexelCount: number;
  readonly maxComponentCount: number;
  readonly maxVertexCount: number;
  readonly maxTriangleCount: number;
  readonly maxChunkCount: number;
  readonly maxMapPixelCount: number;
}

export interface HeightfieldWaterDiagnostic {
  readonly code: HeightfieldWaterDiagnosticCode;
  readonly severity: HeightfieldWaterDiagnosticSeverity;
  readonly path: string;
  readonly message: string;
}

export interface HeightfieldWaterValidationResult<T> {
  readonly valid: boolean;
  readonly value?: T;
  readonly diagnostics: readonly HeightfieldWaterDiagnostic[];
}
