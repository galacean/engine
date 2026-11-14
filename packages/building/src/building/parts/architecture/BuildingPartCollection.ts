import { isGeneratedBuildingOutput, isInGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { buildingPartKey, buildingGroupKey } from "../../runtime/BuildingObjectIdentity";
import { Matrix, Entity, ReferResource, type PrefabResource, type Component } from "@galacean/engine";
import { BuildingGroupComponent } from "./BuildingGroupComponent";
import { BuildingPartComponent } from "./BuildingPartComponent";
import { validateBuildingDraft } from "./BuildingCpu";
import type { BuildingGroupDef, BuildingPartDef, ConnectionDef } from "../../core";
import { buildingDraftRegion, placeBuildingGroup } from "../../partTypes";
import type { BuildingRuntimeInput } from "./BuildingRuntime";
import type { ConstructionTerrainSource } from "../../runtime/TerrainField";
import type { BuildingPlacementFrame } from "./BuildingTerrain";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";

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
      connections: parts.flatMap((p) => p.connections)
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
/** The parts a connection names. */
export function connectionParts(connection: ConnectionDef): string[] {
  return connection.kind === "attach"
    ? [connection.guest, ...connection.hosts.map((h) => h.part)]
    : [...connection.parts];
}
const identity = (m: Matrix) => Array.from(m.elements).every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-9);
/** Native frames, flat component definitions and the asset kit are the only author inputs.
 * Each group's node places its group in the frame: a horizontal rigid move of its
 * footprints. Parts stay where their group is. */
export function collectBuildingParts(
  frame: Entity,
  bodies: Component[],
  members: Iterable<Component>,
  terrain: ConstructionTerrainSource | undefined,
  defaultLibrary?: PrefabResource,
  terrainHeight?: TerrainHeight
): BuildingRuntimeInput {
  const primary = (bodies as BuildingGroupComponent[])
    .slice()
    .sort((a, b) => a.definition!.id.localeCompare(b.definition!.id));
  const activeGroups = new Set(primary.map((g) => g.definition!.id));
  const parts = [...members]
    .filter(
      (p): p is BuildingPartComponent =>
        p instanceof BuildingPartComponent &&
        !!p.definition &&
        partFrame(p) === frame &&
        activeGroups.has(p.definition.group)
    )
    .sort((a, b) => a.definition!.id.localeCompare(b.definition!.id));
  const activeParts = new Set(parts.map((p) => p.definition!.id));
  const libraries = primary.map((p) => p.assetLibrary ?? defaultLibrary).filter((v): v is PrefabResource => !!v);
  const assets = libraries[0];
  if (libraries.some((l) => l !== assets || l.destroyed || l.engine !== frame.engine))
    throw Error("A compiled frame requires one live native material library");
  const draft: { groups: BuildingGroupDef[]; parts: BuildingPartDef[]; connections: ConnectionDef[] } = {
    groups: [],
    parts: [],
    connections: []
  };
  const bindings: BuildingRuntimeInput["bindings"] = new Map();
  for (const group of primary) {
    const own = parts.filter((p) => p.definition!.group === group.definition!.id);
    const matrix = partFrameMatrix(group.entity, frame);
    horizontalFrame(matrix);
    for (const part of own)
      if (part.entity !== group.entity && !identity(partFrameMatrix(part.entity, group.entity)))
        throw Error(`Move the group "${group.definition!.id}", not its part "${part.definition!.id}"`);
    const placed = placeBuildingGroup(
      group.definition!,
      own.map((p) => p.definition!),
      matrix.elements
    );
    draft.groups.push(placed.group);
    draft.parts.push(...placed.parts);
    bindings.set(buildingGroupKey(group.definition!.id), {
      member: group,
      inverse: Array.from(partFrameInverse(group.entity, frame).elements)
    });
    for (const part of own)
      bindings.set(buildingPartKey(part.definition!.id), {
        member: part,
        inverse: Array.from(partFrameInverse(part.entity, frame).elements)
      });
  }
  // Author connections stay intact; the design gets those whose parts are all active.
  for (const part of parts)
    draft.connections.push(...part.connections.filter((c) => connectionParts(c).every((id) => activeParts.has(id))));
  validateBuildingDraft(draft);
  if (draft.parts.length && !assets) throw Error("Building parts require a native material library");
  const worldFrame = terrain && draft.parts.length ? frame.transform.worldMatrix.clone() : undefined;
  const placement = worldFrame
    ? horizontalFrame(worldFrame)
    : { position: [0, 0, 0] as [number, number, number], rotationY: 0 };
  const region = buildingDraftRegion(draft) ?? [0, 0, 0, 0];
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
  // A height function lives on the main thread; terrain grids travel to the Worker.
  const execution = terrainHeight ? "main" : "worker";
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
