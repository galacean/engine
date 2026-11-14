/** Width of the Enviro-compatible procedural weather field. */
export const VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH = 512;
/** Height of the Enviro-compatible procedural weather field. */
export const VOLUMETRIC_CLOUD_WEATHER_MAP_HEIGHT = 512;
/** Stable default seed. Zero reproduces Enviro 3's unseeded field. */
export const VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SEED = 0;

const WEATHER_MAP_CHANNEL_COUNT = 4;
const WEATHER_MAP_HISTOGRAM_SIZE = 256;
const WORLEY_NEIGHBOR_RADIUS = 1;
const WORLEY_RANDOM_Y_OFFSET_X = 17;
const WORLEY_RANDOM_Y_OFFSET_Y = 37;
const HASH_PERIOD_PADDING = 4096;
const HASH_X = 73856093;
const HASH_Y = 19349663;
const HASH_TO_UNIT = 0.000000119;
const UINT32_RANGE = 4294967296;
let defaultBasisCache: Uint8Array | null = null;

/** Authored horizontal-field generation and live resolution parameters. */
export interface VolumetricCloudWeatherMapProfile {
  readonly largeFrequency: number;
  readonly fineFrequency: number;
  readonly largeBias: number;
  readonly fineBias: number;
  readonly octaveCount: number;
  readonly octaveAmplitude: number;
  readonly octaveAmplitudeMultiplier: number;
  readonly octaveFrequencyMultiplier: number;
  readonly coverageDilation: number;
  /** Center of the low-frequency type variation sampled from the large Worley field. */
  readonly typeNoiseCenter: number;
  /** Signed local type variation around the global cloud-type control. */
  readonly typeNoiseAmplitude: number;
  readonly topCloudExponent: number;
  readonly topCoveragePowerScale: number;
  /** Normalized coverage used only when authoring the packed preview channel. */
  readonly defaultTopCoverage: number;
  readonly locationOffsetX: number;
  readonly seedOffsetYScale: number;
}

/** Horizontal-field baseline expressed entirely as profile data. */
export const VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE: Readonly<VolumetricCloudWeatherMapProfile> = Object.freeze({
  largeFrequency: 12,
  fineFrequency: 48,
  largeBias: 1.4,
  fineBias: 2.2,
  octaveCount: 3,
  octaveAmplitude: 0.5,
  octaveAmplitudeMultiplier: 0.5,
  octaveFrequencyMultiplier: 2,
  coverageDilation: 0.75,
  typeNoiseCenter: 0.5,
  typeNoiseAmplitude: 0.65,
  topCloudExponent: 1.5,
  topCoveragePowerScale: 2,
  defaultTopCoverage: 0.27,
  locationOffsetX: 0.8,
  seedOffsetYScale: 0.37
});

export interface VolumetricCloudWeatherMapOptions {
  readonly seed?: number;
  readonly profile?: Readonly<VolumetricCloudWeatherMapProfile>;
}

/** Continuous controls resolved into the procedural cloud weather field. */
export interface VolumetricCloudWeatherSettings {
  /** Occupied fraction of the horizontal weather domain in `[0, 1]`. */
  coverage: number;
  cloudType: number;
  detail: number;
}

/** Engine baseline for the horizontal Weather Map layer. */
export const VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SETTINGS: Readonly<VolumetricCloudWeatherSettings> = Object.freeze({
  coverage: 0.46,
  cloudType: 0.5,
  detail: 0.4
});

/**
 * Deterministic CPU port of Enviro 3's WeatherTexture algorithm.
 *
 * The packed basis stores the two three-octave Worley fields in R/G. B keeps a
 * default top-cloud preview, while A stores the cumulative distribution rank
 * of the dilated coverage field. The rank makes normalized coverage mean the
 * occupied horizontal fraction instead of adding a non-zero density floor to
 * every texel. Live weather changes therefore remain a single texture lookup.
 */
