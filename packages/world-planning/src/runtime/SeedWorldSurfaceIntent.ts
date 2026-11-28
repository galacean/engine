import type { SeedWorldFields } from "./SeedWorldFields.ts";
import type { SeedWorldPlan } from "../world/SeedWorldPlanner.ts";

const SEED_WORLD_RIPARIAN_SOIL_END_METRES = 18;
const SEED_WORLD_RIPARIAN_VEGETATION_START_METRES = 6;
const SEED_WORLD_RIPARIAN_VEGETATION_FULL_METRES = 18;
const SEED_WORLD_RIPARIAN_FLOWER_START_METRES = 0;
const SEED_WORLD_RIPARIAN_FLOWER_FULL_METRES = 2;
const SEED_WORLD_RIPARIAN_FLOWER_INLAND_START_METRES = 12;
const SEED_WORLD_RIPARIAN_FLOWER_INLAND_FULL_METRES = 24;
const SEED_WORLD_RIPARIAN_FLOWER_BANK_DENSITY_MULTIPLIER = 1.6;

/**
 * Resolves wet soil ownership from signed distance to the nearest water boundary.
 * @param signedWaterDistanceMetres Negative inside water and positive on dry land, in world metres.
 * @returns Normalized soil ownership, fully wet at the shoreline and zero eighteen metres inland.
 */
export function resolveSeedWorldRiparianSoilWeight(signedWaterDistanceMetres: number): number {
  return 1 - smootherstep(0, SEED_WORLD_RIPARIAN_SOIL_END_METRES, signedWaterDistanceMetres);
}

/**
 * Resolves Detail vegetation clearance from signed distance to the nearest water boundary.
 * @param signedWaterDistanceMetres Negative inside water and positive on dry land, in world metres.
 * @returns Normalized vegetation ownership with a six-metre dry gap and full ownership at eighteen metres.
 */
export function resolveSeedWorldRiparianVegetationWeight(signedWaterDistanceMetres: number): number {
  return smootherstep(
    SEED_WORLD_RIPARIAN_VEGETATION_START_METRES,
    SEED_WORLD_RIPARIAN_VEGETATION_FULL_METRES,
    signedWaterDistanceMetres
  );
}

/**
 * Resolves the shoreline entry and high-moisture density boost used only by terrestrial flower Detail.
 * Flowers remain outside Water, reach their bank density within two metres, and return to inland density by 24 m.
 * @returns A density multiplier which may exceed one inside the authored riverbank accent band.
 */
export function resolveSeedWorldRiparianFlowerWeight(signedWaterDistanceMetres: number): number {
  const shorelineEntry = smootherstep(
    SEED_WORLD_RIPARIAN_FLOWER_START_METRES,
    SEED_WORLD_RIPARIAN_FLOWER_FULL_METRES,
    signedWaterDistanceMetres
  );
  const inlandTransition = smootherstep(
    SEED_WORLD_RIPARIAN_FLOWER_INLAND_START_METRES,
    SEED_WORLD_RIPARIAN_FLOWER_INLAND_FULL_METRES,
    signedWaterDistanceMetres
  );
  return shorelineEntry * (1 + (SEED_WORLD_RIPARIAN_FLOWER_BANK_DENSITY_MULTIPLIER - 1) * (1 - inlandTransition));
}

/** Final material intent compiled from the authoritative vector-owned surface fields. */
export interface SeedWorldSurfaceMaterialIntent {
  /** Square sample resolution shared with WorldFields surface data. */
  readonly resolution: number;
  /** RGBA8 weights: grass, wetland/ocean, final-slope cliff, and road. */
  readonly materialWeights: Uint8Array;
  /** Optional independent Terrain layer, projected from Planner river footprints. */
  readonly riverBedCoverage?: Uint8Array;
  /** Material-only natural soil coverage; classification and collision remain unchanged. */
  readonly soilCoverage?: Uint8Array;
  /** Stable hash covering the final material weights. */
  readonly hash: number;
}

/** Copies the runtime-transferable material raster for an independent layout preview lease. */
export function cloneSeedWorldSurfaceMaterialIntent(
  intent: SeedWorldSurfaceMaterialIntent
): SeedWorldSurfaceMaterialIntent {
  return Object.freeze({
    ...intent,
    materialWeights: new Uint8Array(intent.materialWeights),
    ...(intent.soilCoverage ? { soilCoverage: new Uint8Array(intent.soilCoverage) } : {}),
    ...(intent.riverBedCoverage ? { riverBedCoverage: new Uint8Array(intent.riverBedCoverage) } : {})
  });
}

