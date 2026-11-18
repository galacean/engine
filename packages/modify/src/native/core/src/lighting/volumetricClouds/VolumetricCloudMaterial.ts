import { Vector3, Vector4 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import type { Camera } from "../../Camera";
import type { RenderContext } from "../../RenderPipeline/RenderContext";
import type { Scene } from "../../Scene";
import { Material } from "../../material/Material";
import { Shader } from "../../shader/Shader";
import type { ShaderData } from "../../shader/ShaderData";
import type {
  SkyProceduralVolumetricClouds,
  SkyProceduralVolumetricCloudSnapshot
} from "../../sky/SkyProceduralMaterial";
import { Texture2D, Texture2DArray } from "../../texture";
import {
  VolumetricCloudDirectionCacheRenderer,
  type VolumetricCloudDirectionCacheSnapshot
} from "./VolumetricCloudDirectionCacheRenderer";
import {
  createVolumetricCloudLightingProfile,
  VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE,
  type VolumetricCloudLightingProfile
} from "./VolumetricCloudLightingProfile";
import { createVolumetricCloudMultipleScatteringTexture } from "./VolumetricCloudMultipleScatteringLUT";
import {
  createVolumetricCloudNoiseProfile,
  VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE,
  type VolumetricCloudNoiseProfile
} from "./VolumetricCloudNoiseAtlas";
import {
  createVolumetricCloudShapeSettings,
  VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS,
  type VolumetricCloudShapeSettings
} from "./VolumetricCloudShapeProfile";
import {
  createVolumetricCloudWeatherMapProfile,
  validateVolumetricCloudWeatherValues,
  VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE,
  VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SETTINGS,
  type VolumetricCloudWeatherMapProfile,
  type VolumetricCloudWeatherSettings
} from "./VolumetricCloudWeatherMap";
import { VOLUMETRIC_CLOUD_DEFAULT_WIND_DIRECTION } from "./VolumetricCloudWind";

const SHADER_NAME = "World/VolumetricClouds";
const VOLUMETRIC_CLOUD_SHADOW_MACRO = "SCENE_VOLUMETRIC_CLOUD_SHADOW";
const VOLUMETRIC_CLOUD_SHADOW_TEXTURE = "scene_VolumetricCloudShadowTexture";

/** Resolves the precompiled cloud Shader without allocating textures, Materials, or render targets. */
export function registerVolumetricCloudShader(): Shader {
  const shader = Shader.find(SHADER_NAME);
  if (!shader) throw new Error(`Built-in Shader '${SHADER_NAME}' is not registered.`);
  return shader;
}

function copyFiniteWindVector(
  label: string,
  source: Readonly<{ x: number; y: number; z: number }> | readonly number[],
  target: Vector3
): void {
  const x = "x" in source ? source.x : source[0];
  const y = "y" in source ? source.y : source[1];
  const z = "z" in source ? source.z : source[2];
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new RangeError(`${label} must be finite`);
  }
  target.set(x, y, z);
}
const VOLUMETRIC_CLOUD_SHADOW_METADATA = "scene_VolumetricCloudShadowMetadata";

/** Quality levels supported by {@link VolumetricCloudMaterial}. */
export type VolumetricCloudQuality = "economy" | "balanced" | "high";

/** Direction-cache trace and reconstruction parameters. */
export interface VolumetricCloudQualityPreset {
  readonly directionCacheSteps: number;
  /** Maximum density samples integrated toward the sun for each occupied view sample. */
  readonly lightSteps: number;
  /** Leading sun-ray samples that retain detail erosion; the remainder use coarse density. */
  readonly lightDetailSteps: number;
  readonly lodDistance: number;
  readonly blueNoiseIntensity: number;
  readonly directionCacheSize: number;
  readonly directionCacheSlices: number;
  readonly directionHistoryWeight: number;
  /** Prefer linear half-float storage instead of compressed RGBA8. */
  readonly directionCacheHDR: boolean;
  readonly directionInvalidationBurstSlices: number;
  readonly maxHorizonSteps: number;
  readonly directionHorizonFadeStart: number;
  readonly horizonFadeEnd: number;
  readonly horizonStepStart: number;
  readonly horizonStepEnd: number;
  readonly directionHorizonStepMultiplier: number;
  readonly rayStartOffset: number;
  readonly transmittanceCutoff: number;
  readonly densityCutoff: number;
  readonly weatherPresenceCutoff: number;
  readonly emptySpaceWeatherThreshold: number;
  readonly emptySpaceStepMultiplier: number;
  readonly initialWeightedCenter: number;
  readonly observerHistoryInvalidationRatio: number;
}

const VOLUMETRIC_CLOUD_COMMON_QUALITY = Object.freeze({
  maxHorizonSteps: 96,
  directionHorizonFadeStart: 0,
  horizonFadeEnd: 0.055,
  horizonStepStart: 0.08,
  horizonStepEnd: 0.4,
  directionHorizonStepMultiplier: 1,
  rayStartOffset: 0.2,
  transmittanceCutoff: 0.02,
  densityCutoff: 0.001,
  weatherPresenceCutoff: 0.015,
  emptySpaceWeatherThreshold: 0.035,
  emptySpaceStepMultiplier: 1.45,
  initialWeightedCenter: 0.42,
  observerHistoryInvalidationRatio: 0.05,
  directionInvalidationBurstSlices: 2
});

/** Raymarch and direction-cache recommendations for each quality level. */
export const VOLUMETRIC_CLOUD_QUALITY_PRESETS: Readonly<Record<VolumetricCloudQuality, VolumetricCloudQualityPreset>> =
  Object.freeze({
    economy: Object.freeze({
      ...VOLUMETRIC_CLOUD_COMMON_QUALITY,
      directionCacheSteps: 16,
      lightSteps: 4,
      lightDetailSteps: 0,
      lodDistance: 0.55,
      blueNoiseIntensity: 0.8,
      directionCacheSize: 256,
      directionCacheSlices: 16,
      directionHistoryWeight: 0.92,
      directionCacheHDR: false
    }),
    balanced: Object.freeze({
      ...VOLUMETRIC_CLOUD_COMMON_QUALITY,
      directionCacheSteps: 16,
      lightSteps: 6,
      lightDetailSteps: 1,
      lodDistance: 0.7,
      blueNoiseIntensity: 0.9,
      directionCacheSize: 512,
      directionCacheSlices: 8,
      directionHistoryWeight: 0.94,
      directionCacheHDR: true
    }),
    high: Object.freeze({
      ...VOLUMETRIC_CLOUD_COMMON_QUALITY,
      directionCacheSteps: 16,
      lightSteps: 6,
      lightDetailSteps: 2,
      lodDistance: 0.85,
      blueNoiseIntensity: 1,
      directionCacheSize: 512,
      directionCacheSlices: 4,
      directionHistoryWeight: 0.95,
      directionCacheHDR: true
    })
  });

