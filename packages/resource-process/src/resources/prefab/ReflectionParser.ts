import { Engine, Entity, Loader } from "@oasis-engine/core";
import { IBasicType, IClassObject, IEntity, IReferenceType } from "./PrefabDesign";

export class ReflectionParser {
  static parseEntity(entityConfig: IEntity, engine: Engine): Promise<Entity> {
    const entity = new Entity(engine, entityConfig.name);
    const promises = [];
    for (let i = 0; i < entityConfig.components.length; i++) {
      const componentConfig = entityConfig.components[i];
      const component = entity.addComponent(Loader.getClassObject(componentConfig.class));
      const promise = this._parsePropsAndMethods(component, componentConfig, engine);
      promises.push(promise);
    }
    return Promise.all(promises).then(() => {
      return entity;
    });
  }

  static parseClassObject(item: IClassObject, engine: Engine): Promise<any> {
    const Class = Loader.getClassObject(item.class);
    const params = item.constructor ?? [];
    const instance = new Class(...params);
    return this._parsePropsAndMethods(instance, item, engine);
  }

  static parseBasicType(value: IBasicType, engine: Engine): Promise<any> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.parseBasicType(item, engine)));
    } else {
      if (this._isClass(value)) {
        // 类对象
        return this.parseClassObject(value, engine);
      } else if (this._isRef(value)) {
        // 引用对象
        return engine.resourceManager.load(value.path);
      } else {
        // 基础类型
        return Promise.resolve(value);
      }
    }
  }

  private static _parsePropsAndMethods(instance: any, item: IClassObject, engine: Engine) {
    const promises = [];
    if (item.methods) {
      for (let methodName in item.methods) {
        const methodParams = item.methods[methodName];
        for (let i = 0, count = methodParams.length; i < count; i++) {
          const params = methodParams[i];
          const promise = Promise.all(params.map((param) => this.parseBasicType(param, engine))).then((result) => {
            return instance[methodName](...result);
          });
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

  private static _isClass(value: any): value is IClassObject {
    return "class" in value;
  }

  private static _isRef(value: any): value is IReferenceType {
    return "refId" in value;
  }
}
