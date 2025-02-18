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
  rootIds: string[] = [];
  strippedIds: string[] = [];
  componentWaitingMap: Map<string, Function[]> = new Map();

  readonly resourceManager: ResourceManager;

  constructor(
    public readonly engine: Engine,
    public readonly type = ParserType.Scene,
    public readonly resource: ReferResource | Scene
  ) {
    this.resourceManager = engine.resourceManager;
  }

  addComponent(id: string, component: Component) {
    this.components.set(id, component);
    const waitingList = this.componentWaitingMap.get(id);
    if (waitingList?.length) {
      waitingList.forEach((resolve) => resolve(component));
      this.componentWaitingMap.delete(id);
    }
  }

  getComponentByRef(ref: IComponentRef): Promise<Component> {
    return new Promise((resolve, reject) => {
      const component = this.components.get(ref.componentId);
      if (component) {
        resolve(component);
      } else {
        const resolves = this.componentWaitingMap.get(ref.componentId);
        if (resolves) {
          resolves.push(resolve);
        } else {
          this.componentWaitingMap.set(ref.componentId, [resolve]);
        }
      }
    });
  }

  clear() {
    this.entityMap.clear();
    this.components.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
    this.strippedIds.length = 0;
  }
}
