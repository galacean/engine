import { AssetType, type Engine, type Texture2D } from "@galacean/engine";
import {
  WaterBodyResourceSchemaVersion,
  type WaterResourceAssetDescriptorV1,
  type WaterSurfaceAppearanceAssetV2
} from "@galacean/engine-water/water/index";
import {
  WaterSurfaceDetailBlend,
  WaterSurfaceDetailSource,
  WaterSurfaceDetailSpace,
  WaterSurfaceDirectionalHighlightModelV2,
  WaterSurfaceNormalConvention,
  WaterSurfaceNormalStrengthModeV2
} from "@galacean/engine-water/water/authoring/surface/WaterSurfaceAppearanceTypes";
import type { WaterRuntimeResourceFactory } from "@galacean/engine-water/water/runtime/resources/WaterRuntimeResourceRegistry";

export const OIL_PAINT_WATER_SWIRL_NORMAL_ASSET_ID = "oil-paint-water-swirl-normal-512";
export const OIL_PAINT_WATER_SWIRL_NORMAL_HASH = "d072ab7dc87fc6a986a0fee28e44efe0c31f0734c782a1ebd1e9352a32d9a8e5";

export const OIL_PAINT_WATER_SWIRL_COLOR_ASSET_ID = "oil-paint-water-swirl-color-512";
export const OIL_PAINT_WATER_SWIRL_COLOR_HASH = "1d82cae451512b0974a94a2646eb37b9d7d8abc7bc38151c16a306dc30cfeca0";

const OIL_PAINT_WATER_SWIRL_NORMAL_URL = new URL("./assets/oil-paint-water-swirl-normal-512.ktx2", import.meta.url)
  .href;

const OIL_PAINT_WATER_SWIRL_COLOR_URL = new URL("./assets/oil-paint-water-swirl-color-512.ktx2", import.meta.url).href;

export const OIL_PAINT_WATER_SWIRL_NORMAL_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: OIL_PAINT_WATER_SWIRL_NORMAL_ASSET_ID,
  kind: "texture",
  contentHash: OIL_PAINT_WATER_SWIRL_NORMAL_HASH,
  ownership: "shared",
  fallbackPolicy: "required"
});

export const OIL_PAINT_WATER_SWIRL_COLOR_RESOURCE: WaterResourceAssetDescriptorV1 = Object.freeze({
  schemaVersion: WaterBodyResourceSchemaVersion.V1,
  id: OIL_PAINT_WATER_SWIRL_COLOR_ASSET_ID,
  kind: "texture",
  contentHash: OIL_PAINT_WATER_SWIRL_COLOR_HASH,
  ownership: "shared",
  fallbackPolicy: "required"
});

function createKtx2WaterTextureFactory(
  engine: Engine,
  descriptor: WaterResourceAssetDescriptorV1,
  url: string
): WaterRuntimeResourceFactory {
  return {
    descriptor,
    load: async ({ signal }) => {
      signal?.throwIfAborted();
      const texture = await engine.resourceManager.load<Texture2D>({ type: AssetType.KTX2, url });
      if (signal?.aborted) {
        texture.destroy();
        signal.throwIfAborted();
      }
      texture._addReferCount(1);
      return { texture };
    },
    destroy: (resource) => {
      const texture = (resource as { texture: Texture2D }).texture;
      texture._addReferCount(-1);
      texture.destroy();
    }
  };
}

/** Pre-baked 512x512 UASTC+Zstd KTX2 factories for oil-paint swirling lake water (lazy-loaded only by oil-paint template). */
export function createOilPaintWaterResourceFactories(engine: Engine): readonly WaterRuntimeResourceFactory[] {
  return [
    createKtx2WaterTextureFactory(engine, OIL_PAINT_WATER_SWIRL_NORMAL_RESOURCE, OIL_PAINT_WATER_SWIRL_NORMAL_URL),
    createKtx2WaterTextureFactory(engine, OIL_PAINT_WATER_SWIRL_COLOR_RESOURCE, OIL_PAINT_WATER_SWIRL_COLOR_URL)
  ];
}

/** Builds a native `WaterSurfaceAppearanceAssetV2` driving Van Gogh swirling brushwork with zero Water Shader edits. */
export function createOilPaintLakeAppearanceAsset(
  baseAppearance: WaterSurfaceAppearanceAssetV2,
  assetId: string,
  depthDistanceM: number
): WaterSurfaceAppearanceAssetV2 {
  const depthResponse =
    baseAppearance.depthResponse && "distanceMeters" in baseAppearance.depthResponse
      ? {
          ...baseAppearance.depthResponse,
          distanceMeters: Math.max(depthDistanceM, 1.15),
          color: [0.045, 0.19, 0.25, 1] as const
        }
      : baseAppearance.depthResponse;

  return {
    ...baseAppearance,
    id: assetId,
    detailNormalStrength: 0.72,
    detailLayers: [
      {
        id: "oil-paint-swirl-primary",
        source: WaterSurfaceDetailSource.NormalTexture,
        textureAssetId: OIL_PAINT_WATER_SWIRL_NORMAL_ASSET_ID,
        textureContentHash: OIL_PAINT_WATER_SWIRL_NORMAL_HASH,
        space: WaterSurfaceDetailSpace.WorldXz,
        scale: [0.095, 0.095] as const,
        velocity: [0.026, -0.017] as const,
        rotationDegrees: 38,
        strength: 0.42,
        normalConvention: WaterSurfaceNormalConvention.OpenGl,
        strengthMode: WaterSurfaceNormalStrengthModeV2.PreserveSourceZ,
        blend: WaterSurfaceDetailBlend.PartialDerivative
      },
      {
        id: "oil-paint-swirl-secondary",
        source: WaterSurfaceDetailSource.NormalTexture,
        textureAssetId: OIL_PAINT_WATER_SWIRL_NORMAL_ASSET_ID,
        textureContentHash: OIL_PAINT_WATER_SWIRL_NORMAL_HASH,
        space: WaterSurfaceDetailSpace.WorldXz,
        scale: [0.058, 0.058] as const,
        velocity: [-0.018, 0.022] as const,
        rotationDegrees: -14,
        strength: 0.34,
        normalConvention: WaterSurfaceNormalConvention.OpenGl,
        strengthMode: WaterSurfaceNormalStrengthModeV2.PreserveSourceZ,
        blend: WaterSurfaceDetailBlend.PartialDerivative
      }
    ],
    caustics: {
      id: "oil-paint-swirl-ribbons",
      textureAssetId: OIL_PAINT_WATER_SWIRL_COLOR_ASSET_ID,
      textureContentHash: OIL_PAINT_WATER_SWIRL_COLOR_HASH,
      scale: [0.068, 0.068] as const,
      velocity: [0.016, 0.011] as const,
      intensity: 0.56,
      distortion: 0.15,
      parallaxOffset: 0.035,
      parallaxBias: 1.0,
      fadeCoefficientPerMeter: 0.0,
      opacityContribution: 0.38
    },
    directionalHighlight: {
      model: WaterSurfaceDirectionalHighlightModelV2.BlinnPhongPerturbed,
      strength: 0.28,
      exponent: 36,
      distortion: 0.78,
      sharp: false
    },
    depthResponse,
    refraction: {
      ...baseAppearance.refraction,
      uvScale: 0.17
    }
  };
}
