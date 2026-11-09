import { WATER_CONNECTION_SHADER } from "../connections/WaterConnectionBinding";
/** River shader creation and material binding. */
import { Material, ScreenSpaceReflection } from "@galacean/engine-core";
import {
  WaterPatternModelV2,
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import {
  RIVER_FLOW_TRAVEL_MIN_SPEED,
  RIVER_SURFACE_DERIVATIVE_MIN_FLOW_SPEED,
  RIVER_SURFACE_DERIVATIVE_STEP,
  RIVER_SURFACE_DOMAIN_WARP_SCALE,
  RIVER_SURFACE_DOMAIN_WARP_STRENGTH,
  RIVER_SURFACE_FLOW_EPSILON,
  RIVER_SURFACE_HASH_INCREMENT,
  RIVER_SURFACE_HASH_MULTIPLIER,
  RIVER_SURFACE_HASH_OUTPUT_MULTIPLIER,
  RIVER_SURFACE_MACRO_NOISE,
  RIVER_SURFACE_NOISE_PERIOD,
  RIVER_SURFACE_REFERENCE_FLOW_SPEED
} from "../../compiler/river/constants";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import riverDepthFieldTemplate from "../../shaders/river/DepthField.glsl?raw";
import riverFinalOutputTemplate from "../../shaders/river/FinalOutput.glsl?raw";
import riverForwardPassTemplate from "../../shaders/river/ForwardPass.glsl?raw";
import riverLocalSamplingTemplate from "../../shaders/river/LocalSampling.glsl?raw";
import riverFlowNormalFunctions from "../../shaders/river/RiverFlowNormal.glsl?raw";
import riverGeometryTemplate from "../../shaders/river/RiverGeometry.glsl?raw";
import riverRefractionFunctions from "../../shaders/river/RiverRefraction.glsl?raw";
import riverSurfaceNormalTemplate from "../../shaders/river/RiverSurfaceNormal.glsl?raw";
import riverSurfaceRoughnessTemplate from "../../shaders/river/RiverSurfaceRoughness.glsl?raw";
import riverScreenSpaceReflectionPassTemplate from "../../shaders/river/ScreenSpaceReflectionPass.glsl?raw";
import riverScreenSpaceReflectionSurfaceTemplate from "../../shaders/river/ScreenSpaceReflectionSurface.glsl?raw";
import riverWaterShaderTemplate from "../../shaders/RiverWater.shader?raw";
import {
  registerGeneratedWaterShaderInclude,
  registerGeneratedWaterShaderModule
} from "../material/WaterShaderLibrary";
import { createWaterShaderModule, resolveWaterShaderModule } from "../material/WaterShaderModule";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import {
  WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS,
  WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
} from "../optics/WaterEnvironmentReflectionShader";
import { createWaterAnimatedVoronoiF1ShaderFunctions } from "../surface/WaterAnimatedVoronoiF1Shader";
import { createWaterContactFoamShaderFunctions } from "../surface/WaterContactFoamShader";
import {
  WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS,
  WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
} from "../surface/WaterSurfaceAmbientLightingShader";
import type { WaterSurfaceAppearanceBindingV2 } from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import {
  createWaterSurfaceAppearanceShaderFunctions,
  createWaterSurfaceNormalShaderFunctions
} from "../surface/WaterSurfaceAppearanceShader";
import {
  WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY,
  createWaterSurfaceAppearanceV2AlphaInputAssignments,
  createWaterSurfaceAppearanceV2BoundaryStatements,
  createWaterSurfaceAppearanceV2DepthResponseStatements,
  createWaterSurfaceAppearanceV2NormalStatements,
  createWaterSurfaceAppearanceV2ShaderFunctions,
  createWaterSurfaceAppearanceV2UniformDeclarations,
  getWaterSurfaceAppearanceV2DepthProperty,
  getWaterSurfaceAppearanceV2RequiredTextureProperties
} from "../surface/WaterSurfaceAppearanceV2Shader";
import {
  createWaterSurfaceV2EvaluationStatement,
  createWaterSurfaceV2ResolvedOutputStatement,
  getWaterSurfacePrimaryColorClosureModelValue
} from "../surface/WaterSurfaceClosureShader";
import { createWaterSurfaceDepthResponseShaderFunctions } from "../surface/WaterSurfaceDepthResponseShader";
import { createWaterShaderSymbol, createWaterSurfaceGeometryAdapter } from "../surface/WaterSurfaceGeometryAdapter";
import { createResolvedWaterSurfaceFieldsV2 } from "../surface/WaterSurfaceResolvedFields";
import {
  assembleWaterSurfaceShader,
  createWaterSurfaceMaterialVariantKey
} from "../surface/WaterSurfaceShaderAssembler";
import { RIVER_SHADER_PROPERTY, RIVER_SURFACE_SHADER_TUNING } from "./constants";
import { resolveRiverMaterialVariant } from "./RiverMaterialVariant";
import { RiverSurfaceDebugMode } from "./RiverRuntimeEnums";

export function glsl(value: number, digits = 8): string {
  return value.toFixed(digits);
}

export const RIVER_SURFACE_NOISE_PERIOD_GLSL = glsl(RIVER_SURFACE_NOISE_PERIOD, 1);

export const RIVER_WATER_SURFACE_GEOMETRY_ADAPTER = createWaterSurfaceGeometryAdapter({
  id: "river-flow-deformed-v1",
  inputs: {
    positionWS: createWaterShaderSymbol("vec3", "input.worldPosition"),
    macroNormalWS: createWaterShaderSymbol("vec3", "input.macroNormalWS"),
    tangentWS: createWaterShaderSymbol("vec3", "input.tangentWS"),
    bitangentWS: createWaterShaderSymbol(
      "vec3",
      "safeNormalize3(cross(input.macroNormalWS, input.tangentWS), vec3(0.0, 0.0, 1.0))"
    ),
    meshUv: createWaterShaderSymbol("vec2", "input.meshUv"),
    flowWS: createWaterShaderSymbol("vec2", "flowDirection"),
    coverage: createWaterShaderSymbol("float", "shoreDamping"),
    verticalDepth: createWaterShaderSymbol("float", "input.authoredDepth"),
    horizontalShoreDistance: createWaterShaderSymbol("float", "localSignedDistance"),
    obstacleContact: createWaterShaderSymbol("float", "max(localFoamSource, max(-localSignedDistance, 0.0))"),
    waveCrest: createWaterShaderSymbol("float", "crestMask")
  },
  requiredBindings: ["material_LocalMapTexture"]
});

export function createRiverGeometryShaderFunctions(): string {
  return (
    WATER_CONNECTION_SHADER +
    renderWaterShaderTemplate(riverGeometryTemplate, {
      TIME_PERIOD_SECONDS: glsl(RIVER_SURFACE_SHADER_TUNING.timePeriodSeconds, 1),
      NOISE_PERIOD: RIVER_SURFACE_NOISE_PERIOD_GLSL,
      NOISE_PERIOD_UINT: `${RIVER_SURFACE_NOISE_PERIOD}u`,
      HASH_MULTIPLIER_UINT: `${RIVER_SURFACE_HASH_MULTIPLIER}u`,
      HASH_INCREMENT_UINT: `${RIVER_SURFACE_HASH_INCREMENT}u`,
      HASH_OUTPUT_MULTIPLIER_UINT: `${RIVER_SURFACE_HASH_OUTPUT_MULTIPLIER}u`,
      OCTAVE_WEIGHT_0: glsl(RIVER_SURFACE_MACRO_NOISE.octaveWeights[0]),
      SECOND_OCTAVE_SCALE: glsl(RIVER_SURFACE_MACRO_NOISE.secondOctaveScale),
      SECOND_OCTAVE_OFFSET_X: glsl(RIVER_SURFACE_MACRO_NOISE.secondOctaveOffset[0]),
      SECOND_OCTAVE_OFFSET_Y: glsl(RIVER_SURFACE_MACRO_NOISE.secondOctaveOffset[1]),
      OCTAVE_WEIGHT_1: glsl(RIVER_SURFACE_MACRO_NOISE.octaveWeights[1]),
      THIRD_OCTAVE_SCALE: glsl(RIVER_SURFACE_MACRO_NOISE.thirdOctaveScale),
      THIRD_OCTAVE_OFFSET_X: glsl(RIVER_SURFACE_MACRO_NOISE.thirdOctaveOffset[0]),
      THIRD_OCTAVE_OFFSET_Y: glsl(RIVER_SURFACE_MACRO_NOISE.thirdOctaveOffset[1]),
      OCTAVE_WEIGHT_2: glsl(RIVER_SURFACE_MACRO_NOISE.octaveWeights[2]),
      FLOW_EPSILON: glsl(RIVER_SURFACE_FLOW_EPSILON),
      REFERENCE_FLOW_SPEED: glsl(RIVER_SURFACE_REFERENCE_FLOW_SPEED),
      DOMAIN_WARP_SCALE: glsl(RIVER_SURFACE_DOMAIN_WARP_SCALE),
      WARP_OFFSET_X_X: glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetX[0]),
      WARP_OFFSET_X_Y: glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetX[1]),
      WARP_OFFSET_Y_X: glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetY[0]),
      WARP_OFFSET_Y_Y: glsl(RIVER_SURFACE_MACRO_NOISE.warpOffsetY[1]),
      DOMAIN_WARP_STRENGTH: glsl(RIVER_SURFACE_DOMAIN_WARP_STRENGTH),
      RIDGE_SCALE: glsl(RIVER_SURFACE_MACRO_NOISE.ridgeScale),
      RIDGE_OFFSET_X: glsl(RIVER_SURFACE_MACRO_NOISE.ridgeOffset[0]),
      RIDGE_OFFSET_Y: glsl(RIVER_SURFACE_MACRO_NOISE.ridgeOffset[1]),
      BROAD_WEIGHT: glsl(RIVER_SURFACE_MACRO_NOISE.broadWeight),
      RIDGE_WEIGHT: glsl(RIVER_SURFACE_MACRO_NOISE.ridgeWeight),
      DERIVATIVE_STEP: glsl(RIVER_SURFACE_DERIVATIVE_STEP),
      DERIVATIVE_MIN_FLOW_SPEED: glsl(RIVER_SURFACE_DERIVATIVE_MIN_FLOW_SPEED)
    })
  );
}

