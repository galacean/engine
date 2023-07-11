import { Entity, Engine, Component } from "@galacean/engine-core";
import { IEntity, IPrefabFile } from "../schema";

export class PrefabParserContext {
  entityMap: Map<string, Entity> = new Map();
  components: Map<string, Component> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  rootIds: string[] = [];
  constructor(public readonly originalData: IPrefabFile, public readonly prefabEntity: Entity) {}

  destroy() {
    this.entityMap.clear();
    this.components.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
  }
}
