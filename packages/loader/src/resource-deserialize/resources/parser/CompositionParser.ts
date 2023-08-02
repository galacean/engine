import { Entity, Engine, Loader } from "@galacean/engine-core";
import type { IEntity, IPrefabFile } from "../schema";
import { ReflectionParser } from "./ReflectionParser";
import { ParserContext } from "./ParserContext";

/** @Internal */
export default abstract class CompositionParser<T> {
  /**
   * The promise of parsed object.
   */
  readonly promise: Promise<T>;
  protected _engine: Engine;
  protected _resolve: (prefab: T) => void;
  protected _reject: (reason: any) => void;

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

  constructor(public readonly context: ParserContext<T, IPrefabFile>) {
    this.promise = new Promise<T>((resolve, reject) => {
      this._reject = reject;
      this._resolve = resolve;
    });
  }

  /** start parse the scene or prefab or others */
  public start() {
    this._parseEntities()
      .then(this._organizeEntities)
      .then(this._parseComponents)
      .then(this._clearAndResolve)
      .then(this._resolve)
      .catch(this._reject);
  }

  /**
   * parse children of entity
   * @protected
   * @return {Promise<Entity[]>}  entity collection
   * @memberof CompositionParser
   */
  protected _parseEntities(): Promise<Entity[]> {
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

  /**
   * parse components of entity
   * @protected
   * @return {Promise<any[]>}  {Promise<any[]>}
   * @memberof CompositionParser
   */
  protected _parseComponents(): Promise<any[]> {
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

  /**
   * clear context and resolve target
   * @protected
   * @return {T} instance of T
   * @memberof CompositionParser
   */
  protected _clearAndResolve() {
    const { target } = this.context;
    this.context.destroy();
    return target;
  }

  /**
   * organize entities
   * @protected
   * @abstract
   * @memberof CompositionParser
   */
  protected _organizeEntities(): void {
    const { entityConfigMap, entityMap, rootIds, appendChild } = this.context;
    for (const rootId of rootIds) {
      CompositionParser.parseChildren(entityConfigMap, entityMap, rootId);
    }
    const rootEntities = rootIds.map((id) => entityMap.get(id));
    for (let i = 0; i < rootEntities.length; i++) {
      appendChild(rootEntities[i]);
    }
  }
}
