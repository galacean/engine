import { Loader } from "@galacean/engine-core";
import type { CallSpec, MutationBlock } from "../../../scene-format/types";
import { ParserContext, ParserType } from "./ParserContext";

export class ReflectionParser {
  constructor(private readonly _context: ParserContext) {}

  /**
   * Apply v2 props to a component/object instance.
   * Each prop value is resolved recursively (handling $ref, $type, $entity, $component, $signal).
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
        const method = instance?.[call.method];
        if (typeof method !== "function") {
          return Promise.reject(new Error(`Call target does not have method "${call.method}"`));
        }

        return Promise.all((call.args ?? []).map((arg) => this._resolveValue(arg)))
          .then((resolvedArgs) => Promise.resolve(method.apply(instance, resolvedArgs)))
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
   * Apply props first, then calls, to preserve declarative-before-command ordering.
   */
  parseMutationBlock(target: any, block?: MutationBlock): Promise<any> {
    if (!block) return Promise.resolve(target);
    return this.parseProps(target, block.props).then(() => this.parseCalls(target, block.calls));
  }

  /**
   * Resolve a v2 value with $ prefix detection.
   *
   * Priority:
   * 1. null/undefined/primitive → passthrough
   * 2. Array → recurse each element
   * 3. { $ref }       → asset reference
   * 4. { $type }      → polymorphic type construct
   * 5. { $entity }    → entity reference (flat index)
   * 6. { $component } → component reference
   * 7. { $signal }    → signal binding
   * 8. plain object   → recurse values (modify originValue in place if exists)
   */
  private _resolveValue(value: unknown, originValue?: any): Promise<any> {
    if (value == null || typeof value !== "object") return Promise.resolve(value);
    if (Array.isArray(value)) return Promise.all(value.map((v) => this._resolveValue(v)));

    const obj = value as Record<string, unknown>;

    // $ref — asset reference
    if ("$ref" in obj) {
      const { _context: context } = this;
      const ref = obj as { $ref: string; key?: string };
      // @ts-ignore
      return context.resourceManager.getResourceByRef(ref).then((resource) => {
        if (resource && context.type === ParserType.Prefab) {
          // @ts-ignore
          context.resource._addDependenceAsset(resource);
        }
        return resource;
      });
    }

    // $type — polymorphic type: construct instance and apply remaining props
    if ("$type" in obj) {
      const { $type, ...rest } = obj;
      const typeName = $type as string;
      const Class = Loader.getClass(typeName);
      if (!Class) return Promise.reject(new Error(`Loader.getClass: class "${typeName}" is not registered`));
      const instance = new Class();
      if (Object.keys(rest).length > 0) {
        return this.parseProps(instance, rest);
      }
      return Promise.resolve(instance);
    }

    // $entity — entity reference by flat index
    if ("$entity" in obj) {
      const entity = this._context.entityMap.get(obj.$entity as number);
      return Promise.resolve(entity ?? null);
    }

    // $component — component reference: { entity, type, index }
    if ("$component" in obj) {
      return Promise.resolve(this._resolveComponent(obj.$component as { entity: number; type: string; index: number }));
    }

    // $signal — signal binding: register listeners on the existing Signal instance
    if ("$signal" in obj) {
      return this._resolveSignal(
        originValue,
        obj.$signal as Array<{
          target: { $component: { entity: number; type: string; index: number } };
          methodName: string;
          arguments?: unknown[];
        }>
      );
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

  private _resolveSignal(
    signal: any,
    listeners: Array<{
      target: { $component: { entity: number; type: string; index: number } };
      methodName: string;
      arguments?: unknown[];
    }>
  ): Promise<any> {
    if (!signal || typeof signal.on !== "function") {
      return Promise.reject(new Error("$signal requires a pre-initialized Signal instance on the target property"));
    }
    const promises = listeners.map((listener) => {
      const targetComponent = this._resolveComponent(listener.target.$component);
      if (!targetComponent) return Promise.resolve();

      return Promise.all((listener.arguments ?? []).map((a) => this._resolveValue(a))).then((resolvedArgs) => {
        signal.on(targetComponent, listener.methodName, ...resolvedArgs);
      });
    });
    return Promise.all(promises).then(() => signal);
  }

  private _resolveComponent(comp: { entity: number; type: string; index: number }): any {
    const entity = this._context.entityMap.get(comp.entity);
    if (!entity) return null;
    const type = Loader.getClass(comp.type);
    if (!type) return null;
    return entity.getComponents(type, [])[comp.index] ?? null;
  }
}
