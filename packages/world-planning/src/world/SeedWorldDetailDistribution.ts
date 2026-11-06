import { deriveSeedWorldNamedSeed } from "./SeedWorldPlanner";
import type { SeedWorldDetailSpeciesProfile, SeedWorldWarpedClusterDetailDistribution } from "./SeedWorldDetailSpecies";

interface FlowerCluster {
  readonly x: number;
  readonly z: number;
  readonly majorRadius: number;
  readonly minorRadius: number;
  readonly cosine: number;
  readonly sine: number;
  readonly warpWavelength: number;
  readonly warpAmplitude: number;
  readonly seed: number;
}

/**
 * Compiles one species' stable macro-distribution multiplier at DensityField resolution.
 * @param worldSizeMetres Square world extent in metres.
 * @param resolution DensityField samples per axis.
 * @param operationSeed Named Root-Seed child owned by one Detail operation.
 * @param profile Versioned species distribution profile.
 * @param baseSuitability Per-texel habitat, moisture, and slope suitability before clustering.
 * @returns One cluster-coverage multiplier per DensityField texel; samples outside every cluster are zero.
 * @throws {RangeError} When the field dimensions or profile parameters are invalid.
 */
export function compileSeedWorldDetailDistribution(
  worldSizeMetres: number,
  resolution: number,
  operationSeed: number,
  profile: SeedWorldDetailSpeciesProfile,
  baseSuitability: Float32Array
): Float32Array {
  if (baseSuitability.length !== resolution * resolution) {
    throw new RangeError("Seed World Detail distribution dimensions do not match the DensityField");
  }
  if (profile.distribution.kind === "uniform-habitat") {
    const result = new Float32Array(baseSuitability.length);
    result.fill(1);
    return result;
  }
  const distribution = profile.distribution;
  if (distribution.clusteredFraction < 0 || distribution.clusteredFraction > 1) {
    throw new RangeError("Seed World flower clustered fraction must be within [0, 1]");
  }
  const sampleAreaSquareMetres = (worldSizeMetres / resolution) ** 2;
  let suitableAreaSquareMetres = 0;
  for (const suitability of baseSuitability) suitableAreaSquareMetres += suitability * sampleAreaSquareMetres;
  const clustersPerSquareKilometre = mixRange(
    distribution.clustersPerSuitableSquareKilometre,
    unitFloat(operationSeed, "cluster-density")
  );
  const targetClusterCount = Math.max(
    1,
    Math.round((suitableAreaSquareMetres / 1_000_000) * clustersPerSquareKilometre)
  );
  const clusters = createClusters(
    worldSizeMetres,
    resolution,
    operationSeed,
    distribution,
    baseSuitability,
    targetClusterCount
  );
  const response = rasterizeClusterResponse(worldSizeMetres, resolution, clusters);
  const result = new Float32Array(response.length);
  for (let index = 0; index < response.length; index++) {
    result[index] = response[index]! * distribution.clusteredFraction;
  }
  return result;
}

function createClusters(
  worldSizeMetres: number,
  resolution: number,
  operationSeed: number,
  distribution: SeedWorldWarpedClusterDetailDistribution,
  baseSuitability: Float32Array,
  targetCount: number
): readonly FlowerCluster[] {
  const cumulativeWeights = new Float64Array(baseSuitability.length);
  let totalWeight = 0;
  for (let index = 0; index < baseSuitability.length; index++) {
    const suitability = baseSuitability[index]!;
    // Flower clusters are ecological accents: their parent centres follow the complete
    // continuous suitability, including the authored high-moisture riverbank boost.
    totalWeight += suitability;
    cumulativeWeights[index] = totalWeight;
  }
  if (totalWeight <= Number.EPSILON) return Object.freeze([]);
  const result: FlowerCluster[] = [];
  const spacingMetres = worldSizeMetres / resolution;
  for (let ordinal = 0; ordinal < targetCount; ordinal++) {
    const seed = deriveSeedWorldNamedSeed(operationSeed, `cluster:${ordinal}`);
    const cumulativeTarget = ((ordinal + unitFloat(seed, "weighted-position")) / targetCount) * totalWeight;
    const sampleIndex = lowerBound(cumulativeWeights, cumulativeTarget);
    const sampleX = sampleIndex % resolution;
    const sampleZ = Math.floor(sampleIndex / resolution);
    const x = (sampleX + unitFloat(seed, "x") - resolution * 0.5) * spacingMetres;
    const z = (sampleZ + unitFloat(seed, "z") - resolution * 0.5) * spacingMetres;
    const angle = unitFloat(seed, "angle") * Math.PI * 2;
    result.push(
      Object.freeze({
        x,
        z,
        majorRadius: mixRange(distribution.majorRadiusMetres, unitFloat(seed, "major-radius")),
        minorRadius: mixRange(distribution.minorRadiusMetres, unitFloat(seed, "minor-radius")),
        cosine: Math.cos(angle),
        sine: Math.sin(angle),
        warpWavelength: mixRange(distribution.warpWavelengthMetres, unitFloat(seed, "warp-wavelength")),
        warpAmplitude: mixRange(distribution.warpAmplitudeMetres, unitFloat(seed, "warp-amplitude")),
        seed
      })
    );
  }
  return Object.freeze(result);
}

