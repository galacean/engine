import { Entity, Engine } from "@galacean/engine-core";
import { IEntity, IPrefabFile } from "../schema";

export class PrefabParserContext {
  entityMap: Map<string, Entity> = new Map();
  entityConfigMap: Map<string, IEntity> = new Map();
  rootIds: string[] = [];
  constructor(public readonly originalData: IPrefabFile, public readonly engine: Engine) {}

  destroy() {
    this.entityMap.clear();
    this.entityConfigMap.clear();
    this.rootIds.length = 0;
  }
}
