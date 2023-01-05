import { Engine, Entity, Loader } from "@oasis-engine/core";
import { IBasicType, IClassObject, IEntity, IReferenceType } from "./PrefabDesign";

export class ReflectionParser {
  static customParseComponentHandles = new Map<string, Function>();

  static registerCustomParseComponent(componentType: string, handle: Function) {
    this.customParseComponentHandles[componentType] = handle;
  }

  static parseEntity(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    return ReflectionParser.getEntityByConfig(entityConfig, engine).then((entity) => {
      entity.isActive = entityConfig.isActive ?? true;
      const { position, rotation, scale } = entityConfig;
      if (position) {
        entity.transform.setPosition(position.x, position.y, position.z);
      }
      if (rotation) {
        entity.transform.setRotation(rotation.x, rotation.y, rotation.z);
      }
      if (scale) {
        entity.transform.setScale(scale.x, scale.y, scale.z);
      }
      const promises = [];
      for (let i = 0; i < entityConfig.components.length; i++) {
        const componentConfig = entityConfig.components[i];
        const key = !componentConfig.refId ? componentConfig.class : componentConfig.refId;
        let component;
        if (key === "Animator") {
          component = entity.getComponent(Loader.getClass(key));
        }
        component = component || entity.addComponent(Loader.getClass(key));
        const promise = this.parsePropsAndMethods(component, componentConfig, engine);
        promises.push(promise);
      }
      return Promise.all(promises).then(() => {
        return entity;
      });
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
        // 类对象
        return this.parseClassObject(value, engine, resourceManager);
      } else if (this._isRef(value)) {
        // 引用对象
        return resourceManager.getResourceByRef(value);
      } else {
        // 基础类型
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

    return new Promise((resolve, reject) => {
      Promise.all(promises).then(() => {
        const handle = this.customParseComponentHandles[instance.constructor.name];
        if (handle) {
          handle(instance, item, engine).then(() => {
            resolve(instance);
          });
        } else {
          resolve(instance);
        }
      }).catch(reject)
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

  private static _isRef(value: any): value is IReferenceType {
    return value["refId"] != undefined;
  }
}
