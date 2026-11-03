import { registerWaterSurfacePicking } from "../surface/WaterSurfacePicking";
import { WATER_CONNECTION_SHADER } from "../connections/WaterConnectionBinding";
/** Lightweight graded far-field material whose outer loop is projected to the mathematical horizon. */
import { OceanDebugView, assertOceanDebugView } from "./OceanDebugView";
import { createWaterSurfaceV2ResolvedOutputStatement } from "../surface/WaterSurfaceClosureShader";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import { createOceanTuningFromRenderContract, getCanonicalOceanRenderContract } from "./OceanRenderContract";
import { createOceanSurfaceShaderAssembly, createOceanAppearanceShaderSource } from "./OceanSurfaceShaderAssembly";
import {
  bindOceanRenderContractUniforms,
  bindOceanNearshoreUniforms,
  type OceanNearshoreBinding
} from "./OceanSurfaceUniformBinding";
import oceanSurfaceUniforms from "../../shaders/ocean/SurfaceUniforms.glsl?raw";
import {
  WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS,
  WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
} from "../optics/WaterEnvironmentReflectionShader";
import { applyWaterSurfaceOpticsBinding } from "../optics/WaterSurfaceOpticsBinding";
import oceanFarForwardPassTemplate from "../../shaders/ocean/FarForwardPass.glsl?raw";
import oceanFarShaderTemplate from "../../shaders/OceanFar.shader?raw";
import { renderWaterShaderTemplate } from "../material/WaterShaderTemplate";
import {
  registerGeneratedWaterShaderInclude,
  registerGeneratedWaterShaderModule,
  withScopedWaterShaderAssemblyRegistry
} from "../material/WaterShaderLibrary";
import { type Engine, Material, type Shader } from "@galacean/engine-core";
import { createWaterMaterialVariant } from "../material/WaterMaterialVariant";
import {
  createWaterShaderModule,
  resolveWaterShaderModule,
  type WaterShaderModule
} from "../material/WaterShaderModule";
import { Vector4 } from "@galacean/engine-math";
import { OCEAN_RENDER_BUDGET } from "../../authoring/ocean/presets/OceanLook";
import {
  applyWaterSurfaceReflectionBinding,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import type {
  WaterSurfaceOpticsBindingState,
  WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";
import {
  WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS,
  WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
} from "../surface/WaterSurfaceAmbientLightingShader";
import { createWaterSpatialFieldShaderDecodeFunctions } from "../spatial/WaterSpatialFieldShaderDecode";
import { bindOceanFarFieldTuning, OCEAN_FAR_FIELD_SHADER_FUNCTIONS } from "./OceanFarFieldShader";
import { createOceanRuntimeTuning, type OceanRuntimeTuning } from "./OceanRuntimeTuning";
import {
  createOceanSceneFogApplication,
  createOceanSceneFogDeclarations,
  OCEAN_SCENE_FOG_ENABLED_PROPERTY
} from "./OceanSceneFogShader";

export const OCEAN_FAR_SHADER_NAME = "AIWorld/OceanFar";
export const OCEAN_FAR_SHADER_REQUIRED_BINDINGS = Object.freeze(["material_NearshoreTexture"]);

function glsl(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Ocean far-field GLSL constant '${value}' must be finite.`);
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

export interface OceanFarMaterialConfig {
  readonly renderContract?: CompiledWaterRenderContractV1;
  readonly waterLevel: number;
  readonly viewportHeight: number;
  readonly nearshore: Readonly<OceanNearshoreBinding>;
  readonly reflection?: Readonly<WaterReflectionBinding>;
  readonly tuning?: Readonly<OceanRuntimeTuning>;
  readonly lodDebug?: boolean;
  readonly debugView?: OceanDebugView;
  readonly sceneFogEnabled: boolean;
}

export interface OceanFarMaterialState {
  readonly renderContract: CompiledWaterRenderContractV1;
  readonly material: Material;
  readonly opticsBindingState: WaterSurfaceOpticsBindingState;
  readonly projectionParameters: Vector4;
  tuning: Readonly<OceanRuntimeTuning>;
  viewportHeight: number;
  lodDebug: boolean;
}

/** Source remains inspectable so tests can lock the far-field sampler and screen-texture budgets. */
export function createOceanFarShaderSource(
  contract: CompiledWaterRenderContractV1 = getCanonicalOceanRenderContract()
): string {
  const assembly = createOceanSurfaceShaderAssembly(contract, "far");
  const shaderTemplateReplacements: Readonly<Record<string, string | number>> = {
    VALUE_001_SHADER_NAME:
      contract.variantKey === getCanonicalOceanRenderContract().variantKey
        ? OCEAN_FAR_SHADER_NAME
        : `${OCEAN_FAR_SHADER_NAME}/${contract.variantKey}`,
    SHARED_RESOLVED_OUTPUT: createWaterSurfaceV2ResolvedOutputStatement("resolvedWaterClosure"),
    SHARED_SURFACE_UNIFORMS: registerGeneratedWaterShaderModule(
      "OceanFarSurfaceUniforms",
      oceanSurfaceUniforms + "\n" + createOceanAppearanceShaderSource(contract)
    ),
    SHARED_SURFACE_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanFarSurfaceFunctions",
      WATER_CONNECTION_SHADER + assembly.sharedFunctionSource
    ),
    SHARED_ENVIRONMENT_UNIFORMS: registerGeneratedWaterShaderModule(
      "OceanFarEnvironmentUniforms",
      WATER_ENVIRONMENT_REFLECTION_UNIFORM_DECLARATIONS
    ),
    SHARED_ENVIRONMENT_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanFarEnvironmentFunctions",
      WATER_ENVIRONMENT_REFLECTION_SHADER_FUNCTIONS
    ),

    VALUE_003_WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS: registerGeneratedWaterShaderModule(
      "OceanFarAmbientLightingUniforms",
      WATER_SURFACE_AMBIENT_LIGHTING_UNIFORM_DECLARATIONS
    ),
    VALUE_005_CREATEOCEANSCENEFOGDECLARATIONS: registerGeneratedWaterShaderModule(
      "OceanFarSceneFogDeclarations",
      createOceanSceneFogDeclarations()
    ),
    VALUE_006_WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanFarAmbientLighting",
      WATER_SURFACE_AMBIENT_LIGHTING_SHADER_FUNCTIONS
    ),
    VALUE_007_CREATEWATERSPATIALFIELDSHADERDECODEFUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanFarSpatialDecode",
      createWaterSpatialFieldShaderDecodeFunctions()
    ),
    VALUE_008_OCEAN_FAR_FIELD_SHADER_FUNCTIONS: registerGeneratedWaterShaderModule(
      "OceanFarField",
      renderWaterShaderTemplate(OCEAN_FAR_FIELD_SHADER_FUNCTIONS, {
        SHARED_FAR_GEOMETRY_BRIDGE: assembly.geometryBridgeSource
      })
    ),
    VALUE_009_GLSL_2_OCEAN_RENDER_BUDGET_FARFIELDMAXIMUMPROJECTIONERRO: glsl(
      2 * OCEAN_RENDER_BUDGET.farFieldMaximumProjectionErrorPixels
    ),
    VALUE_010_GLSL_OCEAN_RENDER_BUDGET_FARFIELDMAXIMUMPROJECTIONDISTAN: glsl(
      OCEAN_RENDER_BUDGET.farFieldMaximumProjectionDistanceMetres
    ),
    VALUE_011_CREATEOCEANSCENEFOGAPPLICATION_FINALCOLOR: registerGeneratedWaterShaderModule(
      "OceanFarFinalFog",
      createOceanSceneFogApplication("finalColor")
    )
  };
  const { VALUE_001_SHADER_NAME, ...forwardReplacements } = shaderTemplateReplacements;
  const modularPassSource = renderWaterShaderTemplate(oceanFarForwardPassTemplate, forwardReplacements);
  const modularPassInclude = registerGeneratedWaterShaderInclude("OceanFarForward", modularPassSource);
  return renderWaterShaderTemplate(oceanFarShaderTemplate, {
    VALUE_001_SHADER_NAME,
    WATER_FORWARD_INCLUDE: modularPassInclude
  });
}

/** Creates the complete graded Ocean far-field module used by runtime JIT and offline AOT compilation. */
export function createOceanFarShaderModule(
  contract: CompiledWaterRenderContractV1 = getCanonicalOceanRenderContract()
): WaterShaderModule {
  return withScopedWaterShaderAssemblyRegistry(() =>
    createWaterShaderModule(
      contract.variantKey === getCanonicalOceanRenderContract().variantKey
        ? OCEAN_FAR_SHADER_NAME
        : `${OCEAN_FAR_SHADER_NAME}/${contract.variantKey}`,
      createOceanFarShaderSource(contract),
      createWaterMaterialVariant("ocean-far", {
        surface: "graded",
        sharedClosure: createOceanSurfaceShaderAssembly(contract, "far").materialVariantKey
      }),
      OCEAN_FAR_SHADER_REQUIRED_BINDINGS
    )
  );
}

/** Resolves the graded Ocean far-field Shader through its exact, transaction-scoped include closure. */
export function resolveOceanFarShader(
  contract: CompiledWaterRenderContractV1 = getCanonicalOceanRenderContract()
): Shader {
  const shaderName =
    contract.variantKey === getCanonicalOceanRenderContract().variantKey
      ? OCEAN_FAR_SHADER_NAME
      : `${OCEAN_FAR_SHADER_NAME}/${contract.variantKey}`;
  return resolveWaterShaderModule(shaderName, () => createOceanFarShaderModule(contract));
}

export function createOceanFarMaterial(
  engine: Engine,
  config: Readonly<OceanFarMaterialConfig>
): OceanFarMaterialState {
  if (!Number.isFinite(config.waterLevel) || !Number.isFinite(config.viewportHeight) || config.viewportHeight <= 0) {
    throw new RangeError("Ocean far-field water level and viewport height must be finite and valid.");
  }
  const contract = config.renderContract ?? getCanonicalOceanRenderContract();
  const tuning = createOceanTuningFromRenderContract(contract, config.tuning);
  const shader = resolveOceanFarShader(contract);
  const material = new Material(engine, shader);
  material.shaderData.setInt("material_DepthWriteEnabled", 0);
  registerWaterSurfacePicking(material, "material_DepthWriteEnabled");
  material.name = "Ocean Far";
  const opticsBindingState = createWaterSurfaceOpticsBindingState();
  const projectionParameters = new Vector4(
    config.viewportHeight,
    OCEAN_RENDER_BUDGET.farFieldMinimumProjectionDistanceMetres,
    0,
    0
  );
  const state: OceanFarMaterialState = {
    renderContract: contract,
    material,
    opticsBindingState,
    projectionParameters,
    tuning,
    viewportHeight: config.viewportHeight,
    lodDebug: config.lodDebug === true
  };
  material.shaderData.setFloat("material_WaterLevel", config.waterLevel);
  material.shaderData.setVector4("material_OceanFarProjection", projectionParameters);
  material.shaderData.setFloat("material_OceanFarLodDebug", state.lodDebug ? 1 : 0);
  material.shaderData.setFloat(OCEAN_SCENE_FOG_ENABLED_PROPERTY, config.sceneFogEnabled ? 1 : 0);
  bindOceanNearshoreUniforms(material.shaderData, config.nearshore);
  bindOceanFarFieldTuning(material.shaderData, tuning);
  applyWaterSurfaceOpticsBinding(material.shaderData, opticsBindingState, {
    tier: "high",
    opticalProfile: contract.optics.profile,
    refractionEnabled: false,
    debugView: 0,
    reflection: config.reflection
  });
  bindOceanRenderContractUniforms(material, contract);
  applyWaterSurfaceReflectionBinding(material.shaderData, opticsBindingState, "high", config.reflection);
  setOceanFarDebugView(state, config.debugView ?? OceanDebugView.Final);
  return state;
}

export function setOceanFarReflectionBinding(
  state: OceanFarMaterialState,
  binding?: Readonly<WaterReflectionBinding>
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  return applyWaterSurfaceReflectionBinding(state.material.shaderData, state.opticsBindingState, "high", binding);
}

export function setOceanFarRuntimeTuning(state: OceanFarMaterialState, tuning: Readonly<OceanRuntimeTuning>): void {
  const validated = createOceanRuntimeTuning(tuning);
  bindOceanFarFieldTuning(state.material.shaderData, validated);
  state.tuning = validated;
}

export function setOceanFarDebugView(state: OceanFarMaterialState, view: OceanDebugView): void {
  assertOceanDebugView(view);
  state.material.shaderData.setFloat("material_DebugView", view);
}

export function setOceanFarViewportHeight(state: OceanFarMaterialState, viewportHeight: number): void {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    throw new RangeError("Ocean far-field viewport height must be finite and positive.");
  }
  if (state.viewportHeight === viewportHeight) return;
  state.viewportHeight = viewportHeight;
  state.projectionParameters.set(viewportHeight, state.projectionParameters.y, 0, 0);
  state.material.shaderData.setVector4("material_OceanFarProjection", state.projectionParameters);
}

export function setOceanFarLodDebug(state: OceanFarMaterialState, enabled: boolean): void {
  state.lodDebug = enabled;
  state.material.shaderData.setFloat("material_OceanFarLodDebug", enabled ? 1 : 0);
}
