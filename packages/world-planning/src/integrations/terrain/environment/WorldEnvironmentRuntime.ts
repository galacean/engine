import {
  Camera,
  Color,
  Entity,
  Scene,
  ScreenSpaceReflectionReceiverMode,
  Script,
  ShaderProperty,
  Vector3,
  Vector4,
  type VolumetricCloudQuality,
  type VolumetricCloudMaterial,
  type VolumetricCloudLightingProfile,
  type VolumetricCloudScaleSettings,
  type VolumetricCloudShapeSettings,
  WeatherPresets,
  WeatherSystem,
  type WeatherCloudState,
  type WeatherLightningState,
  type WeatherPrecipitationState,
  type WeatherSkyLightingState,
  type WeatherState,
  type WeatherTransitionProgress,
  type WeatherWindState,
  type ScreenSpaceReflectionConsumerLease
} from "@galacean/engine";
import {
  VolumetricCloudSkyRuntime,
  type VolumetricCloudSkyRuntimeSnapshot
} from "@galacean/engine-environment/lighting/VolumetricCloudSkyRuntime";
import type { TerrainEnvironmentTransition, TerrainLightingRuntime } from "../lighting/TerrainLightingRuntime.ts";
import type { TerrainRainImpactSurfaceProvider } from "./TerrainRainImpactSurface.ts";
import type { TerrainWaterRainImpactSurfaceProvider } from "./TerrainWaterRainImpactPolicy.ts";
import {
  TerrainWindRuntime,
  type TerrainWindRuntimeSnapshot
} from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import {
  advanceTerrainSurfaceClimate,
  createTerrainSurfaceClimateState,
  resolveTerrainRainSurfaceVisibility,
  type TerrainSurfaceClimateContext,
  type TerrainSurfaceClimateState
} from "@galacean/engine-environment/terrain/environment/SurfaceClimate";
import {
  TerrainLightningVfx,
  type TerrainLightningVfxSnapshot,
  type TerrainLightningStrike
} from "@galacean/engine-environment/terrain/environment/TerrainLightningVfx";
import { TerrainP3AtmosphericWind, type TerrainP3AtmosphericWindState } from "./TerrainP3AtmosphericWind.ts";
import { TerrainPrecipitationVfx, type TerrainPrecipitationVfxSnapshot } from "./TerrainPrecipitationVfx.ts";
import { TerrainSurfaceRainTextures } from "@galacean/engine-environment/terrain/environment/TerrainSurfaceRainTextures";
import { terrainSurfaceWaterRequestsScreenSpaceReflection } from "@galacean/engine-environment/terrain/environment/TerrainSurfaceWaterSsrDemand";
import {
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE
} from "@galacean/engine-environment/terrain/environment/TerrainVolumetricCloudPreset";
import {
  createTerrainSeasonPaletteTable,
  resolveTerrainSeasonColors,
  TERRAIN_DEFAULT_SEASON,
  TERRAIN_DEFAULT_SEASON_PALETTES,
  TERRAIN_SEASONS,
  type MutableTerrainSeasonPaletteTable,
  type TerrainSeason,
  type TerrainSeasonColor,
  type TerrainSeasonPalette,
  type TerrainResolvedSeasonPalette,
  type TerrainResolvedSeasonTone
} from "@galacean/engine-environment/terrain/environment/SceneSeasonPalette";

export type { TerrainSeason } from "@galacean/engine-environment/terrain/environment/SceneSeasonPalette";

const SURFACE_CLIMATE = ShaderProperty.getByName("scene_SurfaceClimate");
const WEATHER_STATE = ShaderProperty.getByName("scene_WeatherState");
const WEATHER_TIME = ShaderProperty.getByName("scene_WeatherTime");
const SURFACE_SNOW_COLOR = ShaderProperty.getByName("scene_SurfaceSnowColor");
const SEASON_STATE = ShaderProperty.getByName("scene_SeasonState");
const GRASS_SEASON_COLOR = ShaderProperty.getByName("scene_GrassSeasonColor");
const TREE_LEAF_SEASON_COLOR = ShaderProperty.getByName("scene_TreeLeafSeasonColor");
const TREE_BARK_SEASON_COLOR = ShaderProperty.getByName("scene_TreeBarkSeasonColor");
const SURFACE_WATER_NORMAL = ShaderProperty.getByName("scene_SurfaceWaterNormal");
const TERRAIN_WATER_COVERAGE_PARAMS = ShaderProperty.getByName("scene_TerrainWaterCoverageParams");
const TERRAIN_WATER_SURFACE_PARAMS = ShaderProperty.getByName("scene_TerrainWaterSurfaceParams");
const TERRAIN_WATER_OPTICS_PARAMS = ShaderProperty.getByName("scene_TerrainWaterOpticsParams");
const TERRAIN_RIPPLE_PARAMS = ShaderProperty.getByName("scene_TerrainRippleParams");
const CLOUD_STORM_WIND_THRESHOLD = 1;
const CLOUD_STORM_WIND_RANGE = 1.4;
const CLOUD_STORM_TURBULENCE_WEIGHT = 0.35;

/** Canonical Integrated World weather composition retained by every Terrain entry point. */
export const TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION = Object.freeze({
  transitionDuration: 2,
  season: TERRAIN_DEFAULT_SEASON,
  skyLighting: WeatherPresets.skyLighting.clear,
  cloud: WeatherPresets.cloud.scattered,
  precipitation: WeatherPresets.precipitation.none,
  wind: WeatherPresets.wind.breeze,
  lightning: WeatherPresets.lightning.none,
  cloudQuality: "balanced" as VolumetricCloudQuality
});

const TERRAIN_SEASON_WEIGHTS: Readonly<Record<TerrainSeason, readonly [number, number, number, number]>> = {
  spring: [1, 0, 0, 0],
  summer: [0, 1, 0, 0],
  autumn: [0, 0, 1, 0],
  winter: [0, 0, 0, 1]
};

/** Seasonal weather defaults shared by runtime entry points and authoring controls. */
export const TERRAIN_SEASON_DEFAULT_COMPOSITIONS = {
  spring: { skyLighting: "clear", cloud: "scattered", precipitation: "none" },
  summer: { skyLighting: "clear", cloud: "scattered", precipitation: "none" },
  autumn: { skyLighting: "clear", cloud: "scattered", precipitation: "none" },
  winter: { skyLighting: "clear", cloud: "scattered", precipitation: "snow" }
} as const satisfies Readonly<
  Record<
    TerrainSeason,
    {
      readonly skyLighting: keyof typeof WeatherPresets.skyLighting;
      readonly cloud: keyof typeof WeatherPresets.cloud;
      readonly precipitation: keyof typeof WeatherPresets.precipitation;
    }
  >
