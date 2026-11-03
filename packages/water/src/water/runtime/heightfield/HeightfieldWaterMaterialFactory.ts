import { getRequiredWaterSurfaceV2Semantics } from "../../compiler/surface/WaterSurfaceClosureCompiler";
import type { WaterSurfaceFieldGraphReadback } from "../surface/WaterSurfaceFieldResolver";
import { bindWaterSurfaceCaustics } from "../surface/WaterSurfaceCausticsBinding";
import { registerWaterSurfacePicking } from "../surface/WaterSurfacePicking";
import { WATER_CONNECTION_SHADER } from "../connections/WaterConnectionBinding";
/** Dedicated heightfield-water shader: curved base surface, packed local map, waves, optics, and debug views. */
import heightfieldPlanarTransformTemplate from "../../shaders/heightfield/PlanarTransform.glsl?raw";
import heightfieldGeometryTemplate from "../../shaders/heightfield/HeightfieldGeometry.glsl?raw";
import heightfieldWavesTemplate from "../../shaders/heightfield/HeightfieldWaves.glsl?raw";
import heightfieldFlowSurfaceTemplate from "../../shaders/heightfield/FlowSurface.glsl?raw";
import heightfieldWakeFoamTemplate from "../../shaders/heightfield/WakeFoam.glsl?raw";
import heightfieldOpticalDepthTemplate from "../../shaders/heightfield/HeightfieldOpticalDepth.glsl?raw";
import heightfieldSceneColorRefractionTemplate from "../../shaders/heightfield/HeightfieldSceneColorRefraction.glsl?raw";
import heightfieldSurfaceLightingFunctionsTemplate from "../../shaders/heightfield/SurfaceLightingFunctions.glsl?raw";
import heightfieldDirectionalLightingTemplate from "../../shaders/heightfield/DirectionalLighting.glsl?raw";
import heightfieldSceneLightingUniformsTemplate from "../../shaders/heightfield/SceneLightingUniforms.glsl?raw";
import heightfieldDiffuseLightingTemplate from "../../shaders/heightfield/DiffuseLighting.glsl?raw";
import heightfieldFinalClosureTemplate from "../../shaders/heightfield/FinalClosure.glsl?raw";
import heightfieldSurfaceReflectionTemplate from "../../shaders/heightfield/SurfaceReflection.glsl?raw";
import heightfieldDebugTemplate from "../../shaders/heightfield/Debug.glsl?raw";
import heightfieldLocalMapDecodeTemplate from "../../shaders/heightfield/LocalMapDecode.glsl?raw";
import heightfieldScreenSpaceReflectionPassTemplate from "../../shaders/heightfield/ScreenSpaceReflectionPass.glsl?raw";
import heightfieldScreenSpaceReflectionSurfaceTemplate from "../../shaders/heightfield/ScreenSpaceReflectionSurface.glsl?raw";
import heightfieldForwardPassTemplate from "../../shaders/heightfield/ForwardPass.glsl?raw";
import heightfieldWaterShaderTemplate from "../../shaders/HeightfieldWater.shader?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import {
  registerGeneratedWaterShaderInclude,
  registerGeneratedWaterShaderModule,
  withScopedWaterShaderAssemblyRegistry
} from "../material/WaterShaderLibrary";
import {
  Engine,
  Material,
  ScreenSpaceReflection,
  ScreenSpaceReflectionReceiverMode,
  type Shader,
  ShaderMacro,
  Texture2D,
  type Texture
} from "@galacean/engine-core";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import {
  WaterPatternModelV2,
  WaterPatternResponseV2,
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic, WaterFieldConsumerActivation } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { getWaterSurfaceDepthResponseSemantics } from "../../authoring/surface/WaterSurfaceDepthResponseSemantics";
import { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterVisualUniformConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import type { HeightfieldWaterLocalMapAtlas } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import {
  applyWaterSurfaceReflectionBinding,
  applyWaterSurfaceTransientOpticalProfile,
  applyWaterSurfaceOpticsBinding,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import {
  WaterOpticsDebugView,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";
import { WATER_OPTICS_SHADER_PROPERTY } from "../optics/constants/WaterOpticsShaderConstants";
import {
  WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS,
  WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
} from "../optics/WaterEnvironmentReflectionShader";
import {
  createWaterSurfaceAppearanceBindingReadback,
  resolveWaterSurfaceAppearanceBinding,
  resolveWaterSurfaceAppearanceFields,
  writeWaterSurfaceAppearanceBindingReadback
} from "../surface/WaterSurfaceAppearanceBinding";
import type {
  WaterSurfaceAppearanceBindingV2,
  WaterSurfaceAppearanceBindingReadback
} from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import { createWaterSurfaceAppearanceShaderFunctions } from "../surface/WaterSurfaceAppearanceShader";
import { createWaterSurfaceDepthResponseShaderFunctions } from "../surface/WaterSurfaceDepthResponseShader";
import {
  WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY,
  createWaterSurfaceAppearanceV2AlphaInputAssignments,
  createWaterSurfaceAppearanceV2BoundaryStatements,
  createWaterSurfaceAppearanceV2DepthResponseStatements,
  createWaterSurfaceAppearanceV2NormalStatements,
  createWaterSurfaceAppearanceV2ShaderFunctions,
  createWaterSurfaceAppearanceV2UniformDeclarations,
  getWaterSurfaceAppearanceV2BoundaryProperty,
  getWaterSurfaceAppearanceV2DepthProperty,
  getWaterSurfaceAppearanceV2DetailProperty,
  getWaterSurfaceAppearanceV2RequiredTextureProperties,
  getWaterSurfaceAppearanceV2ShaderSuffix
} from "../surface/WaterSurfaceAppearanceV2Shader";
import {
  bindWaterSurfaceAppearanceV2Clock,
  updateWaterSurfaceAppearanceV2Clock,
  applyWaterSurfaceDepthResponseV2Uniforms
} from "../surface/WaterSurfaceAppearanceV2UniformBinding";
import {
  createWaterSurfaceV2EvaluationStatement,
  createWaterSurfaceV2ResolvedOutputStatement,
  getWaterSurfacePrimaryColorClosureModelValue
} from "../surface/WaterSurfaceClosureShader";
import { createWaterShaderSymbol, createWaterSurfaceGeometryAdapter } from "../surface/WaterSurfaceGeometryAdapter";
import { createResolvedWaterSurfaceFieldsV2 } from "../surface/WaterSurfaceResolvedFields";
import { assembleWaterSurfaceShader } from "../surface/WaterSurfaceShaderAssembler";
import { createWaterContactFoamShaderFunctions } from "../surface/WaterContactFoamShader";
import { createWaterAnimatedVoronoiF1ShaderFunctions } from "../surface/WaterAnimatedVoronoiF1Shader";
import { createWaterSpatialFieldShaderDecodeFunctions } from "../spatial/WaterSpatialFieldShaderDecode";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode,
  HeightfieldWaterOpticsCalibrationMode
} from "./HeightfieldWaterRuntimeEnums";
import {
  DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
  type HeightfieldWaterReflectionSamplingConfig,
  type HeightfieldWaterReflectionSamplingFallbackReason,
  type HeightfieldWaterReflectionSamplingReadback
} from "./HeightfieldWaterReflectionSampling";
import {
  HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS,
  createHeightfieldWaterRainRippleNormalStatements
} from "./HeightfieldWaterRainRippleShader";
import {
  DEFAULT_HEIGHTFIELD_WATER_LOCAL_FOAM_MASK,
  DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS,
  HEIGHTFIELD_WATER_SHADER_PROPERTY,
  HEIGHTFIELD_WATER_SURFACE_TUNING,
  HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS
} from "./constants";
import { bindHeightfieldWaterBaseMaterial, bindHeightfieldWaterWaves } from "./HeightfieldWaterMaterialBinding";
import { resolveHeightfieldWaterMaterialVariant } from "./HeightfieldWaterMaterialVariant";
import {
  createWaterShaderModule,
  resolveWaterShaderModule,
  type WaterShaderModule
} from "../material/WaterShaderModule";
import { getWaterSurfaceDetailTexture } from "../wave/WaterSurfaceDetailTextureFactory";
import type {
  HeightfieldWaterFeatureFlags,
  HeightfieldWaterLocalFoamMask,
  HeightfieldWaterMaterialState,
  HeightfieldWaterOpticsCalibrationReadback,
  HeightfieldWaterScreenSpaceReflectionConsumptionReadback,
  HeightfieldWaterSurfaceAppearanceFeatureFlags,
  MutableHeightfieldWaterSurfaceOpticsBinding
} from "./types";

/** Heightfield-owned expressions projected into the backend-neutral shared closure vocabulary. */
export const HEIGHTFIELD_WATER_SURFACE_GEOMETRY_ADAPTER = createWaterSurfaceGeometryAdapter({
  id: "heightfield",
  inputs: {
    positionWS: createWaterShaderSymbol("vec3", "input.worldPosition"),
    macroNormalWS: createWaterShaderSymbol("vec3", "input.macroNormalWS"),
    tangentWS: createWaterShaderSymbol("vec3", "input.tangentWS"),
    bitangentWS: createWaterShaderSymbol(
      "vec3",
      "safeNormalize3(cross(input.macroNormalWS, input.tangentWS), vec3(0.0, 0.0, 1.0))"
    ),
    meshUv: createWaterShaderSymbol("vec2", "input.atlasUv"),
    flowWS: createWaterShaderSymbol("vec2", "waterLocalDirectionToWorldXZ(flowXZ)"),
    coverage: createWaterShaderSymbol("float", "coverage"),
    verticalDepth: createWaterShaderSymbol("float", "authoredDepth"),
    horizontalShoreDistance: createWaterShaderSymbol("float", "signedDistance"),
    obstacleContact: createWaterShaderSymbol("float", "heightfieldObstacleContact"),
    waveCrest: createWaterShaderSymbol("float", "max(input.waveOffset, 0.0)")
  },
  requiredBindings: ["material_LocalMapTexture", "material_LocalMapDecode"]
});

const IDENTITY_WATER_WORLD_TO_LOCAL_PLANAR = new Vector4(1, 0, 0, 0);
const PRESENTATION_REVEAL_MACRO = ShaderMacro.getByName("MATERIAL_WATER_PRESENTATION_REVEAL");

interface NullableTextureShaderData {
  setTexture(propertyName: string, value: Texture | null): void;
}

type MutableHeightfieldReflectionReadback = {
  -readonly [Property in keyof HeightfieldWaterReflectionSamplingReadback]: HeightfieldWaterReflectionSamplingReadback[Property];
};

type MutableHeightfieldWaterOpticsCalibrationReadback = {
  -readonly [Property in keyof HeightfieldWaterOpticsCalibrationReadback]: HeightfieldWaterOpticsCalibrationReadback[Property];
};

type MutableHeightfieldWaterScreenSpaceReflectionConsumptionReadback = {
  -readonly [Property in keyof HeightfieldWaterScreenSpaceReflectionConsumptionReadback]: HeightfieldWaterScreenSpaceReflectionConsumptionReadback[Property];
};

type MutableWaterSurfaceOpticsBindingReadback = {
  -readonly [Property in keyof WaterSurfaceOpticsBindingReadback]: WaterSurfaceOpticsBindingReadback[Property];
};

function resolveHeightfieldOpticsTier(quality: WaterQualityTier, requestedTier: WaterOpticsTier): WaterOpticsTier {
  if (quality !== WaterQualityTier.High) return "medium";
  return requestedTier === "experimental" ? "experimental" : "high";
}

function createHeightfieldReflectionReadback(quality: WaterQualityTier): MutableHeightfieldReflectionReadback {
  return Object.seal({
    ...DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
    quality,
    requestedSource: "sky",
    bindingResolvedSource: "sky",
    effectiveSource: "sky",
    fallbackReason: undefined,
    textureWidth: 0,
    textureHeight: 0,
    filterSampleCount: 1
  });
}

function createHeightfieldWaterOpticsCalibrationReadback(): MutableHeightfieldWaterOpticsCalibrationReadback {
  return Object.seal({
    mode: HeightfieldWaterOpticsCalibrationMode.None,
    referenceCompositionEnabled: false,
    effectiveFresnelOverride: undefined
  });
}

function createHeightfieldWaterScreenSpaceReflectionConsumptionReadback(): MutableHeightfieldWaterScreenSpaceReflectionConsumptionReadback {
  return Object.seal({
    requested: true,
    effective: false,
    requestedIntensity: 1,
    effectiveIntensity: 0
  });
}

function updateHeightfieldWaterScreenSpaceReflectionConsumption(
  state: HeightfieldWaterMaterialState
): Readonly<HeightfieldWaterScreenSpaceReflectionConsumptionReadback> {
  const readback =
    state.screenSpaceReflectionConsumptionReadback as MutableHeightfieldWaterScreenSpaceReflectionConsumptionReadback;
  const effectiveIntensity = state.bindingReadback.effectiveSource === "ssr" ? readback.requestedIntensity : 0;
  readback.requested = readback.requestedIntensity > 0;
  readback.effective = effectiveIntensity > 0;
  readback.effectiveIntensity = effectiveIntensity;
  state.material.shaderData.setFloat(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.screenSpaceReflectionCompositeIntensity,
    readback.requestedIntensity
  );
  return readback;
}

function mapHeightfieldReflectionFallback(
  fallbackReason: WaterSurfaceOpticsReflectionReadback["fallbackReason"]
): HeightfieldWaterReflectionSamplingFallbackReason | undefined {
  switch (fallbackReason) {
    case "water-optics-probe-texture-unavailable":
      return "heightfield-probe-texture-unavailable";
    case "water-optics-environment-metadata-invalid":
      return "heightfield-environment-metadata-invalid";
    default:
      return fallbackReason;
  }
}

function updateHeightfieldReflectionReadback(
  state: HeightfieldWaterMaterialState,
  sharedReadback: Readonly<WaterSurfaceOpticsReflectionReadback>,
  requestedBinding: Readonly<WaterReflectionBinding> | undefined
): void {
  const readback = state.heightfieldReflectionReadback as MutableHeightfieldReflectionReadback;
  readback.distortionStrength = sharedReadback.distortionStrength;
  readback.edgeFadeTexels = sharedReadback.edgeFadeTexels;
  readback.minimumClipW = sharedReadback.minimumClipW;
  readback.roughnessFootprintTexels = sharedReadback.roughnessFootprintTexels;
  readback.highFilterSampleCount = sharedReadback.highFilterSampleCount;
  readback.quality = state.quality;
  readback.requestedSource = requestedBinding?.requestedSource ?? "sky";
  readback.bindingResolvedSource = requestedBinding?.resolvedSource ?? "sky";
  readback.effectiveSource = sharedReadback.effectiveSource;
  readback.fallbackReason = mapHeightfieldReflectionFallback(
    sharedReadback.fallbackReason ?? requestedBinding?.fallbackReason
  );
  readback.textureWidth = sharedReadback.textureWidth;
  readback.textureHeight = sharedReadback.textureHeight;
  readback.filterSampleCount = sharedReadback.filterSampleCount;
}

function applyCachedHeightfieldWaterSurfaceOpticsBinding(
  state: HeightfieldWaterMaterialState
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const cachedBinding = state.surfaceOpticsBinding;
  const requestedReflection = cachedBinding.reflection;
  const requestedDebugView = cachedBinding.debugView;
  cachedBinding.debugView = resolveHeightfieldWaterEffectiveDebugView(
    requestedDebugView,
    state.surfaceAppearanceReadback.active
  );
  let readback: Readonly<WaterSurfaceOpticsBindingReadback>;
  try {
    readback = applyWaterSurfaceOpticsBinding(state.material.shaderData, state, cachedBinding);
  } finally {
    cachedBinding.reflection = requestedReflection;
    cachedBinding.debugView = requestedDebugView;
  }
  updateHeightfieldReflectionReadback(state, readback, requestedReflection);
  applyHeightfieldWaterScreenSpaceReflectionReceiver(state, readback.effectiveSource === "ssr");
  updateHeightfieldWaterScreenSpaceReflectionConsumption(state);
  return readback;
}

function applyHeightfieldWaterScreenSpaceReflectionReceiver(
  state: HeightfieldWaterMaterialState,
  enabled: boolean
): void {
  const registered = ScreenSpaceReflection.setMaterialReceiver(
    state.material,
    enabled ? ScreenSpaceReflectionReceiverMode.TransparentSampleOnly : ScreenSpaceReflectionReceiverMode.Disabled,
    enabled ? 1 : 0
  );
  if (!registered) {
    const capability = ScreenSpaceReflection.getMaterialReceiverCapability(state.material);
    throw new Error(
      `Heightfield Water shader '${state.material.shader.name}' does not implement the Core SSR receiver contract: ${capability.unsupportedReason ?? "unknown"}.`
    );
  }
}

/** Clears explicit Core receiver registration before material teardown. */
export function disableHeightfieldWaterScreenSpaceReflectionReceiver(state: HeightfieldWaterMaterialState): void {
  ScreenSpaceReflection.setMaterialReceiver(state.material, ScreenSpaceReflectionReceiverMode.Disabled, 0);
}

function resolveHeightfieldWaterEffectiveDebugView(
  requestedDebugView: number,
  surfaceAppearanceActive: boolean
): WaterOpticsDebugView {
  if (
    !Number.isInteger(requestedDebugView) ||
    requestedDebugView < WaterOpticsDebugView.Final ||
    requestedDebugView > WaterOpticsDebugView.CompositeReflection
  ) {
    return WaterOpticsDebugView.Final;
  }
  if (
    requestedDebugView >= WaterOpticsDebugView.DetailNormal &&
    requestedDebugView <= WaterOpticsDebugView.EffectiveRoughness &&
    !surfaceAppearanceActive
  ) {
    return WaterOpticsDebugView.Final;
  }
  return requestedDebugView as WaterOpticsDebugView;
}

function refreshHeightfieldWaterAppearanceDebugView(state: HeightfieldWaterMaterialState): void {
  const requestedDebugView = state.surfaceOpticsBinding.debugView;
  if (requestedDebugView < WaterOpticsDebugView.DetailNormal) return;
  const effectiveDebugView = resolveHeightfieldWaterEffectiveDebugView(
    requestedDebugView,
    state.surfaceAppearanceReadback.active
  );
  state.material.shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.debugMode, effectiveDebugView);
  (state.bindingReadback as MutableWaterSurfaceOpticsBindingReadback).debugView = effectiveDebugView;
}

function applyHeightfieldWaterSurfaceAppearanceFeatureFlags(state: HeightfieldWaterMaterialState): void {
  const readback = state.surfaceAppearanceReadback;
  const active = readback.active;
  const flags = state.surfaceAppearanceFeatureFlags;
  const shaderData = state.material.shaderData;
  const v2Active = active && readback.schemaVersion === WaterSurfaceAppearanceSchemaVersion.V2;
  shaderData.setFloat(
    WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.detailEnabled,
    v2Active && flags.externalNormal ? 1 : 0
  );
  shaderData.setFloat(
    WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.depthResponseEnabled,
    v2Active && flags.depthTint ? 1 : 0
  );
  shaderData.setFloat(
    WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryAlphaEnabled,
    v2Active && flags.coastalAlpha ? 1 : 0
  );
  shaderData.setFloat(
    WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryMaterialEnabled,
    v2Active && flags.contactFoam ? 1 : 0
  );
  shaderData.setFloat(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.appearanceDirectSpecularEnabled,
    active && flags.directSpecular ? 1 : 0
  );
}

function glsl(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS = heightfieldPlanarTransformTemplate;

function surfaceLayerCount(quality: WaterQualityTier): number {
  switch (quality) {
    case WaterQualityTier.Low:
      return 1;
    case WaterQualityTier.Medium:
      return 2;
    case WaterQualityTier.High:
      return 3;
  }
}

function flowSurfaceLayerStatements(quality: WaterQualityTier): string {
  const layerCount = surfaceLayerCount(quality);
  const {
    layerScales,
    layerRates,
    layerWeights,
    layerOffsets,
    layerCycleJumps,
    layerSpatialPhaseVectors,
    stillWaterDirections
  } = HEIGHTFIELD_WATER_SURFACE_TUNING;
  return renderWaterShaderTemplate(heightfieldFlowSurfaceTemplate, {
    LAYER_COUNT: layerCount,
    STILL_DIRECTION_0_X: glsl(stillWaterDirections[0][0]),
    STILL_DIRECTION_0_Y: glsl(stillWaterDirections[0][1]),
    STILL_DIRECTION_1_X: glsl(stillWaterDirections[1][0]),
    STILL_DIRECTION_1_Y: glsl(stillWaterDirections[1][1]),
    STILL_DIRECTION_2_X: glsl(stillWaterDirections[2][0]),
    STILL_DIRECTION_2_Y: glsl(stillWaterDirections[2][1]),
    LAYER_SCALE_0: glsl(layerScales[0]),
    LAYER_SCALE_1: glsl(layerScales[1]),
    LAYER_SCALE_2: glsl(layerScales[2]),
    LAYER_RATE_0: glsl(layerRates[0]),
    LAYER_RATE_1: glsl(layerRates[1]),
    LAYER_RATE_2: glsl(layerRates[2]),
    LAYER_OFFSET_0_X: glsl(layerOffsets[0][0]),
    LAYER_OFFSET_0_Y: glsl(layerOffsets[0][1]),
    LAYER_OFFSET_1_X: glsl(layerOffsets[1][0]),
    LAYER_OFFSET_1_Y: glsl(layerOffsets[1][1]),
    LAYER_OFFSET_2_X: glsl(layerOffsets[2][0]),
    LAYER_OFFSET_2_Y: glsl(layerOffsets[2][1]),
    LAYER_CYCLE_JUMP_0_X: glsl(layerCycleJumps[0][0]),
    LAYER_CYCLE_JUMP_0_Y: glsl(layerCycleJumps[0][1]),
    LAYER_CYCLE_JUMP_1_X: glsl(layerCycleJumps[1][0]),
    LAYER_CYCLE_JUMP_1_Y: glsl(layerCycleJumps[1][1]),
    LAYER_CYCLE_JUMP_2_X: glsl(layerCycleJumps[2][0]),
    LAYER_CYCLE_JUMP_2_Y: glsl(layerCycleJumps[2][1]),
    LAYER_SPATIAL_PHASE_0_X: glsl(layerSpatialPhaseVectors[0][0]),
    LAYER_SPATIAL_PHASE_0_Y: glsl(layerSpatialPhaseVectors[0][1]),
    LAYER_SPATIAL_PHASE_1_X: glsl(layerSpatialPhaseVectors[1][0]),
    LAYER_SPATIAL_PHASE_1_Y: glsl(layerSpatialPhaseVectors[1][1]),
    LAYER_SPATIAL_PHASE_2_X: glsl(layerSpatialPhaseVectors[2][0]),
    LAYER_SPATIAL_PHASE_2_Y: glsl(layerSpatialPhaseVectors[2][1]),
    LAYER_WEIGHT_0: glsl(layerWeights[0]),
    LAYER_WEIGHT_1: glsl(layerWeights[1]),
    LAYER_WEIGHT_2: glsl(layerWeights[2]),
    LAYER_WEIGHT_SUM_1: glsl(layerWeights[0]),
    LAYER_WEIGHT_SUM_2: glsl(layerWeights[0] + layerWeights[1]),
    LAYER_WEIGHT_SUM_3: glsl(layerWeights[0] + layerWeights[1] + layerWeights[2])
  });
}

function wakeFoamStatements(quality: WaterQualityTier): string {
  const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
  const tapCount = quality === WaterQualityTier.Low ? 0 : quality === WaterQualityTier.Medium ? 1 : 2;
  const primaryTapDistance =
    quality === WaterQualityTier.High ? tuning.highWakeTapDistances[0] : tuning.mediumWakeTapDistance;
  return renderWaterShaderTemplate(heightfieldWakeFoamTemplate, {
    WAKE_TAP_COUNT: tapCount,
    WAKE_TAP_DISTANCE_0: glsl(primaryTapDistance),
    WAKE_TAP_DISTANCE_1: glsl(tuning.highWakeTapDistances[1]),
    WAKE_LATERAL_PROBE_DISTANCE: glsl(tuning.wakeLateralProbeDistance),
    WAKE_LATERAL_WET_SDF_START: glsl(tuning.wakeLateralWetSdfStart),
    WAKE_LATERAL_WET_SDF_END: glsl(tuning.wakeLateralWetSdfEnd),
    WAKE_DRY_SDF_START: glsl(tuning.wakeDrySdfStart),
    WAKE_DRY_SDF_END: glsl(tuning.wakeDrySdfEnd),
    WAKE_SECONDARY_WEIGHT: glsl(tuning.highWakeSecondaryWeight),
    WAKE_INTERIOR_SDF_START: glsl(tuning.wakeInteriorSdfStart),
    WAKE_INTERIOR_SDF_END: glsl(tuning.wakeInteriorSdfEnd),
    WAKE_DETAIL_NOISE_START: glsl(tuning.wakeDetailNoiseStart),
    WAKE_DETAIL_NOISE_END: glsl(tuning.wakeDetailNoiseEnd),
    WAKE_FOAM_STRENGTH: glsl(tuning.wakeFoamStrength)
  });
}

function localMapDecodeStatements(useLocalBathymetry: boolean, fragmentStage: boolean): string {
  return renderWaterShaderTemplate(heightfieldLocalMapDecodeTemplate, {
    VALUE_001_LOCAL_BATHYMETRY_VERTEX: useLocalBathymetry && !fragmentStage ? 1 : 0,
    VALUE_002_PACKED_LOCAL_MAP_VERTEX: !useLocalBathymetry && !fragmentStage ? 1 : 0,
    VALUE_003_LOCAL_BATHYMETRY_FRAGMENT: useLocalBathymetry && fragmentStage ? 1 : 0,
    VALUE_004_PACKED_LOCAL_MAP_FRAGMENT: !useLocalBathymetry && fragmentStage ? 1 : 0
  });
}

function heightfieldGeometryFunctions(): string {
  const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
  return (
    WATER_CONNECTION_SHADER +
    renderWaterShaderTemplate(heightfieldGeometryTemplate, {
      TIME_PERIOD_SECONDS: HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS.toFixed(1),
      MINIMUM_FLOW_SPEED: glsl(tuning.minimumFlowSpeed),
      FLOW_WEIGHT_MAXIMUM_SPEED: glsl(tuning.maximumFlowSpeed * 0.42),
      MAXIMUM_FLOW_SPEED: glsl(tuning.maximumFlowSpeed),
      PHASE_RATE: glsl(tuning.phaseRate),
      STILL_CYCLE_RATE_SCALE: glsl(tuning.stillCycleRateScale),
      FLOWING_CYCLE_RATE_BASE: glsl(tuning.flowingCycleRateBase),
      FLOWING_CYCLE_RATE_SPEED_SCALE: glsl(tuning.flowingCycleRateSpeedScale),
      PHASE_TRAVEL: glsl(tuning.phaseTravel),
      STILL_PHASE_TRAVEL_SCALE: glsl(tuning.stillPhaseTravelScale),
      FLOWING_PHASE_TRAVEL_BASE: glsl(tuning.flowingPhaseTravelBase),
      FLOWING_PHASE_TRAVEL_SPEED_SCALE: glsl(tuning.flowingPhaseTravelSpeedScale),
      PHASE_B_OFFSET_X: glsl(tuning.phaseBOffset[0]),
      PHASE_B_OFFSET_Y: glsl(tuning.phaseBOffset[1])
    })
  );
}

function heightfieldWaveStatements(waveCount: number): string {
  return renderWaterShaderTemplate(heightfieldWavesTemplate, {
    WAVE_COUNT: waveCount,
    WAVE_A_PREFIX: HEIGHTFIELD_WATER_SHADER_PROPERTY.waveAPrefix,
    WAVE_B_PREFIX: HEIGHTFIELD_WATER_SHADER_PROPERTY.waveBPrefix
  });
}

function heightfieldOpticalDepthStatements(
  stage: 0 | 1,
  useSceneDepth: boolean,
  useLocalBathymetry: boolean,
  declareLocalBathymetryScreenUv: boolean
): string {
  return renderWaterShaderTemplate(heightfieldOpticalDepthTemplate, {
    OPTICAL_DEPTH_STAGE: stage,
    DECLARE_LOCAL_BATHYMETRY_SCREEN_UV: declareLocalBathymetryScreenUv ? 1 : 0,
    USE_LOCAL_BATHYMETRY: useLocalBathymetry ? 1 : 0,
    USE_SCENE_DEPTH: useSceneDepth ? 1 : 0
  });
}

function sceneColorRefractionV2(
  _quality: WaterQualityTier,
  appearance: CompiledWaterSurfaceAppearanceV2,
  useSceneDepth: boolean,
  useOpaqueTexture: boolean,
  useLocalBathymetry: boolean
): string {
  if (!useOpaqueTexture) return "";
  if (
    appearance.refraction.enabled &&
    appearance.refraction.validation !== WaterRefractionValidationModeV2.LocalOnlySafe &&
    !useSceneDepth
  ) {
    throw new Error("Surface Appearance V2 scene-depth refraction validation requires Camera Depth.");
  }
  const tuning = HEIGHTFIELD_WATER_SURFACE_TUNING;
  const validationMode = !useSceneDepth
    ? 0
    : appearance.refraction.validation === WaterRefractionValidationModeV2.ShiftedSceneDepth
      ? 1
      : 2;
  return renderWaterShaderTemplate(heightfieldSceneColorRefractionTemplate, {
    REFRACTION_FEATURE_ENABLED: appearance.refraction.enabled ? "1.0" : "0.0",
    REFRACTION_NORMAL_SOURCE:
      appearance.refraction.normalSource === WaterRefractionNormalSourceV2.FirstDetailLayer
        ? 2
        : appearance.refraction.normalSource === WaterRefractionNormalSourceV2.TangentSpace
          ? 1
          : 0,
    REFRACTION_VALIDATION_MODE: validationMode,
    USE_LOCAL_BATHYMETRY: useLocalBathymetry ? 1 : 0,
    REFRACTION_DEPTH_START: glsl(tuning.refractionDepthStart),
    REFRACTION_DEPTH_END: glsl(tuning.refractionDepthEnd),
    REFRACTION_DEPTH_TOLERANCE_MINIMUM: glsl(tuning.refractionDepthToleranceMinimum),
    REFRACTION_DEPTH_TOLERANCE_SCALE: glsl(tuning.refractionDepthToleranceScale),
    REFRACTION_UV_SCALE_PROPERTY: WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.refractionUvScale
  });
}

function contactFoamShaderFunctionsV2(appearance: CompiledWaterSurfaceAppearanceV2): string {
  const maximumOctavesFor = (model: WaterPatternModelV2): 0 | 1 | 2 | 3 =>
    appearance.boundaryEffects.reduce<0 | 1 | 2 | 3>(
      (maximum, effect) =>
        Math.max(maximum, effect.pattern?.model === model ? effect.pattern.octaves.count : 0) as 0 | 1 | 2 | 3,
      0
    );
  const deterministicOctaves = maximumOctavesFor(WaterPatternModelV2.Voronoi);
  const animatedOctaves = maximumOctavesFor(WaterPatternModelV2.AnimatedVoronoiF1);
  return [
    deterministicOctaves === 0 ? "" : createWaterContactFoamShaderFunctions(deterministicOctaves),
    animatedOctaves === 0 ? "" : createWaterAnimatedVoronoiF1ShaderFunctions(animatedOctaves)
  ].join("");
}

function surfaceAppearanceLightingFunctions(): string {
  return heightfieldSurfaceLightingFunctionsTemplate;
}

function sceneLightingUniformDeclarations(): string {
  const directionalLighting = heightfieldDirectionalLightingTemplate;
  return renderWaterShaderTemplate(heightfieldSceneLightingUniformsTemplate, {
    VALUE_001_DIRECTIONALLIGHTING: directionalLighting
  });
}

function waterDiffuseLightingStatements(litSceneColorClosure: boolean): string {
  return renderWaterShaderTemplate(heightfieldDiffuseLightingTemplate, {
    VALUE_001_LITSCENECOLORCLOSURE_1_0_0_0: litSceneColorClosure ? "1.0" : "0.0"
  });
}

function createHeightfieldV2FinalClosureStatements(appearance: CompiledWaterSurfaceAppearanceV2): string {
  const litSceneColorClosure =
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp ||
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp;
  const composition = appearance.composition === WaterSurfaceCompositionV2.PrecomposedReplace ? "1.0" : "0.0";
  const primaryColorClosureModel = getWaterSurfacePrimaryColorClosureModelValue(appearance.primaryColorClosure).toFixed(
    1
  );
  const refractionEnabled = appearance.refraction.enabled ? "1.0" : "0.0";
  const surfaceColor =
    appearance.depthResponse.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
      ? `${getWaterSurfaceAppearanceV2DepthProperty("shallowColor")}.rgb`
      : "material_ShallowColor.rgb";
  return renderWaterShaderTemplate(heightfieldFinalClosureTemplate, {
    VALUE_001_PRIMARYCOLORCLOSUREMODEL: primaryColorClosureModel,
    VALUE_002_REFRACTIONENABLED: refractionEnabled,
    VALUE_003_SURFACECOLOR: surfaceColor,
    VALUE_004_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_DEPTHRES:
      WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.depthResponseEnabled,
    VALUE_005_PRIMARYCOLORCLOSUREMODEL: primaryColorClosureModel,
    VALUE_006_LITSCENECOLORCLOSURE_1_0_0_0: litSceneColorClosure ? "1.0" : "0.0",
    VALUE_007_CREATEWATERSURFACEAPPEARANCEV2ALPHAINPUTASSIGNMENTS_:
      createWaterSurfaceAppearanceV2AlphaInputAssignments(appearance),
    VALUE_008_COMPOSITION: composition,
    VALUE_009_CREATEWATERSURFACEV2EVALUATIONSTATEMENT_RESOLVEDWATE: createWaterSurfaceV2EvaluationStatement(
      "resolvedWaterClosure",
      "closureInput",
      litSceneColorClosure ? "0.0" : undefined
    )
  });
}

function surfaceReflectionStatements(_quality: WaterQualityTier): string {
  return heightfieldSurfaceReflectionTemplate;
}

function heightfieldDebugStatements(useSceneDepth: boolean): string {
  return renderWaterShaderTemplate(heightfieldDebugTemplate, {
    FINAL_MODE: HeightfieldWaterDebugMode.Final + 0.5,
    BASE_HEIGHT_MODE: HeightfieldWaterDebugMode.BaseHeight + 0.5,
    BASE_NORMAL_MODE: HeightfieldWaterDebugMode.BaseNormal + 0.5,
    SIGNED_DISTANCE_MODE: HeightfieldWaterDebugMode.SignedDistance + 0.5,
    DEPTH_MODE: HeightfieldWaterDebugMode.Depth + 0.5,
    FLOW_MODE: HeightfieldWaterDebugMode.Flow + 0.5,
    WAVE_DISPLACEMENT_MODE: HeightfieldWaterDebugMode.WaveDisplacement + 0.5,
    CENTERED_OPAQUE_COLOR_MODE: HeightfieldWaterDebugMode.CenteredOpaqueColor + 0.5,
    DISPLACED_OPAQUE_COLOR_MODE: HeightfieldWaterDebugMode.DisplacedOpaqueColor + 0.5,
    REFRACTION_UV_DELTA_MODE: HeightfieldWaterDebugMode.RefractionUvDelta + 0.5,
    OPTICAL_DEPTH_MODE: HeightfieldWaterDebugMode.OpticalDepth + 0.5,
    DEPTH_CONTINUITY_MODE: HeightfieldWaterDebugMode.DepthContinuity + 0.5,
    SAMPLE_VALIDITY_MODE: HeightfieldWaterDebugMode.SampleValidity + 0.5,
    FRESNEL_MODE: HeightfieldWaterDebugMode.Fresnel + 0.5,
    SHADER_COMPOSITED_COLOR_MODE: HeightfieldWaterDebugMode.ShaderCompositedColor + 0.5,
    SURFACE_ALPHA_MODE: HeightfieldWaterDebugMode.SurfaceAlpha + 0.5,
    REFLECTION_SOURCE_MODE: HeightfieldWaterDebugMode.ReflectionSource + 0.5,
    REFRACTION_AMOUNT_MODE: HeightfieldWaterDebugMode.RefractionAmount + 0.5,
    REFRACTION_GATES_MODE: HeightfieldWaterDebugMode.RefractionGates + 0.5,
    REFLECTION_COLOR_MODE: HeightfieldWaterDebugMode.ReflectionColor + 0.5,
    NORMAL_DOT_VIEW_MODE: HeightfieldWaterDebugMode.NormalDotView + 0.5,
    DETAIL_NORMAL_MODE: HeightfieldWaterDebugMode.DetailNormal + 0.5,
    SCENE_DEPTH_DELTA_MODE: HeightfieldWaterDebugMode.SceneDepthDelta + 0.5,
    DEPTH_DEBUG_VALUE: useSceneDepth ? "sceneDepthDelta" : "authoredDepth",
    DEPTH_TINT_MODE: HeightfieldWaterDebugMode.DepthTint + 0.5,
    CONTACT_FOAM_MODE: HeightfieldWaterDebugMode.ContactFoam + 0.5,
    COASTAL_ALPHA_MODE: HeightfieldWaterDebugMode.CoastalAlpha + 0.5,
    DIRECT_SPECULAR_MODE: HeightfieldWaterDebugMode.DirectSpecular + 0.5,
    EFFECTIVE_ROUGHNESS_MODE: HeightfieldWaterDebugMode.EffectiveRoughness + 0.5,
    ENVIRONMENT_REFLECTION_MODE: HeightfieldWaterDebugMode.EnvironmentReflection + 0.5
  });
}

function surfaceAppearanceV2RequiresSceneDepth(appearance: CompiledWaterSurfaceAppearanceV2): boolean {
  const depthResponseFields = getWaterSurfaceDepthResponseSemantics(appearance.depthResponse);
  return (
    (appearance.refraction.enabled &&
      appearance.refraction.validation !== WaterRefractionValidationModeV2.LocalOnlySafe) ||
    depthResponseFields.some(
      (field) =>
        field === WaterFieldSemantic.SceneEyeDepth ||
        field === WaterFieldSemantic.SceneRayDepth ||
        field === WaterFieldSemantic.SurfaceNormalDepth
    ) ||
    appearance.boundaryEffects.some(
      (effect) =>
        effect.field === WaterFieldSemantic.SceneEyeDepth ||
        effect.field === WaterFieldSemantic.SceneRayDepth ||
        effect.field === WaterFieldSemantic.ObstacleContact
    )
  );
}

function surfaceAppearanceV2UsesOpaqueColor(appearance: CompiledWaterSurfaceAppearanceV2): boolean {
  return getRequiredWaterSurfaceV2Semantics(appearance).has(WaterFieldSemantic.SceneColor);
}

/**
 * Transparent Water does not participate in the opaque SSR composite. This
 * second phase publishes only its displaced receiver surface; Forward samples
 * the camera result and applies Water Fresnel/intensity exactly once.
 */
function screenSpaceReflectionSurfacePass(
  quality: WaterQualityTier,
  waveCount: number,
  appearance: CompiledWaterSurfaceAppearanceV2
): string {
  const appearanceUniforms = createWaterSurfaceAppearanceV2UniformDeclarations(appearance);
  const appearanceNormalStatements = createWaterSurfaceAppearanceV2NormalStatements(appearance, { boundedTime: true });
  const shaderTemplateReplacements: Readonly<Record<string, string | number>> = {
    VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG:
      ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT_TAG,
    VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
    VALUE_004_APPEARANCEUNIFORMS: registerGeneratedWaterShaderModule(
      "HeightfieldSsrAppearanceUniforms",
      appearanceUniforms
    ),
    SSR_WAVE_COUNT: waveCount,
    VALUE_007_HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldSsrPlanarTransform",
      HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS
    ),
    VALUE_008_HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldSsrRainRipple",
      HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS
    ),
    VALUE_009_CREATEWATERSURFACEAPPEARANCESHADERFUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldSsrAppearance",
      createWaterSurfaceAppearanceShaderFunctions()
    ),
    VALUE_010_CREATEWATERSURFACEAPPEARANCEV2SHADERFUNCTIONS_APPEARANCE: registerGeneratedWaterShaderModule(
      "HeightfieldSsrAppearanceV2",
      createWaterSurfaceAppearanceV2ShaderFunctions(appearance)
    ),
    HEIGHTFIELD_GEOMETRY_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldSsrGeometry",
      heightfieldGeometryFunctions()
    ),
    VALUE_024_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed
    ),
    VALUE_025_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42
    ),
    VALUE_026_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MACROFLOWALIGNMENT: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.macroFlowAlignment
    ),
    VALUE_027_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMACROAMPLITUD: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.stillMacroAmplitudeScale
    ),
    VALUE_029_WAVEAPPLYSTATEMENTS_WAVECOUNT: registerGeneratedWaterShaderModule(
      "HeightfieldSsrWaves",
      heightfieldWaveStatements(waveCount)
    ),
    VALUE_030_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed
    ),
    VALUE_031_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42
    ),
    VALUE_032_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_FLOWINGDIRECTIONWE: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.flowingDirectionWeight
    ),
    VALUE_033_FLOWSURFACELAYERSTATEMENTS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldSsrFlowSurfaceLayers",
      flowSurfaceLayerStatements(quality)
    ),
    VALUE_034_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMNORMALSTREN: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.minimumNormalStrength
    ),
    VALUE_035_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMICRONORMALSC: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.stillMicroNormalScale
    ),
    VALUE_036_APPEARANCENORMALSTATEMENTS: registerGeneratedWaterShaderModule(
      "HeightfieldSsrAppearanceNormal",
      appearanceNormalStatements
    ),
    VALUE_037_CREATEHEIGHTFIELDWATERRAINRIPPLENORMALSTATEMENTS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldSsrRainRippleNormal",
      createHeightfieldWaterRainRippleNormalStatements(quality)
    )
  };
  const {
    VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG,
    VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT,
    ...surfaceReplacements
  } = shaderTemplateReplacements;
  const modularPassSource = renderWaterShaderTemplate(
    heightfieldScreenSpaceReflectionSurfaceTemplate,
    surfaceReplacements
  );
  const modularPassInclude = registerGeneratedWaterShaderInclude("HeightfieldSsr", modularPassSource);
  return renderWaterShaderTemplate(heightfieldScreenSpaceReflectionPassTemplate, {
    VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG,
    VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT,
    WATER_SSR_INCLUDE: modularPassInclude
  });
}

