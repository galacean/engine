import { buildingDesignKey, buildingSelectionKey } from "./BuildingDesignIdentity";
import type { RuntimePickVisitor } from "@galacean/engine-modify/rendering/runtime-pick-source";
import { isBuildingAuthor } from "./BuildingAuthorMarker";
import {
  Component,
  Entity,
  Matrix,
  MeshRenderer,
  PrefabResource,
  Transform,
  Vector3,
  type Camera
} from "@galacean/engine";
import { BuildingPartDraft } from "../BuildingParts";
import {
  buildingGeometryAlgorithms,
  retainBuildingResources,
  type BuildingAlgorithmContext,
  type BuildingInstanceOrigin
} from "../BuildingAlgorithms";
import { buildStaticBuildingBatch, canBatchBuildingRenderer } from "../BuildingBatch";
import { cross, type BuildingPose } from "../BuildingLayout";
import { buildingAssets } from "../../resources/BuildingAssetKit";
import { encodeCompleteConstructionDormerBins } from "../../runtime/DormerBins";
import { buildingGlobals, bytes } from "../../runtime/BuildingGlobals";
import { ConstructionPackageBuilder } from "../../runtime/ConstructionPackage";
import { EngineResidentScene } from "../../runtime/EngineResidentScene";
import { packConstructionUnits } from "../../runtime/ConstructionUnitRender";
import type { BuildingInstancePlacement } from "./BuildingInstancePlacement";
import type { BuildingBasePart } from "./BuildingDraft";

function poseMatrix(p: BuildingPose & { scale?: number[] }): Matrix {
  const z = cross(p.tangent, p.normal),
    s = p.scale ?? [1, 1, 1],
    m = new Matrix();
  m.elements.set([
    ...p.tangent.map((n) => n * s[0]),
    0,
    ...p.normal.map((n) => n * s[1]),
    0,
    ...z.map((n) => n * s[2]),
    0,
    ...p.position,
    1
  ]);
  return m;
}
const multiply = (a: Matrix, b: Matrix) => {
  const out = new Matrix();
  Matrix.multiply(a, b, out);
  return out;
};
/** Resources created while resolving supports and Units share the unpublished
 * output lifetime. The caller owns disposal until publication succeeds. */
export function buildingAlgorithmContext(entity: Entity, draft: BuildingPartDraft): BuildingAlgorithmContext {
  return { entity, cache: new Map(), own: (mesh) => draft.own(mesh) };
}
/** Materialize already-computed placements. Only native Unit hierarchy is
 * traversed; support and placement algorithms are never executed here. */
