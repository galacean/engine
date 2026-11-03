import type { MeshRenderer, Vector3 } from "@galacean/engine";
import type { PublishedPlanningSeedScene } from "./PlanningSeedScenePublication";
import type { PlanningWaterRuntime } from "./PlanningWaterRuntime";
import type { SeedWorldPickBatch, SeedWorldPickVisitor } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import type { LandscapePlantInstance } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { reliefField } from "../terrain/ReliefField";
import { roadSurfaces, roadSurfaceOwners } from "../layout/RoadTopology";
import { pointInPolygon } from "../../geometry/V2Geometry";
import type { SeedWorldAssetCandidate } from "../../agent-adapter/SeedWorldAssetManager";
import type { SeedWorldAssetDomain } from "../../agent-adapter/ports/SeedWorldEnginePort";
import { SEED_WORLD_ASSET_TYPE_CATALOG } from "../../agent-adapter/contracts/SeedWorldAssetContracts";
import { planningRemovedObjectIds } from "../PlanningResources";

export const PLANNING_GRASSLAND_ID = "planning:grassland";
export const PLANNING_TERRAIN_ID = "planning:terrain";

/** Published geometry supplies the same identity to picking and the existing Agent asset catalog. */
export function planningPickAssets(plan: IslandPlan): readonly SeedWorldAssetCandidate[] {
  const assets: SeedWorldAssetCandidate[] = [];
  const ids = new Set<string>();
  const removed = planningRemovedObjectIds(plan.authoredResources ?? []);
  function add(id: string, domain: SeedWorldAssetDomain, kind: string, elementId: string = id): void {
    if (ids.has(id) || removed.has(id)) return;
    ids.add(id);
    assets.push({
      ref: { id, domain, kind, source: "natural" },
      properties: { assetKind: kind, planningElementId: elementId }
    });
  }
  add(PLANNING_GRASSLAND_ID, "vegetation", "grassland", "world");
  add(PLANNING_TERRAIN_ID, "terrain", "terrain", "world");
  // Native meadow trees are owned by the published plan, rather than the legacy population catalog.
  if (plan.naturalVegetation)
    for (const tree of plan.landscapes ?? []) if (tree.kind === "tree") add(tree.id, "vegetation", "tree", tree.id);
  for (const region of plan.flowerRegions ?? []) add(region.id, "vegetation", "flower-field", region.id);
  for (const mountain of plan.mountains) add(mountain.id, "terrain", mountain.semanticKind ?? "mountain");
  for (const patch of plan.parameters.terrainPatches ?? []) add(patch.id, "terrain", "slope");
  // Rocks already belong to the runtime object catalog, which applies author removals.
  // Adding plan IDs here would bypass that ownership and revive deleted objects.
  const buildingDomain = SEED_WORLD_ASSET_TYPE_CATALOG.building.domain;
  for (const item of plan.buildings) add(item.id, buildingDomain, "building");
  for (const item of plan.courtyards ?? []) add(item.regionId, buildingDomain, "building");
  for (const item of plan.fences ?? []) add(item.id, buildingDomain, "building");
  for (const item of [...(plan.bridges ?? []), ...(plan.roadApproaches ?? [])])
    add(item.id, "infrastructure", "bridge");
  return assets;
}

/** Generated instances retain their region identity through density rasterization and interpolation. */
export function resolvePlanningDetailPick(category: "grass" | "flower", owner?: string): string | undefined {
  return category === "grass" ? PLANNING_GRASSLAND_ID : owner;
}

/** The producer retains the area owner; random instance IDs are never parsed as authoring IDs. */
export function resolvePlanningNaturalPlantPick(
  instance: Pick<LandscapePlantInstance, "id" | "scopeId">,
  tree: boolean
): string {
  return tree ? instance.id : (instance.scopeId ?? PLANNING_GRASSLAND_ID);
}

export function insideRings(point: PlanPoint, rings: PlanPoint[][]): boolean {
  let inside = false;
  for (let i = 0; i < rings.length; i++) if (pointInPolygon(point, rings[i]!)) inside = !inside;
  return inside;
}