export class VolumetricCloudWeatherMap {
  readonly basis = new Uint8Array(
    VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH * VOLUMETRIC_CLOUD_WEATHER_MAP_HEIGHT * WEATHER_MAP_CHANNEL_COUNT
  );
  readonly profile: Readonly<VolumetricCloudWeatherMapProfile>;
  readonly seed: number;

  constructor(options: Readonly<VolumetricCloudWeatherMapOptions> = {}) {
    const seed = options.seed ?? VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SEED;
    if (!Number.isSafeInteger(seed)) throw new RangeError("Volumetric cloud weather seed must be a safe integer");
    this.profile = createVolumetricCloudWeatherMapProfile(options.profile);
    this.seed = seed;
    const usesDefaultProfile =
      options.profile === undefined || options.profile === VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE;
    if (usesDefaultProfile && seed === VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SEED && defaultBasisCache) {
      this.basis.set(defaultBasisCache);
      return;
    }
    const profile = this.profile;
    const seedOffset = seed === VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SEED ? 0 : hashSeed(seed);
    for (let y = 0; y < VOLUMETRIC_CLOUD_WEATHER_MAP_HEIGHT; y++) {
      const v = (y + 0.5) / VOLUMETRIC_CLOUD_WEATHER_MAP_HEIGHT + seedOffset * profile.seedOffsetYScale;
      for (let x = 0; x < VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH; x++) {
        const u = (x + 0.5) / VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH + profile.locationOffsetX + seedOffset;
        const large = worleyFbm2D(u, v, profile.largeFrequency, profile.largeBias, profile);
        const fine = worleyFbm2D(u, v, profile.fineFrequency, profile.fineBias, profile);
        const destination = (y * VOLUMETRIC_CLOUD_WEATHER_MAP_WIDTH + x) * WEATHER_MAP_CHANNEL_COUNT;
        this.basis[destination] = encode(large);
        this.basis[destination + 1] = encode(fine);
      }
    }
    const coverageRanks = buildCoverageRankLookup(this.basis, profile.coverageDilation);
    for (let index = 0; index < this.basis.length; index += WEATHER_MAP_CHANNEL_COUNT) {
      const large = this.basis[index] / 255;
      const fine = this.basis[index + 1] / 255;
      const dilatedCoverage = mix(large, fine, profile.coverageDilation);
      const coverageRank = coverageRanks[encode(dilatedCoverage)] / 255;
      const resolvedCoverage = resolveCoverage(coverageRank, profile.defaultTopCoverage);
      this.basis[index + 2] = encode(resolveTopClouds(large, fine, resolvedCoverage, profile));
      this.basis[index + 3] = encode(coverageRank);
    }
    if (usesDefaultProfile && seed === VOLUMETRIC_CLOUD_DEFAULT_WEATHER_SEED) defaultBasisCache = this.basis.slice();
  }

  /** Pack the Enviro Worley basis into an uploadable RGBA buffer. */
  packBasis(): Uint8Array {
    return this.basis.slice();
  }

  /** Bake a conventional Enviro RGBA weather map for tools and previews. */
  bake(settings: Readonly<VolumetricCloudWeatherSettings>): Uint8Array {
    validateVolumetricCloudWeatherValues(settings.coverage, settings.cloudType, settings.detail);
    const profile = this.profile;
    const coverage = settings.coverage;
    const pixels = new Uint8Array(this.basis.length);
    for (let index = 0; index < this.basis.length; index += WEATHER_MAP_CHANNEL_COUNT) {
      const large = this.basis[index] / 255;
      const fine = this.basis[index + 1] / 255;
      const coverageRank = this.basis[index + 3] / 255;
      const resolvedCoverage = resolveCoverage(coverageRank, coverage);
      const resolvedType = clamp01(
        settings.cloudType + (Math.sqrt(large) - profile.typeNoiseCenter) * profile.typeNoiseAmplitude
      );
      const top = resolveTopClouds(large, fine, coverage, profile);
      pixels[index] = encode(resolvedCoverage);
      pixels[index + 1] = encode(resolvedType);
      pixels[index + 2] = encode(top);
      pixels[index + 3] = encode(Math.sqrt(top));
    }
    return pixels;
  }
}