/** Sky and cloud radiance parameters consumed by the volumetric cloud shader. */
export interface VolumetricCloudPalette {
  zenith: readonly [number, number, number];
  horizon: readonly [number, number, number];
  cloudLight: readonly [number, number, number];
  cloudShadow: readonly [number, number, number];
  storm: number;
  density: number;
}

/** World-space scale of the spherical cloud layer and its sampled density fields. */
export interface VolumetricCloudScaleSettings {
  /** Radius of the local ground sphere in world units. */
  readonly planetRadius: number;
  /** Absolute cloud-base altitude above the world origin in world units. */
  readonly baseAltitude: number;
  /** Vertical thickness of the cloud layer in world units. */
  readonly thickness: number;
  /** Horizontal weather-map repetitions per world unit. */
  readonly weatherScale: number;
  /** Base 3D shape-noise repetitions per world unit. */
  readonly shapeScale: number;
  /** Detail 3D noise repetitions per world unit. */
  readonly detailScale: number;
  /** Base-noise repetitions across the normalized vertical cloud layer. */
  readonly shapeVerticalFrequency: number;
  /** Detail-noise repetitions across the normalized vertical cloud layer. */
  readonly detailVerticalFrequency: number;
}

/** Scale retained by the original standalone cloud presentation. */
export const VOLUMETRIC_CLOUD_DEFAULT_SCALE_SETTINGS: Readonly<VolumetricCloudScaleSettings> = Object.freeze({
  planetRadius: 100,
  baseAltitude: 4,
  thickness: 6,
  weatherScale: 0.01,
  shapeScale: 0.055,
  detailScale: 0.0275,
  shapeVerticalFrequency: 1,
  detailVerticalFrequency: 1
});

/** GPU textures required by the volumetric cloud material. */
export interface VolumetricCloudTextures {
  readonly weatherMap: Texture2D;
  readonly shapeProfile: Texture2D;
  readonly baseNoise: Texture2D;
  readonly detailNoise: Texture2DArray;
  readonly curlNoise: Texture2D;
  readonly blueNoise: Texture2D;
  /** Resource encoding used to bake base noise and decode its packed Worley channels. */
  readonly noiseProfile: Readonly<VolumetricCloudNoiseProfile>;
}

/** Direction-cache GPU stages exposed only to explicit diagnostics. @internal */
export type VolumetricCloudDirectionCacheProfileStage = "direction-update";

/** Optional diagnostics hook around direction-cache GPU submissions. @internal */
export interface VolumetricCloudDirectionCacheProfiler {
  beginSample(stage: VolumetricCloudDirectionCacheProfileStage): void;
  endSample(stage: VolumetricCloudDirectionCacheProfileStage): void;
}

interface VolumetricCloudSkyCompositionState {
  texture: Texture2D | null;
  metadataTexture: Texture2D | null;
  displayMotion: Vector3;
  texelSize: Vector4;
  sunDirection: Vector3;
  cloudLight: Vector3;
  zenith: Vector3;
  horizon: Vector3;
  cacheReady: number;
  cacheCompression: number;
  planetRadius: number;
  observerAltitude: number;
  baseAltitude: number;
  thickness: number;
  phaseForwardAnisotropy: number;
  phaseBackwardAnisotropy: number;
  phaseBlend: number;
  cachePhaseIsotropyBlend: number;
  cacheAmbientWeight: number;
  cacheExposureScale: number;
  cacheExposureMinimum: number;
  cacheExposureMaximum: number;
  cacheEncodingGamma: number;
}

class VolumetricCloudSkyCompositionSnapshot implements SkyProceduralVolumetricCloudSnapshot {
  private _released = false;

  constructor(
    readonly signature: string,
    private readonly _state: VolumetricCloudSkyCompositionState,
    private readonly _cacheSnapshot: VolumetricCloudDirectionCacheSnapshot
  ) {}

  _prepareSkyComposition(_context: RenderContext, target: ShaderData): void {
    publishVolumetricCloudSkyComposition(target, this._state);
  }

  _detachSkyComposition(target: ShaderData): void {
    detachVolumetricCloudSkyComposition(target);
  }

  release(): void {
    if (this._released) return;
    this._released = true;
    this._cacheSnapshot.release();
  }
}

/**
 * Spherical-shell cloud cache generator for procedural skies.
 *
 * The material owns the authoritative weather and lighting state. A procedural
 * sky borrows it as a prepass source, traces premultiplied cloud radiance into
 * one hemispherical cache and composites that cache without another ray march.
 */
export class VolumetricCloudMaterial extends Material implements SkyProceduralVolumetricClouds {
  private readonly _sunDirection = new Vector3();
  private readonly _zenith = new Vector3();
  private readonly _horizon = new Vector3();
  private readonly _cloudLight = new Vector3();
  private readonly _cloudShadow = new Vector3();
  private readonly _edgeLightColor = new Vector3();
  private readonly _solarHorizonTint = new Vector3();
  private readonly _sunRadianceColor = new Vector3();
  /** Fixed world origin shared by direction-cache tracing and its projected cloud shadow. */
  private readonly _directionCacheOrigin = new Vector3();
  private readonly _shadowLayer = new Vector4();
  private readonly _directionCacheRenderer: VolumetricCloudDirectionCacheRenderer;
  private readonly _skyCompositionState: VolumetricCloudSkyCompositionState;
  private _multipleScatteringLUT: Texture2D;
  private _multipleScatteringLUTDecodeScale: number;
  private _quality: VolumetricCloudQuality = "balanced";
  private _frameTime = 0;
  private readonly _windOffsetWS = new Vector3();
  private readonly _windVelocityWS = new Vector3(
    VOLUMETRIC_CLOUD_DEFAULT_WIND_DIRECTION.x,
    VOLUMETRIC_CLOUD_DEFAULT_WIND_DIRECTION.y,
    VOLUMETRIC_CLOUD_DEFAULT_WIND_DIRECTION.z
  );
  private _observerAltitude = 0;
  private _scaleSettings: VolumetricCloudScaleSettings = { ...VOLUMETRIC_CLOUD_DEFAULT_SCALE_SETTINGS };
  private _shapeProfile: VolumetricCloudShapeSettings = { ...VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS };
  private _weatherMapProfile: Readonly<VolumetricCloudWeatherMapProfile> = VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE;
  private _lightingProfile: Readonly<VolumetricCloudLightingProfile> = VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE;
  private _noiseProfile: Readonly<VolumetricCloudNoiseProfile> = VOLUMETRIC_CLOUD_DEFAULT_NOISE_PROFILE;
  private _boundShadowScene: Scene | null = null;

