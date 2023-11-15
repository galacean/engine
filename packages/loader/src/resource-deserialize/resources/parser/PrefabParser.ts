import { Entity } from "@galacean/engine-core";
import type { IEntity } from "../schema";

export class PrefabParser {
  static parseChildren(entitiesConfig: Map<string, IEntity>, entities: Map<string, Entity>, parentId: string) {
    const children = entitiesConfig.get(parentId).children;
    if (children && children.length > 0) {
      const parent = entities.get(parentId);
      for (let i = 0; i < children.length; i++) {
        const childId = children[i];
        const entity = entities.get(childId);
        parent.addChild(entity);
        this.parseChildren(entitiesConfig, entities, childId);
      }
    }
  }
}
