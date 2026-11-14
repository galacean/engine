import {
  Color,
  DayNightClock,
  DayNightColorGradient,
  type DayNightCurve,
  DayNightEnvironmentAdapter,
  type DayNightLightingReference,
  DayNightMoonLighting,
  DayNightMoonPosition,
  type DayNightMoonPositionConfig,
  DayNightProceduralSky,
  DayNightSolarPosition,
  type DayNightSolarPositionConfig,
  DayNightSystem,
  DirectLight,
  Entity,
  FogMode,
  type ProbeVolume,
  type Quaternion,
  RealtimeIBLBaker,
  type RealtimeIBLBakerSnapshot,
  type Scene,
  Script,
  ShaderProperty,
  ShadowCascadesMode,
  SkyProceduralMaterial,
  ShadowType,
  type DayNightPhase,
  type DayNightState,
  Vector3,
  type WeatherCloudState,
  type WeatherSkyLightingState,
  type VolumetricCloudMaterial,
  createConstantDayNightCurve,
  createDayNightProfileFromLightingReference
} from "@galacean/engine";
import type {
  TerrainPostProcessPreset,
  TerrainPostProcessRuntime
} from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import {
  PROCEDURAL_SKY_REALTIME_IBL_DYNAMIC_REFRESH_INTERVAL_SECONDS,
  PROCEDURAL_SKY_REALTIME_IBL_OPTIONS,
  PROCEDURAL_SKY_SOLAR_POSITION
} from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import { TerrainAtmosphericFog } from "@galacean/engine-environment/terrain/lighting/TerrainAtmosphericFog";
import { TerrainTimeTransition } from "@galacean/engine-environment/terrain/lighting/TerrainTimeTransition";
import {
  TerrainIBLProfiler,
  type TerrainIBLProfileSnapshot
} from "@galacean/engine-environment/terrain/lighting/TerrainIBLProfiler";
import {
  captureTerrainIBLRevisionBarrier,
  hasPublishedTerrainIBLRevision
} from "@galacean/engine-environment/terrain/lighting/TerrainIBLRevisionBarrier";

const TERRAIN_FOG_EXPONENT_PROPERTY = ShaderProperty.getByName("scene_FogExponent");
const TERRAIN_CUSTOM_FOG_EXPONENT_MACRO = "SCENE_FOG_CUSTOM_EXPONENT";

/** Mutable clock controls for the scene-wide day and night system. */
export interface TerrainLightingClockTuning {
  /** Whether the clock advances automatically. */
  readonly playing: boolean;
  /** Current local hour in the repeating 24-hour cycle. */
  readonly timeHours: number;
  /** Simulated seconds advanced per real second. */
  readonly timeScale: number;
}

/** Direct, indirect, shadow, and fog visibility controlled by diagnostics. */
export interface TerrainLightingVisibility {
  /** Whether the directional light contributes. */
  readonly direct: boolean;
  /** Whether ambient, reflection, and probe lighting contribute. */
  readonly environment: boolean;
  /** Whether the scene renders and samples shadows. */
  readonly shadows: boolean;
  /** Whether authored fog contributes. */
  readonly fog: boolean;
}

/** Weather modifiers composed after the day/night baseline without creating another environment owner. */
export interface TerrainWeatherEnvironmentModifiers {
  readonly ambientLightMultiplier: number;
  readonly reflectionMultiplier: number;
  readonly fogDensityMultiplier: number;
  readonly exposureOffset: number;
}

/** Normalized season weights composed by the environment runtime. */
export interface TerrainSeasonLightingWeights {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** Runtime tuning for the current two-cascade directional shadow layout. */
export interface TerrainShadowCascadeTuning {
  /** Maximum camera distance covered by directional shadows, in metres. */
  readonly distance: number;
  /** Geometric growth ratio between cascades; 1 is uniform and larger values concentrate resolution nearby. */
  readonly distribution: number;
  /** Explicit cascade count; absent preserves the two-cascade default. */
  readonly count?: 2 | 4;
  /** Normalized four-cascade boundaries in increasing order. */
  readonly splits?: readonly [number, number, number];
}

/** Canonical Integrated World camera projection retained by every Terrain entry point. */
export const TERRAIN_DEFAULT_CAMERA_CONFIGURATION = Object.freeze({
  fieldOfView: 50,
  farClipPlane: 12_000,
  enableHDR: true
});

/** Canonical Integrated World initial astronomical hour. */
export const INTEGRATED_WORLD_DEFAULT_TIME_HOURS = 0;

/** Canonical Integrated World day/night clock retained by every Terrain entry point. */
export const TERRAIN_DEFAULT_LIGHTING_CLOCK_TUNING: Readonly<TerrainLightingClockTuning> = Object.freeze({
  playing: false,
  timeHours: INTEGRATED_WORLD_DEFAULT_TIME_HOURS,
  timeScale: 600
});

/** Canonical Integrated World two-cascade shadow distribution. */
export const TERRAIN_DEFAULT_SHADOW_CASCADE_TUNING: Readonly<TerrainShadowCascadeTuning> = Object.freeze({
  distance: 300,
  // Keep the first cascade near 18.75 m: split = 1 / (1 + distribution).
  distribution: 15
});

/** Canonical Integrated World day/night evaluation cadence. */
export const TERRAIN_DEFAULT_LIGHTING_UPDATE_FREQUENCY = 10;

/** Peak cost observed while one progressive realtime IBL revision was processed. */
export interface TerrainIBLBakePerformanceSnapshot {
  /** Bake revision represented by these measurements, or zero before the first sample. */
  readonly revision: number;
  /** Bake schedule frame with the largest complete engine-frame interval. */
  readonly peakFrame: number | null;
  /** Complete engine-frame interval containing {@link peakFrame}, in milliseconds. */
  readonly peakFrameTimeMs: number;
  /** Bake schedule frame with the largest synchronous Baker update cost. */
  readonly peakCpuFrame: number | null;
  /** Synchronous Baker update cost at {@link peakCpuFrame}, in milliseconds. */
  readonly peakCpuTimeMs: number;
}

/** Editable lighting values captured by one probe-volume scenario. */
export interface TerrainBakeLightingTuning {
  /** Local hour represented by the scenario. */
  readonly timeHours: number;
  /** Directional-light energy multiplier. */
  readonly sunIntensity: number;
  /** Directional-light shadow strength. */
  readonly shadowStrength: number;
  /** Linear red channel of the directional-light color. */
  readonly sunColorR: number;
  /** Linear green channel of the directional-light color. */
  readonly sunColorG: number;
  /** Linear blue channel of the directional-light color. */
  readonly sunColorB: number;
  /** Diffuse environment intensity. */
  readonly ambientIntensity: number;
  /** Specular environment intensity. */
  readonly iblIntensity: number;
  /** Post-processing exposure compensation in EV stops. */
  readonly exposureCompensation: number;
  /** Bloom threshold in linear color space. */
  readonly bloomThreshold: number;
  /** Bloom contribution strength. */
  readonly bloomIntensity: number;
  /** Exponential fog density. */
  readonly fogDensity: number;
}

/** Editable source values that control the live Sun, environment, procedural sky, and directional fog. */
export interface TerrainLightingVisualTuning extends TerrainBakeLightingTuning {
  /** World-north rotation relative to the source's astronomical orientation. */
  readonly northOffsetDegrees?: number;
  /** Apparent procedural Sun-disk size. */
  readonly sunSize: number;
  /** Procedural Sun-disk edge convergence. */
  readonly sunSizeConvergence: number;
  /** Procedural-star radiance multiplier. */
  readonly starIntensity: number;
  /** Apparent procedural-star radius multiplier. */
  readonly starSize: number;
  /** Deterministic procedural-star population multiplier. */
  readonly starCount: number;
  /** Per-star scintillation strength. */
  readonly starTwinkleIntensity: number;
  /** Per-star scintillation speed multiplier. */
  readonly starTwinkleSpeed: number;
  /** Renderer-calibrated full-Moon direct-light intensity. */
  readonly moonLightIntensity: number;
  /** Linear full-Moon source-color channels before atmospheric transmission. */
  readonly moonColorR: number;
  readonly moonColorG: number;
  readonly moonColorB: number;
  /** Visible lunar-disk radiance before atmospheric extinction. */
  readonly moonDiskIntensity: number;
  /** Moon-light multiplier used by procedural atmospheric scattering. */
  readonly moonAtmosphereIntensityScale: number;
  /** Artistic apparent Moon-size multiplier. */
  readonly moonAngularScale: number;
  /** Procedural-sky exposure before seasonal and weather modifiers. */
  readonly skyExposure: number;
  /** Twilight atmospheric-radiance multiplier. */
  readonly twilightIntensity: number;
  /** Night-sky airglow radiance multiplier. */
  readonly airglowIntensity: number;
  /** Procedural atmosphere thickness before weather modifiers. */
  readonly atmosphereThickness: number;
  /** Atmosphere-shell height in normalized planet radii. */
  readonly atmosphereHeight: number;
  /** Observer altitude above the normalized planet surface. */
  readonly observerHeight: number;
  /** Rayleigh scattering coefficient. */
  readonly rayleighScattering: number;
  /** Rayleigh density scale height in normalized planet radii. */
  readonly rayleighScaleHeight: number;
  /** Mie scattering coefficient. */
  readonly mieScattering: number;
  /** Mie density scale height in normalized planet radii. */
  readonly mieScaleHeight: number;
  /** Mie forward-scattering anisotropy. */
  readonly mieAnisotropy: number;
  /** Solar single-scattering radiance multiplier. */
  readonly scatteringIntensity: number;
  /** Aerosol-derived apparent-horizon transition multiplier. */
  readonly horizonHaze: number;
  /** View-ray single-scattering sample count. */
  readonly atmosphereSampleCount: number;
  /** Linear spectral tint channels used to derive Rayleigh scattering wavelengths. */
  readonly skyTintR: number;
  readonly skyTintG: number;
  readonly skyTintB: number;
  /** Linear procedural-ground albedo channels below the geometric horizon. */
  readonly groundTintR: number;
  readonly groundTintG: number;
  readonly groundTintB: number;
  /** Blend strength of the artist-authored upper-sky tint gradient. */
  readonly customSkyTintStrength: number;
  /** Linear tint multiplier at the zenith. */
  readonly customSkyZenithR: number;
  readonly customSkyZenithG: number;
  readonly customSkyZenithB: number;
  /** Linear tint multiplier at the geometric horizon. */
  readonly customSkyHorizonR: number;
  readonly customSkyHorizonG: number;
  readonly customSkyHorizonB: number;
  /** Active built-in distance-fog equation. Visibility is controlled independently. */
  readonly fogMode: FogMode;
  /** Power applied to density-scaled distance by both exponential fog modes. */
  readonly fogExponent: number;
  /** Distance where Linear fog begins. */
  readonly fogStart: number;
  /** Distance where Linear fog reaches full extinction. */
  readonly fogEnd: number;
  /** Scalar exposure applied to procedural-sky fog radiance. */
  readonly fogRadianceIntensity: number;
  /** Linear RGB multiplier applied to directional fog radiance. */
  readonly fogTintR: number;
  readonly fogTintG: number;
  readonly fogTintB: number;
}

/** One weather- and season-independent authoring sample on the repeating 24-hour lighting timeline. */
export interface TerrainTimeOfDayLightingSample extends TerrainBakeLightingTuning {
  readonly sunSize: number;
  readonly sunSizeConvergence: number;
  readonly starIntensity: number;
  /** Full-Moon direct-light intensity authored on the repeating time line. */
  readonly moonLightIntensity: number;
  readonly twilightIntensity: number;
  readonly airglowIntensity: number;
  readonly skyExposure: number;
  readonly atmosphereThickness: number;
  readonly atmosphereHeight: number;
  readonly observerHeight: number;
  readonly rayleighScattering: number;
  readonly rayleighScaleHeight: number;
  readonly mieScattering: number;
  readonly mieScaleHeight: number;
  readonly mieAnisotropy: number;
  readonly scatteringIntensity: number;
  readonly horizonHaze: number;
  readonly atmosphereSampleCount: number;
  readonly skyTintR: number;
  readonly skyTintG: number;
  readonly skyTintB: number;
  readonly groundTintR: number;
  readonly groundTintG: number;
  readonly groundTintB: number;
  readonly customSkyTintStrength: number;
  readonly customSkyZenithR: number;
  readonly customSkyZenithG: number;
  readonly customSkyZenithB: number;
  readonly customSkyHorizonR: number;
  readonly customSkyHorizonG: number;
  readonly customSkyHorizonB: number;
  readonly fogStart: number;
  readonly fogEnd: number;
  readonly fogRadianceIntensity: number;
  readonly fogTintR: number;
  readonly fogTintG: number;
  readonly fogTintB: number;
}

/** Canonical Integrated World daylight, fog, and post-processing presentation. */
export const TERRAIN_DEFAULT_VISUAL_LIGHTING_TUNING: Readonly<Partial<TerrainLightingVisualTuning>> = Object.freeze({
  sunIntensity: 2,
  shadowStrength: 1,
  sunColorR: 1,
  sunColorG: 0.847,
  sunColorB: 0.68,
  ambientIntensity: 1,
  iblIntensity: 1,
  skyExposure: 1.37,
  atmosphereThickness: 0.93,
  skyTintR: 0.238,
  skyTintG: 0.267,
  skyTintB: 0.267,
  groundTintR: 0.154,
  groundTintG: 0.154,
  groundTintB: 0.12,
  fogDensity: 0.00089,
  fogExponent: 1,
  fogTintR: 1,
  fogTintG: 1,
  fogTintB: 1,
  exposureCompensation: 1,
  bloomThreshold: 0.59,
  bloomIntensity: 1
});

/** Artist-approved post-processing values used whenever the Sun is in the Day phase. */
export const TERRAIN_DAY_POST_PROCESS_PRESET: Readonly<TerrainPostProcessPreset> = Object.freeze({
  postExposure: 0.42,
  temperature: 10,
  tint: 0,
  contrast: 7,
  saturation: 18,
  bloomTint: [1.075, 0.749, 0.391] as const,
  bloomThreshold: 0.69,
  bloomIntensity: 1,
  bloomScatter: 0.3
});

/** Artist-approved post-processing values used whenever the Sun is in the Night phase. */
export const TERRAIN_NIGHT_POST_PROCESS_PRESET: Readonly<TerrainPostProcessPreset> = Object.freeze({
  postExposure: 1,
  temperature: 0,
  tint: 0,
  contrast: 0,
  saturation: 0,
  bloomTint: [1.075, 0.749, 0.391] as const,
  bloomThreshold: 0.69,
  bloomIntensity: 1,
  bloomScatter: 0.3
});

const TERRAIN_SKY_TIME_CURVE_KEYS = [
  "starIntensity",
  "twilightIntensity",
  "airglowIntensity",
  "atmosphereHeight",
  "observerHeight",
  "rayleighScattering",
  "rayleighScaleHeight",
  "mieScattering",
  "mieScaleHeight",
  "mieAnisotropy",
  "scatteringIntensity",
  "horizonHaze",
  "atmosphereSampleCount",
  "customSkyTintStrength"
] as const;

type TerrainSkyTimeCurveKey = (typeof TERRAIN_SKY_TIME_CURVE_KEYS)[number];
type TerrainSkyTimeCurves = Record<TerrainSkyTimeCurveKey, DayNightCurve>;

const TERRAIN_PRESENTATION_TIME_CURVE_KEYS = [
  "sunSize",
  "sunSizeConvergence",
  "fogStart",
  "fogEnd",
  "fogRadianceIntensity",
  "fogTintR",
  "fogTintG",
  "fogTintB"
] as const;

type TerrainPresentationTimeCurveKey = (typeof TERRAIN_PRESENTATION_TIME_CURVE_KEYS)[number];
type TerrainPresentationTimeCurves = Record<TerrainPresentationTimeCurveKey, DayNightCurve>;

/** Evaluated lighting state exposed to diagnostics and authoring controls. */
export interface TerrainLightingRuntimeSnapshot extends TerrainLightingClockTuning, TerrainLightingVisibility {
  /** World-local sRGB sky tint override; null uses the authored day/night sky. */
  readonly skyColorRgb: readonly [number, number, number] | null;
  /** Whether realtime SH and GGX bake work may be submitted. */
  readonly iblBakingEnabled: boolean;
  /** Named phase evaluated from the current time. */
  readonly phase: DayNightPhase;
  /** Evaluated solar elevation in degrees. */
  readonly sunElevation: number;
  /** Evaluated solar azimuth in degrees. */
  readonly sunAzimuth: number;
  /** Evaluated directional-light energy. */
  readonly sunIntensity: number;
  /** Final peak directional-light radiance after season, weather, and cloud extinction. */
  readonly visibleSunIntensity: number;
  /** Final linear directional-light RGB uploaded to surface shaders. */
  readonly directLightColor: readonly [number, number, number];
  /** Solar-only RGB before the Moon is allowed to drive the shared DirectLight. */
  readonly sunLightColor: readonly [number, number, number];
  /** Celestial direct light with the greatest current surface-light contribution. */
  readonly dominantDirectSource: "Sun" | "Moon" | "None";
  /** Celestial DirectLight that currently owns the scene shadow map. */
  readonly shadowCaster: "Sun" | "Moon" | "None";
  /** Final linear RGB of the Moon DirectLight uploaded to surface shaders. */
  readonly moonLightColor: readonly [number, number, number];
  /** Weather-only direct-light multiplier. */
  readonly weatherDirectIntensity: number;
  /** Weather-only shadow-strength multiplier. */
  readonly weatherShadowStrength: number;
  /** Cloud optical transmission applied after every other direct-light modifier. */
  readonly cloudTransmittance: number;
  /** Seasonal RGB multiplier applied to direct sunlight. */
  readonly seasonDirectTint: readonly [number, number, number];
  /** Seasonal energy multiplier applied independently from direct-light color. */
  readonly seasonDirectIntensity: number;
  /** Seasonal RGB multiplier baked into sky and environment lighting. */
  readonly seasonEnvironmentTint: readonly [number, number, number];
  /** Evaluated lunar elevation in degrees. */
  readonly moonElevation: number;
  /** Evaluated lunar azimuth in degrees. */
  readonly moonAzimuth: number;
  /** Illuminated fraction of the apparent lunar disk. */
  readonly moonIlluminatedFraction: number;
  /** Evaluated Moon directional-light energy. */
  readonly moonIntensity: number;
  /** Evaluated shadow strength. */
  readonly shadowStrength: number;
  /** Day contribution in the normalized transition range. */
  readonly dayFactor: number;
  /** Twilight contribution in the normalized transition range. */
  readonly twilightFactor: number;
  /** Night contribution in the normalized transition range. */
  readonly nightFactor: number;
  /** Evaluated diffuse environment intensity. */
  readonly ambientIntensity: number;
  /** Evaluated specular environment intensity. */
  readonly iblIntensity: number;
  /** Evaluated visible-sky exposure. */
  readonly skyExposure: number;
  /** Evaluated post-processing exposure compensation. */
  readonly exposureCompensation: number;
  /** Evaluated Bloom threshold. */
  readonly bloomThreshold: number;
  /** Current Bloom contribution strength. */
  readonly bloomIntensity: number;
  /** Evaluated fog density. */
  readonly fogDensity: number;
  /** Active power applied to density-scaled distance by exponential fog. */
  readonly fogExponent: number;
  /** Spherical-mean fog radiance retained for diagnostics and legacy shader fallback. */
  readonly fogColor: readonly [number, number, number];
  /** Evaluated procedural-atmosphere thickness. */
  readonly atmosphereThickness: number;
  /** Progressive SH and GGX environment bake transaction. */
  readonly iblBake: RealtimeIBLBakerSnapshot;
  /** Peak whole-frame and synchronous CPU cost for the latest measured IBL revision. */
  readonly iblBakePerformance: TerrainIBLBakePerformanceSnapshot;
}

type MutableTerrainIBLBakePerformanceSnapshot = {
  -readonly [K in keyof TerrainIBLBakePerformanceSnapshot]: TerrainIBLBakePerformanceSnapshot[K];
};

interface WebGL2EngineInternals {
  readonly _hardwareRenderer: {
    readonly gl: WebGL2RenderingContext;
    readonly isWebGL2: boolean;
  };
}

interface TerrainLightingReference extends DayNightLightingReference {
  bloomIntensity: number;
}

const MOVING_SKY_IBL_INTERVAL_HOURS = 1;
type TerrainSeasonColorTable = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number]
];
type TerrainSeasonScalarTable = readonly [number, number, number, number];

