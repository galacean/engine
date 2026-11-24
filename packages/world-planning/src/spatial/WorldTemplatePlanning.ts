import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { resolveRockCollision } from "./RockCollisionPolicy";
import { createPlanningRingQuery } from "../semantic-study/WorldPlanningTerrain";
import { buildWorldTemplateGeometry, templateNodeFootprint } from "./WorldTemplateGeometry";
import { worldTemplate } from "./WorldTemplateCatalog";
import { templateRockCollisionPolicy, WORLD_TEMPLATE_ART } from "./WorldTemplateArtDirection";
import { poiTerritories } from "./ecology/PoiTerritories";
import type { SubjectViewPose } from "./PlanningSubjectView";
import { spatialCompositionParameters } from "./SpatialCompositionParameters";
import { TEMPLATE_SPAWN_POI_ID, WORLD_TEMPLATE_CONFIGS } from "./WorldTemplateConfig";

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
  spawnPoiId?: string;
  centeredStart?: PlanPoint;
}

/** Resolve the configured start against the published POI when the template supplies one.
 * @param plan Current world plan, after POI distribution.
 * @returns The authored start and its POI, if configured.
 */
export function resolveConfiguredTemplateSpawn(plan: IslandPlan): { position: PlanPoint; poiId?: string } | undefined {
  const config = WORLD_TEMPLATE_CONFIGS[plan.parameters.worldTemplate?.id ?? ""];
  if (!config?.spawn) return;
  const poi = config.spawnPoi && plan.poiDistribution?.sites.find((site) => site.id === TEMPLATE_SPAWN_POI_ID);
  if (poi && !poi.active) throw new Error("模板出生点 POI 未能获得有效管理区");
  return poi ? { position: poi.center, poiId: poi.id } : { position: config.spawn.position };
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
  if (WORLD_TEMPLATE_CONFIGS[template.id] && !nodes.length) return;
  const art = WORLD_TEMPLATE_ART[template.id];
  const q = spatialCompositionParameters(plan.parameters.spatialComposition);
  if (!nodes.length && !q.enabled && q.basinRadiusM === 0 && !art.centeredStart) return;
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
    : radius || 32;
  const land = createPlanningRingQuery(plan.land),
    waters = plan.waters.map((w) => ({
      outline: createPlanningRingQuery(w.outline),
      holes: (w.lake?.holes ?? []).map(createPlanningRingQuery)
    }));
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
  const spawn = resolveConfiguredTemplateSpawn(plan);
  const centeredStart =
    spawn?.position ?? (art.centeredStart && plan.parameters.landMode === "continuous" ? center : undefined);
  const authored = q.enabled
    ? { centerX: q.centerX, centerZ: q.centerZ }
    : plan.parameters.worldTemplate?.centerX !== undefined ||
        plan.parameters.worldTemplate?.centerZ !== undefined ||
        !centeredStart
      ? plan.parameters.worldTemplate
      : { centerX: center.x, centerZ: center.z };
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
            waters.some(
              (w) => w.outline.overlapsPolygon(item.outline) && !w.holes.some((h) => h.containsPolygon(item.outline))
            )
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
            .filter((water) => {
              const holes = (water.lake?.holes ?? []).map(createPlanningRingQuery);
              return (
                createPlanningRingQuery(water.outline).overlapsPolygon(outline) &&
                !holes.some((hole) => hole.containsPolygon(outline))
              );
            })
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
    footprints: best.footprints,
    ...(spawn?.poiId ? { spawnPoiId: spawn.poiId } : {}),
    centeredStart
  };
}

/** Append template-authored stones/monoliths and stepped cliff formations for RockFormationView. */
export function publishTemplateStones(plan: IslandPlan, ground: (point: PlanPoint) => number): void {
  const id = plan.parameters.worldTemplate?.id;
  const art = id ? WORLD_TEMPLATE_ART[id] : undefined;
  if (!art?.stones?.length) return;
  const collisionPolicy = templateRockCollisionPolicy(id);
  const anchor = plan.worldTemplateSite?.center ?? {
    x: plan.parameters.width / 2,
    z: plan.parameters.depth / 2
  };
  const stonePrefix = `template:${id}:stone:`;
  const cliffPrefix = `template:${id}:cliff:`;
  const retainedLandscapes = (plan.landscapes ?? []).filter((item) => !item.id.startsWith(stonePrefix));
  const retainedRocks = plan.rocks.filter((item) => !item.id.startsWith(cliffPrefix));
  const authoredStones: NonNullable<IslandPlan["landscapes"]> = [];
  const authoredCliffs: IslandPlan["rocks"] = [];
  for (const stone of art.stones) {
    const center = { x: anchor.x - stone.x, z: anchor.z + stone.z };
    const yaw = ((stone.yawDegrees ?? 0) * Math.PI) / 180;
    const c = Math.cos(yaw),
      s = Math.sin(yaw);
    const hw = stone.width / 2,
      hd = stone.depth / 2;
    const outline = (
      [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd]
      ] as const
    ).map(([lx, lz]) => ({ x: center.x + lx * c - lz * s, z: center.z + lx * s + lz * c }));
    const baseHeight = ground(center) + (stone.y ?? 0);
    if (stone.cliff) {
      const rockId = `${cliffPrefix}${stone.id}`;
      authoredCliffs.push({
        id: rockId,
        groupId: rockId,
        role: "wall",
        center,
        width: stone.width,
        depth: stone.depth,
        height: stone.height,
        yaw,
        baseHeight,
        outline,
        obb: outline,
        boxes: [
          {
            id: rockId,
            label: stone.id,
            center,
            sizeX: stone.width,
            sizeY: stone.height,
            sizeZ: stone.depth,
            elevation: baseHeight,
            yaw,
            collision: resolveRockCollision(stone, collisionPolicy, stone.collision),
            occlusion: true
          }
        ]
      });
    } else {
      const itemId = `${stonePrefix}${stone.id}`;
      authoredStones.push({
        id: itemId,
        ownerId: itemId,
        sourceId: itemId,
        kind: "rock" as const,
        role: "poi" as const,
        locked: true,
        center,
        width: stone.width,
        depth: stone.depth,
        height: stone.height,
        yaw,
        baseHeight,
        outline,
        collisionRadius: Math.hypot(hw, hd),
        collision: resolveRockCollision(stone, collisionPolicy, stone.collision)
      });
    }
  }
  plan.landscapes = [...retainedLandscapes, ...authoredStones];
  if (authoredCliffs.length || retainedRocks.length !== plan.rocks.length) {
    plan.rocks = [...retainedRocks, ...authoredCliffs];
  }
}
