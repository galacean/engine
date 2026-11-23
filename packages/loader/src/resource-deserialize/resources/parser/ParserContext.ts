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
export class ParserContext<T extends ReferResource | Scene = ReferResource | Scene> {
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
  /** Components whose base properties and calls have yet to be applied. */
  pendingComponents: Array<{ instance: Component; config: ComponentSchema }> = [];
  /** Component selector order when it differs from the live list. Removed template slots stay reserved. */
  componentSnapshots: Map<Entity, Component[]> | null = null;
  /** Affected parents' child lists before removals, used to resolve $entity indices without retargeting. */
  childSnapshots: Map<Entity, Entity[]> | null = null;

  readonly resourceManager: ResourceManager;

  private _loaded: number = 0;
  private _total: number = 0;

  constructor(
    public readonly engine: Engine,
    public readonly type = ParserType.Scene,
    public readonly resource: T
  ) {
    this.resourceManager = engine.resourceManager;
  }

  /** @internal */
  async _load(parse: () => Promise<void>): Promise<T> {
    const resource = this.resource;
    const entities = this.entityInstances;
    try {
      await parse();
      if (resource.destroyed || resource.pendingDestroy) {
        throw new Error("Cannot complete loading a scene or prefab being destroyed.");
      }
      return resource;
    } catch (error) {
      try {
        if (resource instanceof ReferResource) resource.destroy(true);
        else resource.destroy();
      } catch {
        // Preserve the load error if disposing the resource fails.
      }
      for (let i = 0, n = entities.length; i < n; i++) {
        const entity = entities[i];
        if (!entity || entity.destroyed) continue;
        try {
          entity.destroy();
        } catch {
          // Continue disposing entities that did not reach the resource's hierarchy.
        }
      }
      throw error;
    } finally {
      entities.length = 0;
      this.pendingComponents.length = 0;
      this.componentSnapshots = null;
      this.childSnapshots = null;
    }
  }

  /** @internal */
  _setTaskCompleteProgress: (loaded: number, total: number) => void;

  /** @internal */
  _addDependentAsset(promise: AssetPromise<unknown>): void {
    ++this._total;
    const onSettled = () => {
      ++this._loaded;
      this._setTaskCompleteProgress(this._loaded, this._total);
    };
    promise.then(onSettled, onSettled);
  }
}