  /**
   * Create a volumetric cloud material.
   * @param engine - Engine that owns the material
   * @param textures - Weather, shape, detail, curl and sampling-noise textures
   */
  constructor(engine: Engine, textures: VolumetricCloudTextures) {
    super(engine, registerVolumetricCloudShader());
    this._directionCacheRenderer = new VolumetricCloudDirectionCacheRenderer(engine);
    this._skyCompositionState = {
      texture: null,
      metadataTexture: null,
      displayMotion: this._directionCacheRenderer.displayMotion,
      texelSize: this._directionCacheRenderer.texelSize,
      sunDirection: this._sunDirection,
      cloudLight: this._cloudLight,
      zenith: this._zenith,
      horizon: this._horizon,
      cacheReady: 0,
      cacheCompression: 1,
      planetRadius: this._scaleSettings.planetRadius,
      observerAltitude: this._observerAltitude,
      baseAltitude: this._scaleSettings.baseAltitude,
      thickness: this._scaleSettings.thickness,
      phaseForwardAnisotropy: this._lightingProfile.phaseForwardAnisotropy,
      phaseBackwardAnisotropy: this._lightingProfile.phaseBackwardAnisotropy,
      phaseBlend: this._lightingProfile.phaseBlend,
      cachePhaseIsotropyBlend: this._lightingProfile.cachePhaseIsotropyBlend,
      cacheAmbientWeight: this._lightingProfile.cacheAmbientWeight,
      cacheExposureScale: this._lightingProfile.cacheExposureScale,
      cacheExposureMinimum: this._lightingProfile.cacheExposureMinimum,
      cacheExposureMaximum: this._lightingProfile.cacheExposureMaximum,
      cacheEncodingGamma: this._lightingProfile.cacheEncodingGamma
    };
    const multipleScattering = createVolumetricCloudMultipleScatteringTexture(engine, this._lightingProfile);
    this._multipleScatteringLUT = multipleScattering.texture;
    this._multipleScatteringLUTDecodeScale = multipleScattering.decodeScale;
    const data = this.shaderData;
    data.setTexture("material_WeatherMap", textures.weatherMap);
    data.setTexture("material_ShapeProfile", textures.shapeProfile);
    data.setTexture("material_NoiseAtlas", textures.baseNoise);
    data.setTexture("material_DetailNoise", textures.detailNoise);
    data.setTexture("material_CurlNoise", textures.curlNoise);
    data.setTexture("material_BlueNoise", textures.blueNoise);
    data.setFloat("material_BlueNoiseWidth", textures.blueNoise.width);
    data.setFloat("material_BlueNoiseHeight", textures.blueNoise.height);
    data.setFloat("material_DetailNoiseDepth", textures.detailNoise.length);
    data.setFloat("material_DetailNoiseMaxMip", textures.detailNoise.mipmapCount - 1);
    this._noiseProfile = createVolumetricCloudNoiseProfile(textures.noiseProfile);
    data.setFloat("material_NoiseWeightLow", this._noiseProfile.worleyWeights[0]);
    data.setFloat("material_NoiseWeightMiddle", this._noiseProfile.worleyWeights[1]);
    data.setFloat("material_NoiseWeightHigh", this._noiseProfile.worleyWeights[2]);
    data.setTexture("material_MultipleScatteringLUT", this._multipleScatteringLUT);
    data.setFloat("material_MultipleScatteringLUTDecodeScale", this._multipleScatteringLUTDecodeScale);
    data.setFloat("material_Time", 0);
    data.setVector3("material_WindOffsetWS", this._windOffsetWS);
    data.setVector3("material_WindVelocityWS", this._windVelocityWS);
    data.setFloat("material_CloudDensity", 1);
    data.setFloat("material_DirectionCacheReady", 0);
    data.setFloat("material_CacheHDRCompression", 1);
    data.setFloat("material_HorizonStepMultiplier", 1);
    this.setWeatherMapProfile(VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE);
    this.setWeatherSettings(VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SETTINGS);
    this.setShapeProfile(VOLUMETRIC_CLOUD_DEFAULT_SHAPE_SETTINGS);
    this.setLightingProfile(VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE);
    this.setScaleSettings(VOLUMETRIC_CLOUD_DEFAULT_SCALE_SETTINGS);
    this.setObserverAltitude(0);
    this.setQuality("balanced");
  }

  /** Shared hemispherical cache available to reflection, shadow and IBL consumers. */
  get directionCacheTexture(): Texture2D | null {
    return this._directionCacheRenderer.texture;
  }

  /** Signature of the displayed cache and every input needed to decode it. @internal */
  get _skyCompositionSignature(): string {
    return this._createSkyCompositionSignature(this._directionCacheRenderer.displayRevision);
  }

  /** Retain one completed cache generation without another cloud ray march. @internal */
  _acquireSkyCompositionSnapshot(): SkyProceduralVolumetricCloudSnapshot | null {
    const cacheSnapshot = this._directionCacheRenderer.acquireSnapshot(this);
    if (!cacheSnapshot) return null;
    try {
      const live = this._updateSkyCompositionState();
      const frozen: VolumetricCloudSkyCompositionState = {
        ...live,
        texture: cacheSnapshot.texture,
        metadataTexture: cacheSnapshot.metadataTexture,
        displayMotion: cacheSnapshot.displayMotion,
        texelSize: cacheSnapshot.texelSize,
        sunDirection: live.sunDirection.clone(),
        cloudLight: live.cloudLight.clone(),
        zenith: live.zenith.clone(),
        horizon: live.horizon.clone(),
        cacheReady: 1,
        cacheCompression: cacheSnapshot.compression
      };
      return new VolumetricCloudSkyCompositionSnapshot(
        this._createSkyCompositionSignature(cacheSnapshot.revision),
        frozen,
        cacheSnapshot
      );
    } catch (error) {
      cacheSnapshot.release();
      throw error;
    }
  }

