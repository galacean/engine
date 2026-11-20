import { EngineObject, Entity, Loader, Transform } from "@galacean/engine-core";
import type {
  IAssetRef,
  IBasicType,
  IClass,
  IClassType,
  IComponentRef,
  IEntity,
  IEntityRef,
  IHierarchyFile,
  IInstance,
  IMethod,
  IMethodParams,
  IRefEntity
} from "../schema";
import { ParserContext, ParserType } from "./ParserContext";

export class ReflectionParser {
  static customParseComponentHandles = new Map<string, Function>();

  static registerCustomParseComponent(componentType: string, handle: Function) {
    this.customParseComponentHandles.set(componentType, handle);
  }

  constructor(private readonly _context: ParserContext<IHierarchyFile, EngineObject>) {}

  parseEntity(entityConfig: IEntity): Promise<Entity> {
    return this._getEntityByConfig(entityConfig).then((entity) => {
      entity.isActive = entityConfig.isActive ?? true;
      const transform = entity.transform;
      const transformConfig = entityConfig.transform;
      const transformPromise = transformConfig && this.parsePropsAndMethods(transform, transformConfig);
      if (!transformConfig) {
        const { position, rotation, scale } = entityConfig;
        if (position) transform.position.copyFrom(position);
        if (rotation) transform.rotation.copyFrom(rotation);
        if (scale) transform.scale.copyFrom(scale);
      }
      entity.layer = entityConfig.layer ?? entity.layer;
      // @ts-ignore
      this._context.type === ParserType.Prefab && entity._markAsTemplate(this._context.resource);
      return transformPromise ? transformPromise.then(() => entity) : entity;
    });
  }

  parseClassObject(item: IClass) {
    const Class = Loader.getClass(item.class);
    if (!Class) return Promise.reject(new Error("Serialized class is not registered"));
    const params = item.constructParams ?? [];
    return Promise.all(params.map((param) => this.parseBasicType(param))).then((resultParams) => {
      if (!this._context._aborted) return this.parsePropsAndMethods(new Class(...resultParams), item);
    });
  }

  parsePropsAndMethods(instance: any, item: Omit<IClass, "class">) {
    if (!ReflectionParser._isObjectTarget(instance)) {
      return Promise.reject(new Error("Serialized properties and methods require an object instance"));
    }

    const promises: Promise<any>[] = [];
    if (ReflectionParser._hasOwnValue(item, "methods")) {
      this._parseMethods(instance, item.methods, promises);
    }

    if (ReflectionParser._hasOwnValue(item, "props") && item.props) {
      const { props } = item;
      for (const key of Object.keys(props)) {
        promises.push(this._parseProperty(instance, key, props[key]));
      }
    }

    return Promise.all(promises).then(() => {
      if (this._context._aborted) return instance;
      const handle = ReflectionParser.customParseComponentHandles.get(instance.constructor?.name);
      if (handle) return handle(instance, item);
      else return instance;
    });
  }

  parseMethod(instance: any, methodName: string, methodParams: IMethodParams) {
    if (
      typeof methodName !== "string" ||
      ReflectionParser._isReservedKey(methodName) ||
      Object.prototype.hasOwnProperty.call(Object.prototype, methodName)
    ) {
      return Promise.reject(new Error("Reserved serialized method: " + methodName));
    }
    if (!ReflectionParser._isObjectTarget(instance)) {
      return Promise.reject(new Error("Serialized methods require an object instance"));
    }

    const isMethodObject = ReflectionParser._isMethodObject(methodParams);
    const params = isMethodObject ? methodParams.params : methodParams;

    return Promise.all(params.map((param) => this.parseBasicType(param))).then((result) => {
      if (this._context._aborted) return;
      const method = instance[methodName];
      if (typeof method !== "function") {
        throw new Error("Serialized method is not callable: " + methodName);
      }
      const methodResult = Function.prototype.apply.call(method, instance, result);
      if (isMethodObject && ReflectionParser._hasOwnValue(methodParams, "result") && methodParams.result) {
        return this.parsePropsAndMethods(methodResult, methodParams.result);
      } else {
        return methodResult;
      }
    });
  }

