import { Component, Entity, Loader } from "@galacean/engine-core";
import { resolveRefItem } from "../../../schema/refs";
import type { CallSpec, ComponentRef, MutationBlock, RefItem, SignalListener } from "../../../schema/CommonSchema";
import { ParserContext, ParserType } from "./ParserContext";

export interface DeferredPropCheck {
  predicates: Record<string, (value: unknown) => boolean>;
  deferredValues: Record<string, unknown>;
}

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
  parseProps(
    instance: any,
    props?: Record<string, unknown>,
    deferCheck?: DeferredPropCheck,
    preResolvedProps?: Record<string, unknown>
  ): Promise<any> {
    let hasPreResolved = false;
    if (preResolvedProps) {
      for (const _ in preResolvedProps) {
        hasPreResolved = true;
        break;
      }
    }
    if (!props && !hasPreResolved) return Promise.resolve(instance);

    const assignProp = (key: string, value: unknown): void => {
      const predicate = deferCheck?.predicates[key];
      if (predicate && predicate(value)) {
        deferCheck!.deferredValues[key] = value;
      } else {
        instance[key] = value;
        if (predicate && instance[key] !== value) {
          deferCheck!.deferredValues[key] = value;
        }
      }
    };

    const applyPreResolved = (): void => {
      if (!hasPreResolved) return;
      for (const key in preResolvedProps) {
        if (!props || !(key in props)) {
          instance[key] = preResolvedProps[key];
        }
      }
    };

    try {
      const coupledKeys: readonly string[] | undefined = instance?.constructor?._deserializeCoupledProps;
      if (coupledKeys?.length && typeof instance._applyDeserializeCoupledProps === "function") {
        let coupledCount = 0;
        for (let i = 0, n = coupledKeys.length; i < n; i++) {
          const key = coupledKeys[i];
          if (
            (props && Object.prototype.hasOwnProperty.call(props, key)) ||
            (hasPreResolved && Object.prototype.hasOwnProperty.call(preResolvedProps, key))
          ) {
            coupledCount++;
          }
        }
        if (coupledCount >= 2) {
          const coupledValues: Record<string, unknown> = {};
          let coupledPromises: Promise<unknown>[] | null = null;
          let otherPromises: Promise<unknown>[] | null = null;

          const recordCoupled = (key: string, value: unknown): void => {
            const predicate = deferCheck?.predicates[key];
            if (predicate && predicate(value)) {
              deferCheck!.deferredValues[key] = value;
            } else {
              coupledValues[key] = value;
            }
          };

          for (let i = 0, n = coupledKeys.length; i < n; i++) {
            const key = coupledKeys[i];
            if (props && Object.prototype.hasOwnProperty.call(props, key)) {
              const raw = props[key];
              if (raw == null || typeof raw !== "object") {
                recordCoupled(key, raw);
              } else {
                (coupledPromises ||= []).push(
                  this._resolveValue(raw, instance[key]).then((v) => {
                    recordCoupled(key, v);
                  })
                );
              }
            } else if (hasPreResolved && Object.prototype.hasOwnProperty.call(preResolvedProps, key)) {
              coupledValues[key] = preResolvedProps![key];
            }
          }

          const commitCoupled = (): void => {
            if (instance.destroyed) return;
            let hasCoupled = false;
            for (const _ in coupledValues) {
              hasCoupled = true;
              break;
            }
            if (!hasCoupled) return;
            instance._applyDeserializeCoupledProps(coupledValues);
            if (deferCheck) {
              for (const key in coupledValues) {
                if (deferCheck.predicates[key] && instance[key] !== coupledValues[key]) {
                  deferCheck.deferredValues[key] = coupledValues[key];
                }
              }
            }
          };

          if (props) {
            for (const key in props) {
              if (coupledKeys.includes(key)) continue;
              const raw = props[key];
              if (raw == null || typeof raw !== "object") {
                assignProp(key, raw);
              } else {
                (otherPromises ||= []).push(
                  this._resolveValue(raw, instance[key]).then((v) => {
                    assignProp(key, v);
                  })
                );
              }
            }
          }
          if (hasPreResolved) {
            for (const key in preResolvedProps) {
              if (!coupledKeys.includes(key) && (!props || !(key in props))) {
                instance[key] = preResolvedProps![key];
              }
            }
          }

          if (coupledPromises) {
            const coupledDone = Promise.all(coupledPromises).then(commitCoupled);
            return otherPromises
              ? Promise.all([coupledDone, ...otherPromises]).then(() => instance)
              : coupledDone.then(() => instance);
          }
          commitCoupled();
          return otherPromises ? Promise.all(otherPromises).then(() => instance) : Promise.resolve(instance);
        }
      }

      const propOrder: readonly string[] | undefined = instance?.constructor?._deserializePropOrder;
      if (props && propOrder?.length) {
        const orderedKeys: string[] = [];
        for (let i = 0, n = propOrder.length; i < n; i++) {
          const key = propOrder[i];
          if (Object.prototype.hasOwnProperty.call(props, key)) {
            orderedKeys.push(key);
          }
        }
        if (orderedKeys.length > 0) {
          let chain: Promise<unknown> | null = null;
          for (let i = 0, n = orderedKeys.length; i < n; i++) {
            const key = orderedKeys[i];
            const raw = props[key];
            if (!chain && (raw == null || typeof raw !== "object")) {
              assignProp(key, raw);
            } else {
              const applyOrdered = () =>
                this._resolveValue(raw, instance[key]).then((v) => {
                  assignProp(key, v);
                });
              chain = chain ? chain.then(applyOrdered) : applyOrdered();
            }
          }
          const applyRemaining = (): Promise<any> => {
            let promises: Promise<any>[] | null = null;
            for (const key in props) {
              if (orderedKeys.includes(key)) continue;
              const raw = props[key];
              if (raw == null || typeof raw !== "object") {
                assignProp(key, raw);
              } else {
                (promises ||= []).push(
                  this._resolveValue(raw, instance[key]).then((v) => {
                    assignProp(key, v);
                  })
                );
              }
            }
            applyPreResolved();
            return promises ? Promise.all(promises).then(() => instance) : Promise.resolve(instance);
          };
          return chain ? chain.then(applyRemaining) : applyRemaining();
        }
      }

      let promises: Promise<any>[] | null = null;
      if (props) {
        for (const key in props) {
          const raw = props[key];
          if (raw == null || typeof raw !== "object") {
            assignProp(key, raw);
          } else {
            (promises ||= []).push(
              this._resolveValue(raw, instance[key]).then((v) => {
                assignProp(key, v);
              })
            );
          }
        }
      }
      applyPreResolved();
      return promises ? Promise.all(promises).then(() => instance) : Promise.resolve(instance);
    } catch (error) {
      return Promise.reject(error);
    }
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
  parseMutationBlock(
    target: any,
    block?: MutationBlock,
    deferCheck?: DeferredPropCheck,
    preResolvedProps?: Record<string, unknown>
  ): Promise<any> {
    if (!block || target?.destroyed) return Promise.resolve(target);
    return this.parseProps(target, block.props, deferCheck, preResolvedProps)
      .then(() => (target?.destroyed ? target : this.parseCalls(target, block.calls)))
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
    try {
      let promises: Promise<any>[] | null = null;
      for (const key in obj) {
        const raw = obj[key];
        if (raw == null || typeof raw !== "object") {
          target[key] = raw;
        } else {
          (promises ||= []).push(this._resolveValue(raw, target[key]).then((v) => (target[key] = v)));
        }
      }
      return promises ? Promise.all(promises).then(() => target) : Promise.resolve(target);
    } catch (error) {
      return Promise.reject(error);
    }
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
    const snapshot = this._context.componentSnapshots?.get(entity);
    if (snapshot) {
      let matchIndex = 0;
      for (let i = 0, n = snapshot.length; i < n; i++) {
        const candidate = snapshot[i];
        if (candidate instanceof type) {
          if (matchIndex === comp.index) {
            return candidate.destroyed ? null : candidate;
          }
          matchIndex++;
        }
      }
      return null;
    }
    const buffer = ReflectionParser._componentBuffer;
    buffer.length = 0;
    entity.getComponents(type, buffer);
    const result = buffer[comp.index] ?? null;
    buffer.length = 0;
    return result;
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