  /** Attach an explicit direction-cache profiler without enabling diagnostics by default. @internal */
  setDirectionCacheProfiler(profiler: VolumetricCloudDirectionCacheProfiler | null): void {
    this._directionCacheRenderer.profiler = profiler;
  }

  /** Apply a direction-cache trace and reconstruction quality preset. */
  setQuality(quality: VolumetricCloudQuality): void {
    this._quality = quality;
    const preset = VOLUMETRIC_CLOUD_QUALITY_PRESETS[quality];
    const data = this.shaderData;
    data.setFloat("material_MaxSteps", preset.directionCacheSteps);
    data.setFloat("material_DetailLodDistance", preset.lodDistance);
    data.setFloat("material_BlueNoiseIntensity", preset.blueNoiseIntensity);
    data.setFloat("material_LightSteps", preset.lightSteps);
    data.setFloat("material_LightDetailSteps", preset.lightDetailSteps);
    data.setFloat("material_MaxHorizonSteps", preset.maxHorizonSteps);
    data.setFloat("material_HorizonFadeEnd", preset.horizonFadeEnd);
    data.setFloat("material_HorizonStepStart", preset.horizonStepStart);
    data.setFloat("material_HorizonStepEnd", preset.horizonStepEnd);
    data.setFloat("material_RayStartOffset", preset.rayStartOffset);
    data.setFloat("material_TransmittanceCutoff", preset.transmittanceCutoff);
    data.setFloat("material_DensityCutoff", preset.densityCutoff);
    data.setFloat("material_WeatherPresenceCutoff", preset.weatherPresenceCutoff);
    data.setFloat("material_EmptySpaceWeatherThreshold", preset.emptySpaceWeatherThreshold);
    data.setFloat("material_EmptySpaceStepMultiplier", preset.emptySpaceStepMultiplier);
    data.setFloat("material_InitialWeightedCenter", preset.initialWeightedCenter);
    this.invalidateHistory();
  }

  /** Advance animation time and publish P3 world-space cloud-layer wind. */
  setFrame(
    time: number,
    windOffsetWS: Readonly<{ x: number; y: number; z: number }> | readonly number[],
    windVelocityWS: Readonly<{ x: number; y: number; z: number }> | readonly number[]
  ): void {
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Cloud frame time must be finite and non-negative");
    copyFiniteWindVector("Cloud wind offset", windOffsetWS, this._windOffsetWS);
    copyFiniteWindVector("Cloud wind velocity", windVelocityWS, this._windVelocityWS);
    this._frameTime = time;
    this.shaderData.setFloat("material_Time", time);
    this.shaderData.setVector3("material_WindOffsetWS", this._windOffsetWS);
    this.shaderData.setVector3("material_WindVelocityWS", this._windVelocityWS);
  }

  /** Current world-space wind displacement used by direction-cache reprojection. @internal */
  get _cloudWindOffsetWS(): Readonly<Vector3> {
    return this._windOffsetWS;
  }

  /** Current P3 cloud-layer velocity used by density shaping. @internal */
  get _cloudWindVelocityWS(): Readonly<Vector3> {
    return this._windVelocityWS;
  }

  /** Current animation time used to keep sliced direction-cache sweeps coherent. @internal */
  get _cloudFrameTime(): number {
    return this._frameTime;
  }

  /** Apply continuous cloud coverage, type and detail controls. */
  setWeatherSettings(settings: Readonly<VolumetricCloudWeatherSettings>): void {
    this.setWeatherValues(settings.coverage, settings.cloudType, settings.detail);
  }

  /** Apply continuous cloud controls from an allocation-free frame path. */
  setWeatherValues(coverage: number, cloudType: number, detail: number): void {
    validateVolumetricCloudWeatherValues(coverage, cloudType, detail);
    const data = this.shaderData;
    data.setFloat("material_Coverage", coverage);
    data.setFloat("material_CloudType", cloudType);
    data.setFloat("material_WeatherDetail", detail);
  }

  /** Apply the coefficients that resolve the packed horizontal Weather Map basis. */
  setWeatherMapProfile(profile: Readonly<VolumetricCloudWeatherMapProfile>): void {
    this._weatherMapProfile = createVolumetricCloudWeatherMapProfile(profile);
    const data = this.shaderData;
    data.setFloat("material_WeatherCoverageDilation", this._weatherMapProfile.coverageDilation);
    data.setFloat("material_WeatherTypeNoiseCenter", this._weatherMapProfile.typeNoiseCenter);
    data.setFloat("material_WeatherTypeNoiseAmplitude", this._weatherMapProfile.typeNoiseAmplitude);
    data.setFloat("material_WeatherTopCloudExponent", this._weatherMapProfile.topCloudExponent);
    data.setFloat("material_WeatherTopCoveragePowerScale", this._weatherMapProfile.topCoveragePowerScale);
    this.invalidateHistory();
  }

  get weatherMapProfile(): Readonly<VolumetricCloudWeatherMapProfile> {
    return { ...this._weatherMapProfile };
  }

