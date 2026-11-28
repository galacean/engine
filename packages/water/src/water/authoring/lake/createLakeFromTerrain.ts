import { createLake, type LakeAuthoringOptions } from "./createLake";
import type { WaterTerrainSnapshot } from "../terrain/WaterTerrainSnapshot";
import { captureLakeTerrain, type LakeTerrainBounds } from "../../compiler/lake/LakeTerrainAdapter";
import { resolveLakeTerrainBoundary } from "../../compiler/lake/LakeTerrainBoundary";

export type LakeTerrainCoverage =
  | { readonly kind: "terrain-basin"; readonly waterLevel: number }
  | { readonly kind: "authored"; readonly boundary: LakeAuthoringOptions["boundary"] };

export interface LakeFromTerrainOptions
  extends Omit<LakeAuthoringOptions, "boundary" | "grid" | "bedHeights" | "bedTerrain"> {
  readonly terrain: WaterTerrainSnapshot;
  /** Explicit local domain. Grid aligned; defaults to the complete supplied snapshot. */
  readonly bounds?: LakeTerrainBounds;
  readonly coverage: LakeTerrainCoverage;
}

// Keep only the most recent domain per immutable source; descriptors receive their own buffers in createLake.
const terrainViews = new WeakMap<
  WaterTerrainSnapshot,
  { boundsKey: string; view: ReturnType<typeof captureLakeTerrain> }
>();

function readTerrainView(terrain: WaterTerrainSnapshot, bounds?: LakeTerrainBounds) {
  const cacheable =
    terrain &&
    Object.isFrozen(terrain) &&
    Object.isFrozen(terrain.origin) &&
    Object.isFrozen(terrain.heights) &&
    (!terrain.refinements ||
      (Object.isFrozen(terrain.refinements) &&
        terrain.refinements.every(
          (p) => Object.isFrozen(p) && Object.isFrozen(p.origin) && Object.isFrozen(p.heights)
        )));
  const boundsKey = JSON.stringify(bounds ?? null);
  const cached = cacheable ? terrainViews.get(terrain) : undefined;
  if (cached?.boundsKey === boundsKey) return cached.view;
  const view = captureLakeTerrain(terrain, bounds);
  if (cacheable) terrainViews.set(terrain, { boundsKey, view });
  return view;
}

/** Read-only authoring: never carves, fills dry vertices, or infers ownership across a connection. */
export function createLakeFromTerrain(options: LakeFromTerrainOptions) {
  const { terrain, bounds, coverage, ...lookAndCompile } = options;
  if (coverage.kind !== "terrain-basin" && coverage.kind !== "authored")
    throw new Error("Unknown Lake terrain coverage mode.");
  if (coverage.kind === "terrain-basin" && options.connections?.length)
    throw new Error("Connected Lakes require explicit authored coverage.");
  const captured = readTerrainView(terrain, bounds);
  const boundary =
    coverage.kind === "authored" ? coverage.boundary : resolveLakeTerrainBoundary(captured, coverage.waterLevel);
  return createLake({
    ...lookAndCompile,
    grid: captured.grid,
    bedHeights: captured.heights,
    bedTerrain: captured.bedTerrain,
    boundary
  });
}