>;

export interface TerrainSeasonSnapshot {
  readonly id: TerrainSeason;
  readonly transitionProgress: number;
  readonly weights: {
    readonly spring: number;
    readonly summer: number;
    readonly autumn: number;
    readonly winter: number;
  };
}

/** Artist-facing controls for the dielectric rainwater film rendered over Terrain. */
export interface TerrainSurfaceWaterTuning {
  /** Multiplies the physically resolved thin-film and standing-water coverage. */
  readonly coverageMultiplier: number;
  /** Adds preview storage before the hydrology fill threshold, so puddles can be inspected without waiting for rain. */
  readonly puddleStorageBias: number;
  /** Multiplies both procedural-sky IBL and SSR after the shared water BRDF. */
  readonly reflectionIntensity: number;
  /** Maximum SSR share at a fully confident hit; the remaining share always stays procedural-sky IBL. */
  readonly ssrMix: number;
  /** GGX perceptual roughness of substrate-following thin water film. */
  readonly thinFilmRoughness: number;
  /** GGX perceptual roughness of gravity-level standing water. */
  readonly standingWaterRoughness: number;
  /** Amount that thin-film normals flatten toward the terrain geometry normal. */
  readonly normalFlattening: number;
  /** Strength of animated rain-ring normals after coverage and rain visibility. */
  readonly rippleNormalStrength: number;
  /** Multiplies both world-space rain-ring UV frequencies without changing their relative detiling. */
  readonly rippleUvTiling: number;
  /** Number of independently offset rain-ring fields blended over the puddle surface. */
  readonly rippleCount: number;
  /** Roughness multiplier at the brightest rain-ring response; lower values create sharper rings. */
  readonly rippleRoughnessMultiplier: number;
  /** Dielectric index of refraction used to derive water F0. */
  readonly ior: number;
}

type MutableTerrainSurfaceWaterTuning = {
  -readonly [K in keyof TerrainSurfaceWaterTuning]: TerrainSurfaceWaterTuning[K];
};

type MutableTerrainSurfaceClimateContext = {
  -readonly [K in keyof TerrainSurfaceClimateContext]: TerrainSurfaceClimateContext[K];
};

/** Artist-approved ground-puddle presentation loaded whenever a rain preset is selected. */
export const TERRAIN_RAIN_SURFACE_WATER_TUNING: Readonly<TerrainSurfaceWaterTuning> = Object.freeze({
  coverageMultiplier: 0.97,
  puddleStorageBias: 0.145,
  reflectionIntensity: 1.35,
  ssrMix: 1,
  thinFilmRoughness: 0.005,
  standingWaterRoughness: 0.005,
  normalFlattening: 0.26,
  rippleNormalStrength: 4,
  rippleUvTiling: 0.52,
  rippleCount: 0.51,
  rippleRoughnessMultiplier: 0.12,
  ior: 1.333
});

/** Dry-weather presentation retains the authored optics but never forces preview storage. */
export const TERRAIN_DRY_SURFACE_WATER_TUNING: Readonly<TerrainSurfaceWaterTuning> = Object.freeze({
  ...TERRAIN_RAIN_SURFACE_WATER_TUNING,
  puddleStorageBias: 0
});

/** Initial values are dry because the default composition has no precipitation. */
export const TERRAIN_DEFAULT_SURFACE_WATER_TUNING = TERRAIN_DRY_SURFACE_WATER_TUNING;

const TERRAIN_SURFACE_WATER_TUNING_RANGES: Readonly<
  Record<keyof TerrainSurfaceWaterTuning, readonly [number, number]>
> = Object.freeze({
  coverageMultiplier: [0, 4],
  puddleStorageBias: [0, 1],
  reflectionIntensity: [0, 4],
  ssrMix: [0, 1],
  thinFilmRoughness: [0.005, 1],
  standingWaterRoughness: [0.005, 1],
  normalFlattening: [0, 1],
  rippleNormalStrength: [0, 4],
  rippleUvTiling: [0.05, 8],
  rippleCount: [0, 4],
  rippleRoughnessMultiplier: [0, 1],
  ior: [1.001, 2]
});

/** Detached world-environment state for authoring controls and browser acceptance. */
export interface WorldEnvironmentRuntimeSnapshot {
  readonly transitionDuration: number;
  readonly transitionProgress: Readonly<WeatherTransitionProgress>;
  readonly season: Readonly<TerrainSeasonSnapshot>;
  readonly seasonColors: Readonly<TerrainResolvedSeasonPalette>;
  readonly weatherTime: number;
  readonly lightningEnergy: number;
  readonly weather: Readonly<WeatherState>;
  readonly surface: Readonly<TerrainSurfaceClimateState>;
  readonly surfaceWater: Readonly<TerrainSurfaceWaterTuning>;
  readonly wind: Readonly<TerrainWindRuntimeSnapshot>;
  readonly atmosphericWind: Readonly<TerrainP3AtmosphericWindState>;
  readonly clouds: Readonly<VolumetricCloudSkyRuntimeSnapshot>;
  readonly cloudAdvectionSpeed: number;
  readonly precipitation: Readonly<TerrainPrecipitationVfxSnapshot>;
  readonly lightning: Readonly<TerrainLightningVfxSnapshot>;
}

/**
 * Composes weather with the existing astronomical cycle, wind owner, precipitation presentation,
 * and persistent surface climate. It never creates a second Sun, clock, or direct Scene-wind writer.
 */
export class WorldEnvironmentRuntime {
  /** Production emitter identities, not an all-particle macro Cartesian product. */
  /** Borrowed alternate sky owner: cloud/procedural sky can swap after candidate preparation. */
  get shaderWarmupBackgroundMaterials() {
    this._assertAlive();
    return Object.freeze([this._clouds.material]);
  }

  get shaderWarmupWindRenderers() {
    return this._precipitation.shaderWarmupWindRenderers;
  }

