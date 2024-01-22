import { Component, Engine, EngineObject, Entity, ResourceManager } from "@galacean/engine-core";
import type { IEntity, IPrefabFile } from "../schema";

/**
 * Parser context
 * @export
 * @abstract
 * @class ParserContext
 * @template T
 * @template I
 */
export class ParserContext<T extends Object, I extends EngineObject> {
  entityMap: Map<string, Entity> = new Map();
  components: Map<string, Component> = new Map();
  assets: Map<string, any> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  rootIds: string[] = [];
  strippedIds: string[] = [];
  readonly resourceManager: ResourceManager;
  constructor(
    public readonly originalData: T,
    public readonly engine,
    public target?: I
  ) {
    this.resourceManager = engine.resourceManager;
  }

  /**
   * Destroy the context.
   * @abstract
   * @memberof ParserContext
   */
  destroy() {
    this.entityMap.clear();
    this.components.clear();
    this.assets.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
  }
}
