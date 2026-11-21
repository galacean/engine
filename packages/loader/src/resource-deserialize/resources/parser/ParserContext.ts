import {
  AssetPromise,
  Component,
  ComponentConstructor,
  Engine,
  Entity,
  ReferResource,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
import type { ComponentSchema } from "../../../schema/HierarchySchema";

export enum ParserType {
  Prefab,
  Scene
}

/**
 * @internal
 */
export class ParserContext {
  /** @internal */
  static _findComponent(components: readonly Component[], type: ComponentConstructor, index: number): Component | null {
    let matchIndex = 0;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (component instanceof type && matchIndex++ === index) {
        return component;
      }
    }
    return null;
  }

  /** Runtime Entity instances, indexed by the flat entities[] position. */
  entityInstances: Entity[] = [];
  /** Components waiting for props/calls application (Stage 4). */
  pendingComponents: Array<{ instance: Component; config: ComponentSchema }> = [];
  /** Selector order where removals or dependency-ordered construction changed the live component list. */
  componentSnapshots: Map<Entity, Component[]> | null = null;
  /** Pre-removal children lists for parents with removedEntities, preserving $entity indices. */
  childSnapshots: Map<Entity, Entity[]> | null = null;

  readonly resourceManager: ResourceManager;

  private _loaded: number = 0;
  private _total: number = 0;

  constructor(
    public readonly engine: Engine,
    public readonly type = ParserType.Scene,
    public readonly resource: ReferResource | Scene
  ) {
    this.resourceManager = engine.resourceManager;
  }

  clear() {
    this.entityInstances.length = 0;
    this.pendingComponents.length = 0;
    this.componentSnapshots = null;
    this.childSnapshots = null;
  }

  /** @internal */
  _setTaskCompleteProgress: (loaded: number, total: number) => void;

  /** @internal */
  _addDependentAsset(promise: AssetPromise<any>): void {
    ++this._total;
    promise.finally(() => {
      ++this._loaded;
      this._setTaskCompleteProgress(this._loaded, this._total);
    });
  }
}
