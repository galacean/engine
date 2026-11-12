import { WeatherPresets } from "@galacean/engine";
import { PROCEDURAL_SKY_SOLAR_POSITION } from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { templateLinearColor } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";

const sandDark = templateLinearColor("#ad7f62");
const sandLight = templateLinearColor("#ca9472");

/** Winter-solstice sun path for the desert template. Rotate north so the main dunes are lit from the side. */
export const DESERT_SOLAR_POSITION = {
  ...PROCEDURAL_SKY_SOLAR_POSITION,
  latitude: 32,
  dayOfYear: 355,
  northOffset: 88
} as const;

/** Applies the accepted sand colors and distance tuning to a published desert template. */
export function applyDesertTerrain(world: SeedWorldTerrainRuntime): void {
  const tuning = world.getSurfaceColorTuning();
  world.setSurfaceColorTuning({
    ...tuning,
    roadColor: sandLight,
    groundColor: sandLight,
    grass: {
      ...tuning.grass,
      roadColorA: sandDark,
      roadColorB: sandLight,
      roadColorStrength: 1,
      vistaRepeatSizeMetres: 480,
      vistaContrast: 1.65
    }
  });
  const normals = world.getSandNormalTuning();
  if (normals) world.setSandNormalTuning({ ...normals, rippleFadeDistanceMetres: 165 });
}

/** Extends the far shadow cascade while keeping the near cascade's range. */
export function applyDesertShadows(lighting: TerrainLightingRuntime): void {
  const current = lighting.getShadowCascadeTuning();
  const nearDistance = current.distance / (1 + current.distribution);
  const distance = 480;
  lighting.setShadowCascadeTuning({ distance, distribution: distance / nearDistance - 1 });
}

/** Sets the noon sky material gradient to a muted blue with a warmer horizon. */
export function applyDesertSky(lighting: TerrainLightingRuntime): void {
  lighting.applyVisualTuning({
    customSkyZenithR: 1.16,
    customSkyZenithG: 1.46,
    customSkyZenithB: 1.23,
    customSkyHorizonR: 1.39,
    customSkyHorizonG: 1.52,
    customSkyHorizonB: 1.04
  }, 12);
  lighting.requestEnvironmentBake();
}

/** Starts the desert template with a clear sky. */
export function clearDesertClouds(environment: WorldEnvironmentRuntime): void {
  const { transitionDuration } = environment.getSnapshot();
  environment.setTransitionDuration(0);
  try {
    environment.setCloud(WeatherPresets.cloud.clear);
  } finally {
    environment.setTransitionDuration(transitionDuration);
  }
}
