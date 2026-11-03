import {
  expandedDimensions,
  normalizedProfile,
  roofHeight,
  type RoofFootprint,
  type RoofSurface
} from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import { constructionWallOutlinePoint, type ConstructionWallEnvelope } from "./ConstructionWallEnvelope";
import type { WallConnectionShape } from "./WallConnectionTypes";
import { surfaceBoundary, type SurfaceBoundary } from "./SurfacePolygon";

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

/** One set of masks in the ORIGINAL wall chart. Adjacent strips reuse the same
 * endpoint coordinates; clipping/painting therefore cannot create erosion seams.
 * Split at roof-section knots, not at material-unit centers. */
export function wallRoofJointSupport(
  joint: ConstructionWallRoofJoint,
  profile: PublishedWallProfile,
  shape: WallConnectionShape,
  envelope: ConstructionWallEnvelope
): SurfaceBoundary[] {
  const masks: SurfaceBoundary[] = [];
  const knots = joint.heights.map(
    (_, i) => joint.bottom + ((joint.top - joint.bottom) * i) / (joint.heights.length - 1)
  );
  let u = 0;
  for (let edge = 1; edge < profile.points.length; edge++) {
    const a = profile.points[edge - 1],
      b = profile.points[edge];
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (!length) continue;
    const A = constructionWallOutlinePoint(shape, a, envelope.nominalOuter);
    const B = constructionWallOutlinePoint(shape, b, envelope.nominalOuter);
    const x = A[0] * joint.axis[0] + A[2] * joint.axis[1] - joint.center;
    const X = B[0] * joint.axis[0] + B[2] * joint.axis[1] - joint.center;
    const cuts = [0, 1];
    if (X !== x)
      for (const k of [...knots, ...knots.map((v) => -v)]) {
        const t = (k - x) / (X - x);
        if (t > 0 && t < 1) cuts.push(t);
      }
    cuts.sort((a, b) => a - b);
    const points = [...new Set(cuts)].map((t) => [
      u + length * t,
      wallRoofJointHeight(joint, A[0] + (B[0] - A[0]) * t, A[2] + (B[2] - A[2]) * t) - profile.minGround
    ]);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      masks.push(surfaceBoundary([[a[0], 0], [b[0], 0], b, a]));
    }
    u += length;
  }
  return masks;
}
