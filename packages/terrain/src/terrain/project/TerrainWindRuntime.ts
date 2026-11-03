import {
  Script,
  ShaderProperty,
  Vector3,
  Vector4,
  WindSceneBridge,
  WindSystem,
  validateWindResponseProfile,
  type WeatherWindState,
  type Camera,
  type WindEmitter,
  type WindExposureSampler,
  type WindGpuExposureProvider,
  type WindLayer,
  type WindSample,
  type WindSceneBridgeConfig,
  type WindSceneBridgeSnapshot,
  type WindVector3Like
} from "@galacean/engine";
import {
  TERRAIN_BILLBOARD_WIND_RESPONSE_PROFILE,
  TERRAIN_BRANCH_WIND_RESPONSE_PROFILE,
  TERRAIN_FLOWER_WIND_RESPONSE_PROFILE,
  TERRAIN_GRASS_WIND_RESPONSE_PROFILE,
  TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES,
  TERRAIN_LEAF_WIND_RESPONSE_PROFILE,
  TERRAIN_SHRUB_WIND_RESPONSE_PROFILE,
  type TerrainVegetationWindResponseProfile
} from "./TerrainWindResponseProfiles";

const GRASS_RESPONSE_0 = ShaderProperty.getByName("scene_WindGrassProfile0");
const GRASS_RESPONSE_1 = ShaderProperty.getByName("scene_WindGrassProfile1");
const GRASS_RESPONSE_2 = ShaderProperty.getByName("scene_WindGrassProfile2");
const FLOWER_RESPONSE_0 = ShaderProperty.getByName("scene_WindFlowerProfile0");
const FLOWER_RESPONSE_1 = ShaderProperty.getByName("scene_WindFlowerProfile1");
const FLOWER_RESPONSE_2 = ShaderProperty.getByName("scene_WindFlowerProfile2");
const LEAF_RESPONSE_0 = ShaderProperty.getByName("scene_WindLeafProfile0");
const LEAF_RESPONSE_1 = ShaderProperty.getByName("scene_WindLeafProfile1");
const LEAF_RESPONSE_2 = ShaderProperty.getByName("scene_WindLeafProfile2");
const SHRUB_RESPONSE_0 = ShaderProperty.getByName("scene_WindShrubProfile0");
const SHRUB_RESPONSE_1 = ShaderProperty.getByName("scene_WindShrubProfile1");
const SHRUB_RESPONSE_2 = ShaderProperty.getByName("scene_WindShrubProfile2");
const BRANCH_RESPONSE_0 = ShaderProperty.getByName("scene_WindBranchProfile0");
const BRANCH_RESPONSE_1 = ShaderProperty.getByName("scene_WindBranchProfile1");
const BRANCH_RESPONSE_2 = ShaderProperty.getByName("scene_WindBranchProfile2");
const BILLBOARD_RESPONSE_0 = ShaderProperty.getByName("scene_WindBillboardProfile0");
const BILLBOARD_RESPONSE_1 = ShaderProperty.getByName("scene_WindBillboardProfile1");
const BILLBOARD_RESPONSE_2 = ShaderProperty.getByName("scene_WindBillboardProfile2");
const GRASS_RESPONSE = packShaderResponseProfile(TERRAIN_GRASS_WIND_RESPONSE_PROFILE);
const FLOWER_RESPONSE = packShaderResponseProfile(TERRAIN_FLOWER_WIND_RESPONSE_PROFILE);
const LEAF_RESPONSE = packShaderResponseProfile(TERRAIN_LEAF_WIND_RESPONSE_PROFILE);
const SHRUB_RESPONSE = packShaderResponseProfile(TERRAIN_SHRUB_WIND_RESPONSE_PROFILE);
const BRANCH_RESPONSE = packShaderResponseProfile(TERRAIN_BRANCH_WIND_RESPONSE_PROFILE);
const BILLBOARD_RESPONSE = packShaderResponseProfile(TERRAIN_BILLBOARD_WIND_RESPONSE_PROFILE);
const WIND_DORMANT_SPEED_EPSILON_MPS = 0.002;
/** Serializable P3 physical wind values. */
export interface TerrainWindRuntimeConfig {
  /** Authored physical baseline in metres per second. */
  speedMps: number;
  /** Stable deterministic wind/gust seed. */
  seed?: number;
}

