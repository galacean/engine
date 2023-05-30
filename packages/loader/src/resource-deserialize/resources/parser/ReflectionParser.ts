import { Engine, Entity, Loader } from "@galacean/engine-core";
import type { IAssetRef, IBasicType, IClassObject, IEntity } from "../schema";

export class ReflectionParser {
  static customParseComponentHandles = new Map<string, Function>();

  static registerCustomParseComponent(componentType: string, handle: Function) {
    this.customParseComponentHandles[componentType] = handle;
  }

  static parseEntity(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    return ReflectionParser.getEntityByConfig(entityConfig, engine).then((entity) => {
      entity.isActive = entityConfig.isActive ?? true;
      const { position, rotation, scale } = entityConfig;
      if (position) entity.transform.position.copyFrom(position);
      if (rotation) entity.transform.rotation.copyFrom(rotation);
      if (scale) entity.transform.scale.copyFrom(scale);
      return entity;
    });
  }

  private static getEntityByConfig(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    // @ts-ignore
    const assetRefId: string = entityConfig.assetRefId;
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

  static parseClassObject(
    item: IClassObject,
    engine: Engine,
    resourceManager: any = engine.resourceManager
  ): Promise<any> {
    const Class = Loader.getClass(item.class);
    const params = item.constructParams ?? [];
    const instance = new Class(...params);
    return this.parsePropsAndMethods(instance, item, engine, resourceManager);
  }

  static parseBasicType(
    value: IBasicType,
    engine: Engine,
    resourceManager: any = engine.resourceManager
  ): Promise<any> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.parseBasicType(item, engine, resourceManager)));
    } else if (typeof value === "object" && value != null) {
      if (this._isClass(value)) {
        // class object
        return this.parseClassObject(value, engine, resourceManager);
      } else if (this._isRef(value)) {
        // reference object
        return resourceManager.getResourceByRef(value);
      } else {
        // basic type
        return Promise.resolve(value);
      }
    } else {
      return Promise.resolve(value);
    }
  }

  static parsePropsAndMethods(
    instance: any,
    item: Omit<IClassObject, "class">,
    engine: Engine,
    resourceManager: any = engine.resourceManager
  ) {
    const promises = [];
    if (item.methods) {
      for (let methodName in item.methods) {
        const methodParams = item.methods[methodName];
        for (let i = 0, count = methodParams.length; i < count; i++) {
          const params = methodParams[i];
          const promise = this.parseMethod(instance, methodName, params, engine, resourceManager);
          promises.push(promise);
        }
      }
    }

    if (item.props) {
      for (let key in item.props) {
        const value = item.props[key];
        const promise = this.parseBasicType(value, engine).then((v) => {
          return (instance[key] = v);
        });
        promises.push(promise);
      }
    }

    return Promise.all(promises).then(() => {
      const handle = this.customParseComponentHandles[instance.constructor.name];
      if (handle) return handle(instance, item, engine);
      else return instance;
    });
  }

  static parseMethod(
    instance: any,
    methodName: string,
    methodParams: Array<IBasicType>,
    engine: Engine,
    resourceManager: any = engine.resourceManager
  ) {
    return Promise.all(methodParams.map((param) => this.parseBasicType(param, engine, resourceManager))).then(
      (result) => {
        return instance[methodName](...result);
      }
    );
  }

  private static _isClass(value: any): value is IClassObject {
    return value["class"] != undefined;
  }

  private static _isRef(value: any): value is IAssetRef {
    return value["refId"] != undefined;
  }
}