export interface RiverSurfaceAppearanceModules {
  readonly SURFACE_APPEARANCE_UNIFORMS: string;
  readonly SURFACE_NORMAL_FUNCTIONS: string;
  readonly SURFACE_NORMAL_STATEMENTS: string;
  readonly SURFACE_ROUGHNESS_STATEMENTS: string;
}

/**
 * Core SSR owns tracing and the Camera texture; River only publishes its displaced surface
 * and consumes that texture in Forward. Keeping this as a second tagged pass avoids a
 * River-owned render target or duplicate reflection march.
 */
function createRiverScreenSpaceReflectionSurfacePass(
  riverGeometryModule: string,
  localSampling: string,
  useLocalMap: boolean,
  surfaceAppearanceModules: RiverSurfaceAppearanceModules,
  roughnessDepthModule: string,
  patternFunctions: string
): string {
  const shaderTemplateReplacements: Readonly<Record<string, string | number>> = {
    VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG:
      ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT_TAG,
    VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
    VALUE_003_RIVER_GEOMETRY_MODULE: riverGeometryModule,
    ...surfaceAppearanceModules,
    ROUGHNESS_DEPTH_MODULE: roughnessDepthModule,
    ROUGHNESS_DEPTH_FUNCTIONS: roughnessDepthModule ? createWaterSurfaceDepthResponseShaderFunctions() : "",
    ROUGHNESS_PATTERN_FUNCTIONS: patternFunctions,
    LOCAL_SAMPLING: localSampling,
    USE_LOCAL_MAP: useLocalMap ? 1 : 0
  };
  const {
    VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG,
    VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT,
    ...surfaceReplacements
  } = shaderTemplateReplacements;
  const modularPassSource = renderWaterShaderTemplate(riverScreenSpaceReflectionSurfaceTemplate, surfaceReplacements);
  const modularPassInclude = registerGeneratedWaterShaderInclude("RiverSsr", modularPassSource);
  return renderWaterShaderTemplate(riverScreenSpaceReflectionPassTemplate, {
    VALUE_001_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT_TAG,
    VALUE_002_SCREENSPACEREFLECTION_MATERIAL_RECEIVER_CONTRACT,
    WATER_SSR_INCLUDE: modularPassInclude
  });
}