// Spring, summer, autumn, winter. Summer is the authored neutral baseline.
const SEASON_DIRECT_LIGHT_TINTS: TerrainSeasonColorTable = [
  [1, 1, 1],
  [1, 1, 1],
  [1, 1, 1],
  [1, 1, 1]
];
const SEASON_SKY_LIGHT_TINTS: TerrainSeasonColorTable = [
  [0.98, 1.03, 1],
  [1, 1, 1],
  [1.04, 0.96, 0.86],
  [0.617809, 0.722186, 0.898039]
];
const SEASON_GROUND_LIGHT_TINTS: TerrainSeasonColorTable = [
  [1.02, 1.02, 0.96],
  [1, 1, 1],
  [1.08, 0.94, 0.8],
  [1, 1, 1]
];
// The Scene-authored daylight reference has unit energy, so full winter maps directly to Unity's intensity 1.7.
const SEASON_DIRECT_MULTIPLIERS: TerrainSeasonScalarTable = [1.02, 1, 0.9, 1.7];
const SEASON_AMBIENT_MULTIPLIERS: TerrainSeasonScalarTable = [1.02, 1, 0.98, 1];
const SEASON_IBL_MULTIPLIERS: TerrainSeasonScalarTable = [1, 1, 1, 1];
const SEASON_FOG_DENSITY_MULTIPLIERS: TerrainSeasonScalarTable = [1, 1, 1.05, 1.5];

/**
 * Applies one shared day/night state to the Project-loaded light, environment,
 * fog, sun-driven procedural sky, post-processing profile, and probe-volume visibility.
 */
/** Environment-owned participant in the single time/season/IBL transition clock. */
export interface TerrainEnvironmentTransition {
  captureTarget(): { ready: boolean; clouds: VolumetricCloudMaterial };
  restoreSourceLighting(): void;
  advance(progress: number): void;
  release(completed: boolean): void;
}

export class TerrainLightingRuntime {
  private readonly _celestialPosition: Readonly<DayNightSolarPositionConfig & DayNightMoonPositionConfig>;
  private _northOffsetDegrees = 0;
  private static readonly _directLightUp = new Vector3(0, 1, 0);

  /** Shared clock and evaluated state consumed by every lighting subsystem. */
  readonly system: DayNightSystem;