  /** Apply artist-authored vertical morphology without changing horizontal weather distribution. */
  setShapeProfile(profile: Readonly<VolumetricCloudShapeSettings>): void {
    this._shapeProfile = { ...createVolumetricCloudShapeSettings(profile) };
    const data = this.shaderData;
    data.setFloat("material_BottomShape", profile.bottomShape);
    data.setFloat("material_MiddleShape", profile.middleShape);
    data.setFloat("material_TopShape", profile.topShape);
    data.setFloat("material_RampShape", profile.rampShape);
    data.setFloat("material_CloudTypeShaping", profile.cloudTypeShaping);
    data.setFloat("material_BaseErosionIntensity", profile.baseErosionIntensity);
    data.setFloat("material_BaseNoiseMultiplier", profile.baseNoiseMultiplier);
    data.setFloat("material_DetailErosionScale", profile.detailErosionScale);
    data.setFloat("material_MaxDetailErosion", profile.maxDetailErosion);
    data.setFloat("material_DetailNoiseMultiplier", profile.detailNoiseMultiplier);
    data.setFloat("material_CurlIntensity", profile.curlIntensity);
    data.setFloat("material_TopDensityMultiplier", profile.topDensityMultiplier);
    data.setFloat("material_TopSkewRatio", profile.topSkewRatio);
    data.setFloat("material_ProfileTypeOffset", profile.profileTypeOffset);
    data.setFloat("material_BottomBandStart", profile.bottomBandStart);
    data.setFloat("material_BottomBandEnd", profile.bottomBandEnd);
    data.setFloat("material_MiddleBandStart", profile.middleBandStart);
    data.setFloat("material_MiddleBandEnd", profile.middleBandEnd);
    data.setFloat("material_TopBandStart", profile.topBandStart);
    data.setFloat("material_TopBandEnd", profile.topBandEnd);
    data.setFloat("material_EnvelopeScale", profile.envelopeScale);
    data.setFloat("material_BottomFadeExponent", profile.bottomFadeExponent);
    data.setFloat("material_BottomFadeStrength", profile.bottomFadeStrength);
    data.setFloat("material_TopFadeExponent", profile.topFadeExponent);
    data.setFloat("material_TopFadeStrength", profile.topFadeStrength);
    data.setFloat("material_TopCutoff", profile.topCutoff);
    data.setFloat("material_DetailAnimationSpeed", profile.detailAnimationSpeed);
    data.setFloat("material_DetailCurlFrequency", profile.detailCurlFrequency);
    data.setFloat("material_DetailCurlBlend", profile.detailCurlBlend);
    data.setFloat("material_DetailCurlExponent", profile.detailCurlExponent);
    data.setFloat("material_DetailVerticalCurlStrength", profile.detailVerticalCurlStrength);
    data.setFloat("material_DetailLodNearDistance", profile.detailLodNearDistance);
    data.setFloat("material_DetailLodFarDistance", profile.detailLodFarDistance);
    data.setFloat("material_DetailHeightErosionScale", profile.detailHeightErosionScale);
    this.invalidateHistory();
  }

  /** Detached current morphology profile for diagnostics and cloning. */
  get shapeProfile(): Readonly<VolumetricCloudShapeSettings> {
    return { ...this._shapeProfile };
  }

  /** Apply optical response without changing Weather Map, morphology or layer geometry. */
  setLightingProfile(profile: Readonly<VolumetricCloudLightingProfile>): void {
    const resolved = createVolumetricCloudLightingProfile(profile);
    const rebuildScattering = scatteringKernelChanged(this._lightingProfile, resolved);
    this._lightingProfile = resolved;
    if (rebuildScattering) this._rebuildMultipleScatteringLUT();
    const data = this.shaderData;
    data.setFloat("material_LightMarchDistanceScale", resolved.lightMarchDistanceScale);
    for (let index = 0; index < resolved.lightStepPattern.length; index++) {
      data.setFloat(`material_LightStepPattern${index}`, resolved.lightStepPattern[index]);
    }
    data.setFloat("material_StormExtinctionMultiplier", resolved.stormExtinctionMultiplier);
    data.setFloat("material_InscatteringDensityScale", resolved.inscatteringDensityScale);
    data.setFloat("material_MultipleScatteringMinimum", resolved.multipleScatteringMinimum);
    data.setFloat("material_DirectionalEnergyScale", resolved.directionalEnergyScale);
    data.setFloat("material_DirectionalEnergyCompression", resolved.directionalEnergyCompression);
    data.setFloat("material_AmbientSkyBottom", resolved.ambientSkyBottom);
    data.setFloat("material_AmbientSkyTop", resolved.ambientSkyTop);
    data.setFloat("material_AmbientGroundBottom", resolved.ambientGroundBottom);
    data.setFloat("material_AmbientGroundTop", resolved.ambientGroundTop);
    data.setFloat("material_PowderDensityScale", resolved.powderDensityScale);
    data.setFloat("material_PowderDirectMinimum", resolved.powderDirectMinimum);
    data.setFloat("material_PowderDirectMaximum", resolved.powderDirectMaximum);
    data.setFloat("material_ExtinctionEdgeStart", resolved.extinctionEdgeStart);
    data.setFloat("material_ExtinctionEdgeEnd", resolved.extinctionEdgeEnd);
    data.setFloat("material_ExtinctionScale", resolved.extinctionScale);
    data.setFloat("material_DensitySmoothness", resolved.densitySmoothness);
    data.setFloat("material_SingleScatteringAlbedo", resolved.singleScatteringAlbedo);
    data.setFloat("material_EdgeLightIntensity", resolved.edgeLightIntensity);
    data.setFloat("material_PhaseForwardAnisotropy", resolved.phaseForwardAnisotropy);
    data.setFloat("material_PhaseBackwardAnisotropy", resolved.phaseBackwardAnisotropy);
    data.setFloat("material_PhaseBlend", resolved.phaseBlend);
    data.setFloat("material_MultipleScatteringMaxOpticalDepth", resolved.multipleScatteringMaxOpticalDepth);
    data.setFloat("material_AmbientSkyColorBlend", resolved.ambientSkyColorBlend);
    data.setFloat("material_AmbientGroundColorBlend", resolved.ambientGroundColorBlend);
    data.setFloat("material_AmbientShadowStrength", resolved.ambientShadowStrength);
    data.setFloat("material_StormAmbientMultiplier", resolved.stormAmbientMultiplier);
    data.setFloat("material_CachePhaseIsotropyBlend", resolved.cachePhaseIsotropyBlend);
    data.setFloat("material_CacheAmbientWeight", resolved.cacheAmbientWeight);
    data.setFloat("material_CacheExposureScale", resolved.cacheExposureScale);
    data.setFloat("material_CacheExposureMinimum", resolved.cacheExposureMinimum);
    data.setFloat("material_CacheExposureMaximum", resolved.cacheExposureMaximum);
    data.setFloat("material_CacheEncodingGamma", resolved.cacheEncodingGamma);
    data.setFloat("material_SkyGradientStart", resolved.skyGradientStart);
    data.setFloat("material_SkyGradientEnd", resolved.skyGradientEnd);
    data.setFloat("material_SkyGradientExponent", resolved.skyGradientExponent);
    data.setFloat("material_HorizonGlowFalloff", resolved.horizonGlowFalloff);
    data.setFloat("material_HorizonGlowStrength", resolved.horizonGlowStrength);
    data.setFloat("material_SolarHorizonPower", resolved.solarHorizonPower);
    data.setFloat("material_SolarHorizonStrength", resolved.solarHorizonStrength);
    data.setFloat("material_SunDiscStart", resolved.sunDiscStart);
    data.setFloat("material_SunDiscEnd", resolved.sunDiscEnd);
    data.setFloat("material_SunDiscStrength", resolved.sunDiscStrength);
    data.setFloat("material_SunHaloPower", resolved.sunHaloPower);
    data.setFloat("material_SunHaloStrength", resolved.sunHaloStrength);
    data.setFloat("material_SunHorizonFadeStart", resolved.sunHorizonFadeStart);
    data.setFloat("material_SunHorizonFadeEnd", resolved.sunHorizonFadeEnd);
    this._edgeLightColor.set(resolved.edgeLightColor[0], resolved.edgeLightColor[1], resolved.edgeLightColor[2]);
    data.setVector3("material_EdgeLightColor", this._edgeLightColor);
    this._solarHorizonTint.set(
      resolved.solarHorizonTint[0],
      resolved.solarHorizonTint[1],
      resolved.solarHorizonTint[2]
    );
    data.setVector3("material_SolarHorizonTint", this._solarHorizonTint);
    this._sunRadianceColor.set(
      resolved.sunRadianceColor[0],
      resolved.sunRadianceColor[1],
      resolved.sunRadianceColor[2]
    );
    data.setVector3("material_SunRadianceColor", this._sunRadianceColor);
    this.invalidateHistory();
  }

