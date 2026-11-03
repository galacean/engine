import type { PublishedWallProfile } from "./PublishedWallProfile";

/** Ground plus the producer-owned opening cut. UV parameters stay on the
 * published wall chart, so material replacement cannot move an aperture. */
export function constructionWallLowerBoundary(profile: PublishedWallProfile) {
  const values = profile.points.map((p, i) => p[1] + Math.max(0, profile.third[i]));
  const at = (u: number) => {
    const [i, t] = profile.projected.coord(u);
    return values[i] * (1 - t) + values[i + 1] * t;
  };
  const maximum = (start: number, end: number) => {
    let max = Math.max(at(start), at(end));
    const [first] = profile.projected.coord(start),
      [last] = profile.projected.coord(end);
    for (let i = first + 1; i <= last; i++) max = Math.max(max, values[i]);
    return max;
  };
  const knots = profile.projected.knots.filter(
    (_, i) =>
      profile.third[i] > 0 ||
      (i > 0 && profile.third[i - 1] > 0) ||
      (i + 1 < profile.third.length && profile.third[i + 1] > 0)
  );
  return { at, maximum, knots };
}
