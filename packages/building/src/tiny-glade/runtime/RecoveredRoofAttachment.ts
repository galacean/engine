import type { WallConnectionShape } from "./WallConnectionTypes";
import { supportShapeFrame } from "./ConstructionSupportFrame";

/** CachedDecoratorTransforms roof attachment direction. Rectangle edge choice
 * uses normalized absolute coordinates, NOT Euclidean edge distance; ties use
 * Z and zero chooses the negative side. Circles use world +X within .01m of
 * their centre. Model +Z faces outward. See roof-decorations-provenance.json. */
export function recoveredRoofAttachmentForward(shape: WallConnectionShape, x: number, z: number): [number, number] {
  const { c, s, width, depth } = supportShapeFrame(shape);
  if (shape.type === "circle") {
    const dx = c * x - s * z,
      dz = s * x + c * z,
      length = Math.hypot(dx, dz);
    return length < Math.fround(0.01) ? [1, 0] : [dx / length, dz / length];
  }
  const nx = Math.abs(x / width) > Math.abs(z / depth) ? (x > 0 ? 1 : -1) : 0;
  const nz = nx === 0 ? (z > 0 ? 1 : -1) : 0;
  return [c * nx - s * nz, s * nx + c * nz];
}