export function createRiverAppearancePatternFunctions(appearance: CompiledWaterSurfaceAppearanceV2): string {
  if (appearance.maximumPatternOctaves === 0) return "";
  const usesAnimatedVoronoi = appearance.boundaryEffects.some(
    (effect) => effect.pattern?.model === WaterPatternModelV2.AnimatedVoronoiF1
  );
  const usesContactVoronoi = appearance.boundaryEffects.some(
    (effect) => effect.pattern !== undefined && effect.pattern.model !== WaterPatternModelV2.AnimatedVoronoiF1
  );
  return [
    usesAnimatedVoronoi ? createWaterAnimatedVoronoiF1ShaderFunctions(appearance.maximumPatternOctaves) : "",
    usesContactVoronoi ? createWaterContactFoamShaderFunctions(appearance.maximumPatternOctaves) : ""
  ].join("\n");
}

export function createRiverResolvedSurfaceFields() {
  return createResolvedWaterSurfaceFieldsV2({
    coverage: "shoreDamping",
    surfaceHeight: "input.worldPosition.y",
    verticalDepth: "input.authoredDepth",
    sceneEyeDepth: "sceneDepthDelta",
    sceneRayDepth: "sampledOpticalDepth",
    surfaceNormalDepth: "waterSurfaceNormalDepthValue",
    horizontalShoreDistance: "distanceToBank",
    opticalPath: "opticalDepth",
    obstacleContact: "sampledOpticalDepth",
    flow: "baseFlow",
    sceneColor: "centeredSceneColor"
  });
}

