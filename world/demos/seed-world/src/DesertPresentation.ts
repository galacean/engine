import mojaveAssets from "./MojaveAssets.json";
import { WeatherPresets } from "@galacean/engine";
import { PROCEDURAL_SKY_SOLAR_POSITION } from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { templateLinearColor } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";

const sandDark = templateLinearColor("#ad7f62");
const sandLight = templateLinearColor("#ca9472");

/** Summer sun path for the desert template. Rotate north so the main dunes are lit from the side. */
export const DESERT_SOLAR_POSITION = {
  ...PROCEDURAL_SKY_SOLAR_POSITION,
  latitude: 32,
  dayOfYear: 172,
  northOffset: 64
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
  lighting.setShadowCascadeTuning({ distance: 300, distribution: 15, count: 4, splits: [1 / 15, 3 / 15, 7 / 15] });
  lighting.setFogAppearance({ cameraDepth: true });
}

/** Tunes the existing sky scattering for a pale desert sky. */
export function applyDesertSky(lighting: TerrainLightingRuntime): void {
  lighting.applyVisualTuning(
    {
      customSkyTintStrength: 0,
      skyTintR: 0.5,
      skyTintG: 0.5,
      skyTintB: 0.5,
      sunSize: 0,
      sunIntensity: 1.5,
      ambientIntensity: 1.2,
      skyExposure: 0.48
    },
    15
  );
  lighting.requestEnvironmentBake();
}

/** Uses animated scattered volumetric clouds at the reference cloud-layer altitude. */
export function configureDesertClouds(environment: WorldEnvironmentRuntime): void {
  const { transitionDuration } = environment.getSnapshot();
  environment.setTransitionDuration(0);
  try {
    environment.setCloud({ ...WeatherPresets.cloud.scattered, cloudCoverage: 0.19, cloudDensityMultiplier: 0.12 });
    environment.setCloudScaleSettings({ baseAltitude: 950, thickness: 170 });
  } finally {
    environment.setTransitionDuration(transitionDuration);
  }
}

/** Keep the accepted broad color fields and only the 512px sand normal detail. */
export function desertSurfaceOptions(
  _plan: import("@galacean/engine-world-planning/semantic-study/IslandPlanModel").IslandPlan,
  options: import("@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime").SeedWorldTerrainSurfaceOptions = {},
  _edits: import("@galacean/engine-world-planning/semantic-study/WorldPlanningContract").SemanticRecipe["edits"] = {}
): import("@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime").SeedWorldTerrainSurfaceOptions {
  return {
    ...options, palette: undefined, baseTextureUrl: undefined, roadPattern: true,
    normalTextureUrl: mojaveAssets.surface.rippleNormal,
    microNormalTextureUrl: mojaveAssets.surface.microNormal
  };
}