/** Creates a fixed 2/6/12-wave variant without dynamic shader loops. */
export function createHeightfieldWaterShaderSource(
  quality: WaterQualityTier,
  waveCount: number,
  surfaceAppearanceV2: CompiledWaterSurfaceAppearanceV2,
  depthSource: WaterSurfaceDepthSource = WaterSurfaceDepthSource.SceneDepth
): string {
  const litSceneColorClosure =
    surfaceAppearanceV2.primaryColorClosure === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp ||
    surfaceAppearanceV2.primaryColorClosure === WaterSurfacePrimaryColorClosure.SceneColorCompositeDepthRamp;
  const useSceneDepth =
    depthSource !== WaterSurfaceDepthSource.LocalBathymetry &&
    surfaceAppearanceV2RequiresSceneDepth(surfaceAppearanceV2);
  const useLocalBathymetry = depthSource !== WaterSurfaceDepthSource.SceneDepth;
  const useOpaqueTexture = surfaceAppearanceV2UsesOpaqueColor(surfaceAppearanceV2);
  const qualityName = quality[0].toUpperCase() + quality.slice(1);
  const depthSourceName =
    depthSource === WaterSurfaceDepthSource.LocalBathymetry
      ? "LocalBathymetry"
      : depthSource === WaterSurfaceDepthSource.HybridOptionalSceneDepth
        ? "Hybrid"
        : "";
  const surfaceAppearanceName = `SurfaceAppearanceV2${getWaterSurfaceAppearanceV2ShaderSuffix(surfaceAppearanceV2)}`;
  const sharedSurfaceAssembly = assembleWaterSurfaceShader(
    {
      variantKey: `water-render-contract-v1:${surfaceAppearanceV2.variantKey}`
    },
    HEIGHTFIELD_WATER_SURFACE_GEOMETRY_ADAPTER,
    surfaceAppearanceV2
  );
  const resolvedFields = createResolvedWaterSurfaceFieldsV2({
    coverage: "coverage",
    surfaceHeight: "input.worldPosition.y",
    verticalDepth: "authoredDepth",
    sceneEyeDepth: "sceneDepthDelta",
    sceneRayDepth: "sceneRayDepth",
    surfaceNormalDepth: "surfaceNormalDepth",
    horizontalShoreDistance: "max(signedDistance, 0.0)",
    opticalPath: "opticalDepth",
    obstacleContact: useSceneDepth ? "sceneDepthDelta" : "heightfieldObstacleContact",
    flow: "flowXZ",
    sceneColor: "centeredOpaqueColor"
  });
  const shaderTemplateReplacements: Readonly<Record<string, string | number>> = {
    VALUE_001_SURFACEAPPEARANCENAME: surfaceAppearanceName,
    VALUE_002_DEPTHSOURCENAME: depthSourceName,
    VALUE_003_QUALITYNAME: qualityName,
    VALUE_004_WAVECOUNT: waveCount,
    VALUE_005_SCENELIGHTINGUNIFORMDECLARATIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardSceneLightingUniforms",
      sceneLightingUniformDeclarations()
    ),
    USE_SCENE_DEPTH: useSceneDepth ? 1 : 0,
    USE_CAMERA_OPAQUE_TEXTURE: useSceneDepth || useOpaqueTexture ? 1 : 0,
    VALUE_008_CREATEWATERSURFACEAPPEARANCEV2UNIFORMDECLARATIONS_SURFAC: registerGeneratedWaterShaderModule(
      "HeightfieldForwardAppearanceUniforms",
      createWaterSurfaceAppearanceV2UniformDeclarations(surfaceAppearanceV2)
    ),
    VALUE_009_REFLECTIONUNIFORMDECLARATIONS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardEnvironmentReflectionUniforms",
      WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
    ),
    WAVE_COUNT: waveCount,
    VALUE_012_HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardPlanarTransform",
      HEIGHTFIELD_WATER_PLANAR_TRANSFORM_SHADER_FUNCTIONS
    ),
    VALUE_013_HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardRainRipple",
      HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS
    ),
    VALUE_014_WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardEnvironmentReflection",
      WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS
    ),
    VALUE_015_USELOCALBATHYMETRY_CREATEWATERSPATIALFIELDSHADERDECODEFU: registerGeneratedWaterShaderModule(
      "HeightfieldForwardSpatialDecode",
      useLocalBathymetry ? createWaterSpatialFieldShaderDecodeFunctions() : ""
    ),
    VALUE_016_CREATEWATERSURFACEAPPEARANCESHADERFUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardAppearance",
      createWaterSurfaceAppearanceShaderFunctions()
    ),
    // Optical depth reconstruction consumes these functions independently of the color response model.
    HEIGHTFIELD_DEPTH_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardDepthFunctions",
      createWaterSurfaceDepthResponseShaderFunctions()
    ),
    VALUE_017_CREATEWATERSURFACEAPPEARANCEV2SHADERFUNCTIONS_SURFACEAPP: registerGeneratedWaterShaderModule(
      "HeightfieldForwardAppearanceV2",
      createWaterSurfaceAppearanceV2ShaderFunctions(surfaceAppearanceV2)
    ),
    VALUE_018_CONTACTFOAMSHADERFUNCTIONSV2_SURFACEAPPEARANCEV2: registerGeneratedWaterShaderModule(
      "HeightfieldForwardContactFoam",
      contactFoamShaderFunctionsV2(surfaceAppearanceV2)
    ),
    VALUE_019_SHAREDSURFACEASSEMBLY_SHAREDFUNCTIONSOURCE: registerGeneratedWaterShaderModule(
      "HeightfieldForwardSharedSurface",
      sharedSurfaceAssembly.sharedFunctionSource
    ),
    VALUE_020_SURFACEAPPEARANCELIGHTINGFUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardSurfaceLighting",
      surfaceAppearanceLightingFunctions()
    ),
    HEIGHTFIELD_GEOMETRY_FUNCTIONS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardGeometry",
      heightfieldGeometryFunctions()
    ),
    VALUE_035_USELOCALBATHYMETRY_FLOAT_AUTHOREDDEPTH_WATERSPATIALFIELD: registerGeneratedWaterShaderModule(
      "HeightfieldForwardLocalMapVertexDecode",
      localMapDecodeStatements(useLocalBathymetry, false)
    ),
    VALUE_036_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed
    ),
    VALUE_037_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42
    ),
    VALUE_038_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MACROFLOWALIGNMENT: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.macroFlowAlignment
    ),
    VALUE_039_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMACROAMPLITUD: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.stillMacroAmplitudeScale
    ),
    VALUE_041_WAVEAPPLYSTATEMENTS_WAVECOUNT: registerGeneratedWaterShaderModule(
      "HeightfieldForwardWaves",
      heightfieldWaveStatements(waveCount)
    ),
    VALUE_042_USELOCALBATHYMETRY_FLOAT_AUTHOREDDEPTH_MAX_WATERSPATIALF: registerGeneratedWaterShaderModule(
      "HeightfieldForwardLocalMapFragmentDecode",
      localMapDecodeStatements(useLocalBathymetry, true)
    ),
    VALUE_043_OPTICALDEPTHCALCULATION_USESCENEDEPTH_USECOMPOSITEDEPTHR: registerGeneratedWaterShaderModule(
      "HeightfieldForwardOpticalDepth",
      heightfieldOpticalDepthStatements(
        0,
        useSceneDepth,
        useLocalBathymetry,
        useLocalBathymetry && !useSceneDepth && useOpaqueTexture
      )
    ),
    VALUE_045_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMFLOWSPEED: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.minimumFlowSpeed
    ),
    VALUE_046_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MAXIMUMFLOWSPEED_0: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.maximumFlowSpeed * 0.42
    ),
    VALUE_047_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_FLOWINGDIRECTIONWE: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.flowingDirectionWeight
    ),
    VALUE_048_SHAREDSURFACEASSEMBLY_GEOMETRYBRIDGESOURCE: registerGeneratedWaterShaderModule(
      "HeightfieldForwardGeometryBridge",
      sharedSurfaceAssembly.geometryBridgeSource
    ),
    VALUE_049_FLOWSURFACELAYERSTATEMENTS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardFlowSurfaceLayers",
      flowSurfaceLayerStatements(quality)
    ),
    VALUE_050_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_MINIMUMNORMALSTREN: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.minimumNormalStrength
    ),
    VALUE_051_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLMICRONORMALSC: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.stillMicroNormalScale
    ),
    VALUE_052_CREATEWATERSURFACEAPPEARANCEV2NORMALSTATEMENTS_SURFACEAP: registerGeneratedWaterShaderModule(
      "HeightfieldForwardAppearanceNormal",
      createWaterSurfaceAppearanceV2NormalStatements(surfaceAppearanceV2, { boundedTime: true })
    ),
    VALUE_053_CREATEHEIGHTFIELDWATERRAINRIPPLENORMALSTATEMENTS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardRainRippleNormal",
      createHeightfieldWaterRainRippleNormalStatements(quality)
    ),
    VALUE_054_LOCALBATHYMETRYOPTICALDEPTHREFINEMENT_USELOCALBATHYMETRY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardLocalBathymetryOpticalDepth",
      heightfieldOpticalDepthStatements(1, useSceneDepth, useLocalBathymetry, false)
    ),
    VALUE_055_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_SHOREFOAMWIDTHSCAL: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.shoreFoamWidthScale
    ),
    VALUE_056_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_SHOREFOAMNOISESTAR: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.shoreFoamNoiseStart
    ),
    VALUE_057_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_SHOREFOAMNOISEEND: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.shoreFoamNoiseEnd
    ),
    VALUE_058_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CRESTFOAMSTART: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.crestFoamStart
    ),
    VALUE_059_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CRESTFOAMEND: glsl(HEIGHTFIELD_WATER_SURFACE_TUNING.crestFoamEnd),
    VALUE_060_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMSPEEDST: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamSpeedStart
    ),
    VALUE_061_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMSPEEDEN: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamSpeedEnd
    ),
    VALUE_062_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMNOISEST: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamNoiseStart
    ),
    VALUE_063_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_CURRENTFOAMNOISEEN: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.currentFoamNoiseEnd
    ),
    VALUE_064_WAKEFOAMSTATEMENTS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardWakeFoam",
      wakeFoamStatements(quality)
    ),
    VALUE_065_GLSL_HEIGHTFIELD_WATER_SURFACE_TUNING_STILLFOAMSCALE: glsl(
      HEIGHTFIELD_WATER_SURFACE_TUNING.stillFoamScale
    ),
    VALUE_066_CREATEWATERSURFACEAPPEARANCEV2BOUNDARYSTATEMENTS_SURFACE: registerGeneratedWaterShaderModule(
      "HeightfieldForwardAppearanceBoundaries",
      createWaterSurfaceAppearanceV2BoundaryStatements(surfaceAppearanceV2, resolvedFields, { boundedTime: true })
    ),
    VALUE_067_WATERDIFFUSELIGHTINGSTATEMENTS_LITSCENECOLORCLOSURE: registerGeneratedWaterShaderModule(
      "HeightfieldForwardDiffuseLighting",
      waterDiffuseLightingStatements(litSceneColorClosure)
    ),
    VALUE_068_SCENECOLORREFRACTIONV2_QUALITY_SURFACEAPPEARANCEV2_USESC: registerGeneratedWaterShaderModule(
      "HeightfieldForwardSceneColorRefraction",
      sceneColorRefractionV2(quality, surfaceAppearanceV2, useSceneDepth, useOpaqueTexture, useLocalBathymetry)
    ),
    VALUE_069_CREATEWATERSURFACEAPPEARANCEV2DEPTHRESPONSESTATEMENTS_SU: registerGeneratedWaterShaderModule(
      "HeightfieldForwardAppearanceDepthResponse",
      createWaterSurfaceAppearanceV2DepthResponseStatements(surfaceAppearanceV2, resolvedFields, { boundedTime: true })
    ),
    VALUE_070_SURFACEREFLECTIONSTATEMENTS_QUALITY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardSurfaceReflection",
      surfaceReflectionStatements(quality)
    ),
    VALUE_071_CREATEHEIGHTFIELDV2FINALCLOSURESTATEMENTS_SURFACEAPPEARA: registerGeneratedWaterShaderModule(
      "HeightfieldForwardFinalClosure",
      createHeightfieldV2FinalClosureStatements(surfaceAppearanceV2)
    ),
    VALUE_072_HEIGHTFIELDDEBUGSTATEMENTS: registerGeneratedWaterShaderModule(
      "HeightfieldForwardDebug",
      heightfieldDebugStatements(useSceneDepth)
    ),
    VALUE_092_HEIGHTFIELDWATERCOMPOSITIONMODE_ALPHABLEND_0_5: HeightfieldWaterCompositionMode.AlphaBlend + 0.5,
    VALUE_093_CREATEWATERSURFACEV2RESOLVEDOUTPUTSTATEMENT_VEC4_FRAGMEN: registerGeneratedWaterShaderModule(
      "HeightfieldForwardResolvedOutput",
      createWaterSurfaceV2ResolvedOutputStatement("vec4(fragmentColor, fragmentAlpha)")
    ),
    VALUE_094_SCREENSPACEREFLECTIONSURFACEPASS_QUALITY_WAVECOUNT_SURFA: screenSpaceReflectionSurfacePass(
      quality,
      waveCount,
      surfaceAppearanceV2
    )
  };
  const {
    VALUE_001_SURFACEAPPEARANCENAME,
    VALUE_002_DEPTHSOURCENAME,
    VALUE_003_QUALITYNAME,
    VALUE_004_WAVECOUNT,
    VALUE_094_SCREENSPACEREFLECTIONSURFACEPASS_QUALITY_WAVECOUNT_SURFA,
    ...forwardReplacements
  } = shaderTemplateReplacements;
  const modularPassSource = renderWaterShaderTemplate(heightfieldForwardPassTemplate, forwardReplacements);
  const modularPassInclude = registerGeneratedWaterShaderInclude("HeightfieldForward", modularPassSource);
  return renderWaterShaderTemplate(heightfieldWaterShaderTemplate, {
    VALUE_001_SURFACEAPPEARANCENAME,
    VALUE_002_DEPTHSOURCENAME,
    VALUE_003_QUALITYNAME,
    VALUE_004_WAVECOUNT,
    VALUE_094_SCREENSPACEREFLECTIONSURFACEPASS_QUALITY_WAVECOUNT_SURFA,
    WATER_FORWARD_INCLUDE: modularPassInclude
  });
}

