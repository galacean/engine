import precipitationOverlayShaderSource from "@galacean/engine-environment/terrain/environment/shaders/TerrainPrecipitationOverlay.shader?raw";
import {
  AssetType,
  BlendMode,
  BoxShape,
  Camera,
  Color,
  ConeShape,
  CurveKey,
  Entity,
  GradientAlphaKey,
  GradientColorKey,
  HemisphereShape,
  ParticleCompositeCurve,
  ParticleCompositeGradient,
  ParticleCurve,
  ParticleCurveMode,
  ParticleGradient,
  ParticleMaterial,
  ParticleRenderer,
  ParticleRenderMode,
  ParticleSimulationSpace,
  PrefabResource,
  Ray,
  Shader,
  Texture2D,
  TextureFilterMode,
  TextureWrapMode,
  Vector2,
  Vector3,
  type Engine
} from "@galacean/engine";
import {
  createTerrainRainImpactSample,
  resolveTerrainPuddleSplashAcceptance,
  type TerrainRainImpactSurfaceProvider
} from "./TerrainRainImpactSurface.ts";
import { createWaterSurfaceSample } from "@galacean/engine-water/water/runtime/index";
import {
  TERRAIN_WATER_RAIN_IMPACT_POLICY,
  createTerrainWaterRainImpactEmission,
  distanceToTerrainWaterRainImpactBounds,
  resolveTerrainWaterRainImpactEmission,
  resolveTerrainWaterRainImpactVisibility,
  sampleTerrainWaterRainImpactDistance,
  type TerrainWaterRainImpactSurfaceProvider
} from "./TerrainWaterRainImpactPolicy.ts";
import {
  createRainImpactLaunchTrajectoryState,
  negativeZDirectionEulerDegrees,
  resolveCameraLocalPrecipitationTraversalTime,
  resolveHorizontalPrecipitationWindVelocity,
  resolveParticleSimulationWindVelocity,
  resolveRainImpactLaunchTrajectory,
  resolveWindRelaxedEmitterOffset,
  willParticleSimulationStepReachTime,
  type PrecipitationVector3Tuple,
  type RainImpactLaunchTrajectoryState
} from "@galacean/engine-environment/terrain/environment/TerrainPrecipitationTrajectory";

interface PendingRainImpact {
  impactSimulationTime: number;
  kind: "terrain" | "water";
  dropletsPerImpact: number;
  worldX: number;
  worldZ: number;
  height: number;
  normalX: number;
  normalY: number;
  normalZ: number;
}

/** Live precipitation diagnostics. */
export interface TerrainPrecipitationVfxSnapshot {
  readonly rainRate: number;
  readonly snowRate: number;
  readonly rainParticlesPerSecond: number;
  readonly splashParticlesPerSecond: number;
  readonly rainImpactCount: number;
  readonly waterSplashParticlesPerSecond: number;
  readonly waterRainImpactCount: number;
  readonly waterSurfaceQueryCount: number;
  readonly snowParticlesPerSecond: number;
  readonly rainWindActive: boolean;
  readonly snowWindActive: boolean;
  readonly rainTargetVelocityWS: readonly [number, number, number];
  readonly rainEmitterOffsetWS: readonly [number, number, number];
  readonly snowTargetVelocityWS: readonly [number, number, number];
  readonly snowEmitterOffsetWS: readonly [number, number, number];
}

const RAIN_PARTICLES_PER_SECOND = 360;
const RAIN_IMPACTS_PER_SECOND = 42;
const RAIN_DROPLETS_PER_IMPACT = 6;
const RAIN_SPLASH_RINGS_PER_IMPACT = 1;
const RAIN_DROPLET_START_ALPHA = 0.28;
const RAIN_SPLASH_RING_REFERENCE_SIZE = 0.55;
const RAIN_SPLASH_RING_HEIGHT_OFFSET = 0.012;
const PRECIPITATION_OVERLAY_PRIORITY = 1000;
const RAIN_VOLUME_DEPTH_SCALE = 2.5;
const RAIN_VOLUME_REAR_MARGIN = 4;
const RAIN_DROPLET_HEIGHT_OFFSET = 0.005;
const RAIN_IMPACT_FALL_HEIGHT = 30;
const RAIN_IMPACT_FALL_SPEED = 60;
const RAIN_IMPACT_FLIGHT_TIME = RAIN_IMPACT_FALL_HEIGHT / RAIN_IMPACT_FALL_SPEED;
const RAIN_IMPACT_CAPACITY = 64;
const RAIN_RESPONSE_SEARCH_ATTEMPTS = 12;
const RAIN_IMPACT_RAY_MIN_DISTANCE = 1;
const RAIN_IMPACT_RAY_MAX_DISTANCE = 90;
const RAIN_IMPACT_RAY_STEP = 2;
const RAIN_IMPACT_RAY_REFINEMENT_STEPS = 8;
const RAIN_WIND_RESPONSE_TIME_SECONDS = 0.2;
const SNOW_WIND_RESPONSE_TIME_SECONDS = 0.35;
const SNOW_MAX_HORIZONTAL_TRAVEL_METERS = 10;
const SNOW_HORIZONTAL_WRAP_SIZE_METERS = 28;
const RAIN_CARRIER_URL = new URL(
  "../../../../../environment/src/assets/weather/precipitation-ring.ktx2",
  import.meta.url
);
const SNOW_PREFAB_VIRTUAL_PATH = "/Prefabs/P_VFX_Snow_01/P_VFX_Snow_01.prefab";
const SNOW_MATERIAL_VIRTUAL_PATH = "/Materials/M_VFX_Snow_01_56161fad42.mat";
const SNOW_SHADER_VIRTUAL_PATH = "/Shaders/S_VFX_TransparentAlpha_8541b131eb.shader";
const SNOW_TEXTURE_VIRTUAL_PATH = "/Textures/T_VFX_Snowflake_01_O.ktx2";
const SNOW_PREFAB_URL = new URL("../../../../../environment/src/assets/weather/P_VFX_Snow_01.prefab", import.meta.url);
const SNOW_MATERIAL_URL = new URL(
  "../../../../../environment/src/assets/weather/M_VFX_Snow_01_56161fad42.mat",
  import.meta.url
);
const SNOW_SHADER_URL = new URL(
  "../../../../../environment/src/assets/weather/S_VFX_TransparentAlpha_8541b131eb.shader",
  import.meta.url
);
const SNOW_TEXTURE_URL = new URL(
  "../../../../../environment/src/assets/weather/T_VFX_Snowflake_01_O.ktx2",
  import.meta.url
);
const PARTICLE_OVERLAY_SHADER_NAME = "Terrain/PrecipitationOverlay";
const PARTICLE_OVERLAY_SHADER_SOURCE = precipitationOverlayShaderSource;