/**
 * Resolves final-R16 slope ownership without letting placed decorations mutate Terrain ownership.
 * @param plan Authoritative plan owning the world extent.
 * @param fields Canonical natural surface fields.
 * @param outputResolution Optional area-filtered runtime Alphamap resolution.
 * @returns Independent material weights ready for Worker transfer.
 * @throws {RangeError} When world ownership differs or the output does not divide the source lattice.
 */
export function compileSeedWorldSurfaceMaterialIntent(
  plan: SeedWorldPlan,
  fields: SeedWorldFields,
  outputResolution = fields.surfaceResolution
): SeedWorldSurfaceMaterialIntent {
  if (plan.rootSeed !== fields.rootSeed || plan.sizeMetres !== fields.sizeMetres) {
    throw new RangeError("Seed World surface intent requires Plan and WorldFields from the same world");
  }
  if (
    !Number.isInteger(outputResolution) ||
    outputResolution < 1 ||
    fields.surfaceResolution % outputResolution !== 0
  ) {
    throw new RangeError("Seed World Alphamap resolution must evenly divide the compiled surface lattice");
  }
  const factor = fields.surfaceResolution / outputResolution;
  const sampleCount = factor * factor;
  const materialWeights = new Uint8Array(outputResolution * outputResolution * 4);
  for (let outputY = 0; outputY < outputResolution; outputY++) {
    for (let outputX = 0; outputX < outputResolution; outputX++) {
      const channelSums = [0, 0, 0, 0];
      for (let localY = 0; localY < factor; localY++) {
        const sourceY = outputY * factor + localY;
        for (let localX = 0; localX < factor; localX++) {
          const sourceX = outputX * factor + localX;
          const sourceIndex = sourceY * fields.surfaceResolution + sourceX;
          const sourceOffset = sourceIndex * 4;
          const grassWeight = fields.materialWeights[sourceOffset]!;
          const finalGrassWeight = resolveSeedWorldGrassSurfaceWeight(fields, sourceIndex);
          const rockWeight = grassWeight - finalGrassWeight;
          channelSums[0] += finalGrassWeight;
          channelSums[1] += fields.materialWeights[sourceOffset + 1]!;
          channelSums[2] += rockWeight;
          channelSums[3] += fields.materialWeights[sourceOffset + 3]!;
        }
      }
      writeNormalizedAverage(materialWeights, (outputY * outputResolution + outputX) * 4, channelSums, sampleCount);
    }
  }
  let hash = 0x811c9dc5;
  for (const value of materialWeights) hash = hashUint32(hash, value);
  return Object.freeze({ resolution: outputResolution, materialWeights, hash: hash >>> 0 });
}

/**
 * Resolves the final grass-channel ownership shared by Alphamap and Detail density compilation.
 * @param fields Canonical natural surface fields.
 * @param sampleIndex Surface-lattice sample index.
 * @returns Final grass ownership in the unsigned-byte range 0..255.
 */
export function resolveSeedWorldGrassSurfaceWeight(fields: SeedWorldFields, sampleIndex: number): number {
  const grassWeight = fields.materialWeights[sampleIndex * 4]!;
  const rockWeight = Math.min(grassWeight, Math.round((grassWeight * fields.rockySlopeWeight[sampleIndex]!) / 255));
  return grassWeight - rockWeight;
}

/**
 * Returns the buffer owned by one compiled material intent for optional Worker transfer.
 * Transferring this array detaches the typed array in the caller's intent object.
 * @param intent Compiled surface intent whose buffer will be transferred by the caller.
 * @returns Material-weight buffer.
 */
export function seedWorldSurfaceIntentTransferables(intent: SeedWorldSurfaceMaterialIntent): Transferable[] {
  return [
    intent.materialWeights.buffer,
    ...(intent.soilCoverage ? [intent.soilCoverage.buffer] : []),
    ...(intent.riverBedCoverage ? [intent.riverBedCoverage.buffer] : [])
  ];
}

function hashUint32(hash: number, value: number): number {
  return Math.imul(hash ^ value, 0x01000193) >>> 0;
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const amount = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

function writeNormalizedAverage(
  target: Uint8Array,
  offset: number,
  channelSums: readonly number[],
  sampleCount: number
): void {
  const fractions: Array<{ readonly channel: number; readonly fraction: number }> = [];
  let remaining = 255;
  for (let channel = 0; channel < 4; channel++) {
    const average = channelSums[channel]! / sampleCount;
    const value = Math.floor(average);
    target[offset + channel] = value;
    remaining -= value;
    fractions.push({ channel, fraction: average - value });
  }
  fractions.sort((left, right) => right.fraction - left.fraction || left.channel - right.channel);
  for (let index = 0; index < remaining; index++) target[offset + fractions[index]!.channel]++;
}