  /** Detached current optical profile for diagnostics and cloning. */
  get lightingProfile(): Readonly<VolumetricCloudLightingProfile> {
    return createVolumetricCloudLightingProfile(this._lightingProfile);
  }

  /** Detached encoding metadata for the currently installed base-noise resource. */
  get noiseProfile(): Readonly<VolumetricCloudNoiseProfile> {
    return createVolumetricCloudNoiseProfile(this._noiseProfile);
  }

  /** Apply world-space cloud-layer geometry and density-field scale. */
  setScaleSettings(settings: Readonly<VolumetricCloudScaleSettings>): void {
    validateScaleSettings(settings);
    this._scaleSettings = { ...settings };
    const data = this.shaderData;
    data.setFloat("material_PlanetRadius", settings.planetRadius);
    data.setFloat("material_CloudBaseAltitude", settings.baseAltitude);
    data.setFloat("material_CloudThickness", settings.thickness);
    data.setFloat("material_WeatherScale", settings.weatherScale);
    data.setFloat("material_ShapeScale", settings.shapeScale);
    data.setFloat("material_DetailScale", settings.detailScale);
    data.setFloat("material_ShapeVerticalFrequency", settings.shapeVerticalFrequency);
    data.setFloat("material_DetailVerticalFrequency", settings.detailVerticalFrequency);
    this.invalidateHistory();
  }

  /** Detached current cloud scale for diagnostics and cloning. */
  get scaleSettings(): Readonly<VolumetricCloudScaleSettings> {
    return { ...this._scaleSettings };
  }

  /** Set the observing camera's absolute world altitude without changing the authored cloud layer. */
  setObserverAltitude(altitude: number): void {
    if (!Number.isFinite(altitude)) throw new RangeError("Volumetric cloud observer altitude must be finite");
    const invalidationDistance =
      this._scaleSettings.thickness * VOLUMETRIC_CLOUD_QUALITY_PRESETS[this._quality].observerHistoryInvalidationRatio;
    if (Math.abs(altitude - this._observerAltitude) >= invalidationDistance) this.invalidateHistory();
    this._observerAltitude = altitude;
    this.shaderData.setFloat("material_ObserverAltitude", altitude);
  }

  /** Current observer altitude used to convert the absolute cloud layer into a view-relative shell. */
  get observerAltitude(): number {
    return this._observerAltitude;
  }

  /** Apply the current sun direction and sky/cloud radiance palette. */
  setEnvironment(sunDirection: readonly [number, number, number], palette: VolumetricCloudPalette): void {
    const data = this.shaderData;
    this._sunDirection.set(sunDirection[0], sunDirection[1], sunDirection[2]);
    this._zenith.set(palette.zenith[0], palette.zenith[1], palette.zenith[2]);
    this._horizon.set(palette.horizon[0], palette.horizon[1], palette.horizon[2]);
    this._cloudLight.set(palette.cloudLight[0], palette.cloudLight[1], palette.cloudLight[2]);
    this._cloudShadow.set(palette.cloudShadow[0], palette.cloudShadow[1], palette.cloudShadow[2]);
    data.setVector3("material_SunDirection", this._sunDirection);
    data.setVector3("material_Zenith", this._zenith);
    data.setVector3("material_Horizon", this._horizon);
    data.setVector3("material_CloudLight", this._cloudLight);
    data.setVector3("material_CloudShadow", this._cloudShadow);
    data.setFloat("material_Storm", palette.storm);
    data.setFloat("material_CloudDensity", palette.density);
  }

  /** Reject cached cloud history after a weather jump or semantic state switch. */
  invalidateHistory(): void {
    this.shaderData.setFloat("material_DirectionCacheReady", 0);
    this._directionCacheRenderer.invalidateHistory();
  }

  /** @internal */
  _prepareSkyComposition(context: RenderContext, target: ShaderData): void {
    const preset = VOLUMETRIC_CLOUD_QUALITY_PRESETS[this._quality];
    this.shaderData.setFloat("material_HorizonStepMultiplier", preset.directionHorizonStepMultiplier);
    this.shaderData.setFloat("material_HorizonFadeStart", preset.directionHorizonFadeStart);
    this._directionCacheRenderer.render(this, preset);
    this._publishSkyComposition(target);
    this._bindCloudShadow(context);
  }

