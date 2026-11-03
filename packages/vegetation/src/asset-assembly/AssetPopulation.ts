import {
  derivePopulationDomainSeedForCoordinates,
  PopulationLodMetric,
  type AssetCategory,
  type PopulationTokenV1
} from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import { resolveAssetAppearanceTint } from "./AssetAppearance";
import { TREE_ASSEMBLY_INSTANCE_FLOATS } from "./TreeAssemblyInstancedMesh";
import { BoundingBox, Matrix, Quaternion, Vector3 } from "@galacean/engine";

/** Grasslands Region Detail cell size derived from 1,000 meters over 1,008 cells. */
export const GRASSLANDS_DETAIL_CELL_METERS = 1000 / 1008;

/** Fixed square used by the Grasslands Detail population preview. */
export const DETAIL_PREVIEW_CELLS_PER_SIDE = 6;

/** Detached population metrics displayed by one category panel. */
export interface AssetPopulationMetrics {
  readonly category: AssetCategory;
  readonly instances: number;
  readonly areaSquareMeters: number;
  readonly countPerCell: number | null;
  readonly instancedDraws: number;
}

/** Deterministic compact evidence for one compiled GPU instance buffer. */
export interface AssetPopulationVariationDiagnostics {
  readonly rootSeed: number;
  readonly transformHash: string;
  readonly uniqueRotations: number;
  readonly uniqueScales: number;
}

/** Stable renderer batch identity shared by all instances using the same source primitive. */
export interface AssetBatchDescriptor {
  readonly atomOrVariantId: string;
  readonly lod: number;
  readonly primitive: number;
  readonly material: string;
  readonly shadowMode: "cast" | "none";
}

/** CPU output compiled once from a Population Token and uploaded in batch-sized prefixes. */
export interface CompiledPopulationInstances {
  /** Interleaved GPU records matching `TREE_ASSEMBLY_INSTANCE_FLOATS`. */
  readonly records: Float32Array;
  /** Stable independent density ranks in the inclusive 0..1 range. */
  readonly densityRanks: Float32Array;
  /** Stable independent animation phases in the inclusive 0..1 range. */
  readonly animationPhases: Float32Array;
  /** Catalog-local reusable base variant selected by the appearance domain. */
  readonly baseVariantIndices: Uint16Array;
  readonly count: number;
}

/** Scene-only inputs that do not belong to the portable Population Token. */
export interface PopulationCompilerOptions {
  readonly stageOrigin: readonly [number, number, number];
  readonly authoredColor: readonly [number, number, number];
  /** Whole-asset reference multiplier; scales geometry without changing population placement or density. */
  readonly uniformScale?: number;
  /** Disable seeded size variation when comparing authored asset dimensions. Defaults to true. */
  readonly scaleVariation?: boolean;
  /** Number of reusable base variants registered by this exact catalog entry. */
  readonly baseVariantCount?: number;
}

/** Measures the same source bounds and instance transforms used by the GPU, across the complete population. */
export function resolvePopulationBounds(compiled: CompiledPopulationInstances, source: BoundingBox): BoundingBox {
  const result = new BoundingBox();
  if (compiled.count === 0) return result;
  const matrix = new Matrix();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const position = new Vector3();
  const transformed = new BoundingBox();
  for (let index = 0; index < compiled.count; index++) {
    const offset = index * TREE_ASSEMBLY_INSTANCE_FLOATS;
    const records = compiled.records;
    position.set(records[offset], records[offset + 1], records[offset + 2]);
    rotation.set(records[offset + 4], records[offset + 5], records[offset + 6], records[offset + 7]);
    scale.set(records[offset + 8], records[offset + 9], records[offset + 10]);
    Matrix.affineTransformation(scale, rotation, position, matrix);
    BoundingBox.transform(source, matrix, transformed);
    if (index === 0) result.copyFrom(transformed);
    else BoundingBox.merge(result, transformed, result);
  }
  return result;
}