export function createRiverFinalOutputStatements(appearance: CompiledWaterSurfaceAppearanceV2): string {
  const composition = appearance.composition === WaterSurfaceCompositionV2.PrecomposedReplace ? "1.0" : "0.0";
  // Physical transmission loses the energy reflected at the water interface.
  const attenuateTransmissionByFresnel =
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.PhysicalVolume ||
    appearance.primaryColorClosure === WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp;
  const primaryColorClosureModel = getWaterSurfacePrimaryColorClosureModelValue(appearance.primaryColorClosure).toFixed(
    1
  );
  const refractionEnabled = appearance.refraction.enabled ? "1.0" : "0.0";
  const surfaceColor =
    appearance.depthResponse.model === WaterSurfaceDepthResponseModelV2.CompositeExponential ||
    (appearance.depthResponse.model === WaterSurfaceDepthResponseModelV2.BeerLambert &&
      appearance.depthResponse.scatteringTint)
      ? `${getWaterSurfaceAppearanceV2DepthProperty("shallowColor")}.rgb`
      : "material_BaseColor.rgb";
  const resolvedFields = createRiverResolvedSurfaceFields();
  return renderWaterShaderTemplate(riverFinalOutputTemplate, {
    VALUE_003_PRIMARYCOLORCLOSUREMODEL: primaryColorClosureModel,
    VALUE_004_CREATEWATERSURFACEAPPEARANCEV2DEPTHRESPONSESTATEMENT:
      createWaterSurfaceAppearanceV2DepthResponseStatements(appearance, resolvedFields, { boundedTime: true }),
    VALUE_005_PRIMARYCOLORCLOSUREMODEL: primaryColorClosureModel,
    VALUE_006_REFRACTIONENABLED: refractionEnabled,
    VALUE_007_SURFACECOLOR: surfaceColor,
    VALUE_008_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_DEPTHRES:
      WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.depthResponseEnabled,
    VALUE_009_PRIMARYCOLORCLOSUREMODEL: primaryColorClosureModel,
    VALUE_010_LITSCENECOLORCLOSURE_1_0_0_0: attenuateTransmissionByFresnel ? "1.0" : "0.0",
    VALUE_011_CREATEWATERSURFACEAPPEARANCEV2ALPHAINPUTASSIGNMENTS_:
      createWaterSurfaceAppearanceV2AlphaInputAssignments(appearance),
    VALUE_012_COMPOSITION: composition,
    VALUE_013_CREATEWATERSURFACEV2EVALUATIONSTATEMENT_RESOLVEDWATE: createWaterSurfaceV2EvaluationStatement(
      "resolvedWaterClosure",
      "closureInput",
      undefined,
      appearance.depthResponse.model === WaterSurfaceDepthResponseModelV2.CompositeExponential
        ? `mix(${getWaterSurfaceAppearanceV2DepthProperty("shallowColor")}.a, ${getWaterSurfaceAppearanceV2DepthProperty("deepColor")}.a, appearanceDepthTintFactor)`
        : undefined
    ),
    VALUE_014_RIVERSURFACEDEBUGMODE_OFF_0_5: RiverSurfaceDebugMode.Off + 0.5,
    VALUE_015_CREATEWATERSURFACEV2RESOLVEDOUTPUTSTATEMENT_RESOLVED:
      createWaterSurfaceV2ResolvedOutputStatement("resolvedWaterClosure")
  });
}