  private readonly _scene: Scene;
  private readonly _directLight: DirectLight;
  private readonly _postProcess: TerrainPostProcessRuntime;
  private readonly _environmentAdapter: DayNightEnvironmentAdapter;
  private readonly _moonLighting: DayNightMoonLighting;
  private readonly _proceduralSky: DayNightProceduralSky;
  private readonly _iblProfiler: TerrainIBLProfiler;
  private readonly _iblBaker: RealtimeIBLBaker;
  private readonly _authoredSunColor = new Color();
  private readonly _sunDirectColor = new Color();
  private readonly _moonDirectColor = new Color();
  private readonly _directLightTarget = new Vector3();
  private readonly _initialDirectColor: Color;
  private readonly _initialDirectRotation: Quaternion;
  private readonly _initialDirectEnabled: boolean;
  private readonly _initialDirectCullingMask: number;
  private readonly _initialShadowType: ShadowType;
  private readonly _initialShadowStrength: number;
  private readonly _initialCastShadows: boolean;
  private readonly _initialShadowCascades: ShadowCascadesMode;
  private readonly _initialShadowDistance: number;
  private readonly _initialShadowTwoCascadeSplits: number;
  private readonly _initialAmbientDiffuse: number;
  private readonly _initialAmbientSpecular: number;
  private readonly _initialFogMode: FogMode;
  private readonly _initialFogColor: Color;
  private readonly _initialFogStart: number;
  private readonly _initialFogEnd: number;
  private readonly _initialFogDensity: number;
  private readonly _initialBackgroundColor: Color;
  private readonly _initialSun: DirectLight | null;
  private readonly _initialPostProcess: ReturnType<TerrainPostProcessRuntime["getDebugSnapshot"]>;
  private readonly _initialProbeVolume: ProbeVolume | undefined;
  private readonly _bloomIntensityCurve: DayNightCurve;
  private readonly _moonLightIntensityCurve: DayNightCurve;
  private readonly _skyTimeCurves: TerrainSkyTimeCurves;
  private readonly _customSkyZenithTintGradient: DayNightColorGradient;
  private readonly _customSkyHorizonTintGradient: DayNightColorGradient;
  private _skyColorRgb: readonly [number, number, number] | null = null;
  private readonly _skyColorTint = new Color(1, 1, 1, 1);
  private readonly _presentationTimeCurves: TerrainPresentationTimeCurves;
  private readonly _atmosphericFog: TerrainAtmosphericFog;
  private readonly _driver: TerrainLightingDriver;
  private _visibility: TerrainLightingVisibility;
  private _probeVolume: ProbeVolume | undefined;
  private _authoredAmbientIntensity: number;
  private _authoredIblIntensity: number;
  private _authoredFogMode: FogMode;
  private _authoredFogDensity: number;
  private _fogExponent: number;
  private _authoredSkyExposure: number;
  private _authoredAtmosphereThickness: number;
  private readonly _authoredSkyTint = new Color();
  private readonly _authoredGroundTint = new Color();
  private _shadowCascadeTuning: TerrainShadowCascadeTuning;
  private readonly _iblBakePerformance = createEmptyIBLBakePerformance();
  private _pendingIBLBakeFrameRevision = 0;
  private _pendingIBLBakeFrameIndex = -1;
  private _iblBakingEnabled = true;
  private _environmentIBLStartupDrainActive = false;
  private _weatherDirectModifier = 1;
  private _weatherShadowModifier = 1;
  private _weatherLightningEnergy = 1;
  private _sunCloudTransmittance = 1;
  private _weatherAmbientModifier = 1;
  private _weatherIblModifier = 1;
  private _weatherFogDensityModifier = 1;
  private _weatherExposureOffset = 0;
  private readonly _seasonDirectTint = new Color(1, 1, 1, 1);
  private readonly _seasonSkyTint = new Color(1, 1, 1, 1);
  private readonly _seasonGroundTint = new Color(1, 1, 1, 1);
  private _seasonDirectModifier = 1;
  private _seasonAmbientModifier = 1;
  private _seasonIblModifier = 1;
  private _seasonFogDensityModifier = 1;
  private _lastRequestedIBLTimeHours = Number.NaN;
  private _dynamicEnvironmentBakeElapsedSeconds = 0;
  private _dominantDirectSource: "Sun" | "Moon" | "None" = "None";
  private _destroyed = false;
  private _timeIBLTransition: AbortController | null = null;
  private _environmentTransitionFactory?: (duration: number) => TerrainEnvironmentTransition;
  private _environmentTransition: TerrainEnvironmentTransition | null = null;
  private _environmentBakePending = false;
  private readonly _timeTransition = new TerrainTimeTransition((hours, finished, progress) => {
    this.system.clock.paused = true;
    this.system.setTimeHours(hours);
    this._environmentTransition?.advance(progress);
    if (this._timeIBLTransition) this._iblBaker.blendTransition(progress);
    else if (finished) this._requestProceduralSkyBake(true);
  });

  /**
   * Captures the Project-loaded daylight state and installs a paused reproducible clock.
   * @param driverEntity Scene entity that owns the lightweight update driver.
   * @param scene Loaded Scene receiving environment and probe state.
   * @param directLight Scene-authored directional light.
   * @param postProcess Scene-authored post-processing runtime.
   * @param celestialPosition Geographic and calendar inputs shared by the sky and directional lights.
   */
  constructor(
    driverEntity: Entity,
    scene: Scene,
    directLight: DirectLight,
    postProcess: TerrainPostProcessRuntime,
    celestialPosition: Readonly<
      DayNightSolarPositionConfig & DayNightMoonPositionConfig
    > = PROCEDURAL_SKY_SOLAR_POSITION
  ) {
    this._celestialPosition = { ...celestialPosition };
    this._scene = scene;
    this._directLight = directLight;
    this._postProcess = postProcess;
    this._initialDirectColor = directLight.color.clone();
    this._initialDirectRotation = directLight.entity.transform.rotationQuaternion.clone();
    this._initialDirectEnabled = directLight.enabled;
    this._initialDirectCullingMask = directLight.cullingMask;
    this._initialShadowType = directLight.shadowType;
    this._initialShadowStrength = directLight.shadowStrength;
    this._initialCastShadows = scene.castShadows;
    this._initialShadowCascades = scene.shadowCascades;
    this._initialShadowDistance = scene.shadowDistance;
    this._initialShadowTwoCascadeSplits = scene.shadowTwoCascadeSplits;
    this._initialAmbientDiffuse = scene.ambientLight.diffuseIntensity;
    this._initialAmbientSpecular = scene.ambientLight.specularIntensity;
    this._initialFogMode = scene.fogMode;
    this._initialFogColor = scene.fogColor.clone();
    this._initialFogStart = scene.fogStart;
    this._initialFogEnd = scene.fogEnd;
    this._initialFogDensity = scene.fogDensity;
    this._initialBackgroundColor = scene.background.solidColor.clone();
    this._initialSun = scene.sun ?? null;
    this._atmosphericFog = new TerrainAtmosphericFog(scene);
    const solarPosition = new DayNightSolarPosition(celestialPosition);
    const moonPosition = new DayNightMoonPosition(celestialPosition);
    this._proceduralSky = new DayNightProceduralSky(scene, solarPosition, "TerrainProceduralSky");
    const postProcessSnapshot = postProcess.getDebugSnapshot();
    this._initialPostProcess = postProcessSnapshot;
    this._initialProbeVolume = scene.environmentLighting.probeVolume;
    this._probeVolume = this._initialProbeVolume;
    this._authoredAmbientIntensity = this._initialAmbientDiffuse;
    this._authoredIblIntensity = this._initialAmbientSpecular;
    this._authoredFogMode = this._initialFogMode;
    this._authoredFogDensity = this._initialFogDensity;
    this._fogExponent = getTerrainFogModeDefaultExponent(this._initialFogMode);
    scene.shaderData.enableMacro(TERRAIN_CUSTOM_FOG_EXPONENT_MACRO);
    scene.shaderData.setFloat(TERRAIN_FOG_EXPONENT_PROPERTY, this._fogExponent);
    this._authoredSkyExposure = this._proceduralSky.material.exposure;
    this._authoredAtmosphereThickness = this._proceduralSky.material.atmosphereThickness;
    this._authoredSkyTint.copyFrom(this._proceduralSky.material.skyTint);
    this._authoredGroundTint.copyFrom(this._proceduralSky.material.groundTint);
    this._shadowCascadeTuning = { ...TERRAIN_DEFAULT_SHADOW_CASCADE_TUNING };
    this._applyShadowCascadeTuning();
    this._visibility = {
      direct: directLight.enabled,
      environment:
        this._initialAmbientDiffuse > 0 || this._initialAmbientSpecular > 0 || this._probeVolume !== undefined,
      shadows: scene.castShadows && directLight.shadowType !== ShadowType.None,
      fog: this._initialFogMode !== FogMode.None
    };

    const reference = captureLightingReference(scene, directLight, postProcessSnapshot);
    const profile = createDayNightProfileFromLightingReference(reference, solarPosition, moonPosition);
    const clock = new DayNightClock(TERRAIN_DEFAULT_LIGHTING_CLOCK_TUNING.timeHours);
    clock.timeScale = TERRAIN_DEFAULT_LIGHTING_CLOCK_TUNING.timeScale;
    clock.paused = !TERRAIN_DEFAULT_LIGHTING_CLOCK_TUNING.playing;
    this.system = new DayNightSystem(clock, profile);
    this.system.updateFrequency = TERRAIN_DEFAULT_LIGHTING_UPDATE_FREQUENCY;
    this._bloomIntensityCurve = createConstantDayNightCurve(reference.bloomIntensity);
    this._skyTimeCurves = createTerrainSkyTimeCurves(this._proceduralSky.material);
    this._customSkyZenithTintGradient = createConstantDayNightColorGradient(
      this._proceduralSky.material.customSkyZenithTint
    );
    this._customSkyHorizonTintGradient = createConstantDayNightColorGradient(
      this._proceduralSky.material.customSkyHorizonTint
    );
    this._presentationTimeCurves = createTerrainPresentationTimeCurves(
      this._proceduralSky.material,
      scene,
      this._atmosphericFog
    );
    scene.sun = directLight;
    this._moonLighting = new DayNightMoonLighting(scene, {
      entityName: "Terrain Moon",
      createDirectLight: false
    });
    this._moonLightIntensityCurve = createConstantDayNightCurve(this._moonLighting.options.fullMoonIntensity);
    const hardwareRenderer = (scene.engine as unknown as WebGL2EngineInternals)._hardwareRenderer;
    if (!hardwareRenderer.isWebGL2) {
      throw new Error("Terrain realtime IBL profiling requires WebGL2");
    }
    // GPU timer queries are a diagnostic cost, so production scenes opt in only while profiling.
    this._iblProfiler = new TerrainIBLProfiler(hardwareRenderer.gl, { enabled: false });
    this._iblBaker = new RealtimeIBLBaker(scene, {
      resolution: PROCEDURAL_SKY_REALTIME_IBL_OPTIONS.resolution,
      sampleCount: PROCEDURAL_SKY_REALTIME_IBL_OPTIONS.sampleCount,
      profiler: this._iblProfiler
    });
    this._environmentAdapter = new DayNightEnvironmentAdapter(scene, {
      sun: directLight,
      sky: this._proceduralSky,
      moon: this._moonLighting,
      fogMode: this._initialFogMode
    });
    this.system.addConsumer({ applyDayNightState: (state) => this._applyDayNightState(state) });

    const driver = (this._driver = driverEntity.addComponent(TerrainLightingDriver));
    driver.runtime = this;
  }

  /**
   * Returns direct, environment, shadow, and fog visibility without exposing Scene objects.
   * @returns Detached visibility state.
   */
  getVisibility(): TerrainLightingVisibility {
    this._assertAlive();
    return { ...this._visibility };
  }

  /** Reads fog color-source and distance authoring independently of the light timeline. */
  getFogAppearance() {
    return this._atmosphericFog.getAppearance();
  }

  /** Updates the fog shader variant and custom color without overriding environment radiance. */
  setFogAppearance(values: Parameters<TerrainAtmosphericFog["setAppearance"]>[0]): void {
    this._atmosphericFog.setAppearance(values);
  }

  /** Returns the current two-cascade distance and geometric distribution. */
  getShadowCascadeTuning(): TerrainShadowCascadeTuning {
    this._assertAlive();
    return { ...this._shadowCascadeTuning };
  }

  /** Updates the two-cascade distance or geometric distribution without rebuilding the Scene. */
  setShadowCascadeTuning(values: Partial<TerrainShadowCascadeTuning>): void {
    this._assertAlive();
    const next = { ...this._shadowCascadeTuning, ...values };
    if (!Number.isFinite(next.distance) || next.distance <= 0) {
      throw new RangeError("Terrain shadow distance must be finite and positive");
    }
    if (!Number.isFinite(next.distribution) || next.distribution < 1) {
      throw new RangeError("Terrain shadow distribution must be finite and at least one");
    }
    if (next.count !== undefined && next.count !== 2 && next.count !== 4)
      throw new RangeError("Shadow cascade count must be two or four");
    if (
      next.splits &&
      (next.splits.length !== 3 ||
        next.splits.some((v, i) => !Number.isFinite(v) || v <= (i ? next.splits![i - 1] : 0) || v >= 1))
    )
      throw new RangeError("Shadow cascade splits must increase inside (0, 1)");
    this._shadowCascadeTuning = next;
    this._applyShadowCascadeTuning();
  }

  /**
   * Changes diagnostic visibility while retaining the evaluated day/night values.
   * @param values Partial direct, environment, shadow, or fog visibility.
   * @returns Nothing.
   */
  setVisibility(values: Partial<TerrainLightingVisibility>): void {
    this._assertAlive();
    this._visibility = { ...this._visibility, ...values };
    this._environmentAdapter.applyDayNightState(this.system.state);
    this._applyCelestialDirectLight();
    this._applyVisibility();
    this._synchronizeAtmosphericFog();
  }