  /** Prepare a frozen endpoint with one slice per engine frame and no scene/shadow publication.
   * The source must be ready and have no active IBL snapshot lease. Destroy this material to return its borrowed buffer.
   */
  prepareEndpointCache(source: VolumetricCloudMaterial, camera: Camera): boolean {
    if (!this._directionCacheRenderer.texture) {
      this._directionCacheRenderer.borrowWorkingTarget(source._directionCacheRenderer);
    }
    const preset = VOLUMETRIC_CLOUD_QUALITY_PRESETS[this._quality];
    this.shaderData.setFloat("material_HorizonStepMultiplier", preset.directionHorizonStepMultiplier);
    this.shaderData.setFloat("material_HorizonFadeStart", preset.directionHorizonFadeStart);
    // Do not use the invalidation burst: preserve the regular per-frame GPU budget throughout preparation.
    const context = this._engine._renderContext;
    const previousCamera = context.camera;
    const previousFlip = context.flipProjection;
    try {
      // Preparation runs from Scene update, before Camera.render has established a render context.
      context.camera = camera;
      this._directionCacheRenderer.render(this, {
        ...preset,
        directionInvalidationBurstSlices: preset.directionCacheSlices
      });
      return this._directionCacheRenderer.ready;
    } finally {
      context.camera = previousCamera;
      context.flipProjection = previousFlip;
    }
  }

  /** @internal */
  _detachSkyComposition(target: ShaderData): void {
    detachVolumetricCloudSkyComposition(target);
  }

  private _publishSkyComposition(target: ShaderData): void {
    publishVolumetricCloudSkyComposition(target, this._updateSkyCompositionState());
  }

  private _updateSkyCompositionState(): VolumetricCloudSkyCompositionState {
    const renderer = this._directionCacheRenderer;
    const profile = this._lightingProfile;
    const scale = this._scaleSettings;
    const state = this._skyCompositionState;
    state.texture = renderer.texture;
    state.metadataTexture = renderer.metadataTexture;
    state.cacheReady = renderer.ready ? 1 : 0;
    state.cacheCompression = this.shaderData.getFloat("material_CacheHDRCompression");
    state.planetRadius = scale.planetRadius;
    state.observerAltitude = this._observerAltitude;
    state.baseAltitude = scale.baseAltitude;
    state.thickness = scale.thickness;
    state.phaseForwardAnisotropy = profile.phaseForwardAnisotropy;
    state.phaseBackwardAnisotropy = profile.phaseBackwardAnisotropy;
    state.phaseBlend = profile.phaseBlend;
    state.cachePhaseIsotropyBlend = profile.cachePhaseIsotropyBlend;
    state.cacheAmbientWeight = profile.cacheAmbientWeight;
    state.cacheExposureScale = profile.cacheExposureScale;
    state.cacheExposureMinimum = profile.cacheExposureMinimum;
    state.cacheExposureMaximum = profile.cacheExposureMaximum;
    state.cacheEncodingGamma = profile.cacheEncodingGamma;
    return state;
  }

  private _createSkyCompositionSignature(cacheRevision: number): string {
    const state = this._updateSkyCompositionState();
    return [
      this.instanceId,
      cacheRevision,
      state.cacheReady,
      this._windOffsetWS.x,
      this._windOffsetWS.y,
      this._windOffsetWS.z,
      this._windVelocityWS.x,
      this._windVelocityWS.y,
      this._windVelocityWS.z,
      state.cacheCompression,
      state.displayMotion.x,
      state.displayMotion.y,
      state.displayMotion.z,
      state.sunDirection.x,
      state.sunDirection.y,
      state.sunDirection.z,
      state.cloudLight.x,
      state.cloudLight.y,
      state.cloudLight.z,
      state.zenith.x,
      state.zenith.y,
      state.zenith.z,
      state.horizon.x,
      state.horizon.y,
      state.horizon.z,
      state.planetRadius,
      state.observerAltitude,
      state.baseAltitude,
      state.thickness,
      state.phaseForwardAnisotropy,
      state.phaseBackwardAnisotropy,
      state.phaseBlend,
      state.cachePhaseIsotropyBlend,
      state.cacheAmbientWeight,
      state.cacheExposureScale,
      state.cacheExposureMinimum,
      state.cacheExposureMaximum,
      state.cacheEncodingGamma
    ].join("|");
  }

  private _bindCloudShadow(context: RenderContext): void {
    const renderer = this._directionCacheRenderer;
    const texture = renderer.texture;
    const metadata = renderer.metadataTexture;
    if (!texture || !metadata) {
      return;
    }

    const scene = context.camera.scene!;
    if (this._boundShadowScene !== scene) {
      this._unbindCloudShadow();
      this._boundShadowScene = scene;
    }
    // The hemispherical cache is traced from world XZ zero and shared by every camera
    // Moving a camera must not translate the cached cloud field over fixed world geometry
    this._directionCacheOrigin.set(0, this._observerAltitude, 0);
    this._shadowLayer.set(
      this._scaleSettings.planetRadius,
      this._scaleSettings.baseAltitude,
      this._scaleSettings.thickness,
      0
    );
    const data = scene.shaderData;
    data.setTexture(VOLUMETRIC_CLOUD_SHADOW_TEXTURE, texture);
    data.setTexture(VOLUMETRIC_CLOUD_SHADOW_METADATA, metadata);
    data.setVector3("scene_VolumetricCloudShadowOrigin", this._directionCacheOrigin);
    data.setVector3("scene_VolumetricCloudShadowSunDirection", this._sunDirection);
    data.setVector3("scene_VolumetricCloudShadowMotion", renderer.displayMotion);
    data.setVector4("scene_VolumetricCloudShadowLayer", this._shadowLayer);
    data.setVector4("scene_VolumetricCloudShadowTexelSize", renderer.texelSize);
    data.setFloat("scene_VolumetricCloudShadowReady", renderer.ready ? 1 : 0);
    data.enableMacro(VOLUMETRIC_CLOUD_SHADOW_MACRO);
  }

  private _unbindCloudShadow(): void {
    const scene = this._boundShadowScene;
    if (!scene) {
      return;
    }
    const data = scene.shaderData;
    if (data.getTexture(VOLUMETRIC_CLOUD_SHADOW_TEXTURE) === this._directionCacheRenderer.texture) {
      data.disableMacro(VOLUMETRIC_CLOUD_SHADOW_MACRO);
      data.setTexture(VOLUMETRIC_CLOUD_SHADOW_TEXTURE, null);
      data.setTexture(VOLUMETRIC_CLOUD_SHADOW_METADATA, null);
      data.setFloat("scene_VolumetricCloudShadowReady", 0);
    }
    this._boundShadowScene = null;
  }

