/** Engine-object-free field dependency graph compiled from Water Surface V2 authoring data. */
import type {
  WaterSurfaceFieldDependencyV2,
  WaterSurfaceFieldDiagnostic,
  WaterSurfaceFieldSchemaVersion
} from "../../authoring/surface/WaterSurfaceFieldTypes";

export interface CompiledWaterSurfaceFieldCapabilitiesV2 {
  readonly compiledSpatialFields: boolean;
  readonly cameraDepth: boolean;
  readonly cameraOpaqueColor: boolean;
  readonly derivedFields: boolean;
  readonly constants: boolean;
}

export interface CompiledWaterSurfaceFieldGraphV2 {
  readonly schemaVersion: WaterSurfaceFieldSchemaVersion.V2;
  readonly sourceId: string;
  readonly contentHash: string;
  readonly variantKey: string;
  readonly bindings: readonly WaterSurfaceFieldDependencyV2[];
  readonly capabilities: CompiledWaterSurfaceFieldCapabilitiesV2;
  readonly diagnostics: readonly WaterSurfaceFieldDiagnostic[];
}

export interface WaterSurfaceFieldCompileResult {
  readonly valid: boolean;
  readonly data?: CompiledWaterSurfaceFieldGraphV2;
  readonly diagnostics: readonly WaterSurfaceFieldDiagnostic[];
}