  /** Composes independent sky-lighting and cloud-optics channels after the astronomical baseline. */
  applyWeatherState(
    state: Readonly<WeatherSkyLightingState>,
    cloud: Readonly<WeatherCloudState>,
    lightningEnergy = 1
  ): void {
    this._assertAlive();
    if (!Number.isFinite(lightningEnergy) || lightningEnergy < 0) {
      throw new RangeError("Terrain weather lightning energy must be finite and non-negative");
    }
    const directLightMultiplier = state.directLightMultiplier;
    const shadowStrengthMultiplier = state.shadowStrengthMultiplier;
    const cloudTransmittance = cloud.cloudTransmittance;
    const lightningLift = lightningEnergy - 1;
    const ambientLightMultiplier = state.ambientLightMultiplier * (1 + lightningLift * 0.24);
    const reflectionMultiplier = state.reflectionMultiplier;
    const fogDensityMultiplier = state.fogDensityMultiplier;
    const exposureOffset = state.exposureOffset + lightningLift * 0.1;
    if (
      !Number.isFinite(directLightMultiplier) ||
      !Number.isFinite(shadowStrengthMultiplier) ||
      !Number.isFinite(cloudTransmittance) ||
      !Number.isFinite(ambientLightMultiplier) ||
      !Number.isFinite(reflectionMultiplier) ||
      !Number.isFinite(fogDensityMultiplier) ||
      !Number.isFinite(exposureOffset)
    ) {
      throw new RangeError("Terrain weather lighting values must be finite");
    }
    if (ambientLightMultiplier < 0 || reflectionMultiplier < 0 || fogDensityMultiplier < 0) {
      throw new RangeError("Weather environment intensity modifiers must be non-negative");
    }
    const resolvedCloudTransmittance = clamp01(cloudTransmittance);
    const resolvedDirectLightMultiplier = Math.max(0, directLightMultiplier);
    const resolvedShadowStrengthMultiplier = clamp01(shadowStrengthMultiplier);
    if (
      resolvedCloudTransmittance === this._sunCloudTransmittance &&
      resolvedDirectLightMultiplier === this._weatherDirectModifier &&
      resolvedShadowStrengthMultiplier === this._weatherShadowModifier &&
      lightningEnergy === this._weatherLightningEnergy &&
      ambientLightMultiplier === this._weatherAmbientModifier &&
      reflectionMultiplier === this._weatherIblModifier &&
      fogDensityMultiplier === this._weatherFogDensityModifier &&
      exposureOffset === this._weatherExposureOffset
    ) {
      return;
    }
    this._sunCloudTransmittance = resolvedCloudTransmittance;
    this._weatherDirectModifier = resolvedDirectLightMultiplier;
    this._weatherShadowModifier = resolvedShadowStrengthMultiplier;
    this._weatherLightningEnergy = lightningEnergy;
    this._weatherAmbientModifier = ambientLightMultiplier;
    this._weatherIblModifier = reflectionMultiplier;
    this._weatherFogDensityModifier = fogDensityMultiplier;
    this._weatherExposureOffset = exposureOffset;
    this._applyCelestialDirectLight();
    this._applyVisibility();
    this._applyWeatherPostProcess();
  }

