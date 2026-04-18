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

  readonly resourceManager: ResourceManager;

  private _tasks: Set<string> = new Set();
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
  }

  /** @internal */
  _setTaskCompleteProgress: (loaded: number, total: number) => void;

  /** @internal */
  _addDependentAsset(url: string, promise: AssetPromise<any>): void {
    const tasks = this._tasks;
    if (tasks.has(url)) return;
    ++this._total;
    tasks.add(url);
    promise.finally(() => {
      ++this._loaded;
      this._setTaskCompleteProgress(this._loaded, this._total);
    });
  }
}
