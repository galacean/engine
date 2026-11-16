import { generateWaterOverlay } from "./hydrology/PlanningWaterOverlay";
import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import type { SemanticResult, PlanningCheck } from "../semantic-study/WorldPlanningContract";
import type { PlanningDocument } from "./PlanningDocument";
import { PLANNING_COMPONENTS, planningComponentAppliesTo, refreshLayoutRuleChoices } from "./PlanningComponents";
import type { SpatialEntity } from "./SpatialDocument";
import type { SceneEntity, PlanningScene } from "./PlanningScene";
import { initialLayoutRule } from "./layout/SpatialWorld";
import { layoutRuleManifest } from "./layout/LayoutRules";
import { layoutProfileManifest } from "./layout/LayoutProfiles";

/** Read-only diagnostic extension. Geometry generation is owned by registered LayoutRule plugins. */
export interface PlanningExtension {
  id: string;
  version?: number;
  phase: "beforeNetwork" | "afterLandscape";
  run(document: PlanningDocument, plan: IslandPlan): PlanningCheck[];
}
const extensions: PlanningExtension[] = [];
/** Register a diagnostic extension. It receives isolated snapshots, so mutations cannot affect the published world. */
export function registerPlanningExtension(extension: PlanningExtension): () => void {
  if (extensions.some((e) => e.id === extension.id)) throw Error("扩展重复：" + extension.id);
  extensions.push(extension);
  return () => {
    const i = extensions.indexOf(extension);
    if (i >= 0) extensions.splice(i, 1);
  };
}
/** @returns The main/worker schema and plugin contract; bump plugin versions when algorithms change. */
export function planningRuntimeSignature(): string {
  refreshLayoutRuleChoices();
  return JSON.stringify({
    version: 6,
    components: PLANNING_COMPONENTS.map(({ validate, fieldLimits, ...schema }) => schema),
    rules: layoutRuleManifest(),
    profiles: layoutProfileManifest(),
    extensions: extensions.map(({ id, version }) => ({ id, version: version ?? 1 }))
  });
}
/** @throws When the worker and main thread have different registered capabilities. */
export function assertPlanningRuntimeSignature(signature: string): void {
  if (signature !== planningRuntimeSignature()) throw Error("主线程与 Worker 的空间规则注册表不一致");
}
/** Materialize parameters for a selected spatial element without changing generated geometry. */
export function editableEntity(document: PlanningDocument, scene: SceneEntity, plan: IslandPlan): SpatialEntity {
  const entity = structuredClone(document.entities[scene.id] ?? { id: scene.id, name: scene.name, components: {} });
  if (entity.name === entity.id) entity.name = scene.name;
  for (const definition of PLANNING_COMPONENTS)
    if (planningComponentAppliesTo(definition, scene) && !entity.components[definition.type])
      entity.components[definition.type] = {
        values: {},
        ...(definition.global
          ? {
              base: {
                entity: "world",
                component: definition.type
              }
            }
          : {})
      };
  if (scene.kind === "poi") {
    const site = scene.components.poi,
      group = plan.spatialLayout?.groups.find((g) => g.id === scene.id);
    entity.components.layout = {
      ...entity.components.layout,
      base: entity.components.layout?.base ?? { entity: "world", component: "layout" },
      values: {
        ...(group?.rule ?? initialLayoutRule(plan.parameters.seed, site)),
        elementProfile: plan.spatialLayout?.elementProfiles?.[site.id],
        ...entity.components.layout?.values
      }
    };
    delete entity.components.layout.values.radiusM;
    delete entity.components.layout.values.roadAccess;
    delete entity.components.layout.values.spacingM;
    entity.components.anchor = {
      ...entity.components.anchor,
      values: { ...site.origin, ...entity.components.anchor?.values }
    };
    entity.components.poi = { ...entity.components.poi, values: { ...entity.components.poi?.values } };
  }
  if (scene.id === "world" && scene.components.distributionMetrics)
    entity.components.distribution = {
      ...entity.components.distribution,
      values: { ...entity.components.distribution?.values, ...scene.components.distributionMetrics }
    };
  const volume = scene.components.volume;
  if (scene.components.rockObb) {
    const box = scene.components.rockObb;
    entity.components.rockObb = {
      ...entity.components.rockObb,
      values: {
        width: box.sizeX,
        height: box.sizeY,
        depth: box.sizeZ,
        ...entity.components.rockObb?.values
      }
    };
  }
  const shape =
    volume?.boxes[0] ?? scene.components.landscapeElement ?? scene.components.rock ?? scene.components.building;
  if (shape)
    entity.components.solid = {
      ...entity.components.solid,
      values: {
        x: shape.center.x,
        z: shape.center.z,
        width: shape.width,
        depth: shape.depth,
        height: shape.height,
        yawDegrees: (shape.yaw * 180) / Math.PI,
        ...(volume
          ? {
              maxGroundSlopeDegrees:
                plan.spatialLayout?.groups.find((g) => g.id === volume.owner)?.rule.maxGroundSlopeDegrees ?? 90
            }
          : {}),
        ...entity.components.solid?.values
      }
    };
  if (scene.components.guidanceMember) entity.components.guidanceMember = { values: scene.components.guidanceMember };
  if (scene.kind === "route" && scene.components.route)
    entity.components.roadWidth = {
      ...entity.components.roadWidth,
      values: { widthM: scene.components.route.width, ...entity.components.roadWidth?.values }
    };
  if (scene.components.landscapeInfluence) entity.components.landscapeInfluence ??= { values: {} };
  if (scene.components.flowerInfluence) entity.components.flowerInfluence ??= { values: {} };
  if (scene.kind === "flowerRegion")
    entity.components.flowers = {
      ...entity.components.flowers,
      base: entity.components.flowers?.base ?? { entity: scene.components.flowerRegion.ownerId, component: "flowers" },
      values: entity.components.flowers?.values ?? {}
    };
  for (const type of ["layout", "solid", "anchor", "poi", "roadWidth"])
    if (
      document.entities[scene.id]?.components[type]?.base &&
      !(
        type === "layout" &&
        scene.kind === "poi" &&
        document.entities[scene.id].components[type].base!.entity === "world"
      )
    )
      entity.components[type] = structuredClone(document.entities[scene.id].components[type]);
  return entity;
}
/** Optional production stages; all modes preserve the same layout and author-water semantics. */
export interface PlanningGenerationOptions {
  /** Set false for initialization evaluation without ambient ecology and visual guidance. Defaults to true. */
  environment?: boolean;
}

