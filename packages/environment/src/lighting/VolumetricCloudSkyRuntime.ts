import {
  type Camera,
  type DayNightState,
  type DayNightStateConsumer,
  type Scene,
  SkyProceduralMaterial,
  Texture2D,
  Texture2DArray,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  VolumetricCloudShapeProfile,
  VolumetricCloudMaterial,
  VolumetricCloudWeatherMap,
  Vector3,
  VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE,
  VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE,
  VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE,
  VOLUMETRIC_CLOUD_DEFAULT_SCALE_SETTINGS,
  VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS,
  VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SETTINGS,
  VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE,
  VOLUMETRIC_CLOUD_SHAPE_PROFILE_HEIGHT,
  VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH,
  VOLUMETRIC_CLOUD_WEATHER_MAP_HEIGHT,
  VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH,
  buildVolumetricCloudNoiseAtlas,
  type VolumetricCloudPalette,
  type VolumetricCloudLightingProfile,
  type VolumetricCloudNoiseProfile,
  type VolumetricCloudQuality,
  type VolumetricCloudScaleSettings,
  type VolumetricCloudShapeSettings,
  type VolumetricCloudWeatherMapProfile,
  type VolumetricCloudWeatherSettings
} from "@galacean/engine";
import { loadVolumetricCloudNoiseAssets } from "./VolumetricCloudNoiseAssets";
import {
  VOLUMETRIC_CLOUD_DEFAULT_ENVIRONMENT_RESPONSE,
  VOLUMETRIC_CLOUD_NIGHT_PALETTE,
  VOLUMETRIC_CLOUD_TIMELINE_KEYS,
  VOLUMETRIC_CLOUD_TIMELINE_PRESETS,
  type VolumetricCloudEnvironmentResponseProfile,
  type VolumetricCloudTimelineId
} from "./VolumetricCloudSkyProfile";

type MutableColor = [number, number, number];
const HOURS_PER_DAY = 24;
const COLOR_NORMALIZATION_EPSILON = 1e-4;
const ZERO_WIND_OFFSET: readonly [number, number, number] = [0, 0, 0];
/** Renderer-relative full-Moon radiance compared with a unit daylight source. */
const FULL_MOON_CLOUD_RADIANCE_SCALE = 0.06;
type MutableCloudPalette = {
  -readonly [Key in keyof VolumetricCloudPalette]: VolumetricCloudPalette[Key] extends readonly [number, number, number]
    ? MutableColor
    : VolumetricCloudPalette[Key];
};

export interface VolumetricCloudSkyRuntimeOptions {
  readonly quality?: VolumetricCloudQuality;
  readonly scaleSettings?: Readonly<VolumetricCloudScaleSettings>;
  readonly shapeProfile?: Readonly<VolumetricCloudShapeSettings>;
  readonly lightingProfile?: Readonly<VolumetricCloudLightingProfile>;
  readonly noiseProfile?: Readonly<VolumetricCloudNoiseProfile>;
  readonly weatherMapProfile?: Readonly<VolumetricCloudWeatherMapProfile>;
  readonly weatherSeed?: number;
  readonly materialName?: string;
  readonly environmentResponseProfile?: Readonly<VolumetricCloudEnvironmentResponseProfile>;
}

export interface VolumetricCloudEnvironmentModifiers {
  readonly densityMultiplier?: number;
  readonly stormOffset?: number;
  readonly solarTintStrength?: number;
}

/** Procedural-atmosphere values sampled from the authoritative visible sky. */
interface VolumetricCloudAtmosphereState {
  readonly skyTint: readonly [number, number, number];
  readonly groundTint: readonly [number, number, number];
  readonly atmosphereThickness: number;
}

interface MutableVolumetricCloudAtmosphereState {
  readonly skyTint: MutableColor;
  readonly groundTint: MutableColor;
  atmosphereThickness: number;
}

interface VolumetricCloudAtmosphereAnchor {
  readonly source: VolumetricCloudAtmosphereState;
  readonly zenith: MutableColor;
  readonly horizon: MutableColor;
}

