import { add, sub, mul, f32 } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";

/** Host authoring adapter for a ground-open arch interval. Native segmentation
 * chooses ranges from path intersections; our API chooses centre U and width.
 * Keep the published sample identities for native third-field writeback, while
 * resampling only the two endpoints, as calculate_wall_path_segments_impl does.
 * This resolves an interval, not arch height, occupancy, or a complete opening.
 */
export function resolveConstructionArchRange(profile: PublishedWallProfile, centerU: number, width: number) {
  const curve = profile.projected;
  const count = profile.points.length - 1;
  if (
    !Number.isFinite(centerU) ||
    centerU < 0 ||
    centerU > 1 ||
    !Number.isFinite(width) ||
    !(width > 0 && width < profile.control.length) ||
    count < 2 ||
    profile.top.length !== count + 1 ||
    profile.third.length !== count + 1 ||
    curve.points.length !== count + 1
  )
    throw RangeError("Invalid closed-wall arch interval");
  const wrap = (u: number) => u - Math.floor(u);
  const span = width / profile.control.length;
  const start = wrap(centerU - span / 2);
  const end = start + span;
  // Resolve the loop in the SAME float32 chart as coord(). A double start just
  // below 1 can round to 1; retaining the double wrap decision would then walk
  // a different sample interval from the endpoint coordinates.
  const startU = f32(start) === 1 ? 0 : f32(start);
  const endU = f32(end <= 1 ? end : end - 1);
  if (startU === endU) throw RangeError("Arch interval exceeds wall coordinate resolution");
  const [first, firstT] = curve.coord(startU);
  const [last, lastT] = curve.coord(endU);
  // An exact endpoint knot belongs to that sample, not its following segment.
  const endIndex = last + (lastT > 0 ? 1 : 0) + (endU < startU ? count : 0);
  // A range that repeats a slot would write two different endpoint heights to
  // one wall sample. Such a request needs contour refinement before writeback.
  if (endIndex <= first || endIndex - first >= count)
    throw RangeError("Arch interval exceeds wall coordinate resolution");
  const indices: number[] = [];
  const points: [number, number, number][] = [];
  const wallParameters: number[] = [];
  const wallTop: number[] = [];
  for (let i = first; i <= endIndex; i++) {
    const index = i % count;
    indices.push(index);
    points.push([...profile.points[index]]);
    wallParameters.push(curve.knots[index]);
    wallTop.push(profile.top[index]);
  }
  const endpoint = (index: number, t: number): [number, number, number] =>
    profile.points[index].map((v, axis) => add(v, mul(t, sub(profile.points[index + 1][axis], v)))) as [
      number,
      number,
      number
    ];
  points[0] = endpoint(first, firstT);
  points[points.length - 1] = endpoint(last, lastT);
  wallParameters[0] = startU;
  wallParameters[wallParameters.length - 1] = endU;
  return { indices, points, wallParameters, wallTop, startU, endU };
}