/**
 * Camera-relative rain and ground responses plus an authored snow Prefab around the camera.
 *
 * The rain mechanism follows the referenced three-layer effect: a broad falling layer plus short-lived
 * ground response. The textures and ownership names are local to this demo and the climate simulation
 * remains independent from particle visibility.
 */
export class TerrainPrecipitationVfx {
  /** Only these emitters can switch wind/feedback on after startup. */
  get shaderWarmupWindRenderers(): readonly ParticleRenderer[] {
    return [this._rainRenderer, this._snowRenderer];
  }

  private readonly _root: Entity;
  private readonly _camera: Camera;
  private readonly _surface: TerrainRainImpactSurfaceProvider;
  private readonly _waterSurface?: TerrainWaterRainImpactSurfaceProvider;
  private readonly _rainEntity: Entity;
  private readonly _impactRainEntity: Entity;
  private readonly _splashRingEntity: Entity;
  private readonly _dropletEntity: Entity;
  private readonly _snowEntity: Entity;
  private readonly _rainRenderer: ParticleRenderer;
  private readonly _impactRainRenderer: ParticleRenderer;
  private readonly _impactRainShape: BoxShape;
  private readonly _splashRingRenderer: ParticleRenderer;
  private readonly _dropletRenderer: ParticleRenderer;
  private readonly _snowRenderer: ParticleRenderer;
  private readonly _rainMaterial: ParticleMaterial;
  private readonly _splashRingMaterial: ParticleMaterial;
  private readonly _dropletMaterial: ParticleMaterial;
  private readonly _rainCarrierTexture: Texture2D;
  private readonly _rainSimulationSpeed: number;
  private readonly _rainMaxLifetimeSeconds: number;
  private readonly _snowParticlesPerSecond: number;
  private readonly _snowSimulationSpeed: number;
  private readonly _snowMaxLifetimeSeconds: number;
  private readonly _rainVolumeForwardOffset: number;
  private readonly _pendingRainImpacts = createPendingRainImpacts();
  private _pendingRainImpactCount = 0;
  private readonly _impactViewportPoint = new Vector2();
  private readonly _waterImpactViewportPoint = new Vector3();
  private readonly _impactRay = new Ray();
  private readonly _impactRayPoint = new Vector3();
  private readonly _terrainImpactClimate = { puddleStorage: 0 };
  private readonly _terrainImpactSample = createTerrainRainImpactSample();
  private readonly _waterSurfaceSample = createWaterSurfaceSample();
  private readonly _waterEmission = createTerrainWaterRainImpactEmission();
  private readonly _impactLaunchEulerDegrees: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _impactLaunchTargetWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _impactLaunchState: RainImpactLaunchTrajectoryState = createRainImpactLaunchTrajectoryState();
  private _rainRate = 0;
  private _snowRate = 0;
  private _rainEmissionActive = true;
  private _snowEmissionActive = true;
  private _elapsed = 0;
  private _rainResponseRandomState = 0x524f4144;
  private _rainCadenceRandomState = 0x53504c48;
  private _rainImpactCount = 0;
  private _waterRainImpactCount = 0;
  private _waterSurfaceQueryCount = 0;
  private readonly _rainWindInputWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _rainTargetVelocityWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _rainParticleSimulationTargetVelocityWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _rainEmitterOffsetWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _snowWindInputWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _snowTargetVelocityWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _snowParticleSimulationTargetVelocityWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _snowEmitterOffsetWS: PrecipitationVector3Tuple = [0, 0, 0];
  private readonly _snowViewportSize = new Vector2();
  private _rainWindReleaseTime = Number.NEGATIVE_INFINITY;
  private _snowWindReleaseTime = Number.NEGATIVE_INFINITY;
  private _rainWindActive = false;
  private _snowWindActive = false;
  private _destroyed = false;

  static async create(
    engine: Engine,
    parent: Entity,
    camera: Camera,
    surface: TerrainRainImpactSurfaceProvider,
    waterSurface?: TerrainWaterRainImpactSurfaceProvider
  ): Promise<TerrainPrecipitationVfx> {
    const [rainCarrierTexture, snowPrefab] = await Promise.all([
      loadParticleAtlas(engine, RAIN_CARRIER_URL, 256, 128),
      loadSnowPrefab(engine)
    ]);
    return new TerrainPrecipitationVfx(engine, parent, camera, surface, rainCarrierTexture, snowPrefab, waterSurface);
  }

