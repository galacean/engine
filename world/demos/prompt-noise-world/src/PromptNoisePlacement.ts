import { hashPromptNoise, promptNoiseUnit } from "@galacean/engine-world-planning/generation/noise/PromptNoiseHash";
import { TerrainAnalyticFieldProvider } from "./PromptNoiseField.ts";
import type { DecorationRuleV1, PromptNoiseWorldPlanV1 } from "./PromptNoiseWorldContract.ts";

/** Fixed logical chunk edge used only for runtime ownership and cache diagnostics. */
export const PROMPT_NOISE_CHUNK_SIZE = 128;

/** One exact ephemeral placement generated from an infinite world cell. */
export interface PromptNoisePlacement {
  readonly id: string;
  readonly kind: DecorationRuleV1["kind"];
  readonly chunk: readonly [x: number, z: number];
  readonly position: readonly [x: number, y: number, z: number];
  readonly rotationYRadians: number;
  readonly scale: readonly [x: number, y: number, z: number];
  readonly footprint: number;
}

/** Deterministic active-window placement result and rejection evidence. */
export interface PromptNoisePlacementWindow {
  readonly placements: readonly PromptNoisePlacement[];
  readonly rejected: Readonly<Record<string, number>>;
  readonly layoutHash: string;
  readonly transientBytes: number;
  readonly violationCount: number;
  readonly violationSamples: readonly string[];
}

/** Independent spatial audit result produced after candidate filtering. */
export interface PromptNoisePlacementValidation {
  readonly violationCount: number;
  readonly samples: readonly string[];
}

interface OccupiedCandidate {
  readonly x: number;
  readonly z: number;
  readonly footprint: number;
}

const CATEGORY_ORDER = Object.freeze(["rock", "tree", "shrub", "flower", "grass"] as const);

/**
 * Generates an exact active decoration window with global-cell ownership and halo-aware collisions.
 * @param plan Immutable prompt-noise plan.
 * @param field Shared terrain, water, biome, and surface authority.
 * @param centerChunk Logical center Chunk coordinate.
 * @param radius Number of owned Chunks retained around the center.
 * @returns Stable placements, rejection reasons, hash, and transient byte estimate.
 */
