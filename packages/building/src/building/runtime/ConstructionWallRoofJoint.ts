import {
  expandedDimensions,
  normalizedProfile,
  roofHeight,
  type RoofFootprint,
  type RoofSurface
} from "./RecoveredRoofMath";

/** Physical roof section shared by every wall finish, independent of its unit,
 * arrangement, paint partition and LOD. The construction owner derives both
 * its wall contour and finish clipping from this section.
 * Full gables are extruded along the ridge, including the end-wall thickness.
 * Flat, hip and circular roofs retain their existing level wall termination. */
export interface ConstructionWallRoofJoint {
  axis: [number, number];
  center: number;
  bottom: number;
  top: number;
  base: number;
  heights: number[];
}

export function constructionWallRoofJoint(
  surface: RoofSurface,
  footprint: RoofFootprint
): ConstructionWallRoofJoint | undefined {
  if ("radius" in footprint || surface.height_parameter <= Math.fround(0.1) || surface.ridge_parameter !== 1) return;
  const [lower, upper] = expandedDimensions(surface, footprint);
  const transverse = surface.axis === 0 ? 1 : 0;
  const [c, s] = footprint.orientation;
  const axis: [number, number] = transverse === 1 ? [-s, c] : [c, s];
  const height = roofHeight(surface, footprint);
  return {
    axis,
    center: footprint.center[0] * axis[0] + footprint.center[1] * axis[1],
    bottom: lower[transverse] / 2,
    top: upper[transverse] / 2,
    base: surface.base_height,
    heights: normalizedProfile(surface.profile).points.map(([, y]) => surface.base_height + y * height)
  };
}

export function wallRoofJointHeight(joint: ConstructionWallRoofJoint, x: number, z: number): number {
  const distance = Math.abs(x * joint.axis[0] + z * joint.axis[1] - joint.center);
  const t = Math.min(1, Math.max(0, (joint.bottom - distance) / (joint.bottom - joint.top)));
  const p = t * (joint.heights.length - 1),
    i = Math.min(joint.heights.length - 2, Math.floor(p));
  return joint.heights[i] + (joint.heights[i + 1] - joint.heights[i]) * (p - i);
}
