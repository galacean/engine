/** Public deterministic compiler for pure-data water surface appearance assets. */
import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceDepthResponseModelV2,
  type WaterBoundaryEffectV2,
  type WaterSurfaceAppearanceAssetV2,
  type WaterSurfaceDetailLayerV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { getWaterSurfaceDepthResponseSemantics } from "../../authoring/surface/WaterSurfaceDepthResponseSemantics";
import { hashStableValue } from "../shared/determinism";
import type {
  CompiledWaterSurfaceAppearance,
  CompiledWaterSurfaceAppearanceV2,
  WaterSurfaceAppearanceCompileResult,
  WaterSurfaceAppearanceVariantKey
} from "./CompiledWaterSurfaceAppearanceTypes";
import { collectWaterSurfaceTextureReferences } from "./WaterSurfaceTextureReferences";
import { validateWaterSurfaceAppearanceV2Asset } from "./WaterSurfaceAppearanceV2Validator";

const WATER_SURFACE_APPEARANCE_V2_COMPILER_VERSION = 5;

function detailLayerStructure(layer: WaterSurfaceDetailLayerV2): unknown {
  return {
    source: layer.source,
    space: layer.space,
    normalConvention: layer.normalConvention,
    strengthMode: layer.strengthMode,
    blend: layer.blend
  };
}

function boundaryEffectStructure(effect: WaterBoundaryEffectV2): unknown {
  return {
    field: effect.field,
    response: effect.response,
    invert: effect.invert,
    pattern: effect.pattern
      ? {
          model: effect.pattern.model,
          octaves: effect.pattern.octaves.count,
          response: effect.pattern.response,
          invert: effect.pattern.invert,
          combine: effect.pattern.combine
        }
      : null,
    outputs: {
      alpha: effect.outputs.alpha !== undefined,
      color: effect.outputs.color !== undefined,
      ...(effect.outputs.colorMode === "albedo" ? { colorMode: "albedo" } : {}),
      roughness: effect.outputs.roughness !== undefined,
      refractionSuppression: effect.outputs.refractionSuppression !== undefined
    }
  };
}

function depthResponseStructure(appearance: WaterSurfaceAppearanceAssetV2): unknown {
  const response = appearance.depthResponse;
  if (response.model === WaterSurfaceDepthResponseModelV2.CompositeExponential) {
    return {
      model: response.model,
      fields: [...getWaterSurfaceDepthResponseSemantics(response)],
      termCount: response.terms.length,
      combine: response.combine,
      colorStopCount: 0
    };
  }
  return {
    model: response.model,
    ...(response.model === WaterSurfaceDepthResponseModelV2.BeerLambert && response.scatteringTint
      ? { scatteringTint: true }
      : {}),
    field: response.field,
    colorStopCount: "colors" in response ? response.colors.length : 0
  };
}

function compileV2(
  appearance: WaterSurfaceAppearanceAssetV2,
  diagnostics: WaterSurfaceAppearanceCompileResult["diagnostics"]
): CompiledWaterSurfaceAppearanceV2 {
  const appearanceHash = hashStableValue({
    compilerVersion: WATER_SURFACE_APPEARANCE_V2_COMPILER_VERSION,
    appearance
  });
  const structure = {
    compilerVersion: WATER_SURFACE_APPEARANCE_V2_COMPILER_VERSION,
    primaryColorClosure: appearance.primaryColorClosure,
    ...(appearance.directionalHighlight
      ? {
          directionalHighlight: {
            model: appearance.directionalHighlight.model,
            sharp: appearance.directionalHighlight.sharp
          }
        }
      : {}),
    detailLayers: appearance.detailLayers.map(detailLayerStructure),
    ...(appearance.caustics ? { caustics: true } : {}),
    depthResponse: depthResponseStructure(appearance),
    boundaryEffects: appearance.boundaryEffects.map(boundaryEffectStructure),
    refraction: {
      enabled: appearance.refraction.enabled,
      normalSource: appearance.refraction.normalSource,
      validation: appearance.refraction.validation
    },
    composition: appearance.composition
  };
  const variantKey: WaterSurfaceAppearanceVariantKey = `surface-appearance-v2:${hashStableValue(structure)}`;
  const textureReferences = collectWaterSurfaceTextureReferences(appearance);
  const maximumPatternOctaves = appearance.boundaryEffects.reduce<0 | 1 | 2 | 3>(
    (maximum, effect) => Math.max(maximum, effect.pattern?.octaves.count ?? 0) as 0 | 1 | 2 | 3,
    0
  );
  return Object.freeze({
    schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
    sourceId: appearance.id,
    appearanceHash,
    variantKey,
    primaryColorClosure: appearance.primaryColorClosure,
    ...(appearance.macroNormalStrength !== undefined ? { macroNormalStrength: appearance.macroNormalStrength } : {}),
    ...(appearance.flowNormalStrength !== undefined ? { flowNormalStrength: appearance.flowNormalStrength } : {}),
    ...(appearance.detailNormalStrength !== undefined ? { detailNormalStrength: appearance.detailNormalStrength } : {}),
    ...(appearance.caustics ? { caustics: appearance.caustics } : {}),
    ...(appearance.directionalHighlight ? { directionalHighlight: appearance.directionalHighlight } : {}),
    detailLayers: appearance.detailLayers,
    depthResponse: appearance.depthResponse,
    boundaryEffects: appearance.boundaryEffects,
    refraction: appearance.refraction,
    composition: appearance.composition,
    textureReferences,
    maximumPatternOctaves,
    diagnostics
  });
}

export class WaterSurfaceAppearanceCompiler {
  private constructor() {}

  static compile(
    source: WaterSurfaceAppearanceAssetV2
  ): WaterSurfaceAppearanceCompileResult<CompiledWaterSurfaceAppearanceV2>;
  static compile(source: unknown): WaterSurfaceAppearanceCompileResult;
  static compile(source: unknown): WaterSurfaceAppearanceCompileResult {
    const validation = validateWaterSurfaceAppearanceV2Asset(source);
    if (!validation.valid || !validation.value) {
      return Object.freeze({ valid: false, diagnostics: validation.diagnostics });
    }
    const appearance = validation.value;
    const data: CompiledWaterSurfaceAppearance = compileV2(appearance, validation.diagnostics);
    return Object.freeze({ valid: true, data, diagnostics: validation.diagnostics });
  }
}