/** Reused final P3 physical wind state consumed by allocation-sensitive receivers. */
export interface TerrainWindRuntimeState {
  readonly baseSpeedMps: number;
  readonly speedMps: number;
  readonly gust: number;
  readonly turbulence: number;
  readonly direction: readonly [number, number, number];
  readonly velocityWS: readonly [number, number, number];
  readonly targetVelocityWS: readonly [number, number, number];
  readonly layerMultipliers: readonly [number, number, number];
}

/** Detached diagnostics including the camera-centred GPU field. */
export interface TerrainWindRuntimeSnapshot extends TerrainWindRuntimeState {
  readonly renderingActive: boolean;
  /** True after an authored no-wind state has physically settled and suspended all render/simulation work. */
  readonly dormant: boolean;
  readonly activeGustCount: number;
  readonly bridge: Readonly<WindSceneBridgeSnapshot> | null;
}

/**
 * Scene wind owner for the terrain project.
 *
 * It advances one engine-level P3 WindSystem in metres per second and publishes the camera-centred
 * spectrum/local field through WindSceneBridge. Receiver response stays in P3 profiles and assets.
 */
export class TerrainWindRuntime extends Script {
  private _config: Required<TerrainWindRuntimeConfig> | null = null;
  private _system: WindSystem | null = null;
  private _bridge: WindSceneBridge | null = null;
  private _gpuExposureProvider: WindGpuExposureProvider | null = null;
  private _gpuRenderCamera: Camera | null = null;
  private _renderingActive = true;
  private _environmentDormant = false;
  private readonly _direction = new Vector3();
  private _weather: WeatherWindState = {
    forceMultiplier: 1,
    directionOffsetDegrees: 0,
    gustStrength: 0,
    turbulence: 0
  };
  private readonly _state = {
    baseSpeedMps: 0,
    speedMps: 0,
    gust: 1,
    turbulence: 0,
    direction: [0, 0, 0] as [number, number, number],
    velocityWS: [0, 0, 0] as [number, number, number],
    targetVelocityWS: [0, 0, 0] as [number, number, number],
    layerMultipliers: [0, 0, 0] as [number, number, number]
  };

  /** Initializes the single physical wind model without allocating GPU resources. */
  initialize(config: TerrainWindRuntimeConfig): void {
    if (!config || typeof config !== "object") throw new Error("Terrain wind configuration is required");
    const speedMps = config.speedMps;
    validateFinite("speedMps", speedMps);
    if (speedMps < 0) throw new RangeError("Terrain wind speedMps must be non-negative");
    const seed = config.seed ?? 0x57494e44;
    if (!Number.isSafeInteger(seed)) throw new RangeError("Terrain wind seed must be a safe integer");
    this._config = {
      speedMps,
      seed
    };
    this._direction.copyFrom(this.entity.transform.worldForward);
    this._system = new WindSystem({
      seed,
      baseDirection: [this._direction.x, this._direction.y, this._direction.z],
      baseSpeedMps: speedMps
    });
    this._system.applyWeatherForcing(this._weather);
    this._publishResponseProfiles();
    this._refreshSnapshot();
  }

  /** Allocates and publishes the one P3 GPU bridge. Safe to call repeatedly. */
  attachSceneBridge(center: WindVector3Like, config: Readonly<Partial<WindSceneBridgeConfig>> = {}): WindSceneBridge {
    const system = this._requireSystem();
    if (!this._bridge) {
      this._bridge = new WindSceneBridge(this.entity.scene!, system, {
        groundResponseLowFrequencyHz: TERRAIN_SHRUB_WIND_RESPONSE_PROFILE.naturalFrequencyHz,
        groundResponseLowDampingRatio: TERRAIN_SHRUB_WIND_RESPONSE_PROFILE.dampingRatio,
        // Shrub and grass retain the two dense-field endpoints. Flowers have a separate shared
        // state because their concentrated head mass owns an independently authored damping ratio;
        // interpolating only frequency would erase that under-damped recovery.
        groundResponseHighFrequencyHz: TERRAIN_GRASS_WIND_RESPONSE_PROFILE.naturalFrequencyHz,
        groundResponseHighDampingRatio: TERRAIN_GRASS_WIND_RESPONSE_PROFILE.dampingRatio,
        flowerResponseFrequencyHz: TERRAIN_FLOWER_WIND_RESPONSE_PROFILE.naturalFrequencyHz,
        flowerResponseDampingRatio: TERRAIN_FLOWER_WIND_RESPONSE_PROFILE.dampingRatio,
        treeResponseSlowFrequencyHz: TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES["broadleaf-large"].naturalFrequencyHz,
        treeResponseSlowDampingRatio: TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES["broadleaf-large"].dampingRatio,
        treeResponseFastFrequencyHz: TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES["birch-medium"].naturalFrequencyHz,
        treeResponseFastDampingRatio: TERRAIN_HERO_TREE_PRIMARY_RESPONSE_PROFILES["birch-medium"].dampingRatio,
        ...config
      });
    }
    this._bridge.setGpuExposureProvider(this._gpuExposureProvider);
    this._bridge.setGpuRenderCamera(this._gpuRenderCamera);
    this._bridge.setActive(this._renderingActive && !this._environmentDormant);
    this._bridge.setLocalFieldCenter(center);
    this._bridge.update(0);
    this._refreshSnapshot();
    return this._bridge;
  }