/** Called only after a real visible Terrain fragment supplies its world-space position. */
export function resolvePlanningTerrainPick(plan: IslandPlan, x: number, z: number): string {
  const point = { x, z };
  for (const road of roadSurfaces(plan)) {
    if (road.outline?.length && pointInPolygon(point, road.outline)) {
      // A merged pavement section is geometry; its logical owner is the editable road.
      const owners = roadSurfaceOwners(plan, road);
      for (let i = 0; i < owners.length; i++)
        for (let j = 0; j < plan.routes.length; j++) {
          if (plan.routes[j]!.id === owners[i]) return `natural:road:${owners[i]}`;
        }
    }
  }
  for (const patch of [...(plan.parameters.terrainPatches ?? [])].reverse()) {
    if (Math.abs(reliefField([patch])(point)) > 0.00001) return patch.id;
  }
  for (const mountain of plan.mountains) {
    const outlines =
      mountain.landform?.outlines ??
      (mountain.landform ? [mountain.landform.outline] : (mountain.outlines ?? [mountain.outline]));
    if (insideRings(point, outlines)) return mountain.id;
  }
  return PLANNING_TERRAIN_ID;
}

class PlanningTerrainPickBatch implements SeedWorldPickBatch {
  readonly count = 1;
  readonly needsPosition = true;
  get snapshotKey(): object {
    return this.plan;
  }
  constructor(
    readonly renderer: MeshRenderer,
    private readonly plan: IslandPlan
  ) {}
  resolve(_index: number, position?: Readonly<Vector3>): string | undefined {
    return position && resolvePlanningTerrainPick(this.plan, position.x, position.z);
  }
  snapshotResolver(): { byteLength: number; resolve(position: Readonly<Vector3>): string } {
    // Keep only the identity geometry. Retaining `this`/plan would retain the published world.
    const source = this.plan;
    const data = structuredClone({
      roads: roadSurfaces(source)
        .filter((road) => road.outline?.length)
        .map((road) => ({
          outline: road.outline!,
          owner: roadSurfaceOwners(source, road).find((id) => source.routes.some((route) => route.id === id))
        })),
      patches: source.parameters.terrainPatches ?? [],
      mountains: source.mountains.map((mountain) => ({
        id: mountain.id,
        outlines:
          mountain.landform?.outlines ??
          (mountain.landform ? [mountain.landform.outline] : (mountain.outlines ?? [mountain.outline]))
      }))
    });
    return {
      // Include conservative headroom for numeric arrays, objects and UTF-16 strings.
      byteLength: JSON.stringify(data).length * 8 + 1024,
      resolve: (position) => {
        const point = { x: position.x, z: position.z };
        for (const road of data.roads)
          if (road.owner && pointInPolygon(point, road.outline)) return `natural:road:${road.owner}`;
        for (let i = data.patches.length - 1; i >= 0; i--)
          if (Math.abs(reliefField([data.patches[i]!])(point)) > 0.00001) return data.patches[i]!.id;
        for (const mountain of data.mountains) if (insideRings(point, mountain.outlines)) return mountain.id;
        return PLANNING_TERRAIN_ID;
      }
    };
  }
}
class PlanningPickTraversal {
  private readonly terrain = new WeakMap<MeshRenderer, PlanningTerrainPickBatch>();
  private visitor?: SeedWorldPickVisitor;
  private readonly visitTerrainBound = this.visitTerrain.bind(this);
  constructor(private readonly scene: PublishedPlanningSeedScene) {}
  private visitTerrain(renderer: MeshRenderer): void {
    let batch = this.terrain.get(renderer);
    if (!batch) {
      batch = new PlanningTerrainPickBatch(renderer, this.scene.plan);
      this.terrain.set(renderer, batch);
    }
    this.visitor!(batch);
  }
  visit(water: PlanningWaterRuntime, visitor: SeedWorldPickVisitor): void {
    this.visitor = visitor;
    try {
      this.scene.world.visitPickBatches(visitor, resolveDetailIdentity);
      this.scene.vegetation?.visitPickBatches(visitor);
      this.scene.solids.visitPickBatches(visitor);
      this.scene.masonry?.visitPickBatches(visitor);
      water.visitPickBatches(visitor);
      this.scene.world.visitTerrainRenderers(this.visitTerrainBound);
    } finally {
      this.visitor = undefined;
    }
  }
}
function resolveDetailIdentity(
  category: "grass" | "flower",
  _x: number,
  _z: number,
  owner?: string
): string | undefined {
  return resolvePlanningDetailPick(category, owner);
}
const traversals = new WeakMap<PublishedPlanningSeedScene, PlanningPickTraversal>();
/** Descriptor lifetimes follow their publication and renderer; no frame-local closures or batches. */
export function visitPlanningWorldPickBatches(
  scene: PublishedPlanningSeedScene,
  water: PlanningWaterRuntime,
  visitor: SeedWorldPickVisitor
): void {
  let traversal = traversals.get(scene);
  if (!traversal) {
    traversal = new PlanningPickTraversal(scene);
    traversals.set(scene, traversal);
  }
  traversal.visit(water, visitor);
}
