import { createWaterSurfaceNormalShaderFunctions } from "./WaterSurfaceAppearanceShader";
/** Structural GLSL generation for the bounded, opt-in Surface Appearance V2 closure. */
import {
  WaterBoundaryResponseV2,
  WaterPatternBoundaryCombineV2,
  WaterPatternModelV2,
  WaterPatternResponseV2,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfaceDetailBlend,
  WaterSurfaceDetailSource,
  WaterSurfaceDetailSpace,
  WaterSurfaceNormalConvention,
  WaterSurfaceNormalStrengthModeV2,
  WaterSurfacePrimaryColorClosure,
  type WaterBoundaryEffectV2,
  type WaterSurfaceDetailLayerV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { createWaterSurfaceDepthResponseShaderFunctions } from "./WaterSurfaceDepthResponseShader";
import { WaterDepthResponseDebugView } from "./WaterSurfaceDepthResponse";
import type { ResolvedWaterSurfaceFieldsV2 } from "./WaterSurfaceResolvedFields";
import waterSurfaceAppearanceV2CompositionShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2Composition.glsl?raw";
import waterSurfaceAppearanceV2DepthResponseShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2DepthResponse.glsl?raw";
import waterSurfaceAppearanceV2BoundaryEffectsShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2BoundaryEffects.glsl?raw";
import waterSurfaceAppearanceV2BoundaryEffectShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2BoundaryEffect.glsl?raw";
import waterSurfaceAppearanceV2NormalDetailShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2NormalDetail.glsl?raw";
import waterSurfaceAppearanceV2FunctionsShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2Functions.glsl?raw";
import waterSurfaceAppearanceV2UniformsShaderTemplate from "../../shaders/library/surface/WaterSurfaceAppearanceV2Uniforms.glsl?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";

export const WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY = Object.freeze({
  detailEnabled: "material_AppearanceV2DetailEnabled",
  depthResponseEnabled: "material_AppearanceV2DepthResponseEnabled",
  boundaryAlphaEnabled: "material_AppearanceV2BoundaryAlphaEnabled",
  boundaryMaterialEnabled: "material_AppearanceV2BoundaryMaterialEnabled",
  refractionUvScale: "material_AppearanceV2RefractionUvScale",
  depthDebugView: "material_AppearanceV2DepthDebugView",
  macroNormalStrength: "material_AppearanceV2MacroNormalStrength",
  directionalHighlightStrength: "material_AppearanceV2DirectionalHighlightStrength",
  directionalHighlightExponent: "material_AppearanceV2DirectionalHighlightExponent",
  directionalHighlightDistortion: "material_AppearanceV2DirectionalHighlightDistortion",
  directionalHighlightSharp: "material_AppearanceV2DirectionalHighlightSharp"
});

export type WaterSurfaceAppearanceV2DetailProperty = "texture" | "transform" | "rotation" | "strength";
export type WaterSurfaceAppearanceV2DepthProperty =
  | "distance"
  | "exponent"
  | "color"
  | "maximumOpacity"
  | "coefficient0"
  | "coefficient1"
  | "shallowColor"
  | "deepColor";
export type WaterSurfaceAppearanceV2BoundaryProperty =
  | "range"
  | "exponent"
  | "alpha"
  | "color"
  | "roughness"
  | "refractionSuppression"
  | "patternWorldScale"
  | "patternTimeRate"
  | "patternOpacity"
  | "patternExponent"
  | "patternWeights"
  | "patternLacunarity";

export function getWaterSurfaceAppearanceV2DetailProperty(
  index: number,
  property: WaterSurfaceAppearanceV2DetailProperty
): string {
  return `material_AppearanceV2Detail${index}${property[0].toUpperCase()}${property.slice(1)}`;
}

export function getWaterSurfaceAppearanceV2DepthProperty(property: WaterSurfaceAppearanceV2DepthProperty): string {
  return `material_AppearanceV2Depth${property[0].toUpperCase()}${property.slice(1)}`;
}

export function getWaterSurfaceAppearanceV2ColorStopProperty(index: number, property: "position" | "color"): string {
  return `material_AppearanceV2DepthStop${index}${property[0].toUpperCase()}${property.slice(1)}`;
}

export function getWaterSurfaceAppearanceV2BoundaryProperty(
  index: number,
  property: WaterSurfaceAppearanceV2BoundaryProperty
): string {
  return `material_AppearanceV2Boundary${index}${property[0].toUpperCase()}${property.slice(1)}`;
}

function depthResponseSelector(model: WaterSurfaceDepthResponseModelV2): number {
  switch (model) {
    case WaterSurfaceDepthResponseModelV2.LinearColorOpacity:
      return 5;
    case WaterSurfaceDepthResponseModelV2.BeerLambert:
      return 0;
    case WaterSurfaceDepthResponseModelV2.PowerRamp:
      return 1;
    case WaterSurfaceDepthResponseModelV2.ColorRamp:
      return 2;
    case WaterSurfaceDepthResponseModelV2.CompositeExponential:
      return 3;
  }
}

function uniformBoundaryTemplateData(
  effect: WaterBoundaryEffectV2 | undefined,
  index: 0 | 1 | 2 | 3
): Readonly<Record<string, number>> {
  const prefix = `BOUNDARY_${index}`;
  return {
    [`${prefix}_USES_POWER_RESPONSE`]: Number(effect?.response === WaterBoundaryResponseV2.Power),
    [`${prefix}_OUTPUT_ALPHA`]: Number(effect?.outputs.alpha !== undefined),
    [`${prefix}_OUTPUT_COLOR`]: Number(effect?.outputs.color !== undefined),
    [`${prefix}_OUTPUT_ROUGHNESS`]: Number(effect?.outputs.roughness !== undefined),
    [`${prefix}_OUTPUT_REFRACTION`]: Number(effect?.outputs.refractionSuppression !== undefined),
    [`${prefix}_HAS_PATTERN`]: Number(effect?.pattern !== undefined),
    [`${prefix}_USES_POWER_PATTERN`]: Number(effect?.pattern?.response === WaterPatternResponseV2.Power)
  };
}

export function createWaterSurfaceAppearanceV2UniformDeclarations(
  appearance: CompiledWaterSurfaceAppearanceV2
): string {
  const depth = appearance.depthResponse;
  return renderWaterShaderTemplate(waterSurfaceAppearanceV2UniformsShaderTemplate, {
    HAS_CAUSTICS: Number(!!appearance.caustics),
    HAS_MACRO_NORMAL_STRENGTH: Number(appearance.macroNormalStrength !== undefined),
    HAS_DIRECTIONAL_HIGHLIGHT: Number(appearance.directionalHighlight !== undefined),
    DETAIL_LAYER_COUNT: appearance.detailLayers.length,
    DETAIL_0_USES_TEXTURE: Number(appearance.detailLayers[0]?.source === WaterSurfaceDetailSource.NormalTexture),
    DETAIL_1_USES_TEXTURE: Number(appearance.detailLayers[1]?.source === WaterSurfaceDetailSource.NormalTexture),
    DEPTH_RESPONSE_MODEL:
      depth.model === WaterSurfaceDepthResponseModelV2.BeerLambert && depth.scatteringTint
        ? 4
        : depthResponseSelector(depth.model),
    DEPTH_COLOR_STOP_COUNT: depth.model === WaterSurfaceDepthResponseModelV2.ColorRamp ? depth.colors.length : 0,
    BOUNDARY_EFFECT_COUNT: appearance.boundaryEffects.length,
    ...uniformBoundaryTemplateData(appearance.boundaryEffects[0], 0),
    ...uniformBoundaryTemplateData(appearance.boundaryEffects[1], 1),
    ...uniformBoundaryTemplateData(appearance.boundaryEffects[2], 2),
    ...uniformBoundaryTemplateData(appearance.boundaryEffects[3], 3)
  });
}

export function createWaterSurfaceAppearanceV2ShaderFunctions(
  appearance?: Readonly<CompiledWaterSurfaceAppearanceV2>
): string {
  const depthFunctions =
    appearance?.depthResponse.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
      ? createWaterSurfaceDepthResponseShaderFunctions()
      : "";
  return renderWaterShaderTemplate(waterSurfaceAppearanceV2FunctionsShaderTemplate, {
    NORMAL_FUNCTIONS: createWaterSurfaceNormalShaderFunctions(),
    DEPTH_FUNCTIONS: depthFunctions
  });
}

function detailSpaceSelector(space: WaterSurfaceDetailSpace): number {
  switch (space) {
    case WaterSurfaceDetailSpace.WorldXz:
      return 0;
    case WaterSurfaceDetailSpace.ObjectXz:
      return 1;
    case WaterSurfaceDetailSpace.MeshUv:
      return 2;
    case WaterSurfaceDetailSpace.FlowAdvected:
      return 3;
  }
}

function detailStrengthModeSelector(mode: WaterSurfaceNormalStrengthModeV2): number {
  return mode === WaterSurfaceNormalStrengthModeV2.ReconstructAfterScale ? 0 : 1;
}

function detailBlendSelector(blend: WaterSurfaceDetailBlend): number {
  switch (blend) {
    case WaterSurfaceDetailBlend.Whiteout:
      return 0;
    case WaterSurfaceDetailBlend.PartialDerivative:
      return 1;
    case WaterSurfaceDetailBlend.Reoriented:
      return 2;
    case WaterSurfaceDetailBlend.AddSlope:
      return 3;
  }
}

function detailLayerTemplateData(
  layer: WaterSurfaceDetailLayerV2 | undefined,
  index: 0 | 1,
  boundedTime: boolean
): Readonly<Record<string, string | number>> {
  const prefix = `DETAIL_${index}`;
  return {
    [`${prefix}_SPACE`]: detailSpaceSelector(layer?.space ?? WaterSurfaceDetailSpace.WorldXz),
    [`${prefix}_TRANSFORM`]: getWaterSurfaceAppearanceV2DetailProperty(index, "transform"),
    [`${prefix}_OFFSET`]: `${getWaterSurfaceAppearanceV2DetailProperty(index, "transform")}.zw${boundedTime ? "" : " * elapsedTime"}`,
    [`${prefix}_ROTATION`]: getWaterSurfaceAppearanceV2DetailProperty(index, "rotation"),
    [`${prefix}_STRENGTH_MODE`]: detailStrengthModeSelector(
      layer?.strengthMode ?? WaterSurfaceNormalStrengthModeV2.ReconstructAfterScale
    ),
    [`${prefix}_SAMPLER`]:
      layer?.source === WaterSurfaceDetailSource.NormalTexture
        ? getWaterSurfaceAppearanceV2DetailProperty(index, "texture")
        : "material_SurfaceTexture",
    [`${prefix}_STRENGTH`]: getWaterSurfaceAppearanceV2DetailProperty(index, "strength"),
    [`${prefix}_FLIP_GREEN`]: layer?.normalConvention === WaterSurfaceNormalConvention.DirectX ? "1.0" : "0.0",
    [`${prefix}_BLEND_MODE`]: detailBlendSelector(layer?.blend ?? WaterSurfaceDetailBlend.Whiteout)
  };
}

export function createWaterSurfaceAppearanceV2NormalStatements(
  appearance: CompiledWaterSurfaceAppearanceV2,
  coordinates: Readonly<{ flowAdvected?: string; flowAdvectedWeight?: string; boundedTime?: boolean }> = {}
): string {
  return renderWaterShaderTemplate(waterSurfaceAppearanceV2NormalDetailShaderTemplate, {
    DETAIL_LAYER_COUNT: appearance.detailLayers.length,
    // Geometry may supply a continuous transported domain (e.g. River travel
    // time). HF local FlowAdvected remains unresolved S2: it still uses
    // surfaceTime mod4096, including its authored velocity.
    FLOW_ADVECTED_COORDINATE:
      coordinates.flowAdvected ?? "baseWorldPosition.xz - flowDirection * flowSpeed * elapsedTime",
    FLOW_ADVECTED_WEIGHT: coordinates.flowAdvectedWeight ?? "1.0",
    ...detailLayerTemplateData(
      appearance.detailLayers[0],
      0,
      !!coordinates.boundedTime &&
        (appearance.detailLayers[0]?.space !== WaterSurfaceDetailSpace.FlowAdvected ||
          coordinates.flowAdvected !== undefined)
    ),
    ...detailLayerTemplateData(
      appearance.detailLayers[1],
      1,
      !!coordinates.boundedTime &&
        (appearance.detailLayers[1]?.space !== WaterSurfaceDetailSpace.FlowAdvected ||
          coordinates.flowAdvected !== undefined)
    ),
    DETAIL_ENABLED: WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.detailEnabled
  });
}

export function getWaterSurfaceAppearanceV2FieldExpression(
  semantic: WaterFieldSemantic,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>
): string {
  switch (semantic) {
    case WaterFieldSemantic.SurfaceHeight:
      return fields.surfaceHeight.expression;
    case WaterFieldSemantic.VerticalDepth:
      return fields.verticalDepth.expression;
    case WaterFieldSemantic.HorizontalShoreDistance:
      return fields.horizontalShoreDistance.expression;
    case WaterFieldSemantic.SceneEyeDepth:
      return fields.sceneEyeDepth.expression;
    case WaterFieldSemantic.SceneRayDepth:
      return fields.sceneRayDepth.expression;
    case WaterFieldSemantic.SurfaceNormalDepth:
      return fields.surfaceNormalDepth.expression;
    case WaterFieldSemantic.ObstacleContact:
      return fields.obstacleContact.expression;
    case WaterFieldSemantic.OpticalPath:
      return fields.opticalPath.expression;
    default:
      throw new Error(`Surface Appearance V2 field '${semantic}' is not a scalar meter field.`);
  }
}

function boundaryResponseSelector(response: WaterBoundaryResponseV2): number {
  switch (response) {
    case WaterBoundaryResponseV2.Linear:
      return 0;
    case WaterBoundaryResponseV2.Smoothstep:
      return 1;
    case WaterBoundaryResponseV2.Power:
      return 2;
  }
}

function patternModelSelector(model: WaterPatternModelV2): number {
  switch (model) {
    case WaterPatternModelV2.Voronoi:
      return 0;
    case WaterPatternModelV2.AnimatedVoronoiF1:
      return 1;
    case WaterPatternModelV2.ShorelineBreakerBand:
      return 2;
  }
}

function patternResponseSelector(response: WaterPatternResponseV2): number {
  return response === WaterPatternResponseV2.Linear ? 0 : 1;
}

function patternCombineSelector(combine: WaterPatternBoundaryCombineV2): number {
  switch (combine) {
    case WaterPatternBoundaryCombineV2.Multiply:
      return 0;
    case WaterPatternBoundaryCombineV2.AddSaturate:
      return 1;
    case WaterPatternBoundaryCombineV2.SignedBoundaryAddSaturate:
      return 2;
  }
}

function boundaryEffectTemplateData(
  effect: WaterBoundaryEffectV2,
  index: number,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>,
  skipMultiplyPatternOutsideBoundary: boolean,
  boundedTime: boolean
): Readonly<Record<string, string | number>> {
  const pattern = effect.pattern;
  const property = (name: WaterSurfaceAppearanceV2BoundaryProperty): string =>
    getWaterSurfaceAppearanceV2BoundaryProperty(index, name);

  return {
    INDEX: index,
    FIELD: getWaterSurfaceAppearanceV2FieldExpression(effect.field, fields),
    RANGE: property("range"),
    BOUNDARY_RESPONSE: boundaryResponseSelector(effect.response),
    BOUNDARY_EXPONENT: effect.response === WaterBoundaryResponseV2.Power ? property("exponent") : "1.0",
    INVERT_BOUNDARY: Number(effect.invert),
    HAS_PATTERN: Number(pattern !== undefined),
    GUARD_PATTERN_SAMPLE: Number(
      skipMultiplyPatternOutsideBoundary && pattern?.combine === WaterPatternBoundaryCombineV2.Multiply
    ),
    PATTERN_MODEL: patternModelSelector(pattern?.model ?? WaterPatternModelV2.Voronoi),
    PATTERN_WORLD_SCALE: property("patternWorldScale"),
    PATTERN_TIME: boundedTime ? property("patternTimeRate") : "elapsedTime",
    PATTERN_TIME_RATE: boundedTime ? "1.0" : property("patternTimeRate"),
    PATTERN_WEIGHTS: property("patternWeights"),
    PATTERN_LACUNARITY: property("patternLacunarity"),
    PATTERN_RESPONSE: patternResponseSelector(pattern?.response ?? WaterPatternResponseV2.Linear),
    INVERT_PATTERN: Number(pattern?.invert ?? false),
    PATTERN_EXPONENT: pattern?.response === WaterPatternResponseV2.Power ? property("patternExponent") : "1.0",
    PATTERN_COMBINE: patternCombineSelector(pattern?.combine ?? WaterPatternBoundaryCombineV2.Multiply),
    PATTERN_OPACITY: property("patternOpacity"),
    USE_OBSTACLE_BEHIND_GATE: Number(effect.field === WaterFieldSemantic.ObstacleContact),
    EMIT_CONTACT_FOAM: Number(pattern !== undefined || effect.field === WaterFieldSemantic.ObstacleContact),
    BOUNDARY_MATERIAL_ENABLED: WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryMaterialEnabled,
    OUTPUT_ALPHA: Number(effect.outputs.alpha !== undefined),
    BOUNDARY_ALPHA: property("alpha"),
    OUTPUT_COLOR: Number(effect.outputs.color !== undefined),
    COLOR_ALBEDO: Number(effect.outputs.colorMode === "albedo"),
    BOUNDARY_COLOR: property("color"),
    OUTPUT_ROUGHNESS: Number(effect.outputs.roughness !== undefined),
    BOUNDARY_ROUGHNESS: property("roughness"),
    OUTPUT_REFRACTION: Number(effect.outputs.refractionSuppression !== undefined),
    BOUNDARY_REFRACTION_SUPPRESSION:
      effect.outputs.refractionSuppression !== undefined ? property("refractionSuppression") : "0.0"
  };
}

/*
 * The selectors above are compile-time structure. Boundary evaluation remains
 * entirely in the semantic GLSL module and is pruned by the shader preprocessor.
 */
function renderBoundaryEffect(
  effect: WaterBoundaryEffectV2,
  index: number,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>,
  skipMultiplyPatternOutsideBoundary: boolean,
  output: "all" | "roughness" | "surface",
  boundedTime: boolean
): string {
  const data = boundaryEffectTemplateData(effect, index, fields, skipMultiplyPatternOutsideBoundary, boundedTime);
  return renderWaterShaderTemplate(waterSurfaceAppearanceV2BoundaryEffectShaderTemplate, {
    ...data,
    INCLUDE_NAMESPACE: output === "roughness" ? "ROUGHNESS" : "BOUNDARY",
    OUTPUT_ROUGHNESS: output === "surface" ? 0 : data.OUTPUT_ROUGHNESS,
    ...(output === "roughness" ? { EMIT_CONTACT_FOAM: 0, OUTPUT_ALPHA: 0, OUTPUT_COLOR: 0, OUTPUT_REFRACTION: 0 } : {})
  });
}

export interface WaterSurfaceBoundaryShaderOptions {
  /** HF/River reuse PatternTimeRate as CPU-reduced phase; Ocean retains legacy text. */
  readonly boundedTime?: boolean;
  readonly baseRoughnessExpression?: string;
  readonly skipMultiplyPatternOutsideBoundary?: boolean;
  readonly output?: "all" | "roughness" | "surface";
}

export function createWaterSurfaceAppearanceV2BoundaryStatements(
  appearance: CompiledWaterSurfaceAppearanceV2,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>,
  options: Readonly<WaterSurfaceBoundaryShaderOptions> = {}
): string {
  const {
    baseRoughnessExpression = "material_Roughness",
    skipMultiplyPatternOutsideBoundary = false,
    output = "all",
    boundedTime = false
  } = options;
  const hasAlpha = appearance.boundaryEffects.some((effect) => effect.outputs.alpha !== undefined);
  return renderWaterShaderTemplate(waterSurfaceAppearanceV2BoundaryEffectsShaderTemplate, {
    INCLUDE_NAMESPACE: output === "roughness" ? "ROUGHNESS" : "BOUNDARY",
    EMIT_ROUGHNESS: output === "surface" ? 0 : 1,
    ROUGHNESS_RESULT: output === "roughness" ? "resolvedBoundaryRoughness" : "effectiveSurfaceRoughness",
    COASTAL_ALPHA_INITIAL: hasAlpha ? "0.0" : "1.0",
    BOUNDARY_EFFECTS: appearance.boundaryEffects
      .map((effect, index) =>
        output === "roughness" && effect.outputs.roughness === undefined
          ? ""
          : renderBoundaryEffect(effect, index, fields, skipMultiplyPatternOutsideBoundary, output, boundedTime)
      )
      .join("\n"),
    BASE_ROUGHNESS: baseRoughnessExpression
  });
}

function depthResponseTemplateData(
  appearance: CompiledWaterSurfaceAppearanceV2,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>,
  section: 0 | 1,
  outputColorExpression = "waterColor",
  densityExpression = "appearanceDepthTintFactor",
  boundedTime = false
): Readonly<Record<string, string | number>> {
  const depth = appearance.depthResponse;
  const field =
    depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
      ? getWaterSurfaceAppearanceV2FieldExpression(depth.terms[0].field, fields)
      : getWaterSurfaceAppearanceV2FieldExpression(depth.field, fields);
  const firstField =
    depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
      ? getWaterSurfaceAppearanceV2FieldExpression(depth.terms[0].field, fields)
      : field;
  const secondField =
    depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential && depth.terms[1]
      ? getWaterSurfaceAppearanceV2FieldExpression(depth.terms[1].field, fields)
      : "0.0";
  const colorStopCount = depth.model === WaterSurfaceDepthResponseModelV2.ColorRamp ? depth.colors.length : 0;

  return {
    SECTION: section,
    REFRACTED_ALBEDO: Number(
      appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp
    ),
    HAS_CAUSTICS: Number(!!appearance.caustics),
    CAUSTICS_DEPTH: fields.sceneRayDepth.expression,
    CAUSTICS_OFFSET: boundedTime
      ? "material_AppearanceV2CausticsTransform.zw"
      : "elapsedTime * material_AppearanceV2CausticsTransform.zw",
    MODEL:
      depth.model === WaterSurfaceDepthResponseModelV2.BeerLambert && depth.scatteringTint
        ? 4
        : depthResponseSelector(depth.model),
    FIELD: field,
    DISTANCE: getWaterSurfaceAppearanceV2DepthProperty("distance"),
    EXPONENT: getWaterSurfaceAppearanceV2DepthProperty("exponent"),
    COLOR: getWaterSurfaceAppearanceV2DepthProperty("color"),
    COLOR_STOP_COUNT: colorStopCount,
    COLOR_0: getWaterSurfaceAppearanceV2ColorStopProperty(0, "color"),
    COLOR_1: getWaterSurfaceAppearanceV2ColorStopProperty(1, "color"),
    COLOR_2: getWaterSurfaceAppearanceV2ColorStopProperty(2, "color"),
    COLOR_3: getWaterSurfaceAppearanceV2ColorStopProperty(3, "color"),
    POSITION_0: getWaterSurfaceAppearanceV2ColorStopProperty(0, "position"),
    POSITION_1: getWaterSurfaceAppearanceV2ColorStopProperty(1, "position"),
    POSITION_2: getWaterSurfaceAppearanceV2ColorStopProperty(2, "position"),
    POSITION_3: getWaterSurfaceAppearanceV2ColorStopProperty(3, "position"),
    FIRST_FIELD: firstField,
    COEFFICIENT_0: getWaterSurfaceAppearanceV2DepthProperty("coefficient0"),
    SECOND_FIELD: secondField,
    COEFFICIENT_1: getWaterSurfaceAppearanceV2DepthProperty("coefficient1"),
    SHALLOW_COLOR: getWaterSurfaceAppearanceV2DepthProperty("shallowColor"),
    DEEP_COLOR: getWaterSurfaceAppearanceV2DepthProperty("deepColor"),
    DEBUG_VIEW: WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.depthDebugView,
    FINAL_THRESHOLD: WaterDepthResponseDebugView.Final + 0.5,
    SURFACE_NORMAL_DEPTH_THRESHOLD: WaterDepthResponseDebugView.SurfaceNormalDepth + 0.5,
    SCENE_RAY_DEPTH: fields.sceneRayDepth.expression,
    SCENE_RAY_TERM_THRESHOLD: WaterDepthResponseDebugView.SceneRayTerm + 0.5,
    SURFACE_NORMAL_DEPTH: fields.surfaceNormalDepth.expression,
    SURFACE_NORMAL_TERM_THRESHOLD: WaterDepthResponseDebugView.SurfaceNormalTerm + 0.5,
    DENSITY_THRESHOLD: WaterDepthResponseDebugView.Density + 0.5,
    DENSITY: densityExpression,
    OUTPUT_COLOR: outputColorExpression
  };
}

export function createWaterSurfaceAppearanceV2DepthResponseStatements(
  appearance: CompiledWaterSurfaceAppearanceV2,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>,
  options: Readonly<{ boundedTime?: boolean }> = {}
): string {
  return renderWaterShaderTemplate(
    waterSurfaceAppearanceV2DepthResponseShaderTemplate,
    depthResponseTemplateData(appearance, fields, 0, "waterColor", "appearanceDepthTintFactor", options.boundedTime)
  );
}

export function createWaterSurfaceAppearanceV2DepthDebugStatements(
  appearance: CompiledWaterSurfaceAppearanceV2,
  fields: Readonly<ResolvedWaterSurfaceFieldsV2>,
  outputColorExpression: string,
  densityExpression: string
): string {
  const depth = appearance.depthResponse;
  if (depth.model !== WaterSurfaceDepthResponseModelV2.CompositeExponential) return "";
  return renderWaterShaderTemplate(
    waterSurfaceAppearanceV2DepthResponseShaderTemplate,
    depthResponseTemplateData(appearance, fields, 1, outputColorExpression, densityExpression)
  );
}

function renderCompositionSection(
  section: 0 | 1 | 2 | 3 | 4,
  inputExpression = "closureInput",
  coastalAlphaExpression = "0.0",
  coastalAlphaWeightExpression = "0.0"
): string {
  return renderWaterShaderTemplate(waterSurfaceAppearanceV2CompositionShaderTemplate, {
    SECTION: section,
    INPUT: inputExpression,
    COASTAL_ALPHA: coastalAlphaExpression,
    COASTAL_ALPHA_WEIGHT: coastalAlphaWeightExpression
  });
}

/** Supplies authored alpha-policy inputs; the shared final Closure evaluates alpha exactly once. */
export function createWaterSurfaceAppearanceV2AlphaInputAssignments(
  appearance: CompiledWaterSurfaceAppearanceV2,
  inputExpression: string = "closureInput",
  coastalAlphaExpression: string = "appearanceCoastalAlpha",
  coastalAlphaWeightExpression: string = WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryAlphaEnabled
): string {
  if (
    inputExpression.trim().length === 0 ||
    coastalAlphaExpression.trim().length === 0 ||
    coastalAlphaWeightExpression.trim().length === 0
  ) {
    throw new TypeError("Water V2 alpha input and source expressions must be non-empty.");
  }
  const hasAlpha = appearance.boundaryEffects.some((effect) => effect.outputs.alpha !== undefined);
  return renderCompositionSection(
    0,
    inputExpression,
    hasAlpha ? coastalAlphaExpression : "0.0",
    hasAlpha ? coastalAlphaWeightExpression : "0.0"
  );
}

export function createWaterSurfaceAppearanceV2BoundaryColorStatements(
  _appearance: CompiledWaterSurfaceAppearanceV2
): string {
  return renderCompositionSection(1);
}

export function createWaterSurfaceAppearanceV2ClosureLightingStatements(
  appearance: CompiledWaterSurfaceAppearanceV2
): string {
  return appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp ||
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp
    ? renderCompositionSection(2)
    : "";
}

export function createWaterSurfaceAppearanceV2AlphaStatements(appearance: CompiledWaterSurfaceAppearanceV2): string {
  const hasAlpha = appearance.boundaryEffects.some((effect) => effect.outputs.alpha !== undefined);
  return renderCompositionSection(
    3,
    "closureInput",
    hasAlpha ? "appearanceCoastalAlpha" : "0.0",
    hasAlpha ? WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryAlphaEnabled : "0.0"
  );
}

export function createWaterSurfaceAppearanceV2PrecompositionStatements(
  appearance: CompiledWaterSurfaceAppearanceV2
): string {
  if (appearance.composition !== WaterSurfaceCompositionV2.PrecomposedReplace) return "";
  return renderCompositionSection(4);
}

export function getWaterSurfaceAppearanceV2RequiredTextureProperties(
  appearance: CompiledWaterSurfaceAppearanceV2
): readonly string[] {
  return Object.freeze([
    ...appearance.detailLayers.flatMap((layer, index) =>
      layer.source === WaterSurfaceDetailSource.NormalTexture
        ? [getWaterSurfaceAppearanceV2DetailProperty(index, "texture")]
        : []
    ),
    ...(appearance.caustics ? ["material_AppearanceV2CausticsTexture"] : [])
  ]);
}

export function getWaterSurfaceAppearanceV2ShaderSuffix(appearance: CompiledWaterSurfaceAppearanceV2): string {
  return appearance.variantKey.slice("surface-appearance-v2:".length);
}