  parseBasicType(value: IBasicType, originValue?: any): Promise<any> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.parseBasicType(item)));
    } else if (typeof value === "object" && value != null) {
      if (ReflectionParser._isClassType(value)) {
        return Promise.resolve(Loader.getClass(value["classType"]));
      } else if (ReflectionParser._isClass(value)) {
        // class object
        return this.parseClassObject(value);
      } else if (ReflectionParser._isAssetRef(value)) {
        const { _context: context } = this;
        // reference object
        // @ts-ignore
        return context.resourceManager.getResourceByRef(value).then((resource) => {
          if (context.type === ParserType.Prefab) {
            // @ts-ignore
            context.resource._addDependenceAsset(resource);
          }
          return resource;
        });
      } else if (ReflectionParser._isComponentRef(value)) {
        return Promise.resolve(this._context.components.get(value.componentId) ?? null);
      } else if (ReflectionParser._isEntityRef(value)) {
        // entity reference
        return Promise.resolve(this._context.entityMap.get(value.entityId));
      } else if (originValue) {
        if (!ReflectionParser._isObjectTarget(originValue)) {
          return Promise.reject(new Error("Serialized properties and methods require an object instance"));
        }

        const promises: Promise<any>[] = [];
        for (const key of Object.keys(value)) {
          if (key === "methods") {
            this._parseMethods(originValue, value[key], promises);
          } else {
            promises.push(this._parseProperty(originValue, key, value[key]));
          }
        }
        return Promise.all(promises).then(() => originValue);
      }
    }
    // primitive type
    return Promise.resolve(value);
  }

  private _parseMethods(instance: any, methods: IInstance["methods"], promises: Promise<any>[]): void {
    if (!methods) return;

    for (const methodName of Object.keys(methods)) {
      const calls = methods[methodName];
      for (let i = 0, n = calls.length; i < n; i++) {
        promises.push(this.parseMethod(instance, methodName, calls[i]));
      }
    }
  }

  private _parseProperty(instance: any, key: string, value: IBasicType): Promise<void> {
    if (ReflectionParser._isReservedKey(key)) {
      return Promise.reject(new Error("Reserved serialized property: " + key));
    }
    return this.parseBasicType(value, instance[key]).then((parsedValue) => {
      if (!this._context._aborted) instance[key] = parsedValue;
    });
  }

  private _getEntityByConfig(entityConfig: IEntity) {
    // @ts-ignore
    const assetRefId: string = entityConfig.assetRefId;
    const engine = this._context.engine;

    if (assetRefId) {
      return (
        engine.resourceManager
          // @ts-ignore
          .getResourceByRef({
            refId: assetRefId,
            key: (entityConfig as IRefEntity).key,
            isClone: (entityConfig as IRefEntity).isClone
          })
          .then((entity) => {
            // @ts-ignore
            const resource = engine.resourceManager._objectPool[assetRefId];
            if (this._context.type === ParserType.Prefab) {
              // @ts-ignore
              this._context.resource._addDependenceAsset(resource);
            }
            entity.name = entityConfig.name;
            return entity;
          })
      );
    } else {
      const transform = entityConfig.transform;
      const entity = new Entity(engine, entityConfig.name, transform ? Loader.getClass(transform.class) : Transform);
      return Promise.resolve(entity);
    }
  }

  private static _isObjectTarget(value: unknown): boolean {
    return value !== null && typeof value === "object" && value !== Object.prototype;
  }

  private static _isReservedKey(key: string): boolean {
    return key === "constructor" || key === "prototype" || key === "__proto__";
  }

  private static _hasOwnValue(value: any, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key) && value[key] !== undefined;
  }

  private static _isClass(value: any): value is IClass {
    return ReflectionParser._hasOwnValue(value, "class");
  }

  private static _isClassType(value: any): value is IClassType {
    return ReflectionParser._hasOwnValue(value, "classType");
  }

  private static _isAssetRef(value: any): value is IAssetRef {
    return ReflectionParser._hasOwnValue(value, "refId");
  }

  private static _isEntityRef(value: any): value is IEntityRef {
    return ReflectionParser._hasOwnValue(value, "entityId");
  }

  private static _isComponentRef(value: any): value is IComponentRef {
    return ReflectionParser._hasOwnValue(value, "ownerId") && ReflectionParser._hasOwnValue(value, "componentId");
  }

  private static _isMethodObject(value: any): value is IMethod {
    return value != null && ReflectionParser._hasOwnValue(value, "params") && Array.isArray(value.params);
  }
}
