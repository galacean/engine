import mojaveAssets from "./MojaveAssets.json";
import { WeatherPresets } from "@galacean/engine";
import { PROCEDURAL_SKY_SOLAR_POSITION } from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { templateLinearColor } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";

const sandDark = templateLinearColor("#ad7f62");
const sandLight = templateLinearColor("#ca9472");
const oasisSandDark = templateLinearColor("#ac8061");
const oasisSandLight = templateLinearColor("#cfa77f");

/** Summer sun path for the desert template. Rotate north so the main dunes are lit from the side. */
export const DESERT_SOLAR_POSITION = {
  ...PROCEDURAL_SKY_SOLAR_POSITION,
  latitude: 32,
  dayOfYear: 172,
  northOffset: 64
} as const;

/** Applies the accepted sand colors and distance tuning to a published desert template. */
export function applyDesertTerrain(world: SeedWorldTerrainRuntime, oasis = false): void {
  const tuning = world.getSurfaceColorTuning();
  const lightSand = oasis ? oasisSandLight : sandLight;
  world.setSurfaceColorTuning({
    ...tuning,
    roadColor: lightSand,
    groundColor: lightSand,
    grass: {
      ...tuning.grass,
      roadColorA: oasis ? oasisSandDark : sandDark,
      roadColorB: lightSand,
      roadColorStrength: 1,
      vistaRepeatSizeMetres: 480,
      vistaContrast: oasis ? 1.27 : 1.65
    }
  });
  const normals = world.getSandNormalTuning();
  if (normals) world.setSandNormalTuning({ ...normals, rippleFadeDistanceMetres: oasis ? 92 : 165 });
}

/** Applies desert fog settings while inheriting the shared global shadow cascade configuration. */
export function applyDesertShadows(lighting: TerrainLightingRuntime): void {
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
export function configureDesertClouds(environment: WorldEnvironmentRuntime, oasisCoverage?: number): void {
  const { transitionDuration } = environment.getSnapshot();
  environment.setTransitionDuration(0);
  try {
    environment.setCloud(oasisCoverage !== undefined
      ? { ...WeatherPresets.cloud.scattered, cloudCoverage: oasisCoverage, cloudDensityMultiplier: 0.95 }
      : { ...WeatherPresets.cloud.scattered, cloudCoverage: 0.19, cloudDensityMultiplier: 0.12 });
    environment.setCloudScaleSettings(oasisCoverage !== undefined
      ? { baseAltitude: 670, thickness: 310 }
      : { baseAltitude: 950, thickness: 170 });
    if (oasisCoverage !== undefined) {
      environment.setCloudQuality("high");
      environment.setCloudShapeProfile({ envelopeScale: 0.47, topDensityMultiplier: 0.28, detailNoiseMultiplier: 1.12 });
    }
  } finally {
    environment.setTransitionDuration(transitionDuration);
  }
}

/** Combines the authored ground colour fields with sand normals and the desert's glint strength. */
export function desertSurfaceOptions(
  plan: import("@galacean/engine-world-planning/semantic-study/IslandPlanModel").IslandPlan,
  options: import("@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime").SeedWorldTerrainSurfaceOptions = {},
  _edits: import("@galacean/engine-world-planning/semantic-study/WorldPlanningContract").SemanticRecipe["edits"] = {}
): import("@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime").SeedWorldTerrainSurfaceOptions {
  const isWasteland = plan.parameters.worldTemplate?.id === "titan-wasteland";
  return {
    ...options, palette: undefined, baseTextureUrl: undefined, roadPattern: true,
    sandGlintStrength: options.sandGlintStrength ?? (isWasteland ? 3 : 0),
    sandGlintRoughness: options.sandGlintRoughness ?? (isWasteland ? 0.06 : undefined),
    normalTextureUrl: mojaveAssets.surface.rippleNormal,
    microNormalTextureUrl: mojaveAssets.surface.microNormal
  };
}