  /** Engine-owned independent weather channels consumed by the demo adapters. */
  readonly weatherSystem = new WeatherSystem();
  private readonly _scene: Scene;
  private readonly _camera: Camera;
  private readonly _ground: TerrainRainImpactSurfaceProvider;
  private readonly _lighting: TerrainLightingRuntime;
  private readonly _wind: TerrainWindRuntime;
  private readonly _root: Entity;
  private readonly _driver: WorldEnvironmentDriver;
  private readonly _precipitation: TerrainPrecipitationVfx;
  private readonly _clouds: VolumetricCloudSkyRuntime;
  private readonly _atmosphericWind = new TerrainP3AtmosphericWind();
  private readonly _lightningVfx: TerrainLightningVfx;
  private readonly _surfaceRainTextures: TerrainSurfaceRainTextures;
  private readonly _surfaceVector = new Vector4();
  private readonly _terrainWaterCoverageParams = new Vector4();
  private readonly _terrainWaterSurfaceParams = new Vector4();
  private readonly _terrainWaterOpticsParams = new Vector4();
  private readonly _terrainRippleParams = new Vector4();
  private readonly _surfaceWaterSsrDemandState = {
    rainRate: 0,
    puddles: 0,
    puddleStorageBias: 0,
    coverageMultiplier: 0,
    reflectionIntensity: 0,
    ssrMix: 0
  };
  private readonly _windFieldCenter = new Vector3();
  private readonly _weatherVector = new Vector4();
  private readonly _snowColor = new Vector4(0.84, 0.9, 0.96, 1);
  private readonly _seasonVector: Vector4;
  private readonly _grassSeasonColor: Color;
  private readonly _treeLeafSeasonColor: Color;
  private readonly _treeBarkSeasonColor: Color;
  private readonly _seasonPalettes: MutableTerrainSeasonPaletteTable = createTerrainSeasonPaletteTable();
  private readonly _seasonFrom = [0, 1, 0, 0];
  private readonly _seasonTarget = [0, 1, 0, 0];
  private readonly _surface = createTerrainSurfaceClimateState();
  private readonly _surfaceClimateContext: MutableTerrainSurfaceClimateContext = {
    deltaTime: 0,
    dayFactor: 0,
    puddleStorageCapacityMillimetres: undefined,
    puddleMaximumAreaFraction: undefined
  };
  private readonly _surfaceWater: MutableTerrainSurfaceWaterTuning = {
    ...TERRAIN_DEFAULT_SURFACE_WATER_TUNING
  };
  private _season: TerrainSeason = TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION.season;
  private _seasonTransitionElapsed = 0;
  private _seasonTransitionDuration = 0;
  private _transitionDuration: number = TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION.transitionDuration;
  private _weatherTime = 0;
  private _clearPuddlesWhileDry = true;
  private _lightningEnergy = 1;
  private _cloudAdvectionSpeed = 0;
  private _cloudWindShapeResponse = 0;
  private _weatherIblSynchronized = true;
  private _seasonIblSynchronized = true;
  private _surfaceWaterSsrLease: ScreenSpaceReflectionConsumerLease | undefined;
  private _destroyed = false;
  private _timeDrivenTransition = false;

  static async create(
    scene: Scene,
    camera: Camera,
    ground: TerrainRainImpactSurfaceProvider,
    lighting: TerrainLightingRuntime,
    wind: TerrainWindRuntime,
    waterSurface?: TerrainWaterRainImpactSurfaceProvider
  ): Promise<WorldEnvironmentRuntime> {
    const root = scene.createRootEntity("Terrain World Environment");
    const [precipitationResult, cloudResult] = await Promise.allSettled([
      TerrainPrecipitationVfx.create(scene.engine, root, camera, ground, waterSurface),
      VolumetricCloudSkyRuntime.create(scene, camera, {
        quality: TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION.cloudQuality,
        scaleSettings: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
        shapeProfile: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE,
        lightingProfile: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE,
        materialName: "Integrated World Volumetric Cloud Sky"
      })
    ]);
    if (precipitationResult.status === "rejected") {
      if (cloudResult.status === "fulfilled") cloudResult.value.destroy();
      root.destroy();
      throw precipitationResult.reason;
    }
    if (cloudResult.status === "rejected") {
      precipitationResult.value.destroy();
      root.destroy();
      throw cloudResult.reason;
    }
    let lightningVfx: TerrainLightningVfx | undefined;
    let surfaceRainTextures: TerrainSurfaceRainTextures | undefined;
    try {
      lightningVfx = new TerrainLightningVfx(scene.engine, root, camera);
      surfaceRainTextures = new TerrainSurfaceRainTextures(scene);
      return new WorldEnvironmentRuntime(
        scene,
        camera,
        ground,
        lighting,
        wind,
        root,
        precipitationResult.value,
        cloudResult.value,
        lightningVfx,
        surfaceRainTextures
      );
    } catch (error) {
      if (surfaceRainTextures) {
        scene.shaderData.setTexture(SURFACE_WATER_NORMAL, null!);
      }
      surfaceRainTextures?.destroy();
      lightningVfx?.destroy();
      precipitationResult.value.destroy();
      cloudResult.value.destroy();
      root.destroy();
      throw error;
    }
  }