export function generatePromptNoisePlacementWindow(
  plan: PromptNoiseWorldPlanV1,
  field: TerrainAnalyticFieldProvider,
  centerChunk: readonly [x: number, z: number],
  radius: number
): PromptNoisePlacementWindow {
  if (!Number.isInteger(radius) || radius < 0) throw new RangeError("Decoration window radius must be a non-negative integer");
  const minimumChunkX = centerChunk[0] - radius;
  const maximumChunkX = centerChunk[0] + radius;
  const minimumChunkZ = centerChunk[1] - radius;
  const maximumChunkZ = centerChunk[1] + radius;
  const maximumFootprint = plan.decoration.reduce((maximum, rule) => Math.max(maximum, rule.footprint), 0);
  const maximumSpacing = plan.decoration.reduce((maximum, rule) => Math.max(maximum, rule.spacing), 0);
  const halo = maximumFootprint * 2 + maximumSpacing;
  const bounds = {
    minimumX: minimumChunkX * PROMPT_NOISE_CHUNK_SIZE - halo,
    maximumX: (maximumChunkX + 1) * PROMPT_NOISE_CHUNK_SIZE + halo,
    minimumZ: minimumChunkZ * PROMPT_NOISE_CHUNK_SIZE - halo,
    maximumZ: (maximumChunkZ + 1) * PROMPT_NOISE_CHUNK_SIZE + halo
  };
  const placements: PromptNoisePlacement[] = [];
  const occupied = new PlacementSpatialIndex(Math.max(1, maximumFootprint * 2), maximumFootprint);
  const rejected: Record<string, number> = Object.create(null) as Record<string, number>;
  const rulesByKind = new Map(plan.decoration.map((rule) => [rule.kind, rule] as const));
  for (const kind of CATEGORY_ORDER) {
    const rule = rulesByKind.get(kind);
    if (!rule) continue;
    const minimumCellX = Math.floor(bounds.minimumX / rule.spacing);
    const maximumCellX = Math.floor(bounds.maximumX / rule.spacing);
    const minimumCellZ = Math.floor(bounds.minimumZ / rule.spacing);
    const maximumCellZ = Math.floor(bounds.maximumZ / rule.spacing);
    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ++) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX++) {
        const cellHash = hashPromptNoise(rule.seed, cellX, cellZ);
        if (promptNoiseUnit(hashPromptNoise(cellHash, 1)) > rule.probability) continue;
        const x = (cellX + 0.12 + promptNoiseUnit(hashPromptNoise(cellHash, 2)) * 0.76) * rule.spacing;
        const z = (cellZ + 0.12 + promptNoiseUnit(hashPromptNoise(cellHash, 3)) * 0.76) * rule.spacing;
        const ownerChunkX = Math.floor(x / PROMPT_NOISE_CHUNK_SIZE);
        const ownerChunkZ = Math.floor(z / PROMPT_NOISE_CHUNK_SIZE);
        const spawnDeltaX = x - plan.spawnHint[0];
        const spawnDeltaZ = z - plan.spawnHint[1];
        if (spawnDeltaX * spawnDeltaX + spawnDeltaZ * spawnDeltaZ < plan.spawnClearanceRadius ** 2) {
          increment(rejected, "spawn-clearance");
          continue;
        }
        const sample = field.sample(x, z);
        if (sample.water || sample.shoreSignedDistance > -rule.minimumShoreDistance) {
          increment(rejected, "water-or-shore");
          continue;
        }
        if (sample.slope > rule.maximumSlope) {
          increment(rejected, "slope");
          continue;
        }
        const grassWeight = sample.surfaceWeights[1];
        if ((kind === "tree" || kind === "shrub" || kind === "flower" || kind === "grass") && grassWeight < 0.18) {
          increment(rejected, "surface");
          continue;
        }
        if (occupied.overlaps(x, z, rule.footprint)) {
          increment(rejected, "footprint");
          continue;
        }
        occupied.add({ x, z, footprint: rule.footprint });
        if (
          ownerChunkX < minimumChunkX ||
          ownerChunkX > maximumChunkX ||
          ownerChunkZ < minimumChunkZ ||
          ownerChunkZ > maximumChunkZ
        ) {
          continue;
        }
        const scale = rule.minimumScale +
          promptNoiseUnit(hashPromptNoise(cellHash, 4)) * (rule.maximumScale - rule.minimumScale);
        const stretch = 0.86 + promptNoiseUnit(hashPromptNoise(cellHash, 5)) * 0.28;
        placements.push(Object.freeze({
          id: `${kind}:${cellX}:${cellZ}`,
          kind,
          chunk: Object.freeze([ownerChunkX, ownerChunkZ] as const),
          position: Object.freeze([x, sample.height, z] as const),
          rotationYRadians: promptNoiseUnit(hashPromptNoise(cellHash, 6)) * Math.PI * 2,
          scale: Object.freeze([scale * stretch, scale, scale / stretch] as const),
          footprint: rule.footprint
        }));
      }
    }
  }
  placements.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  const validation = validatePromptNoisePlacements(plan, field, placements);
  return Object.freeze({
    placements: Object.freeze(placements),
    rejected: Object.freeze({ ...rejected }),
    layoutHash: hashPlacements(placements),
    transientBytes: placements.length * 7 * Float32Array.BYTES_PER_ELEMENT,
    violationCount: validation.violationCount,
    violationSamples: validation.samples
  });
}

/**
 * Audits materialized candidates independently from the placement filter.
 * @param plan Immutable prompt-noise plan containing category constraints.
 * @param field Shared terrain, water, and surface authority.
 * @param placements Candidate set to audit.
 * @returns Total violations and at most 32 deterministic evidence strings.
 */
