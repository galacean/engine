import { Engine, Entity, Scene } from "@oasis-engine/core";
import { IEntity, IScene } from "../prefab/PrefabDesign";
import { PrefabParser } from "../prefab/PrefabParser";
import { ReflectionParser } from "../prefab/ReflectionParser";

export class SceneParser {
  static parse(engine: Engine, sceneData: IScene): Promise<Scene> {
    const scene = new Scene(engine);
    const entitiesMap: Record<string, Entity> = {};
    const entitiesConfigMap: Record<string, IEntity> = {};
    const promises: Promise<Entity>[] = [];
    const entitiesConfig = sceneData.entities;
    for (const entity of entitiesConfig) {
      entitiesConfigMap[entity.id] = entity;
      promises.push(ReflectionParser.parseEntity(entity, engine));
    }

    return Promise.all(promises).then((entities) => {
      const rootIds = [];
      entities.forEach((entity, index) => {
        entitiesMap[entitiesConfig[index].id] = entity;
        if (!entitiesConfig[index].parent) {
          rootIds.push(entitiesConfig[index].id);
        }
      });
      for (const rootId of rootIds) {
        PrefabParser.parseChildren(entitiesConfigMap, entitiesMap, rootId);
      }
      const rootEntities = rootIds.map((id) => entitiesMap[id]);
      for (let i = 0; i < rootEntities.length; i++) {
        scene.addRootEntity(rootEntities[i]);
      }
      return scene;
    });
  }
}