  /** Moves the texel-snapped local field and gust reference with the active receiver. */
  setLocalFieldCenter(position: WindVector3Like): void {
    const system = this._requireSystem();
    system.setReferencePosition(position);
    this._bridge?.setLocalFieldCenter(position);
  }

  /** Installs terrain/canopy shelter data used by both CPU samples and the P3 local texture. */
  setExposureSampler(sampler: WindExposureSampler | null): void {
    this._requireSystem().setExposureSampler(sampler);
  }

  /** Installs the optional terrain GPU exposure producer used by the visual field backend. */
  setGpuExposureProvider(provider: WindGpuExposureProvider | null): void {
    this._gpuExposureProvider = provider;
    this._bridge?.setGpuExposureProvider(provider);
  }

  /** Binds post-cull GPU demand detection to one Camera's actual current-frame render queues. */
  setGpuRenderCamera(camera: Camera | null): void {
    this._gpuRenderCamera = camera;
    this._bridge?.setGpuRenderCamera(camera);
  }

  /** Adds or replaces a stable analytical local wind source. */
  setEmitter(emitter: Readonly<WindEmitter>): void {
    const system = this._requireSystem();
    system.setEmitter(emitter);
    if (emitter.enabled !== false) this._wakeFromEnvironmentDormancy();
  }

  removeEmitter(id: string): boolean {
    return this._requireSystem().removeEmitter(id);
  }

  /** Starts one deterministic travelling packet for gameplay, authoring and acceptance tests. */
  triggerGust(amplitude = 1, durationScale = 1): void {
    if (this._weather.gustStrength > 0) this._wakeFromEnvironmentDormancy();
    this._requireSystem().triggerGust(amplitude, durationScale);
  }

  /** Enables the bridge and Shader deformation without reallocating its retained textures. */
  setRenderingActive(active: boolean): void {
    if (typeof active !== "boolean") throw new TypeError("Terrain wind rendering state must be boolean");
    this._renderingActive = active;
    this._bridge?.setActive(active && !this._environmentDormant);
  }

  /** Allocation-safe physical sample for particles, gameplay, audio and climate receivers. */
  sample(
    position: WindVector3Like,
    layer: WindLayer = "ground",
    receiverVelocity?: WindVector3Like,
    out?: WindSample
  ): WindSample {
    return this._requireSystem().sample(position, layer, receiverVelocity, out);
  }

  /** Applies WeatherSystem forcing while retaining this component as the only Scene-wind writer. */
  applyWeatherForcing(forcing: Readonly<WeatherWindState>): void {
    validateWeatherForcing(forcing);
    const forcingChanged =
      this._weather.forceMultiplier !== forcing.forceMultiplier ||
      this._weather.directionOffsetDegrees !== forcing.directionOffsetDegrees ||
      this._weather.gustStrength !== forcing.gustStrength ||
      this._weather.turbulence !== forcing.turbulence;
    if (!isZeroEnvironmentWind(forcing)) this._wakeFromEnvironmentDormancy();
    this._weather.forceMultiplier = forcing.forceMultiplier;
    this._weather.directionOffsetDegrees = forcing.directionOffsetDegrees;
    this._weather.gustStrength = forcing.gustStrength;
    this._weather.turbulence = forcing.turbulence;
    if (this._system && forcingChanged) {
      const config = this._config!;
      this._direction.copyFrom(this.entity.transform.worldForward);
      this._system.setBaseWind(this._direction, config.speedMps);
      this._system.applyWeatherForcing(this._weather);
      this._system.update(0);
      this._bridge?.publish();
      this._refreshSnapshot();
    }
  }

