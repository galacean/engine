import type { PlanPoint } from "../../semantic-study/IslandPlanModel";

/** Prepare deterministic ownership and metric boundary blending for convex power cells.
 * @param sites Fixed region anchors and optional squared-metre power offsets; no content dimensions are read.
 * @returns Region indices, actual anchor distances and normalized blend weights, ordered owner first.
 */
export function createRegionOwnership(sites: readonly { id: string; center: PlanPoint; weightM2?: number }[]) {
  const scores = new Float64Array(sites.length);
  const squaredDistances = new Float64Array(sites.length);
  const inverseDistances = sites.map((a) =>
    sites.map((b) => 1 / (2 * Math.max(1e-9, Math.hypot(a.center.x - b.center.x, a.center.z - b.center.z))))
  );
  return (point: PlanPoint, blendM = 0): { index: number; distance: number; weight: number }[] => {
    if (!sites.length) return [];
    let owner = 0;
    for (let i = 0; i < sites.length; i++) {
      const dx = sites[i].center.x - point.x,
        dz = sites[i].center.z - point.z;
      squaredDistances[i] = dx * dx + dz * dz;
      scores[i] = squaredDistances[i] - (sites[i].weightM2 ?? 0);
      if (scores[i] < scores[owner] || (scores[i] === scores[owner] && sites[i].id.localeCompare(sites[owner].id) < 0))
        owner = i;
    }
    if (blendM <= 0) return [{ index: owner, distance: Math.sqrt(squaredDistances[owner]), weight: 1 }];
    const candidates: { index: number; distance: number; weight: number; gap: number }[] = [];
    let sum = 0;
    for (let i = 0; i < sites.length; i++) {
      // A score difference divided by twice the anchor separation is distance to the shared bisector.
      let gap = i === owner ? 0 : (scores[i] - scores[owner]) * inverseDistances[owner][i];
      if (gap >= blendM) continue;
      // Use the same half-plane violations on both sides of a boundary. Measuring
      // only against the current owner makes a third region's weight jump there.
      if (i !== owner)
        for (let j = 0; j < sites.length; j++)
          if (i !== j) gap = Math.max(gap, (scores[i] - scores[j]) * inverseDistances[i][j]);
      if (gap >= blendM) continue;
      const t = 1 - gap / blendM,
        weight = t * t;
      sum += weight;
      candidates.push({ index: i, distance: Math.sqrt(squaredDistances[i]), weight, gap });
    }
    candidates.sort((a, b) => a.gap - b.gap || sites[a.index].id.localeCompare(sites[b.index].id));
    return candidates.map(({ index, distance, weight }) => ({ index, distance, weight: weight / sum }));
  };
}