  private constructor(
    engine: Engine,
    parent: Entity,
    camera: Camera,
    surface: TerrainRainImpactSurfaceProvider,
    rainCarrierTexture: Texture2D,
    snowPrefab: PrefabResource,
    waterSurface?: TerrainWaterRainImpactSurfaceProvider
  ) {
    const snowEntity = snowPrefab.instantiate();
    const snowRenderers = snowEntity.getComponentsIncludeChildren(ParticleRenderer, []);
    if (snowRenderers.length !== 1) {
      snowEntity.destroy();
      throw new Error(`Terrain snow Prefab requires exactly one ParticleRenderer, received ${snowRenderers.length}`);
    }
    const snowRenderer = snowRenderers[0];
    const snowShape = snowRenderer.generator.emission.shape;
    if (!(snowShape instanceof HemisphereShape)) {
      snowEntity.destroy();
      throw new Error(
        `Terrain snow Prefab requires a HemisphereShape for rain-volume parity, received ${snowShape?.constructor.name ?? "none"}`
      );
    }
    const snowParticlesPerSecond = snowRenderer.generator.emission.rateOverTime.constant;
    if (!Number.isFinite(snowParticlesPerSecond) || snowParticlesPerSecond <= 0) {
      snowEntity.destroy();
      throw new Error(
        `Terrain snow Prefab requires a positive authored emission rate, received ${snowParticlesPerSecond}`
      );
    }
    snowRenderer.generator.main.playOnEnabled = false;
    snowRenderer.generator.emission.rateOverTime.constant = 0;
    snowRenderer.generator.forceOverLifetime.enabled = false;
    const snowVelocity = snowRenderer.generator.velocityOverLifetime;
    snowVelocity.space = ParticleSimulationSpace.World;
    snowVelocity.velocityX.constantMin = 0;
    snowVelocity.velocityX.constantMax = 0;
    snowVelocity.velocityZ.constantMin = 0;
    snowVelocity.velocityZ.constantMax = 0;
    const snowSimulationSpeed = snowRenderer.generator.main.simulationSpeed;
    if (!Number.isFinite(snowSimulationSpeed) || snowSimulationSpeed <= 0) {
      snowEntity.destroy();
      throw new Error(`Terrain snow Prefab requires a positive simulation speed, received ${snowSimulationSpeed}`);
    }
    const snowWind = snowRenderer.generator.windOverLifetime;
    snowWind.responseTime = SNOW_WIND_RESPONSE_TIME_SECONDS * snowSimulationSpeed;
    snowWind.influence.set(1, 0, 1);
    snowWind.wrapSize.set(SNOW_HORIZONTAL_WRAP_SIZE_METERS, 0, SNOW_HORIZONTAL_WRAP_SIZE_METERS);
    snowWind.enabled = false;
    const snowLifetime = snowRenderer.generator.main.startLifetime;
    if (snowLifetime.mode !== ParticleCurveMode.Constant && snowLifetime.mode !== ParticleCurveMode.TwoConstants) {
      snowEntity.destroy();
      throw new Error(`Terrain snow Prefab requires a constant particle lifetime, received mode ${snowLifetime.mode}`);
    }
    const snowMaxLifetimeSimulationSeconds = Math.max(snowLifetime.constantMin, snowLifetime.constantMax);
    if (!Number.isFinite(snowMaxLifetimeSimulationSeconds) || snowMaxLifetimeSimulationSeconds <= 0) {
      snowEntity.destroy();
      throw new Error(
        `Terrain snow Prefab requires a positive particle lifetime, received ${snowMaxLifetimeSimulationSeconds}`
      );
    }
    const snowMaxLifetimeSeconds = snowMaxLifetimeSimulationSeconds / snowSimulationSpeed;

    this._camera = camera;
    this._surface = surface;
    this._waterSurface = waterSurface;
    this._root = parent.createChild("Terrain Precipitation");
    this._rainEntity = this._root.createChild("Rain Volume");
    this._impactRainEntity = this._root.createChild("Terrain Collision Rain");
    this._splashRingEntity = this._root.createChild("Terrain Puddle Splash Rings");
    this._dropletEntity = this._root.createChild("Rain Ground Droplets");
    this._snowEntity = snowEntity;
    this._snowRenderer = snowRenderer;
    this._snowParticlesPerSecond = snowParticlesPerSecond;
    this._snowSimulationSpeed = snowSimulationSpeed;
    this._snowMaxLifetimeSeconds = snowMaxLifetimeSeconds;
    camera.entity.addChild(this._snowEntity);
    this._snowEntity.transform.setPosition(0, 0, 0);
    this._updateSnowViewportSize();

    this._rainCarrierTexture = rainCarrierTexture;
    this._rainMaterial = createParticleMaterial(
      engine,
      this._rainCarrierTexture,
      new Color(0.9, 0.96, 1, 0.6),
      "overlay"
    );
    this._splashRingMaterial = createParticleMaterial(engine, this._rainCarrierTexture, new Color(0.86, 0.94, 1, 0.72));
    this._dropletMaterial = createParticleMaterial(engine, this._rainCarrierTexture, new Color(0.55, 0.82, 1, 0.95));

    const rainShape = createRainVolumeShapeFromSnow(snowShape);
    this._rainVolumeForwardOffset = rainShape.size.z * 0.5 - RAIN_VOLUME_REAR_MARGIN;
    this._rainRenderer = this._createRainRenderer(rainShape);
    const rainMain = this._rainRenderer.generator.main;
    const rainSimulationSpeed = rainMain.simulationSpeed;
    if (!Number.isFinite(rainSimulationSpeed) || rainSimulationSpeed <= 0) {
      throw new Error(`Terrain rain requires a positive simulation speed, received ${rainSimulationSpeed}`);
    }
    const rainLifetime = rainMain.startLifetime;
    if (rainLifetime.mode !== ParticleCurveMode.Constant && rainLifetime.mode !== ParticleCurveMode.TwoConstants) {
      throw new Error(`Terrain rain requires a constant particle lifetime, received mode ${rainLifetime.mode}`);
    }
    const rainMaxLifetimeSimulationSeconds = Math.max(rainLifetime.constantMin, rainLifetime.constantMax);
    if (!Number.isFinite(rainMaxLifetimeSimulationSeconds) || rainMaxLifetimeSimulationSeconds <= 0) {
      throw new Error(
        `Terrain rain requires a positive particle lifetime, received ${rainMaxLifetimeSimulationSeconds}`
      );
    }
    this._rainSimulationSpeed = rainSimulationSpeed;
    this._rainMaxLifetimeSeconds = rainMaxLifetimeSimulationSeconds / rainSimulationSpeed;
    const impactRain = this._createImpactRainRenderer();
    this._impactRainRenderer = impactRain.renderer;
    this._impactRainShape = impactRain.shape;
    this._splashRingRenderer = this._createSplashRingRenderer();
    this._dropletRenderer = this._createDropletRenderer();
    this._snowRenderer.generator.play(false);
  }

  /** Updates emission, per-particle air response, and the camera-relative rain/ground emitters. */
  update(
    deltaTime: number,
    rainRate: number,
    snowRate: number,
    puddleStorage: number,
    rainAirVelocityWS: readonly [number, number, number],
    snowWindVelocityWS: readonly [number, number, number],
    rainTurbulence: number,
    snowTurbulence: number
  ): void {
    this._assertAlive();
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Terrain precipitation delta time must be finite and non-negative");
    }
    this._elapsed += deltaTime;
    const nextRainRate = clamp01(rainRate);
    const nextSnowRate = clamp01(snowRate);
    const rainGenerator = this._rainRenderer.generator;
    const snowGenerator = this._snowRenderer.generator;
    if (nextRainRate !== this._rainRate) {
      this._rainRate = nextRainRate;
      rainGenerator.emission.rateOverTime.constant =
        this._rainRate * (RAIN_PARTICLES_PER_SECOND - RAIN_IMPACTS_PER_SECOND);
    }
    if (nextSnowRate !== this._snowRate) {
      this._snowRate = nextSnowRate;
      snowGenerator.emission.rateOverTime.constant = this._snowRate * this._snowParticlesPerSecond;
    }
    this._setRainEmissionActive(this._rainRate > 0);
    this._setSnowEmissionActive(this._snowRate > 0);
    this._terrainImpactClimate.puddleStorage = clamp01(puddleStorage);
    if (this._rainEmissionActive) this._rainWindReleaseTime = this._elapsed + this._rainMaxLifetimeSeconds;
    if (this._snowEmissionActive) this._snowWindReleaseTime = this._elapsed + this._snowMaxLifetimeSeconds;
    const rainConsumesWind = this._elapsed <= this._rainWindReleaseTime;
    const snowConsumesWind = this._elapsed <= this._snowWindReleaseTime;
    this._rainWindActive = rainConsumesWind;
    this._snowWindActive = snowConsumesWind;
    this._setParticleWindEnabled(
      rainGenerator,
      rainConsumesWind,
      this._rainTargetVelocityWS,
      this._rainEmitterOffsetWS
    );
    this._setParticleWindEnabled(
      snowGenerator,
      snowConsumesWind,
      this._snowTargetVelocityWS,
      this._snowEmitterOffsetWS
    );
    if (this._pendingRainImpactCount > 0) this._advancePendingRainImpacts(deltaTime);
    this._suspendDrainedParticleEntities();
    if (!this._rainEmissionActive && !this._snowEmissionActive && !rainConsumesWind && !snowConsumesWind) return;

