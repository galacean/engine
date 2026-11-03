import { Color, Component, Entity, Loader, Quaternion, Vector2, Vector3, Vector4, type Scene } from "@galacean/engine";

export interface RuntimeSourceIdentity {
  scene: string;
  entityId: string;
  componentId?: string;
}
export interface RuntimePickIdentity {
  entityId: number;
  componentId: number;
  componentType: string;
  /** Draw-local index, not an editable entity ID. */
  instanceIndex?: number;
  /** Optional opaque identity supplied by the draw producer. */
  instanceKey?: string;
}
export interface RuntimeEntityRecord {
  id: number;
  name: string;
  parentId: number | null;
  children: number[];
  components: number[];
  active: boolean;
  position: number[];
  rotation: number[];
  scale: number[];
  authoring?: RuntimeSourceIdentity;
}
export interface RuntimeComponentRecord {
  id: number;
  entityId: number;
  type: string;
  enabled: boolean;
  properties: string[];
  authoring?: RuntimeSourceIdentity;
}
export type RuntimeValue = null | boolean | number | string | RuntimeValue[] | { [key: string]: RuntimeValue };

/** Engine-thread owner. Workers receive plain records and never Engine instances. */
export class RuntimeSceneInspection {
  private readonly objects = new Map<number, WeakRef<Entity | Component>>();
  private readonly collected = new FinalizationRegistry<number>((id) => this.objects.delete(id));
  constructor(
    readonly scene: Scene,
    private readonly source?: (object: Entity | Component) => RuntimeSourceIdentity | undefined
  ) {}