/** Creates one bounded V2 source from structural compiler output. */
export function createHeightfieldWaterSurfaceAppearanceV2ShaderSource(
  quality: WaterQualityTier,
  waveCount: number,
  appearance: CompiledWaterSurfaceAppearanceV2,
  depthSource: WaterSurfaceDepthSource = WaterSurfaceDepthSource.SceneDepth
): string {
  return createHeightfieldWaterShaderSource(quality, waveCount, appearance, depthSource);
}

function createHeightfieldWaterSurfaceAppearanceV2ShaderModuleFromVariant(
  quality: WaterQualityTier,
  appearance: CompiledWaterSurfaceAppearanceV2,
  depthSource: WaterSurfaceDepthSource,
  resolution: ReturnType<typeof resolveHeightfieldWaterMaterialVariant>
): WaterShaderModule {
  return createWaterShaderModule(
    resolution.shaderName,
    createHeightfieldWaterSurfaceAppearanceV2ShaderSource(quality, resolution.waveSlotCount, appearance, depthSource),
    resolution.variant,
    [
      HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapTexture,
      HEIGHTFIELD_WATER_SHADER_PROPERTY.surfaceTexture,
      ...getWaterSurfaceAppearanceV2RequiredTextureProperties(appearance)
    ]
  );
}