    if (rainConsumesWind || snowConsumesWind) {
      const cameraPosition = this._camera.entity.transform.worldPosition;
      if (rainConsumesWind) this._updateRainWindConsumer(cameraPosition, rainAirVelocityWS, rainTurbulence);
      if (snowConsumesWind) this._updateSnowWindConsumer(cameraPosition, snowWindVelocityWS, snowTurbulence);
    }
    if (this._rainEmissionActive) {
      // Terrain puddles and Water surfaces own separate impact budgets. A nearby lake must not consume
      // the only per-frame response and starve visible Terrain puddles of their splash rings.
      this._scheduleRainImpacts(deltaTime);
      this._scheduleWaterRainImpacts(deltaTime);
    }
  }

  /** Returns detached emission values for browser diagnostics. */
  getSnapshot(): TerrainPrecipitationVfxSnapshot {
    this._assertAlive();
    const waterEmission = this._waterSurface
      ? resolveTerrainWaterRainImpactEmission(this._rainRate, this._waterEmission)
      : this._waterEmission;
    return {
      rainRate: this._rainRate,
      snowRate: this._snowRate,
      rainParticlesPerSecond: this._rainRate * RAIN_PARTICLES_PER_SECOND + waterEmission.impactsPerSecond,
      splashParticlesPerSecond:
        this._rainRate * RAIN_IMPACTS_PER_SECOND * (RAIN_DROPLETS_PER_IMPACT + RAIN_SPLASH_RINGS_PER_IMPACT) +
        waterEmission.splashParticlesPerSecond,
      rainImpactCount: this._rainImpactCount,
      waterSplashParticlesPerSecond: waterEmission.splashParticlesPerSecond,
      waterRainImpactCount: this._waterRainImpactCount,
      waterSurfaceQueryCount: this._waterSurfaceQueryCount,
      snowParticlesPerSecond: this._snowRate * this._snowParticlesPerSecond,
      rainWindActive: this._rainWindActive,
      snowWindActive: this._snowWindActive,
      rainTargetVelocityWS: [...this._rainTargetVelocityWS],
      rainEmitterOffsetWS: [...this._rainEmitterOffsetWS],
      snowTargetVelocityWS: [...this._snowTargetVelocityWS],
      snowEmitterOffsetWS: [...this._snowEmitterOffsetWS]
    };
  }

  /** Releases the runtime particle instances and the rain-owned materials and textures. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._snowEntity.destroy();
    this._root.destroy();
    for (const material of [this._rainMaterial, this._splashRingMaterial, this._dropletMaterial]) {
      material.baseTexture = null!;
      material.destroy(true);
    }
    this._rainCarrierTexture.destroy(true);
  }

  private _createRainRenderer(rainShape: BoxShape): ParticleRenderer {
    const renderer = this._rainEntity.addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.StretchBillboard;
    renderer.lengthScale = 0.14;
    renderer.velocityScale = 0.006;
    renderer.priority = PRECIPITATION_OVERLAY_PRIORITY;
    renderer.setMaterial(this._rainMaterial);
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.randomSeed = 0x5241494e;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = true;
    main.maxParticles = 720;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startLifetime.mode = ParticleCurveMode.TwoConstants;
    main.startLifetime.constantMin = 0.48;
    main.startLifetime.constantMax = 0.7;
    main.startSpeed.mode = ParticleCurveMode.Constant;
    main.startSpeed.constant = 0;
    main.startSize3D = true;
    main.startSizeX.mode = ParticleCurveMode.TwoConstants;
    main.startSizeX.constantMin = 0.04;
    main.startSizeX.constantMax = 0.065;
    main.startSizeY.mode = ParticleCurveMode.TwoConstants;
    main.startSizeY.constantMin = 0.7;
    main.startSizeY.constantMax = 1.4;
    main.startSizeZ.constant = 1;
    generator.emission.shape = rainShape;
    generator.emission.rateOverTime.constant = 0;
    generator.velocityOverLifetime.enabled = true;
    generator.velocityOverLifetime.space = ParticleSimulationSpace.World;
    generator.velocityOverLifetime.velocityY.mode = ParticleCurveMode.TwoConstants;
    generator.velocityOverLifetime.velocityY.constantMin = -72;
    generator.velocityOverLifetime.velocityY.constantMax = -50;
    generator.forceOverLifetime.enabled = false;
    const rainWind = generator.windOverLifetime;
    rainWind.responseTime = RAIN_WIND_RESPONSE_TIME_SECONDS * main.simulationSpeed;
    rainWind.influence.set(1, 0, 1);
    rainWind.enabled = false;
    configureAtlas(generator.textureSheetAnimation, 2, 1);
    applyFade(generator.colorOverLifetime, new Color(0.9, 0.95, 1), 0.5, 0.06);
    generator.play(false);
    return renderer;
  }

  private _createImpactRainRenderer(): { readonly renderer: ParticleRenderer; readonly shape: BoxShape } {
    const renderer = this._impactRainEntity.addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.StretchBillboard;
    renderer.lengthScale = 0.14;
    renderer.velocityScale = 0.006;
    renderer.priority = PRECIPITATION_OVERLAY_PRIORITY;
    renderer.setMaterial(this._rainMaterial);
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.randomSeed = 0x48495452;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = true;
    main.maxParticles = RAIN_IMPACT_CAPACITY;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startLifetime.mode = ParticleCurveMode.Constant;
    main.startLifetime.constant = RAIN_IMPACT_FLIGHT_TIME + 0.02;
    main.startSpeed.mode = ParticleCurveMode.Constant;
    main.startSpeed.constant = 0;
    main.startSize3D = true;
    main.startSizeX.mode = ParticleCurveMode.TwoConstants;
    main.startSizeX.constantMin = 0.03;
    main.startSizeX.constantMax = 0.05;
    main.startSizeY.mode = ParticleCurveMode.TwoConstants;
    main.startSizeY.constantMin = 0.55;
    main.startSizeY.constantMax = 0.9;
    main.startSizeZ.constant = 1;
    const shape = new BoxShape();
    shape.size = new Vector3(0, 0, 0);
    generator.emission.shape = shape;
    generator.emission.rateOverTime.constant = 0;
    configureAtlas(generator.textureSheetAnimation, 2, 1);
    applyFade(generator.colorOverLifetime, new Color(0.9, 0.95, 1), 0.62, 0.04);
    generator.play(false);
    return { renderer, shape };
  }

  private _createDropletRenderer(): ParticleRenderer {
    const renderer = this._dropletEntity.addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.StretchBillboard;
    renderer.lengthScale = 0.35;
    renderer.velocityScale = 0.0275;
    renderer.priority = PRECIPITATION_OVERLAY_PRIORITY + 2;
    renderer.setMaterial(this._dropletMaterial);
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.randomSeed = 0x44524f50;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = true;
    main.maxParticles = 320;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startLifetime.mode = ParticleCurveMode.TwoConstants;
    main.startLifetime.constantMin = 0.38;
    main.startLifetime.constantMax = 0.55;
    main.startSpeed.mode = ParticleCurveMode.TwoConstants;
    main.startSpeed.constantMin = 1.5;
    main.startSpeed.constantMax = 2.8;
    main.startSize.mode = ParticleCurveMode.TwoConstants;
    main.startSize.constantMin = 0.012;
    main.startSize.constantMax = 0.024;
    main.startColor = new ParticleCompositeGradient(new Color(1, 1, 1, RAIN_DROPLET_START_ALPHA));
    main.gravityModifier.constant = 0.65;
    const shape = new ConeShape();
    shape.angle = 32;
    shape.radius = 0.003;
    shape.randomDirectionAmount = 0.12;
    shape.rotation = new Vector3(90, 0, 0);
    generator.emission.shape = shape;
    generator.emission.rateOverTime.constant = 0;
    generator.sizeOverLifetime.enabled = true;
    generator.sizeOverLifetime.size = particleCurve([
      [0, 1],
      [1, 0]
    ]);
    configureAtlas(generator.textureSheetAnimation, 2, 1);
    applyDropletFade(generator.colorOverLifetime, new Color(0.9, 0.97, 1));
    generator.play(false);
    return renderer;
  }

  private _createSplashRingRenderer(): ParticleRenderer {
    const renderer = this._splashRingEntity.addComponent(ParticleRenderer);
    renderer.renderMode = ParticleRenderMode.HorizontalBillboard;
    renderer.priority = PRECIPITATION_OVERLAY_PRIORITY + 1;
    renderer.setMaterial(this._splashRingMaterial);
    const generator = renderer.generator;
    generator.useAutoRandomSeed = false;
    generator.randomSeed = 0x52494e47;
    const main = generator.main;
    main.playOnEnabled = false;
    main.isLoop = true;
    main.maxParticles = 160;
    main.simulationSpace = ParticleSimulationSpace.World;
    main.startLifetime.mode = ParticleCurveMode.TwoConstants;
    main.startLifetime.constantMin = 0.3;
    main.startLifetime.constantMax = 0.5;
    main.startSpeed.mode = ParticleCurveMode.Constant;
    main.startSpeed.constant = 0;
    main.startSize.mode = ParticleCurveMode.TwoConstants;
    main.startSize.constantMin = RAIN_SPLASH_RING_REFERENCE_SIZE;
    main.startSize.constantMax = RAIN_SPLASH_RING_REFERENCE_SIZE * 2;
    const shape = new BoxShape();
    shape.size = new Vector3(0, 0, 0);
    generator.emission.shape = shape;
    generator.emission.rateOverTime.constant = 0;
    generator.sizeOverLifetime.enabled = true;
    generator.sizeOverLifetime.size = particleCurve([
      [0, 0],
      [0.2, 0.72],
      [0.62, 0.93],
      [1, 1]
    ]);
    configureAtlas(generator.textureSheetAnimation, 2, 1);
    applyFade(generator.colorOverLifetime, new Color(0.9, 0.97, 1), 0.72, 0.1);
    generator.play(false);
    return renderer;
  }

  private _scheduleRainImpacts(deltaTime: number): void {
    if (this._pendingRainImpactCount >= RAIN_IMPACT_CAPACITY) return;
    if (!this._shouldScheduleRainResponse(this._rainRate * RAIN_IMPACTS_PER_SECOND, deltaTime)) {
      return;
    }
    for (let attempt = 0; attempt < RAIN_RESPONSE_SEARCH_ATTEMPTS; attempt++) {
      if (this._tryQueueVisibleTerrainImpact()) return;
    }
  }

  private _scheduleWaterRainImpacts(deltaTime: number): void {
    if (!this._waterSurface || this._rainRate <= 0 || this._pendingRainImpactCount >= RAIN_IMPACT_CAPACITY) {
      return;
    }
    const policy = TERRAIN_WATER_RAIN_IMPACT_POLICY;
    const emission = resolveTerrainWaterRainImpactEmission(this._rainRate, this._waterEmission);
    if (emission.impactsPerSecond <= 0) return;
    const cameraPosition = this._camera.entity.transform.worldPosition;
    if (
      distanceToTerrainWaterRainImpactBounds(cameraPosition, this._waterSurface.getBounds()) >= policy.maximumDistance
    ) {
      return;
    }
    if (!this._shouldScheduleRainResponse(emission.impactsPerSecond, deltaTime)) return;
    for (let attempt = 0; attempt < policy.searchAttempts; attempt++) {
      const candidateDistance = sampleTerrainWaterRainImpactDistance(this._nextRainResponseRandom());
      if (candidateDistance >= policy.maximumDistance) continue;
      this._impactViewportPoint.set(
        0.06 + this._nextRainResponseRandom() * 0.88,
        0.58 + this._nextRainResponseRandom() * 0.38
      );
      const ray = this._camera.viewportPointToRay(this._impactViewportPoint, this._impactRay);
      ray.getPoint(candidateDistance, this._impactRayPoint);
      this._waterSurfaceQueryCount++;
      if (!this._waterSurface.sampleSurface(this._impactRayPoint, this._waterSurfaceSample)) continue;

      const surfacePosition = this._waterSurfaceSample.surfacePosition;
      const actualDistance = Math.hypot(
        surfacePosition.x - cameraPosition.x,
        surfacePosition.y - cameraPosition.y,
        surfacePosition.z - cameraPosition.z
      );
      const visibility = resolveTerrainWaterRainImpactVisibility(actualDistance);
      if (visibility <= 0 || this._nextRainResponseRandom() > visibility) continue;
      const viewportPoint = this._camera.worldToViewportPoint(surfacePosition, this._waterImpactViewportPoint);
      if (
        viewportPoint.z <= 0 ||
        viewportPoint.x < 0.04 ||
        viewportPoint.x > 0.96 ||
        viewportPoint.y < 0.42 ||
        viewportPoint.y > 0.98
      ) {
        continue;
      }
      const normal = this._waterSurfaceSample.surfaceNormal;
      this._queueRainImpact(
        "water",
        surfacePosition.x,
        surfacePosition.z,
        surfacePosition.y,
        normal.x,
        normal.y,
        normal.z,
        emission.dropletsPerImpact
      );
      break;
    }
  }

  private _queueRainImpact(
    kind: PendingRainImpact["kind"],
    worldX: number,
    worldZ: number,
    height: number,
    normalX: number,
    normalY: number,
    normalZ: number,
    dropletsPerImpact = RAIN_DROPLETS_PER_IMPACT
  ): void {
    const pendingIndex = this._pendingRainImpactCount;
    if (pendingIndex >= RAIN_IMPACT_CAPACITY) return;
    const pending = this._pendingRainImpacts[pendingIndex];
    const launchTarget = this._impactLaunchTargetWS;
    launchTarget[0] = worldX;
    launchTarget[1] = height;
    launchTarget[2] = worldZ;
    const launch = resolveRainImpactLaunchTrajectory(
      launchTarget,
      this._rainTargetVelocityWS,
      RAIN_WIND_RESPONSE_TIME_SECONDS,
      RAIN_IMPACT_FALL_HEIGHT,
      RAIN_IMPACT_FALL_SPEED,
      this._impactLaunchState
    );
    const [spawnX, spawnY, spawnZ] = launch.spawnPositionWS;
    this._impactRainEntity.transform.setPosition(spawnX, spawnY, spawnZ);
    const launchEuler = negativeZDirectionEulerDegrees(launch.directionWS, this._impactLaunchEulerDegrees);
    this._impactRainShape.rotation.set(launchEuler[0], launchEuler[1], launchEuler[2]);
    this._impactRainRenderer.generator.main.startSpeed.constant = launch.speedMps;
    this._impactRainRenderer.generator.emit(1);
    pending.impactSimulationTime = this._impactRainRenderer.generator.simulationTime + RAIN_IMPACT_FLIGHT_TIME;
    pending.kind = kind;
    pending.dropletsPerImpact = dropletsPerImpact;
    pending.worldX = worldX;
    pending.worldZ = worldZ;
    pending.height = height;
    pending.normalX = normalX;
    pending.normalY = normalY;
    pending.normalZ = normalZ;
    this._pendingRainImpactCount = pendingIndex + 1;
  }

  private _tryQueueVisibleTerrainImpact(): boolean {
    this._impactViewportPoint.set(
      0.06 + this._nextRainResponseRandom() * 0.88,
      0.62 + this._nextRainResponseRandom() * 0.34
    );
    const ray = this._camera.viewportPointToRay(this._impactViewportPoint, this._impactRay);
    let previousDistance = RAIN_IMPACT_RAY_MIN_DISTANCE;
    let previousDifference: number | undefined;
    for (
      let distance = RAIN_IMPACT_RAY_MIN_DISTANCE;
      distance <= RAIN_IMPACT_RAY_MAX_DISTANCE;
      distance += RAIN_IMPACT_RAY_STEP
    ) {
      const point = ray.getPoint(distance, this._impactRayPoint);
      const terrainHeight = this._surface.sampleHeightInterpolated(point.x, point.z);
      if (terrainHeight === undefined) {
        previousDifference = undefined;
        previousDistance = distance;
        continue;
      }
      const difference = point.y - terrainHeight;
      if (difference <= 0 && previousDifference !== undefined && previousDifference > 0) {
        let lowerDistance = previousDistance;
        let upperDistance = distance;
        for (let refinement = 0; refinement < RAIN_IMPACT_RAY_REFINEMENT_STEPS; refinement++) {
          const midpoint = (lowerDistance + upperDistance) * 0.5;
          const midpointPoint = ray.getPoint(midpoint, this._impactRayPoint);
          const midpointHeight = this._surface.sampleHeightInterpolated(midpointPoint.x, midpointPoint.z);
          if (midpointHeight !== undefined && midpointPoint.y > midpointHeight) {
            lowerDistance = midpoint;
          } else {
            upperDistance = midpoint;
          }
        }
        const impactPoint = ray.getPoint(upperDistance, this._impactRayPoint);
        const contact = this._terrainImpactSample;
        if (this._surface.sampleRainImpact(impactPoint.x, impactPoint.z, this._terrainImpactClimate, contact)) {
          const splashAcceptance = resolveTerrainPuddleSplashAcceptance(contact.puddleMask);
          if (this._nextRainResponseRandom() <= splashAcceptance) {
            this._queueRainImpact(
              "terrain",
              impactPoint.x,
              impactPoint.z,
              contact.height,
              contact.normal[0],
              contact.normal[1],
              contact.normal[2]
            );
            return true;
          }
        }
      }
      previousDifference = difference;
      previousDistance = distance;
    }
    return false;
  }

  private _advancePendingRainImpacts(deltaTime: number): void {
    const impactGenerator = this._impactRainRenderer.generator;
    const deltaSimulationTime = deltaTime * impactGenerator.main.simulationSpeed;
    const currentSimulationTime = impactGenerator.simulationTime;
    const impacts = this._pendingRainImpacts;
    let index = 0;
    while (index < this._pendingRainImpactCount) {
      const impact = impacts[index];
      if (
        !willParticleSimulationStepReachTime(currentSimulationTime, deltaSimulationTime, impact.impactSimulationTime)
      ) {
        index++;
        continue;
      }
      const { normalX, normalY, normalZ } = impact;
      this._dropletEntity.transform.setPosition(
        impact.worldX + normalX * RAIN_DROPLET_HEIGHT_OFFSET,
        impact.height + normalY * RAIN_DROPLET_HEIGHT_OFFSET,
        impact.worldZ + normalZ * RAIN_DROPLET_HEIGHT_OFFSET
      );
      alignEntityUpToSurface(this._dropletEntity, normalX, normalY, normalZ);
      if (impact.kind === "water") {
        this._dropletRenderer.generator.emit(impact.dropletsPerImpact);
        this._waterRainImpactCount++;
      } else {
        this._splashRingEntity.transform.setPosition(
          impact.worldX,
          impact.height + RAIN_SPLASH_RING_HEIGHT_OFFSET,
          impact.worldZ
        );
        this._splashRingRenderer.generator.emit(RAIN_SPLASH_RINGS_PER_IMPACT);
        this._dropletRenderer.generator.emit(RAIN_DROPLETS_PER_IMPACT);
        this._rainImpactCount++;
      }
      const lastIndex = --this._pendingRainImpactCount;
      if (index !== lastIndex) {
        impacts[index] = impacts[lastIndex];
        impacts[lastIndex] = impact;
      }
    }
  }

  private _setRainEmissionActive(active: boolean): void {
    if (active === this._rainEmissionActive) return;
    this._rainEmissionActive = active;
    if (active) {
      this._root.isActive = true;
      this._rainRenderer.generator.play(false);
      this._impactRainRenderer.generator.play(false);
      this._splashRingRenderer.generator.play(false);
      this._dropletRenderer.generator.play(false);
    } else {
      this._rainRenderer.generator.stop(false);
      this._impactRainRenderer.generator.stop(false);
      this._splashRingRenderer.generator.stop(false);
      this._dropletRenderer.generator.stop(false);
    }
  }

  private _setSnowEmissionActive(active: boolean): void {
    if (active === this._snowEmissionActive) return;
    this._snowEmissionActive = active;
    if (active) {
      this._snowEntity.isActive = true;
      this._snowRenderer.generator.play(false);
    } else {
      this._snowRenderer.generator.stop(false);
    }
  }

  private _suspendDrainedParticleEntities(): void {
    if (
      !this._rainEmissionActive &&
      this._root.isActive &&
      this._pendingRainImpactCount === 0 &&
      !this._rainRenderer.generator.isAlive &&
      !this._impactRainRenderer.generator.isAlive &&
      !this._splashRingRenderer.generator.isAlive &&
      !this._dropletRenderer.generator.isAlive
    ) {
      this._root.isActive = false;
    }
    if (!this._snowEmissionActive && this._snowEntity.isActive && !this._snowRenderer.generator.isAlive) {
      this._snowEntity.isActive = false;
    }
  }

  private _nextRainResponseRandom(): number {
    this._rainResponseRandomState = (Math.imul(this._rainResponseRandomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this._rainResponseRandomState / 0x1_0000_0000;
  }

  private _updateSnowViewportSize(): void {
    const { width, height } = this._camera.pixelViewport;
    const viewportSize = this._snowViewportSize;
    if (viewportSize.x === width && viewportSize.y === height) return;
    viewportSize.set(width, height);
    this._camera.shaderData.setVector2("camera_ViewportSize", viewportSize);
  }

  private _updateRainWindConsumer(
    cameraPosition: Vector3,
    rainAirVelocityWS: readonly [number, number, number],
    rainTurbulence: number
  ): void {
    const cameraForward = this._camera.entity.transform.worldForward;
    const horizontalForwardLength = Math.hypot(cameraForward.x, cameraForward.z);
    const rainOffsetScale =
      horizontalForwardLength > 1e-4 ? this._rainVolumeForwardOffset / horizontalForwardLength : 0;
    const crossGust = Math.sin(this._elapsed * 0.37) * clamp01(rainTurbulence) * 0.18;
    const windInput = this._rainWindInputWS;
    windInput[0] = rainAirVelocityWS[0] - rainAirVelocityWS[2] * crossGust;
    windInput[1] = 0;
    windInput[2] = rainAirVelocityWS[2] + rainAirVelocityWS[0] * crossGust;
    const targetVelocity = resolveHorizontalPrecipitationWindVelocity(windInput, this._rainTargetVelocityWS);
    const simulationTargetVelocity = resolveParticleSimulationWindVelocity(
      targetVelocity,
      this._rainSimulationSpeed,
      this._rainParticleSimulationTargetVelocityWS
    );
    this._rainRenderer.generator.windOverLifetime.targetVelocity.set(
      simulationTargetVelocity[0],
      simulationTargetVelocity[1],
      simulationTargetVelocity[2]
    );
    const emitterOffset = resolveWindRelaxedEmitterOffset(
      targetVelocity,
      RAIN_WIND_RESPONSE_TIME_SECONDS,
      this._rainMaxLifetimeSeconds,
      this._rainEmitterOffsetWS
    );
    this._rainEntity.transform.setPosition(
      cameraPosition.x + cameraForward.x * rainOffsetScale + emitterOffset[0],
      cameraPosition.y + 20 + emitterOffset[1],
      cameraPosition.z + cameraForward.z * rainOffsetScale + emitterOffset[2]
    );
    if (horizontalForwardLength > 1e-4) {
      this._rainEntity.transform.setRotation(0, (Math.atan2(-cameraForward.x, -cameraForward.z) * 180) / Math.PI, 0);
    }
  }

  private _updateSnowWindConsumer(
    cameraPosition: Vector3,
    snowWindVelocityWS: readonly [number, number, number],
    snowTurbulence: number
  ): void {
    this._updateSnowViewportSize();
    const crossGust = Math.sin(this._elapsed * 0.23 + 1.7) * clamp01(snowTurbulence) * 0.28;
    const windInput = this._snowWindInputWS;
    windInput[0] = snowWindVelocityWS[0] - snowWindVelocityWS[2] * crossGust;
    windInput[1] = 0;
    windInput[2] = snowWindVelocityWS[2] + snowWindVelocityWS[0] * crossGust;
    const targetVelocity = resolveHorizontalPrecipitationWindVelocity(windInput, this._snowTargetVelocityWS);
    const simulationTargetVelocity = resolveParticleSimulationWindVelocity(
      targetVelocity,
      this._snowSimulationSpeed,
      this._snowParticleSimulationTargetVelocityWS
    );
    const snowWind = this._snowRenderer.generator.windOverLifetime;
    snowWind.targetVelocity.set(simulationTargetVelocity[0], simulationTargetVelocity[1], simulationTargetVelocity[2]);
    const traversalSeconds = resolveCameraLocalPrecipitationTraversalTime(
      targetVelocity,
      SNOW_WIND_RESPONSE_TIME_SECONDS,
      this._snowMaxLifetimeSeconds,
      SNOW_MAX_HORIZONTAL_TRAVEL_METERS
    );
    const wrapCenter = snowWind.wrapCenter;
    if (wrapCenter.x !== cameraPosition.x || wrapCenter.y !== cameraPosition.y || wrapCenter.z !== cameraPosition.z) {
      wrapCenter.set(cameraPosition.x, cameraPosition.y, cameraPosition.z);
    }
    const emitterOffset = resolveWindRelaxedEmitterOffset(
      targetVelocity,
      SNOW_WIND_RESPONSE_TIME_SECONDS,
      traversalSeconds,
      this._snowEmitterOffsetWS
    );
    this._snowEntity.transform.setWorldPosition(
      cameraPosition.x + emitterOffset[0],
      cameraPosition.y + emitterOffset[1],
      cameraPosition.z + emitterOffset[2]
    );
  }

  private _setParticleWindEnabled(
    generator: ParticleRenderer["generator"],
    enabled: boolean,
    targetVelocityWS: PrecipitationVector3Tuple,
    emitterOffsetWS: PrecipitationVector3Tuple
  ): void {
    const wind = generator.windOverLifetime;
    if (wind.enabled !== enabled) wind.enabled = enabled;
    if (enabled) return;
    targetVelocityWS[0] = targetVelocityWS[1] = targetVelocityWS[2] = 0;
    emitterOffsetWS[0] = emitterOffsetWS[1] = emitterOffsetWS[2] = 0;
  }

  private _nextRainCadenceRandom(): number {
    this._rainCadenceRandomState = (Math.imul(this._rainCadenceRandomState, 1_664_525) + 1_013_904_223) >>> 0;
    return this._rainCadenceRandomState / 0x1_0000_0000;
  }

  private _shouldScheduleRainResponse(impactsPerSecond: number, deltaTime: number): boolean {
    if (impactsPerSecond <= 0 || deltaTime <= 0) return false;
    const probability = 1 - Math.exp(-impactsPerSecond * deltaTime);
    return this._nextRainCadenceRandom() < probability;
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Terrain precipitation VFX has been destroyed");
  }
}

function createRainVolumeShapeFromSnow(reference: HemisphereShape): BoxShape {
  const shape = new BoxShape();
  const referenceDiameter = reference.radius * 2;
  shape.enabled = reference.enabled;
  shape.size = new Vector3(referenceDiameter, 0, referenceDiameter * RAIN_VOLUME_DEPTH_SCALE);
  shape.position.copyFrom(reference.position);
  return shape;
}

function createPendingRainImpact(): PendingRainImpact {
  return {
    impactSimulationTime: 0,
    kind: "terrain",
    dropletsPerImpact: 0,
    worldX: 0,
    worldZ: 0,
    height: 0,
    normalX: 0,
    normalY: 1,
    normalZ: 0
  };
}

function createPendingRainImpacts(): PendingRainImpact[] {
  const impacts = new Array<PendingRainImpact>(RAIN_IMPACT_CAPACITY);
  for (let index = 0; index < impacts.length; index++) impacts[index] = createPendingRainImpact();
  return impacts;
}

function alignEntityUpToSurface(entity: Entity, normalX: number, normalY: number, normalZ: number): void {
  const quaternionX = normalZ;
  const quaternionY = 0;
  const quaternionZ = -normalX;
  const quaternionW = 1 + normalY;
  const inverseLength = 1 / Math.hypot(quaternionX, quaternionY, quaternionZ, quaternionW);
  entity.transform.setRotationQuaternion(
    quaternionX * inverseLength,
    quaternionY,
    quaternionZ * inverseLength,
    quaternionW * inverseLength
  );
}

async function loadSnowPrefab(engine: Engine): Promise<PrefabResource> {
  engine.resourceManager.registerVirtualResources([
    {
      virtualPath: SNOW_PREFAB_VIRTUAL_PATH,
      path: SNOW_PREFAB_URL.href,
      type: AssetType.Prefab
    },
    {
      virtualPath: SNOW_MATERIAL_VIRTUAL_PATH,
      path: SNOW_MATERIAL_URL.href,
      type: AssetType.Material
    },
    {
      virtualPath: SNOW_SHADER_VIRTUAL_PATH,
      path: SNOW_SHADER_URL.href,
      type: AssetType.Shader
    },
    {
      virtualPath: SNOW_TEXTURE_VIRTUAL_PATH,
      path: SNOW_TEXTURE_URL.href,
      type: AssetType.KTX2
    }
  ]);
  const snowTexture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.KTX2,
    url: SNOW_TEXTURE_VIRTUAL_PATH
  });
  if (!(snowTexture instanceof Texture2D)) {
    throw new Error(`Terrain snow opacity asset did not resolve to Texture2D: ${SNOW_TEXTURE_VIRTUAL_PATH}`);
  }
  snowTexture.filterMode = TextureFilterMode.Bilinear;
  snowTexture.wrapModeU = TextureWrapMode.Repeat;
  snowTexture.wrapModeV = TextureWrapMode.Repeat;
  snowTexture.anisoLevel = 1;
  const prefab = await engine.resourceManager.load<PrefabResource>({
    type: AssetType.Prefab,
    url: SNOW_PREFAB_VIRTUAL_PATH
  });
  if (!(prefab instanceof PrefabResource)) {
    throw new Error(`Terrain snow asset did not resolve to a PrefabResource: ${SNOW_PREFAB_VIRTUAL_PATH}`);
  }
  return prefab;
}

async function loadParticleAtlas(
  engine: Engine,
  url: URL,
  expectedWidth: number,
  expectedHeight: number
): Promise<Texture2D> {
  const texture = await engine.resourceManager.load<Texture2D>({
    type: AssetType.KTX2,
    url: url.href
  });
  if (!(texture instanceof Texture2D) || texture.width !== expectedWidth || texture.height !== expectedHeight) {
    throw new Error(
      `Terrain precipitation atlas failed its ${expectedWidth}x${expectedHeight} source contract: ${url.href}`
    );
  }
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.wrapModeU = TextureWrapMode.Clamp;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.anisoLevel = 1;
  return texture;
}

/** Register the production overlay before startup warmup, without loading atlases or creating emitters. */
export function registerTerrainPrecipitationShader(): Shader {
  return Shader.find(PARTICLE_OVERLAY_SHADER_NAME) ?? Shader.create(PARTICLE_OVERLAY_SHADER_SOURCE);
}

