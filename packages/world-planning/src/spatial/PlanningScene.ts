import { poiTerritoryAreas } from "./ecology/PoiTerritories";
import { isGlobalRoadId } from "./layout/RoadIdentity";
import { landscapeInfluenceSources } from "./ecology/LandscapeInfluences";
import { ribbonOutline } from "../semantic-study/WorldRibbon";
import { flowerInfluenceSources } from "./ecology/FlowerInfluences";
import type { IslandPlan, PlanLandscape, PlanPoint } from "../semantic-study/IslandPlanModel";
import type { PlanningPort, PlanningRelation } from "../semantic-study/WorldPlanningContract";
import { poiRangeOutline } from "../semantic-study/PoiFootprint";
import type { PoiSite } from "../semantic-study/PoiDistribution";
import { poiContentLabel } from "../semantic-study/PoiContents";
import { envelope } from "../semantic-study/IslandPlanAtoms";
import { rockObbId } from "../integrations/terrain/rock-formation/Authoring.ts";
/** Generated entities are read-only outputs. Editing writes authoring components, never these buffers. */
export interface SceneEntity {
  id: string;
  name: string;
  parent?: string;
  kind: string;
  components: Record<string, any>;
}
export interface PlanningScene {
  entities: Map<string, SceneEntity>;
  query(...components: string[]): SceneEntity[];
}
type Projector = (plan: IslandPlan, put: (entity: SceneEntity) => void, landscapeBoundary?: () => void) => void;
const projectors: Projector[] = [];
const snapshots = new WeakMap<PlanningScene, { plan: IslandPlan; projectors: number; landscapeOffset: number }>();
/** Picking uses the registered scene, not a second list of supported content kinds.
 * Only implementation-detail geometry redirects to its containing editable entity.
 */
