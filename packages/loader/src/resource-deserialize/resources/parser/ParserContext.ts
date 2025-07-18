import { Component, Engine, EngineObject, Entity, ReferResource, ResourceManager, Scene } from "@galacean/engine-core";
import type { IComponentRef, IEntity, IHierarchyFile } from "../schema";

export enum ParserType {
  Prefab,
  Scene
}
/**
 * @internal
 */
export class ParserContext<T extends IHierarchyFile, I extends EngineObject> {
  entityMap: Map<string, Entity> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  components: Map<string, Component> = new Map();
  componentConfigMap: Map<string, any> = new Map();
  rootIds: string[] = [];
  strippedIds: string[] = [];

  readonly resourceManager: ResourceManager;

  constructor(
    public readonly engine: Engine,
    public readonly type = ParserType.Scene,
    public readonly resource: ReferResource | Scene
  ) {
    this.resourceManager = engine.resourceManager;
  }

  clear() {
    this.entityMap.clear();
    this.components.clear();
    this.componentConfigMap.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
    this.strippedIds.length = 0;
  }
}
