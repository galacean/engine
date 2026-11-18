import {
  WaterBoundaryResponseV2,
  WaterPatternBoundaryCombineV2,
  WaterPatternModelV2,
  WaterPatternResponseV2,
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfaceDetailBlend,
  WaterSurfaceDetailSource,
  WaterSurfaceDetailSpace,
  WaterSurfaceNormalConvention,
  WaterSurfaceNormalStrengthModeV2,
  WaterSurfacePrimaryColorClosure,
  type WaterSurfaceAppearanceAssetV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterFieldSemantic } from "../../authoring/surface/WaterSurfaceFieldTypes";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { LAKE_NORMAL_ASSET_ID, LAKE_NORMAL_CONTENT_HASH } from "../../resources/lake/LakeNormalAssetIdentity";
import { LAKE_WATER_COLOR_LINEAR } from "./LakeWaterMaterialProfile";

export const LAKE_SURFACE_APPEARANCE_V2_ASSET_ID = "grasslands-stylized-water-surface-v2";

/**
 * Values define the shared Grasslands and Seed World Lake Look. The asset
 * contains no terrain, scene, engine, or source-editor runtime object.
 */
export const LAKE_SURFACE_APPEARANCE_V2_ASSET: WaterSurfaceAppearanceAssetV2 = Object.freeze({
  schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
  id: LAKE_SURFACE_APPEARANCE_V2_ASSET_ID,
  // The source is a lit transparent material: scene color and depth tint provide
  // base color, while the dielectric BRDF owns environment and sun specular.
  primaryColorClosure: WaterSurfacePrimaryColorClosure.LitSceneColorDepthRamp,
  detailLayers: Object.freeze([
    Object.freeze({
      id: "forward-ripples",
      source: WaterSurfaceDetailSource.NormalTexture,
      textureAssetId: LAKE_NORMAL_ASSET_ID,
      textureContentHash: LAKE_NORMAL_CONTENT_HASH,
      space: WaterSurfaceDetailSpace.WorldXz,
      scale: Object.freeze([0.05, 0.05] as const),
      velocity: Object.freeze([0.02, 0.02] as const),
      rotationDegrees: 0,
      strength: 0.2,
      normalConvention: WaterSurfaceNormalConvention.OpenGl,
      strengthMode: WaterSurfaceNormalStrengthModeV2.PreserveSourceZ,
      blend: WaterSurfaceDetailBlend.PartialDerivative
    }),
    Object.freeze({
      id: "counter-ripples",
      source: WaterSurfaceDetailSource.NormalTexture,
      textureAssetId: LAKE_NORMAL_ASSET_ID,
      textureContentHash: LAKE_NORMAL_CONTENT_HASH,
      space: WaterSurfaceDetailSpace.WorldXz,
      scale: Object.freeze([0.05, 0.05] as const),
      velocity: Object.freeze([0.02, 0.02] as const),
      rotationDegrees: 180,
      strength: 0.2,
      normalConvention: WaterSurfaceNormalConvention.OpenGl,
      strengthMode: WaterSurfaceNormalStrengthModeV2.PreserveSourceZ,
      blend: WaterSurfaceDetailBlend.PartialDerivative
    })
  ]),
  depthResponse: Object.freeze({
    model: WaterSurfaceDepthResponseModelV2.PowerRamp,
    // Color represents the authored water column, so it must stay invariant
    // when the camera moves while the sampled lake depth is unchanged.
    field: WaterFieldSemantic.VerticalDepth,
    // The generated Seed World lakes are roughly 3.3 m at their deepest. A
    // 3.6-metre ramp with a slightly steeper response keeps shallow water
    // clear while bringing the deepest authored columns close to full tint.
    distanceMeters: 3.6,
    exponent: 1.1,
    color: LAKE_WATER_COLOR_LINEAR
  }),
  boundaryEffects: Object.freeze([
    Object.freeze({
      id: "coastal-alpha",
      field: WaterFieldSemantic.SceneEyeDepth,
      response: WaterBoundaryResponseV2.Linear,
      rangeMeters: 1.5,
      invert: false,
      outputs: Object.freeze({ alpha: 1 })
    }),
    Object.freeze({
      id: "contact-foam",
      field: WaterFieldSemantic.ObstacleContact,
      response: WaterBoundaryResponseV2.Linear,
      rangeMeters: 0.1791,
      invert: true,
      pattern: Object.freeze({
        model: WaterPatternModelV2.AnimatedVoronoiF1,
        worldScale: 2.5,
        timeRate: 1,
        opacity: 0.453,
        octaves: Object.freeze({
          count: 3,
          weights: Object.freeze([0.5, 0.25, 0.125] as const)
        }),
        lacunarity: 2,
        response: WaterPatternResponseV2.Power,
        invert: true,
        exponent: -1.5,
        combine: WaterPatternBoundaryCombineV2.SignedBoundaryAddSaturate
      }),
      outputs: Object.freeze({
        color: Object.freeze([1, 1, 1] as const),
        roughness: 1
      })
    })
  ]),
  refraction: Object.freeze({
    enabled: true,
    uvScale: 0.17,
    normalSource: WaterRefractionNormalSourceV2.TangentSpace,
    validation: WaterRefractionValidationModeV2.ShiftedSceneDepth
  }),
  composition: WaterSurfaceCompositionV2.PrecomposedReplace
});

function compileLakeSurfaceAppearanceV2(): CompiledWaterSurfaceAppearanceV2 {
  const result = WaterSurfaceAppearanceCompiler.compile(LAKE_SURFACE_APPEARANCE_V2_ASSET);
  if (!result.valid || !result.data || result.data.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2) {
    const diagnostic = result.diagnostics.map(({ path, message }) => `${path}: ${message}`).join("; ");
    throw new Error(`Grasslands Surface Appearance V2 failed validation: ${diagnostic}`);
  }
  return result.data;
}

export const LAKE_COMPILED_SURFACE_APPEARANCE_V2 = compileLakeSurfaceAppearanceV2();