export function resolveSceneSelection(scene: PlanningScene, id: string | null): string | null {
  const visited = new Set<string>();
  let entity = id ? scene.entities.get(id) : undefined;
  while (entity && !visited.has(entity.id)) {
    if (!entity.components.display?.internal) return entity.id;
    visited.add(entity.id);
    entity = entity.parent ? scene.entities.get(entity.parent) : undefined;
  }
  return null;
}
/** Extend projection without teaching the hierarchy, road system or inspector a new element type. */
export function registerSceneProjector(projector: Projector): void {
  projectors.push(projector);
}
const geometry = (outline: PlanPoint[] | undefined) => ({ geometry: { outline: outline ?? [] } });
function landscapeEntity(plan: IslandPlan, p: PlanLandscape): SceneEntity {
  return {
    id: p.id,
    name:
      (p.role === "poi" ? "主体高树" : p.kind === "tree" ? "景观树" : "景观石") + " · " + p.height.toFixed(1) + " m",
    parent: p.poiId ?? p.ownerId ?? "world",
    kind: "landscapeElement",
    components: {
      ...geometry(p.outline),
      landscapeElement: p,
      ...(plan.visualGuidance?.some((g) => g.memberIds.includes(p.id))
        ? { guidanceMember: { sourceId: p.ownerId } }
        : {}),
      ...(p.role === "poi" || p.locked ? { roadObstacle: { outlines: [p.outline] } } : {})
    }
  };
}
registerSceneProjector((plan, put, landscapeBoundary) => {
  put({ id: "world", name: "世界", kind: "world", components: geometry(plan.land) });
  for (const m of plan.planning?.modules ?? [])
    put({
      id: m.id,
      name:
        m.kind === "village"
          ? (plan.regions.find((r) => r.id === m.id)?.label ?? m.id)
          : (plan.mountains.find((r) => r.id === m.id)?.label ?? m.id),
      parent: m.ownerId ?? "world",
      kind: m.kind,
      components: { ...geometry(m.outline), module: m }
    });
  for (const [index, outline] of plan.islands.entries())
    put({
      id: `offshore-${index}`,
      name: `离岛 ${index + 1}`,
      kind: "island",
      parent: "world",
      components: geometry(outline)
    });
  for (const p of plan.poiDistribution?.sites ?? [])
    put({
      id: p.id,
      name: plan.farming?.poiId === p.id ? "农场管理区" : poiContentLabel(plan, p),
      parent: "world",
      kind: "poi",
      components: { poi: p, position: p.center, ...geometry(poiRangeOutline(p)) }
    });
  for (const r of plan.regions)
    put({
      id: r.id,
      name: r.label,
      parent: plan.poiDistribution?.sites.find((p) => p.memberIds.includes(r.id))?.id ?? "world",
      kind: r.kind,
      components: {
        ...geometry(r.outline),
        region: r,
        ...(plan.buildings.some((b) => b.regionId === r.id) ? { buildingPolicy: {} } : {}),
        ...(r.kind === "village" || r.roadExcluded ? { roadExclusion: { outline: r.outline } } : {})
      }
    });
  for (const m of plan.mountains)
    put({
      id: m.id,
      name: m.label,
      parent: plan.poiDistribution?.sites.find((p) => p.memberIds.includes(m.id))?.id ?? "world",
      kind: m.semanticKind === "canyon" ? "canyon" : "mountain",
      components: { ...geometry(m.outline), landform: m }
    });
  for (const b of plan.buildings)
    put({
      id: b.id,
      name: "建筑 " + b.id.split("-building-").at(-1),
      parent: b.regionId,
      kind: "building",
      components: { ...geometry(b.outline), building: b, roadObstacle: { outlines: [b.outline] } }
    });
  for (const g of plan.visualGuidance ?? [])
    if (g.fromPoi && !plan.routes.some((r) => r.id === g.sourceId))
      put({
        id: g.sourceId,
        name: "视觉关系 · " + g.fromPoi + " → " + g.toPoi,
        parent: "world",
        kind: "guidanceLink",
        components: {
          ...geometry(g.points),
          visualGuidance: g,
          display: { group: "guidance", label: "视觉引导", aggregate: true }
        }
      });
  for (const r of plan.rocks) {
    put({
      id: r.id,
      name: plan.visualGuidance?.some((g) => g.memberIds.includes(r.id))
        ? "沿途岩群 · " + r.height.toFixed(1) + " m"
        : r.id,
      parent: r.groupId,
      kind: "rock",
      components: {
        ...geometry(r.outline),
        rock: r,
        ...(plan.visualGuidance?.some((g) => g.memberIds.includes(r.id))
          ? { guidanceMember: { sourceId: r.groupId } }
          : {}),
        roadObstacle: { outlines: r.boxes?.map((b) => envelope(b.center, b.sizeX, b.sizeZ, b.yaw)) ?? [r.outline] }
      }
    });
    for (const box of r.boxes ?? [
      {
        id: r.id,
        center: r.center,
        sizeX: r.width,
        sizeY: r.height,
        sizeZ: r.depth,
        yaw: r.yaw,
        elevation: r.baseHeight
      }
    ])
      put({
        id: rockObbId(r.id, box.id),
        name: `OBB · ${box.id}`,
        parent: r.id,
        kind: "rockObb",
        components: {
          ...geometry(envelope(box.center, box.sizeX, box.sizeZ, box.yaw)),
          rockObb: box,
          display: { group: "rocks", label: "独立岩石 OBB", internal: false }
        }
      });
  }
  for (const w of plan.waters)
    put({
      id: w.id,
      name: w.label,
      parent: w.systemId ?? "world",
      kind: w.kind === "lake" ? "lake" : "water",
      components: { ...geometry(w.outline), water: w, roadObstacle: { outlines: [w.outline] } }
    });
  for (const p of plan.plazas ?? [])
    put({
      id: p.id,
      name: p.label,
      parent: plan.planning?.modules.find((m) => m.memberIds?.includes(p.id))?.id ?? "world",
      kind: "plaza",
      components: {
        ...geometry(p.outline),
        plaza: p,
        ...(p.purpose === "central-clearing"
          ? { display: { group: "clearing", label: "中心留白", internal: true } }
          : {})
      }
    });
  for (const r of plan.routes)
    put({
      id: r.id,
      name: r.label,
      parent: plan.planning?.modules.find((m) => m.memberIds?.includes(r.id))?.id ?? "world",
      kind: isGlobalRoadId(r.id) ? "globalRoute" : "route",
      components: { ...geometry(r.outline), route: r }
    });
  for (const [id, points] of Object.entries(plan.spatialLayout?.authoredRoadPaths ?? {}))
    if (!plan.routes.some((route) => route.id === id))
      put({
        id,
        name: "道路（待解决必经点）",
        parent:
          plan.planning?.modules.find((module) => module.memberIds?.includes(id))?.id ??
          plan.spatialLayout?.baselineGroups?.find((group) => group.paths.some((path) => path.id === id))?.id ??
          "world",
        kind: isGlobalRoadId(id) ? "globalRoute" : "route",
        components: { authoredRoadPath: { keypoints: points }, position: points[0], ...geometry([]) }
      });
  for (const b of plan.bridges)
    put({
      id: b.id,
      name: b.label,
      parent: "world-routes",
      kind: "bridge",
      components: {
        ...geometry(ribbonOutline(b.deckPath ?? [b.a, b.b], [b.width], undefined, true)),
        bridge: b,
        display: { group: "bridges", label: "桥梁" }
      }
    });
  for (const f of plan.flowerRegions ?? [])
    put({
      id: f.id,
      name: f.label,
      parent: f.ownerId,
      kind: "flowerRegion",
      components: {
        geometry: { outline: f.outline, outlines: f.outlines },
        flowerRegion: f,
        display: { group: "flowers", label: "花丛区域" }
      }
    });
  landscapeBoundary?.();
  for (const p of plan.landscapes ?? []) put(landscapeEntity(plan, p));
  for (const p of plan.planning?.ports ?? [])
    put({
      id: p.id,
      name: p.id,
      parent: p.ownerId,
      kind: "port",
      components: { position: p.position, port: p, ...(p.roadAccess ? { roadAccess: p } : {}) }
    });
  for (const r of plan.planning?.relations ?? [])
    put({ id: "relation:" + r.id, name: r.kind, parent: "world", kind: "relation", components: { relation: r } });
  for (const p of plan.planning?.profiles ?? [])
    put({ id: "profile:" + p.id, name: p.kind, parent: p.ownerId, kind: "profile", components: { profile: p } });
  for (const r of plan.planning?.reservations ?? [])
    put({
      id: "reservation:" + r.id,
      name: r.kind,
      parent: r.ownerId,
      kind: "reservation",
      components: { ...geometry(r.outline), reservation: r }
    });
  for (const site of plan.poiDistribution?.sites ?? [])
    for (const id of site.memberIds) put({ id, name: id, parent: site.id, kind: "", components: {} });
});
registerSceneProjector((plan, put) => {
  for (const group of plan.spatialLayout?.groups ?? []) {
    const site = plan.poiDistribution?.sites.find((s) => s.id === group.id);
    if (site)
      put({
        id: group.id,
        name: plan.farming?.poiId === site.id ? "农场管理区" : poiContentLabel(plan, site),
        parent: "world",
        kind: "poi",
        components: {
          poi: site,
          position: site.center,
          layout: {
            ...group.rule,
            elementProfile: plan.spatialLayout?.elementProfiles?.[site.id],
            memberCount: group.volumes.length
          },
          ...geometry(poiRangeOutline(site)),
          display: { group: "poi", label: "POI" }
        }
      });
    group.volumes.forEach((v, i) =>
      put({
        id: v.id,
        name: `体量 ${i + 1}`,
        parent: group.id,
        kind: "volume",
        components: {
          volume: v,
          roadObstacle: { outlines: v.boxes.map((b) => envelope(b.center, b.width, b.depth, b.yaw)) },
          display: { group: "volumes", label: "空间体量", internal: false }
        }
      })
    );
  }
});
registerSceneProjector((plan, put) => {
  const candidates = plan.poiDistribution?.sites ?? [],
    sites = candidates.filter((site) => site.active),
    areas = poiTerritoryAreas(plan);
  const values: Record<string, number> = {
    count: sites.length,
    candidateCount: candidates.length,
    averageAreaM2: sites.length ? sites.reduce((sum, site) => sum + (areas.get(site.id) ?? 0), 0) / sites.length : 0
  };
  put({ id: "world", name: "世界", kind: "world", components: { distributionMetrics: values } });
});
const builtInProjectorCount = projectors.length;