/** Creates one complete V2 Heightfield module through the exact runtime material variant resolution. */
export function createHeightfieldWaterSurfaceAppearanceV2ShaderModule(
  quality: WaterQualityTier,
  appearance: CompiledWaterSurfaceAppearanceV2,
  shaderWaveCount: number,
  depthSource: WaterSurfaceDepthSource = WaterSurfaceDepthSource.SceneDepth
): WaterShaderModule {
  const resolution = resolveHeightfieldWaterMaterialVariant(
    quality,
    depthSource,
    appearance.variantKey,
    shaderWaveCount
  );
  return withScopedWaterShaderAssemblyRegistry(() =>
    createHeightfieldWaterSurfaceAppearanceV2ShaderModuleFromVariant(quality, appearance, depthSource, resolution)
  );
}

function resolveHeightfieldWaterSurfaceAppearanceV2ShaderFromVariant(
  quality: WaterQualityTier,
  appearance: CompiledWaterSurfaceAppearanceV2,
  depthSource: WaterSurfaceDepthSource,
  resolution: ReturnType<typeof resolveHeightfieldWaterMaterialVariant>
): Shader {
  return resolveWaterShaderModule(resolution.shaderName, () =>
    createHeightfieldWaterSurfaceAppearanceV2ShaderModuleFromVariant(quality, appearance, depthSource, resolution)
  );
}

