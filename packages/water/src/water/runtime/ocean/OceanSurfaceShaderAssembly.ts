/** Maps ocean geometry/sampling facts into the same shader assembly used by inland water. */
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import {
  createWaterShaderSymbol as symbol,
  createWaterSurfaceGeometryAdapter
} from "../surface/WaterSurfaceGeometryAdapter";
import { assembleWaterSurfaceShader } from "../surface/WaterSurfaceShaderAssembler";
import { createResolvedWaterSurfaceFieldsV2 } from "../surface/WaterSurfaceResolvedFields";
import {
  createWaterSurfaceAppearanceV2BoundaryStatements,
  createWaterSurfaceAppearanceV2DepthResponseStatements,
  createWaterSurfaceAppearanceV2ShaderFunctions,
  createWaterSurfaceAppearanceV2UniformDeclarations
} from "../surface/WaterSurfaceAppearanceV2Shader";
import { assertSupportedOceanRenderContract } from "./OceanRenderContract";

export const OCEAN_NEAR_SURFACE_GEOMETRY_ADAPTER = createWaterSurfaceGeometryAdapter({
  id: "ocean-gerstner-nearshore-v1",
  inputs: {
    positionWS: symbol("vec3", "input.worldPosition"),
    macroNormalWS: symbol("vec3", "input.macroNormalWS"),
    tangentWS: symbol("vec3", "input.tangentWS"),
    bitangentWS: symbol("vec3", "normalize(cross(input.macroNormalWS, input.tangentWS))"),
    meshUv: symbol("vec2", "nearshoreUv"),
    flowWS: symbol("vec2", "vec2(0.0)"),
    coverage: symbol("float", "coverage"),
    verticalDepth: symbol("float", "verticalDepth"),
    horizontalShoreDistance: symbol("float", "shoreDistance"),
    obstacleContact: symbol("float", "0.0"),
    waveCrest: symbol("float", "max(input.waveOffsetY, 0.0)")
  },
  requiredBindings: ["material_NearshoreTexture"]
});
export const OCEAN_FAR_SURFACE_GEOMETRY_ADAPTER = createWaterSurfaceGeometryAdapter({
  id: "ocean-projected-horizon-v1",
  inputs: {
    ...OCEAN_NEAR_SURFACE_GEOMETRY_ADAPTER.inputs,
    positionWS: symbol("vec3", "worldPosition"),
    macroNormalWS: symbol("vec3", "vec3(0.0, 1.0, 0.0)"),
    tangentWS: symbol("vec3", "vec3(1.0, 0.0, 0.0)"),
    bitangentWS: symbol("vec3", "vec3(0.0, 0.0, 1.0)"),
    meshUv: symbol("vec2", "worldPosition.xz"),
    coverage: symbol("float", "1.0"),
    verticalDepth: symbol("float", "material_MaximumSurfaceOpticalDistance"),
    horizontalShoreDistance: symbol("float", "material_NearshoreDecode.y"),
    waveCrest: symbol("float", "0.0")
  },
  requiredBindings: ["material_NearshoreTexture"]
});
export const OCEAN_SHARED_CLOSURE_POLICY = Object.freeze({
  additionalTransmissionRadiance: true,
  integratedRoughTransmission: true
});
export function createOceanSurfaceShaderAssembly(
  contract: CompiledWaterRenderContractV1,
  region: "near" | "far" = "near"
) {
  assertSupportedOceanRenderContract(contract);
  const assembly = assembleWaterSurfaceShader(
    contract,
    region === "far" ? OCEAN_FAR_SURFACE_GEOMETRY_ADAPTER : OCEAN_NEAR_SURFACE_GEOMETRY_ADAPTER,
    undefined,
    OCEAN_SHARED_CLOSURE_POLICY
  );
  return {
    ...assembly,
    geometryBridgeSource: assembly.geometryBridgeSource.replaceAll(
      "WATER_SURFACE_GEOMETRY_BRIDGE_INCLUDED",
      region === "far" ? "WATER_OCEAN_FAR_GEOMETRY_BRIDGE_INCLUDED" : "WATER_OCEAN_GEOMETRY_BRIDGE_INCLUDED"
    )
  };
}
export function createOceanAppearanceShaderSource(contract: CompiledWaterRenderContractV1): string {
  const appearance = contract.surfaceClosure.appearance;
  return (
    createWaterSurfaceAppearanceV2UniformDeclarations(appearance) +
    "\n" +
    createWaterSurfaceAppearanceV2ShaderFunctions(appearance)
  );
}
export function createOceanBoundaryShaderSource(contract: CompiledWaterRenderContractV1): string {
  return createWaterSurfaceAppearanceV2BoundaryStatements(
    contract.surfaceClosure.appearance,
    createOceanResolvedSurfaceFields()
  );
}
function createOceanResolvedSurfaceFields() {
  return createResolvedWaterSurfaceFieldsV2({
    coverage: "waterSurface_coverage",
    surfaceHeight: "waterSurface_positionWS.y",
    verticalDepth: "waterSurface_verticalDepth",
    sceneEyeDepth: "viewDepth",
    sceneRayDepth: "sceneRayDepth",
    surfaceNormalDepth: "surfaceNormalDepth",
    horizontalShoreDistance: "waterSurface_horizontalShoreDistance",
    opticalPath: "viewDepth",
    obstacleContact: "waterSurface_obstacleContact",
    flow: "waterSurface_flowWS",
    sceneColor: "refractedSceneColor"
  });
}
export function createOceanDepthResponseShaderSource(contract: CompiledWaterRenderContractV1): string {
  return createWaterSurfaceAppearanceV2DepthResponseStatements(
    contract.surfaceClosure.appearance,
    createOceanResolvedSurfaceFields()
  );
}