function applyDisplay(entity: SceneEntity, entities: ReadonlyMap<string, SceneEntity>): void {
  const c = entity.components;
  if (c.display) return;
  const group =
    c.region && ["village", "open"].includes(entity.kind)
      ? ["composition", "场所组合"]
      : c.building
        ? ["buildings", "建筑"]
        : c.landform || c.rock
          ? ["rocks", "地貌与岩石"]
          : c.water
            ? ["water", "河流"]
            : c.route || c.authoredRoadPath || c.plaza
              ? ["roads", "场所道路与广场"]
              : c.landscapeElement
                ? c.landscapeElement.role === "poi"
                  ? ["landmark", "主体高树"]
                  : ["landscape", "周边景观"]
                : undefined;
  if (group)
    c.display = {
      group: group[0],
      label: group[1],
      aggregate: !!c.landform || (!!c.region && ["village", "open"].includes(entity.kind)),
      internal: !!c.rock && !!entities.get(entity.parent ?? "")?.components.landform,
      globalRoad: !!(c.route || c.authoredRoadPath) && isGlobalRoadId(entity.id)
    };
}
function sceneSnapshot(entities: Map<string, SceneEntity>, plan: IslandPlan, landscapeOffset: number): PlanningScene {
  const scene: PlanningScene = {
    entities,
    query: (...components) =>
      [...entities.values()].filter((e) => components.every((c) => e.components[c] !== undefined))
  };
  snapshots.set(scene, { plan, projectors: projectors.length, landscapeOffset });
  return scene;
}