/**
 * Converts Grasslands Detail density into the exact fixed-patch instance count.
 * @param countPerCell R8-compatible number of complete plant atoms per cell.
 * @param cellsPerSide Fixed preview side length in Region Detail cells.
 * @returns Total complete atoms submitted by one instanced batch.
 */
export function detailPopulationInstanceCount(
  countPerCell: number,
  cellsPerSide = DETAIL_PREVIEW_CELLS_PER_SIDE
): number {
  requireIntegerRange(countPerCell, 0, 255, "Detail count per cell");
  requireIntegerRange(cellsPerSide, 1, 64, "Detail preview cells per side");
  return countPerCell * cellsPerSide * cellsPerSide;
}

/**
 * Returns detached metrics for a validated Population Token.
 * @param token One category's complete local population contract.
 * @returns Instance, area, and batch counts.
 */
export function assetPopulationMetrics(token: PopulationTokenV1): AssetPopulationMetrics {
  const instances = populationInstanceCount(token);
  const [cellsX, cellsZ] = token.population.extentCells;
  const cellMeters = token.population.cellSizeMicrometers / 1_000_000;
  return {
    category: token.category,
    instances,
    areaSquareMeters: cellsX * cellsZ * cellMeters * cellMeters,
    countPerCell: token.lodProfile.metric === PopulationLodMetric.CountPerCell ? token.lodProfile.values[0] : null,
    instancedDraws: Number(instances > 0)
  };
}

/**
 * Returns the exact active instance count represented by one local Population Token.
 * @param token Validated category Token.
 * @returns Standard authored count or 1,000 in stress mode.
 */
export function populationInstanceCount(token: PopulationTokenV1): number {
  if (token.population.mode === "stress-1000") return 1000;
  const quantity = Math.max(...token.lodProfile.values);
  if (token.lodProfile.metric === PopulationLodMetric.DensityPercent) return 1;
  if (token.lodProfile.metric === PopulationLodMetric.CountPerCell) {
    requireIntegerRange(quantity, 0, 255, "Detail count per cell");
    return quantity * token.population.extentCells[0] * token.population.extentCells[1];
  }
  requireIntegerRange(quantity, 0, 1000, "LOD instance count");
  return quantity;
}

/**
 * Resolves the exact stable compiled-instance prefix retained by one LOD quantity value.
 * @param token Population contract whose compiler used the maximum LOD quantity.
 * @param lodIndex Catalog LOD index.
 * @param compiledCount Total compiled records.
 * @returns Exact number of compiled instances submitted by this LOD.
 */
export function populationLodInstanceCount(token: PopulationTokenV1, lodIndex: number, compiledCount: number): number {
  if (token.population.mode === "stress-1000" || token.lodProfile.metric === PopulationLodMetric.DensityPercent) {
    return compiledCount;
  }
  const quantity = token.lodProfile.values[lodIndex];
  if (quantity === undefined || compiledCount <= 0) return 0;
  const requested =
    token.lodProfile.metric === PopulationLodMetric.CountPerCell
      ? quantity * token.population.extentCells[0] * token.population.extentCells[1]
      : quantity;
  return Math.min(compiledCount, Math.max(0, requested));
}

/**
 * Compiles one Token directly into reusable typed instance data without intermediate Entities, objects, or matrices.
 * @param token Complete appearance, density, and local population contract.
 * @param options Scene-only stand origin, authored color, and reusable variant count.
 * @returns Interleaved records plus independent density and animation streams.
 */
