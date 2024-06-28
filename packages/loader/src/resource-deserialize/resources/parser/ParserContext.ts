import { Component, Engine, EngineObject, Entity, ReferResource, ResourceManager, Scene } from "@galacean/engine-core";
import type { IEntity, IHierarchyFile } from "../schema";

export enum ParserType {
  Prefab,
  Scene
}
/**
 * Parser context
 * @export
 * @class ParserContext
 * @template T
 * @template I
 */
export class ParserContext<T extends IHierarchyFile, I extends EngineObject> {
  entityMap: Map<string, Entity> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  components: Map<string, Component> = new Map();
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

  /**
   * Destroy the context.
   * @memberof ParserContext
   */
  clear() {
    this.entityMap.clear();
    this.components.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
    this.strippedIds.length = 0;
  }
}
