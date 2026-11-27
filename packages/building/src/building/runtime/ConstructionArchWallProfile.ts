import { RoofCurve, f32, add, sub, mul } from "./RecoveredRoofMath";
import type { PublishedWallProfile } from "./PublishedWallProfile";
import type { resolveConstructionArchRange } from "./ConstructionArchRange";

/** Explicit-opening host adapter, not the native path raster sampler. Native
 * sample_wall_path_intersections rebuilds its contour at path crossings before
 * construct_arches writes sample indices (ev_e620eeff992f229d44b80f2ccab5c0726908f28c0ce2e7d4e96038cdc2a77bc3).
 * Our endpoint samples must likewise belong to the contour being cut. Retaining
 * the coarse outside indices spreads the cut beyond its supporting pillars.
 * The transition back to intact wall fits under the narrowest original shaft
 * half width: (.42-.05)/2. No zero-length edges or scale-dependent epsilon. */
export function refineConstructionArchWall(
  source: PublishedWallProfile,
  range: ReturnType<typeof resolveConstructionArchRange>,
  supportHalfWidth = (0.42 - 0.05) / 2
) {
  if (!(supportHalfWidth > 0) || !Number.isFinite(f32(supportHalfWidth)))
    throw RangeError("Finite positive arch support half width required");
  const wrap = (u: number) => {
    const v = f32(u - Math.floor(u));
    return v === 1 ? 0 : v;
  };
  const guard = supportHalfWidth / source.control.length;
  const parameters = [
    ...new Set([
      ...source.projected.knots,
      ...range.wallParameters,
      wrap(range.startU - guard),
      wrap(range.endU + guard)
    ])
  ].sort((a, b) => a - b);
  const interpolate = (values: readonly number[], u: number) => {
    const [i, t] = source.projected.coord(u);
    return add(values[i], mul(t, sub(values[i + 1], values[i])));
  };
  const points = parameters.map((u) => {
    const at = range.wallParameters.indexOf(u);
    if (at !== -1) return [...range.points[at]] as [number, number, number];
    const [i, t] = source.projected.coord(u);
    return source.points[i].map((v, j) => add(v, mul(t, sub(source.points[i + 1][j], v)))) as [number, number, number];
  });
  // Preserve the exact duplicate at the closed contour seam.
  points[points.length - 1] = [...points[0]];
  const projected = new RoofCurve(points.map((p) => [p[0], p[2]]));
  for (let i = 1; i < projected.knots.length; i++)
    if (!(projected.knots[i] > projected.knots[i - 1]))
      throw RangeError("Arch endpoint refinement exceeds wall coordinate resolution");
  const profile: PublishedWallProfile = {
    ...source,
    points,
    projected,
    ground: new RoofCurve(points),
    bottom: parameters.map((u) => interpolate(source.bottom, u)),
    top: parameters.map((u) => interpolate(source.top, u)),
    third: parameters.map((u) => interpolate(source.third, u))
  };
  const indices = range.wallParameters.map((u) => parameters.indexOf(u === 1 ? 0 : u));
  return {
    profile,
    range: {
      ...range,
      indices,
      points: indices.map((i) => [...points[i]] as [number, number, number]),
      wallParameters: indices.map((i) => projected.knots[i]),
      wallTop: indices.map((i) => profile.top[i])
    }
  };
}