  private constructor(
    scene: Scene,
    camera: Camera,
    ground: TerrainRainImpactSurfaceProvider,
    lighting: TerrainLightingRuntime,
    wind: TerrainWindRuntime,
    root: Entity,
    precipitation: TerrainPrecipitationVfx,
    clouds: VolumetricCloudSkyRuntime,
    lightningVfx: TerrainLightningVfx,
    surfaceRainTextures: TerrainSurfaceRainTextures
  ) {
    this._scene = scene;
    this._camera = camera;
    this._ground = ground;
    this._lighting = lighting;
    this._wind = wind;
    this._root = root;
    this._precipitation = precipitation;
    this._clouds = clouds;
    lighting.setEnvironmentTransitionFactory((duration) => this._beginTimeTransition(duration));
    this._lightningVfx = lightningVfx;
    this._surfaceRainTextures = surfaceRainTextures;
    const shaderData = scene.shaderData;
    this._seasonVector = new Vector4(0, 1, 0, 0);
    this._grassSeasonColor = new Color(1, 1, 1, 0);
    this._treeLeafSeasonColor = new Color(1, 1, 1, 0);
    this._treeBarkSeasonColor = new Color(1, 1, 1, 0);
    shaderData.setVector4(SEASON_STATE, this._seasonVector);
    shaderData.setColor(GRASS_SEASON_COLOR, this._grassSeasonColor);
    shaderData.setColor(TREE_LEAF_SEASON_COLOR, this._treeLeafSeasonColor);
    shaderData.setColor(TREE_BARK_SEASON_COLOR, this._treeBarkSeasonColor);
    shaderData.setVector4(SURFACE_CLIMATE, this._surfaceVector);
    shaderData.setVector4(TERRAIN_WATER_COVERAGE_PARAMS, this._terrainWaterCoverageParams);
    shaderData.setVector4(TERRAIN_WATER_SURFACE_PARAMS, this._terrainWaterSurfaceParams);
    shaderData.setVector4(TERRAIN_WATER_OPTICS_PARAMS, this._terrainWaterOpticsParams);
    shaderData.setVector4(TERRAIN_RIPPLE_PARAMS, this._terrainRippleParams);
    shaderData.setVector4(WEATHER_STATE, this._weatherVector);
    shaderData.setVector4(SURFACE_SNOW_COLOR, this._snowColor);
    this._publishSurfaceWaterTuning();
    this._publishSeasonState();
    this._lighting.applySeasonLighting(this._seasonVector);
    const weather = TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION;
    this.weatherSystem.setSkyLighting(weather.skyLighting, 0);
    this.weatherSystem.setCloud(weather.cloud, 0);
    this.weatherSystem.setPrecipitation(weather.precipitation, 0);
    this.weatherSystem.setWind(weather.wind, 0);
    this.weatherSystem.setLightning(weather.lightning, 0);
    scene.shaderData.setTexture(SURFACE_WATER_NORMAL, surfaceRainTextures.waterNormal);
    this._wind.setGpuRenderCamera(camera);
    this._synchronizeWindFieldCenter();
    this._wind.attachSceneBridge(this._windFieldCenter);
    const driver = (this._driver = this._root.addComponent(WorldEnvironmentDriver));
    driver.runtime = this;
    this._applyComposedState(0);
    // Include the first cloud-composited sky in startup barriers even when the initial sky bake is still active.
    this._lighting.requestEnvironmentBake();
  }

