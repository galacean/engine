import type { SceneFile } from "@galacean/engine";
import type {} from "../generated/editor-source-schema";
import type { RuntimeSceneMutation } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Detached indexes built during preparation, never by the live object mutation loop. */
export class RuntimeSceneRecords {
  readonly entities: Map<string, GalaceanSourceEntitySchema>;
  readonly components: Map<string, GalaceanSourceComponentSchema>;
  readonly entityOrder = new Map<string, number>();
  readonly componentOrder = new Map<string, number>();
  readonly runtimeComponents: Map<string, SceneFile["components"][number]>;
  readonly parents: Map<string, string>;
  readonly owners: Map<string, string>;
  readonly consumers: Map<string, Set<string>>;
  private readonly targets: Map<string, Set<string>>;

  constructor(
    readonly source: GalaceanSourceSceneFile,
    readonly runtime: SceneFile,
    previous?: RuntimeSceneRecords,
    mutation?: RuntimeSceneMutation
  ) {
    this.entities = new Map(
      source.entities.map((record, index) => {
        this.entityOrder.set(record.id, index);
        return [record.id, record];
      })
    );
    this.components = new Map(
      source.components.map((record, index) => {
        this.componentOrder.set(record.id, index);
        return [record.id, record];
      })
    );
    this.runtimeComponents = new Map(source.components.map((record, index) => [record.id, runtime.components[index]]));
    const incremental = previous && mutation;
    this.parents = new Map(incremental ? previous.parents : []);
    this.owners = new Map(incremental ? previous.owners : []);
    this.consumers = new Map(incremental ? previous.consumers : []);
    this.targets = new Map(incremental ? previous.targets : []);
    const entityIds = incremental ? (mutation.entities ?? []) : this.entities.keys();
    if (incremental)
      for (const id of entityIds) {
        const old = previous.entities.get(id);
        for (const child of old?.children ?? []) if (this.parents.get(child) === id) this.parents.delete(child);
        for (const component of old?.components ?? [])
          if (this.owners.get(component) === id) this.owners.delete(component);
      }
    for (const id of entityIds) {
      const entity = this.entities.get(id);
      for (const child of entity?.children ?? []) this.parents.set(child, id);
      for (const component of entity?.components ?? []) this.owners.set(component, id);
    }
    const visit = (value: unknown, targets: Set<string>): void => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if ((key === "$entity" || key === "$component") && typeof child === "string") targets.add(child);
        else visit(child, targets);
      }
    };
    const componentIds = incremental ? (mutation.components ?? []) : this.components.keys();
    for (const id of componentIds) {
      // Clone modified edge sets only; a rejected/failed candidate must not alter
      // the last successful projection's reverse-reference index.
      for (const target of this.targets.get(id) ?? []) {
        const consumers = new Set(this.consumers.get(target));
        consumers.delete(id);
        if (consumers.size) this.consumers.set(target, consumers);
        else this.consumers.delete(target);
      }
      this.targets.delete(id);
      const component = this.components.get(id);
      if (!component) continue;
      const targets = new Set<string>();
      visit(component, targets);
      this.targets.set(id, targets);
      for (const target of targets) {
        const consumers = new Set(this.consumers.get(target));
        consumers.add(id);
        this.consumers.set(target, consumers);
      }
    }
  }
}

/** Net authoring changes, including old/new incoming references and affected hierarchy edges. */
export class RuntimeSceneChanges {
  readonly entities = new Set<string>();
  readonly components = new Set<string>();
  readonly removedEntities: string[];
  readonly removedComponents: string[];
  readonly rootsChanged: boolean;

  constructor(
    readonly before: RuntimeSceneRecords,
    readonly after: RuntimeSceneRecords,
    mutation: RuntimeSceneMutation
  ) {
    this.rootsChanged = !!mutation.roots && !same(before.source.scene.rootEntities, after.source.scene.rootEntities);
    for (const id of mutation.entities ?? []) {
      const old = before.entities.get(id),
        next = after.entities.get(id);
      if (same(old, next)) continue;
      this.entities.add(id);
      // Reparenting changes the parent's record, not necessarily the child's record.
      if (!same(old?.children, next?.children)) {
        for (const child of [...(old?.children ?? []), ...(next?.children ?? [])]) this.entities.add(child);
      }
    }
    for (const id of mutation.components ?? []) {
      if (!same(before.components.get(id), after.components.get(id)) || before.owners.get(id) !== after.owners.get(id))
        this.components.add(id);
    }
    // The closure handles chains and cycles. Keep old edges until removal/rebinding finishes.
    const pending = [...this.entities, ...this.components];
    for (let i = 0; i < pending.length; i++) {
      const id = pending[i];
      for (const consumer of [...(before.consumers.get(id) ?? []), ...(after.consumers.get(id) ?? [])]) {
        if (!this.components.has(consumer)) {
          this.components.add(consumer);
          pending.push(consumer);
        }
      }
    }
    for (const id of this.components) {
      const oldOwner = before.owners.get(id),
        owner = after.owners.get(id);
      if (oldOwner) this.entities.add(oldOwner);
      if (owner) this.entities.add(owner);
    }
    this.removedEntities = [...this.entities].filter((id) => !after.entities.has(id));
    this.removedComponents = [...this.components].filter((id) => !after.components.has(id));
  }
}
