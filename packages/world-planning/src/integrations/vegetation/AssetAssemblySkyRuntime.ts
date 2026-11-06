import { type Camera, type Scene, Script } from "@galacean/engine";
import {
  VolumetricCloudSkyRuntime,
  type VolumetricCloudSkyRuntimeSnapshot
} from "@galacean/engine-environment/lighting/VolumetricCloudSkyRuntime";
import type { TerrainLightingRuntime } from "../terrain/lighting/TerrainLightingRuntime.ts";
import type { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { TerrainP3AtmosphericWind } from "../terrain/environment/TerrainP3AtmosphericWind.ts";
import { TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION } from "../terrain/environment/WorldEnvironmentRuntime.ts";
import {
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
  TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE
} from "@galacean/engine-environment/terrain/environment/TerrainVolumetricCloudPreset";

const CLOUD_STORM_WIND_THRESHOLD = 1;
const CLOUD_STORM_WIND_RANGE = 1.4;
const CLOUD_STORM_TURBULENCE_WEIGHT = 0.35;

export interface AssetAssemblySkyRuntimeOptions {
  readonly materialName?: string;
}

/** Visible-sky adapter that reuses Integrated World's clear Grasslands cloud presentation. */
export class AssetAssemblySkyRuntime {
  private readonly _clouds: VolumetricCloudSkyRuntime;
  private readonly _driver: AssetAssemblySkyDriver;
  private readonly _camera: Camera;
  private readonly _lighting: TerrainLightingRuntime;
  private readonly _wind: TerrainWindRuntime;
  private readonly _atmosphericWind = new TerrainP3AtmosphericWind();
  private _destroyed = false;

  /**
   * Replaces the hidden procedural IBL sky with the same visible cloud sky as Integrated World.
   * @param scene Asset Assembly scene whose procedural sky is already installed.
   * @param camera Camera used by the shared direction-cache cloud renderer.
   * @param lighting Shared Grasslands astronomical lighting owner.
   * @param wind Shared Grasslands wind owner.
   * @returns Ready visible-sky adapter.
   */
  static async create(
    scene: Scene,
    camera: Camera,
    lighting: TerrainLightingRuntime,
    wind: TerrainWindRuntime,
    options: AssetAssemblySkyRuntimeOptions = {}
  ): Promise<AssetAssemblySkyRuntime> {
    const environment = TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION;
    const clouds = await VolumetricCloudSkyRuntime.create(scene, camera, {
      quality: environment.cloudQuality,
      scaleSettings: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SCALE_SETTINGS,
      shapeProfile: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_SHAPE_PROFILE,
      lightingProfile: TERRAIN_CLEAR_VOLUMETRIC_CLOUD_LIGHTING_PROFILE,
      materialName: options.materialName ?? "Asset Assembly Volumetric Cloud Sky"
    });
    return new AssetAssemblySkyRuntime(scene, camera, lighting, wind, clouds);
  }

  private constructor(
    scene: Scene,
    camera: Camera,
    lighting: TerrainLightingRuntime,
    wind: TerrainWindRuntime,
    clouds: VolumetricCloudSkyRuntime
  ) {
    this._camera = camera;
    this._lighting = lighting;
    this._wind = wind;
    this._clouds = clouds;
    const environment = TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION;
    lighting.applyWeatherState(environment.skyLighting, environment.cloud, 1);
    wind.applyWeatherForcing(environment.wind);
    clouds.setWeatherValues(
      environment.cloud.cloudCoverage,
      environment.cloud.cloudType,
      environment.cloud.cloudDetail
    );
    const owner = scene.createRootEntity("Asset Assembly visible sky");
    this._driver = owner.addComponent(AssetAssemblySkyDriver);
    this._driver.runtime = this;
    this.update(0);
    // The first cloud-composited environment is a discrete startup state and belongs in the startup barrier.
    this._lighting.requestEnvironmentBake();
  }

  /**
   * Synchronizes the visible cloud palette and Sun direction with the shared clock.
   * @param deltaTime Non-negative frame duration in seconds.
   */
  update(deltaTime: number): void {
    if (this._destroyed) return;
    const cloud = TERRAIN_DEFAULT_WORLD_ENVIRONMENT_CONFIGURATION.cloud;
    const cameraPosition = this._camera.entity.transform.worldPosition;
    this._wind.setLocalFieldCenter(cameraPosition);
    const wind = this._wind.getCurrentState();
    const atmosphericWind = this._atmosphericWind.update(
      this._wind,
      cameraPosition,
      this._clouds.cloudBaseAltitude,
      deltaTime
    );
    const cloudLayerMultiplier = wind.layerMultipliers[2];
    const baselineCloudSpeed = Math.max(1e-5, wind.baseSpeedMps * cloudLayerMultiplier);
    const speedScale = atmosphericWind.cloudSampleSpeedMps / baselineCloudSpeed;
    const speedResponse = clamp01((speedScale - CLOUD_STORM_WIND_THRESHOLD) / CLOUD_STORM_WIND_RANGE);
    const windShapeResponse = clamp01(speedResponse + atmosphericWind.cloudTurbulence * CLOUD_STORM_TURBULENCE_WEIGHT);
    const cloudVelocity = atmosphericWind.cloudVelocityWS;
    this._clouds.setWindVelocityValues(cloudVelocity[0], cloudVelocity[1], cloudVelocity[2]);
    this._clouds.setEnvironmentModifierValues(cloud.cloudDensityMultiplier, windShapeResponse);
    this._clouds.applyDayNightState(this._lighting.system.state);
    this._clouds.update(deltaTime);
    this._lighting.requestDynamicEnvironmentBake(deltaTime);
  }

  /** @returns Detached cloud and physical-scale evidence. */
  getSnapshot(): VolumetricCloudSkyRuntimeSnapshot {
    return this._clouds.getSnapshot();
  }

  /** Restores the procedural sky and releases the visible cloud resources. */
  destroy(): void {
    if (this._destroyed) return;
    this._driver.runtime = null;
    this._atmosphericWind.reset();
    this._clouds.destroy();
    this._driver.entity.destroy();
    this._destroyed = true;
  }
}

class AssetAssemblySkyDriver extends Script {
  runtime: AssetAssemblySkyRuntime | null = null;

  override onUpdate(deltaTime: number): void {
    this.runtime?.update(deltaTime);
  }
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