export interface VolumetricCloudSkyRuntimeSnapshot {
  readonly quality: VolumetricCloudQuality;
  readonly timelineWeather: VolumetricCloudTimelineId;
  readonly timelinePhase: number;
  readonly timelineTimeHours: number;
  readonly celestialDirectRadianceScale: number;
  readonly windSpeed: number;
  readonly windVelocityWS: readonly [number, number, number];
  readonly windOffsetWS: readonly [number, number, number];
  readonly settings: Readonly<VolumetricCloudWeatherSettings>;
  readonly scaleSettings: Readonly<VolumetricCloudScaleSettings>;
  readonly shapeProfile: Readonly<VolumetricCloudShapeSettings>;
  readonly lightingProfile: Readonly<VolumetricCloudLightingProfile>;
  readonly noiseProfile: Readonly<VolumetricCloudNoiseProfile>;
  readonly weatherMapProfile: Readonly<VolumetricCloudWeatherMapProfile>;
  readonly weatherSeed: number;
  readonly observerAltitude: number;
  readonly baseHeightAboveObserver: number;
}

/**
 * Shared Gallery integration for the engine volumetric-cloud system.
 *
 * It is the sole owner of cloud GPU resources, material installation, timeline
 * palette evaluation, direction-cache policy and resource lifetime. Demos only
 * provide their astronomical, weather, wind and physical-scale inputs.
 */
export class VolumetricCloudSkyRuntime implements DayNightStateConsumer {
  readonly material: VolumetricCloudMaterial;

  private readonly _camera: Camera;
  private readonly _skyMaterial: SkyProceduralMaterial;
  private readonly _weatherMap: Texture2D;
  private readonly _shapeProfileTexture: Texture2D;
  private readonly _baseNoise: Texture2D;
  private readonly _detailNoise: Texture2DArray;
  private readonly _curlNoise: Texture2D;
  private readonly _blueNoise: Texture2D;
  private _weatherField: VolumetricCloudWeatherMap;
  private readonly _settings: VolumetricCloudWeatherSettings = { ...VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SETTINGS };
  private readonly _basePalette = createMutablePalette(VOLUMETRIC_CLOUD_TIMELINE_PRESETS.clear.palette);
  private readonly _resolvedPalette = createMutablePalette(VOLUMETRIC_CLOUD_TIMELINE_PRESETS.clear.palette);
  private readonly _celestialPaletteWeights: MutableCelestialPaletteWeights = { day: 1, twilight: 0, night: 0 };
  private readonly _celestialLightDirection: MutableColor = [0, 1, 0];
  private _scaleSettings: VolumetricCloudScaleSettings;
  private _shapeSettings: VolumetricCloudShapeSettings;
  private readonly _environmentResponseProfile: Readonly<VolumetricCloudEnvironmentResponseProfile>;
  private _weatherSeed: number;
  private _quality: VolumetricCloudQuality;
  private _timelineWeather: VolumetricCloudTimelineId = "clear";
  private _timelinePhase = 0;
  private _timelineTimeHours = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.clear.time;
  private _celestialDirectRadianceScale = 1;
  private _windSpeed = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.clear.wind;
  private readonly _windVelocityWS = new Vector3(-0.9486832981, 0, -0.316227766);
  private readonly _windOffsetWS = new Vector3();
  private _observerAltitude = Number.NaN;
  private _elapsed = 0;
  private _frameTimeOverridden = false;
  private _densityMultiplier = 1;
  private _stormOffset = 0;
  private _solarTintStrength: number;
  private readonly _atmosphereState: MutableVolumetricCloudAtmosphereState = {
    skyTint: [0, 0, 0],
    groundTint: [0, 0, 0],
    atmosphereThickness: 0
  };
  private _atmosphereAnchor: VolumetricCloudAtmosphereAnchor | undefined;
  private _destroyed = false;

  static async create(
    scene: Scene,
    camera: Camera,
    options: VolumetricCloudSkyRuntimeOptions = {}
  ): Promise<VolumetricCloudSkyRuntime> {
    const sky = scene.background.sky;
    if (!sky.mesh) throw new Error("Volumetric clouds require an installed sky mesh");
    if (!(sky.material instanceof SkyProceduralMaterial)) {
      throw new Error("Volumetric clouds require an installed SkyProceduralMaterial");
    }
    const weather = createWeatherMap(
      scene,
      options.weatherSeed ?? 0,
      options.weatherMapProfile ?? VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE
    );
    const shapeProfile = createShapeProfile(scene);
    const noiseProfile = options.noiseProfile ?? VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE;
    const baseNoise = createBaseNoise(scene, noiseProfile);
    let noise: Awaited<ReturnType<typeof loadVolumetricCloudNoiseAssets>> | undefined;
    try {
      noise = await loadVolumetricCloudNoiseAssets(scene.engine);
      const material = new VolumetricCloudMaterial(scene.engine, {
        weatherMap: weather.texture,
        shapeProfile,
        baseNoise,
        noiseProfile,
        ...noise
      });
      return new VolumetricCloudSkyRuntime(
        scene,
        camera,
        material,
        weather.texture,
        weather.field,
        shapeProfile,
        baseNoise,
        noise,
        options
      );
    } catch (error) {
      noise?.detailNoise.destroy();
      noise?.curlNoise.destroy();
      noise?.blueNoise.destroy();
      baseNoise.destroy();
      shapeProfile.destroy();
      weather.texture.destroy();
      throw error;
    }
  }

