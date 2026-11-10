import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { SemanticEdit } from "./WorldPlanningContract";
import type { ShapeRecipe } from "./ComposedShape";
import { growRegion, compileRegion, enrichRegion, fitRegionArea } from "./WorldShapeGrowth";
import { WorldPlanningWaterQuery } from "./WorldPlanningWaterQuery";
import { ringArea } from "./WorldPlanningGeometry";

/** Coastline ownership requires only world shape intent, not any content generation module. */
export interface WorldLandDomainContext {
  parameters: {
    seed: number;
    landSize: number;
    landAspect?: number;
    landOrientation?: number;
    contourDetail: number;
    offshoreCoverage?: number;
    islands: number;
  };
  edits: Record<string, SemanticEdit>;
  plan: IslandPlan;
  notes: string[];
  frame: { width: number; length: number; angle: number; center?: PlanPoint };
  random(key: string): number;
}
const mainlandCache = new Map<string, { recipe: ShapeRecipe; outline: PlanPoint[] }>();
const bounds = (ring: PlanPoint[]) => ({
  x0: Math.min(...ring.map((p) => p.x)),
  x1: Math.max(...ring.map((p) => p.x)),
  z0: Math.min(...ring.map((p) => p.z)),
  z1: Math.max(...ring.map((p) => p.z))
});

/** Find a connected rectangular sea reservation from actual occupied polygons. */
function availableSea(plan: IslandPlan): { center: PlanPoint; half: { x: number; z: number } } | undefined {
  const cell = 32,
    origin = 16,
    columns = Math.max(1, Math.floor((plan.parameters.width - origin * 2) / cell)),
    rows = Math.max(1, Math.floor((plan.parameters.depth - origin * 2) / cell)),
    heights = new Array<number>(columns).fill(0);
  let best = 0,
    result: ReturnType<typeof availableSea>;
  const occupied = [plan.land, ...plan.islands].map((r) => ({ r, b: bounds(r) })),
    query = new WorldPlanningWaterQuery();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = origin + col * cell,
        z = origin + row * cell,
        rect = [
          { x, z },
          { x: x + cell, z },
          { x: x + cell, z: z + cell },
          { x, z: z + cell }
        ];
      const blocked = occupied.some(({ r, b }) => {
        if (x + cell < b.x0 - 16 || x > b.x1 + 16 || z + cell < b.z0 - 16 || z > b.z1 + 16) return false;
        return query.overlap(rect, r) || rect.some((p) => query.boundaryDistance(p, r) < 16);
      });
      heights[col] = blocked ? 0 : heights[col] + 1;
    }
    const stack: number[] = [];
    for (let col = 0; col <= columns; col++) {
      while (stack.length && heights[stack[stack.length - 1]] > (col === columns ? 0 : heights[col])) {
        const at = stack.pop()!,
          height = heights[at],
          left = stack.length ? stack[stack.length - 1] + 1 : 0,
          width = col - left,
          usableWidth = Math.min(width, height * 1.6),
          usableHeight = Math.min(height, width * 1.6),
          area = usableWidth * usableHeight;
        if (area > best) {
          best = area;
          result = {
            center: { x: origin + (left + width / 2) * cell, z: origin + (row + 1 - height / 2) * cell },
            half: { x: (usableWidth * cell) / 2 - 4, z: (usableHeight * cell) / 2 - 4 }
          };
        }
      }
      stack.push(col);
    }
  }
  return result;
}
/** Generate the reusable land boundary without running content modules.
 * @param c World shape inputs and destination plan.
 */