export function createSurfaceShaderSource(
  shaderName: string,
  useLocalMap: boolean,
  renderContract: CompiledWaterRenderContractV1
): string {
  const appearance = renderContract.surfaceClosure.appearance;
  const assembly = assembleWaterSurfaceShader(renderContract, RIVER_WATER_SURFACE_GEOMETRY_ADAPTER);
  const localSampling = renderWaterShaderTemplate(riverLocalSamplingTemplate, {
    USE_LOCAL_MAP: useLocalMap ? 1 : 0,
    VALUE_001_GLSL_RIVER_SURFACE_SHADER_TUNING_CONFLUENCEINTERIORB: glsl(
      RIVER_SURFACE_SHADER_TUNING.confluenceInteriorBlendWidth
    ),
    VALUE_002_GLSL_RIVER_SURFACE_SHADER_TUNING_CONFLUENCEFLOWBLEND: glsl(
      RIVER_SURFACE_SHADER_TUNING.confluenceFlowBlendWeight
    ),
    VALUE_003_GLSL_RIVER_SURFACE_SHADER_TUNING_CONFLUENCEFOAMWEIGH: glsl(
      RIVER_SURFACE_SHADER_TUNING.confluenceFoamWeight
    )
  });
  const riverGeometryModule = registerGeneratedWaterShaderModule(
    "RiverGeometry",
    createRiverGeometryShaderFunctions() + "\n" + riverFlowNormalFunctions
  );
  const roughnessAppearance = {
    ...appearance,
    boundaryEffects: appearance.boundaryEffects.filter((effect) => effect.outputs.roughness !== undefined)
  };
  const roughnessNeedsDepth = roughnessAppearance.boundaryEffects.some((effect) =>
    [
      WaterFieldSemantic.SceneRayDepth,
      WaterFieldSemantic.SurfaceNormalDepth,
      WaterFieldSemantic.OpticalPath,
      WaterFieldSemantic.ObstacleContact
    ].includes(effect.field)
  );
  const roughnessFields = createResolvedWaterSurfaceFieldsV2({
    coverage: "1.0",
    surfaceHeight: "input.worldPosition.y",
    verticalDepth: "input.authoredDepth",
    sceneEyeDepth: "sceneDepthDelta",
    sceneRayDepth: "sampledOpticalDepth",
    surfaceNormalDepth: "waterSurfaceNormalDepthValue",
    horizontalShoreDistance: "max(0.0, input.riverHalfWidth - abs(input.motionCoordinates.x))",
    opticalPath: "min(sampledOpticalDepth, material_MaximumSurfaceOpticalDistance)",
    obstacleContact: "sampledOpticalDepth",
    flow: "baseFlow",
    sceneColor: "vec3(0.0)"
  });
  const surfaceAppearanceModules: RiverSurfaceAppearanceModules = {
    SURFACE_APPEARANCE_UNIFORMS: registerGeneratedWaterShaderModule(
      "RiverSurfaceAppearanceUniforms",
      createWaterSurfaceAppearanceV2UniformDeclarations(appearance)
    ),
    SURFACE_NORMAL_FUNCTIONS: registerGeneratedWaterShaderModule(
      "RiverSurfaceNormalFunctions",
      createWaterSurfaceNormalShaderFunctions()
    ),
    SURFACE_ROUGHNESS_STATEMENTS: registerGeneratedWaterShaderModule(
      "RiverSurfaceRoughness",
      renderWaterShaderTemplate(riverSurfaceRoughnessTemplate, {
        // Only obstacle-contact roughness consumes this foreground gate. Other variants
        // must not reference camera depth when the SSR pass omits its depth module.
        ROUGHNESS_CONTACT_DEPTH_ENABLED: roughnessAppearance.boundaryEffects.some(
          (effect) => effect.field === WaterFieldSemantic.ObstacleContact
        )
          ? 1
          : 0,
        ROUGHNESS_BOUNDARY_STATEMENTS: createWaterSurfaceAppearanceV2BoundaryStatements(appearance, roughnessFields, {
          output: "roughness",
          boundedTime: true
        })
      })
    ),
    SURFACE_NORMAL_STATEMENTS: registerGeneratedWaterShaderModule(
      "RiverSurfaceNormal",
      renderWaterShaderTemplate(riverSurfaceNormalTemplate, {
        APPEARANCE_NORMAL:
          appearance.detailLayers.length > 0
            ? createWaterSurfaceAppearanceV2NormalStatements(appearance, {
                boundedTime: true,
                // X follows the ribbon tangent, Y its bitangent. Travel time
                // grows downstream across bends and shared network seams;
                // CPU offset transports the pattern downstream. Do not
                // multiply travel time by local speed: that would break phase
                // continuity when speed or width changes.
                flowAdvected: "vec2(input.motionCoordinates.y, -input.motionCoordinates.x)",
                // Keep phase continuous across stopped/flowing regions. Fade
                // only advected layers over the compiler's low-speed interval;
                // world-space disturbances remain independently animated.
                flowAdvectedWeight: `smoothstep(0.0, ${glsl(RIVER_FLOW_TRAVEL_MIN_SPEED)}, input.localFlowSpeed)`
              })
            : "// River owns its mesh-aligned detail normal."
      })
    )
  };
  const shaderTemplateReplacements: Readonly<Record<string, string | number>> = {
    VALUE_001_SHADERNAME: shaderName,
    SURFACE_BOUNDARY_STATEMENTS: createWaterSurfaceAppearanceV2BoundaryStatements(
      appearance,
      createRiverResolvedSurfaceFields(),
      { output: "surface", boundedTime: true }
    ),
    SURFACE_SCATTERING_ENABLED: renderContract.optics.profile.surfaceScattering ? 1 : 0,
    REFRACTION_NORMAL_SOURCE:
      appearance.refraction.normalSource === WaterRefractionNormalSourceV2.FirstDetailLayer
        ? 2
        : appearance.refraction.normalSource === WaterRefractionNormalSourceV2.TangentSpace
          ? 1
          : 0,
    REFRACTION_SHIFTED_DEPTH:
      appearance.refraction.validation === WaterRefractionValidationModeV2.ShiftedSceneDepth ? 1 : 0,
    // Engine resolves symbols in conditional branches before compiling variants.
    // Keep their declarations available even when surface scattering is disabled.
    REFRACTION_FUNCTIONS: registerGeneratedWaterShaderModule("RiverRefraction", riverRefractionFunctions),
    AMBIENT_UNIFORMS: registerGeneratedWaterShaderModule(
      "RiverAmbientUniforms",
      WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
    ),
    AMBIENT_FUNCTIONS: registerGeneratedWaterShaderModule(
      "RiverAmbientLighting",
      WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS
    ),
    VALUE_003_USE_LOCAL_MAP: useLocalMap ? 1 : 0,
    VALUE_004_WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS: registerGeneratedWaterShaderModule(
      "RiverForwardReflectionUniforms",
      WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
    ),
    ...surfaceAppearanceModules,
    FORWARD_APPEARANCE_FUNCTIONS: registerGeneratedWaterShaderModule(
      "RiverForwardAppearanceFunctions",
      createWaterSurfaceAppearanceShaderFunctions() +
        "\n" +
        createWaterSurfaceAppearanceV2ShaderFunctions(appearance) +
        "\n" +
        createWaterSurfaceDepthResponseShaderFunctions()
    ),
    VALUE_006_WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "RiverForwardEnvironmentReflection",
      WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS
    ),
    VALUE_007_ASSEMBLY_SHAREDFUNCTIONSOURCE: registerGeneratedWaterShaderModule(
      "RiverForwardSharedSurface",
      assembly.sharedFunctionSource
    ),
    VALUE_010_CREATERIVERAPPEARANCEPATTERNFUNCTIONS_APPEARANCE: registerGeneratedWaterShaderModule(
      "RiverForwardAppearancePattern",
      createRiverAppearancePatternFunctions(appearance)
    ),
    VALUE_011_RIVER_GEOMETRY_MODULE: riverGeometryModule,
    DEPTH_FIELD_MODULE: registerGeneratedWaterShaderModule("RiverForwardDepthField", riverDepthFieldTemplate),
    VALUE_074_LOCALSAMPLING: registerGeneratedWaterShaderModule("RiverForwardLocalSampling", localSampling),
    VALUE_129_GLSL_RIVER_SURFACE_SHADER_TUNING_SHOREFOAMWIDTHSCALE: glsl(
      RIVER_SURFACE_SHADER_TUNING.shoreFoamWidthScale
    ),
    VALUE_163_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHSTART: glsl(
      RIVER_SURFACE_SHADER_TUNING.refractionDepthStart
    ),
    VALUE_164_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHEND: glsl(RIVER_SURFACE_SHADER_TUNING.refractionDepthEnd),
    VALUE_165_WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY_REFRACTIONUV:
      WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.refractionUvScale,
    VALUE_166_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHTOLERANC: glsl(
      RIVER_SURFACE_SHADER_TUNING.refractionDepthToleranceMinimum
    ),
    VALUE_167_GLSL_RIVER_SURFACE_SHADER_TUNING_REFRACTIONDEPTHTOLERANC: glsl(
      RIVER_SURFACE_SHADER_TUNING.refractionDepthToleranceScale
    ),
    VALUE_168_RIVERSURFACEDEBUGMODE_OFF_0_5: RiverSurfaceDebugMode.Off + 0.5,
    VALUE_169_RIVERSURFACEDEBUGMODE_MACROHEIGHT_0_5: RiverSurfaceDebugMode.MacroHeight - 0.5,
    VALUE_170_RIVERSURFACEDEBUGMODE_CRESTMASK_0_5: RiverSurfaceDebugMode.CrestMask - 0.5,
    VALUE_171_RIVERSURFACEDEBUGMODE_MICRONORMAL_0_5: RiverSurfaceDebugMode.MicroNormal - 0.5,
    VALUE_172_RIVERSURFACEDEBUGMODE_SHOREDAMPING_0_5: RiverSurfaceDebugMode.ShoreDamping - 0.5,
    VALUE_173_RIVERSURFACEDEBUGMODE_LOCALFLOW_0_5: RiverSurfaceDebugMode.LocalFlow - 0.5,
    VALUE_174_RIVERSURFACEDEBUGMODE_LOCALFOAM_0_5: RiverSurfaceDebugMode.LocalFoam - 0.5,
    VALUE_175_RIVERSURFACEDEBUGMODE_LOCALSIGNEDDISTANCE_0_5: RiverSurfaceDebugMode.LocalSignedDistance - 0.5,
    VALUE_176_RIVERSURFACEDEBUGMODE_ATLASRECT_0_5: RiverSurfaceDebugMode.AtlasRect - 0.5,
    VALUE_177_RIVERSURFACEDEBUGMODE_BASEFLOW_0_5: RiverSurfaceDebugMode.BaseFlow - 0.5,
    VALUE_178_RIVERSURFACEDEBUGMODE_FINALFLOW_0_5: RiverSurfaceDebugMode.FinalFlow - 0.5,
    VALUE_179_ASSEMBLY_GEOMETRYBRIDGESOURCE: registerGeneratedWaterShaderModule(
      "RiverForwardGeometryBridge",
      assembly.geometryBridgeSource
    ),
    VALUE_180_CREATERIVERFINALOUTPUTSTATEMENTS_APPEARANCE: registerGeneratedWaterShaderModule(
      "RiverForwardFinalOutput",
      createRiverFinalOutputStatements(appearance)
    ),
    VALUE_181_CREATERIVERSCREENSPACEREFLECTIONSURFACEPASS: createRiverScreenSpaceReflectionSurfacePass(
      riverGeometryModule,
      localSampling,
      useLocalMap,
      surfaceAppearanceModules,
      roughnessNeedsDepth ? riverDepthFieldTemplate : "",
      createRiverAppearancePatternFunctions(roughnessAppearance)
    )
  };
  const { VALUE_001_SHADERNAME, VALUE_181_CREATERIVERSCREENSPACEREFLECTIONSURFACEPASS, ...forwardReplacements } =
    shaderTemplateReplacements;
  const modularPassSource = renderWaterShaderTemplate(riverForwardPassTemplate, forwardReplacements);
  const modularPassInclude = registerGeneratedWaterShaderInclude("RiverForward", modularPassSource);
  return renderWaterShaderTemplate(riverWaterShaderTemplate, {
    VALUE_001_SHADERNAME,
    VALUE_181_CREATERIVERSCREENSPACEREFLECTIONSURFACEPASS,
    WATER_FORWARD_INCLUDE: modularPassInclude
  });
}