  private constructor(
    scene: Scene,
    camera: Camera,
    material: VolumetricCloudMaterial,
    weatherMap: Texture2D,
    weatherField: VolumetricCloudWeatherMap,
    shapeProfileTexture: Texture2D,
    baseNoise: Texture2D,
    noise: Awaited<ReturnType<typeof loadVolumetricCloudNoiseAssets>>,
    options: VolumetricCloudSkyRuntimeOptions
  ) {
    const sky = scene.background.sky;
    this._camera = camera;
    this._skyMaterial = sky.material as SkyProceduralMaterial;
    this._weatherMap = weatherMap;
    this._weatherField = weatherField;
    this._shapeProfileTexture = shapeProfileTexture;
    this._baseNoise = baseNoise;
    this._detailNoise = noise.detailNoise;
    this._curlNoise = noise.curlNoise;
    this._blueNoise = noise.blueNoise;
    this.material = material;
    this._quality = options.quality ?? "balanced";
    this._scaleSettings = { ...(options.scaleSettings ?? VOLUMETRIC_CLOUD_DEFAULT_SCALE_SETTINGS) };
    this._shapeSettings = { ...(options.shapeProfile ?? VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS) };
    this._environmentResponseProfile = createEnvironmentResponseProfile(
      options.environmentResponseProfile ?? VOLUMETRIC_CLOUD_DEFAULT_ENVIRONMENT_RESPONSE
    );
    this._solarTintStrength = this._environmentResponseProfile.solarTintStrength;
    this._weatherSeed = options.weatherSeed ?? 0;
    this.setWindSpeed(this._windSpeed);
    material.name = options.materialName ?? "Shared Volumetric Cloud Sky";
    material.setScaleSettings(this._scaleSettings);
    material.setWeatherMapProfile(weatherField.profile);
    material.setShapeProfile(this._shapeSettings);
    material.setLightingProfile(options.lightingProfile ?? VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE);
    material.setWeatherSettings(this._settings);
    this.setObserverAltitude(camera.entity.transform.worldPosition.y);
    material.setQuality(this._quality);
    this._skyMaterial.volumetricClouds = material;
    this.setTimelinePhase(0);
  }

  get quality(): VolumetricCloudQuality {
    return this._quality;
  }

  get timelineWeather(): VolumetricCloudTimelineId {
    return this._timelineWeather;
  }

  get timelinePhase(): number {
    return this._timelinePhase;
  }

  get timelineTimeHours(): number {
    return this._timelineTimeHours;
  }

  get windSpeed(): number {
    return this._windSpeed;
  }

  /** Absolute world-space altitude used by P3 cloud-layer wind sampling. */
  get cloudBaseAltitude(): number {
    return this._scaleSettings.baseAltitude;
  }

  get settings(): Readonly<VolumetricCloudWeatherSettings> {
    return { ...this._settings };
  }

  get weatherField(): VolumetricCloudWeatherMap {
    this._assertAlive();
    return this._weatherField;
  }

  get weatherSeed(): number {
    return this._weatherSeed;
  }

  get shapeProfile(): Readonly<VolumetricCloudShapeSettings> {
    return { ...this._shapeSettings };
  }

  get lightingProfile(): Readonly<VolumetricCloudLightingProfile> {
    return this.material.lightingProfile;
  }

  setQuality(quality: VolumetricCloudQuality): void {
    this._assertAlive();
    this._quality = quality;
    this.material.setQuality(quality);
  }

  setScaleSettings(settings: Readonly<VolumetricCloudScaleSettings>): void {
    this._assertAlive();
    this._scaleSettings = { ...settings };
    this.material.setScaleSettings(settings);
  }

  setShapeProfile(profile: Readonly<VolumetricCloudShapeSettings>): void {
    this._assertAlive();
    this.material.setShapeProfile(profile);
    this._shapeSettings = { ...this.material.shapeProfile };
  }

  setLightingProfile(profile: Readonly<VolumetricCloudLightingProfile>): void {
    this._assertAlive();
    this.material.setLightingProfile(profile);
  }

