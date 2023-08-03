import { Entity, Engine, Loader, Scene } from "@galacean/engine-core";
import type { IEntity, IPrefabEntity, IPrefabFile, IRefEntity } from "../schema";
import { ReflectionParser } from "./ReflectionParser";
import { ParserContext } from "./ParserContext";
import { IPrefabContextData } from "../../../PrefabLoader";

/**
 * HierarchyParser parser.
 * Any HierarchyParser parser should extends this class, like scene parser, prefab parser, etc.
 * @export
 * @abstract
 * @class HierarchyParserParser
 * @template T
 */
export default abstract class HierarchyParser<T extends Scene | Entity> {
  /**
   * The promise of parsed object.
   */
  readonly promise: Promise<T>;
  protected _engine: Engine;
  protected _resolve: (prefab: T) => void;
  protected _reject: (reason: any) => void;

  private childrenContextMap = new WeakMap<Entity, ParserContext<Entity, IPrefabFile>>();

  constructor(public readonly context: ParserContext<T, IPrefabFile>) {
    this._engine = this.context.target.engine;
    this._organizeEntities = this._organizeEntities.bind(this);
    this._parseComponents = this._parseComponents.bind(this);
    this._parsePrefabModification = this._parsePrefabModification.bind(this);
    this._clearAndResolve = this._clearAndResolve.bind(this);
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
      .then(this._parsePrefabModification)
      .then(this._clearAndResolve)
      .then(this._resolve)
      .catch(this._reject);
  }

  /**
   * Append child entity to target.
   * @abstract
   * @param {Entity} entity
   * @memberof ParserContext
   */
  protected abstract appendChild(entity: Entity): void;

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

      return this._getEntityByConfig(entityConfig, engine);
    });

    return Promise.all(promises).then((entities) => {
      for (let i = 0, l = entities.length; i < l; i++) {
        entitiesMap.set(entitiesConfig[i].id, entities[i]);
      }

      return entities;
    });
  }

  private _parseComponents(): Promise<any[]> {
    const entitiesConfig = this.context.originalData.entities;
    const entityMap = this.context.entityMap;
    const components = this.context.components;

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
        components.set(componentConfig.id, component);
        const promise = ReflectionParser.parsePropsAndMethods(component, componentConfig, entity.engine);
        promises.push(promise);
      }
    }
    return Promise.all(promises);
  }

  private _parsePrefabModification() {
    const entitiesConfig = this.context.originalData.entities;
    const entityMap = this.context.entityMap;

    const promises = [];
    for (let i = 0, l = entitiesConfig.length; i < l; i++) {
      const entityConfig = entitiesConfig[i];
      const { id, prefabSource, modifications } = entityConfig as IPrefabEntity;

      if (prefabSource) {
        const rootEntity = entityMap.get(id);
        promises.concat(
          modifications.map((modification) => {
            const { target, props, methods } = modification;
            const { entityId, componentId } = target;
            const isSelf = entityId === id;
            const context = isSelf ? this.context : this.childrenContextMap.get(rootEntity);
            const targetEntity = context.entityMap.get(entityId);
            const targetComponent = context.components.get(componentId);

            if (targetComponent) {
              return ReflectionParser.parsePropsAndMethods(
                targetComponent,
                {
                  props,
                  methods
                },
                targetEntity.engine
              );
            } else {
              return this._applyEntityData(targetEntity, props);
            }
          })
        );
      }
    }

    return Promise.all(promises);
  }

  private _clearAndResolve() {
    const { target } = this.context;
    return target;
  }

  private _organizeEntities(): void {
    const { entityMap, rootIds } = this.context;
    for (const rootId of rootIds) {
      this._parseChildren(rootId);
    }
    const rootEntities = rootIds.map((id) => entityMap.get(id));
    for (let i = 0; i < rootEntities.length; i++) {
      this.appendChild(rootEntities[i]);
    }
  }

  private _getEntityByConfig(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    let entityPromise: Promise<Entity>;
    if ((<IPrefabEntity>entityConfig).prefabSource) {
      entityPromise = this._parsePrefab(<IPrefabEntity>entityConfig, engine);
    } else if ((<IRefEntity>entityConfig).assetRefId) {
      entityPromise = this._parseGLTF(<IRefEntity>entityConfig, engine);
    } else {
      entityPromise = this._parseEntity(entityConfig, engine);
    }
    return entityPromise.then((entity) => {
      return this._applyEntityData(entity, entityConfig);
    });
  }

  private _parseEntity(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    const entity = new Entity(engine, entityConfig.name);

    return Promise.resolve(entity);
  }

  private _parseGLTF(entityConfig: IRefEntity, engine: Engine): Promise<Entity> {
    const assetRefId: string = entityConfig.assetRefId;
    if (assetRefId) {
      return (
        engine.resourceManager
          // @ts-ignore
          .getResourceByRef<Entity>({
            refId: assetRefId,
            key: entityConfig.key,
            isClone: entityConfig.isClone
          })
          .then((entity) => {
            entity.name = entityConfig.name;
            return entity;
          })
      );
    } else {
      return this._parseEntity(entityConfig, engine);
    }
  }

  private _parsePrefab(entityConfig: IPrefabEntity, engine: Engine): Promise<Entity> {
    const assetRefId: string = entityConfig.prefabSource?.assetId;
    if (assetRefId) {
      return (
        engine.resourceManager
          // @ts-ignore
          .getResourceByRef<Entity>({
            refId: assetRefId,
            needContext: true
          })
          .then((prefabContextData: IPrefabContextData) => {
            const { entity, context } = prefabContextData;
            entity.name = entityConfig.name;

            this.childrenContextMap.set(entity, context);
            return entity;
          })
      );
    } else {
      return this._parseEntity(entityConfig, engine);
    }
  }

  private _parseChildren(parentId) {
    const { entityConfigMap, entityMap } = this.context;
    const children = entityConfigMap.get(parentId).children;
    if (children && children.length > 0) {
      const parent = entityMap.get(parentId);
      for (let i = 0; i < children.length; i++) {
        const childId = children[i];
        const entity = entityMap.get(childId);
        parent.addChild(entity);
        this._parseChildren(childId);
      }
    }
  }

  private _applyEntityData(entity: Entity, entityConfig: IEntity): Entity {
    entity.isActive = entityConfig.isActive ?? entity.isActive;
    entity.name = entityConfig.name ?? entity.name;
    const { position, rotation, scale } = entityConfig;
    if (position) entity.transform.position.copyFrom(position);
    if (rotation) entity.transform.rotation.copyFrom(rotation);
    if (scale) entity.transform.scale.copyFrom(scale);
    return entity;
  }
}
