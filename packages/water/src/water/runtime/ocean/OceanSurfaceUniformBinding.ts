import {
  OceanNearshoreOutsidePolicy,
  type OceanNearshoreOutsidePolicies
} from "../../authoring/ocean/OceanNearshoreTypes";
import { Vector2, Vector4 } from "@galacean/engine-math";
import { WaterBoundaryResponseV2 } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { getWaterSurfaceAppearanceV2BoundaryProperty } from "../surface/WaterSurfaceAppearanceV2Shader";
import type { Material, ShaderData, Texture2D } from "@galacean/engine-core";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import {
  applyWaterSurfaceDepthResponseV2Uniforms,
  applyWaterSurfaceLightingV2Uniforms
} from "../surface/WaterSurfaceAppearanceV2UniformBinding";
import { assertSupportedOceanRenderContract } from "./OceanRenderContract";

export function bindOceanRenderContractUniforms(material: Material, contract: CompiledWaterRenderContractV1): void {
  assertSupportedOceanRenderContract(contract);
  const shaderData = material.shaderData;
  const appearance = contract.surfaceClosure.appearance;
  applyWaterSurfaceDepthResponseV2Uniforms(shaderData, appearance.depthResponse);
  applyWaterSurfaceLightingV2Uniforms(shaderData, appearance);
  shaderData.setFloat("material_AppearanceV2BoundaryMaterialEnabled", 1);
  appearance.boundaryEffects.forEach((effect, index) => {
    const property = (name: Parameters<typeof getWaterSurfaceAppearanceV2BoundaryProperty>[1]) =>
      getWaterSurfaceAppearanceV2BoundaryProperty(index, name);
    shaderData.setFloat(property("range"), effect.rangeMeters);
    if (effect.response === WaterBoundaryResponseV2.Power)
      shaderData.setFloat(property("exponent"), effect.exponent ?? 1);
    if (effect.outputs.color) shaderData.setVector4(property("color"), new Vector4(...effect.outputs.color, 1));
    if (effect.outputs.alpha !== undefined) shaderData.setFloat(property("alpha"), effect.outputs.alpha);
    if (effect.outputs.roughness !== undefined) shaderData.setFloat(property("roughness"), effect.outputs.roughness);
    if (effect.outputs.refractionSuppression !== undefined)
      shaderData.setFloat(property("refractionSuppression"), effect.outputs.refractionSuppression);
  });
  shaderData.setFloat("material_OceanFoamEnabled", contract.look.foam.enabled ? 1 : 0);
  shaderData.setFloat("material_OceanFoamIntensity", contract.look.foam.intensity);
  shaderData.setFloat("material_AppearanceV2RefractionUvScale", appearance.refraction.uvScale);
  shaderData.setFloat("material_RefractionEnabled", appearance.refraction.enabled ? 1 : 0);
  const foamRgb = Number.parseInt(contract.look.foam.color.replace("#", ""), 16);
  shaderData.setVector4(
    "material_OceanSurfaceFoamColor",
    new Vector4(((foamRgb >> 16) & 255) / 255, ((foamRgb >> 8) & 255) / 255, (foamRgb & 255) / 255, 1)
  );
}

export interface OceanNearshoreBinding {
  readonly texture: Texture2D;
  readonly worldToUv: readonly [number, number, number, number];
  readonly maximumDepth: number;
  readonly shoreDistanceRange: number;
  readonly wetShoreDistanceCode: number;
  readonly cellSizeXZ: readonly [number, number];
  readonly outsidePolicy: Readonly<OceanNearshoreOutsidePolicies>;
}

/** Bind the same atlas transform, decoding and outside coverage on both Ocean passes. */
export function bindOceanNearshoreUniforms(shaderData: ShaderData, nearshore: Readonly<OceanNearshoreBinding>): void {
  shaderData.setTexture("material_NearshoreTexture", nearshore.texture);
  shaderData.setVector4("material_NearshoreWorldToUv", new Vector4(...nearshore.worldToUv));
  shaderData.setVector4(
    "material_NearshoreDecode",
    new Vector4(nearshore.maximumDepth, nearshore.shoreDistanceRange, nearshore.wetShoreDistanceCode / 255, 0)
  );
  const outsidePolicy = nearshore.outsidePolicy;
  shaderData.setVector4(
    "material_NearshoreOutsidePolicy",
    new Vector4(
      outsidePolicy.negativeX === OceanNearshoreOutsidePolicy.DeepOcean ? 1 : 0,
      outsidePolicy.positiveX === OceanNearshoreOutsidePolicy.DeepOcean ? 1 : 0,
      outsidePolicy.negativeZ === OceanNearshoreOutsidePolicy.DeepOcean ? 1 : 0,
      outsidePolicy.positiveZ === OceanNearshoreOutsidePolicy.DeepOcean ? 1 : 0
    )
  );
  shaderData.setVector2("material_NearshoreCellSize", new Vector2(...nearshore.cellSizeXZ));
}