/** Execute registered spatial rules; diagnostics cannot veto geometry or mutate it.
 * @param document Current author inputs, including native terrain and water resources.
 * @param previous Optional accepted result used for incremental computation.
 * @param scopedExtensions Additional non-blocking diagnostics for this execution.
 * @param progress Optional stage notifications.
 * @param options Optional production stages; initialization may omit environment generation.
 * @returns Generated world, checks and publication acceptance, using the canonical author-water pipeline.
 */
export function generatePlanningDocument(
  document: PlanningDocument,
  previous?: SemanticResult,
  scopedExtensions: readonly PlanningExtension[] = [],
  progress?: (stage: string) => void,
  options: PlanningGenerationOptions = {}
): SemanticResult {
  const result = generateWaterOverlay(document, previous, progress, planningRuntimeSignature(), options);
  const oldResources = new Map(previous?.plan.authoredResources?.map((resource) => [resource.resourceId, resource]));
  const nextResources = new Map(result.plan.authoredResources?.map((resource) => [resource.resourceId, resource]));
  for (const id of new Set([...oldResources.keys(), ...nextResources.keys()]))
    if (
      JSON.stringify(oldResources.get(id)) !== JSON.stringify(nextResources.get(id)) &&
      !result.changedIds.includes(id)
    )
      result.changedIds.push(id);
  for (const extension of [...extensions, ...scopedExtensions])
    result.checks.push(
      ...extension.run(structuredClone(document), structuredClone(result.plan)).map((c) => ({ ...c, required: false }))
    );
  return result;
}
export function materializeComponentBases(
  document: PlanningDocument,
  entityId: string,
  scene: PlanningScene,
  plan: IslandPlan,
  visiting = new Set<string>()
): void {
  if (visiting.has(entityId)) throw Error("参数来源循环：" + entityId);
  visiting.add(entityId);
  for (const component of Object.values(document.entities[entityId]?.components ?? {})) {
    if (!component.base) continue;
    const { entity: id, component: type } = component.base;
    if (!document.entities[id]?.components[type]) {
      const generated = scene.entities.get(id);
      if (!generated) throw Error("参数来源不存在：" + id);
      const available = editableEntity(document, generated, plan).components[type];
      if (!available) throw Error("来源组件不存在：" + id + ":" + type);
      document.entities[id] = {
        ...(document.entities[id] ?? { id, name: generated.name }),
        components: { ...document.entities[id]?.components, [type]: available }
      };
    }
    materializeComponentBases(document, id, scene, plan, visiting);
  }
  visiting.delete(entityId);
}
