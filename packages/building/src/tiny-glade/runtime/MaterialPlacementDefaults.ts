import { unitFootprintScale, type MaterialFootprint } from "./MaterialFootprint";
import type { MaterialUnit } from "./UnitPlacementStyle";
import type { BoundaryCourseArrangement, BoundaryPlacementUnit } from "./BoundaryPlacement";
/** Target-size adaptation belongs to the material specification, not to the
 * shape producer. The preset selects the recovered random-course rule; its placements can
 * be consumed by any unit family. Explicit upper rules override the preset
 * without moving the lower courses. Dimensions remain target specifications. */
export function boundaryUnitDefaults(
  material: MaterialUnit,
  footprint?: MaterialFootprint
): {
  unit: BoundaryPlacementUnit;
  rule: BoundaryCourseArrangement;
} {
  const scale = unitFootprintScale(footprint);
  return {
    unit: { material, width: 0.46 * scale.width, height: 0.46 * scale.height, depth: 0.56 * scale.depth },
    rule: { type: "random_courses" }
  };
}