  /** Returns detached final wind values for environment consumers and diagnostics. */
  getSnapshot(): TerrainWindRuntimeSnapshot {
    if (!this._config || !this._system) throw new Error("Terrain wind runtime has not been initialized");
    return {
      ...this._state,
      renderingActive: this._renderingActive,
      dormant: this._environmentDormant,
      activeGustCount: this._system.getActiveGustCount(),
      direction: [...this._state.direction],
      velocityWS: [...this._state.velocityWS],
      targetVelocityWS: [...this._state.targetVelocityWS],
      layerMultipliers: [...this._state.layerMultipliers],
      bridge: this._bridge?.getSnapshot() ?? null
    };
  }

  /** Reused high-frequency state; callers must not mutate its tuples. */
  getCurrentState(): Readonly<TerrainWindRuntimeState> {
    if (!this._config || !this._system) throw new Error("Terrain wind runtime has not been initialized");
    return this._state;
  }

  override onEnable(): void {
    if (!this._system) return;
    this._publishResponseProfiles();
    this._bridge?.setActive(this._renderingActive && !this._environmentDormant);
    this._synchronize(0, false);
  }

  override onStart(): void {
    this._synchronize(0, true);
  }

  override onUpdate(deltaTime = 0): void {
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Terrain wind delta time must be finite and non-negative");
    }
    this._synchronize(deltaTime, false);
  }

  override onDisable(): void {
    this._bridge?.setActive(false);
  }

  override onDestroy(): void {
    this._bridge?.setGpuRenderCamera(null);
    this._gpuRenderCamera = null;
    this._bridge?.destroy();
    this._bridge = null;
    this._gpuExposureProvider = null;
  }

  private _synchronize(deltaTime: number, snap: boolean): void {
    const config = this._config;
    const system = this._system;
    if (!config || !system) throw new Error("Terrain wind runtime was started before initialization");
    if (this._environmentDormant) {
      this._refreshSnapshot();
      return;
    }
    this._direction.copyFrom(this.entity.transform.worldForward);
    system.setBaseWind(this._direction, config.speedMps);
    if (snap) system.snapToTarget();
    else system.update(deltaTime);
    this._bridge?.update(deltaTime);
    this._refreshSnapshot();
    this._tryEnterEnvironmentDormancy();
  }

  private _tryEnterEnvironmentDormancy(): void {
    const system = this._system;
    if (
      !system ||
      !isZeroEnvironmentWind(this._weather) ||
      system.getActiveGustCount() > 0 ||
      system.getActiveEmitterCount() > 0 ||
      this._state.speedMps > WIND_DORMANT_SPEED_EPSILON_MPS
    ) {
      return;
    }
    if (this._renderingActive && this._bridge && !this._bridge.isDynamicResponseSettled()) return;
    // The remaining critically damped tail is below the render/physics epsilon and every
    // retained receiver has already released. Canonicalize the shared physical sample to zero
    // before sleeping so climate, particles, audio and gameplay do not retain a tiny residual.
    system.snapToTarget();
    this._refreshSnapshot();
    this._environmentDormant = true;
    this._bridge?.setActive(false);
  }

  private _wakeFromEnvironmentDormancy(): void {
    if (!this._environmentDormant) return;
    this._environmentDormant = false;
    this._bridge?.setActive(this._renderingActive);
  }

  private _refreshSnapshot(): void {
    const config = this._config;
    const system = this._system;
    if (!config || !system) return;
    const wind = system.getGpuContext();
    const targetVelocity = system.getTargetVelocityWS();
    const gust = 1 + wind.gust;
    this._direction.set(wind.directionWS[0], wind.directionWS[1], wind.directionWS[2]);
    const state = this._state;
    state.baseSpeedMps = config.speedMps;
    state.speedMps = wind.speedMps;
    state.gust = gust;
    state.turbulence = wind.turbulence;
    copyTuple(wind.directionWS, state.direction);
    copyTuple(wind.velocityWS, state.velocityWS);
    copyTuple(targetVelocity, state.targetVelocityWS);
    copyTuple(wind.layerMultipliers, state.layerMultipliers);
  }

  private _publishResponseProfiles(): void {
    const shaderData = this.entity.scene!.shaderData;
    shaderData.setVector4(GRASS_RESPONSE_0, GRASS_RESPONSE[0]);
    shaderData.setVector4(GRASS_RESPONSE_1, GRASS_RESPONSE[1]);
    shaderData.setVector4(GRASS_RESPONSE_2, GRASS_RESPONSE[2]);
    shaderData.setVector4(FLOWER_RESPONSE_0, FLOWER_RESPONSE[0]);
    shaderData.setVector4(FLOWER_RESPONSE_1, FLOWER_RESPONSE[1]);
    shaderData.setVector4(FLOWER_RESPONSE_2, FLOWER_RESPONSE[2]);
    shaderData.setVector4(LEAF_RESPONSE_0, LEAF_RESPONSE[0]);
    shaderData.setVector4(LEAF_RESPONSE_1, LEAF_RESPONSE[1]);
    shaderData.setVector4(LEAF_RESPONSE_2, LEAF_RESPONSE[2]);
    shaderData.setVector4(SHRUB_RESPONSE_0, SHRUB_RESPONSE[0]);
    shaderData.setVector4(SHRUB_RESPONSE_1, SHRUB_RESPONSE[1]);
    shaderData.setVector4(SHRUB_RESPONSE_2, SHRUB_RESPONSE[2]);
    shaderData.setVector4(BRANCH_RESPONSE_0, BRANCH_RESPONSE[0]);
    shaderData.setVector4(BRANCH_RESPONSE_1, BRANCH_RESPONSE[1]);
    shaderData.setVector4(BRANCH_RESPONSE_2, BRANCH_RESPONSE[2]);
    shaderData.setVector4(BILLBOARD_RESPONSE_0, BILLBOARD_RESPONSE[0]);
    shaderData.setVector4(BILLBOARD_RESPONSE_1, BILLBOARD_RESPONSE[1]);
    shaderData.setVector4(BILLBOARD_RESPONSE_2, BILLBOARD_RESPONSE[2]);
  }

  private _requireSystem(): WindSystem {
    if (!this._system) throw new Error("Terrain wind runtime has not been initialized");
    return this._system;
  }
}

