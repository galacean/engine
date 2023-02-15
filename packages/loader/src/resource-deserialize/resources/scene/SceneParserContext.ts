import { Component, Entity, Scene } from "@oasis-engine/core";
import { IEntity, IScene } from "../prefab/PrefabDesign";

export class SceneParserContext {
  entityMap: Map<string, Entity> = new Map();
  components: Map<string, Component> = new Map();
  assets: Map<string, any> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  rootIds: string[] = [];
  constructor(public readonly originalData: IScene, public readonly scene: Scene) {}

  destroy() {
    this.entityMap.clear();
    this.components.clear();
    this.assets.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
  }
}