export function compilePopulationInstances(
  token: PopulationTokenV1,
  options: PopulationCompilerOptions
): CompiledPopulationInstances {
  const uniformScale = options.uniformScale ?? 1;
  if (!Number.isFinite(uniformScale) || uniformScale <= 0) {
    throw new RangeError("Population uniform scale must be finite and positive");
  }
  const count = populationInstanceCount(token);
  const records = new Float32Array(count * TREE_ASSEMBLY_INSTANCE_FLOATS);
  const densityRanks = new Float32Array(count);
  const animationPhases = new Float32Array(count);
  const baseVariantIndices = new Uint16Array(count);
  const color = resolveAssetAppearanceTint(token.colorRgb, options.authoredColor);
  const baseScale = (token.sizePercent / 100) * uniformScale;
  const baseVariantCount = options.baseVariantCount ?? 1;
  requireIntegerRange(baseVariantCount, 1, 0xffff, "Base variant count");
  const instanceKey = new Int32Array(3);

  for (let index = 0; index < count; index++) {
    writePopulationInstanceKey(token, index, instanceKey);
    const cellX = instanceKey[0];
    const cellZ = instanceKey[1];
    const slot = instanceKey[2];
    const layoutSeed = derivePopulationDomainSeedForCoordinates(
      token.rootSeed,
      "layout",
      token.category,
      cellX,
      cellZ,
      slot
    );
    const appearanceSeed = derivePopulationDomainSeedForCoordinates(
      token.rootSeed,
      "appearance",
      token.category,
      cellX,
      cellZ,
      slot
    );
    const yaw = randomUnit(appearanceSeed, 0) * Math.PI * 2;
    const horizontalScale =
      baseScale * (options.scaleVariation === false ? 1 : 0.88 + randomUnit(appearanceSeed, 1) * 0.24);
    const verticalScale =
      baseScale * (options.scaleVariation === false ? 1 : 0.94 + randomUnit(appearanceSeed, 2) * 0.12);
    const brightness = 0.92 + randomUnit(appearanceSeed, 3) * 0.16;
    const offset = index * TREE_ASSEMBLY_INSTANCE_FLOATS;
    writePopulationPosition(token, count, cellX, cellZ, slot, options.stageOrigin, layoutSeed, records, offset);
    records[offset + 3] = 1;
    records[offset + 4] = 0;
    records[offset + 5] = Math.sin(yaw * 0.5);
    records[offset + 6] = 0;
    records[offset + 7] = Math.cos(yaw * 0.5);
    records[offset + 8] = horizontalScale;
    records[offset + 9] = verticalScale;
    records[offset + 10] = horizontalScale;
    records[offset + 11] = 1;
    records[offset + 12] = Math.min(1, color[0] * brightness);
    records[offset + 13] = Math.min(1, color[1] * brightness);
    records[offset + 14] = Math.min(1, color[2] * brightness);
    records[offset + 15] = 1;
    densityRanks[index] = uint32Unit(
      derivePopulationDomainSeedForCoordinates(token.rootSeed, "density-rank", token.category, cellX, cellZ, slot)
    );
    animationPhases[index] = uint32Unit(
      derivePopulationDomainSeedForCoordinates(token.rootSeed, "animation", token.category, cellX, cellZ, slot)
    );
    baseVariantIndices[index] = Math.min(
      baseVariantCount - 1,
      Math.floor(randomUnit(appearanceSeed, 4) * baseVariantCount)
    );
  }
  return { records, densityRanks, animationPhases, baseVariantIndices, count };
}

/**
 * Copies one compiled record into a batch staging buffer while applying renderer-owned coverage fields.
 * @param output Reused batch staging storage.
 * @param recordIndex Destination record index.
 * @param compiled Immutable Token compiler output.
 * @param sourceIndex Source instance index.
 * @param coverage Signed LOD cross-fade value.
 * @param density Renderer-selected authored foliage density.
 * @param distanceFade Continuous distance-collapse coverage.
 * @param neutralColor Whether to preserve the authored Material without Token tint.
 * @returns Next destination record index.
 */
