import {
  AssetPromise,
  assignmentClone,
  Canvas,
  Component,
  ContentRestorer,
  deepClone,
  dependentComponents,
  Engine,
  Entity,
  ignoreClone,
  Loader,
  registerPointerEventEmitter,
  request,
  resourceLoader,
  ResourceManager,
  Scene,
  SceneManager
} from "@galacean/engine-core";
import { resolveRefItem } from "../../../schema/refs";
import type { CallSpec, ComponentRef, MutationBlock, RefItem, SignalListener } from "../../../schema/CommonSchema";
import { ParserContext, ParserType } from "./ParserContext";

const hasOwn = Object.prototype.hasOwnProperty;
const objectPrototype = Object.prototype;

export class ReflectionParser {
  /** @internal shared with HierarchyParser; each use must length=0 -> getComponents -> read -> length=0 synchronously. */
  static _componentBuffer: Component[] = [];

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
    Function,
    registerPointerEventEmitter,
    request,
    resourceLoader,
    dependentComponents,
    ignoreClone,
    assignmentClone,
    deepClone
  ]);

  private static _isReservedKey(key: string): boolean {
    return key === "constructor" || key === "prototype" || key === "__proto__";
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
      (typeof EventTarget !== "undefined" && value instanceof EventTarget) ||
      (typeof Location !== "undefined" && value instanceof Location) ||
      (typeof Storage !== "undefined" && value instanceof Storage) ||
      (typeof WebGLRenderingContext !== "undefined" && value instanceof WebGLRenderingContext) ||
      (typeof WebGL2RenderingContext !== "undefined" && value instanceof WebGL2RenderingContext)
    );
  }

  /** @internal */
  static _resolveClass(className: unknown, baseClass?: Function): { new (...args: any[]): any } {
    if (typeof className !== "string" || className.length === 0) {
      throw new Error("Serialized class name must be a non-empty string");
    }

    const Class = Loader.getClass(className);
    if (typeof Class !== "function") {
      throw new Error(`Loader.getClass: class "${className}" is not registered`);
    }
    if (baseClass) {
      if (Class !== baseClass && !(Class.prototype instanceof baseClass)) {
        throw new Error(`Serialized class "${className}" is not assignable to ${baseClass.name}`);
      }
      return Class;
    }
    if (!Class.prototype || ReflectionParser._disallowedClasses.has(Class)) {
      throw new Error(`Serialized class is not allowed: "${className}"`);
    }
    const disallowedBases = ReflectionParser._disallowedBaseClasses;
    for (let i = 0, n = disallowedBases.length; i < n; i++) {
      if (Class.prototype instanceof disallowedBases[i]) {
        throw new Error(`Serialized class is not allowed: "${className}"`);
      }
    }
    return Class;
  }

  private static _isSafeTarget(value: unknown): boolean {
    return (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Entity) &&
      !ReflectionParser._isProtectedRuntimeObject(value)
    );
  }

  constructor(
    private readonly _context: ParserContext,
    private readonly _refs: RefItem[]
  ) {}

  /**
   * Apply v2 props to a component/object instance.
   * Each prop value is resolved recursively (handling $ref, $number, $type, $class, $entity, $component, $signal).
   */
  parseProps(instance: any, props?: Record<string, unknown>): Promise<any> {
    if (!ReflectionParser._isSafeTarget(instance)) {
      return Promise.reject(new Error("Serialized properties require a safe object instance"));
    }
    const promises: Promise<any>[] = [];
    if (props) {
      for (const key in props) {
        if (!hasOwn.call(props, key)) continue;
        if (ReflectionParser._isReservedKey(key)) {
          return Promise.reject(new Error("Reserved serialized property: " + key));
        }
        const originValue = instance[key];
        if (typeof originValue === "function" || ReflectionParser._isProtectedRuntimeObject(originValue)) {
          return Promise.reject(new Error("Protected serialized property: " + key));
        }
        const promise = this._resolveValue(props[key], originValue).then((v) => {
          instance[key] = v;
        });
        promises.push(promise);
      }
    }
    return Promise.all(promises).then(() => instance);
  }

  /**
   * Execute calls sequentially on a target instance.
   * Call args are resolved with the same v2 value rules as props.
   */
  parseCalls(instance: any, calls?: CallSpec[]): Promise<any> {
    if (!calls?.length) return Promise.resolve(instance);
    if (!ReflectionParser._isSafeTarget(instance)) {
      return Promise.reject(new Error("Serialized calls require a safe object instance"));
    }

    let chain = Promise.resolve();
    for (let i = 0, n = calls.length; i < n; i++) {
      const call = calls[i];
      chain = chain.then(() => {
        if (ReflectionParser._isReservedKey(call.method) || hasOwn.call(objectPrototype, call.method)) {
          return Promise.reject(new Error("Reserved serialized method: " + call.method));
        }
        let target = instance;
        if (call.target !== undefined) {
          if (!Array.isArray(call.target) || call.target.some((key) => typeof key !== "string" || key.length === 0)) {
            return Promise.reject(new Error(`Call "${call.method}" target must be an array of non-empty strings`));
          }
          for (const key of call.target) {
            if (ReflectionParser._isReservedKey(key) || hasOwn.call(objectPrototype, key)) {
              return Promise.reject(new Error("Reserved serialized property: " + key));
            }
            target = target?.[key];
            if (!ReflectionParser._isSafeTarget(target)) {
              return Promise.reject(new Error("Serialized call target is not a safe object instance"));
            }
          }
        }
        if (!ReflectionParser._isSafeTarget(target)) {
          return Promise.reject(new Error("Serialized call target is not a safe object instance"));
        }
        const method = target?.[call.method];
        if (typeof method !== "function") {
          const path = call.target?.length ? `${call.target.join(".")}.` : "";
          return Promise.reject(new Error(`Call target does not have method "${path}${call.method}"`));
        }
        if (method === Function || method === (globalThis as any).eval) {
          return Promise.reject(new Error("Disallowed serialized method: " + call.method));
        }

        return Promise.all((call.args ?? []).map((arg) => this._resolveValue(arg)))
          .then((resolvedArgs) => Promise.resolve(Function.prototype.apply.call(method, target, resolvedArgs)))
          .then((result) => {
            if (!call.result) return result;
            if (!ReflectionParser._isSafeTarget(result)) {
              return Promise.reject(
                new Error(`Call "${call.method}" returned an unsafe value and cannot be mutated by result`)
              );
            }
            return this.parseMutationBlock(result, call.result);
          });
      });
    }

    return chain.then(() => instance);
  }

  /**
   * Apply props before executing calls from the same mutation block.
   */
  parseMutationBlock(target: any, block?: MutationBlock): Promise<any> {
    if (!block) return Promise.resolve(target);
    return this.parseProps(target, block.props)
      .then(() => this.parseCalls(target, block.calls))
      .then(() => target);
  }

  /**
   * Resolve a v2 value with $ prefix detection.
   *
   * Priority:
   * 1. null/undefined/primitive → passthrough
   * 2. Array → recurse each element
   * 3. { $ref }       → asset reference
   * 4. { $number }    → JSON-safe special number
   * 5. { $type, $args? } → polymorphic type construct
   * 6. { $class }     → registered class constructor
   * 7. { $entity }    → entity reference by path (flat index + optional children descent)
   * 8. { $component } → component reference
   * 9. { $signal }    → signal binding
   * 10. plain object  → recurse values (modify originValue in place if exists)
   */
  private _resolveValue(value: unknown, originValue?: any): Promise<any> {
    if (value == null || typeof value !== "object") return Promise.resolve(value);
    if (Array.isArray(value)) return Promise.all(value.map((v) => this._resolveValue(v)));

    const obj = value as Record<string, unknown>;

    if (hasOwn.call(obj, "$args") && !hasOwn.call(obj, "$type")) {
      return Promise.reject(new Error("$args requires $type"));
    }

    // $ref — asset reference (index into refs array)
    if (hasOwn.call(obj, "$ref")) {
      const { _context: context } = this;
      let refItem: RefItem;
      try {
        refItem = resolveRefItem(this._refs, obj.$ref as number, "ReflectionParser", "$ref");
      } catch (error) {
        return Promise.reject(error);
      }
      return context.resourceManager.getResourceByRef(refItem).then((resource) => {
        if (resource && context.type === ParserType.Prefab) {
          // @ts-ignore
          context.resource._addDependenceAsset(resource);
        }
        return resource;
      });
    }

    if (hasOwn.call(obj, "$number")) {
      if (Object.keys(obj).length !== 1 || obj.$number !== "Infinity") {
        return Promise.reject(new Error('$number must be exactly "Infinity"'));
      }
      return Promise.resolve(Infinity);
    }

    // $type — polymorphic type: resolve constructor args, construct instance, then apply remaining props
    if (hasOwn.call(obj, "$type")) {
      const { $type, $args, ...rest } = obj;
      if ($args !== undefined && !Array.isArray($args)) {
        return Promise.reject(new Error("$args must be an array when used with $type"));
      }
      const constructorArgs = Array.isArray($args) ? $args : [];
      return this._resolveRegisteredClass($type, "$type").then((Class) => {
        return Promise.all(constructorArgs.map((arg) => this._resolveValue(arg))).then((args) => {
          const instance = new Class(...args);
          return Object.keys(rest).length > 0 ? this.parseProps(instance, rest) : instance;
        });
      });
    }

    // $class — registered class constructor for factory-style methods.
    if (hasOwn.call(obj, "$class")) {
      return this._resolveRegisteredClass(obj.$class, "$class");
    }

    // $entity — entity reference by path (first element = flat index, subsequent = children indices)
    if (hasOwn.call(obj, "$entity")) {
      try {
        return Promise.resolve(this._resolveEntityRef(obj.$entity as number[]));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    // $component — component reference: { entity, type, index }
    if (hasOwn.call(obj, "$component")) {
      try {
        return Promise.resolve(this._resolveComponent(obj.$component as ComponentRef));
      } catch (error) {
        return Promise.reject(error);
      }
    }

    // $signal — signal binding: register listeners on the existing Signal instance
    if (hasOwn.call(obj, "$signal")) {
      return this._resolveSignal(originValue, obj.$signal as SignalListener[]);
    }

    // Plain object — recurse each value, modifying originValue in place or building a new object
    const target =
      originValue && typeof originValue === "object" && !Array.isArray(originValue)
        ? originValue
        : ({} as Record<string, unknown>);
    if (!ReflectionParser._isSafeTarget(target)) {
      return Promise.reject(new Error("Serialized properties require a safe object instance"));
    }
    const promises: Promise<any>[] = [];
    for (const key in obj) {
      if (!hasOwn.call(obj, key)) continue;
      if (ReflectionParser._isReservedKey(key)) {
        return Promise.reject(new Error("Reserved serialized property: " + key));
      }
      const nestedOrigin = target[key];
      if (typeof nestedOrigin === "function" || ReflectionParser._isProtectedRuntimeObject(nestedOrigin)) {
        return Promise.reject(new Error("Protected serialized property: " + key));
      }
      promises.push(this._resolveValue(obj[key], nestedOrigin).then((v) => (target[key] = v)));
    }
    return Promise.all(promises).then(() => target);
  }

  private _getRegisteredClass(value: unknown, sentinel: "$type" | "$class"): any {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${sentinel} must be a non-empty registered class name string`);
    }
    return ReflectionParser._resolveClass(value);
  }

  /** Promise-adapt {@link _getRegisteredClass} so $type/$class branches can fold into the resolver chain. */
  private _resolveRegisteredClass(value: unknown, sentinel: "$type" | "$class"): Promise<any> {
    try {
      return Promise.resolve(this._getRegisteredClass(value, sentinel));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  private _resolveSignal(signal: any, listeners: SignalListener[]): Promise<any> {
    if (!signal || typeof signal.on !== "function") {
      return Promise.reject(new Error("$signal requires a pre-initialized Signal instance on the target property"));
    }
    const promises = listeners.map((listener) => {
      if (!listener?.target?.$component) {
        return Promise.reject(new Error("$signal listener requires target.$component"));
      }
      let targetComponent: Component | null;
      try {
        targetComponent = this._resolveComponent(listener.target.$component);
      } catch (error) {
        return Promise.reject(error);
      }
      if (!targetComponent) return Promise.resolve();

      return Promise.all((listener.args ?? []).map((a) => this._resolveValue(a))).then((resolvedArgs) => {
        signal.on(targetComponent, listener.methodName, ...resolvedArgs);
      });
    });
    return Promise.all(promises).then(() => signal);
  }

  private _resolveComponent(comp: ComponentRef): Component | null {
    if (!comp || typeof comp !== "object") {
      throw new Error("Serialized $component reference must be an object");
    }
    if (typeof comp.index !== "number" || !Number.isInteger(comp.index) || comp.index < 0) {
      throw new Error(`Serialized $component index must be a non-negative integer`);
    }
    if (typeof comp.type !== "string" || comp.type.length === 0) {
      throw new Error("Serialized $component type must be a non-empty string");
    }
    const entity = this._resolveEntityRef(comp.entity);
    if (!entity) return null;
    const type = Loader.getClass(comp.type);
    if (!type) return null;
    if (typeof type !== "function" || (type !== Component && !(type.prototype instanceof Component))) {
      throw new Error(`Serialized class "${comp.type}" is not assignable to Component`);
    }
    const buffer = ReflectionParser._componentBuffer;
    buffer.length = 0;
    entity.getComponents(type, buffer);
    const result = comp.index < buffer.length ? buffer[comp.index] : null;
    buffer.length = 0;
    return result;
  }

  private _resolveEntityRef(path: number[]): Entity | null {
    if (path == null) return null;
    if (!Array.isArray(path)) {
      throw new Error("Serialized $entity path must be an array");
    }
    if (path.length === 0) return null;
    const rootIndex = path[0];
    if (typeof rootIndex !== "number" || !Number.isInteger(rootIndex) || rootIndex < 0) {
      throw new Error("Serialized $entity path index must be a non-negative integer");
    }
    const entityInstances = this._context.entityInstances;
    let entity = rootIndex < entityInstances.length ? entityInstances[rootIndex] : null;
    for (let i = 1, n = path.length; entity && i < n; i++) {
      const childIndex = path[i];
      if (typeof childIndex !== "number" || !Number.isInteger(childIndex) || childIndex < 0) {
        throw new Error("Serialized $entity path index must be a non-negative integer");
      }
      entity = childIndex < entity.children.length ? entity.children[childIndex] : null;
    }
    return entity;
  }
}
