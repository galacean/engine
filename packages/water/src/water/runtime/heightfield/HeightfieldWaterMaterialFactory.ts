import type { WaterSurfaceOpticsBindingReadback } from "../optics/WaterSurfaceOpticsTypes";
import { getWaterSurfaceAppearanceQualityBudget } from "../../authoring/quality/WaterSurfaceAppearanceQuality";
import { getRequiredWaterSurfaceV2Semantics } from "../../compiler/surface/WaterSurfaceClosureCompiler";
import { WATER_CONNECTION_SHADER } from "../connections/WaterConnectionBinding";
import { bindWaterSurfaceCaustics } from "../surface/WaterSurfaceCausticsBinding";
import type { WaterSurfaceFieldGraphReadback } from "../surface/WaterSurfaceFieldResolver";
import { registerWaterSurfacePicking } from "../surface/WaterSurfacePicking";
/** Dedicated heightfield-water shader: curved base surface, packed local map, waves, optics,. */
import {
  Engine,
  Material,
  ScreenSpaceReflection,
  ScreenSpaceReflectionReceiverMode,
  ShaderMacro,
  Texture2D,
  type Shader,
  type Texture
} from "@galacean/engine-core";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { HeightfieldWaterVisualUniformConfig } from "../../authoring/heightfield/HeightfieldWaterTypes";
import { WaterSurfaceDepthSource } from "../../authoring/surface/enums/WaterSurfaceDepthSource";
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
import { getWaterSurfaceDepthResponseSemantics } from "../../authoring/surface/WaterSurfaceDepthResponseSemantics";
import { WaterFieldConsumerActivation, WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { HeightfieldWaterLocalMapAtlas } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import heightfieldDepthAlphaTemplate from "../../shaders/heightfield/DepthAlpha.glsl?raw";
import heightfieldDiffuseLightingTemplate from "../../shaders/heightfield/DiffuseLighting.glsl?raw";
import heightfieldDirectionalLightingTemplate from "../../shaders/heightfield/DirectionalLighting.glsl?raw";
import heightfieldFinalClosureTemplate from "../../shaders/heightfield/FinalClosure.glsl?raw";
import heightfieldForwardPassTemplate from "../../shaders/heightfield/ForwardPass.glsl?raw";
import heightfieldGeometryTemplate from "../../shaders/heightfield/HeightfieldGeometry.glsl?raw";
import heightfieldOpticalDepthTemplate from "../../shaders/heightfield/HeightfieldOpticalDepth.glsl?raw";
import heightfieldSceneColorRefractionTemplate from "../../shaders/heightfield/HeightfieldSceneColorRefraction.glsl?raw";
import heightfieldWavesTemplate from "../../shaders/heightfield/HeightfieldWaves.glsl?raw";
import heightfieldLocalMapDecodeTemplate from "../../shaders/heightfield/LocalMapDecode.glsl?raw";
import heightfieldPlanarTransformTemplate from "../../shaders/heightfield/PlanarTransform.glsl?raw";
import heightfieldSceneLightingUniformsTemplate from "../../shaders/heightfield/SceneLightingUniforms.glsl?raw";
import heightfieldScreenSpaceReflectionPassTemplate from "../../shaders/heightfield/ScreenSpaceReflectionPass.glsl?raw";
import heightfieldScreenSpaceReflectionSurfaceTemplate from "../../shaders/heightfield/ScreenSpaceReflectionSurface.glsl?raw";
import heightfieldSurfaceLightingFunctionsTemplate from "../../shaders/heightfield/SurfaceLightingFunctions.glsl?raw";
import heightfieldSurfaceNormalTemplate from "../../shaders/heightfield/SurfaceNormal.glsl?raw";
import heightfieldSurfaceReflectionTemplate from "../../shaders/heightfield/SurfaceReflection.glsl?raw";
import heightfieldWaterShaderTemplate from "../../shaders/HeightfieldWater.shader?raw";
import {
  registerGeneratedWaterShaderInclude,
  registerGeneratedWaterShaderModule,
  withScopedWaterShaderAssemblyRegistry
} from "../material/WaterShaderLibrary";
import {
  createWaterShaderModule,
  resolveWaterShaderModule,
  type WaterShaderModule
} from "../material/WaterShaderModule";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import {
  WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS,
  WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
} from "../optics/WaterEnvironmentReflectionShader";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import {
  applyWaterSurfaceOpticsBinding,
  applyWaterSurfaceTransientOpticalProfile,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import { type WaterOpticsTier, type WaterSurfaceOpticsBinding } from "../optics/WaterSurfaceOpticsTypes";
import { createWaterSpatialFieldShaderDecodeFunctions } from "../spatial/WaterSpatialFieldShaderDecode";
import { createWaterAnimatedVoronoiF1ShaderFunctions } from "../surface/WaterAnimatedVoronoiF1Shader";
import { createWaterContactFoamShaderFunctions } from "../surface/WaterContactFoamShader";
import {
  createWaterSurfaceAppearanceBindingReadback,
  resolveWaterSurfaceAppearanceBinding,
  resolveWaterSurfaceAppearanceFields,
  writeWaterSurfaceAppearanceBindingReadback
} from "../surface/WaterSurfaceAppearanceBinding";
import type {
  WaterSurfaceAppearanceBindingReadback,
  WaterSurfaceAppearanceBindingV2
} from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import { createWaterSurfaceAppearanceShaderFunctions } from "../surface/WaterSurfaceAppearanceShader";
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
  applyWaterSurfaceDepthResponseV2Uniforms,
  bindWaterSurfaceAppearanceV2Clock,
  updateWaterSurfaceAppearanceV2Clock
} from "../surface/WaterSurfaceAppearanceV2UniformBinding";
import {
  createWaterSurfaceV2EvaluationStatement,
  createWaterSurfaceV2ResolvedOutputStatement,
  getWaterSurfacePrimaryColorClosureModelValue
} from "../surface/WaterSurfaceClosureShader";
import { createWaterSurfaceDepthResponseShaderFunctions } from "../surface/WaterSurfaceDepthResponseShader";
import { createWaterShaderSymbol, createWaterSurfaceGeometryAdapter } from "../surface/WaterSurfaceGeometryAdapter";
import { createResolvedWaterSurfaceFieldsV2 } from "../surface/WaterSurfaceResolvedFields";
import { assembleWaterSurfaceShader } from "../surface/WaterSurfaceShaderAssembler";
import {
  DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS,
  HEIGHTFIELD_WATER_SHADER_PROPERTY,
  HEIGHTFIELD_WATER_SURFACE_TUNING,
  HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS
} from "./constants";
import { bindHeightfieldWaterBaseMaterial, bindHeightfieldWaterWaves } from "./HeightfieldWaterMaterialBinding";
import { resolveHeightfieldWaterMaterialVariant } from "./HeightfieldWaterMaterialVariant";
import {
  HEIGHTFIELD_WATER_RAIN_RIPPLE_SHADER_FUNCTIONS,
  createHeightfieldWaterRainRippleNormalStatements
} from "./HeightfieldWaterRainRippleShader";
import { DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS } from "../../authoring/optics/WaterReflectionSampling";
import { HeightfieldWaterCompositionMode } from "./HeightfieldWaterRuntimeEnums";
import type {
  HeightfieldWaterFeatureFlags,
  HeightfieldWaterMaterialState,
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

function resolveHeightfieldOpticsTier(quality: WaterQualityTier, requestedTier: WaterOpticsTier): WaterOpticsTier {
  if (quality !== WaterQualityTier.High) return "medium";
  return requestedTier === "experimental" ? "experimental" : "high";
}

function applyCachedHeightfieldWaterSurfaceOpticsBinding(
  state: HeightfieldWaterMaterialState
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const cachedBinding = state.surfaceOpticsBinding;
  const requestedReflection = cachedBinding.reflection;
  let readback: Readonly<WaterSurfaceOpticsBindingReadback>;
  try {
    readback = applyWaterSurfaceOpticsBinding(state.material.shaderData, state, cachedBinding);
  } finally {
    cachedBinding.reflection = requestedReflection;
  }
  applyHeightfieldWaterScreenSpaceReflectionReceiver(state, readback.effectiveSource === "ssr");
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

/** One normal pipeline for Forward, alpha-only depth and the SSR receiver. */
function surfaceNormalStatements(
  quality: WaterQualityTier,
  appearance: CompiledWaterSurfaceAppearanceV2,
  connectionBeforeRain: boolean
): string {
  return renderWaterShaderTemplate(heightfieldSurfaceNormalTemplate, {
    APPEARANCE_NORMAL_STATEMENTS: createWaterSurfaceAppearanceV2NormalStatements(appearance, { boundedTime: true }),
    CONNECTION_BEFORE_RAIN: Number(connectionBeforeRain),
    RAIN_NORMAL_STATEMENTS: createHeightfieldWaterRainRippleNormalStatements(quality)
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
  return (
    WATER_CONNECTION_SHADER +
    renderWaterShaderTemplate(heightfieldGeometryTemplate, {
      TIME_PERIOD_SECONDS: HEIGHTFIELD_WATER_TIME_PERIOD_SECONDS.toFixed(1)
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
    SURFACE_NORMAL_STATEMENTS: registerGeneratedWaterShaderModule(
      "HeightfieldSurfaceNormal",
      surfaceNormalStatements(quality, appearance, false)
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
    SURFACE_NORMAL_STATEMENTS: registerGeneratedWaterShaderModule(
      "HeightfieldSurfaceNormal",
      surfaceNormalStatements(quality, surfaceAppearanceV2, true)
    ),
    PRECOMPOSED_REPLACE: Number(surfaceAppearanceV2.composition === WaterSurfaceCompositionV2.PrecomposedReplace),
    DEPTH_ALPHA_STATEMENTS: registerGeneratedWaterShaderModule(
      "HeightfieldDepthAlpha",
      renderWaterShaderTemplate(heightfieldDepthAlphaTemplate, {
        ALPHA_INPUT_ASSIGNMENTS: createWaterSurfaceAppearanceV2AlphaInputAssignments(surfaceAppearanceV2)
      })
    ),
    VALUE_054_LOCALBATHYMETRYOPTICALDEPTHREFINEMENT_USELOCALBATHYMETRY: registerGeneratedWaterShaderModule(
      "HeightfieldForwardLocalBathymetryOpticalDepth",
      heightfieldOpticalDepthStatements(1, useSceneDepth, useLocalBathymetry, false)
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
    reflectionSampling: DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS
  };
  const state = Object.freeze({
    material,
    depthSource,
    quality,
    waveSet,
    ...createWaterSurfaceOpticsBindingState(),
    surfaceOpticsBinding: Object.seal(surfaceOpticsBinding),

    surfaceAppearanceReadback: createWaterSurfaceAppearanceBindingReadback(),
    surfaceAppearanceFeatureFlags: Object.seal({
      ...DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS
    })
  });
  bindHeightfieldWaterBaseMaterial(state, config, atlas);
  applyCachedHeightfieldWaterSurfaceOpticsBinding(state);
  setHeightfieldWaterCompositionMode(state, HeightfieldWaterCompositionMode.AlphaBlend);
  setHeightfieldWaterDepthWriteEnabled(state, false);
  setHeightfieldWaterFeatureFlags(state, { waves: true, microNormals: true });
  setHeightfieldWaterScreenSpaceReflectionCompositeIntensity(state, 1);
  setHeightfieldWaterSurfaceAppearanceFeatureFlags(state, DEFAULT_HEIGHTFIELD_WATER_SURFACE_APPEARANCE_FEATURE_FLAGS);
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
): void {
  state.material.shaderData.setFloat(
    HEIGHTFIELD_WATER_SHADER_PROPERTY.screenSpaceReflectionCompositeIntensity,
    Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0
  );
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
  const { maximumPatternOctaves: maximumContactFoamOctaves, maximumDetailLayers } =
    getWaterSurfaceAppearanceQualityBudget(state.quality);
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

export function setHeightfieldWaterDepthWriteEnabled(state: HeightfieldWaterMaterialState, enabled: boolean): void {
  state.material.shaderData.setInt(HEIGHTFIELD_WATER_SHADER_PROPERTY.depthWriteEnabled, enabled ? 1 : 0);
}

export function setHeightfieldWaterFeatureFlags(
  state: HeightfieldWaterMaterialState,
  flags: HeightfieldWaterFeatureFlags
): void {
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.wavesEnabled, flags.waves ? 1 : 0);
  state.material.shaderData.setFloat(HEIGHTFIELD_WATER_SHADER_PROPERTY.microNormalsEnabled, flags.microNormals ? 1 : 0);
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