  setWeatherSeed(seed: number): void {
    this._assertAlive();
    const field = new VolumetricCloudWeatherMap({ seed, profile: this._weatherField.profile });
    this._weatherMap.setPixelBuffer(field.packBasis());
    this._weatherField = field;
    this._weatherSeed = seed;
    this.material.invalidateHistory();
  }

  setObserverAltitude(altitude: number): void {
    this._assertAlive();
    if (altitude === this._observerAltitude) return;
    this.material.setObserverAltitude(altitude);
    this._observerAltitude = altitude;
  }

  setWeatherSettings(settings: Readonly<VolumetricCloudWeatherSettings>): void {
    this.setWeatherValues(settings.coverage, settings.cloudType, settings.detail);
  }

  /** Applies evaluated weather controls without constructing a transient settings object. */
  setWeatherValues(coverage: number, cloudType: number, detail: number): void {
    this._assertAlive();
    const current = this._settings;
    if (coverage === current.coverage && cloudType === current.cloudType && detail === current.detail) return;
    this.material.setWeatherValues(coverage, cloudType, detail);
    current.coverage = coverage;
    current.cloudType = cloudType;
    current.detail = detail;
  }

  setWindSpeed(speed: number): void {
    this._assertAlive();
    if (!Number.isFinite(speed) || speed < 0) throw new RangeError("Cloud wind speed must be finite and non-negative");
    const horizontalLength = Math.hypot(this._windVelocityWS.x, this._windVelocityWS.z);
    const inverseLength = horizontalLength > 1e-6 ? 1 / horizontalLength : 1;
    const directionX = horizontalLength > 1e-6 ? this._windVelocityWS.x * inverseLength : -0.9486832981;
    const directionZ = horizontalLength > 1e-6 ? this._windVelocityWS.z * inverseLength : -0.316227766;
    this._windVelocityWS.set(directionX * speed, 0, directionZ * speed);
    this._windSpeed = speed;
  }