/** Resolves one V2 Heightfield Shader through its exact, transaction-scoped include closure. */
export function resolveHeightfieldWaterSurfaceAppearanceV2Shader(
  quality: WaterQualityTier,
  appearance: CompiledWaterSurfaceAppearanceV2,
  shaderWaveCount: number,
  depthSource: WaterSurfaceDepthSource = WaterSurfaceDepthSource.SceneDepth
): Shader {
  return resolveHeightfieldWaterSurfaceAppearanceV2ShaderFromVariant(
    quality,
    appearance,
    depthSource,
    resolveHeightfieldWaterMaterialVariant(quality, depthSource, appearance.variantKey, shaderWaveCount)
  );
}

export { bindHeightfieldWaterBaseMaterial as updateHeightfieldWaterMaterial };

/**
 * Applies the complete P1 contract through one stable caller-owned adapter/readback.
 * The material quality remains authoritative; Experimental can resolve only through a High material.
 */
export function setHeightfieldWaterSurfaceOpticsBinding(
  state: HeightfieldWaterMaterialState,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const cachedBinding = state.surfaceOpticsBinding;
  cachedBinding.tier = resolveHeightfieldOpticsTier(state.quality, binding.tier);
  cachedBinding.opticalProfile = binding.opticalProfile;
  cachedBinding.refractionEnabled = binding.refractionEnabled;
  cachedBinding.reflection = binding.reflection;
  cachedBinding.reflectionSampling = binding.reflectionSampling;
  cachedBinding.debugView = binding.debugView;
  return applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

/** Updates only the numeric uniforms exposed by V2 live Look tuning. */
export function updateHeightfieldWaterTransientOpticalProfile(
  state: HeightfieldWaterMaterialState,
  profile: WaterOpticalProfile
): Readonly<WaterSurfaceOpticsBindingReadback> {
  state.surfaceOpticsBinding.opticalProfile = profile;
  applyWaterSurfaceTransientOpticalProfile(state.material.shaderData, state, profile);
  return state.bindingReadback;
}

/**
 * Applies one validated environment/SSR binding and returns the exact shader-facing sampling state.
 * Missing or malformed resources are cleared and resolve to the legacy analytic sky.
 */
export function setHeightfieldWaterReflectionBinding(
  state: HeightfieldWaterMaterialState,
  binding?: Readonly<WaterReflectionBinding>,
  config: HeightfieldWaterReflectionSamplingConfig = DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS
): Readonly<HeightfieldWaterReflectionSamplingReadback> {
  state.surfaceOpticsBinding.reflection = binding;
  state.surfaceOpticsBinding.reflectionSampling = config;
  const sharedReadback = applyWaterSurfaceReflectionBinding(
    state.material.shaderData,
    state,
    state.surfaceOpticsBinding.tier,
    binding,
    config
  );
  updateHeightfieldReflectionReadback(state, sharedReadback, binding);
  applyHeightfieldWaterScreenSpaceReflectionReceiver(state, sharedReadback.effectiveSource === "ssr");
  updateHeightfieldWaterScreenSpaceReflectionConsumption(state);
  return state.heightfieldReflectionReadback;
}

export function createHeightfieldWaterMaterial(
  engine: Engine,
  quality: WaterQualityTier,
  waveSet: CompiledWaterWaveSet,
  config: HeightfieldWaterVisualUniformConfig,
  atlas: HeightfieldWaterLocalMapAtlas,
  localMapTexture: Texture2D,
  depthSource: WaterSurfaceDepthSource,
  appearanceBinding: Readonly<WaterSurfaceAppearanceBindingV2>
): HeightfieldWaterMaterialState {
  const resolution = resolveHeightfieldWaterMaterialVariant(
    quality,
    depthSource,
    appearanceBinding.appearance.variantKey,
    waveSet.shaderWaveCount
  );
  const slotCount = resolution.waveSlotCount;
  const shader = resolveHeightfieldWaterSurfaceAppearanceV2ShaderFromVariant(
    quality,
    appearanceBinding.appearance,
    depthSource,
    resolution
  );
  const material = new Material(engine, shader);
  registerWaterSurfacePicking(material, "depthWriteEnabled");
  if (!ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0)) {
    const capability = ScreenSpaceReflection.getMaterialReceiverCapability(material);
    material.destroy(true);
    throw new Error(
      `Heightfield Water shader '${shader.name}' does not implement the Core SSR receiver contract: ${capability.unsupportedReason ?? "unknown"}.`
    );
  }
  material.shaderData.setTexture(HEIGHTFIELD_WATER_SHADER_PROPERTY.localMapTexture, localMapTexture);
  material.shaderData.setTexture(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.surfaceTexture,
    getWaterSurfaceDetailTexture(engine)
  );
  material.shaderData.setFloat(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.maxVerticalDisplacement,
    waveSet.maxVerticalDisplacement
  );
  material.shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.waterWorldToLocalPlanar,
    IDENTITY_WATER_WORLD_TO_LOCAL_PLANAR
  );
  bindHeightfieldWaterWaves(material, waveSet, slotCount);
  const surfaceOpticsBinding: MutableHeightfieldWaterSurfaceOpticsBinding = {
    tier: quality === WaterQualityTier.High ? "high" : "medium",
    opticalProfile: DEFAULT_WATER_OPTICAL_PROFILE,
    refractionEnabled: true,
    reflection: undefined,
    reflectionSampling: DEFAULT_HEIGHTFIELD_WATER_REFLECTION_SAMPLING_SETTINGS,
    debugView: WaterOpticsDebugView.Final
  };
  const state = Object.freeze({
    material,
    depthSource,
    quality,
    waveSet,
    ...createWaterSurfaceOpticsBindingState(),
    surfaceOpticsBinding: Object.seal(surfaceOpticsBinding),
    heightfieldReflectionReadback: createHeightfieldReflectionReadback(quality),
    screenSpaceReflectionConsumptionReadback: createHeightfieldWaterScreenSpaceReflectionConsumptionReadback(),
    opticsCalibrationReadback: createHeightfieldWaterOpticsCalibrationReadback(),
    surfaceAppearanceReadback: createWaterSurfaceAppearanceBindingReadback(),
    surfaceAppearanceFeatureFlags: Object.seal({
      ...DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS
    })
  });
  bindHeightfieldWaterBaseMaterial(state, config, atlas);
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
  setHeightfieldWaterCompositionMode(state, HeightfieldWaterCompositionMode.AlphaBlend);
  setHeightfieldWaterOpticsCalibrationMode(state, HeightfieldWaterOpticsCalibrationMode.None);
  setHeightfieldWaterDepthWriteEnabled(state, false);
  setHeightfieldWaterFeatureFlags(state, { waves: true, microNormals: true, foam: true });
  setHeightfieldWaterSurfaceAppearanceFeatureFlags(state, DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS);
  setHeightfieldWaterLocalFoamMask(state, DEFAULT_HEIGHTFIELD_WATER_LOCAL_FOAM_MASK);
  setHeightfieldWaterPresentationReveal(state, 1, 0.035);
  setHeightfieldWaterSurfaceTimeOverride(state);
  try {
    setHeightfieldWaterSurfaceAppearanceBinding(state, appearanceBinding);
  } catch (error) {
    material.destroy(true);
    throw error;
  }
  return state;
}

