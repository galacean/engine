/** Deterministic combined compiler for an opt-in V2 surface closure and its field graph. */
import {
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDetailSpace,
  WaterSurfacePrimaryColorClosure,
  type WaterSurfaceAppearanceAssetV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { getWaterSurfaceDepthResponseSemantics } from "../../authoring/surface/WaterSurfaceDepthResponseSemantics";
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { hashStableValue } from "../shared/determinism";
import type {
  CompiledWaterSurfaceClosureV2,
  WaterSurfaceClosureCompileResult,
  WaterSurfaceClosureDiagnostic
} from "./CompiledWaterSurfaceClosureTypes";
import { WaterSurfaceClosureDiagnosticCode } from "./CompiledWaterSurfaceClosureTypes";
import { WaterSurfaceAppearanceCompiler } from "./WaterSurfaceAppearanceCompiler";
import { WaterSurfaceFieldCompiler } from "./WaterSurfaceFieldCompiler";

const WATER_SURFACE_CLOSURE_COMPILER_VERSION = 1;

export function getRequiredWaterSurfaceV2Semantics(
  appearance: Pick<
    WaterSurfaceAppearanceAssetV2,
    | "primaryColorClosure"
    | "depthResponse"
    | "boundaryEffects"
    | "detailLayers"
    | "refraction"
    | "composition"
    | "caustics"
  >
): ReadonlySet<WaterFieldSemantic> {
  const semantics = new Set<WaterFieldSemantic>([
    WaterFieldSemantic.Coverage,
    ...getWaterSurfaceDepthResponseSemantics(appearance.depthResponse),
    ...appearance.boundaryEffects.map((effect) => effect.field)
  ]);
  if (appearance.caustics) semantics.add(WaterFieldSemantic.SceneRayDepth);
  if (appearance.detailLayers.some((layer) => layer.space === WaterSurfaceDetailSpace.FlowAdvected)) {
    semantics.add(WaterFieldSemantic.Flow);
  }
  if (
    appearance.refraction.enabled ||
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp ||
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp ||
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp
  ) {
    semantics.add(WaterFieldSemantic.SceneColor);
  }
  if (appearance.refraction.enabled) {
    semantics.add(WaterFieldSemantic.HorizontalShoreDistance);
    if (appearance.refraction.validation !== WaterRefractionValidationModeV2.LocalOnlySafe) {
      semantics.add(WaterFieldSemantic.SceneRayDepth);
    }
  }
  if (appearance.composition === WaterSurfaceCompositionV2.PrecomposedReplace) {
    semantics.add(WaterFieldSemantic.SceneColor);
  }
  return semantics;
}

export class WaterSurfaceClosureCompiler {
  private constructor() {}

  static compile(sourceId: string, appearanceSource: unknown, fieldSource: unknown): WaterSurfaceClosureCompileResult {
    const diagnostics: WaterSurfaceClosureDiagnostic[] = [];
    const appearanceResult = WaterSurfaceAppearanceCompiler.compile(appearanceSource);
    if (!appearanceResult.valid || !appearanceResult.data) {
      diagnostics.push(
        ...appearanceResult.diagnostics.map((cause) => ({
          code: WaterSurfaceClosureDiagnosticCode.AppearanceInvalid,
          path: `$.appearance${cause.path === "$" ? "" : cause.path.slice(1)}`,
          message: cause.message,
          cause
        }))
      );
    } else if (appearanceResult.data.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2) {
      diagnostics.push({
        code: WaterSurfaceClosureDiagnosticCode.AppearanceSchemaUnsupported,
        path: "$.appearance.schemaVersion",
        message: "A combined surface closure requires Surface Appearance schema version 2."
      });
    }
    const fieldResult = WaterSurfaceFieldCompiler.compile(fieldSource);
    if (!fieldResult.valid || !fieldResult.data) {
      diagnostics.push(
        ...fieldResult.diagnostics.map((cause) => ({
          code: WaterSurfaceClosureDiagnosticCode.FieldGraphInvalid,
          path: `$.fields${cause.path === "$" ? "" : cause.path.slice(1)}`,
          message: cause.message,
          cause
        }))
      );
    }
    if (
      diagnostics.length > 0 ||
      !appearanceResult.data ||
      appearanceResult.data.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2 ||
      !fieldResult.data
    ) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    const appearance = appearanceResult.data;
    const fields = fieldResult.data;
    const providedSemantics = new Set(fields.bindings.map((binding) => binding.semantic));
    for (const semantic of getRequiredWaterSurfaceV2Semantics(appearance)) {
      if (!providedSemantics.has(semantic)) {
        diagnostics.push({
          code: WaterSurfaceClosureDiagnosticCode.RequiredSemanticMissing,
          path: "$.fields.bindings",
          message: `Surface Appearance V2 requires an explicit '${semantic}' field consumer.`
        });
      }
    }
    if (diagnostics.length > 0) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }
    const contentHash = hashStableValue({
      compilerVersion: WATER_SURFACE_CLOSURE_COMPILER_VERSION,
      sourceId,
      appearanceHash: appearance.appearanceHash,
      fieldContentHash: fields.contentHash
    });
    const variantKey = `surface-closure-v2:${hashStableValue({
      compilerVersion: WATER_SURFACE_CLOSURE_COMPILER_VERSION,
      appearanceVariantKey: appearance.variantKey,
      fieldVariantKey: fields.variantKey
    })}` as const;
    const data: CompiledWaterSurfaceClosureV2 = Object.freeze({
      schemaVersion: 2,
      sourceId,
      contentHash,
      variantKey,
      appearance,
      fields,
      diagnostics: Object.freeze(diagnostics)
    });
    return Object.freeze({ valid: true, data, diagnostics: data.diagnostics });
  }
}
