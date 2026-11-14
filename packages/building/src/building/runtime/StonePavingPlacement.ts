import type { UnitPlacementBinding as MasonryBinding } from "./UnitPlacement";
import { unitFootprintScale } from "./MaterialFootprint";
/** A baked irregular placement field is the native stone-floor rule's compact
 * representation. It uses a metric surface chart, independently of its shape.
 * It is not an additional rectangular grid inside each stone. Explicit row
 * rules still generate individual units through SurfacePlacement. */
export interface StonePavingPlacement {
  uvTransform: [number, number, number, number];
  color: number;
}
export function stonePavingPlacement(
  binding: MasonryBinding,
  width: number,
  depth: number,
  color: number
): StonePavingPlacement {
  const scale = unitFootprintScale(binding.footprint);
  return {
    uvTransform: [0.2 / scale.width, -0.2 / scale.height, (-0.1 * width) / scale.width, (0.1 * depth) / scale.height],
    color
  };
}
