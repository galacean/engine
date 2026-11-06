import { insetMaterialSpan } from "./ConstructionCell";
import { unitFootprintScale, type MaterialFootprint } from "./MaterialFootprint";
import type { MaterialUnit } from "./UnitPlacementStyle";
import type { SupportCell } from "./PlacementSupport";
export type SurfaceArrangement = "grid" | "staggered_rows" | "horizontal_rows" | "parallel_rows" | "overlap_rows";
/** Metric chart and differential frame supplied by the geometry owner. Shape
 * clipping is a geometry query; rows do not need to know square/circle/roof. */
export interface RowPlacementGeometry {
  id: string;
  width: number;
  depth: number;
  outward: number;
  topY: number;
  halfSpan(v0: number, v1: number): number;
  point(u: number, n: number, v: number): number[];
  tangent: readonly number[];
  bitangent: readonly number[];
  normal: readonly number[];
}
export function placeSurfaceUnits(input: {
  geometry: RowPlacementGeometry;
  unit: { material: MaterialUnit; footprint?: MaterialFootprint };
  rule: SurfaceArrangement;
  variationKey?: string;
}): SupportCell[] {
  const { geometry, rule } = input;
  const { id, width, depth, outward, topY, point } = geometry;
  const scale = unitFootprintScale(input.unit.footprint);
  if (
    !id ||
    ![width, depth].every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(topY) ||
    !Number.isFinite(outward) ||
    outward < 0
  )
    throw Error("Finite metric placement surface required");
  const deckWidth = width + 2 * outward,
    deckDepth = depth + 2 * outward;
  const cells: SupportCell[] = [];
  const pitchU = (rule === "parallel_rows" || rule === "horizontal_rows" ? 1.4 : 0.5) * scale.width,
    pitchV = (rule === "parallel_rows" ? 0.22 : rule === "horizontal_rows" ? 0.3944 : 0.4) * scale.height;
  const rows = Math.ceil(depth / pitchV),
    step = depth / rows;
  for (let row = -Math.ceil(outward / step); row < rows + Math.ceil(outward / step); row++) {
    const z0 = Math.max(-deckDepth / 2, -depth / 2 + row * step),
      z1 = Math.min(deckDepth / 2, -depth / 2 + (row + 1) * step + (rule === "overlap_rows" ? 0.06 * scale.height : 0));
    const half = geometry.halfSpan(z0, z1);
    const offset = rule === "staggered_rows" || rule === "overlap_rows" ? (row % 2) * 0.5 : 0;
    for (
      let col = -1 - Math.ceil(outward / pitchU);
      col <= Math.ceil(width / pitchU) + Math.ceil(outward / pitchU);
      col++
    ) {
      const x0 = Math.max(-half, -width / 2 + (col + offset) * pitchU),
        x1 = Math.min(half, -width / 2 + (col + offset + 1) * pitchU);
      if (x1 - x0 <= 0.015) continue;
      // The original Hole48 predicate clips units in the fragment shader.
      // Keeping the original cell avoids an AABB approximation for rotated
      // apertures and preserves its seed/UV phase through attachment edits.
      const key = `${id}/row-${row}/${col}`;
      cells.push({
        id: key,
        logical_id: key,
        ...(input.variationKey !== undefined
          ? {
              seed_id: `${input.variationKey}/row-${row}/${col}`,
              lod_seed_id: `${input.variationKey}/row-${row}/${col}`
            }
          : {}),
        surface_id: id,
        anchor_uv: [(x0 + x1 + width) / 2, (depth - z0 - z1) / 2],
        center: point((x0 + x1) / 2, topY - 0.04 * scale.depth, (z0 + z1) / 2),
        tangent: [...geometry.tangent],
        bitangent: [...geometry.bitangent],
        normal: [...geometry.normal],
        size: [insetMaterialSpan(x1 - x0, 0.01), insetMaterialSpan(z1 - z0, 0.01), 0.08 * scale.depth]
      });
    }
  }
  return cells;
}
