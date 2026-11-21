import { Component, EngineObject, Entity, Loader } from "@galacean/engine-core";
import { resolveRefItem } from "../../../schema/refs";
import type { CallSpec, ComponentRef, MutationBlock, RefItem, SignalListener } from "../../../schema/CommonSchema";
import { ParserContext, ParserType } from "./ParserContext";

type MutationTargets = EngineObject | { target: EngineObject; parent: MutationTargets };

export class ReflectionParser {
  constructor(
    private readonly _context: ParserContext,
    private readonly _refs: RefItem[]
  ) {}

  /**
   * Apply v2 props to a component/object instance.
   * Each prop value is resolved recursively (handling $ref, $number, $type, $class, $entity, $component, $signal).
   */
  parseProps(
    instance: any,
    props?: Record<string, unknown>,
    targets: MutationTargets | undefined = instance instanceof EngineObject ? instance : undefined
  ): Promise<any> {
    if (!props) return Promise.resolve(instance);

    let promises: Promise<any>[] | null = null;
    try {
      for (const key in props) {
        if (!this._canMutate(targets)) break;
        const raw = props[key];
        if (raw == null || typeof raw !== "object") {
          instance[key] = raw;
        } else {
          (promises ||= []).push(
            this._resolveValue(raw, targets, instance[key]).then((v) => {
              if (this._canMutate(targets)) {
                instance[key] = v;
              }
            })
          );
        }
      }
    } catch (error) {
      if (!promises) return Promise.reject(error);
      promises.push(Promise.reject(error));
    }
    return promises ? Promise.all(promises).then(() => instance) : Promise.resolve(instance);
  }

  /**
   * Resolve arguments, execute each call, and apply its result block before continuing.
   * @remarks Pending mutations stop when an enclosing engine object or the owning resource is destroyed.
   */
  async parseCalls(
    instance: any,
    calls?: CallSpec[],
    targets: MutationTargets | undefined = instance instanceof EngineObject ? instance : undefined
  ): Promise<any> {
    if (!calls) return instance;

    for (let i = 0, n = calls.length; i < n; i++) {
      if (!this._canMutate(targets)) break;
      const call = calls[i];
      const path = call.target;
      let target = instance;
      let callTargets = targets;
      if (path !== undefined) {
        if (!Array.isArray(path) || path.some((key) => typeof key !== "string" || key.length === 0)) {
          throw new Error(`Call "${call.method}" target must be an array of non-empty strings`);
        }
        for (const key of path) {
          target = target?.[key];
          callTargets = ReflectionParser._withMutationTarget(callTargets, target);
        }
        if (!this._canMutate(callTargets)) continue;
      }
      const method = target?.[call.method];
      // A method getter can destroy an owner before returning a value.
      if (!this._canMutate(callTargets)) continue;
      if (typeof method !== "function") {
        const prefix = path?.length ? `${path.join(".")}.` : "";
        throw new Error(`Call target does not have method "${prefix}${call.method}"`);
      }

      const args = call.args;
      const resolvedArgs = await (args?.length
        ? Promise.all(args.map((arg) => this._resolveValue(arg, callTargets)))
        : undefined);
      if (!this._canMutate(callTargets)) continue;

      const result = await method.apply(target, resolvedArgs);
      if (call.result && this._canMutate(callTargets)) {
        if (result == null || (typeof result !== "object" && typeof result !== "function")) {
          throw new Error(`Call "${call.method}" returned ${result} and cannot be mutated by result`);
        }
        await this.parseMutationBlock(result, call.result, ReflectionParser._withMutationTarget(callTargets, result));
      }
    }

    return instance;
  }

  /**
   * Apply props before executing calls from the same mutation block.
   */
  parseMutationBlock(
    target: any,
    block?: MutationBlock,
    targets: MutationTargets | undefined = target instanceof EngineObject ? target : undefined
  ): Promise<any> {
    if (!block) return Promise.resolve(target);
    const props = this.parseProps(target, block.props, targets);
    const calls = block.calls;
    return calls?.length ? props.then(() => this.parseCalls(target, calls, targets)) : props;
  }

  private static _withMutationTarget(
    targets: MutationTargets | undefined,
    target: unknown
  ): MutationTargets | undefined {
    if (!(target instanceof EngineObject)) return targets;
    if (!targets) return target;
    if (targets === target || (!(targets instanceof EngineObject) && targets.target === target)) return targets;
    return { target, parent: targets };
  }

  private _canMutate(targets: MutationTargets | undefined): boolean {
    if (this._context.resource.destroyed) return false;
    while (targets && !(targets instanceof EngineObject)) {
      if (targets.target.destroyed) return false;
      targets = targets.parent;
    }
    return !targets?.destroyed;
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
  private _resolveValue(value: unknown, targets: MutationTargets | undefined, originValue?: any): Promise<any> {
    if (value == null || typeof value !== "object") return Promise.resolve(value);
    if (Array.isArray(value)) return Promise.all(value.map((v) => this._resolveValue(v, targets)));

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
      return context.resourceManager.getResourceByRef(refItem).then((resource) => {
        if (resource && context.type === ParserType.Prefab && this._canMutate(targets)) {
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
        if (!this._canMutate(targets)) return;
        return Promise.all(constructorArgs.map((arg) => this._resolveValue(arg, targets))).then((args) => {
          if (!this._canMutate(targets)) return;
          const instance = new Class(...args);
          return Object.keys(rest).length > 0
            ? this.parseProps(instance, rest, ReflectionParser._withMutationTarget(targets, instance))
            : instance;
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
      return this._resolveSignal(originValue, obj.$signal as SignalListener[], targets);
    }

    // Plain object — recurse each value, modifying originValue in place or building a new object
    const target =
      originValue && typeof originValue === "object" && !Array.isArray(originValue)
        ? originValue
        : ({} as Record<string, unknown>);
    return this.parseProps(target, obj, ReflectionParser._withMutationTarget(targets, target));
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

  private _resolveSignal(signal: any, listeners: SignalListener[], targets: MutationTargets | undefined): Promise<any> {
    if (!signal || typeof signal.on !== "function") {
      return Promise.reject(new Error("$signal requires a pre-initialized Signal instance on the target property"));
    }
    const promises = listeners.map((listener) => {
      const targetComponent = this._resolveComponent(listener.target.$component);
      if (!targetComponent) return Promise.resolve();

      return Promise.all((listener.args ?? []).map((a) => this._resolveValue(a, targets))).then((resolvedArgs) => {
        if (!targetComponent.destroyed && this._canMutate(targets)) {
          signal.on(targetComponent, listener.methodName, ...resolvedArgs);
        }
      });
    });
    return Promise.all(promises).then(() => signal);
  }

  private _resolveComponent(comp: ComponentRef): Component | null {
    const entity = this._resolveEntityRef(comp.entity);
    if (!entity) return null;
    const type = Loader.getClass(comp.type);
    if (!type) return null;
    const components = this._context.componentSnapshots?.get(entity) ?? entity._components;
    const result = ParserContext._findComponent(components, type, comp.index);
    return result?.destroyed ? null : result;
  }

  private _resolveEntityRef(path: number[]): Entity | null {
    if (!path || path.length === 0) return null;
    let entity: Entity | null = this._context.entityInstances[path[0]] ?? null;
    const childSnapshots = this._context.childSnapshots;
    for (let i = 1, n = path.length; entity && i < n; i++) {
      const children = childSnapshots?.get(entity) ?? entity.children;
      entity = children[path[i]] ?? null;
    }
    return entity && !entity.destroyed ? entity : null;
  }
}
