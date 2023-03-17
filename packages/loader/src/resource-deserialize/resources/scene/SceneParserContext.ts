import type { Component, Engine, Entity, ResourceManager, Scene } from "@oasis-engine/core";
import type { IEntity, IScene } from "../prefab/PrefabDesign";

export class SceneParserContext {
  readonly entityMap: Map<string, Entity> = new Map();
  readonly components: Map<string, Component> = new Map();
  readonly assets: Map<string, any> = new Map();
  readonly entityConfigMap: Map<string, IEntity> = new Map();
  readonly rootIds: string[] = [];
  readonly engine: Engine;
  readonly resourceManager: ResourceManager;

  constructor(public readonly originalData: IScene, public readonly scene: Scene) {
    this.engine = scene.engine;
    this.resourceManager = scene.engine.resourceManager;
  }

  destroy() {
    this.entityMap.clear();
    this.components.clear();
    this.assets.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
  }
}
