import type { WaterBodyAssetRegistry } from "../../runtime/body/WaterBodyAssetRegistry";
import { resolveWaterContactEffectsLook } from "../effects/WaterContactEffectsLook";
import { WaterSurfaceDepthResponseModelV2 } from "../surface/WaterSurfaceAppearanceTypes";
import { RIVER_HIGH_LOOK_ID, registerRiverHighLook } from "./RiverHighLook";

/** Shared appearance used by the standalone River, Planner and its lightweight preview. */
export const RIVER_VALLEY_LOOK_ID = "stylized-river-valley-high-v1";

export const RIVER_VALLEY_CONTACT_EFFECTS_LOOK = resolveWaterContactEffectsLook({
  splash: {
    enabled: true,
    textureId: "WaterSplash_6x6.png",
    atlasColumns: 6,
    atlasRows: 6,
    color: [0.84, 0.95, 1],
    opacity: 0.65,
    size: 1.3,
    lifetime: 1.1,
    density: 0.5,
    rise: 2.1,
    spread: 1.2
  },
  mist: {
    enabled: true,
    textureId: "WaterMist_5x5.png",
    atlasColumns: 5,
    atlasRows: 5,
    color: [0.8, 0.92, 0.95],
    opacity: 0.11,
    size: 3.2,
    lifetime: 3.5,
    density: 0.35,
    rise: 0.25,
    spread: 2.2
  },
  whitewater: {
    enabled: true,
    textureId: "WaterfallSplash_5x5.png",
    atlasColumns: 5,
    atlasRows: 5,
    color: [0.85, 0.97, 1],
    opacity: 0.48,
    size: 3.5,
    lifetime: 2.2,
    density: 0.3,
    rise: 0,
    spread: 2.3
  }
});

/** Geometry, emitter placement and scene lighting remain owned by each host. */
export function registerRiverValleyLook(registry: WaterBodyAssetRegistry): void {
  if (registry.getLookAuthoringSnapshot(RIVER_VALLEY_LOOK_ID)) return;
  if (!registry.getLookAuthoringSnapshot(RIVER_HIGH_LOOK_ID)) registerRiverHighLook(registry);
  const base = registry.getLookAuthoringSnapshot(RIVER_HIGH_LOOK_ID)!;
  const depthResponse = base.appearance.appearance.depthResponse;
  if (depthResponse.model !== WaterSurfaceDepthResponseModelV2.BeerLambert || !depthResponse.scatteringTint)
    throw new Error("River Valley requires River High optics and a scattering palette.");
  const appearanceId = `${RIVER_VALLEY_LOOK_ID}-appearance`;
  const opticsId = `${RIVER_VALLEY_LOOK_ID}-optics`;
  const reflectionId = `${RIVER_VALLEY_LOOK_ID}-reflection`;
  registry.registerReflectionPolicyPreset({ ...base.reflectionPolicy, id: reflectionId });
  registry.registerAppearancePreset({
    ...base.appearance,
    id: appearanceId,
    appearance: {
      ...base.appearance.appearance,
      id: appearanceId,
      flowNormalStrength: 0.467,
      depthResponse: {
        ...depthResponse,
        scatteringTint: {
          ...depthResponse.scatteringTint,
          shallowColor: [0.06, 0.95, 0.87, 1],
          deepColor: [0.02, 0.27, 0.37, 1]
        }
      }
    }
  });
  registry.registerOpticsPreset({
    ...base.optics,
    id: opticsId,
    profile: {
      ...base.optics.profile,
      absorptionCoefficient: [0.65, 0.025, 0.015],
      surfaceScattering: { coefficientPerMeter: [0.02, 0.12, 0.16], phaseG: 0 },
      roughness: 0.28,
      refractionStrength: 0.3
    }
  });
  registry.registerLookPreset({
    ...base.look,
    id: RIVER_VALLEY_LOOK_ID,
    appearanceAssetId: appearanceId,
    opticalProfileId: opticsId,
    reflectionPolicyId: reflectionId,
    foam: { ...base.look.foam, intensity: 0.7 },
    contactEffects: RIVER_VALLEY_CONTACT_EFFECTS_LOOK
  });
}