  /** Applies seasonal color temperature without taking ownership of weather or astronomical time. */
  applySeasonLighting(weights: Readonly<TerrainSeasonLightingWeights>): void {
    this._assertAlive();
    const x = weights.x;
    const y = weights.y;
    const z = weights.z;
    const w = weights.w;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(w) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1 ||
      z < 0 ||
      z > 1 ||
      w < 0 ||
      w > 1
    ) {
      throw new RangeError("Terrain season lighting weights must be finite and in [0, 1]");
    }
    const total = x + y + z + w;
    if (Math.abs(total - 1) > 1e-4) {
      throw new RangeError("Terrain season lighting weights must sum to one");
    }
    mixSeasonLightingColor(this._seasonDirectTint, weights, SEASON_DIRECT_LIGHT_TINTS);
    mixSeasonLightingColor(this._seasonSkyTint, weights, SEASON_SKY_LIGHT_TINTS);
    mixSeasonLightingColor(this._seasonGroundTint, weights, SEASON_GROUND_LIGHT_TINTS);
    this._seasonDirectModifier = mixSeasonLightingScalar(weights, SEASON_DIRECT_MULTIPLIERS);
    this._seasonAmbientModifier = mixSeasonLightingScalar(weights, SEASON_AMBIENT_MULTIPLIERS);
    this._seasonIblModifier = mixSeasonLightingScalar(weights, SEASON_IBL_MULTIPLIERS);
    this._seasonFogDensityModifier = mixSeasonLightingScalar(weights, SEASON_FOG_DENSITY_MULTIPLIERS);
    this._applyCelestialDirectLight();
    this._applyVisibility();
    this._applySkyAtmosphere();
  }

  /** Applies cloud optical extinction without changing the engine-owned solar path. */
  setSunCloudTransmittance(transmittance: number): void {
    this._assertAlive();
    if (!Number.isFinite(transmittance)) throw new RangeError("Sun cloud transmittance must be finite");
    this._sunCloudTransmittance = clamp01(transmittance);
    this._applyCelestialDirectLight();
  }

  /** Applies weather energy, shadow, and lightning modifiers to the current day/night baseline. */
  applyWeatherSolarModifiers(direct: number, shadow: number, lightningEnergy = 1): void {
    this._assertAlive();
    if (!Number.isFinite(direct) || !Number.isFinite(shadow) || !Number.isFinite(lightningEnergy)) {
      throw new RangeError("Weather solar modifiers must be finite");
    }
    this._weatherDirectModifier = Math.max(0, direct);
    this._weatherShadowModifier = clamp01(shadow);
    this._weatherLightningEnergy = Math.max(0, lightningEnergy);
    this._applyCelestialDirectLight();
    this._applyVisibility();
  }

  /** Applies weather to indirect light, fog, and exposure after the current astronomical baseline. */
  applyWeatherEnvironmentModifiers(modifiers: Readonly<TerrainWeatherEnvironmentModifiers>): void {
    this._assertAlive();
    if (
      !Number.isFinite(modifiers.ambientLightMultiplier) ||
      !Number.isFinite(modifiers.reflectionMultiplier) ||
      !Number.isFinite(modifiers.fogDensityMultiplier) ||
      !Number.isFinite(modifiers.exposureOffset)
    ) {
      throw new RangeError("Weather environment modifiers must be finite");
    }
    if (
      modifiers.ambientLightMultiplier < 0 ||
      modifiers.reflectionMultiplier < 0 ||
      modifiers.fogDensityMultiplier < 0
    ) {
      throw new RangeError("Weather environment intensity modifiers must be non-negative");
    }
    this._weatherAmbientModifier = modifiers.ambientLightMultiplier;
    this._weatherIblModifier = modifiers.reflectionMultiplier;
    this._weatherFogDensityModifier = modifiers.fogDensityMultiplier;
    this._weatherExposureOffset = modifiers.exposureOffset;
    this._applyVisibility();
    this._applyWeatherPostProcess();
  }

  /**
   * Replaces the authored probe volume while respecting the environment-light switch.
   * @param probeVolume Active baked volume, or `undefined` when no bake is published.
   * @returns Nothing.
   */
  setProbeVolume(probeVolume: ProbeVolume | undefined): void {
    this._assertAlive();
    this._probeVolume = probeVolume;
    this._applyVisibility();
  }

  /** Installs one circular, weather-independent lighting profile shared by every time of day. */
  setTimeOfDayLightingProfile(samples: readonly TerrainTimeOfDayLightingSample[]): void {
    this._assertAlive();
    const sorted = validateTimeOfDayLightingSamples(samples);
    const profile = this.system.profile;
    profile.sunIntensity.setKeys(createCircularCurveKeys(sorted, (sample) => sample.sunIntensity));
    profile.shadowStrength.setKeys(createCircularCurveKeys(sorted, (sample) => sample.shadowStrength));
    profile.sunColor.setKeys(
      createCircularColorKeys(sorted, (sample) => new Color(sample.sunColorR, sample.sunColorG, sample.sunColorB, 1))
    );
    profile.ambientIntensity.setKeys(createCircularCurveKeys(sorted, (sample) => sample.ambientIntensity));
    profile.iblIntensity.setKeys(createCircularCurveKeys(sorted, (sample) => sample.iblIntensity));
    this._moonLightIntensityCurve.setKeys(createCircularCurveKeys(sorted, (sample) => sample.moonLightIntensity));
    for (const key of TERRAIN_SKY_TIME_CURVE_KEYS) {
      this._skyTimeCurves[key].setKeys(createCircularCurveKeys(sorted, (sample) => sample[key]));
    }
    this._customSkyZenithTintGradient.setKeys(
      createCircularColorKeys(
        sorted,
        (sample) => new Color(sample.customSkyZenithR, sample.customSkyZenithG, sample.customSkyZenithB, 1)
      )
    );
    this._customSkyHorizonTintGradient.setKeys(
      createCircularColorKeys(
        sorted,
        (sample) => new Color(sample.customSkyHorizonR, sample.customSkyHorizonG, sample.customSkyHorizonB, 1)
      )
    );
    for (const key of TERRAIN_PRESENTATION_TIME_CURVE_KEYS) {
      this._presentationTimeCurves[key].setKeys(createCircularCurveKeys(sorted, (sample) => sample[key]));
    }
    profile.skyExposure.setKeys(createCircularCurveKeys(sorted, (sample) => sample.skyExposure));
    profile.atmosphereThickness.setKeys(createCircularCurveKeys(sorted, (sample) => sample.atmosphereThickness));
    profile.skyTint.setKeys(
      createCircularColorKeys(sorted, (sample) => new Color(sample.skyTintR, sample.skyTintG, sample.skyTintB, 1))
    );
    profile.groundTint.setKeys(
      createCircularColorKeys(
        sorted,
        (sample) => new Color(sample.groundTintR, sample.groundTintG, sample.groundTintB, 1)
      )
    );
    profile.exposureCompensation.setKeys(createCircularCurveKeys(sorted, (sample) => sample.exposureCompensation));
    profile.bloomThreshold.setKeys(createCircularCurveKeys(sorted, (sample) => sample.bloomThreshold));
    this._bloomIntensityCurve.setKeys(createCircularCurveKeys(sorted, (sample) => sample.bloomIntensity));
    profile.fogFactor.setKeys([
      { time: 0, value: 1 },
      { time: 1, value: 1 }
    ]);
    profile.fogDensity.setKeys(createCircularCurveKeys(sorted, (sample) => sample.fogDensity));
    this.system.evaluate();
  }

  /**
   * Returns editable values currently feeding a probe-volume bake.
   * @returns Detached lighting source values.
   */
  getBakeLightingTuning(): TerrainBakeLightingTuning {
    this._assertAlive();
    const state = this.system.state;
    const postProcess = this._postProcess.getDebugSnapshot();
    return {
      timeHours: state.timeHours,
      sunIntensity: state.sunIntensity,
      shadowStrength: state.shadowStrength,
      sunColorR: state.sunColor.r,
      sunColorG: state.sunColor.g,
      sunColorB: state.sunColor.b,
      ambientIntensity: state.ambientIntensity,
      iblIntensity: state.iblIntensity,
      exposureCompensation: postProcess.colorAdjustments.postExposure,
      bloomThreshold: postProcess.bloom.threshold,
      bloomIntensity: postProcess.bloom.intensity,
      fogDensity: state.fogDensity * state.fogFactor
    };
  }

  /** Returns every editable source value that contributes to the live lighting and fog result. */
  getVisualTuning(): TerrainLightingVisualTuning {
    this._assertAlive();
    const state = this.system.state;
    const fogTint = this._atmosphericFog.tint;
    const skyMaterial = this._proceduralSky.material;
    const moonOptions = this._moonLighting.options;
    const profile = this.system.profile;
    const normalizedTime = state.normalizedTime;
    profile.sunColor.evaluate(normalizedTime, this._authoredSunColor);
    return {
      ...this.getBakeLightingTuning(),
      northOffsetDegrees: this._northOffsetDegrees,
      sunIntensity: profile.sunIntensity.evaluate(normalizedTime),
      shadowStrength: profile.shadowStrength.evaluate(normalizedTime),
      sunColorR: this._authoredSunColor.r,
      sunColorG: this._authoredSunColor.g,
      sunColorB: this._authoredSunColor.b,
      sunSize: skyMaterial.sunSize,
      sunSizeConvergence: skyMaterial.sunSizeConvergence,
      starIntensity: skyMaterial.starIntensity,
      starSize: skyMaterial.starSize,
      starCount: skyMaterial.starCount,
      starTwinkleIntensity: skyMaterial.starTwinkleIntensity,
      starTwinkleSpeed: skyMaterial.starTwinkleSpeed,
      moonLightIntensity: moonOptions.fullMoonIntensity,
      moonColorR: moonOptions.color.r,
      moonColorG: moonOptions.color.g,
      moonColorB: moonOptions.color.b,
      moonDiskIntensity: moonOptions.diskIntensity,
      moonAtmosphereIntensityScale: moonOptions.atmosphereIntensityScale,
      moonAngularScale: moonOptions.angularScale,
      skyExposure: state.skyExposure,
      twilightIntensity: skyMaterial.twilightIntensity,
      airglowIntensity: skyMaterial.airglowIntensity,
      atmosphereThickness: state.atmosphereThickness,
      atmosphereHeight: skyMaterial.atmosphereHeight,
      observerHeight: skyMaterial.observerHeight,
      rayleighScattering: skyMaterial.rayleighScattering,
      rayleighScaleHeight: skyMaterial.rayleighScaleHeight,
      mieScattering: skyMaterial.mieScattering,
      mieScaleHeight: skyMaterial.mieScaleHeight,
      mieAnisotropy: skyMaterial.mieAnisotropy,
      scatteringIntensity: skyMaterial.scatteringIntensity,
      horizonHaze: skyMaterial.horizonHaze,
      atmosphereSampleCount: skyMaterial.atmosphereSampleCount,
      skyTintR: state.skyTint.r,
      skyTintG: state.skyTint.g,
      skyTintB: state.skyTint.b,
      groundTintR: state.groundTint.r,
      groundTintG: state.groundTint.g,
      groundTintB: state.groundTint.b,
      customSkyTintStrength: skyMaterial.customSkyTintStrength,
      customSkyZenithR: skyMaterial.customSkyZenithTint.r,
      customSkyZenithG: skyMaterial.customSkyZenithTint.g,
      customSkyZenithB: skyMaterial.customSkyZenithTint.b,
      customSkyHorizonR: skyMaterial.customSkyHorizonTint.r,
      customSkyHorizonG: skyMaterial.customSkyHorizonTint.g,
      customSkyHorizonB: skyMaterial.customSkyHorizonTint.b,
      fogMode: this._authoredFogMode,
      fogExponent: this._fogExponent,
      fogStart: this._scene.fogStart,
      fogEnd: this._scene.fogEnd,
      fogRadianceIntensity: this._atmosphericFog.radianceIntensity,
      fogTintR: fogTint.r,
      fogTintG: fogTint.g,
      fogTintB: fogTint.b
    };
  }

  /**
   * Applies manual lighting overrides to every consumer captured by the baker.
   * @param values Partial source values to replace.
   * @returns Nothing.
   * @throws If a supplied value is invalid.
   */
  applyBakeLightingTuning(values: Partial<TerrainBakeLightingTuning>): void {
    this._assertAlive();
    validateBakeLighting(values);
    if (values.timeHours !== undefined) {
      this._timeIBLTransition?.abort();
      this._timeTransition.cancel("World time transition replaced by manual lighting edit");
      this.system.setTimeHours(values.timeHours);
    }
    const state = this.system.state;
    if (values.sunIntensity !== undefined) {
      state.sunIntensity = values.sunIntensity;
    }
    if (values.shadowStrength !== undefined) {
      state.shadowStrength = values.shadowStrength;
    }
    if (values.sunColorR !== undefined) {
      state.sunColor.r = values.sunColorR;
    }
    if (values.sunColorG !== undefined) {
      state.sunColor.g = values.sunColorG;
    }
    if (values.sunColorB !== undefined) {
      state.sunColor.b = values.sunColorB;
    }
    if (values.ambientIntensity !== undefined) {
      state.ambientIntensity = values.ambientIntensity;
    }
    if (values.iblIntensity !== undefined) {
      state.iblIntensity = values.iblIntensity;
    }
    if (values.exposureCompensation !== undefined) {
      state.exposureCompensation = values.exposureCompensation;
    }
    if (values.bloomThreshold !== undefined) {
      state.bloomThreshold = values.bloomThreshold;
    }
    if (values.bloomIntensity !== undefined) {
      this._bloomIntensityCurve.setKeys([
        { time: 0, value: values.bloomIntensity },
        { time: 1, value: values.bloomIntensity }
      ]);
    }
    if (values.fogDensity !== undefined) {
      state.fogDensity = values.fogDensity;
      state.fogFactor = 1;
    }
    this._applyDayNightState(state);
  }

  /** Applies live visual overrides at the paused astronomical time used by the inspector. */
  applyVisualTuning(values: Partial<TerrainLightingVisualTuning>, authoredTimeHours?: number): void {
    this._assertAlive();
    validateBakeLighting(values);
    const fogStart = values.fogStart ?? this._scene.fogStart;
    const fogEnd = values.fogEnd ?? this._scene.fogEnd;
    if (fogEnd <= fogStart) {
      throw new RangeError("Terrain Linear fog end must be greater than fog start");
    }
    if (values.fogMode !== undefined && !isDistanceFogMode(values.fogMode)) {
      throw new RangeError("Terrain fog mode must be Linear, Exponential, or ExponentialSquared");
    }
    if (values.fogExponent !== undefined && values.fogExponent <= 0) {
      throw new RangeError("Terrain fog exponent must be finite and positive");
    }
    const skyMaterial = this._proceduralSky.material;
    if (values.northOffsetDegrees !== undefined && values.northOffsetDegrees !== this._northOffsetDegrees) {
      if (!Number.isFinite(values.northOffsetDegrees)) throw new RangeError("World north rotation must be finite");
      const northOffset = (this._celestialPosition.northOffset ?? 0) + values.northOffsetDegrees;
      const position = { ...this._celestialPosition, northOffset };
      this.system.profile.solarPosition = new DayNightSolarPosition(position);
      this.system.profile.moonPosition = new DayNightMoonPosition(position);
      const latitude = (position.latitude * Math.PI) / 180;
      const north = (northOffset * Math.PI) / 180;
      skyMaterial.starAxis.set(
        Math.sin(north) * Math.cos(latitude),
        Math.sin(latitude),
        Math.cos(north) * Math.cos(latitude)
      );
      this._northOffsetDegrees = values.northOffsetDegrees;
    }
    if (values.sunSize !== undefined) skyMaterial.sunSize = values.sunSize;
    if (values.sunSizeConvergence !== undefined) skyMaterial.sunSizeConvergence = values.sunSizeConvergence;
    if (values.twilightIntensity !== undefined) skyMaterial.twilightIntensity = values.twilightIntensity;
    if (values.airglowIntensity !== undefined) skyMaterial.airglowIntensity = values.airglowIntensity;
    if (values.atmosphereHeight !== undefined) skyMaterial.atmosphereHeight = values.atmosphereHeight;
    if (values.observerHeight !== undefined) skyMaterial.observerHeight = values.observerHeight;
    if (values.rayleighScattering !== undefined) skyMaterial.rayleighScattering = values.rayleighScattering;
    if (values.rayleighScaleHeight !== undefined) skyMaterial.rayleighScaleHeight = values.rayleighScaleHeight;
    if (values.mieScattering !== undefined) skyMaterial.mieScattering = values.mieScattering;
    if (values.mieScaleHeight !== undefined) skyMaterial.mieScaleHeight = values.mieScaleHeight;
    if (values.mieAnisotropy !== undefined) skyMaterial.mieAnisotropy = values.mieAnisotropy;
    if (values.scatteringIntensity !== undefined) skyMaterial.scatteringIntensity = values.scatteringIntensity;
    if (values.horizonHaze !== undefined) skyMaterial.horizonHaze = values.horizonHaze;
    if (values.atmosphereSampleCount !== undefined) {
      skyMaterial.atmosphereSampleCount = values.atmosphereSampleCount;
    }
    if (values.customSkyTintStrength !== undefined) {
      skyMaterial.customSkyTintStrength = values.customSkyTintStrength;
    }
    const customSkyZenithTint = skyMaterial.customSkyZenithTint;
    customSkyZenithTint.set(
      values.customSkyZenithR ?? customSkyZenithTint.r,
      values.customSkyZenithG ?? customSkyZenithTint.g,
      values.customSkyZenithB ?? customSkyZenithTint.b,
      customSkyZenithTint.a
    );
    const customSkyHorizonTint = skyMaterial.customSkyHorizonTint;
    customSkyHorizonTint.set(
      values.customSkyHorizonR ?? customSkyHorizonTint.r,
      values.customSkyHorizonG ?? customSkyHorizonTint.g,
      values.customSkyHorizonB ?? customSkyHorizonTint.b,
      customSkyHorizonTint.a
    );
    if (values.starIntensity !== undefined) skyMaterial.starIntensity = values.starIntensity;
    if (values.starSize !== undefined) skyMaterial.starSize = values.starSize;
    if (values.starCount !== undefined) skyMaterial.starCount = values.starCount;
    if (values.starTwinkleIntensity !== undefined) skyMaterial.starTwinkleIntensity = values.starTwinkleIntensity;
    if (values.starTwinkleSpeed !== undefined) skyMaterial.starTwinkleSpeed = values.starTwinkleSpeed;
    const moonOptions = this._moonLighting.options;
    if (values.moonLightIntensity !== undefined) moonOptions.fullMoonIntensity = values.moonLightIntensity;
    if (values.moonColorR !== undefined) moonOptions.color.r = values.moonColorR;
    if (values.moonColorG !== undefined) moonOptions.color.g = values.moonColorG;
    if (values.moonColorB !== undefined) moonOptions.color.b = values.moonColorB;
    if (values.moonDiskIntensity !== undefined) moonOptions.diskIntensity = values.moonDiskIntensity;
    if (values.moonAtmosphereIntensityScale !== undefined) {
      moonOptions.atmosphereIntensityScale = values.moonAtmosphereIntensityScale;
    }
    if (values.moonAngularScale !== undefined) moonOptions.angularScale = values.moonAngularScale;
    if (values.fogMode !== undefined) this._authoredFogMode = values.fogMode;
    if (values.fogExponent !== undefined) {
      this._fogExponent = values.fogExponent;
      this._scene.shaderData.setFloat(TERRAIN_FOG_EXPONENT_PROPERTY, values.fogExponent);
    }
    if (values.fogStart !== undefined) this._scene.fogStart = values.fogStart;
    if (values.fogEnd !== undefined) this._scene.fogEnd = values.fogEnd;
    if (values.fogRadianceIntensity !== undefined) {
      this._atmosphericFog.setRadianceIntensity(values.fogRadianceIntensity);
    }
    this._applyTimeOfDayAuthoringTuning(values, authoredTimeHours);
    const fogTint = this._atmosphericFog.tint;
    this._atmosphericFog.setTint(
      values.fogTintR ?? fogTint.r,
      values.fogTintG ?? fogTint.g,
      values.fogTintB ?? fogTint.b
    );
    this.system.evaluate();
  }

  /** Current astronomical daylight for gameplay consumers, without a diagnostic snapshot. */
  get dayFactor(): number {
    this._assertAlive();
    return this.system.state.dayFactor;
  }

  /** Returns the current evaluated clock, lighting, and visibility state as a detached snapshot. */
  getSnapshot(): TerrainLightingRuntimeSnapshot {
    this._assertAlive();
    const clock = this.system.clock;
    const state = this.system.state;
    const moonState = this._moonLighting.getState();
    const postProcess = this._postProcess.getDebugSnapshot();
    const directColor = this._directLight.color;
    const sunDirectColor = this._sunDirectColor;
    const moonDirectColor = this._moonDirectColor;
    const visibleSunIntensity = maxColorChannel(sunDirectColor);
    const dominantDirectSource = this._dominantDirectSource;
    const shadowCaster =
      !this._scene.castShadows || this._directLight.shadowStrength <= 0 ? "None" : dominantDirectSource;
    return {
      ...this._visibility,
      skyColorRgb: this._skyColorRgb,
      playing: !clock.paused,
      timeHours: state.timeHours,
      timeScale: clock.timeScale,
      iblBakingEnabled: this._iblBakingEnabled,
      phase: state.phase,
      sunElevation: state.sunElevation,
      sunAzimuth: state.sunAzimuth,
      sunIntensity: state.sunIntensity,
      visibleSunIntensity,
      directLightColor: [directColor.r, directColor.g, directColor.b],
      sunLightColor: [sunDirectColor.r, sunDirectColor.g, sunDirectColor.b],
      dominantDirectSource,
      shadowCaster,
      moonLightColor: [moonDirectColor.r, moonDirectColor.g, moonDirectColor.b],
      weatherDirectIntensity: this._weatherDirectModifier,
      weatherShadowStrength: this._weatherShadowModifier,
      cloudTransmittance: this._sunCloudTransmittance,
      seasonDirectTint: [this._seasonDirectTint.r, this._seasonDirectTint.g, this._seasonDirectTint.b],
      seasonDirectIntensity: this._seasonDirectModifier,
      seasonEnvironmentTint: [this._seasonSkyTint.r, this._seasonSkyTint.g, this._seasonSkyTint.b],
      moonElevation: state.moonElevation,
      moonAzimuth: state.moonAzimuth,
      moonIlluminatedFraction: state.moonIlluminatedFraction,
      moonIntensity: moonState.directIntensity,
      shadowStrength: state.shadowStrength,
      dayFactor: state.dayFactor,
      twilightFactor: state.twilightFactor,
      nightFactor: state.nightFactor,
      ambientIntensity: this._scene.ambientLight.diffuseIntensity,
      iblIntensity: this._scene.ambientLight.specularIntensity,
      skyExposure: this._proceduralSky.material.exposure,
      exposureCompensation: postProcess.colorAdjustments.postExposure,
      bloomThreshold: postProcess.bloom.threshold,
      bloomIntensity: postProcess.bloom.intensity,
      fogDensity: this._scene.fogMode === FogMode.None ? 0 : this._scene.fogDensity,
      fogExponent: this._fogExponent,
      fogColor: [this._scene.fogColor.r, this._scene.fogColor.g, this._scene.fogColor.b],
      atmosphereThickness: this._proceduralSky.material.atmosphereThickness,
      iblBake: this._iblBaker.getSnapshot(),
      iblBakePerformance: { ...this._iblBakePerformance }
    };
  }

  /** Returns detached per-stage CPU and non-blocking GPU timings for retained IBL revisions. */
  getIBLProfile(): TerrainIBLProfileSnapshot {
    this._assertAlive();
    return this._iblProfiler.getSnapshot();
  }

  /** Enables or disables new IBL samples without changing the bake schedule. */
  setIBLProfilingEnabled(enabled: boolean): void {
    this._assertAlive();
    this._iblProfiler.setEnabled(enabled);
  }

  /** Clears retained IBL samples and unresolved timer queries. */
  resetIBLProfile(): void {
    this._assertAlive();
    this._iblProfiler.reset();
  }

  /** Enables or pauses realtime IBL work without changing the evaluated sky. */
  setIBLBakingEnabled(enabled: boolean): void {
    if (!enabled) this._timeIBLTransition?.abort();
    this._assertAlive();
    if (this._iblBakingEnabled === enabled) {
      return;
    }
    this._iblBakingEnabled = enabled;
    if (enabled) {
      this._requestProceduralSkyBake(true);
    }
  }

  /** Queues the latest authoritative procedural-sky state; equivalent signatures are coalesced by the baker. */
  requestEnvironmentBake(): void {
    this._assertAlive();
    if (this._timeIBLTransition) {
      this._environmentBakePending = true;
      return;
    }
    this._requestProceduralSkyBake(true);
  }

  /** The Scene environment owns cloud and seasonal endpoint preparation; no cross-module private access. */
  setEnvironmentTransitionFactory(factory?: (duration: number) => TerrainEnvironmentTransition): void {
    this._timeIBLTransition?.abort();
    this._environmentTransitionFactory = factory;
  }

  /**
   * Requests the latest animated sky only when the shared baker is idle and the mobile refresh budget is due.
   *
   * Discrete time, weather, and season edits continue to use {@link requestEnvironmentBake} so they can replace
   * the single latest pending revision immediately. Continuous cloud motion never queues intermediate revisions.
   * @param deltaTime Non-negative wall-clock frame duration in seconds.
   */
  requestDynamicEnvironmentBake(deltaTime: number): void {
    this._assertAlive();
    if (this._timeIBLTransition) return;
    if (!Number.isFinite(deltaTime) || deltaTime < 0) {
      throw new RangeError("Dynamic environment-bake delta time must be finite and non-negative");
    }
    this._dynamicEnvironmentBakeElapsedSeconds += deltaTime;
    if (this._dynamicEnvironmentBakeElapsedSeconds < PROCEDURAL_SKY_REALTIME_IBL_DYNAMIC_REFRESH_INTERVAL_SECONDS) {
      return;
    }
    if (!this._iblBaker.isIdle) return;
    this._requestProceduralSkyBake(true);
  }

  /** Waits until the first complete HDR SH and GGX IBL transaction is published. */
  async waitForFirstIBLBake(): Promise<void> {
    this._assertAlive();
    await this._iblBaker.waitForFirstBake();
  }

  /**
   * Waits until the latest IBL revision requested when this startup barrier begins is published.
   *
   * Creating weather and volumetric-cloud owners can queue a revision after the first sky bake.
   * Entering an interactive camera mode between those two revisions turns the synchronous capture
   * work into an apparent camera hitch, so callers that bootstrap a complete environment use this
   * barrier instead of treating the first published cubemap as the final one. Animated clouds may
   * continue requesting newer revisions without extending this startup barrier indefinitely. While
   * the barrier is active it owns the progressive Baker updates, so startup does not depend on a
   * renderable World camera or race the Scene update driver.
   * @returns Nothing.
   * @throws If the runtime is destroyed while waiting.
   */
  async waitForEnvironmentIBLIdle(onProgress?: (snapshot: RealtimeIBLBakerSnapshot) => void): Promise<void> {
    this._assertAlive();
    const barrierRevision = captureTerrainIBLRevisionBarrier(this._iblBaker.getSnapshot());
    this._environmentIBLStartupDrainActive = true;
    try {
      while (true) {
        this._assertAlive();
        const snapshot = this._iblBaker.getSnapshot();
        onProgress?.(snapshot);
        if (hasPublishedTerrainIBLRevision(snapshot, barrierRevision)) {
          return;
        }
        if (!this._iblBakingEnabled) {
          throw new Error("Terrain environment IBL startup cannot finish while baking is disabled");
        }
        this._advanceIBLBaker();
        await waitForAnimationFrame();
      }
    } finally {
      this._environmentIBLStartupDrainActive = false;
    }
  }

  /**
   * Updates play state, local hour, or simulated seconds advanced per real second.
   * @param values Partial clock values.
   * @returns Nothing.
   * @throws If a supplied clock value is invalid.
   */
  setTuning(values: Partial<TerrainLightingClockTuning>): void {
    this._assertAlive();
    if (values.timeHours !== undefined || values.playing !== undefined || values.timeScale !== undefined) {
      this._timeIBLTransition?.abort();
      this._timeTransition.cancel("World time transition replaced by manual clock edit");
    }
    const clock = this.system.clock;
    if (values.playing !== undefined) {
      clock.paused = !values.playing;
    }
    if (values.timeScale !== undefined) {
      if (!Number.isFinite(values.timeScale) || values.timeScale < 0) {
        throw new RangeError("Terrain lighting time scale must be finite and non-negative");
      }
      clock.timeScale = values.timeScale;
    }
    if (values.timeHours !== undefined) {
      this.system.setTimeHours(values.timeHours);
      this._requestProceduralSkyBake(true);
    }
  }

  /** Moves forward to the target hour over real seconds; resolves at arrival, rejects on interruption. */
  async transitionTime(
    timeHours: number,
    durationSeconds: number,
    signal: AbortSignal,
    fromTimeHours?: number
  ): Promise<void> {
    this._assertAlive();
    if (signal.aborted) throw new Error("World time transition cancelled");
    if (
      ![timeHours, fromTimeHours ?? this.system.state.timeHours].every(
        (hour) => Number.isFinite(hour) && hour >= 0 && hour <= 24
      ) ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds < 0 ||
      durationSeconds > 60
    ) {
      throw new RangeError("Time must be 0–24 hours and transition duration 0–60 seconds");
    }
    this._timeIBLTransition?.abort();
    this._timeTransition.cancel("World time transition replaced");
    const sourceHours = (fromTimeHours ?? this.system.state.timeHours) % 24;
    if (
      durationSeconds === 0 ||
      !this._iblBakingEnabled ||
      (sourceHours === timeHours % 24 && !this._environmentTransitionFactory)
    ) {
      return this._timeTransition.start(this.system.state.timeHours, timeHours, durationSeconds, signal, fromTimeHours);
    }
    this.system.clock.paused = true;
    // An explicit starting hour first establishes A; B is never rendered during preparation.
    if (fromTimeHours !== undefined) this.system.setTimeHours(sourceHours);
    const controller = new AbortController();
    this._timeIBLTransition = controller;
    const sourceClouds = this._proceduralSky.material.volumetricClouds;
    let participant: TerrainEnvironmentTransition | undefined;
    let completed = false;
    const onAbort = () => {
      this._timeTransition.cancel("World time transition cancelled");
      this._iblBaker.cancelTransition();
      this.system.setTimeHours(sourceHours);
      participant?.release(false);
      if (this._environmentTransition === participant) this._environmentTransition = null;
      if (this._timeIBLTransition === controller) this._timeIBLTransition = null;
    };
    const forwardAbort = () => controller.abort();
    signal.addEventListener("abort", forwardAbort, { once: true });
    controller.signal.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(forwardAbort, 70_000 + durationSeconds * 1000);
    try {
      participant = this._environmentTransitionFactory?.(durationSeconds);
      this._environmentTransition = participant ?? null;
      await this._iblBaker.prepareTransition(
        () => {
          this.system.setTimeHours(timeHours % 24);
          if (participant) {
            const target = participant.captureTarget();
            this._proceduralSky.material.volumetricClouds = target.clouds;
            return target.ready;
          }
        },
        () => {
          this._proceduralSky.material.volumetricClouds = sourceClouds;
          this.system.setTimeHours(sourceHours);
          participant?.restoreSourceLighting();
        }
      );
      if (controller.signal.aborted) throw new Error("World time transition cancelled");
      await this._timeTransition.start(
        sourceHours,
        timeHours,
        durationSeconds,
        controller.signal,
        undefined,
        !!participant
      );
      this._iblBaker.finishTransition();
      completed = true;
      this._lastRequestedIBLTimeHours = timeHours % 24;
      this._dynamicEnvironmentBakeElapsedSeconds = 0;
    } catch (error) {
      if (!controller.signal.aborted) controller.abort();
      throw error;
    } finally {
      participant?.release(completed);
      if (this._environmentTransition === participant) this._environmentTransition = null;
      clearTimeout(timeout);
      signal.removeEventListener("abort", forwardAbort);
      controller.signal.removeEventListener("abort", onAbort);
      if (this._timeIBLTransition === controller) this._timeIBLTransition = null;
      if (!this._timeIBLTransition && this._environmentBakePending && !this._destroyed) {
        this._environmentBakePending = false;
        this._requestProceduralSkyBake(true);
      }
    }
  }

  /** Applies a world-local sky tint immediately, preserving time and weather. Null restores the authored sky. */
  setSkyColor(colorRgb: readonly [number, number, number] | null): void {
    this._assertAlive();
    if (colorRgb !== null) {
      if (colorRgb.length !== 3 || colorRgb.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
        throw new RangeError("Sky colorRgb must contain three sRGB integers in [0, 255].");
      }
      this._skyColorTint.set(
        Color.gammaToLinearSpace(colorRgb[0] / 255),
        Color.gammaToLinearSpace(colorRgb[1] / 255),
        Color.gammaToLinearSpace(colorRgb[2] / 255),
        1
      );
    }
    this._skyColorRgb = colorRgb === null ? null : Object.freeze([...colorRgb] as [number, number, number]);
    this._applySkyAtmosphere();
    this._requestProceduralSkyBake(true);
  }

  /**
   * Advances the shared clock from the Scene update driver.
   * @param deltaTime Scaled frame duration in seconds.
   * @returns Nothing.
   */
  update(deltaTime: number): void {
    this._assertAlive();
    const frameTimeMs = this._scene.engine.time.actualDeltaTime * 1000;
    this._completePendingIBLBakeFrameSample(frameTimeMs);
    this._iblProfiler.completeFrameInterval(frameTimeMs);
    this._timeTransition.update(this._scene.engine.time.actualDeltaTime);
    this.system.update(deltaTime);
    if (this._iblBakingEnabled) {
      if (!this._environmentIBLStartupDrainActive) this._advanceIBLBaker();
    }
  }

  private _advanceIBLBaker(): void {
    const baker = this._iblBaker;
    if (baker.isIdle) {
      this._iblProfiler.poll();
      return;
    }
    const beforeActiveRevision = baker.activeRevision;
    const beforePendingRevision = baker.pendingRevision;
    const beforeFrame = baker.frame;
    this._iblProfiler.beginUpdate();
    const cpuStart = performance.now();
    let cpuTimeMs = 0;
    try {
      baker.update();
    } finally {
      cpuTimeMs = performance.now() - cpuStart;
      this._iblProfiler.endUpdate(cpuTimeMs);
    }
    this._beginIBLBakeFrameSample(
      beforeActiveRevision,
      beforePendingRevision,
      beforeFrame,
      baker.activeRevision,
      baker.frame,
      cpuTimeMs
    );
    if (beforeActiveRevision !== null && baker.activeRevision === null) this._synchronizeAtmosphericFog();
  }

  /**
   * Restores the Project-authored daylight state and detaches the update driver.
   * @returns Nothing.
   */
  destroy(): void {
    this._timeIBLTransition?.abort();
    if (this._destroyed) {
      return;
    }
    this._timeTransition.cancel("World time transition cancelled: lighting runtime destroyed");
    this._driver.runtime = null;
    this._iblBaker.destroy();
    this._iblProfiler.destroy();
    this._moonLighting.destroy();
    this._atmosphericFog.destroy();
    const scene = this._scene;
    const directLight = this._directLight;
    directLight.color.copyFrom(this._initialDirectColor);
    directLight.entity.transform.rotationQuaternion = this._initialDirectRotation;
    directLight.enabled = this._initialDirectEnabled;
    directLight.cullingMask = this._initialDirectCullingMask;
    directLight.shadowType = this._initialShadowType;
    directLight.shadowStrength = this._initialShadowStrength;
    scene.castShadows = this._initialCastShadows;
    scene.shadowCascades = this._initialShadowCascades;
    scene.shadowDistance = this._initialShadowDistance;
    scene.shadowTwoCascadeSplits = this._initialShadowTwoCascadeSplits;
    scene.ambientLight.diffuseIntensity = this._initialAmbientDiffuse;
    scene.ambientLight.specularIntensity = this._initialAmbientSpecular;
    scene.environmentLighting.probeVolume = this._initialProbeVolume;
    scene.fogMode = this._initialFogMode;
    scene.fogColor.copyFrom(this._initialFogColor);
    scene.fogStart = this._initialFogStart;
    scene.fogEnd = this._initialFogEnd;
    scene.fogDensity = this._initialFogDensity;
    scene.shaderData.disableMacro(TERRAIN_CUSTOM_FOG_EXPONENT_MACRO);
    scene.background.solidColor.copyFrom(this._initialBackgroundColor);
    scene.sun = this._initialSun;
    this._proceduralSky.destroy();
    const initialPostProcess = this._initialPostProcess;
    this._postProcess.setPostExposure(initialPostProcess.colorAdjustments.postExposure);
    this._postProcess.setTemperature(initialPostProcess.colorAdjustments.temperature);
    this._postProcess.setTint(initialPostProcess.colorAdjustments.tint);
    this._postProcess.setContrast(initialPostProcess.colorAdjustments.contrast);
    this._postProcess.setSaturation(initialPostProcess.colorAdjustments.saturation);
    this._postProcess.setBloomTint(
      initialPostProcess.bloom.tintR,
      initialPostProcess.bloom.tintG,
      initialPostProcess.bloom.tintB
    );
    this._postProcess.setBloomThreshold(initialPostProcess.bloom.threshold);
    this._postProcess.setBloomIntensity(initialPostProcess.bloom.intensity);
    this._postProcess.setBloomScatter(initialPostProcess.bloom.scatter);
    this._destroyed = true;
  }

  private _applyDayNightState(state: DayNightState): void {
    this._moonLighting.options.fullMoonIntensity = this._moonLightIntensityCurve.evaluate(state.normalizedTime);
    this._environmentAdapter.applyDayNightState(state);
    this._authoredAmbientIntensity = state.ambientIntensity;
    this._authoredIblIntensity = state.iblIntensity;
    this._authoredFogDensity = state.fogDensity * state.fogFactor;
    const skyMaterial = this._proceduralSky.material;
    for (const key of TERRAIN_SKY_TIME_CURVE_KEYS) {
      skyMaterial[key] = this._skyTimeCurves[key].evaluate(state.normalizedTime);
    }
    this._applyPresentationTimeCurves(state.normalizedTime);
    this._authoredSkyExposure = skyMaterial.exposure;
    this._authoredAtmosphereThickness = skyMaterial.atmosphereThickness;
    this._authoredSkyTint.copyFrom(skyMaterial.skyTint);
    this._authoredGroundTint.copyFrom(skyMaterial.groundTint);
    this._applyCelestialDirectLight();
    this._applyVisibility();
    this._applyWeatherPostProcess();
    this._applySkyAtmosphere();
    this._synchronizeAtmosphericFog();
    this._requestProceduralSkyBake(this.system.clock.paused && !this._timeTransition.active);
  }

  /** Writes an inspector edit into the shared circular time profile instead of the weather or season layers. */
  private _applyTimeOfDayAuthoringTuning(
    values: Partial<TerrainLightingVisualTuning>,
    authoredTimeHours?: number
  ): void {
    const profile = this.system.profile;
    // Authored overrides belong to their authored time, not to wherever the live clock is.
    const time =
      authoredTimeHours === undefined ? this.system.clock.normalizedTime : (((authoredTimeHours % 24) + 24) % 24) / 24;
    if (values.sunIntensity !== undefined) upsertCurveKey(profile.sunIntensity, time, values.sunIntensity);
    if (values.shadowStrength !== undefined) upsertCurveKey(profile.shadowStrength, time, values.shadowStrength);
    upsertColorKey(profile.sunColor, time, values.sunColorR, values.sunColorG, values.sunColorB);
    if (values.ambientIntensity !== undefined) upsertCurveKey(profile.ambientIntensity, time, values.ambientIntensity);
    if (values.iblIntensity !== undefined) upsertCurveKey(profile.iblIntensity, time, values.iblIntensity);
    if (values.moonLightIntensity !== undefined) {
      upsertCurveKey(this._moonLightIntensityCurve, time, values.moonLightIntensity);
    }
    for (const key of TERRAIN_SKY_TIME_CURVE_KEYS) {
      const value = values[key];
      if (value !== undefined) upsertCurveKey(this._skyTimeCurves[key], time, value);
    }
    upsertColorKey(
      this._customSkyZenithTintGradient,
      time,
      values.customSkyZenithR,
      values.customSkyZenithG,
      values.customSkyZenithB
    );
    upsertColorKey(
      this._customSkyHorizonTintGradient,
      time,
      values.customSkyHorizonR,
      values.customSkyHorizonG,
      values.customSkyHorizonB
    );
    for (const key of TERRAIN_PRESENTATION_TIME_CURVE_KEYS) {
      const value = values[key];
      if (value !== undefined) upsertCurveKey(this._presentationTimeCurves[key], time, value);
    }
    if (values.skyExposure !== undefined) upsertCurveKey(profile.skyExposure, time, values.skyExposure);
    if (values.atmosphereThickness !== undefined) {
      upsertCurveKey(profile.atmosphereThickness, time, values.atmosphereThickness);
    }
    upsertColorKey(profile.skyTint, time, values.skyTintR, values.skyTintG, values.skyTintB);
    upsertColorKey(profile.groundTint, time, values.groundTintR, values.groundTintG, values.groundTintB);
    if (values.exposureCompensation !== undefined) {
      upsertCurveKey(profile.exposureCompensation, time, values.exposureCompensation);
    }
    if (values.bloomThreshold !== undefined) upsertCurveKey(profile.bloomThreshold, time, values.bloomThreshold);
    if (values.bloomIntensity !== undefined) upsertCurveKey(this._bloomIntensityCurve, time, values.bloomIntensity);
    if (values.fogDensity !== undefined) upsertCurveKey(profile.fogDensity, time, values.fogDensity);
  }

  /** Selects the current celestial source and drives the scene's single DirectLight. */
  private _applyCelestialDirectLight(): void {
    const state = this.system.state;
    // Spatial cloud transmittance is sampled by surface receivers from the shared direction cache
    // Keep the scalar optical estimate for the sun disk and diagnostics instead of applying it twice
    const visibleIntensity =
      state.sunIntensity * this._weatherDirectModifier * this._weatherLightningEnergy * this._seasonDirectModifier;
    this._sunDirectColor.set(
      state.sunColor.r * this._seasonDirectTint.r * visibleIntensity,
      state.sunColor.g * this._seasonDirectTint.g * visibleIntensity,
      state.sunColor.b * this._seasonDirectTint.b * visibleIntensity,
      state.sunColor.a
    );
    const moonState = this._moonLighting.getState();
    const moonIntensity =
      moonState.directIntensity *
      this._weatherDirectModifier *
      this._weatherLightningEnergy *
      this._seasonDirectModifier;
    this._moonDirectColor.set(
      moonState.color.r * this._seasonDirectTint.r * moonIntensity,
      moonState.color.g * this._seasonDirectTint.g * moonIntensity,
      moonState.color.b * this._seasonDirectTint.b * moonIntensity,
      1
    );

    const sunEnergy = maxColorChannel(this._sunDirectColor);
    const moonEnergy = maxColorChannel(this._moonDirectColor);
    const lightDirection = moonEnergy > sunEnergy ? state.moonDirection : state.sunDirection;
    if (Math.max(sunEnergy, moonEnergy) <= 1e-4) {
      this._dominantDirectSource = "None";
      this._directLight.color.set(0, 0, 0, 1);
    } else if (moonEnergy > sunEnergy) {
      this._dominantDirectSource = "Moon";
      this._directLight.color.copyFrom(this._moonDirectColor);
    } else {
      this._dominantDirectSource = "Sun";
      this._directLight.color.copyFrom(this._sunDirectColor);
    }
    const transform = this._directLight.entity.transform;
    Vector3.add(transform.worldPosition, lightDirection, this._directLightTarget);
    transform.lookAt(this._directLightTarget, TerrainLightingRuntime._directLightUp);
  }

  private _applyVisibility(): void {
    const visibility = this._visibility;
    // Keep one registered DirectLight; the Sun and Moon only drive its source values.
    // The procedural sky retains its independent astronomical directions.
    this._directLight.enabled = true;
    this._directLight.cullingMask = visibility.direct ? this._initialDirectCullingMask : 0;
    this._scene.castShadows = visibility.direct && visibility.shadows && this._initialCastShadows;
    this._directLight.shadowType = this._scene.castShadows ? this._initialShadowType : ShadowType.None;
    this._directLight.shadowStrength =
      this._scene.castShadows && this._dominantDirectSource !== "None"
        ? this.system.state.shadowStrength * this._weatherShadowModifier
        : 0;
    this._scene.sun = this._directLight;
    this._scene.ambientLight.diffuseIntensity = visibility.environment
      ? this._authoredAmbientIntensity * this._weatherAmbientModifier * this._seasonAmbientModifier
      : 0;
    this._scene.ambientLight.specularIntensity = visibility.environment
      ? this._authoredIblIntensity * this._weatherIblModifier * this._seasonIblModifier
      : 0;
    this._scene.environmentLighting.probeVolume = visibility.environment ? this._probeVolume : undefined;
    this._scene.fogMode = visibility.fog ? this._authoredFogMode : FogMode.None;
    if (visibility.fog) {
      this._scene.fogDensity =
        this._authoredFogDensity * this._weatherFogDensityModifier * this._seasonFogDensityModifier;
    }
  }

  /** Applies time-authored presentation values that are not part of the generic engine day/night profile. */
  private _applyPresentationTimeCurves(time: number): void {
    const curves = this._presentationTimeCurves;
    const material = this._proceduralSky.material;
    material.sunSize = curves.sunSize.evaluate(time);
    material.sunSizeConvergence = curves.sunSizeConvergence.evaluate(time);
    this._scene.fogStart = curves.fogStart.evaluate(time);
    this._scene.fogEnd = curves.fogEnd.evaluate(time);
    this._atmosphericFog.setRadianceIntensity(curves.fogRadianceIntensity.evaluate(time));
    this._atmosphericFog.setTint(
      curves.fogTintR.evaluate(time),
      curves.fogTintG.evaluate(time),
      curves.fogTintB.evaluate(time)
    );
  }

  private _applyWeatherPostProcess(): void {
    this._postProcess.applyBlendedPreset(
      TERRAIN_DAY_POST_PROCESS_PRESET,
      TERRAIN_NIGHT_POST_PROCESS_PRESET,
      this.system.state.nightFactor,
      this._weatherExposureOffset
    );
  }

  private _applySkyAtmosphere(): void {
    const material = this._proceduralSky.material;
    // The day/night profile is authoritative for procedural atmosphere data.
    // Cloud coverage changes the volume and its optical shadowing, not the sky material underneath it.
    material.exposure = this._authoredSkyExposure;
    material.atmosphereThickness = this._authoredAtmosphereThickness;
    material.skyTint.copyFrom(this._authoredSkyTint);
    material.groundTint.copyFrom(this._authoredGroundTint);
    multiplyColor(material.skyTint, this._seasonSkyTint);
    multiplyColor(material.groundTint, this._seasonGroundTint);
    const time = this.system.state.normalizedTime;
    if (this._skyColorRgb !== null) {
      material.customSkyTintStrength = 1;
      material.customSkyZenithTint.copyFrom(this._skyColorTint);
      material.customSkyHorizonTint.copyFrom(this._skyColorTint);
    } else {
      material.customSkyTintStrength = this._skyTimeCurves.customSkyTintStrength.evaluate(time);
      this._customSkyZenithTintGradient.evaluate(time, material.customSkyZenithTint);
      this._customSkyHorizonTintGradient.evaluate(time, material.customSkyHorizonTint);
    }
  }

  /** Queues the authoritative Scene sky and its shared cloud cache for one atomic IBL update. */
  private _requestProceduralSkyBake(force: boolean): void {
    if (!this._iblBakingEnabled || this._timeIBLTransition) return;
    const timeHours = this.system.state.timeHours;
    if (!force && !this._iblBaker.isIdle) return;
    if (
      !force &&
      Number.isFinite(this._lastRequestedIBLTimeHours) &&
      circularHourDistance(timeHours, this._lastRequestedIBLTimeHours) < MOVING_SKY_IBL_INTERVAL_HOURS
    ) {
      return;
    }
    this._iblBaker.requestBake();
    this._lastRequestedIBLTimeHours = timeHours;
    this._dynamicEnvironmentBakeElapsedSeconds = 0;
  }

  private _synchronizeAtmosphericFog(): void {
    const scene = this._scene;
    this._atmosphericFog.update(scene.ambientLight.diffuseSphericalHarmonics);
  }

  private _beginIBLBakeFrameSample(
    beforeActiveRevision: number | null,
    beforePendingRevision: number | null,
    beforeFrame: number,
    afterActiveRevision: number | null,
    afterFrame: number,
    cpuTimeMs: number
  ): void {
    let revision: number | null = null;
    let frame = -1;
    if (beforeActiveRevision !== null && beforeFrame >= 0) {
      revision = beforeActiveRevision;
      frame = beforeFrame;
    } else if (beforePendingRevision !== null && afterActiveRevision === beforePendingRevision && afterFrame === 1) {
      revision = beforePendingRevision;
      frame = 0;
    }
    if (revision === null) {
      return;
    }

    const performanceSnapshot = this._iblBakePerformance;
    if (performanceSnapshot.revision !== revision) {
      performanceSnapshot.revision = revision;
      performanceSnapshot.peakFrame = null;
      performanceSnapshot.peakFrameTimeMs = 0;
      performanceSnapshot.peakCpuFrame = null;
      performanceSnapshot.peakCpuTimeMs = 0;
    }
    if (cpuTimeMs > performanceSnapshot.peakCpuTimeMs) {
      performanceSnapshot.peakCpuFrame = frame;
      performanceSnapshot.peakCpuTimeMs = cpuTimeMs;
    }
    this._pendingIBLBakeFrameRevision = revision;
    this._pendingIBLBakeFrameIndex = frame;
  }

  private _completePendingIBLBakeFrameSample(frameTimeMs: number): void {
    const revision = this._pendingIBLBakeFrameRevision;
    const frame = this._pendingIBLBakeFrameIndex;
    this._pendingIBLBakeFrameRevision = 0;
    this._pendingIBLBakeFrameIndex = -1;
    if (frame < 0 || this._iblBakePerformance.revision !== revision || !Number.isFinite(frameTimeMs)) {
      return;
    }
    if (frameTimeMs > this._iblBakePerformance.peakFrameTimeMs) {
      this._iblBakePerformance.peakFrame = frame;
      this._iblBakePerformance.peakFrameTimeMs = frameTimeMs;
    }
  }

  private _applyShadowCascadeTuning(): void {
    const scene = this._scene;
    const { distance, distribution, count, splits } = this._shadowCascadeTuning;
    scene.shadowCascades = count === 4 ? ShadowCascadesMode.FourCascades : ShadowCascadesMode.TwoCascades;
    if (splits) scene.shadowFourCascadeSplits.set(...splits);
    scene.shadowDistance = distance;
    scene.shadowTwoCascadeSplits = 1 / (1 + distribution);
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("Terrain lighting runtime has been destroyed");
    }
  }
}