/**
 * Sets only the Heightfield Water Forward SSR composite weight.
 * Camera SSR acquisition and the transparent Surface pass receiver remain unchanged.
 */
export function setHeightfieldWaterScreenSpaceReflectionCompositeIntensity(
  state: HeightfieldWaterMaterialState,
  intensity: number
): Readonly<HeightfieldWaterScreenSpaceReflectionConsumptionReadback> {
  const readback =
    state.screenSpaceReflectionConsumptionReadback as MutableHeightfieldWaterScreenSpaceReflectionConsumptionReadback;
  readback.requestedIntensity = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  return updateHeightfieldWaterScreenSpaceReflectionConsumption(state);
}

function bindHeightfieldWaterSurfaceAppearanceV2(
  state: HeightfieldWaterMaterialState,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  fieldGraph: WaterSurfaceFieldGraphReadback
): void {
  const appearance = binding.appearance;
  const depthSource = fieldGraph.cameraDepthRequested
    ? state.depthSource === WaterSurfaceDepthSource.LocalBathymetry
      ? WaterSurfaceDepthSource.HybridOptionalSceneDepth
      : state.depthSource
    : WaterSurfaceDepthSource.LocalBathymetry;
  const variantResolution = resolveHeightfieldWaterMaterialVariant(
    state.quality,
    depthSource,
    appearance.variantKey,
    state.waveSet.shaderWaveCount
  );
  state.material.shader = resolveHeightfieldWaterSurfaceAppearanceV2ShaderFromVariant(
    state.quality,
    appearance,
    depthSource,
    variantResolution
  );
  const shaderData = state.material.shaderData;
  const nullableTextureData = shaderData as unknown as NullableTextureShaderData;
  for (let index = 0; index < 2; index++) {
    const layer = appearance.detailLayers[index];
    const textureBinding = layer
      ? binding.textureBindings.find((candidate) => candidate.layerId === layer.id)
      : undefined;
    nullableTextureData.setTexture(
      getWaterSurfaceAppearanceV2DetailProperty(index, "texture"),
      textureBinding?.texture ?? null
    );
    if (!layer) continue;
    shaderData.setVector4(
      getWaterSurfaceAppearanceV2DetailProperty(index, "transform"),
      new Vector4(layer.scale[0], layer.scale[1], layer.velocity[0], layer.velocity[1])
    );
    const rotationRadians = (layer.rotationDegrees * Math.PI) / 180;
    shaderData.setVector2(
      getWaterSurfaceAppearanceV2DetailProperty(index, "rotation"),
      new Vector2(Math.cos(rotationRadians), Math.sin(rotationRadians))
    );
    shaderData.setFloat(getWaterSurfaceAppearanceV2DetailProperty(index, "strength"), layer.strength);
  }
  shaderData.setFloat("material_AppearanceV2DetailNormalStrength", appearance.detailNormalStrength ?? 1);
  applyWaterSurfaceDepthResponseV2Uniforms(shaderData, appearance.depthResponse);
  bindWaterSurfaceCaustics(shaderData, binding);
  appearance.boundaryEffects.forEach((effect, index) => {
    shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "range"), effect.rangeMeters);
    if (effect.exponent !== undefined) {
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "exponent"), effect.exponent);
    }
    if (effect.outputs.alpha !== undefined) {
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "alpha"), effect.outputs.alpha);
    }
    if (effect.outputs.color !== undefined) {
      shaderData.setVector3(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "color"),
        new Vector3(effect.outputs.color[0], effect.outputs.color[1], effect.outputs.color[2])
      );
    }
    if (effect.outputs.roughness !== undefined) {
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "roughness"), effect.outputs.roughness);
    }
    if (effect.outputs.refractionSuppression !== undefined) {
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "refractionSuppression"),
        effect.outputs.refractionSuppression
      );
    }
    if (effect.pattern) {
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternWorldScale"),
        effect.pattern.worldScale
      );
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternTimeRate"),
        effect.pattern.timeRate
      );
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternOpacity"), effect.pattern.opacity);
      if (effect.pattern.response === WaterPatternResponseV2.Power) {
        shaderData.setFloat(
          getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternExponent"),
          effect.pattern.exponent as number
        );
      }
      shaderData.setVector3(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternWeights"),
        new Vector3(
          effect.pattern.octaves.weights[0] ?? 0,
          effect.pattern.octaves.weights[1] ?? 0,
          effect.pattern.octaves.weights[2] ?? 0
        )
      );
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternLacunarity"),
        effect.pattern.lacunarity
      );
    }
  });
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.refractionUvScale, appearance.refraction.uvScale);
  setHeightfieldWaterCompositionMode(
    state,
    appearance.composition === WaterSurfaceCompositionV2.PrecomposedReplace
      ? HeightfieldWaterCompositionMode.PrecomposedReplace
      : HeightfieldWaterCompositionMode.AlphaBlend
  );
}