  /** Transitions only sky and environment lighting; cloud shape and precipitation remain unchanged. */
  setSkyLighting(state: Readonly<WeatherSkyLightingState>): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    this._weatherIblSynchronized = false;
    this.weatherSystem.setSkyLighting(state, transitionDuration);
    if (transitionDuration === 0) {
      this._applyComposedState(0);
      this._lighting.requestEnvironmentBake();
      this._weatherIblSynchronized = true;
    }
  }

  /** Transitions cloud shape and optical extinction without changing sky lighting or precipitation. */
  setCloud(state: Readonly<WeatherCloudState>): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    this._weatherIblSynchronized = false;
    this.weatherSystem.setCloud(state, transitionDuration);
    // Timed weather changes are continuous inputs to the direction cache. Keep its
    // last valid result visible while the regular sweep converges to the new cloud.
    if (transitionDuration === 0) this._clouds.invalidateHistory();
    if (transitionDuration === 0) {
      this._applyComposedState(0);
      this._lighting.requestEnvironmentBake();
      this._weatherIblSynchronized = true;
    }
  }

  /** Transitions rain or snow without changing sky lighting, wind, or lightning. */
  setPrecipitation(state: Readonly<WeatherPrecipitationState>): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    this.weatherSystem.setPrecipitation(state, transitionDuration);
    this._applyPrecipitationSurfaceWaterState(state);
    if (transitionDuration === 0) this._applyComposedState(0);
  }

  /** Transitions season and its default weather; existing snow melts through surface climate over time. */
  setSeason(season: TerrainSeason): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    const target = TERRAIN_SEASON_WEIGHTS[season];
    if (!target) throw new RangeError(`Unknown terrain season: ${String(season)}`);
    const weather = TERRAIN_SEASON_DEFAULT_COMPOSITIONS[season];
    this.setSkyLighting(WeatherPresets.skyLighting[weather.skyLighting]);
    this.setCloud(WeatherPresets.cloud[weather.cloud]);
    this.setPrecipitation(WeatherPresets.precipitation[weather.precipitation]);
    this._seasonFrom[0] = this._seasonVector.x;
    this._seasonFrom[1] = this._seasonVector.y;
    this._seasonFrom[2] = this._seasonVector.z;
    this._seasonFrom[3] = this._seasonVector.w;
    copySeasonWeights(target, this._seasonTarget);
    this._season = season;
    this._seasonTransitionElapsed = 0;
    this._seasonTransitionDuration = transitionDuration;
    this._seasonIblSynchronized = false;
    if (transitionDuration === 0) {
      this._seasonVector.set(target[0], target[1], target[2], target[3]);
      this._publishSeasonState();
      this._lighting.applySeasonLighting(this._seasonVector);
      this._lighting.requestEnvironmentBake();
      this._seasonIblSynchronized = true;
    }
  }

  /** Updates one Scene-owned category target and immediately resolves the active seasonal mixture. */
  setSeasonPaletteColor(
    season: TerrainSeason,
    category: keyof TerrainSeasonPalette,
    color: Readonly<TerrainSeasonColor>
  ): void {
    this._assertAlive();
    validateSeasonPaletteColor(color);
    const target = this._seasonPalettes[season]?.[category];
    if (!target) throw new RangeError(`Unknown terrain season palette entry: ${String(season)}.${String(category)}`);
    target.r = color.r;
    target.g = color.g;
    target.b = color.b;
    target.influence = color.influence;
    this._publishSeasonState();
  }

  /** Returns a detached palette for authoring controls. */
  getSeasonPalette(season: TerrainSeason): TerrainSeasonPalette {
    this._assertAlive();
    const palette = this._seasonPalettes[season];
    if (!palette) throw new RangeError(`Unknown terrain season: ${String(season)}`);
    return {
      grass: { ...palette.grass },
      treeLeaf: { ...palette.treeLeaf },
      treeBark: { ...palette.treeBark }
    };
  }

  /** Restores all authored seasonal palettes and republishes the active mixture once. */
  resetSeasonPalettes(): void {
    this._assertAlive();
    for (const season of TERRAIN_SEASONS) {
      copySeasonPalette(TERRAIN_DEFAULT_SEASON_PALETTES[season], this._seasonPalettes[season]);
    }
    this._publishSeasonState();
  }

  /** Applies partial live tuning to Terrain rainwater without changing hydrology state or weather. */
  applySurfaceWaterTuning(tuning: Readonly<Partial<TerrainSurfaceWaterTuning>>): void {
    this._assertAlive();
    for (const key of Object.keys(TERRAIN_DEFAULT_SURFACE_WATER_TUNING) as (keyof TerrainSurfaceWaterTuning)[]) {
      const value = tuning[key];
      if (value === undefined) continue;
      const [minimum, maximum] = TERRAIN_SURFACE_WATER_TUNING_RANGES[key];
      if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new RangeError(`Terrain surface water ${key} must be finite and within [${minimum}, ${maximum}]`);
      }
      this._surfaceWater[key] = value;
    }
    this._publishSurfaceWaterTuning();
    this._publishSurfaceClimateState();
  }

  /** Returns detached live Terrain rainwater controls for diagnostics and authoring UI. */
  getSurfaceWaterTuning(): TerrainSurfaceWaterTuning {
    this._assertAlive();
    return { ...this._surfaceWater };
  }

  /** Restores the authored Terrain rainwater parameter defaults without clearing accumulated water. */
  resetSurfaceWaterTuning(): void {
    this.applySurfaceWaterTuning(
      this._clearPuddlesWhileDry ? TERRAIN_DRY_SURFACE_WATER_TUNING : TERRAIN_RAIN_SURFACE_WATER_TUNING
    );
  }

  /** Transitions only the forcing applied to the Scene-owned wind runtime. */
  setWind(state: Readonly<WeatherWindState>): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    this.weatherSystem.setWind(state, transitionDuration);
    if (transitionDuration === 0) this._applyComposedState(0);
  }

  /** Freezes or resumes the shared volumetric-cloud frame without changing weather ownership. */
  setCloudFrameTimeOverride(
    elapsedSeconds?: number,
    windOffsetWS: readonly [number, number, number] = [0, 0, 0]
  ): void {
    this._assertAlive();
    this._clouds.setFrameTimeOverride(elapsedSeconds, windOffsetWS);
  }

  /** Starts one packet on the existing Scene wind owner without changing weather composition. */
  triggerWindGust(amplitude = 1): void {
    this._assertAlive();
    this._wind.triggerGust(amplitude);
  }

  /** Transitions lightning independently from precipitation and cloud cover. */
  setLightning(state: Readonly<WeatherLightningState>): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    this.weatherSystem.setLightning(state, transitionDuration);
    if (transitionDuration === 0) this._applyComposedState(0);
  }

  /** Applies an optional compound state while retaining independent channel ownership. */
  setWeatherState(state: Readonly<WeatherState>): void {
    this._assertAlive();
    const transitionDuration = this._transitionDuration;
    this._weatherIblSynchronized = false;
    this.weatherSystem.setState(state, transitionDuration);
    this._applyPrecipitationSurfaceWaterState(state.precipitation);
    // A composed timed transition follows the same continuous cache path as setCloud.
    if (transitionDuration === 0) this._clouds.invalidateHistory();
    if (transitionDuration === 0) {
      this._applyComposedState(0);
      this._lighting.requestEnvironmentBake();
      this._weatherIblSynchronized = true;
    }
  }

  /** Changes the shared duration used by subsequent season and weather selections. */
  setTransitionDuration(duration: number): void {
    this._assertAlive();
    validateTransitionDuration(duration);
    this._transitionDuration = duration;
  }

  /** Selects the terrain cloud trace/cache quality independently of final canvas resolution. */
  setCloudQuality(quality: VolumetricCloudQuality): void {
    this._assertAlive();
    this._clouds.setQuality(quality);
  }

  /** Applies partial physical layer and density-field scale tuning without bypassing material validation. */
  setCloudScaleSettings(settings: Readonly<Partial<VolumetricCloudScaleSettings>>): void {
    this._assertAlive();
    this._clouds.setScaleSettings({ ...this._clouds.getSnapshot().scaleSettings, ...settings });
  }

  /** Applies partial cloud morphology tuning while preserving the rest of the authored profile. */
  setCloudShapeProfile(profile: Readonly<Partial<VolumetricCloudShapeSettings>>): void {
    this._assertAlive();
    this._clouds.setShapeProfile({ ...this._clouds.getSnapshot().shapeProfile, ...profile });
  }

  /** Applies partial optical tuning while preserving the current terrain-scaled extinction baseline. */
  setCloudLightingProfile(profile: Readonly<Partial<VolumetricCloudLightingProfile>>): void {
    this._assertAlive();
    this._clouds.setLightingProfile({ ...this._clouds.getSnapshot().lightingProfile, ...profile });
  }

  /** Rebuilds the deterministic horizontal cloud distribution with a new seed. */
  setCloudWeatherSeed(seed: number): void {
    this._assertAlive();
    if (!Number.isSafeInteger(seed)) throw new RangeError("Terrain cloud weather seed must be a safe integer");
    this._clouds.setWeatherSeed(seed);
  }

  /** Clears cloud reconstruction history after a visual comparison or camera cut. */
  invalidateCloudHistory(): void {
    this._assertAlive();
    this._clouds.invalidateHistory();
  }

  /** Clears persistent wetness, puddles, and snow without changing the active weather. */
  resetSurfaceClimate(): void {
    this._assertAlive();
    this._surface.wetness = 0;
    this._surface.puddles = 0;
    this._surface.puddleWaterMillimetres = 0;
    this._surface.snowCover = 0;
    this._publishSurfaceClimateState();
  }

  /** Advances transitions, climate memory, wind forcing, lighting composition, and precipitation. */
  update(deltaTime: number): void {
    this._assertAlive();
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Terrain world-environment delta time must be finite and non-negative");
    }
    this._weatherTime += deltaTime;
    this._synchronizeWindFieldCenter();
    if (!this._timeDrivenTransition) this.weatherSystem.update(deltaTime);
    if (!this._timeDrivenTransition && this._advanceSeason(deltaTime)) {
      this._publishSeasonState();
      this._lighting.applySeasonLighting(this._seasonVector);
    }
    const weather = this.weatherSystem.state;
    const hydrology = this._ground.getPuddleHydrology?.();
    this._wind.applyWeatherForcing(weather.wind);
    const climateContext = this._surfaceClimateContext;
    climateContext.deltaTime = deltaTime;
    climateContext.dayFactor = this._lighting.system.state.dayFactor;
    climateContext.puddleStorageCapacityMillimetres = hydrology?.rainfallEquivalentCapacityMillimetres;
    climateContext.puddleMaximumAreaFraction =
      hydrology && hydrology.drainageAreaSquareMetres > 0
        ? hydrology.maximumPuddleAreaSquareMetres / hydrology.drainageAreaSquareMetres
        : undefined;
    advanceTerrainSurfaceClimate(
      this._surface,
      weather.precipitation,
      this._wind.getCurrentState().speedMps,
      climateContext
    );
    if (this._clearPuddlesWhileDry && weather.precipitation.rainRate <= Number.EPSILON) {
      this._completeDrySurfaceWaterTransition();
    }
    this._applyComposedState(deltaTime, false);
    if (
      !this._weatherIblSynchronized &&
      this.weatherSystem.getTransitionProgress("skyLighting") === 1 &&
      this.weatherSystem.getTransitionProgress("cloud") === 1
    ) {
      this._lighting.requestEnvironmentBake();
      this._weatherIblSynchronized = true;
    }
    if (!this._seasonIblSynchronized && this._getSeasonTransitionProgress() === 1) {
      this._lighting.requestEnvironmentBake();
      this._seasonIblSynchronized = true;
    }
  }

  /** Audio consumes the same flash event and climate state as visual presentation. */
  subscribeLightningStrikes(listener: (strike: TerrainLightningStrike) => void): () => void {
    return this._lightningVfx.subscribeStrikes(listener);
  }

  get surfaceClimate(): Readonly<TerrainSurfaceClimateState> {
    return this._surface;
  }

  /** Allocation-free seasonal weight for gameplay; follows the same authored transition as vegetation. */
  get summerWeight(): number {
    return this._seasonVector.y;
  }

  /** Current selected season for gameplay consumers. */
  get season(): TerrainSeason {
    this._assertAlive();
    return this._season;
  }

  /** Returns an allocation-safe detached snapshot at the diagnostics boundary. */
  getSnapshot(): WorldEnvironmentRuntimeSnapshot {
    this._assertAlive();
    return {
      transitionDuration: this._transitionDuration,
      transitionProgress: this.weatherSystem.getTransitionProgress(),
      season: {
        id: this._season,
        transitionProgress: this._getSeasonTransitionProgress(),
        weights: {
          spring: this._seasonVector.x,
          summer: this._seasonVector.y,
          autumn: this._seasonVector.z,
          winter: this._seasonVector.w
        }
      },
      seasonColors: {
        grass: snapshotSeasonColor(this._grassSeasonColor),
        treeLeaf: snapshotSeasonColor(this._treeLeafSeasonColor),
        treeBark: snapshotSeasonColor(this._treeBarkSeasonColor)
      },
      weatherTime: this._weatherTime,
      lightningEnergy: this._lightningEnergy,
      weather: this.weatherSystem.getSnapshot(),
      surface: { ...this._surface },
      surfaceWater: { ...this._surfaceWater },
      wind: this._wind.getSnapshot(),
      atmosphericWind: this._atmosphericWind.getSnapshot(),
      clouds: this._clouds.getSnapshot(),
      cloudAdvectionSpeed: this._cloudAdvectionSpeed,
      precipitation: this._precipitation.getSnapshot(),
      lightning: this._lightningVfx.getSnapshot()
    };
  }

  /** Restores clear modifiers and releases the runtime-owned VFX resources and update Entity. */
  destroy(): void {
    if (this._destroyed) return;
    this._lighting.setEnvironmentTransitionFactory(undefined);
    this._driver.runtime = null;
    this._releaseSurfaceWaterScreenSpaceReflection();
    this._lighting.applyWeatherState(
      TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION.skyLighting,
      TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION.cloud,
      1
    );
    this._wind.applyWeatherForcing({
      forceMultiplier: 1,
      directionOffsetDegrees: 0,
      gustStrength: 0,
      turbulence: 0
    });
    this._wind.setGpuRenderCamera(null);
    this._surfaceVector.set(0, 0, 0, 0);
    this._weatherVector.set(0, 0, 0, 0);
    this._seasonVector.set(0, 1, 0, 0);
    this._grassSeasonColor.set(1, 1, 1, 0);
    this._treeLeafSeasonColor.set(1, 1, 1, 0);
    this._treeBarkSeasonColor.set(1, 1, 1, 0);
    this._scene.shaderData.setVector4(SURFACE_CLIMATE, this._surfaceVector);
    this._scene.shaderData.setVector4(WEATHER_STATE, this._weatherVector);
    const defaultWater = TERRAIN_DEFAULT_SURFACE_WATER_TUNING;
    this._terrainWaterCoverageParams.set(
      defaultWater.coverageMultiplier,
      defaultWater.puddleStorageBias,
      defaultWater.reflectionIntensity,
      defaultWater.ssrMix
    );
    this._terrainWaterSurfaceParams.set(
      defaultWater.thinFilmRoughness,
      defaultWater.standingWaterRoughness,
      defaultWater.normalFlattening,
      defaultWater.rippleNormalStrength
    );
    this._terrainWaterOpticsParams.set(defaultWater.rippleRoughnessMultiplier, defaultWater.ior, 0, 0);
    this._terrainRippleParams.set(defaultWater.rippleUvTiling, defaultWater.rippleCount, 0, 0);
    this._scene.shaderData.setVector4(TERRAIN_WATER_COVERAGE_PARAMS, this._terrainWaterCoverageParams);
    this._scene.shaderData.setVector4(TERRAIN_WATER_SURFACE_PARAMS, this._terrainWaterSurfaceParams);
    this._scene.shaderData.setVector4(TERRAIN_WATER_OPTICS_PARAMS, this._terrainWaterOpticsParams);
    this._scene.shaderData.setVector4(TERRAIN_RIPPLE_PARAMS, this._terrainRippleParams);
    this._scene.shaderData.setFloat(WEATHER_TIME, 0);
    this._scene.shaderData.setTexture(SURFACE_WATER_NORMAL, null!);
    this._surfaceRainTextures.destroy();
    this._atmosphericWind.reset();
    this._precipitation.destroy();
    this._lightningVfx.destroy();
    this._clouds.destroy();
    this._root.destroy();
    this._destroyed = true;
  }

  private _applyComposedState(deltaTime: number, applyWindForcing = true): void {
    const weather = this.weatherSystem.state;
    const lightning = weather.lightning;
    this._lightningEnergy = this._lightningVfx.update(deltaTime, lightning.frequency, lightning.strength);
    this._lighting.applyWeatherState(weather.skyLighting, weather.cloud, this._lightningEnergy);
    if (applyWindForcing) this._wind.applyWeatherForcing(weather.wind);
    const wind = this._wind.getCurrentState();
    const atmosphericWind = this._atmosphericWind.update(
      this._wind,
      this._camera.entity.transform.worldPosition,
      this._clouds.cloudBaseAltitude,
      deltaTime
    );
    this._precipitation.update(
      deltaTime,
      weather.precipitation.rainRate,
      weather.precipitation.snowRate,
      this._surface.puddles,
      atmosphericWind.rainAirVelocityWS,
      atmosphericWind.snowWindVelocityWS,
      atmosphericWind.rainTurbulence,
      atmosphericWind.snowTurbulence
    );
    const cloudVelocity = atmosphericWind.cloudVelocityWS;
    const cloudVelocityX = cloudVelocity[0];
    const cloudVelocityY = cloudVelocity[1];
    const cloudVelocityZ = cloudVelocity[2];
    this._cloudAdvectionSpeed = Math.hypot(cloudVelocityX, cloudVelocityY, cloudVelocityZ);
    const cloudLayerMultiplier = wind.layerMultipliers[2];
    const baselineCloudSpeed = Math.max(1e-5, wind.baseSpeedMps * cloudLayerMultiplier);
    const speedScale = atmosphericWind.cloudSampleSpeedMps / baselineCloudSpeed;
    const speedResponse = clamp01((speedScale - CLOUD_STORM_WIND_THRESHOLD) / CLOUD_STORM_WIND_RANGE);
    const windShapeResponse = clamp01(speedResponse + atmosphericWind.cloudTurbulence * CLOUD_STORM_TURBULENCE_WEIGHT);
    this._cloudWindShapeResponse = windShapeResponse;
    this._clouds.setWeatherValues(weather.cloud.cloudCoverage, weather.cloud.cloudType, weather.cloud.cloudDetail);
    this._clouds.setWindVelocityValues(cloudVelocityX, cloudVelocityY, cloudVelocityZ);
    this._clouds.setEnvironmentModifierValues(weather.cloud.cloudDensityMultiplier, windShapeResponse);
    this._clouds.applyDayNightState(this._lighting.system.state);
    this._clouds.update(deltaTime);
    // Visible clouds update every frame, while their low-frequency environment contribution is sampled only
    // after the previous progressive transaction is complete. Explicit weather edits still request immediately.
    this._lighting.requestDynamicEnvironmentBake(deltaTime);
    this._publishSurfaceClimateState();
  }

  /** Freeze A while a complete B is prepared, then drive weather/season from the clock's progress. */
  private _beginTimeTransition(duration: number): TerrainEnvironmentTransition {
    this._assertAlive();
    if (this._timeDrivenTransition) throw new Error("Environment transition already active");
    const sourceWeather = this.weatherSystem.getSnapshot();
    const targetWeather = this.weatherSystem.getTargetSnapshot();
    const sourceWeights = this._seasonVector.clone();
    const targetWeights = new Vector4(
      this._seasonTarget[0],
      this._seasonTarget[1],
      this._seasonTarget[2],
      this._seasonTarget[3]
    );
    const sourceSeason =
      TERRAIN_SEASONS[
        [sourceWeights.x, sourceWeights.y, sourceWeights.z, sourceWeights.w].indexOf(
          Math.max(sourceWeights.x, sourceWeights.y, sourceWeights.z, sourceWeights.w)
        )
      ];
    this.weatherSystem.setState(targetWeather, duration);
    this._seasonFrom[0] = sourceWeights.x;
    this._seasonFrom[1] = sourceWeights.y;
    this._seasonFrom[2] = sourceWeights.z;
    this._seasonFrom[3] = sourceWeights.w;
    this._seasonTransitionElapsed = 0;
    this._seasonTransitionDuration = duration;
    this._timeDrivenTransition = true;
    let endpoint: VolumetricCloudMaterial | undefined;
    let released = false;
    const applyLighting = (weather: WeatherState, weights: Vector4) => {
      this._lighting.applySeasonLighting(weights);
      this._lighting.applyWeatherState(weather.skyLighting, weather.cloud, 1);
      this._clouds.setWeatherValues(weather.cloud.cloudCoverage, weather.cloud.cloudType, weather.cloud.cloudDetail);
      this._clouds.setEnvironmentModifierValues(weather.cloud.cloudDensityMultiplier, this._cloudWindShapeResponse);
      this._clouds.applyDayNightState(this._lighting.system.state);
    };
    return {
      captureTarget: () => {
        if (!endpoint) {
          applyLighting(targetWeather, targetWeights);
          endpoint = this._clouds.material.clone();
        } else {
          // Reapply B sky modifiers, but retain the frozen endpoint cloud inputs across all slices.
          this._lighting.applySeasonLighting(targetWeights);
          this._lighting.applyWeatherState(targetWeather.skyLighting, targetWeather.cloud, 1);
        }
        return { ready: endpoint.prepareEndpointCache(this._clouds.material, this._camera), clouds: endpoint };
      },
      restoreSourceLighting: () => applyLighting(sourceWeather, sourceWeights),
      advance: (progress) => {
        // The IBL target no longer reads the cloud cache once preparation resolves.
        endpoint?.destroy();
        endpoint = undefined;
        this.weatherSystem.setTransitionProgress(progress);
        this._seasonTransitionElapsed = duration * progress;
        const weight = smoothTransitionProgress(progress);
        this._seasonVector.set(
          lerp(sourceWeights.x, targetWeights.x, weight),
          lerp(sourceWeights.y, targetWeights.y, weight),
          lerp(sourceWeights.z, targetWeights.z, weight),
          lerp(sourceWeights.w, targetWeights.w, weight)
        );
        this._publishSeasonState();
        this._lighting.applySeasonLighting(this._seasonVector);
        this._applyComposedState(0);
      },
      release: (completed) => {
        if (released) return;
        released = true;
        endpoint?.destroy();
        endpoint = undefined;
        this._timeDrivenTransition = false;
        if (!completed && !this._destroyed) {
          this.weatherSystem.setState(sourceWeather, 0);
          this._season = sourceSeason;
          this._seasonVector.copyFrom(sourceWeights);
          this._seasonTransitionElapsed = this._seasonTransitionDuration = 0;
          copySeasonWeights([sourceWeights.x, sourceWeights.y, sourceWeights.z, sourceWeights.w], this._seasonTarget);
          this._publishSeasonState();
          applyLighting(sourceWeather, sourceWeights);
          this._lighting.requestEnvironmentBake();
        }
      }
    };
  }

  private _applyPrecipitationSurfaceWaterState(state: Readonly<WeatherPrecipitationState>): void {
    if (state.rainRate > 0) {
      this._clearPuddlesWhileDry = false;
      this.applySurfaceWaterTuning(TERRAIN_RAIN_SURFACE_WATER_TUNING);
      return;
    }
    if (state.snowRate > 0) return;
    this._clearPuddlesWhileDry = true;
    if (this.weatherSystem.state.precipitation.rainRate <= Number.EPSILON) {
      this._completeDrySurfaceWaterTransition();
    }
  }

  private _completeDrySurfaceWaterTransition(): void {
    this._surface.puddles = 0;
    this._surface.puddleWaterMillimetres = 0;
    if (this._surfaceWater.puddleStorageBias !== TERRAIN_DRY_SURFACE_WATER_TUNING.puddleStorageBias) {
      this.applySurfaceWaterTuning(TERRAIN_DRY_SURFACE_WATER_TUNING);
    }
  }

  private _synchronizeWindFieldCenter(): void {
    const position = this._camera.entity.transform.worldPosition;
    const groundHeight = this._ground.sampleHeightInterpolated(position.x, position.z);
    this._windFieldCenter.set(position.x, groundHeight ?? position.y, position.z);
    this._wind.setLocalFieldCenter(this._windFieldCenter);
  }

  private _publishSurfaceClimateState(): void {
    const weather = this.weatherSystem.state;
    const precipitation = weather.precipitation;
    this._surfaceVector.set(
      this._surface.wetness,
      this._surface.puddles,
      this._surface.snowCover,
      precipitation.rainRate
    );
    this._weatherVector.set(
      precipitation.rainRate,
      precipitation.snowRate,
      weather.cloud.cloudCoverage,
      precipitation.relativeHumidity
    );
    this._terrainRippleParams.z = resolveTerrainRainSurfaceVisibility(precipitation.rainRate);
    this._scene.shaderData.setFloat(WEATHER_TIME, this._weatherTime);
    this._synchronizeSurfaceWaterScreenSpaceReflection(precipitation.rainRate);
  }

  private _publishSurfaceWaterTuning(): void {
    const water = this._surfaceWater;
    this._terrainWaterCoverageParams.set(
      water.coverageMultiplier,
      water.puddleStorageBias,
      water.reflectionIntensity,
      water.ssrMix
    );
    this._terrainWaterSurfaceParams.set(
      water.thinFilmRoughness,
      water.standingWaterRoughness,
      water.normalFlattening,
      water.rippleNormalStrength
    );
    this._terrainWaterOpticsParams.set(water.rippleRoughnessMultiplier, water.ior, 0, 0);
    this._terrainRippleParams.x = water.rippleUvTiling;
    this._terrainRippleParams.y = water.rippleCount;
  }

  private _synchronizeSurfaceWaterScreenSpaceReflection(rainRate: number): void {
    if (this._surfaceWaterSsrLease && !this._surfaceWaterSsrLease.active) {
      this._surfaceWaterSsrLease = undefined;
    }
    const activeLease = this._surfaceWaterSsrLease?.active === true;
    const demandState = this._surfaceWaterSsrDemandState;
    demandState.rainRate = rainRate;
    demandState.puddles = this._surface.puddles;
    demandState.puddleStorageBias = this._surfaceWater.puddleStorageBias;
    demandState.coverageMultiplier = this._surfaceWater.coverageMultiplier;
    demandState.reflectionIntensity = this._surfaceWater.reflectionIntensity;
    demandState.ssrMix = this._surfaceWater.ssrMix;
    const shouldRequest = terrainSurfaceWaterRequestsScreenSpaceReflection(demandState, activeLease);
    if (shouldRequest === activeLease) return;
    if (!shouldRequest) {
      this._releaseSurfaceWaterScreenSpaceReflection();
      return;
    }
    const lease = this._camera.screenSpaceReflection.acquireConsumer("terrain-surface-water", {
      receiverMode: ScreenSpaceReflectionReceiverMode.OpaqueComposite
    });
    if (lease.active) this._surfaceWaterSsrLease = lease;
    else lease.release();
  }

  private _releaseSurfaceWaterScreenSpaceReflection(): void {
    this._surfaceWaterSsrLease?.release();
    this._surfaceWaterSsrLease = undefined;
  }

  private _publishSeasonState(): void {
    resolveTerrainSeasonColors(
      this._seasonVector,
      this._seasonPalettes,
      this._grassSeasonColor,
      this._treeLeafSeasonColor,
      this._treeBarkSeasonColor
    );
  }

  private _advanceSeason(deltaTime: number): boolean {
    const progress = this._getSeasonTransitionProgress();
    if (progress >= 1) return false;
    this._seasonTransitionElapsed = Math.min(this._seasonTransitionElapsed + deltaTime, this._seasonTransitionDuration);
    const nextProgress = this._getSeasonTransitionProgress();
    const blend = smoothTransitionProgress(nextProgress);
    this._seasonVector.set(
      lerp(this._seasonFrom[0], this._seasonTarget[0], blend),
      lerp(this._seasonFrom[1], this._seasonTarget[1], blend),
      lerp(this._seasonFrom[2], this._seasonTarget[2], blend),
      lerp(this._seasonFrom[3], this._seasonTarget[3], blend)
    );
    return true;
  }

  private _getSeasonTransitionProgress(): number {
    return this._seasonTransitionDuration === 0
      ? 1
      : clamp01(this._seasonTransitionElapsed / this._seasonTransitionDuration);
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Terrain world-environment runtime has been destroyed");
  }
}

