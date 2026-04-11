import { AssetPromise, Component, Engine, Entity, ReferResource, ResourceManager, Scene } from "@galacean/engine-core";
import type { ComponentSchema } from "../../../scene-format/types";

export enum ParserType {
  Prefab,
  Scene
}

/** Prefab instance context for override resolution. */
export interface PrefabInstanceContext {
  /** Path string → Entity (e.g., "" → root, "0" → first child, "0/1" → ...) */
  entityMap: Map<string, Entity>;
  /** Component key → Component (e.g., "0:MeshRenderer/0") */
  components: Map<string, Component>;
}

/**
 * @internal
 */
export class ParserContext {
  /** Flat entity index → Entity instance */
  entityMap: Map<number, Entity> = new Map();
  /** Component instance → config pairs for props application */
  componentPairs: Array<{ component: Component; config: ComponentSchema }> = [];

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
    this.entityMap.clear();
    this.componentPairs.length = 0;
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