export function validatePromptNoisePlacements(
  plan: PromptNoiseWorldPlanV1,
  field: TerrainAnalyticFieldProvider,
  placements: readonly PromptNoisePlacement[]
): PromptNoisePlacementValidation {
  const maximumFootprint = placements.reduce((maximum, placement) => Math.max(maximum, placement.footprint), 0);
  const occupied = new PlacementSpatialIndex(Math.max(1, maximumFootprint * 2), maximumFootprint);
  const rules = new Map(plan.decoration.map((rule) => [rule.kind, rule] as const));
  const ids = new Set<string>();
  const samples: string[] = [];
  let violationCount = 0;
  const record = (message: string): void => {
    violationCount++;
    if (samples.length < 32) samples.push(message);
  };
  for (const placement of placements) {
    const rule = rules.get(placement.kind);
    if (!rule) {
      record(`${placement.id}:missing-rule`);
      continue;
    }
    if (ids.has(placement.id)) record(`${placement.id}:duplicate-id`);
    ids.add(placement.id);
    const [x, y, z] = placement.position;
    const sample = field.sample(x, z);
    if (sample.water || sample.shoreSignedDistance > -rule.minimumShoreDistance) {
      record(`${placement.id}:water-or-shore`);
    }
    if (Math.abs(sample.height - y) > 0.001) record(`${placement.id}:suspended`);
    if (sample.slope > rule.maximumSlope) record(`${placement.id}:slope`);
    if (
      placement.kind !== "rock" &&
      sample.surfaceWeights[1] < 0.18
    ) {
      record(`${placement.id}:surface`);
    }
    const spawnDistance = Math.hypot(x - plan.spawnHint[0], z - plan.spawnHint[1]);
    if (spawnDistance < plan.spawnClearanceRadius) record(`${placement.id}:spawn-clearance`);
    if (occupied.overlaps(x, z, placement.footprint)) record(`${placement.id}:footprint`);
    occupied.add({ x, z, footprint: placement.footprint });
  }
  return Object.freeze({ violationCount, samples: Object.freeze(samples) });
}

class PlacementSpatialIndex {
  private readonly _buckets = new Map<string, OccupiedCandidate[]>();

  constructor(private readonly _bucketSize: number, private readonly _maximumFootprint: number) {}

  add(candidate: OccupiedCandidate): void {
    const key = this._key(candidate.x, candidate.z);
    const bucket = this._buckets.get(key);
    if (bucket) bucket.push(candidate);
    else this._buckets.set(key, [candidate]);
  }

  overlaps(x: number, z: number, footprint: number): boolean {
    const centerX = Math.floor(x / this._bucketSize);
    const centerZ = Math.floor(z / this._bucketSize);
    const bucketRadius = Math.ceil((footprint + this._maximumFootprint) / this._bucketSize);
    for (let offsetZ = -bucketRadius; offsetZ <= bucketRadius; offsetZ++) {
      for (let offsetX = -bucketRadius; offsetX <= bucketRadius; offsetX++) {
        const bucket = this._buckets.get(`${centerX + offsetX}:${centerZ + offsetZ}`);
        if (!bucket) continue;
        for (const candidate of bucket) {
          const requiredDistance = candidate.footprint + footprint;
          const deltaX = x - candidate.x;
          const deltaZ = z - candidate.z;
          if (deltaX * deltaX + deltaZ * deltaZ < requiredDistance * requiredDistance) return true;
        }
      }
    }
    return false;
  }

  private _key(x: number, z: number): string {
    return `${Math.floor(x / this._bucketSize)}:${Math.floor(z / this._bucketSize)}`;
  }
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function hashPlacements(placements: readonly PromptNoisePlacement[]): string {
  let hash = 0x811c9dc5;
  for (const placement of placements) {
    for (const character of `${placement.id}:${placement.position.map((value) => value.toFixed(4)).join(",")}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, "0");
}