function validateWeatherForcing(forcing: Readonly<WeatherWindState>): void {
  if (
    !Number.isFinite(forcing.forceMultiplier) ||
    !Number.isFinite(forcing.directionOffsetDegrees) ||
    !Number.isFinite(forcing.gustStrength) ||
    !Number.isFinite(forcing.turbulence)
  ) {
    throw new RangeError("Terrain wind weather values must be finite");
  }
  if (forcing.forceMultiplier < 0) throw new RangeError("Terrain wind force multiplier must be non-negative");
  if (forcing.gustStrength < 0 || forcing.gustStrength > 1 || forcing.turbulence < 0 || forcing.turbulence > 1) {
    throw new RangeError("Terrain wind gust and turbulence must be in [0, 1]");
  }
}

function isZeroEnvironmentWind(forcing: Readonly<WeatherWindState>): boolean {
  return forcing.forceMultiplier === 0 && forcing.gustStrength === 0 && forcing.turbulence === 0;
}

function validateFinite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`Terrain wind ${name} must be finite`);
}

function copyTuple(source: readonly number[], target: [number, number, number]): void {
  target[0] = source[0];
  target[1] = source[1];
  target[2] = source[2];
}

function packShaderResponseProfile(
  profile: Readonly<TerrainVegetationWindResponseProfile>
): readonly [Vector4, Vector4, Vector4] {
  validateWindResponseProfile(profile);
  return [
    new Vector4(profile.bendGain, profile.dynamicGain, profile.macroGain, profile.mesoGain),
    new Vector4(profile.microGain, profile.responseLagSeconds, profile.maximumBendRadians, profile.flutterWeight),
    new Vector4(
      profile.flutterFrequencyMinHz,
      profile.flutterFrequencyMaxHz,
      profile.highSpeedMicroScale,
      profile.naturalFrequencyHz
    )
  ];
}