class TerrainLightingDriver extends Script {
  runtime: TerrainLightingRuntime | null = null;

  override onUpdate(deltaTime: number): void {
    this.runtime?.update(deltaTime);
  }
}

function captureLightingReference(
  scene: Scene,
  directLight: DirectLight,
  postProcess: ReturnType<TerrainPostProcessRuntime["getDebugSnapshot"]>
): TerrainLightingReference {
  const lightEnergy = Math.max(directLight.color.r, directLight.color.g, directLight.color.b, 0);
  const inverseEnergy = lightEnergy > 0 ? 1 / lightEnergy : 0;
  const skyMaterial = scene.background.sky.material;
  if (!(skyMaterial instanceof SkyProceduralMaterial)) {
    throw new Error("Terrain lighting requires its procedural sky to be installed before profile capture");
  }
  return {
    sunIntensity: lightEnergy,
    sunColor:
      lightEnergy > 0
        ? new Color(
            directLight.color.r * inverseEnergy,
            directLight.color.g * inverseEnergy,
            directLight.color.b * inverseEnergy,
            directLight.color.a
          )
        : new Color(1, 1, 1, directLight.color.a),
    shadowStrength: directLight.shadowStrength,
    ambientIntensity: scene.ambientLight.diffuseIntensity,
    iblIntensity: scene.ambientLight.specularIntensity,
    exposureCompensation: postProcess.colorAdjustments.postExposure,
    bloomThreshold: postProcess.bloom.threshold,
    bloomIntensity: postProcess.bloom.intensity,
    fogDensity: scene.fogDensity
  };
}