export async function renderInstanceParts(
  placementsByPart: readonly BuildingInstancePlacement[],
  options: { parent: Entity; camera: Camera; assets?: PrefabResource; signal: AbortSignal },
  draft: BuildingPartDraft,
  context: BuildingAlgorithmContext
) {
  const groups = new Map<string, Map<MeshRenderer, BuildingInstanceOrigin[]>>();
  const pickOwners = new Map<MeshRenderer, string>();
  const pickNode = (root: Entity, id: string) => {
    for (const renderer of root.getComponentsIncludeChildren(MeshRenderer, [])) pickOwners.set(renderer, id);
  };
  const focus: import("./BuildingPublication").BuildingFocusPose[] = [];
  const addFocus = (part: BuildingInstancePlacement["part"], positions: number[][]) => {
    if (part.identity.kind !== "author" || !positions.length) return;
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (const point of positions)
      for (let a = 0; a < 3; a++) {
        min[a] = Math.min(min[a], point[a]);
        max[a] = Math.max(max[a], point[a]);
      }
    if (min.every(Number.isFinite) && max.every(Number.isFinite))
      focus.push({ part: part.identity.id, position: min.map((v, a) => (v + max[a]) / 2) });
  };
  const parts = placementsByPart.map((p) => p.part);
  let count = 0,
    entityInstances = 0;
  const resolve = (unit: Exclude<BuildingBasePart["unit"], string>) => {
    if (unit instanceof Entity) return unit;
    if (unit instanceof PrefabResource) return unit._root;
    if ("libraryMesh" in unit) throw Error("Library mesh Units require their registered mesh placement algorithm");
    if ("nativeAttachment" in unit) throw Error("nativeAttachment Units require an attachmentMount support");
    if ("building" in unit && unit.building)
      throw Error("BuildingPartComponent does not support recursive Units; use a Prefab or flat parts");
    const node = draft.ownTemplate(new Entity(options.parent.engine, unit.name ?? "Unit"));
    if (unit.geometry) {
      const g = unit.geometry,
        r = node.addComponent(MeshRenderer);
      r.mesh = buildingGeometryAlgorithms.resolve(g.generator)(g.params ?? {}, context);
      if (!r.mesh || r.mesh.destroyed || r.mesh.engine !== options.parent.engine)
        throw Error("Geometry generator returned an invalid or foreign mesh");
      if (g.materials.some((m) => m && (m.destroyed || m.engine !== options.parent.engine)))
        throw Error("Unit materials are destroyed or belong to another engine");
      r.setMaterials(g.materials);
    }
    return node;
  };
  const staticNode = (n: Entity): boolean =>
    n.getComponents(Component, []).every((c) => c.constructor === Transform || c.constructor === MeshRenderer) &&
    n.getComponents(MeshRenderer, []).every(canBatchBuildingRenderer) &&
    n.children.every(staticNode);
  const append = (node: Entity, parent: Matrix, path: string, owner: string) => {
    if (!node.isActive) return;
    const matrix = multiply(parent, node.transform.localMatrix);
    for (const r of node.getComponents(MeshRenderer, [])) {
      if (!r.enabled) continue;
      const group = groups.get(owner) ?? new Map<MeshRenderer, BuildingInstanceOrigin[]>();
      const entries = group.get(r) ?? [];
      entries.push({ path, matrix });
      group.set(r, entries);
      groups.set(owner, group);
    }
    node.children.forEach((n, i) => append(n, matrix, path + "/" + i, owner));
  };
  retainBuildingResources(parts, 1);
  draft.ownDisposable({ destroy: () => retainBuildingResources(parts, -1) });
  try {
    for (const { part, group, placements } of placementsByPart) {
      options.signal.throwIfAborted();
      const id = buildingDesignKey(part.identity);
      // Appearance has its own stable input; it must not change when execution identity is encoded.
      const variation = part.params.variationKey ?? (part.identity.kind === "author" ? part.identity.id : id);
      const selection = buildingSelectionKey(part.selection);
      const base = new Matrix();
      if (part.transform) base.elements.set(part.transform);
      if (!Array.isArray(placements) && "kind" in placements) {
        if (typeof part.unit === "string") throw Error("Custom packed algorithms require an explicit Unit prefab");
        const unit = resolve(part.unit);
        if (!unit || unit.destroyed || unit.engine !== options.parent.engine) throw Error("Invalid Unit");
        if (unit.getComponentsIncludeChildren(Component, []).some(isBuildingAuthor))
          throw Error(
            "A Unit cannot contain building author components (Group or Part); pass them to design as flat parts"
          );
        const root = draft.root.createChild(id);
        root.transform.localMatrix = multiply(base, unit.transform.localMatrix);
        const result = await placements.build(unit, {
          parent: root,
          camera: options.camera,
          scene: options.parent.scene!,
          signal: options.signal,
          limit: 100000 - count,
          own: (r) => draft.ownDisposable(r)
        });
        if (!Number.isSafeInteger(result.count) || result.count < 0 || count + result.count > 100000)
          throw Error("Building unit budget exceeded or invalid packed result count");
        count += result.count;
        pickNode(root, selection);
        const inverse = new Matrix();
        Matrix.invert(options.parent.transform.worldMatrix, inverse);
        const points: number[][] = [];
        for (const renderer of root.getComponentsIncludeChildren(MeshRenderer, [])) {
          const box = renderer.bounds;
          for (let bits = 0; bits < 8; bits++) {
            const point = new Vector3(
              bits & 1 ? box.max.x : box.min.x,
              bits & 2 ? box.max.y : box.min.y,
              bits & 4 ? box.max.z : box.min.z
            );
            Vector3.transformCoordinate(point, inverse, point);
            points.push([point.x, point.y, point.z]);
          }
        }
        addFocus(part, points);
        continue;
      }
      const poses = placements as readonly (BuildingPose & { scale?: number[] })[];
      addFocus(
        part,
        poses.map((pose) => {
          const point = new Vector3(...pose.position);
          Vector3.transformCoordinate(point, base, point);
          return [point.x, point.y, point.z];
        })
      );
      count += poses.length;
      if (count > 100000) throw Error("Building unit budget exceeded");
      if (typeof part.unit === "string") {
        const cells = poses.map((p, i) => ({
          id: id + "/" + i,
          logical_id: id + "/" + i,
          seed_id: variation + "/" + i,
          surface_id: id,
          center: p.position,
          tangent: p.tangent,
          bitangent: p.normal,
          normal: cross(p.tangent, p.normal),
          size: p.scale ?? [1, 1, 1],
          anchor_uv: [0, 0]
        }));
        const units = await packConstructionUnits({ cells, slot: 0, role: "enclosure" });
        if (!options.assets) throw Error("Asset-library Units require BuildingManager.assets");
        const library = buildingAssets(options.assets);
        if (group.wallColor > 12 || group.woodColor > 10) throw Error("Color outside native building palette");
        // Generic units have no roof apertures. Use the same native bin layout,
        // rather than omitting buffers required by the roof material.
        const apertures = part.unit === "roof_tile" ? encodeCompleteConstructionDormerBins([]) : undefined;
        const builder = new ConstructionPackageBuilder(library, {
          ...buildingGlobals([{ ...group, roofColor: part.appearance?.roofColor ?? 0 }], library.frame),
          ...(apertures ? { roofCounts: bytes(apertures.counts), roofHoles: apertures.holes } : {})
        });
        builder.addDraw({
          id,
          ownerId: part.group,
          template: part.unit === "brick" ? "brick" : part.unit === "roof_tile" ? "roof" : "wood",
          instances: units[part.unit]
        });
        const built = builder.build();
        built.package.whiteBase = true;
        const runtime = new EngineResidentScene(options.parent.engine, draft.root, built.asset);
        draft.ownDisposable(runtime);
        await runtime.load(built.package);
        runtime.root.transform.localMatrix = base;
        runtime.bindCamera(options.camera);
        pickNode(runtime.root, selection);
        continue;
      }
      const unit = resolve(part.unit);
      if (!unit || unit.destroyed || unit.engine !== options.parent.engine) throw Error("Invalid or foreign Unit");
      if (unit.getComponentsIncludeChildren(Component, []).some(isBuildingAuthor))
        throw Error(
          "A Unit cannot contain building author components (Group or Part); pass them to design as flat parts"
        );
      const batch = staticNode(unit);
      poses.forEach((pose, i) => {
        const matrix = multiply(base, poseMatrix(pose));
        if (batch) append(unit, matrix, id + "/" + i, selection);
        else {
          const wrapper = draft.root.createChild(id + "/" + i);
          wrapper.transform.localMatrix = matrix;
          wrapper.addChild(unit.clone());
          pickNode(wrapper, selection);
          entityInstances++;
        }
      });
    }
    for (const [id, group] of groups)
      for (const [renderer, instances] of group) {
        const batch = buildStaticBuildingBatch(draft, renderer, instances, 2000000);
        pickOwners.set(batch.renderer, id);
      }
    options.signal.throwIfAborted();
    return {
      draft,
      focus,
      count,
      entityInstances,
      visitPickBatches(visitor: RuntimePickVisitor) {
        for (const [renderer, id] of pickOwners)
          if (renderer.enabled && renderer.entity.isActiveInHierarchy)
            visitor({ renderer, count: 1, resolve: () => id });
      },
      destroy: () => draft.dispose()
    };
  } catch (error) {
    draft.dispose();
    throw error;
  }
}
