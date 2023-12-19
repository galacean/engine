import { Component, Engine, Entity, ResourceManager, Scene } from "@galacean/engine-core";
import type { IEntity, IScene } from "../schema";

export class SceneParserContext {
  entityMap: Map<string, Entity> = new Map();
  components: Map<string, Component> = new Map();
  assets: Map<string, any> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  rootIds: string[] = [];
  readonly engine: Engine;
  readonly resourceManager: ResourceManager;
  constructor(
    public readonly originalData: IScene,
    public readonly scene: Scene
  ) {
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
