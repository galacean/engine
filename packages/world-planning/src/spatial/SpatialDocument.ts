/** Serializable authoring data. Ownership, parameter bases and transform parenting are independent. */
export interface SpatialEntity {
  id: string;
  name: string;
  origin?: "authored" | "generated";
  parent?: string;
  components: Record<string, SpatialComponent>;
}
export interface SpatialComponent {
  values: Record<string, unknown>;
  base?: { entity: string; component: string };
}
export interface SpatialDocument {
  version: 1;
  revision: number;
  entities: Record<string, SpatialEntity>;
}
export interface SpatialField {
  key: string;
  label: string;
  type: "number" | "boolean" | "string" | "records";
  columns?: {
    key: string;
    label: string;
    type: "number" | "string" | "boolean";
    choices?: string[];
    default?: unknown;
  }[];
  unit?: string;
  display?: { scale: number; offset: number; unit: string; precision: number };
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  optionLabels?: Record<string, string>;
  description?: string;
  /** Generation fields reveal a stable population or rebuild its plan; instance
   * fields directly project authored geometry. Presentation remains independent. */
  editEffect?: "reveal" | "replan" | "instance";
  /** System-owned machine-readable classification, independent of display labels. */
  tags?: Record<string, string>;
  /** Label for a derived value when no authored or inherited source exists. */
  computedSource?: string;
  integer?: boolean;
  /** Optional numeric-field shortcut, sampling the declared min/max/step. */
  randomizeLabel?: string;
  default?: unknown;
  combine?: "override" | "multiply" | "add";
  readonly?: boolean;
  /** Runtime loading choices do not invalidate generated layout. */
  affectsLayout?: boolean;
  /** Accepted for saved projects, omitted from current parameter discovery and controls. */
  hidden?: boolean;
  /** Conditional presentation using another field in the same component. */
  visibleWhen?: { field: string; values: unknown[]; and?: { field: string; values: unknown[] }[] };
  /** Hide a control for one precise organization variant without changing its stored value. */
  hiddenWhen?: { field: string; values: unknown[]; and?: { field: string; values: unknown[] }[] };
  kinds?: string[];
}
export interface ComponentDefinition {
  type: string;
  label: string;
  /** Shared capability semantics; field-specific semantics remain on the fields. */
  description?: string;
  version: number;
  fields: SpatialField[];
  ranges?: [string, string][];
  /** Reject invalid edits instead of rounding or projecting them into an allowed interval. */
  strict?: boolean;
  validate?: (values: Record<string, unknown>) => void;
  fieldLimits?: (values: Record<string, unknown>) => Record<string, { min?: number; max?: number }>;
}
/** Component metadata is the single contract used by commands, inspectors and agents. */
function validRecords(value: unknown, field: SpatialField): boolean {
  if (!Array.isArray(value) || value.length > 4096) return false;
  const ids = new Set<string>();
  return value.every((row) => {
    if (
      !row ||
      typeof row !== "object" ||
      Array.isArray(row) ||
      typeof row.id !== "string" ||
      !row.id ||
      ids.has(row.id)
    )
      return false;
    ids.add(row.id);
    return Object.entries(row).every(([key, v]) => {
      if (key === "id") return true;
      const column = field.columns?.find((c) => c.key === key);
      return (
        !!column &&
        typeof v === column.type &&
        (column.type !== "number" || Number.isFinite(v)) &&
        (!column.choices || column.choices.includes(String(v)))
      );
    });
  });
}