export function writeCompiledPopulationInstance(
  output: Float32Array,
  recordIndex: number,
  compiled: CompiledPopulationInstances,
  sourceIndex: number,
  coverage = 1,
  density = 1,
  distanceFade = 1,
  neutralColor = false
): number {
  const destinationOffset = recordIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
  const sourceOffset = sourceIndex * TREE_ASSEMBLY_INSTANCE_FLOATS;
  if (
    destinationOffset < 0 ||
    destinationOffset + TREE_ASSEMBLY_INSTANCE_FLOATS > output.length ||
    sourceOffset < 0 ||
    sourceOffset + TREE_ASSEMBLY_INSTANCE_FLOATS > compiled.records.length
  ) {
    throw new RangeError("Compiled Population record exceeds its buffer capacity");
  }
  output.set(compiled.records.subarray(sourceOffset, sourceOffset + TREE_ASSEMBLY_INSTANCE_FLOATS), destinationOffset);
  output[destinationOffset + 3] = distanceFade;
  output[destinationOffset + 11] = density;
  output[destinationOffset + 15] = coverage;
  if (neutralColor) {
    output[destinationOffset + 12] = 1;
    output[destinationOffset + 13] = 1;
    output[destinationOffset + 14] = 1;
  }
  return recordIndex + 1;
}

/**
 * Serializes the exact batch-key fields used by the instanced renderers.
 * @param descriptor Source variant, LOD, primitive, material, and shadow policy.
 * @returns Stable collision-free key for this contract.
 */
export function createAssetBatchKey(descriptor: AssetBatchDescriptor): string {
  if (descriptor.atomOrVariantId.length === 0 || descriptor.material.length === 0) {
    throw new Error("Asset batch identity fields must not be empty");
  }
  requireIntegerRange(descriptor.lod, 0, 15, "Asset batch LOD");
  requireIntegerRange(descriptor.primitive, 0, 255, "Asset batch primitive");
  return JSON.stringify([
    descriptor.atomOrVariantId,
    descriptor.lod,
    descriptor.primitive,
    descriptor.material,
    descriptor.shadowMode
  ]);
}

/**
 * Summarizes deterministic typed instance variability without creating per-instance objects.
 * @param rootSeed Token root source.
 * @param compiled Immutable compiler output.
 * @returns Stable transform hash and unique rotation/scale counts.
 */