class WorldEnvironmentDriver extends Script {
  runtime: WorldEnvironmentRuntime | null = null;

  override onUpdate(deltaTime: number): void {
    this.runtime?.update(deltaTime);
  }
}

function validateTransitionDuration(duration: number): void {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new RangeError("Terrain weather transition duration must be finite and non-negative");
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function smoothTransitionProgress(value: number): number {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function copySeasonWeights(source: readonly number[], target: number[]): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
  target[3] = source[3];
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function validateSeasonPaletteColor(color: Readonly<TerrainSeasonColor>): void {
  for (const [component, value] of Object.entries(color)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`Terrain season color ${component} must be finite and within [0, 1]`);
    }
  }
}

function copySeasonPalette(
  source: Readonly<TerrainSeasonPalette>,
  target: MutableTerrainSeasonPaletteTable[TerrainSeason]
): void {
  for (const category of ["grass", "treeLeaf", "treeBark"] as const) {
    const sourceColor = source[category];
    const targetColor = target[category];
    targetColor.r = sourceColor.r;
    targetColor.g = sourceColor.g;
    targetColor.b = sourceColor.b;
    targetColor.influence = sourceColor.influence;
  }
}

function snapshotSeasonColor(color: Readonly<Color>): TerrainResolvedSeasonTone {
  return { r: color.r, g: color.g, b: color.b, influence: color.a };
}