export class ComponentRegistry {
  private definitions = new Map<string, ComponentDefinition>();
  register(definition: ComponentDefinition): void {
    if (this.definitions.has(definition.type)) throw new Error(`组件重复注册：${definition.type}`);
    if (new Set(definition.fields.map((f) => f.key)).size !== definition.fields.length) throw new Error("组件字段重复");
    this.definitions.set(definition.type, definition);
  }
  /** Remove a registration only when its exact owner still holds it. Existing documents require the plugin. */
  unregister(definition: ComponentDefinition): void {
    if (this.definitions.get(definition.type) === definition) this.definitions.delete(definition.type);
  }
  get(type: string): ComponentDefinition {
    const definition = this.definitions.get(type);
    if (!definition) throw new Error(`未注册组件：${type}`);
    return definition;
  }
  describe(): ComponentDefinition[] {
    return [...this.definitions.values()];
  }
  /** Project finite numeric edits onto the component's valid interval without writing sibling fields.
   * @param type Registered component type.
   * @param patch Requested fields in one atomic edit.
   * @param effective Existing resolved values, including inherited bounds.
   * @returns Accepted fields; malformed values remain errors rather than being silently replaced.
   */
  project(type: string, patch: Record<string, unknown>, effective: Record<string, unknown>): Record<string, unknown> {
    const definition = this.get(type),
      values = { ...patch };
    if (definition.strict) {
      this.validate(type, values);
      return values;
    }
    for (const [key, value] of Object.entries(values)) {
      const field = definition.fields.find((f) => f.key === key);
      if (
        !field ||
        field.readonly ||
        (field.type === "records" ? !validRecords(value, field) : typeof value !== field.type) ||
        (field.type === "number" && !Number.isFinite(value))
      )
        throw new Error(`参数无效：${type}.${key}`);
      if (field.type === "number") {
        const n =
          field.integer || field.key === "seed" || field.unit === "个" ? Math.round(Number(value)) : Number(value);
        values[key] = Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, n));
      }
    }
    for (const [min, max] of definition.ranges ?? []) {
      const low = Number(values[min] ?? effective[min]),
        high = Number(values[max] ?? effective[max]);
      if (!(low > high)) continue;
      throw new Error(`区间下限不能大于上限：${type}.${min} / ${max}；请共同修改上下限`);
    }
    // Coupled geometry supplies limits through the same contract used by the Inspector.
    for (const key of Object.keys(values)) {
      const bounds = definition.fieldLimits?.({ ...effective, ...values })[key];
      if (bounds && typeof values[key] === "number") {
        const field = definition.fields.find((f) => f.key === key)!;
        const minimum = Math.max(field.min ?? -Infinity, bounds.min ?? -Infinity);
        const maximum = Math.min(field.max ?? Infinity, bounds.max ?? Infinity);
        values[key] = Math.max(minimum, Math.min(maximum, Number(values[key])));
      }
    }
    this.validate(type, values);
    return values;
  }
  validate(type: string, values: Record<string, unknown>): void {
    const definition = this.get(type);
    for (const [key, value] of Object.entries(values)) {
      const field = definition.fields.find((f) => f.key === key);
      if (!field) throw new Error(`未知参数：${type}.${key}`);
      if (field.readonly) throw new Error(`只读参数：${type}.${key}`);
      if (
        (field.type === "records" ? !validRecords(value, field) : typeof value !== field.type) ||
        (field.type === "number" &&
          (!Number.isFinite(value) ||
            Number(value) < (field.min ?? -Infinity) ||
            Number(value) > (field.max ?? Infinity)))
      )
        throw new Error(`参数范围无效：${type}.${key}`);
      if ((field.integer || field.key === "seed" || field.unit === "个") && !Number.isInteger(value))
        throw new Error(`须为整数：${type}.${key}`);
      if (field.options && !field.options.includes(String(value))) throw new Error(`参数枚举无效：${type}.${key}`);
    }
    definition.validate?.(values);
  }
}
export type SpatialCommand =
  | { op: "create"; entity: SpatialEntity }
  | { op: "remove"; entity: string }
  | { op: "rename"; entity: string; name: string }
  | { op: "parent"; entity: string; parent?: string }
  | { op: "base"; entity: string; component: string; base?: { entity: string; component: string } }
  | { op: "set"; entity: string; component: string; values: Record<string, unknown> }
  | { op: "reset"; entity: string; component: string; fields?: string[] }
  | { op: "attach"; entity: string; component: string; data: SpatialComponent }
  | { op: "detach"; entity: string; component: string };
