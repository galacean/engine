import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { createPlanningRingQuery } from "../semantic-study/WorldPlanningTerrain";
import { buildWorldTemplateGeometry, templateNodeFootprint } from "./WorldTemplateGeometry";
import { worldTemplate } from "./WorldTemplateCatalog";
import { WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";
import { poiTerritories } from "./ecology/PoiTerritories";
import type { SubjectViewPose } from "./PlanningSubjectView";
import { spatialCompositionParameters } from "./SpatialCompositionParameters";

export interface WorldTemplateSite {
  templateId: string;
  center: PlanPoint;
  footprints: {
    id: string;
    outline: PlanPoint[];
    obb: { center: PlanPoint; size: [number, number, number]; yawDegrees: number; outline: PlanPoint[] };
    label?: string;
    poiId?: string;
    containedInPoi?: boolean;
  }[];
  spawnView?: SubjectViewPose;
}

/** Choose the authored subject's domain before any ordinary population is constructed.
 * The same published reservation drives layout, ecology, farming and runtime placement. */
export function planWorldTemplateSite(
  plan: IslandPlan,
  ground: (point: PlanPoint) => number
): WorldTemplateSite | undefined {
  const template = worldTemplate(plan.parameters.worldTemplate?.id);
  if (!template) return;
  const { radius: modelRadius, nodes } = buildWorldTemplateGeometry(
    template,
    plan.parameters.seed,
    plan.parameters.spatialComposition
  );
  const art = WORLD_TEMPLATE_ART[template.id];
  const q = spatialCompositionParameters(plan.parameters.spatialComposition);
  const radius = Math.max(
    modelRadius,
    q.basinRadiusM,
    q.enabled ? Math.max(q.widthM / 2, q.frontDepthM, q.backDepthM) : 0
  );
  // Distant floating props do not evict the landscape below them. Reserve each
  // grounded asset, rather than clearing the empty rectangle between assets.
  const local = nodes
    .filter((node) => node.grounded)
    .map((node) => ({
      id: node.id,
      label: node.label,
      outline: templateNodeFootprint(node),
      obb: {
        center: { x: node.position[0], z: node.position[2] },
        size: node.scale,
        yawDegrees: node.rotation[1],
        outline: templateNodeFootprint(node, true)
      }
    }));
  const margin = local.length
    ? Math.max(...local.flatMap((item) => item.outline.flatMap((p) => [Math.abs(p.x), Math.abs(p.z)])))
    : radius;
  const land = createPlanningRingQuery(plan.land),
    waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const center = { x: plan.parameters.width / 2, z: plan.parameters.depth / 2 };
  const territories =
    art.plannedSubjects && plan.poiDistribution
      ? poiTerritories(plan)
          .filter((cell) => cell.outline.length >= 3)
          .map((cell) => ({ poiId: cell.poiId, ring: createPlanningRingQuery(cell.outline) }))
      : undefined;
  const stride = margin / (territories ? 6 : 2);
  let best:
    | {
        center: PlanPoint;
        score: number;
        crossings: number;
        footprints: WorldTemplateSite["footprints"];
      }
    | undefined;
  const authored = q.enabled ? { centerX: q.centerX, centerZ: q.centerZ } : plan.parameters.worldTemplate;
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
      if (x < radius || z < radius || x + radius > plan.parameters.width || z + radius > plan.parameters.depth)
        continue;
      const point = { x, z };
      const translate = (p: PlanPoint) => ({ x: x + p.x, z: z + p.z });
      const footprints = local.map((item) => {
        const obb = { ...item.obb, center: translate(item.obb.center), outline: item.obb.outline.map(translate) };
        const poi = territories?.find(({ ring }) => ring.inside(obb.center));
        return {
          ...item,
          outline: item.outline.map(translate),
          obb,
          poiId: poi?.poiId,
          containedInPoi: poi?.ring.containsPolygon(obb.outline)
        };
      });
      const crossings = territories ? footprints.filter((item) => !item.containedInPoi).length : 0;
      if (best && crossings > best.crossings) continue;
      if (
        q.basinRadiusM &&
        !land.containsPolygon(
          Array.from({ length: 96 }, (_, i) => ({
            x: x + Math.cos((i * Math.PI) / 48) * q.basinRadiusM,
            z: z + Math.sin((i * Math.PI) / 48) * q.basinRadiusM
          }))
        )
      )
        continue;
      if (
        !land.inside(point) ||
        footprints.some(
          (item) =>
            !land.containsPolygon(item.outline) ||
            (art.support !== "submerged" && waters.some((w) => w.overlapsPolygon(item.outline)))
        )
      )
        continue;
      const heights = [point, ...footprints.flatMap((item) => item.outline)].map(ground);
      if (!heights.every(Number.isFinite)) continue;
      const relief = Math.max(...heights) - Math.min(...heights);
      const score =
        relief / margin +
        Math.hypot(x - center.x, z - center.z) / Math.hypot(plan.parameters.width, plan.parameters.depth);
      if (!best || crossings < best.crossings || score < best.score)
        best = { center: point, footprints, score, crossings };
    }
  if (!best) {
    const clashes = fixed
      ? local.flatMap((item) => {
          const outline = item.outline.map((p) => ({ x: authored.centerX! + p.x, z: authored.centerZ! + p.z }));
          return plan.waters
            .filter((water) => createPlanningRingQuery(water.outline).overlapsPolygon(outline))
            .map((water) => `${item.id} / ${water.id}`);
        })
      : [];
    throw new Error(
      "主陆地无法容纳风格主体；请扩大陆域后重试。" + (clashes.length ? ` 水域占地冲突：${clashes.join("，")}` : "")
    );
  }
  return {
    templateId: template.id,
    center: best.center,
    footprints: best.footprints
  };
}
