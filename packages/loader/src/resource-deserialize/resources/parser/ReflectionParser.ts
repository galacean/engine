import { EngineObject, Entity, Loader } from "@galacean/engine-core";
import type { IAssetRef, IBasicType, IClassObject, IEntity, IEntityRef, IPrefabFile, IRefEntity } from "../schema";
import { ParserContext } from "./ParserContext";

export class ReflectionParser {
  static customParseComponentHandles = new Map<string, Function>();

  static registerCustomParseComponent(componentType: string, handle: Function) {
    this.customParseComponentHandles[componentType] = handle;
  }

  constructor(private readonly _context: ParserContext<IPrefabFile, EngineObject>) {}

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
    return Promise.all(params.map((param) => this.parseBasicType(param)))
      .then((resultParams) => new Class(...resultParams))
      .then((instance) => this.parsePropsAndMethods(instance, item));
  }

  parsePropsAndMethods(instance: any, item: Omit<IClassObject, "class">) {
    const promises = [];
    if (item.methods) {
      for (let methodName in item.methods) {
        const methodParams = item.methods[methodName];
        for (let i = 0, count = methodParams.length; i < count; i++) {
          promises.push(this.parseMethod(instance, methodName, methodParams[i]));
        }
      }
    }

    if (item.props) {
      for (let key in item.props) {
        const value = item.props[key];
        const promise = this.parseBasicType(value, instance[key]).then((v) => {
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

  parseBasicType(value: IBasicType, originValue?: any): Promise<any> {
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
      } else if (originValue) {
        const promises: Promise<any>[] = [];
        for (let key in value as any) {
          if (key === "methods") {
            const methods: any = value[key];
            for (let methodName in methods) {
              const methodParams = methods[methodName];
              for (let i = 0, count = methodParams.length; i < count; i++) {
                const params = methodParams[i];
                const promise = this.parseMethod(originValue, methodName, params);
                promises.push(promise);
              }
            }
          } else {
            promises.push(this.parseBasicType(value[key], originValue[key]).then((v) => (originValue[key] = v)));
          }
        }
        return Promise.all(promises).then(() => originValue);
      }
    }
    // primitive type
    return Promise.resolve(value);
  }

  private _getEntityByConfig(entityConfig: IEntity) {
    // @ts-ignore
    const assetRefId: string = entityConfig.assetRefId;
    const engine = this._context.engine;
    if (assetRefId) {
      return engine.resourceManager
        .getResourceByRef({
          refId: assetRefId,
          key: (entityConfig as IRefEntity).key,
          isClone: (entityConfig as IRefEntity).isClone
        })
        .then((entity) => {
          entity.name = entityConfig.name;
          return entity;
        });
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
