import { registerWaterSurfacePicking } from "../surface/WaterSurfacePicking";
import { WATER_CONNECTION_SHADER } from "../connections/WaterConnectionBinding";
/** Authoritative, render-only Ocean material. */
import { OceanDebugView, assertOceanDebugView } from "./OceanDebugView";
import { createWaterSurfaceV2ResolvedOutputStatement } from "../surface/WaterSurfaceClosureShader";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import { createOceanTuningFromRenderContract, getCanonicalOceanRenderContract } from "./OceanRenderContract";
import {
  createOceanSurfaceShaderAssembly,
  createOceanAppearanceShaderSource,
  createOceanDepthResponseShaderSource,
  createOceanBoundaryShaderSource
} from "./OceanSurfaceShaderAssembly";
import {
  bindOceanRenderContractUniforms,
  bindOceanNearshoreUniforms,
  type OceanNearshoreBinding
} from "./OceanSurfaceUniformBinding";
import oceanSurfaceUniforms from "../../shaders/ocean/SurfaceUniforms.glsl?raw";
import oceanGeometryTemplate from "../../shaders/ocean/OceanGeometry.glsl?raw";
import oceanRefractionTemplate from "../../shaders/ocean/OceanRefraction.glsl?raw";
import oceanSurfaceDetailTemplate from "../../shaders/ocean/OceanSurfaceDetail.glsl?raw";
import oceanWaveSpectrumTemplate from "../../shaders/ocean/OceanWaveSpectrum.glsl?raw";
import oceanForwardPassTemplate from "../../shaders/ocean/ForwardPass.glsl?raw";
import oceanShaderTemplate from "../../shaders/Ocean.shader?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import {
  registerGeneratedWaterShaderInclude,
  registerGeneratedWaterShaderModule,
  withScopedWaterShaderAssemblyRegistry
} from "../material/WaterShaderLibrary";
import { type Engine, Material, type Shader, type Texture } from "@galacean/engine-core";
import { createWaterMaterialVariant } from "../material/WaterMaterialVariant";
import {
  createWaterShaderModule,
  resolveWaterShaderModule,
  type WaterShaderModule
} from "../material/WaterShaderModule";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import {
  OCEAN_LOOK,
  OCEAN_LOOK_ID,
  OCEAN_RENDER_BUDGET,
  OCEAN_WAVE_KERNEL
} from "../../authoring/ocean/presets/OceanLook";
import { hashStableValue } from "../../compiler/shared/determinism";
import {
  WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS,
  WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
} from "../optics/WaterEnvironmentReflectionShader";
import {
  applyWaterSurfaceOpticsBinding,
  applyWaterSurfaceReflectionBinding,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import {
  WaterOpticsDebugView,
  type WaterSurfaceOpticsBindingState,
  type WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";
import {
  WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS,
  WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
} from "../surface/WaterSurfaceAmbientLightingShader";
import { createWaterSpatialFieldShaderDecodeFunctions } from "../spatial/WaterSpatialFieldShaderDecode";
import { bindOceanFarFieldTuning, OCEAN_FAR_FIELD_SHADER_FUNCTIONS } from "./OceanFarFieldShader";
import type { OceanTextures } from "./OceanTextureLibrary";
import { createOceanRuntimeTuning, type OceanRuntimeTuning } from "./OceanRuntimeTuning";
import { OCEAN_GEOMETRY_WAVE_BANDLIMIT } from "./OceanGeometryWaveBandlimit";
import {
  createOceanSceneFogApplication,
  createOceanSceneFogDeclarations,
  OCEAN_SCENE_FOG_ENABLED_PROPERTY
} from "./OceanSceneFogShader";

export const OCEAN_SHADER_NAME = "AIWorld/Ocean";
export const OCEAN_SHADER_REQUIRED_BINDINGS = Object.freeze([
  "material_CausticsTexture",
  "material_FoamTexture",
  "material_IntersectionNoiseTexture",
  "material_NearshoreTexture",
  "material_RoughWavesTexture",
  "material_SmoothWavesTexture"
]);

export interface OceanMaterialConfig {
  readonly renderContract?: CompiledWaterRenderContractV1;
  readonly waterLevel: number;
  readonly textures: Readonly<OceanTextures>;
  readonly nearshore: Readonly<OceanNearshoreBinding>;
  readonly reflection?: Readonly<WaterReflectionBinding>;
  readonly surfaceTimeOverride?: number;
  readonly cameraFeaturesAvailable?: boolean;
  readonly debugView?: OceanDebugView;
  readonly lodDebug?: boolean;
  readonly sceneFogEnabled: boolean;
  readonly tuning?: Readonly<OceanRuntimeTuning>;
}

export interface OceanMaterialState {
  readonly renderContract: CompiledWaterRenderContractV1;
  readonly material: Material;
  readonly lookId: typeof OCEAN_LOOK_ID;
  parameterHash: string;
  readonly opticsBindingState: WaterSurfaceOpticsBindingState;
  tuning: Readonly<OceanRuntimeTuning>;
  cameraFeaturesAvailable: boolean;
  debugView: OceanDebugView;
  lodDebug: boolean;
  bandlimitViewportHeight: number;
}

interface NullableTextureShaderData {
  setTexture(propertyName: string, value: Texture | null): void;
}

function glsl(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Ocean GLSL constant '${value}' must be finite.`);
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** Source is intentionally inspectable so tests can lock the authorized closure. */
export function createOceanShaderSource(
  contract: CompiledWaterRenderContractV1 = getCanonicalOceanRenderContract()
): string {
  const assembly = createOceanSurfaceShaderAssembly(contract, "near");
  const look = OCEAN_LOOK;
  const waveKernel = OCEAN_WAVE_KERNEL;
  const bandlimit = OCEAN_GEOMETRY_WAVE_BANDLIMIT;
  const baseFrequency = waveKernel.baseFrequencies.map((value) => value * 3);
  const waveSpectrum = renderWaterShaderTemplate(oceanWaveSpectrumTemplate, {
    SECOND_GROUP_FREQUENCY_SCALE: glsl(
      waveKernel.cumulativeFrequencyScales[1] / waveKernel.cumulativeFrequencyScales[0]
    ),
    THIRD_GROUP_FREQUENCY_SCALE: glsl(waveKernel.cumulativeFrequencyScales[2] / waveKernel.cumulativeFrequencyScales[1])
  });
  const geometryFunctions =
    WATER_CONNECTION_SHADER +
    renderWaterShaderTemplate(oceanGeometryTemplate, {
      MINIMUM_SAMPLES_PER_WAVELENGTH: glsl(bandlimit.minimumSamplesPerWavelength),
      FULL_SAMPLES_PER_WAVELENGTH: glsl(bandlimit.fullSamplesPerWavelength),
      MINIMUM_PROJECTED_PIXELS_PER_WAVELENGTH: glsl(bandlimit.minimumProjectedPixelsPerWavelength),
      FULL_PROJECTED_PIXELS_PER_WAVELENGTH: glsl(bandlimit.fullProjectedPixelsPerWavelength),
      DISTANCE_FADE_START_WAVELENGTHS: glsl(bandlimit.distanceFadeStartWavelengths),
      DISTANCE_FADE_END_WAVELENGTHS: glsl(bandlimit.distanceFadeEndWavelengths),
      MINIMUM_DISPLACEMENT_AMPLITUDE_METRES: glsl(bandlimit.minimumDisplacementAmplitudeMetres)
    });
  const shaderTemplateReplacements: Readonly<Record<string, string | number>> = {
    VALUE_001_SHADER_NAME:
      contract.variantKey === getCanonicalOceanRenderContract().variantKey
        ? OCEAN_SHADER_NAME
        : `${OCEAN_SHADER_NAME}/${contract.variantKey}`,
    SHARED_RESOLVED_OUTPUT: createWaterSurfaceV2ResolvedOutputStatement("resolvedWaterClosure"),
    SHARED_FAR_OUTPUT: createWaterSurfaceV2ResolvedOutputStatement("farWaterClosure"),
    SHARED_SURFACE_UNIFORMS: registerGeneratedWaterShaderModule(
      "OceanSurfaceUniforms",
      oceanSurfaceUniforms + "\n" + createOceanAppearanceShaderSource(contract)
    ),
    SHARED_SURFACE_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanSurfaceFunctions",
      assembly.sharedFunctionSource
    ),
    SHARED_GEOMETRY_BRIDGE: assembly.geometryBridgeSource,
    SHARED_BOUNDARY_RESPONSE: createOceanBoundaryShaderSource(contract),
    SHARED_DEPTH_RESPONSE: createOceanDepthResponseShaderSource(contract),

    VALUE_002_WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS: registerGeneratedWaterShaderModule(
      "OceanForwardReflectionUniforms",
      WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
    ),
    VALUE_003_WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS: registerGeneratedWaterShaderModule(
      "OceanForwardAmbientLightingUniforms",
      WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
    ),
    VALUE_004_CREATEOCEANSCENEFOGDECLARATIONS: registerGeneratedWaterShaderModule(
      "OceanForwardSceneFogDeclarations",
      createOceanSceneFogDeclarations()
    ),
    VALUE_005_WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanForwardEnvironmentReflection",
      WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS
    ),
    VALUE_006_WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanForwardAmbientLighting",
      WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS
    ),
    VALUE_007_CREATEWATERSPATIALFIELDSHADERDECODEFUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanForwardSpatialDecode",
      createWaterSpatialFieldShaderDecodeFunctions()
    ),
    VALUE_008_OCEAN_FAR_FIELD_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanForwardFarField",
      renderWaterShaderTemplate(OCEAN_FAR_FIELD_SHADER_FUNCTIONS, {
        SHARED_FAR_GEOMETRY_BRIDGE: createOceanSurfaceShaderAssembly(contract, "far").geometryBridgeSource
      })
    ),
    OCEAN_REFRACTION_POSITION_HELPERS: registerGeneratedWaterShaderModule(
      "OceanForwardRefractionPosition",
      renderWaterShaderTemplate(oceanRefractionTemplate, { SECTION: 0 })
    ),
    OCEAN_SURFACE_DETAIL_NORMAL_HELPERS: registerGeneratedWaterShaderModule(
      "OceanForwardSurfaceDetailNormal",
      renderWaterShaderTemplate(oceanSurfaceDetailTemplate, { SECTION: 0 })
    ),
    OCEAN_REFRACTION_SCREEN_HELPERS: registerGeneratedWaterShaderModule(
      "OceanForwardRefractionScreen",
      renderWaterShaderTemplate(oceanRefractionTemplate, { SECTION: 1 })
    ),
    OCEAN_SURFACE_DETAIL_UV_HELPERS: registerGeneratedWaterShaderModule(
      "OceanForwardSurfaceDetailUv",
      renderWaterShaderTemplate(oceanSurfaceDetailTemplate, { SECTION: 1 })
    ),
    OCEAN_GEOMETRY_FUNCTIONS: registerGeneratedWaterShaderModule("OceanForwardGeometry", geometryFunctions),
    VALUE_016_GLSL_WAVEKERNEL_PHASERATES_0: glsl(waveKernel.phaseRates[0]),
    VALUE_017_GLSL_WAVEKERNEL_PHASERATES_1: glsl(waveKernel.phaseRates[1]),
    VALUE_018_GLSL_WAVEKERNEL_PHASERATES_2: glsl(waveKernel.phaseRates[2]),
    VALUE_019_GLSL_WAVEKERNEL_PHASERATES_3: glsl(waveKernel.phaseRates[3]),
    VALUE_020_WAVEKERNEL_AMPLITUDES_MAP_GLSL_JOIN: waveKernel.amplitudes.map(glsl).join(", "),
    VALUE_021_BASEFREQUENCY_MAP_GLSL_JOIN: baseFrequency.map(glsl).join(", "),
    VALUE_022_GLSL_WAVEKERNEL_STEEPNESSMULTIPLIER: glsl(waveKernel.steepnessMultiplier),
    VALUE_023_WAVEKERNEL_DIRECTIONS_SLICE_0_2_FLAT_MAP_GLSL_JOIN: waveKernel.directions
      .slice(0, 2)
      .flat()
      .map(glsl)
      .join(", "),
    VALUE_024_WAVEKERNEL_DIRECTIONS_SLICE_2_FLAT_MAP_GLSL_JOIN: waveKernel.directions
      .slice(2)
      .flat()
      .map(glsl)
      .join(", "),
    VALUE_025_GLSL_BANDLIMIT_GRAZINGFADESTARTSINE: glsl(bandlimit.grazingFadeStartSine),
    VALUE_026_GLSL_BANDLIMIT_GRAZINGFADEENDSINE: glsl(bandlimit.grazingFadeEndSine),
    OCEAN_WAVE_SPECTRUM: registerGeneratedWaterShaderModule("OceanForwardWaveSpectrum", waveSpectrum),
    VALUE_028_GLSL_LOOK_WAVE_COUNT: glsl(look.wave.count),
    VALUE_029_GLSL_WAVEKERNEL_HORIZONTALSCALEPERWAVEHEIGHT: glsl(waveKernel.horizontalScalePerWaveHeight),
    OCEAN_SURFACE_DETAIL_SAMPLING_HELPERS: registerGeneratedWaterShaderModule(
      "OceanForwardSurfaceDetailSampling",
      renderWaterShaderTemplate(oceanSurfaceDetailTemplate, { SECTION: 2 })
    ),
    VALUE_030_CREATEOCEANSCENEFOGAPPLICATION_FARFIELDCOLOR: registerGeneratedWaterShaderModule(
      "OceanForwardFarFieldFog",
      createOceanSceneFogApplication("farFieldColor")
    ),
    VALUE_031_CREATEOCEANSCENEFOGAPPLICATION_FINALCOLOR: registerGeneratedWaterShaderModule(
      "OceanForwardFinalFog",
      createOceanSceneFogApplication("finalColor")
    )
  };
  const { VALUE_001_SHADER_NAME, ...forwardReplacements } = shaderTemplateReplacements;
  const modularPassSource = renderWaterShaderTemplate(oceanForwardPassTemplate, forwardReplacements);
  const modularPassInclude = registerGeneratedWaterShaderInclude("OceanForward", modularPassSource);
  return renderWaterShaderTemplate(oceanShaderTemplate, {
    VALUE_001_SHADER_NAME,
    WATER_FORWARD_INCLUDE: modularPassInclude
  });
}

/** Creates the complete detailed Ocean module used by both runtime JIT and offline AOT compilation. */
export function createOceanShaderModule(
  contract: CompiledWaterRenderContractV1 = getCanonicalOceanRenderContract()
): WaterShaderModule {
  return withScopedWaterShaderAssemblyRegistry(() =>
    createWaterShaderModule(
      contract.variantKey === getCanonicalOceanRenderContract().variantKey
        ? OCEAN_SHADER_NAME
        : `${OCEAN_SHADER_NAME}/${contract.variantKey}`,
      createOceanShaderSource(contract),
      createWaterMaterialVariant("ocean", {
        surface: "detailed",
        sharedClosure: createOceanSurfaceShaderAssembly(contract, "near").materialVariantKey
      }),
      OCEAN_SHADER_REQUIRED_BINDINGS
    )
  );
}

function bindOceanDetailTextures(material: Material, textures: Readonly<OceanTextures>): void {
  const shaderData = material.shaderData as unknown as NullableTextureShaderData;
  shaderData.setTexture("material_SmoothWavesTexture", textures.smoothWaves);
  shaderData.setTexture("material_RoughWavesTexture", textures.roughWaves);
  shaderData.setTexture("material_CausticsTexture", textures.caustics);
  shaderData.setTexture("material_FoamTexture", textures.foam);
  shaderData.setTexture("material_IntersectionNoiseTexture", textures.intersectionNoise);
}

export function setOceanRuntimeTuning(state: OceanMaterialState, source: Readonly<OceanRuntimeTuning>): void {
  const tuning = createOceanRuntimeTuning(source);
  const shaderData = state.material.shaderData;
  shaderData.setVector4(
    "material_OceanWaveParameters",
    new Vector4(tuning.wave.height, tuning.wave.distance, tuning.wave.speed, tuning.wave.steepness)
  );
  shaderData.setVector3(
    "material_OceanWaveFadeAndTimeScale",
    new Vector3(tuning.wave.fadeStartMetres, tuning.wave.fadeEndMetres, tuning.wave.animationSpeed)
  );
  shaderData.setVector4(
    "material_OceanNormalParameters",
    new Vector4(tuning.normal.strength, tuning.normal.subTiling, tuning.normal.speed, tuning.normal.subSpeed)
  );
  shaderData.setVector4(
    "material_OceanNormalMapping",
    new Vector4(
      tuning.normal.tiling[0],
      tuning.normal.tiling[1],
      tuning.normal.distanceTiling,
      tuning.normal.distanceFadeStartMetres
    )
  );
  shaderData.setFloat("material_OceanNormalFadeEndDistance", tuning.normal.distanceFadeEndMetres);
  bindOceanFarFieldTuning(shaderData, tuning);
  shaderData.setFloat("material_OceanReflectionNormalBlend", tuning.reflection.distortion);
  shaderData.setVector4(
    "material_OceanSurfaceFoamParameters",
    new Vector4(
      tuning.surfaceFoam.enabled ? 1 : 0,
      tuning.surfaceFoam.baseAmount,
      tuning.surfaceFoam.subTiling,
      tuning.surfaceFoam.speed
    )
  );
  shaderData.setVector4(
    "material_OceanSurfaceFoamMapping",
    new Vector4(
      tuning.surfaceFoam.subSpeed,
      tuning.surfaceFoam.distortion,
      tuning.surfaceFoam.tiling[0],
      tuning.surfaceFoam.tiling[1]
    )
  );
  shaderData.setVector4("material_OceanSurfaceFoamColor", new Vector4(...tuning.surfaceFoam.color));
  shaderData.setVector4(
    "material_OceanIntersectionParameters",
    new Vector4(
      tuning.intersection.enabled ? 1 : 0,
      tuning.intersection.lengthMetres,
      tuning.intersection.falloff,
      tuning.intersection.tiling
    )
  );
  shaderData.setVector4(
    "material_OceanIntersectionMotion",
    new Vector4(
      tuning.intersection.speed,
      tuning.intersection.clipping,
      tuning.intersection.distortion,
      tuning.intersection.rippleDistance
    )
  );
  shaderData.setVector4("material_OceanIntersectionColor", new Vector4(...tuning.intersection.color));
  shaderData.setFloat("material_OceanIntersectionRippleStrength", tuning.intersection.rippleStrength);
  shaderData.setVector4(
    "material_OceanCausticsParameters",
    new Vector4(
      tuning.caustics.enabled ? 1 : 0,
      tuning.caustics.brightness,
      tuning.caustics.chromance,
      tuning.caustics.distortion
    )
  );
  shaderData.setVector4(
    "material_OceanCausticsMotion",
    new Vector4(tuning.caustics.speed, tuning.caustics.tiling, 0, 0)
  );
  shaderData.setVector4(
    "material_OceanTranslucencyParameters",
    new Vector4(
      tuning.translucency.enabled ? 1 : 0,
      tuning.translucency.strength,
      tuning.translucency.directStrength,
      tuning.translucency.exponent
    )
  );
  shaderData.setFloat("material_OceanTranslucencyCurvatureMask", tuning.translucency.curvatureMask);
  shaderData.setVector4("material_AppearanceV2DepthShallowColor", new Vector4(...tuning.color.shallow));
  shaderData.setVector4("material_AppearanceV2DepthDeepColor", new Vector4(...tuning.color.deep));
  shaderData.setFloat("material_AppearanceV2DepthCoefficient0", tuning.depth.horizontal * 0.1);
  shaderData.setFloat("material_AppearanceV2DepthCoefficient1", tuning.depth.vertical);
  shaderData.setFloat("material_AppearanceV2MacroNormalStrength", tuning.wave.normalStrength);
  shaderData.setFloat("material_AppearanceV2DirectionalHighlightStrength", tuning.reflection.sunStrength);
  shaderData.setFloat(
    "material_AppearanceV2DirectionalHighlightExponent",
    8196 * (1 - tuning.reflection.sunSize) + 64 * tuning.reflection.sunSize
  );
  shaderData.setFloat("material_AppearanceV2DirectionalHighlightDistortion", tuning.reflection.sunDistortion);
  shaderData.setFloat("material_RefractionStrength", tuning.refraction.strength);
  shaderData.setFloat("material_RefractionEnabled", tuning.refraction.enabled ? 1 : 0);
  shaderData.setFloat("material_AppearanceV2Boundary0Range", tuning.intersection.lengthMetres);
  state.tuning = tuning;
  state.parameterHash = hashStableValue(tuning);
}

function initializeOceanMaterialUniforms(state: OceanMaterialState, config: Readonly<OceanMaterialConfig>): void {
  const material = state.material;
  bindOceanDetailTextures(material, config.textures);
  material.shaderData.setInt("material_DepthWriteEnabled", 0);
  material.shaderData.setFloat("material_WaterLevel", config.waterLevel);
  material.shaderData.setFloat("material_SurfaceTimeOverride", config.surfaceTimeOverride ?? -1);
  material.shaderData.setFloat("material_CameraFeaturesAvailable", config.cameraFeaturesAvailable === false ? 0 : 1);
  material.shaderData.setFloat("material_DebugView", config.debugView ?? OceanDebugView.Final);
  material.shaderData.setFloat("material_LodDebug", config.lodDebug === true ? 1 : 0);
  material.shaderData.setFloat(OCEAN_SCENE_FOG_ENABLED_PROPERTY, config.sceneFogEnabled ? 1 : 0);
  material.shaderData.setFloat("material_OceanBandlimitViewportHeight", state.bandlimitViewportHeight);
  material.shaderData.setVector2(
    "material_OceanFarTransition",
    new Vector2(
      OCEAN_RENDER_BUDGET.farFieldClosureTransitionStartMetres,
      OCEAN_RENDER_BUDGET.farFieldClosureTransitionEndMetres
    )
  );
  bindOceanNearshoreUniforms(material.shaderData, config.nearshore);
  setOceanRuntimeTuning(state, state.tuning);
}

export function createOceanMaterial(engine: Engine, config: Readonly<OceanMaterialConfig>): OceanMaterialState {
  const contract = config.renderContract ?? getCanonicalOceanRenderContract();
  const tuning = createOceanTuningFromRenderContract(contract, config.tuning);
  const shader = resolveOceanShader(contract);
  const material = new Material(engine, shader);
  registerWaterSurfacePicking(material, "material_DepthWriteEnabled");
  material.name = "Ocean";
  const opticsBindingState = createWaterSurfaceOpticsBindingState();
  applyWaterSurfaceOpticsBinding(material.shaderData, opticsBindingState, {
    tier: "high",
    opticalProfile: contract.optics.profile,
    refractionEnabled: true,
    reflection: config.reflection,
    debugView: WaterOpticsDebugView.Final
  });
  const state: OceanMaterialState = {
    renderContract: contract,
    material,
    lookId: OCEAN_LOOK_ID,
    parameterHash: hashStableValue(tuning),
    opticsBindingState,
    tuning,
    cameraFeaturesAvailable: config.cameraFeaturesAvailable !== false,
    debugView: config.debugView ?? OceanDebugView.Final,
    lodDebug: config.lodDebug === true,
    bandlimitViewportHeight: Math.max(engine.canvas.height, 1)
  };
  initializeOceanMaterialUniforms(state, config);
  bindOceanRenderContractUniforms(material, contract);
  return state;
}

/** Resolves the detailed Ocean Shader through its exact, transaction-scoped include closure. */
export function resolveOceanShader(
  contract: CompiledWaterRenderContractV1 = getCanonicalOceanRenderContract()
): Shader {
  const shaderName =
    contract.variantKey === getCanonicalOceanRenderContract().variantKey
      ? OCEAN_SHADER_NAME
      : `${OCEAN_SHADER_NAME}/${contract.variantKey}`;
  return resolveWaterShaderModule(shaderName, () => createOceanShaderModule(contract));
}

export function setOceanReflectionBinding(
  state: OceanMaterialState,
  binding?: Readonly<WaterReflectionBinding>
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  return applyWaterSurfaceReflectionBinding(state.material.shaderData, state.opticsBindingState, "high", binding);
}

export function setOceanSurfaceTime(state: OceanMaterialState, elapsedTime?: number): void {
  state.material.shaderData.setFloat("material_SurfaceTimeOverride", elapsedTime ?? -1);
}

export function setOceanBandlimitViewportHeight(state: OceanMaterialState, viewportHeight: number): void {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError("Ocean bandlimit viewport height must be finite and positive.");
  }
  if (state.bandlimitViewportHeight === viewportHeight) return;
  state.bandlimitViewportHeight = viewportHeight;
  state.material.shaderData.setFloat("material_OceanBandlimitViewportHeight", viewportHeight);
}

export function setOceanCameraFeaturesAvailable(state: OceanMaterialState, available: boolean): void {
  state.cameraFeaturesAvailable = available;
  state.material.shaderData.setFloat("material_CameraFeaturesAvailable", available ? 1 : 0);
}

export function setOceanDebugView(state: OceanMaterialState, debugView: OceanDebugView): void {
  assertOceanDebugView(debugView);
  state.debugView = debugView;
  state.material.shaderData.setFloat("material_DebugView", debugView);
}

export function setOceanLodDebug(state: OceanMaterialState, enabled: boolean): void {
  state.lodDebug = enabled;
  state.material.shaderData.setFloat("material_LodDebug", enabled ? 1 : 0);
}