export function setHeightfieldWaterSurfaceAppearanceBinding(
  state: HeightfieldWaterMaterialState,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>
): Readonly<WaterSurfaceAppearanceBindingReadback> {
  if (!binding || !("textureBindings" in binding)) {
    throw new TypeError("Heightfield water requires a Surface Appearance V2 binding; detach is unsupported.");
  }
  const maximumContactFoamOctaves: 1 | 2 | 3 =
    state.quality === WaterQualityTier.Low ? 1 : state.quality === WaterQualityTier.Medium ? 2 : 3;
  const maximumDetailLayers: 1 | 2 = state.quality === WaterQualityTier.Low ? 1 : 2;
  const sceneDepthAvailable = state.depthSource !== WaterSurfaceDepthSource.LocalBathymetry;
  const qualitySupported = true;
  const fieldGraph = resolveWaterSurfaceAppearanceFields(binding, {
    quality: state.quality,
    effectiveQualityPlan: {
      id: "heightfield-material",
      sceneFields: sceneDepthAvailable ? "scene-color-depth" : "scene-color"
    },
    compiledSpatialFields: new Set([
      WaterFieldSemantic.Coverage,
      WaterFieldSemantic.SurfaceHeight,
      WaterFieldSemantic.VerticalDepth,
      WaterFieldSemantic.HorizontalShoreDistance,
      WaterFieldSemantic.Flow
    ]),
    enabledActivations: new Set(Object.values(WaterFieldConsumerActivation)),
    cameraDepth: sceneDepthAvailable,
    cameraOpaqueColor: true
  });
  const resolution = resolveWaterSurfaceAppearanceBinding(
    binding,
    qualitySupported,
    maximumContactFoamOctaves,
    maximumDetailLayers,
    sceneDepthAvailable,
    fieldGraph
  );
  const resolvedBinding = resolution.binding;
  if (!resolution.readback.active || !resolvedBinding || !("textureBindings" in resolvedBinding)) {
    throw new Error(
      `Heightfield Surface Appearance V2 binding failed closed: ${resolution.readback.fallbackReason ?? "unresolved"}.`
    );
  }
  bindHeightfieldWaterSurfaceAppearanceV2(state, resolvedBinding, fieldGraph);
  bindWaterSurfaceAppearanceV2Clock(state.material, resolvedBinding.appearance);
  writeWaterSurfaceAppearanceBindingReadback(state.surfaceAppearanceReadback, resolution.readback);
  applyHeightfieldWaterSurfaceAppearanceFeatureFlags(state);
  refreshHeightfieldWaterAppearanceDebugView(state);
  applyHeightfieldWaterScreenSpaceReflectionReceiver(state, state.bindingReadback.effectiveSource === "ssr");
  return state.surfaceAppearanceReadback;
}

