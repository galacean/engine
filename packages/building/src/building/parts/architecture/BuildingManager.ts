import { isInGeneratedBuildingOutput } from "../BuildingGeneratedOutput";
import { planBuildingRemoval } from "./BuildingRemoval";
import { buildingPartKey, buildingGroupKey } from "../../runtime/BuildingObjectIdentity";
import { Entity, Component, Vector3, type Camera, type PrefabResource, type Scene } from "@galacean/engine";
import { retainBuildingResource } from "../../resources/BuildingAssetKit";
import type { TerrainHeight } from "../../runtime/PublishedWallProfile";
import type { ConstructionTerrainSource } from "../../runtime/TerrainField";
import { BuildingGroupComponent } from "./BuildingGroupComponent";
import { BuildingPartComponent } from "./BuildingPartComponent";
import { validateBuildingDraft } from "./BuildingCpu";
import type { BuildingCoreDraft, BuildingPartDef, ConnectionDef } from "../../core";
import { placeBuildingGroup } from "../../partTypes";
import { BuildingRuntime, buildingInstanceKey } from "./BuildingRuntime";
import {
  authoredBuildingMembers,
  collectBuildingParts,
  horizontalFrame,
  partFrame,
  validatePartCollection
} from "./BuildingPartCollection";
const managers = new WeakMap<Scene, BuildingManager>();
/** The part that stores a connection: the guest of an attach, the first part of a join. */
const connectionStart = (c: ConnectionDef) => (c.kind === "attach" ? c.guest : c.parts[0]);
const flatTerrain: TerrainHeight = () => 0;

/** Public CRUD and author identity. One shared runtime owns group publication,
 * Worker/main-thread execution, residency, picking and terrain transactions. */
