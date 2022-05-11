import { Engine, Entity } from "@oasis-engine/core";
import type { IEntity, IPrefabFile } from "./PrefabDesign";
import { ReflectionParser } from "./ReflectionParser";

export class PrefabParser {
  constructor(private _engine: Engine) {}

  parse(data: IPrefabFile): Promise<Entity> {
    const entitiesMap: Record<string, Entity> = {};
    const entitiesConfigMap: Record<string, IEntity> = {};
    const promises: Promise<Entity>[] = [];
    const entitiesConfig = data.entities;
    for (const entity of entitiesConfig) {
      entitiesConfigMap[entity.id] = entity;
      promises.push(ReflectionParser.parseEntity(entity, this._engine));
    }

    return Promise.all(promises).then((entities) => {
      const rootId = entitiesConfig[0].id;
      entities.forEach((entity, index) => {
        entitiesMap[entitiesConfig[index].id] = entity;
      });
      PrefabParser.parseChildren(entitiesConfigMap, entitiesMap, rootId);
      return entitiesMap[rootId];
    });
  }

  static parseChildren(
    entitiesConfig: { [key: string]: IEntity },
    entities: { [key: string]: Entity },
    parentId: string
  ) {
    const children = entitiesConfig[parentId].children;
    if (children && children.length > 0) {
      const parent = entities[parentId];
      for (let i = 0; i < children.length; i++) {
        const childId = children[i];
        const entity = entities[childId];
        parent.addChild(entity);
        this.parseChildren(entitiesConfig, entities, childId);
      }
    }
  }
}