  /**
   * Freezes cloud animation at an exact frame for deterministic capture.
   * Passing undefined resumes normal elapsed-time and wind integration.
   */
  setFrameTimeOverride(
    elapsedSeconds?: number,
    windOffsetWS: readonly [number, number, number] = ZERO_WIND_OFFSET
  ): void {
    this._assertAlive();
    if (elapsedSeconds === undefined) {
      this._frameTimeOverridden = false;
      return;
    }
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds < 0 ||
      !Number.isFinite(windOffsetWS[0]) ||
      !Number.isFinite(windOffsetWS[1]) ||
      !Number.isFinite(windOffsetWS[2])
    ) {
      throw new RangeError(
        "Cloud frame override must use a finite non-negative time and finite world-space wind offset"
      );
    }
    this._elapsed = elapsedSeconds;
    this._windOffsetWS.set(windOffsetWS[0], windOffsetWS[1], windOffsetWS[2]);
    this._frameTimeOverridden = true;
    this.material.setFrame(this._elapsed, this._windOffsetWS, this._windVelocityWS);
    this.material.invalidateHistory();
  }

  /** Uses the shared environment's physical world-space wind vector for cloud advection. */
  setWindVelocity(velocityWS: Readonly<{ x: number; y: number; z: number }> | readonly number[]): void {
    const x = "x" in velocityWS ? velocityWS.x : velocityWS[0];
    const y = "y" in velocityWS ? velocityWS.y : velocityWS[1];
    const z = "z" in velocityWS ? velocityWS.z : velocityWS[2];
    this.setWindVelocityValues(x, y, z);
  }

  /** Applies physical cloud velocity without constructing or enumerating a vector wrapper. */
  setWindVelocityValues(x: number, y: number, z: number): void {
    this._assertAlive();
    if (x === this._windVelocityWS.x && y === this._windVelocityWS.y && z === this._windVelocityWS.z) return;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new RangeError("Cloud wind velocity must be finite");
    }
    this._windVelocityWS.set(x, y, z);
    this._windSpeed = Math.hypot(x, y, z);
  }

  setEnvironmentModifiers(modifiers: Readonly<VolumetricCloudEnvironmentModifiers>): void {
    this.setEnvironmentModifierValues(
      modifiers.densityMultiplier ?? 1,
      modifiers.stormOffset ?? 0,
      modifiers.solarTintStrength ?? this._environmentResponseProfile.solarTintStrength
    );
  }

  /** Applies evaluated environment modifiers without constructing a transient settings object. */
  setEnvironmentModifierValues(
    densityMultiplier: number,
    stormOffset: number,
    solarTintStrength = this._environmentResponseProfile.solarTintStrength
  ): void {
    this._assertAlive();
    if (
      densityMultiplier === this._densityMultiplier &&
      stormOffset === this._stormOffset &&
      solarTintStrength === this._solarTintStrength
    ) {
      return;
    }
    if (!Number.isFinite(densityMultiplier) || !Number.isFinite(stormOffset) || !Number.isFinite(solarTintStrength)) {
      throw new RangeError("Cloud environment modifiers must be finite");
    }
    this._densityMultiplier = Math.max(0, densityMultiplier);
    this._stormOffset = Math.max(0, stormOffset);
    this._solarTintStrength = clamp01(solarTintStrength);
  }

  private _captureAtmosphereState(): void {
    const material = this._skyMaterial;
    const current = this._atmosphereState;
    current.skyTint[0] = material.skyTint.r;
    current.skyTint[1] = material.skyTint.g;
    current.skyTint[2] = material.skyTint.b;
    current.groundTint[0] = material.groundTint.r;
    current.groundTint[1] = material.groundTint.g;
    current.groundTint[2] = material.groundTint.b;
    current.atmosphereThickness = material.atmosphereThickness;
  }

  /** Select and interpolate clear, sunset and night lighting without changing the authored Weather Map. */
  setTimelinePhase(phase: number): void {
    this._assertAlive();
    if (!Number.isFinite(phase)) throw new RangeError("Cloud timeline phase must be finite");
    this._timelinePhase = wrap(phase, VOLUMETRIC_CLOUD_TIMELINE_KEYS.length);
    const segment = Math.floor(this._timelinePhase);
    const linearBlend = this._timelinePhase - segment;
    const blend = smoothCurve(linearBlend);
    const fromId = VOLUMETRIC_CLOUD_TIMELINE_KEYS[segment];
    const toId = VOLUMETRIC_CLOUD_TIMELINE_KEYS[(segment + 1) % VOLUMETRIC_CLOUD_TIMELINE_KEYS.length];
    const from = VOLUMETRIC_CLOUD_TIMELINE_PRESETS[fromId];
    const to = VOLUMETRIC_CLOUD_TIMELINE_PRESETS[toId];
    this._timelineWeather = linearBlend < 0.5 ? fromId : toId;
    mixPaletteInto(this._basePalette, from.palette, to.palette, blend);
    let toTime = to.time;
    if (toTime <= from.time) toTime += HOURS_PER_DAY;
    this._timelineTimeHours = wrap(mixNumber(from.time, toTime, linearBlend), HOURS_PER_DAY);
  }

  /** Resolves the shared visual timeline for an externally owned astronomical clock. */
  setTimelineTime(timeHours: number): void {
    this.setTimelinePhase(timelinePhaseForTime(timeHours));
  }

  /**
   * Resolves cloud radiance from one scientific day/night state.
   *
   * Clock labels never select cloud optics. Sun elevation and the resolved Sun/Moon energy
   * choose the palette and direct radiance, while weather owns density, morphology and extinction.
   */
  applyDayNightState(dayNight: Readonly<DayNightState>): void {
    this._assertAlive();
    this._captureAtmosphereState();
    const base = this._basePalette;
    const palette = this._resolvedPalette;
    const weights = this._celestialPaletteWeights;
    resolveCelestialPalette(dayNight, base, weights);
    mixPaletteInto(palette, base, base, 0);
    this._timelineTimeHours = wrap(dayNight.timeHours, HOURS_PER_DAY);
    this._timelinePhase = weights.twilight + weights.night * 2;
    this._timelineWeather = dominantTimelineState(weights);

    const solarPeak = Math.max(
      dayNight.sunColor.r,
      dayNight.sunColor.g,
      dayNight.sunColor.b,
      COLOR_NORMALIZATION_EPSILON
    );
    const daylightTint = dayNight.dayFactor * this._solarTintStrength;
    palette.cloudLight[0] *= mixNumber(1, dayNight.sunColor.r / solarPeak, daylightTint);
    palette.cloudLight[1] *= mixNumber(1, dayNight.sunColor.g / solarPeak, daylightTint);
    palette.cloudLight[2] *= mixNumber(1, dayNight.sunColor.b / solarPeak, daylightTint);
    this._celestialDirectRadianceScale = resolveCelestialDirectRadianceScale(dayNight);
    scaleColor(palette.cloudLight, this._celestialDirectRadianceScale);
    palette.storm = clamp01(base.storm + this._stormOffset);
    palette.density = base.density * this._densityMultiplier;
    this._applySharedAtmosphere(palette);
    resolveCelestialLightDirection(dayNight, this._celestialLightDirection);
    this.material.setEnvironment(this._celestialLightDirection, palette);
  }

  private _applySharedAtmosphere(palette: MutableCloudPalette): void {
    const atmosphere = this._atmosphereState;

    let anchor = this._atmosphereAnchor;
    if (!anchor) {
      anchor = this._atmosphereAnchor = {
        source: {
          skyTint: [...atmosphere.skyTint],
          groundTint: [...atmosphere.groundTint],
          atmosphereThickness: atmosphere.atmosphereThickness
        },
        zenith: [...palette.zenith],
        horizon: [...palette.horizon]
      };
    }

    applyAnchoredTint(palette.zenith, anchor.zenith, atmosphere.skyTint, anchor.source.skyTint);
    applyAnchoredTint(palette.horizon, anchor.horizon, atmosphere.groundTint, anchor.source.groundTint);

    const thicknessRatio = clamp(
      relativeAtmosphereValue(atmosphere.atmosphereThickness, anchor.source.atmosphereThickness),
      0.25,
      4
    );
    const horizonResponse = Math.sqrt(thicknessRatio);
    const zenithResponse = 1 / Math.sqrt(horizonResponse);
    scaleColor(palette.horizon, horizonResponse);
    scaleColor(palette.zenith, zenithResponse);
  }

  /** Advances the common wind field and follows the external camera altitude. */
  update(deltaTime: number): void {
    this._assertAlive();
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Cloud delta time must be finite and non-negative");
    }
    if (!this._frameTimeOverridden) {
      this._elapsed += deltaTime;
      this._windOffsetWS.x += deltaTime * this._windVelocityWS.x;
      this._windOffsetWS.y += deltaTime * this._windVelocityWS.y;
      this._windOffsetWS.z += deltaTime * this._windVelocityWS.z;
    }
    this.setObserverAltitude(this._camera.entity.transform.worldPosition.y);
    this.material.setFrame(this._elapsed, this._windOffsetWS, this._windVelocityWS);
  }

  invalidateHistory(): void {
    this._assertAlive();
    this.material.invalidateHistory();
  }

  getSnapshot(): VolumetricCloudSkyRuntimeSnapshot {
    this._assertAlive();
    return {
      quality: this._quality,
      timelineWeather: this._timelineWeather,
      timelinePhase: this._timelinePhase,
      timelineTimeHours: this._timelineTimeHours,
      celestialDirectRadianceScale: this._celestialDirectRadianceScale,
      windSpeed: this._windSpeed,
      windVelocityWS: [this._windVelocityWS.x, this._windVelocityWS.y, this._windVelocityWS.z],
      windOffsetWS: [this._windOffsetWS.x, this._windOffsetWS.y, this._windOffsetWS.z],
      settings: { ...this._settings },
      scaleSettings: { ...this._scaleSettings },
      shapeProfile: { ...this._shapeSettings },
      lightingProfile: this.material.lightingProfile,
      noiseProfile: this.material.noiseProfile,
      weatherMapProfile: this._weatherField.profile,
      weatherSeed: this._weatherSeed,
      observerAltitude: this.material.observerAltitude,
      baseHeightAboveObserver: Math.max(0, this._scaleSettings.baseAltitude - this.material.observerAltitude)
    };
  }

  destroy(): void {
    if (this._destroyed) return;
    if (this._skyMaterial.volumetricClouds === this.material) {
      this._skyMaterial.volumetricClouds = null;
    }
    this.material.destroy(true);
    this._detailNoise.destroy();
    this._curlNoise.destroy();
    this._blueNoise.destroy();
    this._baseNoise.destroy();
    this._shapeProfileTexture.destroy();
    this._weatherMap.destroy();
    this._destroyed = true;
  }

  private _assertAlive(): void {
    if (this._destroyed) throw new Error("Volumetric cloud sky runtime has been destroyed");
  }
}

