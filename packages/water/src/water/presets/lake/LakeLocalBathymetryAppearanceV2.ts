import {
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCompositionV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfacePrimaryColorClosure,
  type WaterSurfaceAppearanceAssetV2,
  type WaterSurfaceFoamOctaves
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import {
  WaterFieldConsumerActivation,
  WaterFieldFallback,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldSemantic,
  WaterFieldUnit,
  WaterSurfaceFieldSchemaVersion,
  type WaterSurfaceFieldDependencyAssetV2,
  type WaterSurfaceFieldDependencyV2
} from "../../authoring/surface/WaterSurfaceFieldTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { LAKE_SURFACE_APPEARANCE_V2_ASSET } from "./LakeSurfaceAppearanceV2";

export const LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET_ID = "grasslands-stylized-local-low-surface-v2";
export const LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET_ID = "grasslands-stylized-local-medium-surface-v2";

function truncatePatternOctaves(
  octaves: Readonly<WaterSurfaceFoamOctaves>,
  maximumCount: 1 | 2
): Readonly<WaterSurfaceFoamOctaves> {
  return maximumCount === 1
    ? Object.freeze({ count: 1 as const, weights: Object.freeze([octaves.weights[0] ?? 0] as const) })
    : Object.freeze({
        count: 2 as const,
        weights: Object.freeze([octaves.weights[0] ?? 0, octaves.weights[1] ?? 0] as const)
      });
}

function createLocalAppearance(
  id: string,
  tier: WaterQualityTier,
  refractionEnabled: boolean
): Readonly<WaterSurfaceAppearanceAssetV2> {
  const source = LAKE_SURFACE_APPEARANCE_V2_ASSET;
  if (source.depthResponse.model !== WaterSurfaceDepthResponseModelV2.PowerRamp) {
    throw new Error("Grasslands local V2 Looks require the shared calibrated PowerRamp depth response.");
  }
  const maximumPatternOctaves = tier === WaterQualityTier.Low ? 1 : 2;
  const maximumDetailLayers = tier === WaterQualityTier.Low ? 1 : 2;
  return Object.freeze({
    schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
    id,
    primaryColorClosure: WaterSurfacePrimaryColorClosure.StylizedDepthRamp,
    detailLayers: Object.freeze(source.detailLayers.slice(0, maximumDetailLayers)),
    depthResponse: Object.freeze({
      ...source.depthResponse,
      field: WaterFieldSemantic.VerticalDepth
    }),
    boundaryEffects: Object.freeze(
      source.boundaryEffects.map((effect) => {
        const localEffect = {
          ...effect,
          field: WaterFieldSemantic.VerticalDepth
        };
        return Object.freeze(
          effect.pattern
            ? {
                ...localEffect,
                pattern: Object.freeze({
                  ...effect.pattern,
                  octaves: truncatePatternOctaves(effect.pattern.octaves, maximumPatternOctaves)
                })
              }
            : localEffect
        );
      })
    ),
    refraction: Object.freeze({
      ...source.refraction,
      enabled: refractionEnabled,
      validation: WaterRefractionValidationModeV2.LocalOnlySafe
    }),
    composition: WaterSurfaceCompositionV2.AlphaBlend
  });
}

export const LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET = createLocalAppearance(
  LAKE_LOCAL_LOW_SURFACE_APPEARANCE_V2_ASSET_ID,
  WaterQualityTier.Low,
  false
);

export const LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET = createLocalAppearance(
  LAKE_LOCAL_MEDIUM_SURFACE_APPEARANCE_V2_ASSET_ID,
  WaterQualityTier.Medium,
  true
);

function createLocalFieldDependencies(id: string, sceneColor: boolean): Readonly<WaterSurfaceFieldDependencyAssetV2> {
  const bindings: WaterSurfaceFieldDependencyV2[] = [
    Object.freeze({
      consumerId: "surface-coverage",
      semantic: WaterFieldSemantic.Coverage,
      providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
      activation: WaterFieldConsumerActivation.Always,
      requirement: WaterFieldRequirement.Required,
      fallback: WaterFieldFallback.FailActivation,
      unit: WaterFieldUnit.Normalized
    }),
    Object.freeze({
      consumerId: "water-column-depth",
      semantic: WaterFieldSemantic.VerticalDepth,
      providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
      activation: WaterFieldConsumerActivation.Always,
      requirement: WaterFieldRequirement.Required,
      fallback: WaterFieldFallback.FailActivation,
      unit: WaterFieldUnit.Meter
    })
  ];
  if (sceneColor) {
    bindings.push(
      Object.freeze({
        consumerId: "shore-safety",
        semantic: WaterFieldSemantic.HorizontalShoreDistance,
        providers: Object.freeze([WaterFieldProviderKind.CompiledSpatialField]),
        activation: WaterFieldConsumerActivation.RefractionEnabled,
        requirement: WaterFieldRequirement.Required,
        fallback: WaterFieldFallback.FailActivation,
        unit: WaterFieldUnit.Meter
      }),
      Object.freeze({
        consumerId: "scene-composition-color",
        semantic: WaterFieldSemantic.SceneColor,
        providers: Object.freeze([WaterFieldProviderKind.CameraOpaqueColor]),
        activation: WaterFieldConsumerActivation.RefractionEnabled,
        requirement: WaterFieldRequirement.Required,
        fallback: WaterFieldFallback.FailActivation,
        unit: WaterFieldUnit.LinearRgb
      })
    );
  }
  return Object.freeze({
    schemaVersion: WaterSurfaceFieldSchemaVersion.V2,
    id,
    bindings: Object.freeze(bindings)
  });
}

export const LAKE_LOCAL_LOW_SURFACE_FIELDS_V2 = createLocalFieldDependencies(
  "grasslands-local-low-surface-fields-v2",
  false
);

export const LAKE_LOCAL_MEDIUM_SURFACE_FIELDS_V2 = createLocalFieldDependencies(
  "grasslands-local-medium-surface-fields-v2",
  true
);