export function setHeightfieldWaterSurfaceAppearanceFeatureFlags(
  state: HeightfieldWaterMaterialState,
  flags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>
): void {
  const retainedFlags = state.surfaceAppearanceFeatureFlags;
  retainedFlags.externalNormal = flags.externalNormal === true;
  retainedFlags.depthTint = flags.depthTint === true;
  retainedFlags.coastalAlpha = flags.coastalAlpha === true;
  retainedFlags.contactFoam = flags.contactFoam === true;
  retainedFlags.directSpecular = flags.directSpecular === true;
  applyHeightfieldWaterSurfaceAppearanceFeatureFlags(state);
}

export function setHeightfieldWaterDebugMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterDebugMode
): void {
  state.surfaceOpticsBinding.debugView = mode;
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

export function setHeightfieldWaterRefractionEnabled(state: HeightfieldWaterMaterialState, enabled: boolean): void {
  state.surfaceOpticsBinding.refractionEnabled = enabled;
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
}

export function setHeightfieldWaterCompositionMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterCompositionMode
): void {
  const shaderData = state.material.shaderData;
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.compositionMode, mode);
  shaderData.setInt(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled,
    mode === HeightfieldWaterCompositionMode.AlphaBlend ? 1 : 0
  );
}

export function setHeightfieldWaterOpticsCalibrationMode(
  state: HeightfieldWaterMaterialState,
  mode: HeightfieldWaterOpticsCalibrationMode
): Readonly<HeightfieldWaterOpticsCalibrationReadback> {
  const resolvedMode =
    mode === HeightfieldWaterOpticsCalibrationMode.CpuReference ||
    mode === HeightfieldWaterOpticsCalibrationMode.PureTransmission
      ? mode
      : HeightfieldWaterOpticsCalibrationMode.None;
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.opticsCalibrationMode, resolvedMode);
  const readback = state.opticsCalibrationReadback as MutableHeightfieldWaterOpticsCalibrationReadback;
  readback.mode = resolvedMode;
  readback.referenceCompositionEnabled = resolvedMode !== HeightfieldWaterOpticsCalibrationMode.None;
  readback.effectiveFresnelOverride =
    resolvedMode === HeightfieldWaterOpticsCalibrationMode.PureTransmission ? 0 : undefined;
  return state.opticsCalibrationReadback;
}

export function setHeightfieldWaterDepthWriteEnabled(state: HeightfieldWaterMaterialState, enabled: boolean): void {
  state.material.shaderData.setInt(HEIGHTFIELD_WATER_SHADER_PROPERTY.depthWriteEnabled, enabled ? 1 : 0);
}

export function setHeightfieldWaterFeatureFlags(
  state: HeightfieldWaterMaterialState,
  flags: HeightfieldWaterFeatureFlags
): void {
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.wavesEnabled, flags.waves ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.microNormalsEnabled, flags.microNormals ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.foamEnabled, flags.foam ? 1 : 0);
}

export function setHeightfieldWaterLocalFoamMask(
  state: HeightfieldWaterMaterialState,
  mask: Readonly<HeightfieldWaterLocalFoamMask>
): void {
  const values = [mask.centerXZ[0], mask.centerXZ[1], mask.halfSizeXZ[0], mask.halfSizeXZ[1], mask.featherMeters];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Heightfield local foam mask values must be finite.");
  }
  if (mask.halfSizeXZ[0] < 0 || mask.halfSizeXZ[1] < 0 || mask.featherMeters < 0) {
    throw new RangeError("Heightfield local foam mask extents and feather must be non-negative.");
  }
  const shaderData = state.material.shaderData;
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskEnabled, mask.enabled ? 1 : 0);
  shaderData.setVector4(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskCenterHalfSize,
    new Vector4(mask.centerXZ[0], mask.centerXZ[1], mask.halfSizeXZ[0], mask.halfSizeXZ[1])
  );
  shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.localFoamMaskFeather, mask.featherMeters);
}

/**
 * Enables the temporary noise-dissolve water reveal used by scene presentations.
 * @param state Active material state.
 * @param progress Normalized reveal completion, where `1` restores the production variant.
 * @param band Normalized width of the dissolve edge within one repeated tile.
 * @param repeat Number of repeated noise tiles across local X/Z UV space.
 * @returns Nothing.
 * @throws If either value is not finite or the crest width is not positive.
 */
export function setHeightfieldWaterPresentationReveal(
  state: HeightfieldWaterMaterialState,
  progress: number,
  band: number,
  repeat: readonly [number, number] = [1, 1]
): void {
  if (
    !Number.isFinite(progress) ||
    !Number.isFinite(band) ||
    band <= 0 ||
    !Number.isFinite(repeat[0]) ||
    !Number.isFinite(repeat[1]) ||
    repeat[0] < 1 ||
    repeat[1] < 1
  ) {
    throw new RangeError("Heightfield water presentation reveal values must be finite and positive.");
  }
  const clampedProgress = Math.min(1, Math.max(0, progress));
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.presentationRevealProgress, clampedProgress);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.presentationRevealBand, band);
  state.material.shaderData.setVector2(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.presentationRevealRepeat,
    new Vector2(repeat[0], repeat[1])
  );
  if (clampedProgress >= 1) state.material.shaderData.disableMacro(PRESENTATION_REVEAL_MACRO);
  else state.material.shaderData.enableMacro(PRESENTATION_REVEAL_MACRO);
}

export function setHeightfieldWaterSurfaceTimeOverride(
  state: HeightfieldWaterMaterialState,
  elapsedTime?: number
): void {
  const value = elapsedTime === undefined ? -1 : Math.max(0, elapsedTime);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.surfaceTimeOverride, value);
  updateWaterSurfaceAppearanceV2Clock(state.material, undefined, true);
}
