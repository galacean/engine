/** Deterministic compiler for Water Surface V2 field dependency assets. */
import { WaterFieldProviderKind } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { hashStableValue } from "../shared/determinism";
import type {
  CompiledWaterSurfaceFieldCapabilitiesV2,
  CompiledWaterSurfaceFieldGraphV2,
  WaterSurfaceFieldCompileResult
} from "./CompiledWaterSurfaceFieldTypes";
import { validateWaterSurfaceFieldDependencyAsset } from "./WaterSurfaceFieldValidator";

const WATER_SURFACE_FIELD_COMPILER_VERSION = 2;

export class WaterSurfaceFieldCompiler {
  private constructor() {}

  static compile(source: unknown): WaterSurfaceFieldCompileResult {
    const validation = validateWaterSurfaceFieldDependencyAsset(source);
    if (!validation.valid || !validation.value) {
      return Object.freeze({ valid: false, diagnostics: validation.diagnostics });
    }
    const asset = validation.value;
    const providerSet = new Set(asset.bindings.flatMap((binding) => binding.providers));
    const capabilities: CompiledWaterSurfaceFieldCapabilitiesV2 = Object.freeze({
      compiledSpatialFields: providerSet.has(WaterFieldProviderKind.CompiledSpatialField),
      cameraDepth: providerSet.has(WaterFieldProviderKind.CameraDepth),
      cameraOpaqueColor: providerSet.has(WaterFieldProviderKind.CameraOpaqueColor),
      derivedFields: providerSet.has(WaterFieldProviderKind.Derived),
      constants: providerSet.has(WaterFieldProviderKind.Constant)
    });
    const contentHash = hashStableValue({
      compilerVersion: WATER_SURFACE_FIELD_COMPILER_VERSION,
      asset
    });
    const capabilityKey = [
      `local=${capabilities.compiledSpatialFields ? 1 : 0}`,
      `depth=${capabilities.cameraDepth ? 1 : 0}`,
      `opaque=${capabilities.cameraOpaqueColor ? 1 : 0}`,
      `derived=${capabilities.derivedFields ? 1 : 0}`,
      `constant=${capabilities.constants ? 1 : 0}`
    ].join(";");
    const data: CompiledWaterSurfaceFieldGraphV2 = Object.freeze({
      schemaVersion: asset.schemaVersion,
      sourceId: asset.id,
      contentHash,
      variantKey: `surface-fields-v2:${capabilityKey}`,
      bindings: asset.bindings,
      capabilities,
      diagnostics: validation.diagnostics
    });
    return Object.freeze({ valid: true, data, diagnostics: validation.diagnostics });
  }
}
