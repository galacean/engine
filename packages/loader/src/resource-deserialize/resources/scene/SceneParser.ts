import { Engine, Entity, Loader, Scene } from "@galacean/engine-core";
import { PrefabParser } from "../parser/PrefabParser";
import { ReflectionParser } from "../parser/ReflectionParser";
import type { IScene } from "../schema";
import { SceneParserContext } from "./SceneParserContext";

/** @Internal */
export class SceneParser {
  /**
   * Parse scene data.
   * @param engine - the engine of the parser context
   * @param sceneData - scene data which is exported by editor
   * @returns a promise of scene
   */
  static parse(engine: Engine, sceneData: IScene): Promise<Scene> {
    const scene = new Scene(engine);
    const context = new SceneParserContext(sceneData, scene);
    const parser = new SceneParser(context);
    parser.start();
    return parser.promise;
  }

  /**
   * The promise of parsed scene.
   */
  readonly promise: Promise<Scene>;

  private _resolve: (scene: Scene) => void;
  private _reject: (reason: any) => void;
  private _engine: Engine;

  constructor(public readonly context: SceneParserContext) {
    this._engine = this.context.scene.engine;
    this._organizeEntities = this._organizeEntities.bind(this);
    this._parseComponents = this._parseComponents.bind(this);
    this._clearAndResolveScene = this._clearAndResolveScene.bind(this);
    this.promise = new Promise<Scene>((resolve, reject) => {
      this._reject = reject;
      this._resolve = resolve;
    });
  }

  /** start parse the scene */
  start() {
    this._parseEntities()
      .then(this._organizeEntities)
      .then(this._parseComponents)
      .then(this._clearAndResolveScene)
      .then(this._resolve)
      .catch(this._reject);
  }

  private _parseEntities(): Promise<Entity[]> {
    const entitiesConfig = this.context.originalData.entities;
    const entityConfigMap = this.context.entityConfigMap;
    const entitiesMap = this.context.entityMap;
    const rootIds = this.context.rootIds;
    const engine = this._engine;
    const promises = entitiesConfig.map((entityConfig) => {
      entityConfigMap.set(entityConfig.id, entityConfig);
      // record root entities
      if (!entityConfig.parent) rootIds.push(entityConfig.id);
      return ReflectionParser.parseEntity(entityConfig, engine);
    });

    return Promise.all(promises).then((entities) => {
      for (let i = 0, l = entities.length; i < l; i++) {
        entitiesMap.set(entitiesConfig[i].id, entities[i]);
      }
      return entities;
    });
  }

  private _organizeEntities() {
    const { entityConfigMap, entityMap, scene, rootIds } = this.context;
    for (const rootId of rootIds) {
      PrefabParser.parseChildren(entityConfigMap, entityMap, rootId);
    }
    const rootEntities = rootIds.map((id) => entityMap.get(id));
    for (let i = 0; i < rootEntities.length; i++) {
      scene.addRootEntity(rootEntities[i]);
    }
  }

  private _parseComponents(): Promise<any[]> {
    const entitiesConfig = this.context.originalData.entities;
    const entityMap = this.context.entityMap;

    const promises = [];
    for (let i = 0, l = entitiesConfig.length; i < l; i++) {
      const entityConfig = entitiesConfig[i];
      const entity = entityMap.get(entityConfig.id);
      for (let i = 0; i < entityConfig.components.length; i++) {
        const componentConfig = entityConfig.components[i];
        const key = !componentConfig.refId ? componentConfig.class : componentConfig.refId;
        let component;
        // TODO: remove hack code when support additional edit
        if (key === "Animator") {
          component = entity.getComponent(Loader.getClass(key));
        }
        component = component || entity.addComponent(Loader.getClass(key));
        const promise = ReflectionParser.parsePropsAndMethods(component, componentConfig, entity.engine);
        promises.push(promise);
      }
    }
    return Promise.all(promises);
  }

  private _clearAndResolveScene() {
    const scene = this.context.scene;
    this.context.destroy();
    return scene;
  }
}
