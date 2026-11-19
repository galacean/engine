import { AssetPromise, Component, Engine, Entity, ReferResource, ResourceManager, Scene } from "@galacean/engine-core";
import type { ComponentSchema } from "../../../schema/HierarchySchema";

export enum ParserType {
  Prefab,
  Scene
}

/**
 * @internal
 */
export class ParserContext {
  /** Runtime Entity instances, indexed by the flat entities[] position. */
  entityInstances: Entity[] = [];
  /** Components waiting for props/calls application (Stage 4). */
  pendingComponents: Array<{ instance: Component; config: ComponentSchema }> = [];
  /** Pre-removal component lists (plus additions) for entities with removedComponents, preserving $component indices. */
  componentSnapshots: Map<Entity, Component[]> | null = null;
  /** Pre-removal children lists for parents with removedEntities, preserving $entity indices during Stage 5. */
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
    this.componentSnapshots?.clear();
    this.componentSnapshots = null;
    this.childSnapshots?.clear();
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