  id(object: Entity | Component): number {
    const id = object.instanceId;
    if (!this.objects.has(id)) {
      this.objects.set(id, new WeakRef(object));
      this.collected.register(object, id);
    }
    return id;
  }
  target(component: Component, instanceIndex?: number, instanceKey?: string): RuntimePickIdentity {
    return {
      entityId: this.id(component.entity),
      componentId: this.id(component),
      componentType: componentType(component),
      ...(instanceIndex === undefined ? {} : { instanceIndex }),
      ...(instanceKey === undefined ? {} : { instanceKey })
    };
  }
  inspectEntity(id: number) {
    const object = this.resolve(id);
    const entity = object instanceof Entity ? this.entityRecord(object) : undefined;
    const summary = entity && (({ children, ...rest }) => ({ ...rest, childCount: children.length }))(entity);
    return {
      status: entity ? "found" : "unavailable",
      alive: !!entity,
      observedAt: "live" as const,
      entity: summary ? structuredClone(summary) : null
    };
  }
  children(entityId: number | undefined, offset = 0, limit = 50) {
    const live = entityId === undefined ? undefined : this.resolve(entityId);
    const nodes = entityId === undefined ? this.scene.rootEntities : live instanceof Entity ? live.children : undefined;
    const entries = nodes?.filter((node) => !node.destroyed && !node.pendingDestroy) ?? [];
    return {
      status: nodes ? "found" : "unavailable",
      observedAt: "live" as const,
      entities: entries.slice(offset, offset + limit).map((node) => this.inspectEntity(this.id(node))),
      matchedCount: entries.length,
      ...(offset + limit < entries.length ? { nextOffset: offset + limit } : {})
    };
  }
  queryComponents(entityId: number, type?: string) {
    const object = this.resolve(entityId);
    const alive = object instanceof Entity;
    const components = alive
      ? object
          .getComponents(Component, [])
          .filter(
            (component) =>
              !component.destroyed && !component.pendingDestroy && (!type || componentType(component) === type)
          )
          .map((component) => this.componentRecord(component))
      : [];
    return { status: alive ? "found" : "unavailable", alive, observedAt: "live" as const, components };
  }
  readComponent(id: number, fields: readonly string[]) {
    const component = this.resolve(id);
    if (!(component instanceof Component))
      return { status: "unavailable", component: null, values: {} as Record<string, RuntimeValue> };
    const values: Record<string, RuntimeValue> = {};
    const available = new Set(propertyNames(component));
    for (const field of fields) {
      if (!available.has(field)) throw new Error(`Unknown readable component property '${field}'`);
      // Explicit property reads may execute a public getter. No methods or internal fields are exposed.
      try {
        values[field] = this.serialize(Reflect.get(component, field), 0, new Set());
      } catch (error) {
        values[field] = { unavailable: error instanceof Error ? error.message : String(error) };
      }
    }
    return { status: "found", component: this.componentRecord(component), values };
  }
  private resolve(id: number): Entity | Component | undefined {
    const object = this.objects.get(id)?.deref();
    if (!object || object.destroyed || object.pendingDestroy) {
      this.objects.delete(id);
      return;
    }
    const entity = object instanceof Entity ? object : object.entity;
    if (entity.scene !== this.scene) return;
    for (let node: Entity | null = entity; node; node = node.parent) {
      if (node.destroyed || node.pendingDestroy) return;
    }
    return object;
  }
  private entityRecord(entity: Entity): RuntimeEntityRecord {
    const authoring = this.source?.(entity);
    const t = entity.transform,
      v = (x: { x: number; y: number; z: number }) => [x.x, x.y, x.z];
    return {
      id: this.id(entity),
      name: entity.name,
      parentId: entity.parent ? this.id(entity.parent) : null,
      children: entity.children
        .filter((child) => !child.destroyed && !child.pendingDestroy)
        .map((child) => this.id(child)),
      components: entity
        .getComponents(Component, [])
        .filter((component) => !component.destroyed && !component.pendingDestroy)
        .map((component) => this.id(component)),
      active: entity.isActiveInHierarchy,
      position: v(t.position),
      rotation: v(t.rotation),
      scale: v(t.scale),
      ...(authoring ? { authoring: { ...authoring } } : {})
    };
  }
  private componentRecord(component: Component): RuntimeComponentRecord {
    const authoring = this.source?.(component);
    return {
      id: this.id(component),
      entityId: this.id(component.entity),
      type: componentType(component),
      enabled: component.enabled,
      properties: propertyNames(component),
      ...(authoring ? { authoring: { ...authoring } } : {})
    };
  }
  private serialize(value: unknown, depth: number, seen: Set<object>): RuntimeValue {
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "string")
      return value.length <= 2048 ? value : { truncated: true, length: value.length, prefix: value.slice(0, 2048) };
    if (typeof value === "number") return Number.isFinite(value) ? value : { unavailable: "non-finite number" };
    if (value instanceof Entity) return { entityId: this.id(value) };
    if (value instanceof Component)
      return { componentId: this.id(value), entityId: this.id(value.entity), type: componentType(value) };
    if (value instanceof Color) return { r: value.r, g: value.g, b: value.b, a: value.a };
    if (value instanceof Quaternion || value instanceof Vector4)
      return { x: value.x, y: value.y, z: value.z, w: value.w };
    if (value instanceof Vector3) return { x: value.x, y: value.y, z: value.z };
    if (value instanceof Vector2) return { x: value.x, y: value.y };
    if (!value || typeof value !== "object") return { unavailable: typeof value };
    if (seen.has(value)) return { unavailable: "cycle" };
    if (depth >= 3) return { truncated: true, type: objectType(value) };
    seen.add(value);
    try {
      if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const length = (value as ArrayLike<unknown>).length;
        if (length === undefined) return { type: "DataView", byteLength: (value as DataView).byteLength };
        return {
          length,
          items: Array.from({ length: Math.min(length, 32) }, (_, index) =>
            this.serialize((value as ArrayLike<unknown>)[index], depth + 1, seen)
          ),
          truncated: length > 32
        };
      }
      const entries = Object.entries(Object.getOwnPropertyDescriptors(value)).filter(
        ([key, descriptor]) => publicName(key) && "value" in descriptor && typeof descriptor.value !== "function"
      );
      const result: Record<string, RuntimeValue> = { type: objectType(value) };
      for (const [key, descriptor] of entries.slice(0, 32))
        result[key] = this.serialize(descriptor.value, depth + 1, seen);
      if (entries.length > 32) result.truncated = true;
      return result;
    } finally {
      seen.delete(value);
    }
  }
  dispose(): void {
    this.objects.clear();
  }
}
function publicName(name: string): boolean {
  return !name.startsWith("_") && !["constructor", "__proto__", "prototype", "engine", "scene"].includes(name);
}
function propertyNames(object: object): string[] {
  const names = new Set<string>();
  for (
    let target: object | null = object;
    target && target !== Object.prototype;
    target = Object.getPrototypeOf(target)
  ) {
    for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(target))) {
      if (publicName(name) && (descriptor.get || ("value" in descriptor && typeof descriptor.value !== "function")))
        names.add(name);
    }
  }
  return [...names].sort();
}

function componentType(component: Component): string {
  return Loader.getClassName(component.constructor) ?? component.constructor.name;
}
function objectType(value: object): string {
  const constructor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(value) ?? {}, "constructor")?.value;
  return typeof constructor === "function" ? constructor.name : "Object";
}