function worleyFbm2D(
  u: number,
  v: number,
  baseTiles: number,
  bias: number,
  profile: Readonly<VolumetricCloudWeatherMapProfile>
): number {
  let noise = 0;
  let amplitude = profile.octaveAmplitude;
  let tiles = baseTiles;
  for (let octave = 0; octave < profile.octaveCount; octave++) {
    noise += amplitude * worley2D(u, v, tiles);
    tiles *= profile.octaveFrequencyMultiplier;
    amplitude *= profile.octaveAmplitudeMultiplier;
  }
  return clamp01(Math.pow(1 - noise, bias));
}

function worley2D(u: number, v: number, tileCount: number): number {
  const wrappedU = wrap01(u) * tileCount;
  const wrappedV = wrap01(v) * tileCount;
  const baseX = Math.floor(wrappedU);
  const baseY = Math.floor(wrappedV);
  const fractionX = wrappedU - baseX;
  const fractionY = wrappedV - baseY;
  let minimumDistance = 1;
  for (let y = -WORLEY_NEIGHBOR_RADIUS; y <= WORLEY_NEIGHBOR_RADIUS; y++) {
    for (let x = -WORLEY_NEIGHBOR_RADIUS; x <= WORLEY_NEIGHBOR_RADIUS; x++) {
      const randomX = stableHash(baseX + x, baseY + y, tileCount);
      const randomY = stableHash(baseX + x + WORLEY_RANDOM_Y_OFFSET_X, baseY + y + WORLEY_RANDOM_Y_OFFSET_Y, tileCount);
      minimumDistance = Math.min(minimumDistance, Math.hypot(fractionX - (x + randomX), fractionY - (y + randomY)));
    }
  }
  return clamp01(minimumDistance);
}

function stableHash(x: number, y: number, period: number): number {
  const wrappedX = modulo(x + period * HASH_PERIOD_PADDING, period);
  const wrappedY = modulo(y + period * HASH_PERIOD_PADDING, period);
  const hash = (Math.imul(wrappedX, HASH_X) ^ Math.imul(wrappedY, HASH_Y)) >>> 0;
  return wrap01(hash * HASH_TO_UNIT);
}

/**
 * Histogram-equalize the authored coverage basis once on the CPU. This keeps
 * the live GPU control distribution-independent: coverage 0.4 occupies about
 * forty percent of the horizontal weather domain for every deterministic seed.
 */
function buildCoverageRankLookup(basis: Uint8Array, dilation: number): Uint8Array {
  const histogram = new Uint32Array(WEATHER_MAP_HISTOGRAM_SIZE);
  for (let index = 0; index < basis.length; index += WEATHER_MAP_CHANNEL_COUNT) {
    const large = basis[index] / 255;
    const fine = basis[index + 1] / 255;
    histogram[encode(mix(large, fine, dilation))]++;
  }
  const ranks = new Uint8Array(WEATHER_MAP_HISTOGRAM_SIZE);
  const sampleCount = basis.length / WEATHER_MAP_CHANNEL_COUNT;
  let samplesBelow = 0;
  for (let bin = 0; bin < histogram.length; bin++) {
    const binCount = histogram[bin];
    ranks[bin] = encode((samplesBelow + binCount * 0.5) / sampleCount);
    samplesBelow += binCount;
  }
  return ranks;
}

/** Unity-style global coverage remap over a distribution-normalized cloud map. */
function resolveCoverage(coverageRank: number, coverage: number): number {
  const normalizedCoverage = clamp01(coverage);
  if (normalizedCoverage === 0) return 0;
  return clamp01((coverageRank - (1 - normalizedCoverage)) / normalizedCoverage);
}

