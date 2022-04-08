import { AssetType, Engine, Entity, Loader } from "@oasis-engine/core";
import { IBasicType, IClassObject, IEntity, IReferenceType } from "./PrefabDesign";

interface IResourceManager {
  getResourceByRef(ref: { objectId: string; path: string }): Promise<any>;
}

export class ReflectionParser {
  static parseEntity(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    const entity = new Entity(engine, entityConfig.name);
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
      const component = entity.addComponent(Loader.getClassObject(componentConfig.class));
      const promise = this.parsePropsAndMethods(component, componentConfig, engine);
      promises.push(promise);
    }
    return Promise.all(promises).then(() => {
      return entity;
    });
  }

  static parseClassObject(
    item: IClassObject,
    engine: Engine,
    resourceManager: IResourceManager = engine.resourceManager
  ): Promise<any> {
    const Class = Loader.getClassObject(item.class);
    const params = item.constructParams ?? [];
    const instance = new Class(...params);
    return this.parsePropsAndMethods(instance, item, engine, resourceManager);
  }

  static parseBasicType(
    value: IBasicType,
    engine: Engine,
    resourceManager: IResourceManager = engine.resourceManager
  ): Promise<any> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.parseBasicType(item, engine, resourceManager)));
    } else {
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
    }
  }

  static parsePropsAndMethods(
    instance: any,
    item: IClassObject,
    engine: Engine,
    resourceManager: IResourceManager = engine.resourceManager
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
      return instance;
    });
  }

  static parseMethod(
    instance: any,
    methodName: string,
    methodParams: Array<IBasicType>,
    engine: Engine,
    resourceManager: IResourceManager = engine.resourceManager
  ) {
    return Promise.all(methodParams.map((param) => this.parseBasicType(param, engine, resourceManager))).then(
      (result) => {
        return instance[methodName](...result);
      }
    );
  }

  private static _isClass(value: any): value is IClassObject {
    return "class" in value;
  }

  private static _isRef(value: any): value is IReferenceType {
    return "objectId" in value;
  }
}