  private _rebuildMultipleScatteringLUT(): void {
    const previous = this._multipleScatteringLUT;
    const rebuilt = createVolumetricCloudMultipleScatteringTexture(this._engine, this._lightingProfile);
    this._multipleScatteringLUT = rebuilt.texture;
    this._multipleScatteringLUTDecodeScale = rebuilt.decodeScale;
    this.shaderData.setTexture("material_MultipleScatteringLUT", rebuilt.texture);
    this.shaderData.setFloat("material_MultipleScatteringLUTDecodeScale", rebuilt.decodeScale);
    previous.destroy();
  }

  override clone(): VolumetricCloudMaterial {
    const data = this.shaderData;
    const clone = new VolumetricCloudMaterial(this._engine, {
      weatherMap: data.getTexture("material_WeatherMap") as Texture2D,
      shapeProfile: data.getTexture("material_ShapeProfile") as Texture2D,
      baseNoise: data.getTexture("material_NoiseAtlas") as Texture2D,
      detailNoise: data.getTexture("material_DetailNoise") as Texture2DArray,
      curlNoise: data.getTexture("material_CurlNoise") as Texture2D,
      blueNoise: data.getTexture("material_BlueNoise") as Texture2D,
      noiseProfile: this._noiseProfile
    });
    this._cloneToAndModifyName(clone);
    clone.shaderData.setTexture("material_MultipleScatteringLUT", clone._multipleScatteringLUT);
    clone.shaderData.setFloat("material_MultipleScatteringLUTDecodeScale", clone._multipleScatteringLUTDecodeScale);
    clone._quality = this._quality;
    clone.setWeatherMapProfile(this._weatherMapProfile);
    clone.setShapeProfile(this._shapeProfile);
    clone.setLightingProfile(this._lightingProfile);
    clone.setScaleSettings(this._scaleSettings);
    clone.setObserverAltitude(this._observerAltitude);
    // Material.cloneTo copies ShaderData, not the CPU vectors referenced by sky snapshots/cache scheduling.
    clone._sunDirection.copyFrom(this._sunDirection);
    clone._zenith.copyFrom(this._zenith);
    clone._horizon.copyFrom(this._horizon);
    clone._cloudLight.copyFrom(this._cloudLight);
    clone._cloudShadow.copyFrom(this._cloudShadow);
    clone._frameTime = this._frameTime;
    clone._windOffsetWS.copyFrom(this._windOffsetWS);
    clone._windVelocityWS.copyFrom(this._windVelocityWS);
    clone.shaderData.setTexture("material_CloudHistory", null);
    clone.shaderData.setFloat("material_DirectionCacheReady", 0);
    return clone;
  }

  protected override _onDestroy(): void {
    this._unbindCloudShadow();
    this._directionCacheRenderer.destroy();
    super._onDestroy();
    this._multipleScatteringLUT.destroy();
  }
}

function publishVolumetricCloudSkyComposition(target: ShaderData, state: VolumetricCloudSkyCompositionState): void {
  target.setTexture("material_VolumetricCloudHistory", state.texture);
  target.setTexture("material_VolumetricCloudHistoryMetadata", state.metadataTexture);
  target.setVector3("material_VolumetricCloudDisplayMotion", state.displayMotion);
  target.setVector4("material_VolumetricCloudHistoryTexelSize", state.texelSize);
  target.setVector3("material_VolumetricCloudSunDirection", state.sunDirection);
  target.setVector3("material_VolumetricCloudLight", state.cloudLight);
  target.setVector3("material_VolumetricCloudZenith", state.zenith);
  target.setVector3("material_VolumetricCloudHorizon", state.horizon);
  target.setFloat("material_VolumetricCloudCacheReady", state.cacheReady);
  target.setFloat("material_VolumetricCloudCacheCompression", state.cacheCompression);
  target.setFloat("material_VolumetricCloudPlanetRadius", state.planetRadius);
  target.setFloat("material_VolumetricCloudObserverAltitude", state.observerAltitude);
  target.setFloat("material_VolumetricCloudBaseAltitude", state.baseAltitude);
  target.setFloat("material_VolumetricCloudThickness", state.thickness);
  target.setFloat("material_VolumetricCloudPhaseForwardAnisotropy", state.phaseForwardAnisotropy);
  target.setFloat("material_VolumetricCloudPhaseBackwardAnisotropy", state.phaseBackwardAnisotropy);
  target.setFloat("material_VolumetricCloudPhaseBlend", state.phaseBlend);
  target.setFloat("material_VolumetricCloudCachePhaseIsotropyBlend", state.cachePhaseIsotropyBlend);
  target.setFloat("material_VolumetricCloudCacheAmbientWeight", state.cacheAmbientWeight);
  target.setFloat("material_VolumetricCloudCacheExposureScale", state.cacheExposureScale);
  target.setFloat("material_VolumetricCloudCacheExposureMinimum", state.cacheExposureMinimum);
  target.setFloat("material_VolumetricCloudCacheExposureMaximum", state.cacheExposureMaximum);
  target.setFloat("material_VolumetricCloudCacheEncodingGamma", state.cacheEncodingGamma);
}

function detachVolumetricCloudSkyComposition(target: ShaderData): void {
  target.setTexture("material_VolumetricCloudHistory", null);
  target.setTexture("material_VolumetricCloudHistoryMetadata", null);
  target.setFloat("material_VolumetricCloudCacheReady", 0);
}

function validateScaleSettings(settings: Readonly<VolumetricCloudScaleSettings>): void {
  for (const [name, value] of Object.entries(settings)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Volumetric cloud ${name} must be finite and greater than zero`);
    }
  }
}

function scatteringKernelChanged(
  previous: Readonly<VolumetricCloudLightingProfile>,
  next: Readonly<VolumetricCloudLightingProfile>
): boolean {
  return (
    previous.phaseForwardAnisotropy !== next.phaseForwardAnisotropy ||
    previous.phaseBackwardAnisotropy !== next.phaseBackwardAnisotropy ||
    previous.phaseBlend !== next.phaseBlend ||
    previous.singleScatteringAlbedo !== next.singleScatteringAlbedo ||
    previous.multipleScatteringOctaves !== next.multipleScatteringOctaves ||
    previous.multipleScatteringEnergyAttenuation !== next.multipleScatteringEnergyAttenuation ||
    previous.multipleScatteringExtinctionAttenuation !== next.multipleScatteringExtinctionAttenuation ||
    previous.multipleScatteringAnisotropyAttenuation !== next.multipleScatteringAnisotropyAttenuation ||
    previous.multipleScatteringMaxOpticalDepth !== next.multipleScatteringMaxOpticalDepth
  );
}
