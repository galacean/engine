import {
  AssetPromise,
  assignmentClone,
  Canvas,
  ContentRestorer,
  deepClone,
  dependentComponents,
  Engine,
  EngineObject,
  Entity,
  ignoreClone,
  Loader,
  registerPointerEventEmitter,
  request,
  resourceLoader,
  ResourceManager,
  Scene,
  SceneManager,
  shallowClone,
  Transform
} from "@galacean/engine-core";
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

const hasOwn = Object.prototype.hasOwnProperty;
const objectPrototype = Object.prototype;

export class ReflectionParser {
  static customParseComponentHandles = new Map<string, Function>();

  private static readonly _allowedMethods: Record<string, true> = Object.assign(Object.create(null), {
    setMaterial: true,
    setMaterials: true,
    addShape: true,
    addEffect: true,
    addTransition: true,
    addBurst: true,
    addKey: true,
    addColorKey: true,
    addAlphaKey: true,
    addCurve: true,
    addGradient: true,
    set: true,
    setValue: true,
    copyFrom: true
  });

  private static readonly _disallowedBaseClasses: ReadonlyArray<Function> = [
    Engine,
    Scene,
    Entity,
    ResourceManager,
    SceneManager,
    Canvas,
    Loader,
    AssetPromise,
    ContentRestorer
  ];

  private static readonly _disallowedClasses = new Set<Function>([
    ...ReflectionParser._disallowedBaseClasses,
    registerPointerEventEmitter,
    request,
    resourceLoader,
    dependentComponents,
    ignoreClone,
    assignmentClone,
    shallowClone,
    deepClone
  ]);

  static registerCustomParseComponent(componentType: string, handle: Function) {
    this.customParseComponentHandles.set(componentType, handle);
  }

  /** @internal */
  static _resolveClass(className: unknown, baseClass?: Function): { new (...args: any[]): any } {
    const Class = Loader.getClass(className as string);
    if (typeof Class !== "function") {
      throw new Error("Serialized class is not registered: " + className);
    }
    if (baseClass) {
      if (Class !== baseClass && !(Class.prototype instanceof baseClass)) {
        throw new Error("Serialized class is not assignable to " + baseClass.name + ": " + className);
      }
      return Class;
    }
    if (!Class.prototype || ReflectionParser._disallowedClasses.has(Class)) {
      throw new Error("Serialized class is not allowed: " + className);
    }
    const disallowedBases = ReflectionParser._disallowedBaseClasses;
    for (let i = 0, n = disallowedBases.length; i < n; i++) {
      if (Class.prototype instanceof disallowedBases[i]) {
        throw new Error("Serialized class is not allowed: " + className);
      }
    }
    return Class;
  }

  constructor(private readonly _context: ParserContext<IHierarchyFile, EngineObject>) {}

