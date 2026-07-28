import { Component, Entity, Loader } from "@galacean/engine-core";
import { resolveRefItem } from "../../../schema/refs";
import type { CallSpec, ComponentRef, MutationBlock, RefItem, SignalListener } from "../../../schema/CommonSchema";
import { ParserContext, ParserType } from "./ParserContext";

export class ReflectionParser {
  /** @internal shared with HierarchyParser; each use must length=0 -> getComponents -> read -> length=0 synchronously. */
  static _componentBuffer: Component[] = [];

  constructor(
    private readonly _context: ParserContext,
    private readonly _refs: RefItem[]
  ) {}

  /**
   * Apply v2 props to a component/object instance.
   * Each prop value is resolved recursively (handling $ref, $number, $type, $class, $entity, $component, $signal).
   */
  parseProps(instance: any, props?: Record<string, unknown>): Promise<any> {
    const promises: Promise<any>[] = [];
    if (props) {
      for (const key in props) {
        const promise = this._resolveValue(props[key], instance[key]).then((v) => {
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

    let chain = Promise.resolve();
    for (let i = 0, n = calls.length; i < n; i++) {
      const call = calls[i];
      chain = chain.then(() => {
        let target = instance;
        if (call.target !== undefined) {
          if (!Array.isArray(call.target) || call.target.some((key) => typeof key !== "string" || key.length === 0)) {
            return Promise.reject(new Error(`Call "${call.method}" target must be an array of non-empty strings`));
          }
          for (const key of call.target) target = target?.[key];
        }
        const method = target?.[call.method];
        if (typeof method !== "function") {
          const path = call.target?.length ? `${call.target.join(".")}.` : "";
          return Promise.reject(new Error(`Call target does not have method "${path}${call.method}"`));
        }

        return Promise.all((call.args ?? []).map((arg) => this._resolveValue(arg)))
          .then((resolvedArgs) => Promise.resolve(method.apply(target, resolvedArgs)))
          .then((result) => {
            if (!call.result) return result;
            if (result == null || (typeof result !== "object" && typeof result !== "function")) {
              return Promise.reject(
                new Error(`Call "${call.method}" returned ${result} and cannot be mutated by result`)
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

    if ("$args" in obj && !("$type" in obj)) {
      return Promise.reject(new Error("$args requires $type"));
    }

    // $ref — asset reference (index into refs array)
    if ("$ref" in obj) {
      const { _context: context } = this;
      let refItem: RefItem;
      try {
        refItem = resolveRefItem(this._refs, obj.$ref as number, "ReflectionParser", "$ref");
      } catch (error) {
        return Promise.reject(error);
      }
      // @ts-ignore
      return context.resourceManager.getResourceByRef(refItem).then((resource) => {
        if (resource && context.type === ParserType.Prefab) {
          // @ts-ignore
          context.resource._addDependenceAsset(resource);
        }
        return resource;
      });
    }

    if ("$number" in obj) {
      if (Object.keys(obj).length !== 1 || obj.$number !== "Infinity") {
        return Promise.reject(new Error('$number must be exactly "Infinity"'));
      }
      return Promise.resolve(Infinity);
    }

    // $type — polymorphic type: resolve constructor args, construct instance, then apply remaining props
    if ("$type" in obj) {
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
    if ("$class" in obj) {
      return this._resolveRegisteredClass(obj.$class, "$class");
    }

    // $entity — entity reference by path (first element = flat index, subsequent = children indices)
    if ("$entity" in obj) {
      return Promise.resolve(this._resolveEntityRef(obj.$entity as number[]));
    }

    // $component — component reference: { entity, type, index }
    if ("$component" in obj) {
      return Promise.resolve(this._resolveComponent(obj.$component as ComponentRef));
    }

    // $signal — signal binding: register listeners on the existing Signal instance
    if ("$signal" in obj) {
      return this._resolveSignal(originValue, obj.$signal as SignalListener[]);
    }

    // Plain object — recurse each value, modifying originValue in place or building a new object
    const target =
      originValue && typeof originValue === "object" && !Array.isArray(originValue)
        ? originValue
        : ({} as Record<string, unknown>);
    const promises: Promise<any>[] = [];
    for (const key in obj) {
      promises.push(this._resolveValue(obj[key], target[key]).then((v) => (target[key] = v)));
    }
    return Promise.all(promises).then(() => target);
  }

  private _getRegisteredClass(value: unknown, sentinel: "$type" | "$class"): any {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`${sentinel} must be a non-empty registered class name string`);
    }

    const Class = Loader.getClass(value);
    if (!Class) throw new Error(`Loader.getClass: class "${value}" is not registered`);
    return Class;
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
      const targetComponent = this._resolveComponent(listener.target.$component);
      if (!targetComponent) return Promise.resolve();

      return Promise.all((listener.args ?? []).map((a) => this._resolveValue(a))).then((resolvedArgs) => {
        signal.on(targetComponent, listener.methodName, ...resolvedArgs);
      });
    });
    return Promise.all(promises).then(() => signal);
  }

  private _resolveComponent(comp: ComponentRef): Component | null {
    const entity = this._resolveEntityRef(comp.entity);
    if (!entity) return null;
    const type = Loader.getClass(comp.type);
    if (!type) return null;
    const buffer = ReflectionParser._componentBuffer;
    buffer.length = 0;
    entity.getComponents(type, buffer);
    let result = buffer[comp.index] ?? null;
    if (!result) {
      buffer.length = 0;
      entity.getComponentsIncludeChildren(type, buffer);
      result = buffer[comp.index] ?? null;
    }
    buffer.length = 0;
    return result;
  }

  private _resolveEntityRef(path: number[]): Entity | null {
    if (!path || path.length === 0) return null;
    let entity = this._context.entityInstances[path[0]] ?? null;
    for (let i = 1, n = path.length; entity && i < n; i++) {
      entity = entity.children[path[i]] ?? null;
    }
    return entity;
  }
}
