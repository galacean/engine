import type { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import { FARMLANDS_WAVE_RESOURCE, FARMLANDS_CAUSTICS_RESOURCE } from "../../resources/river/FarmlandsWaterAssets";
import { WaterFieldSemantic } from "../surface/WaterSurfaceFieldTypes";
import {
  WaterBoundaryResponseV2,
  WaterPatternBoundaryCombineV2,
  WaterPatternModelV2,
  WaterPatternResponseV2,
  WaterRefractionNormalSourceV2,
  WaterRefractionValidationModeV2,
  WaterSurfaceDepthResponseModelV2,
  WaterSurfaceDetailBlend,
  WaterSurfaceDetailSource,
  WaterSurfaceDetailSpace,
  WaterSurfaceNormalConvention,
  WaterSurfaceNormalStrengthModeV2,
  WaterSurfacePrimaryColorClosure
} from "../surface/WaterSurfaceAppearanceTypes";
import { registerStylizedRiverLook, STYLIZED_RIVER_LOOK_ID } from "./StylizedRiverLook";
import { FARMLANDS_DROP_LOOK } from "./FarmlandsDropLook";

const linearColor = (r: number, g: number, b: number): readonly [number, number, number, number] => {
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return [linear(r), linear(g), linear(b), 1];
};

export const FARMLANDS_RIVER_LOOK_ID = "farmlands-scene-demo-river-v1";

/** Scene_Demo's MI_Water_Valley. Geometry, bed material and lighting belong to the host. */
export function registerFarmlandsRiverLook(registry: WaterBodyAssetRegistry): void {
  if (registry.getLookAuthoringSnapshot(FARMLANDS_RIVER_LOOK_ID)) return;
  if (!registry.getLookAuthoringSnapshot(STYLIZED_RIVER_LOOK_ID)) registerStylizedRiverLook(registry);
  const base = registry.getLookAuthoringSnapshot(STYLIZED_RIVER_LOOK_ID)!;
  const appearanceId = `${FARMLANDS_RIVER_LOOK_ID}-appearance`,
    opticsId = `${FARMLANDS_RIVER_LOOK_ID}-optics`;
  registry.registerResource(FARMLANDS_WAVE_RESOURCE);
  registry.registerResource(FARMLANDS_CAUSTICS_RESOURCE);
  registry.registerAppearancePreset({
    ...base.appearance,
    id: appearanceId,
    appearance: {
      ...base.appearance.appearance,
      id: appearanceId,
      primaryColorClosure: WaterSurfacePrimaryColorClosure.RefractedAlbedoDepthRamp,
      flowNormalStrength: 0,
      detailNormalStrength: 0.15,
      detailLayers: [
        {
          id: "large-waves",
          scale: [1 / 50, 1 / 50] as const,
          velocity: [0, 0] as const,
          space: WaterSurfaceDetailSpace.FlowAdvected,
          strength: 1
        },
        {
          id: "broad-waves",
          scale: [1 / 100, 1 / 100] as const,
          velocity: [0.02, 0.02] as const,
          space: WaterSurfaceDetailSpace.WorldXz,
          strength: 0.2
        }
      ].map((layer) => ({
        ...layer,
        source: WaterSurfaceDetailSource.NormalTexture,
        textureAssetId: FARMLANDS_WAVE_RESOURCE.id,
        textureContentHash: FARMLANDS_WAVE_RESOURCE.contentHash,
        rotationDegrees: 0,
        normalConvention: WaterSurfaceNormalConvention.OpenGl,
        strengthMode: WaterSurfaceNormalStrengthModeV2.PreserveSourceZ,
        blend: WaterSurfaceDetailBlend.Whiteout
      })),
      depthResponse: {
        model: WaterSurfaceDepthResponseModelV2.LinearColorOpacity,
        field: WaterFieldSemantic.SceneRayDepth,
        colorCoefficientPerMeter: 0.09,
        opacityCoefficientPerMeter: 0.53,
        maximumOpacity: 0.844,
        shallowColor: linearColor(0.070808016, 0.58089226, 0.9622642),
        deepColor: linearColor(0.09730857, 0.39456126, 0.6528301)
      },
      caustics: {
        id: "shallow-caustics",
        textureAssetId: FARMLANDS_CAUSTICS_RESOURCE.id,
        textureContentHash: FARMLANDS_CAUSTICS_RESOURCE.contentHash,
        scale: [1 / 3.08, 1 / 3.08],
        velocity: [-0.025, 0],
        intensity: 4.1,
        distortion: -0.03,
        parallaxOffset: 0.15,
        parallaxBias: 0.42,
        fadeCoefficientPerMeter: 1.1,
        opacityContribution: 0
      },
      boundaryEffects: [
        {
          id: "water-edge",
          field: WaterFieldSemantic.SceneRayDepth,
          response: WaterBoundaryResponseV2.Linear,
          rangeMeters: 1 / 2.82,
          invert: false,
          outputs: { alpha: 1 }
        },
        {
          id: "contact-foam",
          field: WaterFieldSemantic.SceneRayDepth,
          response: WaterBoundaryResponseV2.Linear,
          rangeMeters: 0.319 * 0.3,
          invert: true,
          pattern: {
            model: WaterPatternModelV2.AnimatedVoronoiF1,
            worldScale: 8.88 * 0.15,
            timeRate: 1,
            opacity: 0.889,
            octaves: { count: 3, weights: [0.5, 0.25, 0.125] },
            lacunarity: 2,
            response: WaterPatternResponseV2.Power,
            invert: true,
            exponent: -1.5,
            combine: WaterPatternBoundaryCombineV2.SignedBoundaryAddSaturate
          },
          outputs: { color: [1, 1, 1], colorMode: "albedo" }
        }
      ],
      refraction: {
        enabled: true,
        uvScale: 0.207,
        normalSource: WaterRefractionNormalSourceV2.FirstDetailLayer,
        validation: WaterRefractionValidationModeV2.ShiftedSceneDepth
      }
    }
  });
  registry.registerOpticsPreset({
    ...base.optics,
    id: opticsId,
    profile: { ...base.optics.profile, roughness: 0.017, refractionStrength: 1, reflectionIntensity: 1 }
  });
  registry.registerLookPreset({
    ...base.look,
    id: FARMLANDS_RIVER_LOOK_ID,
    appearanceAssetId: appearanceId,
    opticalProfileId: opticsId,
    riverDrops: FARMLANDS_DROP_LOOK,
    foam: { ...base.look.foam, enabled: false, intensity: 0 }
  });
}
