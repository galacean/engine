import { Engine, Entity, Loader } from "@galacean/engine-core";
import type { IAssetRef, IBasicType, IClassObject, IEntity, IEntityRef } from "../schema";
import { SceneParserContext } from "../scene/SceneParserContext";

export class ReflectionParser {
  static customParseComponentHandles = new Map<string, Function>();

  static registerCustomParseComponent(componentType: string, handle: Function) {
    this.customParseComponentHandles[componentType] = handle;
  }

  constructor(private readonly _context: SceneParserContext) {}

  parseEntity(entityConfig: IEntity): Promise<Entity> {
    return this._getEntityByConfig(entityConfig).then((entity) => {
      entity.isActive = entityConfig.isActive ?? true;
      const { position, rotation, scale } = entityConfig;
      if (position) entity.transform.position.copyFrom(position);
      if (rotation) entity.transform.rotation.copyFrom(rotation);
      if (scale) entity.transform.scale.copyFrom(scale);
      return entity;
    });
  }

  parseClassObject(item: IClassObject) {
    const Class = Loader.getClass(item.class);
    const params = item.constructParams ?? [];
    const instance = new Class(...params);
    return this.parsePropsAndMethods(instance, item);
  }

  parsePropsAndMethods(instance: any, item: Omit<IClassObject, "class">) {
    const promises = [];
    if (item.methods) {
      for (let methodName in item.methods) {
        const methodParams = item.methods[methodName];
        for (let i = 0, count = methodParams.length; i < count; i++) {
          const params = methodParams[i];
          const promise = this.parseMethod(instance, methodName, params);
          promises.push(promise);
        }
      }
    }

    if (item.props) {
      for (let key in item.props) {
        const value = item.props[key];
        const promise = this.parseBasicType(value).then((v) => {
          return (instance[key] = v);
        });
        promises.push(promise);
      }
    }

    return Promise.all(promises).then(() => {
      const handle = ReflectionParser.customParseComponentHandles[instance.constructor.name];
      if (handle) return handle(instance, item);
      else return instance;
    });
  }

  parseMethod(instance: any, methodName: string, methodParams: Array<IBasicType>) {
    return Promise.all(methodParams.map((param) => this.parseBasicType(param))).then((result) => {
      return instance[methodName](...result);
    });
  }

  parseBasicType(value: IBasicType): Promise<any> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.parseBasicType(item)));
    } else if (typeof value === "object" && value != null) {
      if (ReflectionParser._isClass(value)) {
        // class object
        return this.parseClassObject(value);
      } else if (ReflectionParser._isAssetRef(value)) {
        // reference object
        // @ts-ignore
        return this._context.resourceManager.getResourceByRef(value);
      } else if (ReflectionParser._isEntityRef(value)) {
        // entity reference
        return Promise.resolve(this._context.entityMap.get(value.entityId));
      } else {
        // basic type
        return Promise.resolve(value);
      }
    } else {
      return Promise.resolve(value);
    }
  }

  private _getEntityByConfig(entityConfig: IEntity) {
    // @ts-ignore
    const assetRefId: string = entityConfig.assetRefId;
    const engine = this._context.engine;
    if (assetRefId) {
      return (
        engine.resourceManager
          // @ts-ignore
          .getResourceByRef<Entity>({ refId: assetRefId, key: entityConfig.key, isClone: entityConfig.isClone })
          .then((entity) => {
            entity.name = entityConfig.name;
            return entity;
          })
      );
    } else {
      const entity = new Entity(engine, entityConfig.name);
      return Promise.resolve(entity);
    }
  }

  private static _isClass(value: any): value is IClassObject {
    return value["class"] != undefined;
  }

  private static _isAssetRef(value: any): value is IAssetRef {
    return value["refId"] != undefined;
  }

  private static _isEntityRef(value: any): value is IEntityRef {
    return value["entityId"] != undefined;
  }
}
