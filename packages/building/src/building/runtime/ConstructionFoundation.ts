import { type ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import type { WallConnectionShape } from "./WallConnectionTypes";
import { samplePublishedWallPath, type TerrainHeight } from "./PublishedWallProfile.ts";
import type { MaterialUnit } from "./UnitPlacementStyle";
import { type MaterialFootprint } from "./MaterialFootprint.ts";
/** Host adaptation of native elevation supports: the placement-center ground is
 * the reference, not the highest perimeter point. Zero means continuous contact,
 * even on negative terrain. Positive values raise the lower boundary; individual
 * terrain samples may still exceed it. This datum is independent of materials. */
export function resolveConstructionFoundation(input: {
  shape: WallConnectionShape;
  height: number;
  terrain: TerrainHeight;
  hostTerrain?: boolean;
}) {
  if (!Number.isFinite(input.height) || input.height < 0) throw Error("Nonnegative foundation height required");
  const profile = samplePublishedWallPath(input.shape, input.terrain, 0, input.hostTerrain ?? true);
  let bottomY = Infinity,
    maxY = -Infinity;
  for (const p of profile.points) {
    bottomY = Math.min(bottomY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const referenceY = input.terrain(input.shape.center[0], input.shape.center[1]);
  if (!Number.isFinite(referenceY)) throw Error("Nonfinite building placement height");
  return { profile, topY: referenceY + input.height, bottomY, maxGround: maxY, referenceY };
}
export type ConstructionFoundationContact = ReturnType<typeof resolveConstructionFoundation>;
export interface ConstructionFoundationInput {
  wallEnvelope?: ConstructionWallEnvelope;
  id: string;
  variationKey?: string;
  shape: WallConnectionShape;
  height: number;
  terrain: TerrainHeight;
  material?: MaterialUnit;
  footprint?: MaterialFootprint;
  seed?: number;
  rule?: "grid" | "staggered_rows" | "horizontal_rows" | "parallel_rows" | "overlap_rows";
  mode?: "auto" | "pillars" | "solid";
  contact?: ConstructionFoundationContact;
  /** Published neighboring wall volumes; hidden supports must not pierce them. */
  neighbors?: readonly { shape: WallConnectionShape; bottomY: number; topY: number }[];
}