/** Shader-only startup dependency; atlas and prefab loading remain independent. */
export async function preloadTerrainPrecipitationShaders(engine: Engine): Promise<void> {
  registerTerrainPrecipitationShader();
  engine.resourceManager.registerVirtualResources([
    { virtualPath: SNOW_SHADER_VIRTUAL_PATH, path: SNOW_SHADER_URL.href, type: AssetType.Shader }
  ]);
  await engine.resourceManager.load({ type: AssetType.Shader, url: SNOW_SHADER_VIRTUAL_PATH });
}

function createParticleMaterial(
  engine: Engine,
  texture: Texture2D,
  color: Color,
  mode: "default" | "overlay" = "default"
): ParticleMaterial {
  const shader = mode === "overlay" ? registerTerrainPrecipitationShader() : undefined;
  const material = shader ? new ParticleMaterial(engine, shader) : new ParticleMaterial(engine);
  material.baseTexture = texture;
  material.baseColor = color;
  material.emissiveColor = new Color(color.r * 0.035, color.g * 0.035, color.b * 0.035, 1);
  material.blendMode = BlendMode.Normal;
  return material;
}

function configureAtlas(
  module: ParticleRenderer["generator"]["textureSheetAnimation"],
  columns: number,
  rows: number
): void {
  module.enabled = true;
  module.tiling = new Vector2(columns, rows);
  module.cycleCount = 1;
}

function particleCurve(keys: ReadonlyArray<readonly [number, number]>): ParticleCompositeCurve {
  return new ParticleCompositeCurve(new ParticleCurve(...keys.map(([time, value]) => new CurveKey(time, value))));
}

function applyFade(
  module: ParticleRenderer["generator"]["colorOverLifetime"],
  color: Color,
  peakAlpha: number,
  fadeInTime = 0.12
): void {
  module.enabled = true;
  module.color = new ParticleCompositeGradient(
    new ParticleGradient(
      [new GradientColorKey(0, color), new GradientColorKey(1, color)],
      [new GradientAlphaKey(0, 0), new GradientAlphaKey(fadeInTime, peakAlpha), new GradientAlphaKey(1, 0)]
    )
  );
}

function applyDropletFade(module: ParticleRenderer["generator"]["colorOverLifetime"], color: Color): void {
  module.enabled = true;
  module.color = new ParticleCompositeGradient(
    new ParticleGradient(
      [new GradientColorKey(0, color), new GradientColorKey(1, color)],
      [new GradientAlphaKey(0, 0), new GradientAlphaKey(0.1, 1), new GradientAlphaKey(1, 0)]
    )
  );
}

function clamp01(value: number): number {
  return Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 1);
}