export function createRiverSurfaceAppearanceV2ShaderSource(
  renderContract: CompiledWaterRenderContractV1,
  useLocalMap = false
): string {
  const materialVariantKey = createWaterSurfaceMaterialVariantKey(
    renderContract.variantKey,
    RIVER_WATER_SURFACE_GEOMETRY_ADAPTER.variantKey
  );
  const resolution = resolveRiverMaterialVariant("surface", useLocalMap, materialVariantKey);
  return createSurfaceShaderSource(resolution.shaderName, useLocalMap, renderContract);
}

export function resolveRiverSurfaceShader(
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  useLocalMap: boolean
): Material["shader"] {
  const appearance = binding.appearance;
  const renderContract = binding.renderContract;
  if (!renderContract) {
    throw new Error("River materials require a compiled V2 Render Contract.");
  }
  const materialVariantKey = createWaterSurfaceMaterialVariantKey(
    renderContract.variantKey,
    RIVER_WATER_SURFACE_GEOMETRY_ADAPTER.variantKey
  );
  const resolution = resolveRiverMaterialVariant("surface", useLocalMap, materialVariantKey);
  return resolveWaterShaderModule(resolution.shaderName, () =>
    createWaterShaderModule(
      resolution.shaderName,
      createSurfaceShaderSource(resolution.shaderName, useLocalMap, renderContract),
      resolution.variant,
      [
        RIVER_SHADER_PROPERTY.surfaceNormalTexture,
        ...(useLocalMap ? [RIVER_SHADER_PROPERTY.localMapTexture] : []),
        ...getWaterSurfaceAppearanceV2RequiredTextureProperties(appearance)
      ]
    )
  );
}