function resolveTopClouds(
  large: number,
  fine: number,
  resolvedCoverage: number,
  profile: Readonly<VolumetricCloudWeatherMapProfile>
): number {
  if (resolvedCoverage <= 0) return 0;
  const verticalPresence = Math.pow(resolvedCoverage, profile.topCoveragePowerScale);
  return clamp01(resolvedCoverage * (Math.pow(fine * large, profile.topCloudExponent) + verticalPresence));
}

/** Validate and detach horizontal Weather Map generation data. */
export function createVolumetricCloudWeatherMapProfile(
  profile: Readonly<VolumetricCloudWeatherMapProfile> = VOLUMETRIC_CLOUD_DEFAULT_WEATHER_MAP_PROFILE
): Readonly<VolumetricCloudWeatherMapProfile> {
  for (const [name, value] of Object.entries(profile)) {
    if (!Number.isFinite(value)) throw new RangeError(`Volumetric cloud weather-map ${name} must be finite`);
  }
  if (
    !Number.isSafeInteger(profile.largeFrequency) ||
    !Number.isSafeInteger(profile.fineFrequency) ||
    !Number.isSafeInteger(profile.octaveCount) ||
    profile.largeFrequency <= 0 ||
    profile.fineFrequency <= 0 ||
    profile.largeBias <= 0 ||
    profile.fineBias <= 0 ||
    profile.octaveCount <= 0 ||
    profile.octaveAmplitude <= 0 ||
    profile.octaveAmplitudeMultiplier <= 0 ||
    profile.octaveFrequencyMultiplier <= 1 ||
    profile.coverageDilation < 0 ||
    profile.coverageDilation > 1 ||
    profile.typeNoiseCenter < 0 ||
    profile.typeNoiseCenter > 1 ||
    profile.typeNoiseAmplitude < 0 ||
    profile.topCloudExponent <= 0 ||
    profile.topCoveragePowerScale <= 0 ||
    profile.defaultTopCoverage < 0 ||
    profile.defaultTopCoverage > 1
  ) {
    throw new RangeError("Volumetric cloud weather-map profile contains values outside the supported range");
  }
  return Object.freeze({ ...profile });
}

/** Validate and detach normalized live weather controls. */
export function createVolumetricCloudWeatherSettings(
  settings: Readonly<VolumetricCloudWeatherSettings>
): Readonly<VolumetricCloudWeatherSettings> {
  validateVolumetricCloudWeatherValues(settings.coverage, settings.cloudType, settings.detail);
  return Object.freeze({ ...settings });
}

/**
 * Validates scalar weather controls without creating a settings object.
 * @param coverage - Normalized cloud coverage.
 * @param cloudType - Normalized cloud type.
 * @param detail - Normalized cloud detail.
 * @internal
 */
export function validateVolumetricCloudWeatherValues(coverage: number, cloudType: number, detail: number): void {
  validateNormalizedWeatherValue("coverage", coverage);
  validateNormalizedWeatherValue("cloudType", cloudType);
  validateNormalizedWeatherValue("detail", detail);
}

function validateNormalizedWeatherValue(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`Volumetric cloud weather ${name} must be finite and normalized to [0, 1]`);
  }
}

/** Convert the engine weather system's `[0, 1]` coverage to Enviro's authored `[-1, 1]` control. */
export function normalizedToEnviroCoverage(coverage: number): number {
  return clamp(coverage, 0, 1) * 2 - 1;
}

function hashSeed(seed: number): number {
  let value = seed >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / UINT32_RANGE;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function wrap01(value: number): number {
  return value - Math.floor(value);
}

function mix(a: number, b: number, amount: number): number {
  return a + (b - a) * amount;
}

function encode(value: number): number {
  return Math.round(clamp01(value) * 255);
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