export class BuildingManager extends BuildingRuntime {
  private ownerScene?: Scene;
  private library?: PrefabResource;
  private activeCamera?: Camera;
  private customTerrain?: TerrainHeight;
  private terrainVersion = 0;
  private indexDirty = true;
  private readonly identities = new Map<string, BuildingPartComponent | BuildingGroupComponent>();
  static existing(scene: Scene) {
    return managers.get(scene);
  }
  static forScene(scene: Scene): BuildingManager {
    let manager = managers.get(scene);
    if (!manager) {
      manager = scene.createRootEntity("Building manager").addComponent(BuildingManager);
      manager.ownerScene = scene;
      managers.set(scene, manager);
      const collect = (entity: Entity) => {
        if (!entity.isActive || isInGeneratedBuildingOutput(entity)) return;
        for (const group of entity.getComponents(BuildingGroupComponent, []))
          if (group.enabled) manager!.register(group);
        for (const part of entity.getComponents(BuildingPartComponent, [])) if (part.enabled) manager!.register(part);
        for (const child of entity.children) collect(child);
      };
      for (const root of scene.rootEntities) collect(root);
    }
    return manager;
  }
  get camera() {
    return this.activeCamera;
  }
  set camera(value: Camera | undefined) {
    if (value === this.activeCamera) return;
    if (!value) throw Error("Building camera cannot be cleared while the manager is alive");
    this.bind({ camera: value, terrain: this.terrainSource });
  }
  get assets() {
    return this.library;
  }
  set assets(value: PrefabResource | undefined) {
    if (value === this.library) return;
    if (value && (value.destroyed || value.engine !== this.engine))
      throw Error("Building assets belong to another engine or are destroyed");
    retainBuildingResource(value ?? null, 1);
    retainBuildingResource(this.library ?? null, -1);
    this.library = value;
    this.invalidate();
  }
  /** Function terrain is an explicit main-thread algorithm input. Published
   * world terrain uses bind/prepareTerrain and remains transferable to Worker. */
  get terrain(): TerrainHeight {
    return this.customTerrain ?? flatTerrain;
  }
  set terrain(value: TerrainHeight) {
    if (typeof value !== "function") throw Error("Building terrain requires a height sampler");
    this.customTerrain = value;
    this.terrainVersion++;
    this.invalidate();
  }
  override bind(options: { camera: Camera; terrain?: ConstructionTerrainSource }): void {
    if (options.camera.destroyed || options.camera.engine !== this.engine) throw Error("Invalid building camera");
    this.activeCamera = options.camera;
    super.bind({
      camera: options.camera,
      terrain: options.terrain,
      frame: (part) => partFrame(part as BuildingPartComponent | BuildingGroupComponent),
      isBody: (part) => part instanceof BuildingGroupComponent && !!part.definition,
      kinds: (groups) => {
        // Rebuild only this small per-read index, so diagnostics reflect edits,
        // activation and reparenting without a second invalidation lifecycle.
        // Only primitive classification fields are needed; keep the public
        // definition getter's owned-copy contract out of this diagnostic path.
        const types = new Map<Entity, Map<string, string>>();
        for (const part of this.list()) {
          const groupId = part._groupId,
            type = part._partType;
          if (groupId === undefined || type === undefined) continue;
          const frame = partFrame(part);
          let frameTypes = types.get(frame);
          if (!frameTypes) types.set(frame, (frameTypes = new Map()));
          const previous = frameTypes.get(groupId);
          // Walls take precedence; otherwise retain the original lexical minimum.
          if (previous !== "wall" && (type === "wall" || previous === undefined || type < previous))
            frameTypes.set(groupId, type);
        }
        return groups.map((owner) => {
          const group = owner as BuildingGroupComponent,
            groupId = group._groupId;
          const type = groupId === undefined ? undefined : types.get(partFrame(group))?.get(groupId);
          return type === "wall" ? "house" : (type ?? "");
        });
      },
      groupIdentity: (part) =>
        buildingInstanceKey(
          partFrame(part as BuildingPartComponent | BuildingGroupComponent),
          buildingGroupKey((part as BuildingGroupComponent).definition!.id)
        ),
      resolve: (id) => this.findIdentity(id),
      validate: () => validatePartCollection(this.entity.scene!.rootEntities.flatMap(authoredBuildingMembers)),
      collect: (frame, bodies, members, terrain) => {
        const input = collectBuildingParts(frame, bodies, members, terrain, this.library, this.customTerrain);
        input.signature += "/terrain:" + this.terrainVersion;
        return input;
      }
    });
  }
  register(part: BuildingPartComponent | BuildingGroupComponent) {
    if (!isInGeneratedBuildingOutput(part.entity)) this.add(part);
  }
  unregister(part: BuildingPartComponent | BuildingGroupComponent) {
    if (this.members.has(part)) super.removeMember(part);
  }
  override invalidate() {
    this.indexDirty = true;
    super.invalidate();
  }
  list(): BuildingPartComponent[] {
    return [...this.members.keys()].filter((p): p is BuildingPartComponent => p instanceof BuildingPartComponent);
  }
  listGroups(): BuildingGroupComponent[] {
    return [...this.members.keys()].filter((p): p is BuildingGroupComponent => p instanceof BuildingGroupComponent);
  }
  groupFor(part: BuildingPartComponent): BuildingGroupComponent {
    if (part.destroyed || part.entity.scene !== this.entity.scene || isInGeneratedBuildingOutput(part.entity))
      throw Error("Unmanaged building part");
    const group = authoredBuildingMembers(partFrame(part)).find(
      (g): g is BuildingGroupComponent =>
        g instanceof BuildingGroupComponent &&
        partFrame(g) === partFrame(part) &&
        g.definition?.id === part.definition?.group
    );
    if (!group) throw Error("Missing building group owner");
    return group;
  }
  override groupEntity(member: Component): Entity {
    if (
      member.destroyed ||
      isInGeneratedBuildingOutput(member.entity) ||
      member.entity.scene !== this.entity.scene ||
      !(member instanceof BuildingGroupComponent || member instanceof BuildingPartComponent)
    )
      throw Error("Unmanaged building member");
    return member instanceof BuildingGroupComponent
      ? member.entity
      : this.groupFor(member as BuildingPartComponent).entity;
  }
  /** Author IDs are local to their native compilation frame. */
  get(id: string, frame: Entity) {
    if (frame.destroyed || frame.scene !== this.entity.scene) return;
    return authoredBuildingMembers(frame).find(
      (p): p is BuildingPartComponent =>
        p instanceof BuildingPartComponent && partFrame(p) === frame && p.definition?.id === id
    );
  }
  /** Read the accepted render snapshot. Pending/failed edits never invent a
   * new camera target from author input that has not been published. */
  partView(part: BuildingPartComponent): { position: Vector3; forward?: Vector3 } | undefined {
    if (!this.members.has(part)) return;
    const pose = this.views.get(partFrame(part))?.focus.get(part);
    if (!pose || pose.entity.destroyed) return;
    const position = pose.position.clone(),
      forward = pose.forward?.clone();
    Vector3.transformCoordinate(position, pose.entity.transform.worldMatrix, position);
    if (forward) {
      Vector3.transformNormal(forward, pose.entity.transform.worldMatrix, forward);
      forward.normalize();
    }
    return { position, forward };
  }
  private findIdentity(id: string) {
    if (this.indexDirty) {
      this.identities.clear();
      const groups = this.listGroups();
      const activeGroups = new Set(
        groups.filter((g) => g.definition).map((g) => buildingInstanceKey(partFrame(g), g.definition!.id))
      );
      for (const member of [
        ...groups,
        ...this.list().filter(
          (p) => !!p.definition && activeGroups.has(buildingInstanceKey(partFrame(p), p.definition.group))
        )
      ]) {
        const definition = member.definition;
        if (!definition) continue;
        const localId =
          member instanceof BuildingGroupComponent ? buildingGroupKey(definition.id) : buildingPartKey(definition.id);
        const key = buildingInstanceKey(partFrame(member), localId);
        if (this.identities.has(key)) throw Error("Ambiguous building identity: " + key);
        this.identities.set(key, member);
      }
      this.indexDirty = false;
    }
    return this.identities.get(id);
  }
  create(parent: Entity, draft: BuildingCoreDraft): Entity {
    if (parent.destroyed || parent.scene !== this.entity.scene)
      throw Error("Building parent belongs to another scene or is destroyed");
    if (isInGeneratedBuildingOutput(parent)) throw Error("Cannot create author buildings under generated output");
    validateBuildingDraft(draft);
    const root = new Entity(this.engine, "Building");
    try {
      const groups = new Map<string, Entity>();
      for (const definition of draft.groups) {
        const node = root.createChild(definition.id),
          group = node.addComponent(BuildingGroupComponent);
        group.frame = root;
        group.definition = definition;
        group.assetLibrary = this.library ?? null;
        groups.set(definition.id, node);
      }
      for (const definition of draft.parts) {
        const part = groups.get(definition.group)!.createChild(definition.id).addComponent(BuildingPartComponent);
        part.frame = root;
        part.definition = definition;
        part.connections = (draft.connections ?? []).filter((c) => connectionStart(c) === definition.id);
      }
      parent.addChild(root);
      return root;
    } catch (error) {
      root.destroy();
      throw error;
    }
  }
  update(part: BuildingPartComponent, definition: NonNullable<BuildingPartComponent["definition"]>) {
    if (part.destroyed || part.entity.scene !== this.entity.scene || isInGeneratedBuildingOutput(part.entity))
      throw Error("Unmanaged building part");
    part.definition = definition;
  }
  /** Delete author members and their incoming/outgoing relations. Structural parts remove
   * their group, as in the editor. Component disablement uses unregister. */
  remove(target: Entity | BuildingPartComponent | BuildingGroupComponent) {
    if (
      !(target instanceof Entity || target instanceof BuildingPartComponent || target instanceof BuildingGroupComponent)
    )
      throw Error("Removal requires a building Entity, Group or Part");
    const entity = target instanceof Entity ? target : target.entity;
    if (target.destroyed || entity.scene !== this.entity.scene || isInGeneratedBuildingOutput(entity))
      throw Error("Entity does not own building components in this Scene");
    const requested = target instanceof Entity ? authoredBuildingMembers(target) : [target];
    if (!requested.length) throw Error("Entity does not own building components in this Scene");
    const members = [...new Set(requested.map(partFrame))].flatMap((frame) =>
      authoredBuildingMembers(frame).filter((member) => partFrame(member) === frame)
    );
    const plan = planBuildingRemoval(members, requested);
    for (const [part, connections] of plan.connections) part.connections = connections;
    for (const member of plan.targets) if (!member.destroyed) member.destroy();
    if (target instanceof Entity) target.destroy();
  }
  /** World-space authored snapshot for inspection/export: each group placed by its node's
   * world transform. Generated geometry is absent. */
  snapshot(frame: Entity): BuildingCoreDraft {
    if (frame.destroyed || frame.scene !== this.entity.scene || isInGeneratedBuildingOutput(frame))
      throw Error("Building frame is not an authored frame in this scene");
    const authored = authoredBuildingMembers(frame).filter((p) => partFrame(p) === frame);
    const parts = authored.filter((p): p is BuildingPartComponent => p instanceof BuildingPartComponent);
    const draft: {
      groups: BuildingCoreDraft["groups"][number][];
      parts: BuildingPartDef[];
      connections: ConnectionDef[];
    } = {
      groups: [],
      parts: [],
      connections: parts.flatMap((p) => p.connections)
    };
    for (const group of authored.filter((g): g is BuildingGroupComponent => g instanceof BuildingGroupComponent)) {
      if (!group.definition) continue;
      const world = group.entity.transform.worldMatrix;
      horizontalFrame(world);
      const placed = placeBuildingGroup(
        group.definition,
        parts.flatMap((p) => (p.definition?.group === group.definition!.id ? [p.definition] : [])),
        world.elements
      );
      draft.groups.push(placed.group);
      draft.parts.push(...placed.parts);
    }
    return draft;
  }
  flushAsync() {
    return this.flush();
  }
  override metrics() {
    return { ...super.metrics(), ...this.placementMetrics() };
  }
  override onDestroy() {
    super.onDestroy();
    retainBuildingResource(this.library ?? null, -1);
    this.library = undefined;
    this.identities.clear();
    if (this.ownerScene && managers.get(this.ownerScene) === this) managers.delete(this.ownerScene);
  }
}
