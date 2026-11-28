import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { ShapeEdits } from "./ComposedShape";
import { envelope, slopeBand } from "./IslandPlanAtoms";

/** Applies region size intent and moves its owned content through the same bounded transform.
 * @param plan Newly generated plan whose component size intents have been neutralized.
 * @param edits Requested region intent; never mutated by boundary resolution.
 * @returns The plan with resolved sizes, synchronized component sources and adjustment feedback.
 */
export function applySizeCoupling(plan: IslandPlan, edits: ShapeEdits): IslandPlan {
  plan.sizeAdjustments = [];
  // Children are sized before their containing land, so the parent carries the resolved composition.
  const order = [
    "source-lake",
    "tributary",
    "valley-river",
    ...(plan.shapeRecipes ?? []).filter((r) => r.id.startsWith("offshore-")).map((r) => r.id),
    "land-main"
  ];
  for (const id of order) {
    const requested = edits[id]?.semantic?.size ?? 1;
    if (requested === 1) continue;
    if (!Number.isFinite(requested) || requested <= 0) throw new Error("整体大小必须为正数");
    const recipe = plan.shapeRecipes?.find((r) => r.id === id);
    if (!recipe) continue;
    const main = id === "land-main",
      river = id === "valley-river",
      island = id.startsWith("offshore-"),
      index = Number(id.slice(9));
    const owns = (key: string) =>
      key === id || (main && !key.startsWith("offshore-")) || (river && ["source-lake", "tributary"].includes(key));
    const water = plan.waters.filter((w) => owns(w.id));
    const rocks = plan.rocks.filter((r) =>
      main ? !r.groupId.startsWith("island-rocks-") : island ? r.groupId === `island-rocks-${index}` : false
    );
    const mountains = main ? plan.mountains : [];
    const buildings = main ? plan.buildings : [];
    const regions = plan.regions.filter((r) => (main ? r.kind !== "island" : r.id === id));
    const recipes = plan.shapeRecipes!.filter((r) => owns(r.id));
    const points: PlanPoint[] = [
      ...water.flatMap((w) => w.outline),
      ...rocks.flatMap((r) => r.obb),
      ...buildings.flatMap((b) => b.outline),
      ...regions.flatMap((r) => r.outline),
      ...mountains.flatMap((g) => g.outlines?.flat() ?? g.outline)
    ];
    if (main) points.push(...plan.land);
    if (island) points.push(...plan.islands[index]);
    for (const r of recipes)
      for (const b of r.blocks) points.push(...envelope(b, b.width, b.length, (b.yaw * Math.PI) / 180));
    const minX = Math.min(...points.map((p) => p.x)),
      maxX = Math.max(...points.map((p) => p.x)),
      minZ = Math.min(...points.map((p) => p.z)),
      maxZ = Math.max(...points.map((p) => p.z));
    const width = maxX - minX,
      depth = maxZ - minZ,
      margin = 16,
      world = plan.parameters.width;
    const attachment =
      id === "source-lake"
        ? plan.waters.find((w) => w.id === "valley-river")?.centerline?.[0]
        : id === "tributary"
          ? plan.waters.find((w) => w.id === id)?.centerline?.at(-1)
          : river
            ? plan.waters.find((w) => w.id === id)?.centerline?.at(-1)
            : undefined;
    const pivot = attachment ?? { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
    const pinnedCapacity = attachment
      ? Math.min(
          ...[
            [pivot.x - minX, pivot.x - margin],
            [maxX - pivot.x, world - margin - pivot.x],
            [pivot.z - minZ, pivot.z - margin],
            [maxZ - pivot.z, world - margin - pivot.z]
          ]
            .filter(([extent]) => extent > 0)
            .map(([extent, room]) => room / extent)
        )
      : Infinity;
    const capacity = Math.min((world - margin * 2) / width, (world - margin * 2) / depth, pinnedCapacity);
    // A soft shoulder avoids an abrupt stop as the fixed world fills up; input remains intent.
    const shoulder = capacity > 1 ? 1 + (capacity - 1) * 0.6 : capacity;
    const applied =
      requested <= shoulder
        ? requested
        : capacity > shoulder
          ? shoulder + (capacity - shoulder) * (1 - Math.exp(-(requested - shoulder) / (capacity - shoulder)))
          : capacity;
    const shift = (low: number, high: number, at: number) =>
      Math.max(margin - (at + (low - at) * applied), Math.min(world - margin - (at + (high - at) * applied), 0));
    const center = { x: pivot.x + shift(minX, maxX, pivot.x), z: pivot.z + shift(minZ, maxZ, pivot.z) };
    const map = (p: PlanPoint) => ({
      x: center.x + (p.x - pivot.x) * applied,
      z: center.z + (p.z - pivot.z) * applied
    });
    if (main) plan.land = plan.land.map(map);
    if (island) plan.islands[index] = plan.islands[index].map(map);
    for (const r of recipes) {
      r.rounding *= applied;
      r.blocks = r.blocks.map((b) => ({ ...b, ...map(b), width: b.width * applied, length: b.length * applied }));
    }
    for (const w of water) {
      w.outline = w.outline.map(map);
      if (w.centerline) w.centerline = w.centerline.map(map);
    }
    for (const r of rocks) {
      r.center = map(r.center);
      r.outline = r.outline.map(map);
      r.obb = r.obb.map(map);
      r.width *= applied;
      r.depth *= applied;
    }
    for (const g of mountains) {
      g.outline = g.outline.map(map);
      if (g.outlines) g.outlines = g.outlines.map((r) => r.map(map));
    }
    for (const b of buildings) {
      b.center = map(b.center);
      b.outline = b.outline.map(map);
      b.width *= applied;
      b.depth *= applied;
    }
    for (const r of regions) r.outline = r.outline.map(map);
    plan.sizeAdjustments.push({
      id,
      label: recipe.label,
      requested,
      applied,
      shiftX: center.x - pivot.x,
      shiftZ: center.z - pivot.z,
      offsetX: center.x - pivot.x * applied,
      offsetZ: center.z - pivot.z * applied,
      members: recipes.map((r) => r.id)
    });
  }
  if (plan.sizeAdjustments.length)
    plan.slopes = [
      slopeBand("coast-soil", "海岸泥土缓坡", plan.land, 24, true),
      ...plan.islands.map((r, i) => slopeBand(`island-slope-${i}`, "岛岸泥土缓坡", r, 14, true)),
      ...plan.waters.map((w) => slopeBand(`bank-${w.id}`, "河湖泥土缓坡", w.outline, 16, false))
    ];
  return plan;
}
