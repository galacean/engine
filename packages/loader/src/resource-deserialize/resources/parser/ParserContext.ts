import { Component, Entity } from "@galacean/engine-core";
import type { IEntity } from "../schema";

/**
 * Parser context
 * @export
 * @abstract
 * @class ParserContext
 * @template T
 * @template I
 */
export abstract class ParserContext<T, I> {
  entityMap: Map<string, Entity> = new Map();
  components: Map<string, Component> = new Map();
  assets: Map<string, any> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  rootIds: string[] = [];
  strippedIds: string[] = [];
  constructor(public readonly originalData: I, public readonly engine, public target?: T) {}

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
