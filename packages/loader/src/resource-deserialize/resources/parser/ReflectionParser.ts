import { Loader } from "@galacean/engine-core";
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

  /**
   * Check if a value is a v2 asset reference ($ref).
   * Used by SceneParser for dependency collection.
   * @internal
   */
  static _isAssetRef(value: any): boolean {
    return value != null && typeof value === "object" && "$ref" in value;
  }
}
