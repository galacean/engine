import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../semantic-study/WorldPlanningTerrain";
import { buildWorldTemplateGeometry, templateNodeFootprint } from "./WorldTemplateGeometry";
import { worldTemplate } from "./WorldTemplateCatalog";
import { envelope } from "../semantic-study/IslandPlanAtoms";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";

export interface WorldTemplateSite {
  templateId: string;
  center: PlanPoint;
  radius: number;
  outline: PlanPoint[];
  footprints: { id: string; outline: PlanPoint[] }[];
}

/** Choose the authored subject's domain before any ordinary population is constructed.
 * The same published reservation drives layout, ecology, farming and runtime placement. */
export function planWorldTemplateSite(
  plan: IslandPlan,
  ground: (point: PlanPoint) => number
): WorldTemplateSite | undefined {
  const template = worldTemplate(plan.parameters.worldTemplate?.id);
  if (!template) return;
  const { radius, nodes } = buildWorldTemplateGeometry(template, plan.parameters.seed);
  // Distant floating props do not evict the landscape below them. Reserve each
  // grounded asset, rather than clearing the empty rectangle between assets.
  const local = nodes
    .filter((node) => node.grounded)
    .map((node) => ({ id: node.id, outline: templateNodeFootprint(node) }));
  const margin = local.length
    ? Math.max(...local.flatMap((item) => item.outline.flatMap((p) => [Math.abs(p.x), Math.abs(p.z)])))
    : radius;
  const land = createPlanningRingQuery(plan.land),
    waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const center = { x: plan.parameters.width / 2, z: plan.parameters.depth / 2 };
  const stride = margin / 2;
  let best:
    | { center: PlanPoint; outline: PlanPoint[]; score: number; footprints: WorldTemplateSite["footprints"] }
    | undefined;
  const authored = plan.parameters.worldTemplate;
  if ((authored?.centerX === undefined) !== (authored?.centerZ === undefined))
    throw new Error("风格主体锚点须同时提供 X 与 Z");
  const fixed = authored?.centerX !== undefined && authored.centerZ !== undefined;
  const xs = fixed
    ? [authored.centerX!]
    : Array.from(
        { length: Math.max(0, Math.ceil((plan.parameters.width - radius * 2) / stride)) },
        (_, i) => radius + i * stride
      );
  const zs = fixed
    ? [authored.centerZ!]
    : Array.from(
        { length: Math.max(0, Math.ceil((plan.parameters.depth - radius * 2) / stride)) },
        (_, i) => radius + i * stride
      );
  for (const z of zs)
    for (const x of xs) {
      const point = { x, z },
        outline = envelope(point, radius * 2, radius * 2, 0);
      if (outline.some((p) => p.x < 0 || p.z < 0 || p.x > plan.parameters.width || p.z > plan.parameters.depth))
        continue;
      const footprints = local.map((item) => ({
        id: item.id,
        outline: item.outline.map((p) => ({ x: x + p.x, z: z + p.z }))
      }));
      if (
        !land.inside(point) ||
        footprints.some(
          (item) =>
            !land.containsPolygon(item.outline) ||
            (WORLD_TEMPLATE_ART[template.id].support !== "submerged" &&
              waters.some((w) => w.overlapsPolygon(item.outline)))
        )
      )
        continue;
      const heights = [point, ...footprints.flatMap((item) => item.outline)].map(ground);
      if (!heights.every(Number.isFinite)) continue;
      const relief = Math.max(...heights) - Math.min(...heights);
      const score =
        relief / margin +
        Math.hypot(x - center.x, z - center.z) / Math.hypot(plan.parameters.width, plan.parameters.depth);
      if (!best || score < best.score) best = { center: point, outline, footprints, score };
    }
  if (!best) throw new Error("主陆地无法容纳风格主体；请扩大陆域后重试。");
  return { templateId: template.id, center: best.center, radius, outline: best.outline, footprints: best.footprints };
}
