import { EngineObject, Entity, Loader, Signal, Transform } from "@galacean/engine-core";
import type {
  IAssetRef,
  IBasicType,
  IClass,
  IClassType,
  IComponentRef,
  IEntity,
  IEntityRef,
  IHierarchyFile,
  IMethod,
  IMethodParams,
  IRefEntity,
  ISignalRef
} from "../schema";
import { ParserContext, ParserType } from "./ParserContext";

export class ReflectionParser {
  constructor(private readonly _context: ParserContext<IHierarchyFile, EngineObject>) {}

  parseEntity(entityConfig: IEntity): Promise<Entity> {
    return this._getEntityByConfig(entityConfig).then((entity) => {
      entity.isActive = entityConfig.isActive ?? true;
      const transform = entity.transform;
      const transformConfig = entityConfig.transform;
      if (transformConfig) {
        this.parsePropsAndMethods(transform, transformConfig);
      } else {
        const { position, rotation, scale } = entityConfig;
        if (position) transform.position.copyFrom(position);
        if (rotation) transform.rotation.copyFrom(rotation);
        if (scale) transform.scale.copyFrom(scale);
      }
      entity.layer = entityConfig.layer ?? entity.layer;
      // @ts-ignore
      this._context.type === ParserType.Prefab && entity._markAsTemplate(this._context.resource);
      return entity;
    });
  }

  parseClassObject(item: IClass) {
    const Class = Loader.getClass(item.class);
    const params = item.constructParams ?? [];
    return Promise.all(params.map((param) => this.parseBasicType(param)))
      .then((resultParams) => new Class(...resultParams))
      .then((instance) => this.parsePropsAndMethods(instance, item));
  }

  parsePropsAndMethods(instance: any, item: Omit<IClass, "class">) {
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

    return Promise.all(promises).then(() => instance);
  }

  parseMethod(instance: any, methodName: string, methodParams: IMethodParams) {
    const isMethodObject = ReflectionParser._isMethodObject(methodParams);
    const params = isMethodObject ? methodParams.params : methodParams;

    return Promise.all(params.map((param) => this.parseBasicType(param))).then((result) => {
      const methodResult = instance[methodName](...result);
      if (isMethodObject && methodParams.result) {
        return this.parsePropsAndMethods(methodResult, methodParams.result);
      } else {
        return methodResult;
      }
    });
  }

  parseSignal(signalRef: ISignalRef): Promise<Signal> {
    const signal = new Signal();
    return Promise.all(
      signalRef.listeners.map((listener) =>
        Promise.all([
          this.parseBasicType(listener.target),
          listener.arguments ? Promise.all(listener.arguments.map((a) => this.parseBasicType(a))) : Promise.resolve([])
        ]).then(([target, resolvedArgs]) => {
          if (target) {
            signal.on(target, listener.methodName, ...resolvedArgs);
          }
        })
      )
    ).then(() => signal);
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
          if (resource && context.type === ParserType.Prefab) {
            // @ts-ignore
            context.resource._addDependenceAsset(resource);
          }
          return resource;
        });
      } else if (ReflectionParser._isComponentRef(value)) {
        const entity = this._resolveEntityByPath(value.entityPath);
        if (!entity) return Promise.resolve(null);
        const type = Loader.getClass(value.componentType);
        if (!type) return Promise.resolve(null);
        let count = 0;
        // @ts-ignore
        const components = entity._components;
        for (let i = 0, n = components.length; i < n; i++) {
          if (components[i] instanceof type) {
            if (count === value.componentIndex) return Promise.resolve(components[i]);
            count++;
          }
        }
        return Promise.resolve(null);
      } else if (ReflectionParser._isEntityRef(value)) {
        return Promise.resolve(this._resolveEntityByPath(value.entityPath));
      } else if (ReflectionParser._isSignalRef(value)) {
        return this.parseSignal(value);
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
    const assetUrl: string = entityConfig.assetUrl;
    const engine = this._context.engine;

    if (assetUrl) {
      return (
        engine.resourceManager
          // @ts-ignore
          .getResourceByRef({
            url: assetUrl,
            key: (entityConfig as IRefEntity).key,
            isClone: (entityConfig as IRefEntity).isClone
          })
          .then((entity) => {
            // @ts-ignore
            const resource = engine.resourceManager._objectPool[assetUrl];
            if (resource && this._context.type === ParserType.Prefab) {
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

  private _resolveEntityByPath(entityPath: number[]): Entity | null {
    const { rootIds, entityMap } = this._context;
    if (!entityPath.length || entityPath[0] >= rootIds.length) return null;
    let entity = entityMap.get(rootIds[entityPath[0]]);
    for (let i = 1; i < entityPath.length; i++) {
      if (!entity || entityPath[i] >= entity.children.length) return null;
      entity = entity.children[entityPath[i]];
    }
    return entity;
  }

  private static _isClass(value: any): value is IClass {
    return value["class"] !== undefined;
  }

  private static _isClassType(value: any): value is IClassType {
    return value["classType"] !== undefined;
  }

  private static _isAssetRef(value: any): value is IAssetRef {
    return value["url"] !== undefined;
  }

  private static _isEntityRef(value: any): value is IEntityRef {
    return Array.isArray(value["entityPath"]) && value["componentType"] === undefined;
  }

  private static _isComponentRef(value: any): value is IComponentRef {
    return Array.isArray(value["entityPath"]) && value["componentType"] !== undefined;
  }

  private static _isSignalRef(value: any): value is ISignalRef {
    return value["listeners"] !== undefined;
  }

  private static _isMethodObject(value: any): value is IMethod {
    return Array.isArray(value?.params);
  }
}