/** Update scenery-only publications without rebuilding terrain, POI metrics or unrelated entities.
 * Unknown projectors and changed non-scenery inputs take the full projection path.
 */
export function updatePlanningScene(
  previous: PlanningScene,
  before: IslandPlan,
  after: IslandPlan,
  kind: "reveal" | "instance"
): PlanningScene | undefined {
  const saved = snapshots.get(previous);
  if (
    !saved ||
    saved.plan !== before ||
    saved.projectors !== projectors.length ||
    projectors.length !== builtInProjectorCount ||
    !["reveal", "instance"].includes(kind)
  )
    return;
  for (const key of [
    "parameters",
    "land",
    "islands",
    "poiDistribution",
    "regions",
    "mountains",
    "buildings",
    "rocks",
    "waters",
    "plazas",
    "routes",
    "bridges",
    "flowerRegions",
    "visualGuidance",
    "farming"
  ] as const)
    if (before[key] !== after[key]) return;
  for (const key of ["modules", "ports", "relations", "profiles", "reservations"] as const)
    if (before.planning?.[key] !== after.planning?.[key]) return;
  const beforeGroups = before.spatialLayout?.groups ?? [],
    afterGroups = after.spatialLayout?.groups ?? [];
  if (beforeGroups.length !== afterGroups.length || beforeGroups.some((group, i) => group !== afterGroups[i])) return;
  const old = new Map((before.landscapes ?? []).map((item) => [item.id, item])),
    next = new Map((after.landscapes ?? []).map((item) => [item.id, item]));
  if (old.size !== (before.landscapes?.length ?? 0) || next.size !== (after.landscapes?.length ?? 0)) return;
  const members = new Map(
    after.poiDistribution?.sites.flatMap((site) => site.memberIds.map((id) => [id, site.id] as const))
  );
  const changed = new Set([...old.keys(), ...next.keys()].filter((id) => old.get(id) !== next.get(id)));
  const landscapeComponents = new Set(["geometry", "landscapeElement", "guidanceMember", "roadObstacle", "display"]);
  for (const id of new Set([...old.keys(), ...changed])) {
    const entity = previous.entities.get(id);
    if (old.has(id)) {
      if (
        !entity ||
        entity.kind !== "landscapeElement" ||
        entity.components.landscapeElement !== old.get(id) ||
        Object.keys(entity.components).some((component) => !landscapeComponents.has(component)) ||
        (!next.has(id) && members.has(id))
      )
        return;
    } else if (entity) return;
  }
  const replacements = new Map<string, SceneEntity>();
  for (const id of changed) {
    const item = next.get(id);
    if (!item) continue;
    const entity = landscapeEntity(after, item);
    entity.parent = members.get(id) ?? entity.parent;
    applyDisplay(entity, previous.entities);
    replacements.set(id, entity);
  }
  const entries = [...previous.entities.entries()];
  // Full projection places scenery before ports/profiles. Keep query and hierarchy iteration identical,
  // including a zero-population edit followed by revealing the same candidates again.
  if (entries.slice(saved.landscapeOffset, saved.landscapeOffset + old.size).some(([id]) => !old.has(id))) return;
  const entities = new Map<string, SceneEntity>();
  const insertLandscapes = () => {
    for (const item of after.landscapes ?? [])
      entities.set(item.id, replacements.get(item.id) ?? previous.entities.get(item.id)!);
  };
  for (let i = 0; i <= entries.length; i++) {
    if (i === saved.landscapeOffset) insertLandscapes();
    if (i < entries.length && !old.has(entries[i][0])) entities.set(...entries[i]);
  }
  return sceneSnapshot(entities, after, saved.landscapeOffset);
}
/** Build a queryable component snapshot for domain systems and editor projections. */
export function buildPlanningScene(plan: IslandPlan): PlanningScene {
  const entities = new Map<string, SceneEntity>();
  let landscapeOffset = 0;
  const put = (entity: SceneEntity) => {
    const old = entities.get(entity.id);
    entities.set(
      entity.id,
      old
        ? {
            ...old,
            ...entity,
            name: entity.name === entity.id ? old.name : entity.name,
            kind: entity.kind || old.kind,
            components: { ...old.components, ...entity.components }
          }
        : entity
    );
  };
  for (const projector of projectors)
    projector(plan, put, () => {
      landscapeOffset = entities.size;
    });
  for (const source of flowerInfluenceSources(plan)) {
    const entity = entities.get(source.id);
    if (entity) entity.components.flowerInfluence = source;
  }
  for (const source of landscapeInfluenceSources(plan)) {
    const entity = entities.get(source.id);
    if (entity) entity.components.landscapeInfluence ??= source;
  }
  for (const entity of entities.values()) applyDisplay(entity, entities);
  return sceneSnapshot(entities, plan, landscapeOffset);
}
/** Road input depends on capabilities, not a closed list of visual content types. */
export function roadComponents(scene: PlanningScene): {
  obstacles: { owner: string; outline: PlanPoint[] }[];
  exclusions: { id: string; outline: PlanPoint[] }[];
  ports: PlanningPort[];
  sites: PoiSite[];
} {
  return {
    obstacles: scene
      .query("roadObstacle")
      .flatMap((e) => e.components.roadObstacle.outlines.map((outline: PlanPoint[]) => ({ owner: e.id, outline }))),
    exclusions: scene.query("roadExclusion").map((e) => ({ id: e.id, outline: e.components.roadExclusion.outline })),
    ports: scene.query("roadAccess").map((e) => e.components.roadAccess as PlanningPort),
    sites: scene.query("poi").map((e) => e.components.poi as PoiSite)
  };
}
/** Find actual containment, independently from parameter bindings and cross-entity relations. */
export function ancestors(scene: PlanningScene, id: string): SceneEntity[] {
  const chain: SceneEntity[] = [],
    seen = new Set<string>();
  let current = scene.entities.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parent ? scene.entities.get(current.parent) : undefined;
  }
  return chain;
}