/** Resolve only explicitly linked parameter scopes; hierarchy grouping never changes a value. */
export function resolveComponent(
  document: SpatialDocument,
  entityId: string,
  type: string,
  registry: ComponentRegistry,
  visiting = new Set<string>()
): { values: Record<string, unknown>; sources: Record<string, string[]> } {
  const key = entityId + ":" + type;
  if (visiting.has(key)) throw new Error(`参数来源循环：${key}`);
  const own = document.entities[entityId]?.components[type];
  if (!own) throw new Error(`组件不存在：${key}`);
  visiting.add(key);
  if (own.base && own.base.component !== type) throw new Error("参数来源必须是相同组件类型");
  const definition = registry.get(type);
  const inherited = own.base
    ? resolveComponent(document, own.base.entity, own.base.component, registry, visiting)
    : { values: {}, sources: {} };
  const values: Record<string, unknown> = {},
    sources: Record<string, string[]> = {};
  for (const field of definition.fields) {
    const base = inherited.values[field.key] ?? field.default;
    const value = own.values[field.key];
    values[field.key] =
      value === undefined
        ? base
        : field.combine === "multiply"
          ? Number(base ?? 1) * Number(value)
          : field.combine === "add"
            ? Number(base ?? 0) + Number(value)
            : value;
    sources[field.key] =
      value === undefined
        ? (inherited.sources[field.key] ?? [])
        : field.combine && field.combine !== "override"
          ? [...(inherited.sources[field.key] ?? []), entityId]
          : [entityId];
  }
  visiting.delete(key);
  return { values, sources };
}
/** Apply a batch atomically. Caller runs physical systems before accepting the candidate. */
export function applySpatialCommands(
  document: SpatialDocument,
  commands: SpatialCommand[],
  registry: ComponentRegistry
): SpatialDocument {
  if (document.version !== 1) throw new Error("工程版本不支持");
  const next = structuredClone(document);
  for (const command of commands) {
    if (command.op === "create") {
      if (!command.entity.id || next.entities[command.entity.id]) throw new Error("实体 ID 已存在或为空");
      for (const [type, component] of Object.entries(command.entity.components))
        registry.validate(type, component.values);
      next.entities[command.entity.id] = { ...structuredClone(command.entity), origin: "authored" };
      continue;
    }
    const entity = next.entities[command.entity];
    if (!entity) throw new Error(`实体不存在：${command.entity}`);
    if (command.op === "remove") {
      if (
        Object.values(next.entities).some(
          (e) => e.parent === entity.id || Object.values(e.components).some((c) => c.base?.entity === entity.id)
        )
      )
        throw new Error("实体仍被归属或参数来源引用，请显式处理依赖");
      delete next.entities[entity.id];
    } else if (command.op === "rename") entity.name = command.name;
    else if (command.op === "parent") entity.parent = command.parent;
    else if (command.op === "base") {
      if (!entity.components[command.component]) throw new Error("组件不存在");
      entity.components[command.component].base = command.base;
    } else if (command.op === "detach") delete entity.components[command.component];
    else if (command.op === "attach") {
      registry.validate(command.component, command.data.values);
      if (entity.components[command.component]) throw new Error("组件已存在");
      entity.components[command.component] = structuredClone(command.data);
    } else if (command.op === "set") {
      if (!entity.components[command.component]) throw new Error("请先添加组件");
      const effective = resolveComponent(next, entity.id, command.component, registry).values;
      Object.assign(
        entity.components[command.component].values,
        registry.project(command.component, command.values, effective)
      );
    } else {
      const component = entity.components[command.component];
      if (!component) throw new Error("组件不存在");
      for (const key of command.fields ?? Object.keys(component.values)) delete component.values[key];
    }
  }
  for (const [id, entity] of Object.entries(next.entities)) {
    if (entity.id !== id || typeof entity.name !== "string" || !entity.components) throw new Error("实体结构无效");
    const seen = new Set([entity.id]);
    let parent = entity.parent;
    while (parent) {
      if (seen.has(parent) || !next.entities[parent]) throw new Error("实体归属循环或父节点不存在");
      seen.add(parent);
      parent = next.entities[parent].parent;
    }
    for (const type of Object.keys(entity.components)) {
      registry.validate(type, entity.components[type].values);
      const effective = resolveComponent(next, entity.id, type, registry).values;
      registry.get(type).validate?.(effective);
      for (const [min, max] of registry.get(type).ranges ?? [])
        if (Number(effective[min]) > Number(effective[max])) throw new Error("参数范围上下限倒置");
    }
  }
  next.revision++;
  return next;
}
/** A system declares dependencies explicitly; errors abort the transaction. No per-frame work is implied. */
export interface SpatialSystem<C> {
  id: string;
  after: string[];
  reads: string[];
  writes: string[];
  run(context: C): void;
}
export function runSpatialSystems<C>(systems: SpatialSystem<C>[], context: C): string[] {
  const pending = new Map(systems.map((s) => [s.id, s])),
    completed = new Set<string>();
  if (pending.size !== systems.length) throw new Error("系统 ID 重复");
  while (pending.size) {
    const ready = [...pending.values()].find((s) => s.after.every((id) => completed.has(id)));
    if (!ready) throw new Error("系统依赖缺失或循环");
    ready.run(context);
    pending.delete(ready.id);
    completed.add(ready.id);
  }
  return [...completed];
}
