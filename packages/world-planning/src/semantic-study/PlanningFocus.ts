import type { PlanPoint } from "./IslandPlanModel";
export interface FocusBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}
/** Expand a planar selection symmetrically, including point-sized selections.
 * @param points Published outline or anchor positions.
 * @param minimumSpan Minimum visible span in metres.
 * @param padding Multiplicative space around the outline.
 * @returns A nonzero viewport centred on the selection, or undefined for an empty selection.
 */
export function planningFocusBox(points: PlanPoint[], minimumSpan = 32, padding = 1.3) {
  if (!points.length) return;
  const x0 = Math.min(...points.map((p) => p.x)),
    x1 = Math.max(...points.map((p) => p.x));
  const z0 = Math.min(...points.map((p) => p.z)),
    z1 = Math.max(...points.map((p) => p.z));
  const width = Math.max(minimumSpan, (x1 - x0) * padding),
    depth = Math.max(minimumSpan, (z1 - z0) * padding);
  return { x: (x0 + x1 - width) / 2, z: (z0 + z1 - depth) / 2, width, depth };
}
/** Fit a world-space volume at 45 degrees using the preview's aspect ratio.
 * @param bounds Actual rendered bounds, including altitude and object height.
 * @param aspect Preview width divided by height.
 * @param fieldOfView Vertical camera field of view in degrees.
 * @returns A camera pose whose target is the volume centre and whose frustum contains all corners.
 */
export function planningFocusPose(bounds: FocusBounds, aspect: number, fieldOfView: number) {
  const target = {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2
  };
  const verticalTan = Math.tan((fieldOfView * Math.PI) / 360),
    horizontalTan = verticalTan * Math.max(0.01, aspect);
  let distance = 60 / (2 * Math.min(verticalTan, horizontalTan));
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const up = (y - target.y - (z - target.z)) * Math.SQRT1_2;
        const towardEye = (y - target.y + (z - target.z)) * Math.SQRT1_2;
        distance = Math.max(
          distance,
          towardEye + Math.max(Math.abs(x - target.x) / horizontalTan, Math.abs(up) / verticalTan) * 1.3 + 2
        );
      }
  return {
    target,
    position: { x: target.x, y: target.y + distance * Math.SQRT1_2, z: target.z + distance * Math.SQRT1_2 }
  };
}