  parseEntity(entityConfig: IEntity): Promise<Entity> {
    return this._getEntityByConfig(entityConfig).then((entity) => {
      if (this._context._aborted) return entity;
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
    let Class: { new (...args: any[]): any };
    try {
      Class = ReflectionParser._resolveClass(item.class);
    } catch (error) {
      return Promise.reject(error);
    }
    const params = item.constructParams;
    if (params !== undefined && !Array.isArray(params)) {
      return Promise.reject(new Error("Serialized constructParams must be an array"));
    }
    return Promise.all((params ?? []).map((param) => this.parseBasicType(param))).then((resultParams) => {
      if (!this._context._aborted) return this.parsePropsAndMethods(new Class(...resultParams), item);
    });
  }

  parsePropsAndMethods(instance: any, item: Omit<IClass, "class">) {
    if (!ReflectionParser._isSafeTarget(instance)) {
      return Promise.reject(new Error("Serialized properties and methods require a safe object instance"));
    }
    if (item == null || typeof item !== "object" || Array.isArray(item)) {
      return Promise.reject(new Error("Serialized properties and methods config must be an object"));
    }

    const promises: Promise<any>[] = [];
    if (ReflectionParser._hasOwnValue(item, "methods")) {
      this._parseMethods(instance, item.methods, promises);
    }

    if (ReflectionParser._hasOwnValue(item, "props") && item.props !== null) {
      const { props } = item;
      if (typeof props !== "object" || Array.isArray(props)) {
        return Promise.reject(new Error("Serialized props must be an object"));
      }
      for (const key in props) {
        if (!hasOwn.call(props, key)) continue;
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
    if (typeof methodName !== "string" || ReflectionParser._allowedMethods[methodName] !== true) {
      return Promise.reject(new Error("Serialized method is not allowed: " + methodName));
    }
    if (!ReflectionParser._isSafeTarget(instance)) {
      return Promise.reject(new Error("Serialized methods require a safe object instance"));
    }

    const isMethodObject = ReflectionParser._isMethodObject(methodParams);
    const params = isMethodObject ? methodParams.params : methodParams;
    if (!Array.isArray(params)) {
      return Promise.reject(new Error("Serialized method params must be an array: " + methodName));
    }

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
        try {
          return Promise.resolve(ReflectionParser._resolveClass(value["classType"]));
        } catch (error) {
          return Promise.reject(error);
        }
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
        if (!ReflectionParser._isSafeTarget(originValue)) {
          return Promise.reject(new Error("Serialized properties and methods require a safe object instance"));
        }

        const promises: Promise<any>[] = [];
        for (const key in value as any) {
          if (!hasOwn.call(value, key)) continue;
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
    if (methods == null) return;
    if (typeof methods !== "object" || Array.isArray(methods)) {
      promises.push(Promise.reject(new Error("Serialized methods must be an object")));
      return;
    }

    for (const methodName in methods) {
      if (!hasOwn.call(methods, methodName)) continue;
      const calls = methods[methodName];
      if (!Array.isArray(calls)) {
        promises.push(Promise.reject(new Error("Serialized method calls must be an array: " + methodName)));
        continue;
      }
      for (let i = 0, n = calls.length; i < n; i++) {
        promises.push(this.parseMethod(instance, methodName, calls[i]));
      }
    }
  }

  private _parseProperty(instance: any, key: string, value: IBasicType): Promise<void> {
    if (ReflectionParser._isReservedKey(key)) {
      return Promise.reject(new Error("Reserved serialized property: " + key));
    }
    const originValue = instance[key];
    if (ReflectionParser._isProtectedRuntimeObject(originValue)) {
      return Promise.reject(new Error("Protected serialized property: " + key));
    }
    return this.parseBasicType(value, originValue).then((parsedValue) => {
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
      let transformClass: { new (...args: any[]): any } = Transform;
      if (transform) {
        try {
          transformClass = ReflectionParser._resolveClass(transform.class, Transform);
        } catch (error) {
          return Promise.reject(error);
        }
      }
      const entity = new Entity(engine, entityConfig.name, transformClass);
      return Promise.resolve(entity);
    }
  }

  private static _isProtectedRuntimeObject(value: unknown): boolean {
    return (
      value === objectPrototype ||
      value === globalThis ||
      value instanceof Engine ||
      value instanceof Scene ||
      value instanceof ResourceManager ||
      value instanceof SceneManager ||
      value instanceof Canvas ||
      (typeof EventTarget !== "undefined" && value instanceof EventTarget)
    );
  }

  private static _isSafeTarget(value: unknown): boolean {
    return (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Entity) &&
      !ReflectionParser._isProtectedRuntimeObject(value)
    );
  }

  private static _isReservedKey(key: string): boolean {
    return key === "constructor" || key === "prototype" || key === "__proto__";
  }

  private static _hasOwnValue(value: any, key: string): boolean {
    return hasOwn.call(value, key) && value[key] !== undefined;
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