function createWeatherMap(
  scene: Scene,
  seed: number,
  profile: Readonly<VolumetricCloudWeatherMapProfile>
): { texture: Texture2D; field: VolumetricCloudWeatherMap } {
  const texture = new Texture2D(
    scene.engine,
    VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH,
    VOLUMETRIC_CLOUD_WEATHER_MAP_HEIGHT,
    TextureFormat.R8G8B8A8,
    false,
    false
  );
  texture.name = "shared_volumetric_cloud_weather";
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.filterMode = TextureFilterMode.Bilinear;
  const field = new VolumetricCloudWeatherMap({ seed, profile });
  texture.setPixelBuffer(field.packBasis());
  return { texture, field };
}

function createShapeProfile(scene: Scene): Texture2D {
  const texture = new Texture2D(
    scene.engine,
    VOLUMETRIC_CLOUD_SHAPE_PROFILE_WIDTH,
    VOLUMETRIC_CLOUD_SHAPE_PROFILE_HEIGHT,
    TextureFormat.R8G8B8A8,
    false,
    false
  );
  texture.name = "shared_volumetric_cloud_shape_profile";
  texture.wrapModeU = TextureWrapMode.Clamp;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(new VolumetricCloudShapeProfile().pack());
  return texture;
}

function createBaseNoise(scene: Scene, noiseProfile: Readonly<VolumetricCloudNoiseProfile>): Texture2D {
  const texture = new Texture2D(
    scene.engine,
    VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE,
    VOLUMETRIC_CLOUD_NOISE_ATLAS_SIZE,
    TextureFormat.R8G8B8A8,
    false,
    false
  );
  texture.name = "shared_volumetric_cloud_base_noise";
  texture.wrapModeU = TextureWrapMode.Clamp;
  texture.wrapModeV = TextureWrapMode.Clamp;
  texture.filterMode = TextureFilterMode.Bilinear;
  texture.setPixelBuffer(buildVolumetricCloudNoiseAtlas(noiseProfile));
  return texture;
}

