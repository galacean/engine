import { AssetPromise, Engine, Entity, Loader, Scene } from "@oasis-engine/core";
import { IEntity, IScene } from "../prefab/PrefabDesign";
import { ReflectionParser } from "../prefab/ReflectionParser";

interface IParsedEntity {
  entity: Entity;
  config: IEntity;
}

/**
 * @internal
 */
export class SceneParserContext {
  private _entitiesMap: Record<string, Entity> = {};
  private _scene: Scene;

  static create(engine: Engine, data: IScene) {
    const context = new SceneParserContext(engine, data);
    return context._scene;
  }

  private constructor(private _engine: Engine, public readonly data: IScene) {
    this._scene = new Scene(_engine);
  }

  parse(): Promise<Scene> {
    return this.parseEntities().then(this._parseComponents);
  }

  private parseEntities(): AssetPromise<IParsedEntity[]> {
    return new AssetPromise((resolve, reject) => {
      const sceneData = this.data;
      const engine = this._engine;
      const entitiesConfigMap: Record<string, IEntity> = {};
      const promises: Promise<Entity>[] = [];
      const entitiesConfig = sceneData.entities;
      for (const entity of entitiesConfig) {
        entitiesConfigMap[entity.id] = entity;
        promises.push(ReflectionParser.parseEntity(entity, engine));
      }
      return Promise.all(promises)
        .then((entities) => {
          const len = entities.length;
          const parsedEntities: IParsedEntity[] = new Array(len);
          for (let i = 0; i < len; i++) {
            this._entitiesMap[entitiesConfig[i].id] = entities[i];
            parsedEntities[i] = {
              entity: entities[i],
              config: entitiesConfig[i]
            };
          }
          resolve(parsedEntities);
        })
        .catch((e) => {
          reject(e);
        });
    });
  }

  private _parseComponents(parsedEntities: IParsedEntity[]): AssetPromise<Scene> {
    return new AssetPromise((resolve, reject) => {
      parsedEntities.map(({ config, entity }) => {
        const components = config.components;
        const engine = this._engine;
        const promises = [];
        for (let i = 0; i < components.length; i++) {
          const componentConfig = components[i];
          const key = !componentConfig.refId ? componentConfig.class : componentConfig.refId;
          let component;
          if (key === "Animator") {
            component = entity.getComponent(Loader.getClass(key));
          }
          component = component ?? entity.addComponent(Loader.getClass(key));
          const promise = ReflectionParser.parsePropsAndMethods(component, componentConfig, engine);
          promises.push(promise);
        }
        Promise.all(promises)
          .then(() => {
            resolve(this._scene);
          })
          .catch((e) => {
            reject(e);
          });
      });
    });
  }
}
