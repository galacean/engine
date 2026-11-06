/** Combined Surface Appearance + field-graph artifact for deterministic V2 identity. */
import type { WaterSurfaceAppearanceDiagnostic } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type { WaterSurfaceFieldDiagnostic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "./CompiledWaterSurfaceAppearanceTypes";
import type { CompiledWaterSurfaceFieldGraphV2 } from "./CompiledWaterSurfaceFieldTypes";

export enum WaterSurfaceClosureDiagnosticCode {
  AppearanceInvalid = "WATER_SURFACE_CLOSURE_APPEARANCE_INVALID",
  FieldGraphInvalid = "WATER_SURFACE_CLOSURE_FIELD_GRAPH_INVALID",
  AppearanceSchemaUnsupported = "WATER_SURFACE_CLOSURE_APPEARANCE_SCHEMA_UNSUPPORTED",
  RequiredSemanticMissing = "WATER_SURFACE_CLOSURE_REQUIRED_SEMANTIC_MISSING"
}

export interface WaterSurfaceClosureDiagnostic {
  readonly code: WaterSurfaceClosureDiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly cause?: WaterSurfaceAppearanceDiagnostic | WaterSurfaceFieldDiagnostic;
}

export interface CompiledWaterSurfaceClosureV2 {
  readonly schemaVersion: 2;
  readonly sourceId: string;
  /** Includes appearance data and the complete provider order/fallback/unit/quality graph. */
  readonly contentHash: string;
  /** Includes only structural shader/provider capabilities, never numeric art values. */
  readonly variantKey: `surface-closure-v2:${string}`;
  readonly appearance: CompiledWaterSurfaceAppearanceV2;
  readonly fields: CompiledWaterSurfaceFieldGraphV2;
  readonly diagnostics: readonly WaterSurfaceClosureDiagnostic[];
}

export interface WaterSurfaceClosureCompileResult {
  readonly valid: boolean;
  readonly data?: CompiledWaterSurfaceClosureV2;
  readonly diagnostics: readonly WaterSurfaceClosureDiagnostic[];
}
