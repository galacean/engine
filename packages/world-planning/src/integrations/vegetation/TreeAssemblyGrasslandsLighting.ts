import {
  Camera,
  Color,
  DirectLight,
  Entity,
  FogMode,
  Scene,
  Script,
  ShaderProperty,
  ShadowCascadesMode,
  ShadowResolution,
  ShadowType,
  Vector4
} from "@galacean/engine";
import type { TerrainLightingRuntime } from "../terrain/lighting/TerrainLightingRuntime.ts";
import { createIntegratedWorldLightingRuntime } from "../terrain/lighting/IntegratedWorldPresentation.ts";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { SeedWorldGroundWindTuningRuntime } from "@galacean/engine-vegetation/world/SeedWorldGroundWindTuning";

/** Terrain/Grass and authored flowers consume the scene ground-wind contract,
 * independently of the tree wind. Reuse its production publisher and clock.
 */
class AssetAssemblyGroundWind extends Script {
  runtime!: SeedWorldGroundWindTuningRuntime;

  override onUpdate(deltaTime: number): void {
    this.runtime.update(deltaTime);
  }
}

/** Default paused hour shared by the Asset Assembly scene and its controls. */
export const ASSET_ASSEMBLY_DEFAULT_TIME_HOURS = 11;

const SURFACE_CLIMATE = ShaderProperty.getByName("scene_SurfaceClimate");
const SURFACE_SNOW_COLOR = ShaderProperty.getByName("scene_SurfaceSnowColor");
const SEASON_STATE = ShaderProperty.getByName("scene_SeasonState");
const GRASS_SEASON_COLOR = ShaderProperty.getByName("scene_GrassSeasonColor");
const TREE_LEAF_SEASON_COLOR = ShaderProperty.getByName("scene_TreeLeafSeasonColor");
const TREE_BARK_SEASON_COLOR = ShaderProperty.getByName("scene_TreeBarkSeasonColor");

const DRY_SURFACE_CLIMATE = new Vector4(0, 0, 0, 0);
const NEUTRAL_SNOW_COLOR = new Vector4(0.84, 0.9, 0.96, 1);
const SUMMER_SEASON = new Vector4(0, 1, 0, 0);
const NEUTRAL_GRASS_SEASON_COLOR = new Color(1, 1, 1, 0);
const NEUTRAL_TREE_LEAF_SEASON_COLOR = new Color(1, 1, 1, 0);
const NEUTRAL_TREE_BARK_SEASON_COLOR = new Color(1, 1, 1, 0);

/** Grasslands Scene systems shared by the page controls and visible-sky adapter. */
export interface AssetAssemblyGrasslandsLighting {
  readonly lighting: TerrainLightingRuntime;
  readonly postProcess: TerrainPostProcessRuntime;
  readonly wind: TerrainWindRuntime;
}

/**
 * Initializes neutral scene-level inputs required by shared Terrain surface materials.
 * @param scene Asset preview Scene receiving dry summer material state.
 */
export function initializeAssetAssemblySurfaceMaterialState(scene: Scene): void {
  // Asset Assembly does not create WorldEnvironmentRuntime, so it owns the dry neutral state required by shared materials.
  const shaderData = scene.shaderData;
  shaderData.setVector4(SURFACE_CLIMATE, DRY_SURFACE_CLIMATE);
  shaderData.setVector4(SURFACE_SNOW_COLOR, NEUTRAL_SNOW_COLOR);
  shaderData.setVector4(SEASON_STATE, SUMMER_SEASON);
  shaderData.setColor(GRASS_SEASON_COLOR, NEUTRAL_GRASS_SEASON_COLOR);
  shaderData.setColor(TREE_LEAF_SEASON_COLOR, NEUTRAL_TREE_LEAF_SEASON_COLOR);
  shaderData.setColor(TREE_BARK_SEASON_COLOR, NEUTRAL_TREE_BARK_SEASON_COLOR);
}

/**
 * Installs the same procedural daylight, realtime IBL, fog, shadows, and post profile as Integrated World.
 * @param scene Tree Assembly scene receiving the Grasslands lighting state.
 * @param parent Lab entity that owns the light and update components.
 * @param camera Lab camera receiving the authored HDR post-processing profile.
 * @returns Lighting, post-processing, and wind owners matching the authored Grasslands Scene.
 */
export function createTreeAssemblyGrasslandsLighting(
  scene: Scene,
  parent: Entity,
  camera: Camera
): AssetAssemblyGrasslandsLighting {
  initializeAssetAssemblySurfaceMaterialState(scene);
  scene.castShadows = true;
  scene.shadowResolution = ShadowResolution.Medium;
  scene.shadowDistance = 150;
  scene.shadowCascades = ShadowCascadesMode.TwoCascades;
  scene.shadowTwoCascadeSplits = 1 / 3;
  scene.ambientLight.diffuseIntensity = 1;
  scene.ambientLight.specularIntensity = 1;
  scene.background.solidColor.set(0.0864903706, 0.4410819428, 1, 1);
  scene.fogMode = FogMode.Exponential;
  scene.fogColor.set(0.3254716992, 0.6951282024, 1, 1);
  scene.fogDensity = 0.0004;

  const sunEntity = parent.createChild("World direct light");
  sunEntity.transform.setRotation(-51.8999976, -18.0999948, 0);
  const sun = sunEntity.addComponent(DirectLight);
  sun.color = new Color(1, 1, 1, 1);
  sun.shadowType = ShadowType.SoftHigh;
  sun.shadowStrength = 1;
  sun.shadowBias = 1;
  sun.shadowNormalBias = 1;
  sun.shadowNearPlaneOffset = 0.1;
  scene.sun = sun;

  const windEntity = parent.createChild("World wind");
  windEntity.transform.setRotation(0, 52.056, 0);
  const wind = windEntity.addComponent(TerrainWindRuntime);
  wind.initialize({ speedMps: 5 });
  const groundWind = parent.createChild("Ground wind").addComponent(AssetAssemblyGroundWind);
  groundWind.runtime = new SeedWorldGroundWindTuningRuntime(scene);

  const postProcess = parent.createChild("World post process").addComponent(TerrainPostProcessRuntime);
  postProcess.initialize({
    camera,
    ...INTEGRATED_WORLD_POST_PROCESS_PROFILE
  });
  const lighting = createIntegratedWorldLightingRuntime(sunEntity, scene, sun, postProcess);
  lighting.setTuning({ playing: false, timeHours: ASSET_ASSEMBLY_DEFAULT_TIME_HOURS });
  return { lighting, postProcess, wind };
}
