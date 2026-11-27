import type { Texture2D } from "../../texture/Texture2D";

/** Height bands used by receivers that cannot afford a continuous atmospheric profile. */
export type WindLayer = "ground" | "canopy" | "cloud";

/** Stable receiver families. Implementations are registered per family, never per placed instance. */
export type WindConsumerKind =
  | "tree"
  | "vegetation"
  | "cloud"
  | "water"
  | "precipitation"
  | "particle"
  | "cloth"
  | "audio";

/** Perceptual wind quality tiers ordered from the most complete response to disabled. */
export type WindLodTier = "hero" | "near" | "mid" | "far" | "off";

/** Minimal vector input accepted without coupling the wind model to one scene graph type. */
export interface WindVector3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Allocation-free world-space XZ window prepared before one dense local-field sampling batch. */
export interface WindLocalFieldBounds {
  readonly minimumX: number;
  readonly minimumZ: number;
  readonly maximumX: number;
  readonly maximumZ: number;
}

/** Detached tuple used at diagnostics and serialization boundaries. */
export type WindVector3Tuple = [number, number, number];

/** Allocation-free horizontal world-space tuple used by wind-spectrum advection. */
export type WindVector2Tuple = [number, number];

/** Relative response of the three atmospheric height bands. */
export interface WindLayerMultipliers {
  ground: number;
  canopy: number;
  cloud: number;
}

/** Deterministic travelling-gust scheduler. */
export interface WindGustProfile {
  /** Upper expected event rate; weather changes intensity and gently biases cadence. */
  frequencyPerMinute: number;
  /** Minimum normalized event amplitude. */
  amplitudeMin: number;
  /** Maximum normalized event amplitude. */
  amplitudeMax: number;
  /** Seconds from arrival to the event peak. */
  attackSeconds: number;
  /** Seconds held close to the peak. */
  holdSeconds: number;
  /** Seconds used by the slower natural decay. */
  decaySeconds: number;
  /** World-space propagation speed in metres per second. */
  frontSpeedMps: number;
  /** Width of the gust front in metres. */
  frontWidthMeters: number;
  /** Maximum downwind propagation distance retained by the fixed packet pool. */
  maximumTravelDistanceMeters?: number;
}

/** World-space band scales used by both CPU sampling and the packed GPU spectrum. */
export interface WindSpectrumProfile {
  macroScaleMeters: number;
  mesoScaleMeters: number;
  microScaleMeters: number;
  /** Maximum horizontal directional deflection contributed by the spectrum. */
  directionalVariation: number;
}

/** Complete portable configuration for one wind field. */
export interface WindSystemConfig {
  seed: number;
  baseDirection: WindVector3Tuple;
  baseSpeedMps: number;
  /** Critically damped response time for weather and authored target changes. */
  responseTimeSeconds: number;
  layerMultipliers: WindLayerMultipliers;
  gust: WindGustProfile;
  spectrum: WindSpectrumProfile;
  /** Fixed capacity of the travelling gust-packet pool. */
  maxActiveGusts: number;
  maxEmitters: number;
}

/** Local analytical source rasterized into the Tier 2 field and available to CPU consumers. */
export type WindEmitterType = "directional" | "radial" | "vortex" | "updraft";

export interface WindEmitter {
  id: string;
  type: WindEmitterType;
  position: WindVector3Tuple;
  /** Directional sources use this vector; other source types derive their horizontal direction. */
  direction: WindVector3Tuple;
  radiusMeters: number;
  strengthMps: number;
  turbulence: number;
  priority?: number;
  enabled?: boolean;
}

/** Optional terrain/canopy lookup. Zero is fully sheltered and one is exposed. */
export interface WindExposureSampler {
  sampleExposure(position: WindVector3Like, windDirection: WindVector3Like): number;
  /** Optional batch preparation used to preselect spatial data before dense field rasterization. */
  prepareSampling?(bounds: Readonly<WindLocalFieldBounds>): void;
  /** Optional monotonic token for terrain/residency changes without replacing the sampler object. */
  getRevision?(): number;
}

/** One low-resolution GPU exposure update requested by WindSceneBridge. */
export interface WindGpuExposureRenderRequest extends WindLocalFieldBounds {
  readonly resolution: number;
  readonly directionX: number;
  readonly directionZ: number;
}

/** Optional terrain/canopy GPU producer; the engine wind system consumes only its normalized texture. */
export interface WindGpuExposureProvider {
  getRevision(): number;
  render(request: Readonly<WindGpuExposureRenderRequest>): Texture2D;
  /** Previous complete exposure raster paired with the most recent render result. */
  getPreviousTexture(): Texture2D;
}

/**
 * Mutable allocation-safe air sample returned by {@link WindSystem.sample}.
 *
 * @remarks
 * All velocities use metres per second in world space and point in the direction the air travels.
 * The decomposed vectors let each consumer apply its own transfer function without reading private
 * weather or field state. Tuples are reused when callers pass an output sample and must not be
 * retained independently from their containing sample.
 */
export interface WindSample {
  /** Final air velocity after mean flow, gusts, turbulence, shelter, and local emitters. */
  velocityWS: WindVector3Tuple;
  /** Weather-smoothed layer velocity after shelter, excluding gusts and local variation. */
  meanVelocityWS: WindVector3Tuple;
  /** Travelling gust contribution after shelter. */
  gustVelocityWS: WindVector3Tuple;
  /** Analytical local-emitter contribution. */
  localVelocityWS: WindVector3Tuple;
  /** Final air velocity relative to the receiver velocity supplied to `sample`. */
  relativeVelocityWS: WindVector3Tuple;
  /** Unit direction of the final air velocity; retains the authored direction in calm conditions. */
  directionWS: WindVector3Tuple;
  speedMps: number;
  /** Normalized travelling-packet envelope at the sample position. */
  gust: number;
  /** Normalized unresolved air variation in the range 0..1. */
  turbulence: number;
  /** Normalized shelter multiplier in the range 0..1. */
  exposure: number;
  /** Height band used to resolve the sample. */
  layer: WindLayer;
  /** Monotonic simulation time corresponding to this sample. */
  timeSeconds: number;
}

