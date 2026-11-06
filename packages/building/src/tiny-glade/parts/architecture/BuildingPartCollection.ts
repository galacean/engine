import { isGeneratedBuildingOutput, isInGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { buildingPartKey, buildingGroupKey } from "../../runtime/BuildingObjectIdentity";
import { attachmentFrameDefinition } from "./BuildingAttachmentFrame";
import { buildingWorkerAlgorithmIssue } from "./BuildingExecution";
import { Matrix, Entity, ReferResource, type PrefabResource, type Component } from "@galacean/engine";
import { BuildingGroupComponent } from "./BuildingGroupComponent";
import { BuildingPartComponent } from "./BuildingPartComponent";
import { profileSupportGenerators, validateBuildingDraft, type BuildingDraft } from "./BuildingDraft";
import type { BuildingRuntimeInput } from "./BuildingRuntime";
import type { ConstructionTerrainSource } from "../../runtime/TerrainField";
import type { BuildingPlacementFrame } from "./BuildingTerrain";
import { profileSupportRegion } from "./BuildingProfileTerrain";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import { transformProfileFootprint } from "../../runtime/ProfileGeometry";

/** Native ownership is independent of enabled/isActive and is never a runtime registry. */
export function authoredBuildingMembers(root: Entity): (BuildingGroupComponent | BuildingPartComponent)[] {
  const members: (BuildingGroupComponent | BuildingPartComponent)[] = [];
  if (isInGeneratedBuildingOutput(root)) return members;
  const visit = (entity: Entity) => {
    if (isGeneratedBuildingOutput(entity)) return;
    members.push(
      ...entity.getComponents(BuildingGroupComponent, []),
      ...entity.getComponents(BuildingPartComponent, [])
    );
    for (const child of entity.children) visit(child);
  };
  visit(root);
  return members;
}

export function partFrame(part: BuildingPartComponent | BuildingGroupComponent): Entity {
  const frame = part.frame ?? part.entity.parent ?? part.entity;
  if (frame.destroyed || frame.scene !== part.entity.scene)
    throw Error("Building frame must belong to the active scene");
  return frame;
}
/** Compose local matrices in hierarchy order, without subtracting world coordinates. */
export function partFrameMatrix(entity: Entity, frame: Entity): Matrix {
  const chain: Entity[] = [];
  let node: Entity | null = entity;
  while (node && node !== frame) {
    chain.push(node);
    node = node.parent;
  }
  if (!node) throw Error("Building frame must be the part Entity or an ancestor");
  const result = new Matrix();
  for (let i = chain.length - 1; i >= 0; i--) Matrix.multiply(result, chain[i].transform.localMatrix, result);
  return result;
}
/** Bind from the compilation frame back through authored node frames. Invert
 * each local transform before composition, so a mount's inverse does not gain
 * rounding from first baking it into its rotated parent. */
export function partFrameInverse(entity: Entity, frame: Entity): Matrix {
  const result = new Matrix(),
    inverse = new Matrix();
  let node: Entity | null = entity;
  while (node && node !== frame) {
    Matrix.invert(node.transform.localMatrix, inverse);
    Matrix.multiply(result, inverse, result);
    node = node.parent;
  }
  if (!node) throw Error("Building frame must be the part Entity or an ancestor");
  return result;
}
export function horizontalFrame(matrix: Matrix): BuildingPlacementFrame {
  const m = matrix.elements,
    close = (a: number, b: number) => Math.abs(a - b) < 1e-5;
  if (
    !Array.from(m).every(Number.isFinite) ||
    ![1, 3, 4, 6, 7, 9, 11, 13].every((i) => close(m[i], 0)) ||
    !close(m[5], 1) ||
    !close(m[15], 1) ||
    !close(m[0], m[10]) ||
    !close(m[2], -m[8]) ||
    !close(m[0] * m[0] + m[2] * m[2], 1)
  )
    throw Error("Profile parts require a horizontal rigid frame at Y zero");
  return { position: [m[12], 0, m[14]], rotationY: Math.atan2(m[8], m[0]) };
}
export function validatePartCollection(members: Iterable<Component>) {
  const frames = new Map<Entity, { groups: BuildingGroupComponent[]; parts: BuildingPartComponent[] }>();
  for (const member of members) {
    if (!(member instanceof BuildingPartComponent) && !(member instanceof BuildingGroupComponent))
      throw Error("Building runtime requires a group or part component");
    if (!member.definition) continue;
    const frame = partFrame(member),
      entry = frames.get(frame) ?? { groups: [], parts: [] };
    if (member instanceof BuildingGroupComponent) entry.groups.push(member);
    else entry.parts.push(member);
    frames.set(frame, entry);
  }
  for (const { groups, parts } of frames.values())
    validateBuildingDraft({
      groups: groups.map((g) => g.definition!),
      parts: parts.map((p) => p.definition!),
      relations: parts.flatMap((p) => p.relations)
    });
}
/** Native references contribute identities, not mutable engine object graphs. */
export function buildingInputSignature(value: unknown): string {
  return JSON.stringify(value, (_key, value) =>
    value instanceof Entity || value instanceof ReferResource
      ? { nativeType: value.constructor.name, instanceId: value.instanceId, destroyed: value.destroyed }
      : value
  );
}
/** Native frames, flat component definitions and resource references are the only author inputs. */
export function collectBuildingParts(
  frame: Entity,
  bodies: Component[],
  members: Iterable<Component>,
  terrain: ConstructionTerrainSource | undefined,
  defaultLibrary?: PrefabResource,
  terrainHeight?: TerrainHeight
): BuildingRuntimeInput {
  const primary = bodies as BuildingGroupComponent[];
  const activeGroups = new Set(primary.map((g) => g.definition!.id));
  const parts = [...members]
    .filter(
      (p): p is BuildingPartComponent =>
        p instanceof BuildingPartComponent &&
        !!p.definition &&
        partFrame(p) === frame &&
        activeGroups.has(p.definition.group)
    )
    .sort((a, b) => a.definition!.group.localeCompare(b.definition!.group));
  const activeParts = new Set(parts.map((p) => p.definition!.id));
  const libraries = primary.map((p) => p.assetLibrary ?? defaultLibrary).filter((v): v is PrefabResource => !!v);
  const assets = libraries[0];
  if (libraries.some((l) => l !== assets || l.destroyed || l.engine !== frame.engine))
    throw Error("A compiled frame requires one live native material library");
  const draft: BuildingDraft = {
    groups: primary.map((p) => p.definition!).sort((a, b) => a.id.localeCompare(b.id)),
    parts: [],
    relations: []
  };
  const bindings: BuildingRuntimeInput["bindings"] = new Map(),
    matrices = new Map<string, string>();
  let hasProfile = false,
    worker = !terrainHeight;
  for (const p of parts) {
    const attachment =
      p.definition!.support.generator === "attachmentMount" ? attachmentFrameDefinition(p, parts) : undefined;
    const d = attachment?.definition ?? p.definition!,
      matrix = partFrameMatrix(attachment?.host.entity ?? p.entity, frame),
      m = matrix.elements;
    if (profileSupportGenerators.has(d.support.generator)) {
      hasProfile = true;
      horizontalFrame(matrix);
      const signature = Array.from(m).join(","),
        previous = matrices.get(d.group);
      if (previous !== undefined && previous !== signature)
        throw Error("Connected profile parts share a group frame; move the group or edit support geometry");
      matrices.set(d.group, signature);
      Object.assign(d.support.params, transformProfileFootprint(d.support.params, m));
      if (d.transform || (typeof d.unit !== "string" && !(d.unit && "nativeAttachment" in d.unit))) worker = false;
    } else {
      worker = false;
      if (d.transform) {
        const local = new Matrix();
        local.elements.set(d.transform);
        Matrix.multiply(matrix, local, matrix);
      }
      d.transform = Array.from(matrix.elements);
    }
    draft.parts.push(d);
    // Author relations remain intact. The execution graph contains only active endpoints.
    draft.relations.push(...p.relations.filter((r) => activeParts.has(r.from.part) && activeParts.has(r.to.part)));
    const inverse = partFrameInverse(p.entity, frame);
    bindings.set(buildingPartKey(d.id), { member: p, inverse: Array.from(inverse.elements) });
  }
  for (const group of primary) {
    const inverse = partFrameInverse(group.entity, frame);
    bindings.set(buildingGroupKey(group.definition!.id), { member: group, inverse: Array.from(inverse.elements) });
  }
  validateBuildingDraft(draft);
  if (hasProfile && !assets) throw Error("Profile parts require a native material library");
  const worldFrame = terrain && hasProfile ? frame.transform.worldMatrix.clone() : undefined;
  const placement = worldFrame
    ? horizontalFrame(worldFrame)
    : { position: [0, 0, 0] as [number, number, number], rotationY: 0 };
  const region = hasProfile ? profileSupportRegion(draft) : [0, 0, 0, 0];
  const extent = Math.max(1, ...region.map(Math.abs)) + 2;
  const ground = terrain ?? {
    revision: 0,
    grid: {
      samples: new Uint16Array(4),
      resolution: 2,
      origin: [-extent, -extent] as [number, number],
      size: 2 * extent,
      decode: { offset: 0, scale: 1 }
    }
  };
  const groupIds = new Map(bodies.map((b) => [b, (b as BuildingGroupComponent).definition!.id]));
  const execution = hasProfile && worker && !buildingWorkerAlgorithmIssue(draft) ? "worker" : "main";
  return {
    assets,
    draft,
    execution,
    terrainHeight,
    placement,
    bindings,
    bodies,
    groupIds,
    terrain: ground,
    worldFrame,
    signature: buildingInputSignature([
      assets?.instanceId,
      draft,
      execution,
      placement,
      [...bindings].map(([key, value]) => [key, value.inverse]),
      ground.revision,
      parts.map((p) => [p.definition!.id, p.inputRevision])
    ])
  };
}