export function assetPopulationVariationDiagnostics(
  rootSeed: number,
  compiled: CompiledPopulationInstances
): AssetPopulationVariationDiagnostics {
  requireIntegerRange(rootSeed, 0, 0xffffffff, "Population root seed");
  let hash = 0x811c9dc5;
  const rotations = new Set<string>();
  const scales = new Set<string>();
  for (let index = 0; index < compiled.count; index++) {
    const offset = index * TREE_ASSEMBLY_INSTANCE_FLOATS;
    rotations.add(quantizedValues(compiled.records, offset + 4, 4));
    scales.add(quantizedValues(compiled.records, offset + 8, 3));
    for (let component = 0; component < 11; component++) {
      hash ^= Math.round(compiled.records[offset + component] * 100_000);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return {
    rootSeed,
    transformHash: (hash >>> 0).toString(16).padStart(8, "0"),
    uniqueRotations: rotations.size,
    uniqueScales: scales.size
  };
}

function writePopulationInstanceKey(token: PopulationTokenV1, index: number, output: Int32Array): void {
  const [cellsX, cellsZ] = token.population.extentCells;
  if (token.population.layoutAlgorithm === "centered-pairs-v1") {
    writeCenteredPairInstanceKey(token, index, cellsX, cellsZ, output);
    return;
  }
  if (token.lodProfile.metric === PopulationLodMetric.CountPerCell || token.population.mode === "stress-1000") {
    const cellIndex = index % (cellsX * cellsZ);
    output[0] = cellIndex % cellsX;
    output[1] = Math.floor(cellIndex / cellsX);
    output[2] = Math.floor(index / (cellsX * cellsZ));
    return;
  }
  output[0] = index % cellsX;
  output[1] = Math.floor(index / cellsX);
  output[2] = 0;
}

function writeCenteredPairInstanceKey(
  token: PopulationTokenV1,
  index: number,
  cellsX: number,
  cellsZ: number,
  output: Int32Array
): void {
  const cellCount = cellsX * cellsZ;
  const localIndex = index % cellCount;
  const slot = Math.floor(index / cellCount);
  const hasCenterCell = cellCount % 2 === 1;
  let cellIndex: number;

  if (hasCenterCell && localIndex === 0) {
    cellIndex = Math.floor(cellCount * 0.5);
  } else {
    const pairedIndex = localIndex - Number(hasCenterCell);
    const pairCount = Math.floor(cellCount * 0.5);
    const pairSequence = Math.floor(pairedIndex * 0.5);
    const pairSeed = derivePopulationDomainSeedForCoordinates(token.rootSeed, "layout", token.category, -1, -1, slot);
    const pairOrdinal = permuteIndex(pairSequence, pairCount, pairSeed);
    cellIndex = pairedIndex % 2 === 0 ? pairOrdinal : cellCount - 1 - pairOrdinal;
  }

  output[0] = cellIndex % cellsX;
  output[1] = Math.floor(cellIndex / cellsX);
  output[2] = slot;
}

function permuteIndex(index: number, count: number, seed: number): number {
  if (count <= 1) return 0;
  let step = (seed >>> 16) % count | 1;
  while (greatestCommonDivisor(step, count) !== 1) step += 2;
  return ((seed % count) + index * step) % count;
}

function greatestCommonDivisor(left: number, right: number): number {
  while (right !== 0) {
    const remainder = left % right;
    left = right;
    right = remainder;
  }
  return left;
}

function writePopulationPosition(
  token: PopulationTokenV1,
  count: number,
  cellX: number,
  cellZ: number,
  slot: number,
  stageOrigin: readonly [number, number, number],
  layoutSeed: number,
  output: Float32Array,
  offset: number
): void {
  if (count === 1) {
    output[offset] = stageOrigin[0];
    output[offset + 1] = stageOrigin[1];
    output[offset + 2] = stageOrigin[2];
    return;
  }
  const [cellsX, cellsZ] = token.population.extentCells;
  const cellMeters = token.population.cellSizeMicrometers / 1_000_000;
  const stratifiedJitter = token.population.layoutAlgorithm === "stratified-jitter-v1";
  const jitter = cellMeters * (stratifiedJitter ? 0.96 : 0.3);
  const slotSpread = stratifiedJitter ? 0 : Math.min(cellMeters * 0.42, Math.sqrt(slot) * cellMeters * 0.06);
  const angle = randomUnit(layoutSeed, 0) * Math.PI * 2;
  const x = (cellX - (cellsX - 1) * 0.5) * cellMeters;
  const z = (cellZ - (cellsZ - 1) * 0.5) * cellMeters;
  output[offset] = stageOrigin[0] + x + (randomUnit(layoutSeed, 1) - 0.5) * jitter + Math.cos(angle) * slotSpread;
  output[offset + 1] = stageOrigin[1];
  output[offset + 2] = stageOrigin[2] + z + (randomUnit(layoutSeed, 2) - 0.5) * jitter + Math.sin(angle) * slotSpread;
}

function randomUnit(seed: number, sequence: number): number {
  let value = (seed + Math.imul(sequence + 1, 0x6d2b79f5)) | 0;
  value = Math.imul(value ^ (value >>> 15), 1 | value);
  value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function uint32Unit(value: number): number {
  return value / 0xffffffff;
}

function requireIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer within ${minimum}..${maximum}`);
  }
}

function quantizedValues(values: Float32Array, offset: number, count: number): string {
  let output = "";
  for (let index = 0; index < count; index++) {
    if (index > 0) output += ",";
    output += Math.round(values[offset + index] * 100_000);
  }
  return output;
}