export function planWorldDomain(c: WorldLandDomainContext): void {
  if (c.plan.parameters.landMode === "continuous") {
    const { width, depth } = c.plan.parameters;
    const center = { x: width / 2, z: depth / 2 };
    c.plan.land = [
      { x: 0, z: 0 },
      { x: width, z: 0 },
      { x: width, z: depth },
      { x: 0, z: depth }
    ];
    c.plan.islands = [];
    c.plan.shapeRecipes!.push({
      id: "land-main",
      label: "整图陆地",
      rounding: 0,
      blocks: [{ id: "land-main:bounds", ...center, width, length: depth, yaw: 0 }]
    });
    c.frame = { center, width: width * 0.43, length: depth * 0.43, angle: 0 };
    c.plan.spawn = { ...center };
    c.plan.planning?.modules.push({
      id: "land-main",
      kind: "land",
      outline: c.plan.land,
      dependencies: [],
      requested: { continuous: 1 },
      resolved: { coverage: 1 }
    });
    c.plan.planning?.requiredIds.push("land-main");
    return;
  }
  const q = c.parameters,
    orientation = q.landOrientation ?? c.random("orientation"),
    a = orientation * Math.PI * 2,
    requested = c.edits["land-main"]?.size ?? 1;
  const { width, depth } = c.plan.parameters,
    worldArea = width * depth,
    mainHalf = { x: width / 2 - 16, z: depth / 2 - 16 },
    mainCenter = { x: width / 2, z: depth / 2 };
  const detail = c.edits["land-main"]?.complexity ?? q.contourDetail,
    aspect = Math.pow(2.5, 2 * (q.landAspect ?? 0.5) - 1);
  const coverage = Math.max(0.08, q.landSize * requested);
  const signature = JSON.stringify([width, depth, q.seed, coverage, detail, aspect, orientation]);
  let main = mainlandCache.get(signature);
  if (!main) {
    let recipe = growRegion({
      id: "land-main",
      center: mainCenter,
      width: width * 0.78125 * Math.sqrt(aspect),
      length: (depth * 0.78125) / Math.sqrt(aspect),
      angle: a,
      count: 5 + Math.round(c.random("land-main-branches") * 4 + detail * 4),
      random: c.random,
      curvature: 0.8,
      centered: true
    });
    recipe = enrichRegion(recipe, detail, c.random);
    recipe = fitRegionArea(recipe, coverage * worldArea, mainCenter, mainHalf);
    recipe.label = "主岛";
    main = { recipe, outline: compileRegion(recipe) };
    mainlandCache.set(signature, structuredClone(main));
    if (mainlandCache.size > 8) mainlandCache.delete(mainlandCache.keys().next().value!);
  }
  const recipe = structuredClone(main.recipe);
  c.plan.land = structuredClone(main.outline);
  c.plan.shapeRecipes!.push(recipe);
  const landBounds = bounds(c.plan.land);
  c.frame = {
    center: mainCenter,
    width: (landBounds.x1 - landBounds.x0) * 0.43,
    length: (landBounds.z1 - landBounds.z0) * 0.43,
    angle: a
  };
  if (c.plan.planning) {
    c.plan.planning.modules.push({
      id: "land-main",
      kind: "land",
      outline: c.plan.land,
      dependencies: [],
      requested: {
        coverage: q.landSize,
        size: requested,
        complexity: detail,
        aspect: q.landAspect ?? 0.5,
        orientation
      },
      resolved: { coverage: ringArea(c.plan.land) / worldArea, components: recipe.blocks.length, aspect, orientation }
    });
    c.plan.planning.requiredIds.push("land-main");
  }
  if (ringArea(c.plan.land) < coverage * worldArea * 0.995)
    c.plan.planning?.adjustments.push({
      owners: ["land-main"],
      reason: "请求面积超过当前长宽、朝向和宽阔岛形的边界容量，保留岛形并报告实际面积",
      requested: coverage,
      resolved: ringArea(c.plan.land) / worldArea
    });
  c.plan.spawn = { ...mainCenter };
  const totalArea = (q.offshoreCoverage ?? 0.06) * worldArea,
    weights = Array.from({ length: q.islands }, (_, i) => 0.5 + c.random(`offshore-${i}-budget`) * 1.5),
    weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  for (let i = 0; i < q.islands && totalArea > 0; i++) {
    const id = `offshore-${i}`,
      local = c.edits[id]?.size ?? 1;
    const saved = c.edits[id]?.placement;
    const reservation = saved?.half ? { center: saved.origin, half: saved.half } : availableSea(c.plan);
    if (!reservation) {
      c.notes.push("离岛占地由剩余海域容量协调");
      break;
    }
    const { center: site, half } = reservation;
    let island = growRegion({
      id,
      center: site,
      width: half.x * 1.4,
      length: half.z * 1.4,
      angle: c.random(`${id}-orientation`) * Math.PI * 2,
      count: 7,
      random: c.random,
      centered: true
    });
    island = enrichRegion(island, c.edits[id]?.complexity ?? 1, c.random);
    // The empty rectangle supplies a safe seed, not the final island boundary.
    // Expand its shape into adjoining sea using actual polygon clearance.
    const waterQuery = new WorldPlanningWaterQuery(),
      occupied = [c.plan.land, ...c.plan.islands],
      worldHalf = { x: Math.min(site.x - 16, width - 16 - site.x), z: Math.min(site.z - 16, depth - 16 - site.z) };
    const clear = (candidate: ShapeRecipe) => {
      const ring = compileRegion(candidate);
      return occupied.every(
        (other) =>
          !waterQuery.overlap(ring, other) &&
          ring.every((a, j) => !waterQuery.segmentNear(a, ring[(j + 1) % ring.length], other, 16, true))
      );
    };
    let low = ringArea(compileRegion(fitRegionArea(island, Infinity, site, half))),
      high = ringArea(compileRegion(fitRegionArea(island, Infinity, site, worldHalf)));
    if (!clear(fitRegionArea(island, low, site, worldHalf))) low = 1;
    if (!clear(fitRegionArea(island, high, site, worldHalf)))
      for (let attempt = 0; attempt < 9; attempt++) {
        const target = (low + high) / 2;
        if (clear(fitRegionArea(island, target, site, worldHalf))) low = target;
        else high = target;
      }
    else low = high;
    const capacity = low,
      allocated = Math.min((totalArea * weights[i]) / weightSum, capacity);
    island = fitRegionArea(island, Math.min(allocated * local, capacity), site, worldHalf);
    island.label = `离岸岛 ${i + 1}`;
    const outline = compileRegion(island);
    if (allocated < (totalArea * weights[i]) / weightSum)
      c.notes.push(`离岸岛 ${i + 1} 占地按可用海域协调，实际 ${((ringArea(outline) / worldArea) * 100).toFixed(2)}%`);
    if (ringArea(outline) + 1 < ((totalArea * weights[i]) / weightSum) * local)
      c.plan.planning?.adjustments.push({
        owners: [id],
        reason: "离岛请求面积超过当前可用海域容量；保留实际可行面积",
        requested: ((totalArea * weights[i]) / weightSum) * local,
        resolved: ringArea(outline)
      });
    c.plan.shapeRecipes!.push(island);
    c.plan.islands.push(outline);
    c.plan.regions.push({ id, label: island.label, kind: "island", outline });
    if (c.plan.planning)
      c.plan.planning.modules.push({
        id,
        kind: "island",
        outline,
        dependencies: ["land-main"],
        requested: { coverage: q.offshoreCoverage ?? 0.06, size: local, complexity: c.edits[id]?.complexity ?? 1 },
        resolved: {
          originX: site.x,
          originZ: site.z,
          halfX: half.x,
          halfZ: half.z,
          area: ringArea(outline),
          coverage: ringArea(outline) / worldArea,
          capacity,
          allocated,
          components: island.blocks.length
        }
      });
  }
}
