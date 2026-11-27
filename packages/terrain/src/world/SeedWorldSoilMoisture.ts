/** Terrain and climate inputs for one broad soil-moisture sample. */
export interface SeedWorldClimateMoistureSample {
  /** Seeded precipitation/climate signal in the normalized zero-to-one range. */
  readonly climate: number;
  /** Terrain elevation normalized across the authored world-height range. */
  readonly elevation: number;
  /** Local slope angle normalized so one represents ninety degrees. */
  readonly slope: number;
  /** Signed local curvature where positive values represent concave terrain. */
  readonly curvature: number;
  /** Normalized upslope contributing flow. */
  readonly flow: number;
  /** Distance from the ocean shoreline in world metres. */
  readonly oceanDistanceMetres: number;
}

/** Final-terrain inputs for groundwater-connected riparian moisture. */
export interface SeedWorldRiparianMoistureSample {
  /** Broad climate and terrain moisture before local inland-water influence. */
  readonly baselineMoisture: number;
  /** Signed distance from the nearest canonical inland-water boundary in world metres. */
  readonly inlandWaterDistanceMetres: number;
  /** Final-terrain slope angle normalized so one represents ninety degrees. */
  readonly slope: number;
  /** Normalized upslope contributing flow. */
  readonly flow: number;
  /** Normalized fine sediment/deposition response. */
  readonly sediment: number;
}

const COASTAL_CLIMATE_FALLOFF_METRES = 720;
const MINIMUM_GROUNDWATER_REACH_METRES = 60;
const MAXIMUM_GROUNDWATER_REACH_METRES = 320;

/**
 * Resolves broad root-zone moisture from climate, contributing flow, and terrain drainage.
 * @param sample Normalized climate and topographic drivers at one planning cell.
 * @returns Continuous normalized soil moisture without local inland-water saturation.
 */
export function resolveSeedWorldClimateMoisture(sample: SeedWorldClimateMoistureSample): number {
  const climate = clamp01(sample.climate);
  const lowlandStorage = (1 - clamp01(sample.elevation)) * 0.1;
  const contributingFlow = flowResponse(sample.flow) * 0.18;
  const concaveStorage = smoothstep(0, 0.15, sample.curvature) * 0.12;
  const slopeDrainage = smoothstep(0.08, 0.65, sample.slope) * 0.16;
  const normalizedCoastalDistance = Math.max(0, sample.oceanDistanceMetres) / COASTAL_CLIMATE_FALLOFF_METRES;
  const coastalFalloff = 1 + normalizedCoastalDistance;
  const coastalClimate = 0.06 / (coastalFalloff * coastalFalloff);
  return clamp01(
    0.21 + climate * 0.42 + lowlandStorage + contributingFlow + concaveStorage + coastalClimate - slopeDrainage
  );
}

/**
 * Adds continuous groundwater-connected inland-water moisture to one final-terrain sample.
 * @param sample Baseline moisture, canonical water distance, and local retention drivers.
 * @returns Continuous normalized root-zone moisture with no fixed-distance cutoff.
 */
export function resolveSeedWorldRiparianMoisture(sample: SeedWorldRiparianMoistureSample): number {
  const baseline = clamp01(sample.baselineMoisture);
  if (sample.inlandWaterDistanceMetres <= 0) return 1;
  const flatRetention = 1 - smoothstep(0.04, 0.45, sample.slope);
  const contributingFlow = flowResponse(sample.flow);
  const retention = clamp01(flatRetention * 0.55 + contributingFlow * 0.3 + clamp01(sample.sediment) * 0.15);
  const reachMetres = mix(MINIMUM_GROUNDWATER_REACH_METRES, MAXIMUM_GROUNDWATER_REACH_METRES, retention);
  const normalizedWaterDistance = sample.inlandWaterDistanceMetres / reachMetres;
  const groundwaterFalloff = 1 + normalizedWaterDistance;
  const groundwaterInfluence = 1 / (groundwaterFalloff * groundwaterFalloff);
  return clamp01(1 - (1 - baseline) * (1 - groundwaterInfluence));
}

function flowResponse(flow: number): number {
  return Math.sqrt(Math.sqrt(clamp01(flow)));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / (edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