function createEmptyIBLBakePerformance(revision = 0): MutableTerrainIBLBakePerformanceSnapshot {
  return {
    revision,
    peakFrame: null,
    peakFrameTimeMs: 0,
    peakCpuFrame: null,
    peakCpuTimeMs: 0
  };
}

function validateTimeOfDayLightingSamples(
  samples: readonly TerrainTimeOfDayLightingSample[]
): TerrainTimeOfDayLightingSample[] {
  if (samples.length < 2) throw new Error("Terrain time-of-day lighting requires at least two samples");
  const sorted = samples.map((sample) => ({ ...sample })).sort((left, right) => left.timeHours - right.timeHours);
  for (let i = 0; i < sorted.length; i++) {
    const sample = sorted[i];
    validateBakeLighting(sample);
    if (sample.timeHours < 0 || sample.timeHours >= 24) {
      throw new RangeError("Terrain time-of-day lighting sample hours must be within [0, 24)");
    }
    if (i > 0 && Math.abs(sample.timeHours - sorted[i - 1].timeHours) < 1e-6) {
      throw new Error("Terrain time-of-day lighting sample hours must be unique");
    }
    if (sample.fogEnd <= sample.fogStart) {
      throw new RangeError("Terrain time-of-day Linear fog end must be greater than fog start");
    }
  }
  if (Math.abs(sorted[0].timeHours) > 1e-6) {
    throw new Error("Terrain time-of-day lighting requires a 0:00 sample for circular interpolation");
  }
  return sorted;
}