/** One distance band and the consumer features retained inside it. */
export interface WindLodBand {
  tier: Exclude<WindLodTier, "off">;
  /** Inclusive end of this band in metres from the active camera. */
  maximumDistanceMeters: number;
  /** Coherent, low-frequency response weight. */
  primaryMotion: number;
  /** Branch, shape, or medium-frequency response weight. */
  secondaryMotion: number;
  /** Leaf, ripple, erosion, or other high-frequency response weight. */
  microMotion: number;
  /** Camera-centred spatial field sampling weight. */
  localField: number;
  /** Per-instance temporal-state weight. */
  statefulResponse: number;
}

/** Asset- or family-owned quality policy; distances are strictly increasing. */
export interface WindLodPolicy {
  bands: readonly WindLodBand[];
  /** Width before each band boundary used to cross-fade into the next tier. */
  transitionMeters: number;
}

/** Base profile shared by concrete tree, vegetation, cloud, and water response profiles. */
export interface WindResponseProfile {
  readonly id: string;
  readonly consumerKind: WindConsumerKind;
  readonly layer: WindLayer;
  /** Speed used to normalize the physical sample into the response domain. */
  readonly referenceSpeedMps: number;
  readonly meanGain: number;
  readonly gustGain: number;
  readonly turbulenceGain: number;
  readonly localGain: number;
  /** Natural frequency of the receiver's dominant response. */
  readonly naturalFrequencyHz: number;
  /** Dimensionless second-order damping ratio. */
  readonly dampingRatio: number;
  /** Optional load-follow time constant that removes discontinuous forcing before inertia integration. */
  readonly targetSmoothingSeconds?: number;
  /** Absolute response-vector limit after all gains. */
  readonly maximumResponse: number;
  readonly lodPolicy: Readonly<WindLodPolicy>;
}

/** Per-frame values supplied by the owner of a consumer instance. */
export interface WindConsumerFrameContext {
  readonly deltaTimeSeconds: number;
  readonly distanceToCameraMeters: number;
}

/** Consumer contract. One adapter implementation serves every instance of one receiver family. */
export interface WindConsumerAdapter<TProfile extends WindResponseProfile, TState, TOutput> {
  readonly profile: TProfile;
  createState(): TState;
  createOutput(): TOutput;
  update(sample: Readonly<WindSample>, frame: Readonly<WindConsumerFrameContext>, state: TState, out: TOutput): TOutput;
}

/** Local contribution reused by analytical emitters and the camera-centred GPU texture. */
export interface WindLocalSample {
  velocityDeltaWS: WindVector3Tuple;
  turbulence: number;
  exposure: number;
  /** Sheltered travelling-gust multiplier, kept separate from analytical-emitter velocity. */
  gust: number;
}

/** Reused render-facing state; textures and Scene ownership live in WindSceneBridge. */
export interface WindGpuContext {
  velocityWS: WindVector3Tuple;
  directionWS: WindVector3Tuple;
  /** Time-integrated world-space XZ displacement of the frozen wind spectrum. */
  spectrumAdvectionOffsetXZ: WindVector2Tuple;
  layerMultipliers: WindVector3Tuple;
  speedMps: number;
  gust: number;
  turbulence: number;
  elapsedTime: number;
  spectrum: Readonly<WindSpectrumProfile>;
}

/** Fixed-capacity allocation-free descriptor storage written by WindSystem for the GPU raster pass. */
export interface WindGpuFieldDescriptorBuffer {
  emitterCount: number;
  gustCount: number;
  readonly emitterPositionRadius: Float32Array;
  readonly emitterDirectionStrength: Float32Array;
  readonly emitterParameters: Float32Array;
  readonly gustOriginDirection: Float32Array;
  readonly gustTiming: Float32Array;
}

/** One detached travelling packet at the diagnostics boundary. */
export interface WindGustSnapshot {
  amplitude: number;
  elapsed: number;
  duration: number;
  originWS: WindVector3Tuple;
}

/** Detached diagnostic state with no shared vector instances. */
export interface WindSystemSnapshot extends WindGpuContext {
  targetVelocityWS: WindVector3Tuple;
  referencePositionWS: WindVector3Tuple;
  emitterCount: number;
  /** All live packets in stable pool order. */
  activeGusts: WindGustSnapshot[];
}

/** Creates the mobile-oriented baseline without sharing nested mutable objects. */
export function createDefaultWindSystemConfig(): WindSystemConfig {
  return {
    seed: 0x57494e44,
    baseDirection: [1, 0, 0],
    baseSpeedMps: 4,
    responseTimeSeconds: 0.65,
    layerMultipliers: { ground: 0.72, canopy: 1, cloud: 1.65 },
    gust: {
      frequencyPerMinute: 8,
      amplitudeMin: 0.28,
      amplitudeMax: 1,
      attackSeconds: 0.7,
      holdSeconds: 0.6,
      decaySeconds: 3.8,
      frontSpeedMps: 9,
      frontWidthMeters: 18,
      maximumTravelDistanceMeters: 64
    },
    spectrum: {
      macroScaleMeters: 78,
      mesoScaleMeters: 21,
      microScaleMeters: 5.5,
      directionalVariation: 0.18
    },
    maxActiveGusts: 4,
    maxEmitters: 16
  };
}