function lowerBound(values: Float64Array, target: number): number {
  let lower = 0;
  let upper = values.length - 1;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) * 0.5);
    if (values[middle]! < target) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

function rasterizeClusterResponse(
  worldSizeMetres: number,
  resolution: number,
  clusters: readonly FlowerCluster[]
): Float32Array {
  const result = new Float32Array(resolution * resolution);
  const spacing = worldSizeMetres / resolution;
  for (const cluster of clusters) {
    const warpXCache = new Map<string, number>();
    const warpZCache = new Map<string, number>();
    const supportRadius = cluster.majorRadius + cluster.warpAmplitude;
    const minimumX = clamp(
      Math.floor((cluster.x - supportRadius + worldSizeMetres * 0.5) / spacing),
      0,
      resolution - 1
    );
    const maximumX = clamp(Math.ceil((cluster.x + supportRadius + worldSizeMetres * 0.5) / spacing), 0, resolution - 1);
    const minimumZ = clamp(
      Math.floor((cluster.z - supportRadius + worldSizeMetres * 0.5) / spacing),
      0,
      resolution - 1
    );
    const maximumZ = clamp(Math.ceil((cluster.z + supportRadius + worldSizeMetres * 0.5) / spacing), 0, resolution - 1);
    for (let z = minimumZ; z <= maximumZ; z++) {
      const worldZ = (z + 0.5) * spacing - worldSizeMetres * 0.5;
      for (let x = minimumX; x <= maximumX; x++) {
        const worldX = (x + 0.5) * spacing - worldSizeMetres * 0.5;
        const warpX =
          (valueNoise(cluster.seed, worldX, worldZ, cluster.warpWavelength, "warp-x", warpXCache) * 2 - 1) *
          cluster.warpAmplitude;
        const warpZ =
          (valueNoise(cluster.seed, worldX, worldZ, cluster.warpWavelength, "warp-z", warpZCache) * 2 - 1) *
          cluster.warpAmplitude;
        const offsetX = worldX + warpX - cluster.x;
        const offsetZ = worldZ + warpZ - cluster.z;
        const localX = (offsetX * cluster.cosine + offsetZ * cluster.sine) / cluster.majorRadius;
        const localZ = (-offsetX * cluster.sine + offsetZ * cluster.cosine) / cluster.minorRadius;
        const distance = Math.hypot(localX, localZ);
        if (distance >= 1) continue;
        const response = smoothstep(1, 0, distance);
        const index = z * resolution + x;
        result[index] = Math.max(result[index]!, response);
      }
    }
  }
  return result;
}

function valueNoise(
  seed: number,
  x: number,
  z: number,
  wavelength: number,
  stream: string,
  cache: Map<string, number>
): number {
  const gridX = x / wavelength;
  const gridZ = z / wavelength;
  const x0 = Math.floor(gridX);
  const z0 = Math.floor(gridZ);
  const tx = fade(gridX - x0);
  const tz = fade(gridZ - z0);
  const a = latticeRandom(seed, x0, z0, stream, cache);
  const b = latticeRandom(seed, x0 + 1, z0, stream, cache);
  const c = latticeRandom(seed, x0, z0 + 1, stream, cache);
  const d = latticeRandom(seed, x0 + 1, z0 + 1, stream, cache);
  return mix(mix(a, b, tx), mix(c, d, tx), tz);
}

function latticeRandom(seed: number, x: number, z: number, stream: string, cache: Map<string, number>): number {
  const key = `${x}:${z}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const value = unitFloat(deriveSeedWorldNamedSeed(seed, `${stream}:${key}`), "value");
  cache.set(key, value);
  return value;
}

function unitFloat(seed: number, stream: string): number {
  return deriveSeedWorldNamedSeed(seed, stream) / 0x1_0000_0000;
}

function mixRange(range: readonly [number, number], value: number): number {
  return mix(range[0], range[1], value);
}

function mix(a: number, b: number, value: number): number {
  return a + (b - a) * value;
}

function fade(value: number): number {
  return value * value * (3 - 2 * value);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