function createCircularCurveKeys(
  samples: readonly TerrainTimeOfDayLightingSample[],
  select: (sample: TerrainTimeOfDayLightingSample) => number
): Array<{ time: number; value: number }> {
  const keys = samples.map((sample) => ({ time: sample.timeHours / 24, value: select(sample) }));
  keys.push({ time: 1, value: select(samples[0]) });
  return keys;
}

function createCircularColorKeys(
  samples: readonly TerrainTimeOfDayLightingSample[],
  select: (sample: TerrainTimeOfDayLightingSample) => Color
): Array<{ time: number; color: Color }> {
  const keys = samples.map((sample) => ({ time: sample.timeHours / 24, color: select(sample) }));
  keys.push({ time: 1, color: select(samples[0]) });
  return keys;
}

function createTerrainSkyTimeCurves(material: SkyProceduralMaterial): TerrainSkyTimeCurves {
  return Object.fromEntries(
    TERRAIN_SKY_TIME_CURVE_KEYS.map((key) => [key, createConstantDayNightCurve(material[key])])
  ) as TerrainSkyTimeCurves;
}

function createConstantDayNightColorGradient(color: Readonly<Color>): DayNightColorGradient {
  return new DayNightColorGradient([
    { time: 0, color: color.clone() },
    { time: 1, color: color.clone() }
  ]);
}

function createTerrainPresentationTimeCurves(
  material: SkyProceduralMaterial,
  scene: Scene,
  atmosphericFog: TerrainAtmosphericFog
): TerrainPresentationTimeCurves {
  const fogTint = atmosphericFog.tint;
  const initialValues: Record<TerrainPresentationTimeCurveKey, number> = {
    sunSize: material.sunSize,
    sunSizeConvergence: material.sunSizeConvergence,
    fogStart: scene.fogStart,
    fogEnd: scene.fogEnd,
    fogRadianceIntensity: atmosphericFog.radianceIntensity,
    fogTintR: fogTint.r,
    fogTintG: fogTint.g,
    fogTintB: fogTint.b
  };
  return Object.fromEntries(
    TERRAIN_PRESENTATION_TIME_CURVE_KEYS.map((key) => [key, createConstantDayNightCurve(initialValues[key])])
  ) as TerrainPresentationTimeCurves;
}

function upsertCurveKey(curve: DayNightCurve, time: number, value: number): void {
  const atMidnight = time < 1e-6 || 1 - time < 1e-6;
  const keys = curve.keys
    .filter((key) => Math.abs(key.time - time) >= 1e-6 && (!atMidnight || Math.abs(key.time - 1) >= 1e-6))
    .map((key) => ({ ...key }));
  keys.push({ time: atMidnight ? 0 : time, value });
  if (atMidnight) keys.push({ time: 1, value });
  curve.setKeys(keys);
}

function upsertColorKey(
  gradient: DayNightColorGradient,
  time: number,
  red: number | undefined,
  green: number | undefined,
  blue: number | undefined
): void {
  if (red === undefined && green === undefined && blue === undefined) return;
  const color = gradient.evaluate(time, new Color());
  color.set(red ?? color.r, green ?? color.g, blue ?? color.b, color.a);
  const atMidnight = time < 1e-6 || 1 - time < 1e-6;
  const keys = gradient.keys
    .filter((key) => Math.abs(key.time - time) >= 1e-6 && (!atMidnight || Math.abs(key.time - 1) >= 1e-6))
    .map((key) => ({ time: key.time, color: key.color }));
  keys.push({ time: atMidnight ? 0 : time, color });
  if (atMidnight) keys.push({ time: 1, color });
  gradient.setKeys(keys);
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function validateBakeLighting(values: Partial<TerrainBakeLightingTuning>): void {
  const signed = new Set(["timeHours", "exposureCompensation"]);
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`Terrain bake lighting ${name} must be finite`);
    }
    if (!signed.has(name) && value! < 0) {
      throw new RangeError(`Terrain bake lighting ${name} must be non-negative`);
    }
  }
}

function isDistanceFogMode(value: FogMode): boolean {
  return value === FogMode.Linear || value === FogMode.Exponential || value === FogMode.ExponentialSquared;
}

/** Returns the legacy-equivalent power selected by one built-in exponential fog mode. */
export function getTerrainFogModeDefaultExponent(value: FogMode): number {
  return value === FogMode.ExponentialSquared ? 2 : 1;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function maxColorChannel(color: Readonly<Color>): number {
  return Math.max(color.r, color.g, color.b, 0);
}

function circularHourDistance(a: number, b: number): number {
  const difference = Math.abs(a - b) % 24;
  return Math.min(difference, 24 - difference);
}

function mixSeasonLightingColor(
  target: Color,
  weights: Readonly<TerrainSeasonLightingWeights>,
  values: TerrainSeasonColorTable
): void {
  target.set(
    values[0][0] * weights.x + values[1][0] * weights.y + values[2][0] * weights.z + values[3][0] * weights.w,
    values[0][1] * weights.x + values[1][1] * weights.y + values[2][1] * weights.z + values[3][1] * weights.w,
    values[0][2] * weights.x + values[1][2] * weights.y + values[2][2] * weights.z + values[3][2] * weights.w,
    1
  );
}

function mixSeasonLightingScalar(
  weights: Readonly<TerrainSeasonLightingWeights>,
  values: TerrainSeasonScalarTable
): number {
  return values[0] * weights.x + values[1] * weights.y + values[2] * weights.z + values[3] * weights.w;
}

function multiplyColor(target: Color, multiplier: Readonly<Color>): void {
  target.set(target.r * multiplier.r, target.g * multiplier.g, target.b * multiplier.b, target.a);
}