function createMutablePalette(source: VolumetricCloudPalette): MutableCloudPalette {
  return {
    zenith: [...source.zenith],
    horizon: [...source.horizon],
    cloudLight: [...source.cloudLight],
    cloudShadow: [...source.cloudShadow],
    storm: source.storm,
    density: source.density
  };
}

function createEnvironmentResponseProfile(
  profile: Readonly<VolumetricCloudEnvironmentResponseProfile>
): Readonly<VolumetricCloudEnvironmentResponseProfile> {
  const values = Object.values(profile);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new RangeError("Volumetric cloud environment response values must be finite and non-negative");
  }
  return Object.freeze({ ...profile });
}

function applyAnchoredTint(
  out: MutableColor,
  anchor: readonly [number, number, number],
  value: readonly [number, number, number],
  reference: readonly [number, number, number]
): void {
  out[0] = anchor[0] * relativeAtmosphereValue(value[0], reference[0]);
  out[1] = anchor[1] * relativeAtmosphereValue(value[1], reference[1]);
  out[2] = anchor[2] * relativeAtmosphereValue(value[2], reference[2]);
}

function relativeAtmosphereValue(value: number, reference: number): number {
  if (reference <= COLOR_NORMALIZATION_EPSILON) {
    return value <= COLOR_NORMALIZATION_EPSILON ? 1 : 8;
  }
  return clamp(value / reference, 0, 8);
}

function scaleColor(color: MutableColor, scale: number): void {
  color[0] *= scale;
  color[1] *= scale;
  color[2] *= scale;
}

function mixPaletteInto(
  out: MutableCloudPalette,
  from: VolumetricCloudPalette,
  to: VolumetricCloudPalette,
  amount: number
): void {
  mixColorInto(out.zenith, from.zenith, to.zenith, amount);
  mixColorInto(out.horizon, from.horizon, to.horizon, amount);
  mixColorInto(out.cloudLight, from.cloudLight, to.cloudLight, amount);
  mixColorInto(out.cloudShadow, from.cloudShadow, to.cloudShadow, amount);
  out.storm = mixNumber(from.storm, to.storm, amount);
  out.density = mixNumber(from.density, to.density, amount);
}

interface MutableCelestialPaletteWeights {
  day: number;
  twilight: number;
  night: number;
}

function resolveCelestialPalette(
  dayNight: Readonly<DayNightState>,
  out: MutableCloudPalette,
  weights: MutableCelestialPaletteWeights
): void {
  const twilight = clamp01(dayNight.twilightFactor);
  const nonTwilight = 1 - twilight;
  const day = clamp01(dayNight.dayFactor) * nonTwilight;
  const night = clamp01(dayNight.nightFactor) * nonTwilight;
  const total = Math.max(day + twilight + night, COLOR_NORMALIZATION_EPSILON);
  weights.day = day / total;
  weights.twilight = twilight / total;
  weights.night = night / total;
  const clear = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.clear.palette;
  const sunset = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.sunset.palette;
  const nightPreset = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.night.palette;
  mixWeightedColor(out.zenith, clear.zenith, sunset.zenith, VOLUMETRIC_CLOUD_NIGHT_PALETTE.zenith, weights);
  mixWeightedColor(out.horizon, clear.horizon, sunset.horizon, VOLUMETRIC_CLOUD_NIGHT_PALETTE.horizon, weights);
  mixWeightedColor(
    out.cloudLight,
    clear.cloudLight,
    sunset.cloudLight,
    VOLUMETRIC_CLOUD_NIGHT_PALETTE.cloudLight,
    weights
  );
  mixWeightedColor(
    out.cloudShadow,
    clear.cloudShadow,
    sunset.cloudShadow,
    VOLUMETRIC_CLOUD_NIGHT_PALETTE.cloudShadow,
    weights
  );
  out.storm = clear.storm * weights.day + sunset.storm * weights.twilight + nightPreset.storm * weights.night;
  out.density = clear.density * weights.day + sunset.density * weights.twilight + nightPreset.density * weights.night;
}

