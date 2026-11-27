import { hashSeed } from "@galacean/engine-terrain/rock-formation/math";
import type { V3 } from "@galacean/engine-terrain/rock-formation/types";
import type { IslandPlan } from "../semantic-study/IslandPlanModel.ts";
import { worldTemplate } from "./WorldTemplateCatalog.ts";
import catalog from "../integrations/terrain/rock-formation/RockVariantCatalog.json";

export interface RockVariantEntry {
  id: string;
  mesh: string;
  hasDetachedPieces?: boolean;
  /** Fraction of the fitted mesh height to sink below the placement base. */
  groundInset: number;
  /** Authored local mesh AABB `[min, max]` matching the decoded GLB positions. */
  bounds?: readonly [V3, V3];
}

export interface RockVariantPools {
  mountains: readonly RockVariantEntry[];
  stones: readonly RockVariantEntry[];
}

export const rockObbId = (owner: string, box: string) => `${owner}:obb:${box}`;

function readCatalogBounds(id: string, raw?: readonly (readonly number[])[]): readonly [V3, V3] | undefined {
  if (!raw) return undefined;
  if (raw.length !== 2 || raw[0].length !== 3 || raw[1].length !== 3) {
    throw Error(`Invalid rock catalog bounds: ${id}`);
  }
  const min: V3 = [raw[0][0], raw[0][1], raw[0][2]];
  const max: V3 = [raw[1][0], raw[1][1], raw[1][2]];
  if (max.some((value, axis) => !Number.isFinite(value - min[axis]) || value <= min[axis])) {
    throw Error(`Invalid rock catalog bounds: ${id}`);
  }
  return [min, max];
}

function readCatalogEntries(
  entries: readonly {
    id: string;
    mesh: string;
    hasDetachedPieces?: boolean;
    groundInset: number;
    bounds?: readonly (readonly number[])[];
  }[]
): readonly RockVariantEntry[] {
  return entries.map((entry) => ({
    ...entry,
    bounds: readCatalogBounds(entry.id, entry.bounds)
  }));
}

const variantPools: Readonly<Record<keyof typeof catalog.pools, RockVariantPools>> = {
  shared: {
    mountains: readCatalogEntries(catalog.pools.shared.mountains),
    stones: readCatalogEntries(catalog.pools.shared.stones)
  }
};

const MAX_VARIANTS = 10;

function rankedPool(seed: number, role: string, entries: readonly RockVariantEntry[]) {
  const unique = [...new Map(entries.map((entry) => [entry.id, entry])).values()];
  return unique.sort(
    (a, b) =>
      hashSeed(seed, `rock-pool:${role}:${a.id}`) - hashSeed(seed, `rock-pool:${role}:${b.id}`) ||
      a.id.localeCompare(b.id)
  );
}

/** Both placement systems draw from the same seed-specific palette. */
export function rockVariantPools(plan: Pick<IslandPlan, "parameters">): RockVariantPools | undefined {
  const seed = plan.parameters?.seed ?? 0;
  const template = worldTemplate(plan.parameters?.worldTemplate?.id);
  const rockSource = template?.rockSource ?? "shared";
  const stoneSource = template?.stoneSource ?? rockSource;
  if (rockSource === "authored" && stoneSource === "authored") return undefined;
  const mountains = rockSource === "authored" ? [] : rankedPool(seed, "mountains", variantPools[rockSource].mountains);
  const stones = stoneSource === "authored" ? [] : rankedPool(seed, "stones", variantPools[stoneSource].stones);
  const mountainCount = Math.min(mountains.length, Math.max(MAX_VARIANTS / 2, MAX_VARIANTS - stones.length));
  mountains.length = mountainCount;
  stones.length = Math.min(stones.length, MAX_VARIANTS - mountainCount);
  return { mountains, stones };
}

export function pickRockVariant<T>(pool: readonly T[], seed: number): T | undefined {
  return pool.length ? pool[hashSeed(seed, "rock-variant") % pool.length] : undefined;
}

export function isRockPillarDimensions(width: number, height: number, depth: number, surfaceGrass: boolean): boolean {
  return !surfaceGrass && height > Math.max(width, depth) * 1.5;
}

/**
 * Computes the fitted vertical height above the planned base for one rock guide using catalog bounds
 * and the exact same uniform-XZ / pillar fit rule as `rockVariantFit`.
 */
export function rockVariantFittedTopHeight(
  plan: Pick<IslandPlan, "parameters">,
  jobId: string,
  sizeX: number,
  sizeY: number,
  sizeZ: number,
  surfaceGrass: boolean,
  pools = rockVariantPools(plan)
): number | undefined {
  if (!pools) return undefined;
  const pool = surfaceGrass ? pools.mountains : pools.stones;
  if (!pool.length) return undefined;
  const seed = hashSeed(plan.parameters?.seed ?? 0, jobId);
  const isPillar = isRockPillarDimensions(sizeX, sizeY, sizeZ, surfaceGrass);
  let selected = pickRockVariant(pool, seed);
  if (selected?.hasDetachedPieces && isPillar) {
    const singlePieceStones = pool.filter((entry) => !entry.hasDetachedPieces);
    selected = pickRockVariant(singlePieceStones, seed);
  }
  const bounds = selected?.bounds;
  if (!selected || !bounds) return undefined;
  const spanX = bounds[1][0] - bounds[0][0];
  const spanY = bounds[1][1] - bounds[0][1];
  const spanZ = bounds[1][2] - bounds[0][2];
  if (!(spanX > 0 && spanY > 0 && spanZ > 0)) return undefined;
  const yScale = isPillar ? sizeY / spanY : Math.min(sizeX / spanX, sizeZ / spanZ);
  return spanY * yScale * (1 - selected.groundInset);
}

/**
 * Computes fitted vertical top heights above the planned base for all colliding shared-variant rocks
 * in `plan`, allowing animal obstacle indexing to match protruding uniform-XZ rock tops without
 * decoding GLBs or allocating extra OBBs.
 */
export function rockFormationFittedHeights(
  plan: IslandPlan
): { rockBoxes: ReadonlyMap<string, number>; landscapes: ReadonlyMap<string, number> } | undefined {
  const pools = rockVariantPools(plan);
  if (!pools) return undefined;
  const rockBoxes = new Map<string, number>();
  for (const rock of plan.rocks ?? []) {
    if (rock.assetId) continue;
    const boxes = rock.boxes ?? [
      { id: rock.id, sizeX: rock.width, sizeY: rock.height, sizeZ: rock.depth, collision: true }
    ];
    for (const box of boxes) {
      if (!box.collision) continue;
      const fitted = rockVariantFittedTopHeight(
        plan,
        rockObbId(rock.id, box.id),
        box.sizeX,
        box.sizeY,
        box.sizeZ,
        true,
        pools
      );
      if (fitted !== undefined) {
        const previous = rockBoxes.get(box.id);
        rockBoxes.set(box.id, previous === undefined ? fitted : Math.max(previous, fitted));
      }
    }
  }
  const landscapes = new Map<string, number>();
  for (const item of plan.landscapes ?? []) {
    if (item.kind !== "rock" || item.assetId || item.collision === false) continue;
    const fitted = rockVariantFittedTopHeight(plan, item.id, item.width, item.height, item.depth, false, pools);
    if (fitted !== undefined) {
      const previous = landscapes.get(item.id);
      landscapes.set(item.id, previous === undefined ? fitted : Math.max(previous, fitted));
    }
  }
  return { rockBoxes, landscapes };
}
