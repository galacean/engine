import { Component, Entity, Loader } from "@galacean/engine";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";
import type { RuntimeComponentIdentity } from "./runtime-component-identity";
import { RuntimeInstanceSource } from "./runtime-instance-source";

/** Derived identities of linked Prefab members. Authoring stays in native instance overrides. */
export class RuntimeInstanceIdentities {
  readonly entities = new Map<string, Entity>();
  readonly components = new Map<string, Component>();
  readonly records = new Map<string, GalaceanSourceComponentSchema>();
  readonly identities: RuntimeComponentIdentity[] = [];

  constructor(
    source: GalaceanSourceSceneFile,
    scene: string,
    pack: RuntimeProjectPackage,
    resolve: (id: string) => Entity | undefined
  ) {
    const members = new RuntimeInstanceSource(source, pack);
    for (const member of members.entities.values()) {
      let entity = resolve(member.root);
      for (const index of member.path) entity = entity?.children[index];
      if (!entity || entity.destroyed) throw Error(`Cannot bind Prefab entity '${member.id}'`);
      this.entities.set(member.id, entity);
    }
    const claimed = new Map<Entity, Set<Component>>();
    for (const { id, entityId, record } of members.components.values()) {
      const entity = this.entities.get(entityId)!;
      const type = Loader.getClass(record.type === "Script" ? record.script!.$ref : record.type);
      const used = claimed.get(entity) ?? new Set<Component>();
      const live = entity.getComponents(Component, []).find((value) => value.constructor === type && !used.has(value));
      if (!live) throw Error(`Cannot bind Prefab component '${id}'`);
      used.add(live);
      claimed.set(entity, used);
      this.components.set(id, live);
      this.records.set(id, record);
      this.identities.push({ scene, entityId, id, type: record.type });
    }
  }
}