function mixWeightedColor(
  out: MutableColor,
  day: readonly [number, number, number],
  twilight: readonly [number, number, number],
  night: readonly [number, number, number],
  weights: Readonly<MutableCelestialPaletteWeights>
): void {
  out[0] = day[0] * weights.day + twilight[0] * weights.twilight + night[0] * weights.night;
  out[1] = day[1] * weights.day + twilight[1] * weights.twilight + night[1] * weights.night;
  out[2] = day[2] * weights.day + twilight[2] * weights.twilight + night[2] * weights.night;
}

function dominantTimelineState(weights: Readonly<MutableCelestialPaletteWeights>): VolumetricCloudTimelineId {
  if (weights.twilight >= weights.day && weights.twilight >= weights.night) return "sunset";
  return weights.night > weights.day ? "night" : "clear";
}

function resolveCelestialDirectRadianceScale(dayNight: Readonly<DayNightState>): number {
  const sun = Math.max(0, dayNight.sunIntensity);
  const moonHorizonVisibility = smoothCurve(clamp01((dayNight.moonElevation + 1) / 4));
  const moon =
    clamp01(dayNight.nightFactor) *
    clamp01(dayNight.moonPhaseBrightness) *
    moonHorizonVisibility *
    FULL_MOON_CLOUD_RADIANCE_SCALE;
  return clamp01(sun + moon);
}

function mixColorInto(
  out: MutableColor,
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  amount: number
): void {
  out[0] = mixNumber(from[0], to[0], amount);
  out[1] = mixNumber(from[1], to[1], amount);
  out[2] = mixNumber(from[2], to[2], amount);
}

function resolveCelestialLightDirection(dayNight: Readonly<DayNightState>, out: MutableColor): void {
  const sunWeight = Math.max(0, dayNight.sunIntensity);
  const moonHorizonVisibility = smoothCurve(clamp01((dayNight.moonElevation + 1) / 4));
  const moonWeight = dayNight.nightFactor * dayNight.moonPhaseBrightness * moonHorizonVisibility;
  const totalWeight = sunWeight + moonWeight;
  if (totalWeight <= 1e-5) {
    const source = dayNight.nightFactor >= 0.5 ? dayNight.moonDirection : dayNight.sunDirection;
    out[0] = -source.x;
    out[1] = -source.y;
    out[2] = -source.z;
    return;
  }

  const x = -(dayNight.sunDirection.x * sunWeight + dayNight.moonDirection.x * moonWeight);
  const y = -(dayNight.sunDirection.y * sunWeight + dayNight.moonDirection.y * moonWeight);
  const z = -(dayNight.sunDirection.z * sunWeight + dayNight.moonDirection.z * moonWeight);
  const length = Math.hypot(x, y, z);
  if (length <= 1e-5) {
    const source = moonWeight > sunWeight ? dayNight.moonDirection : dayNight.sunDirection;
    out[0] = -source.x;
    out[1] = -source.y;
    out[2] = -source.z;
    return;
  }
  out[0] = x / length;
  out[1] = y / length;
  out[2] = z / length;
}

function timelinePhaseForTime(value: number): number {
  const hour = wrap(value, HOURS_PER_DAY);
  const clear = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.clear.time;
  const sunset = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.sunset.time;
  const night = VOLUMETRIC_CLOUD_TIMELINE_PRESETS.night.time;
  if (hour >= clear && hour < sunset) return (hour - clear) / (sunset - clear);
  if (hour >= sunset && hour < night) return 1 + (hour - sunset) / (night - sunset);
  const unwrapped = hour < clear ? hour + HOURS_PER_DAY : hour;
  return 2 + (unwrapped - night) / (clear + HOURS_PER_DAY - night);
}

function mixNumber(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothCurve(value: number): number {
  return value * value * (3 - 2 * value);
}

function wrap(value: number, range: number): number {
  return ((value % range) + range) % range;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
