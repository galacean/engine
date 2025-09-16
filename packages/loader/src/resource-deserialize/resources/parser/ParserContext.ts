import {
  AssetPromise,
  Component,
  Engine,
  EngineObject,
  Entity,
  ReferResource,
  ResourceManager,
  Scene
} from "@galacean/engine-core";
import type { IEntity, IHierarchyFile } from "../schema";

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
    this.components.clear();
    this.componentConfigMap.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
    this.strippedIds.length = 0;
  }

  /** @internal */
  _setTaskCompleteProgress: (loaded: number, total: number) => void;

  /** @internal */
  _addDependentAsset(refID: string, promise: AssetPromise<any>): void {
    const tasks = this._tasks;
    if (tasks.has(refID)) return;
    ++this._total;
    tasks.add(refID);
    promise.finally(() => {
      ++this._loaded;
      this._setTaskCompleteProgress(this._loaded, this._total);
    });
  }
}
