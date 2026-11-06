import { readSourcePrefab, RuntimeInstanceSource } from "./runtime-instance-source";
import { RuntimeInstanceIdentities } from "./runtime-instance-identities";
import { RuntimeAssetChanges } from "../../project/runtime-asset-changes.ts";
import {
  runtimeComponentIdentities,
  type RuntimeComponentIdentity,
  type RuntimeComponentSelector
} from "./runtime-component-identity";
import { UnavailableProjectScript } from "../scripts/runtime-unavailable-script";
import { applyRuntimeSceneSettings } from "./runtime-scene-settings";
import {
  Component,
  Entity,
  Layer,
  Loader,
  Shader,
  ParserContext,
  ParserType,
  ReflectionParser,
  SceneParser,
  type Scene,
  type SceneFile,
  type ComponentRef
} from "@galacean/engine";
import type {} from "../generated/editor-source-schema";
import {
  getBuiltinComponentRuntimeCapabilitySnapshot,
  runtimeSourceReferenceIds
} from "@galacean/engine-project/runtime-editor/generated/editor-source-compiler";
import {
  compileProjectResource,
  suppressUnavailableScriptPayloads
} from "@galacean/engine-project/runtime-editor/scene/runtime-project-compiler";
import type { RuntimeProjectPackage } from "@galacean/engine-project/runtime-editor/project/runtime-project";

type ComponentClass = new (entity: Entity) => Component;
const removedValue = (before: unknown, after: unknown): boolean => {
  if (!before || typeof before !== "object" || Array.isArray(before)) return false;
  if (!after || typeof after !== "object" || Array.isArray(after)) return true;
  return Object.entries(before).some(
    ([key, value]) => !(key in after) || removedValue(value, (after as Record<string, unknown>)[key])
  );
};
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** Stable source identities map onto existing Engine objects; unrelated gameplay objects stay host-owned. */
export class RuntimeSceneProjection {
  private readonly entities = new Map<string, Entity>();
  private readonly components = new Map<string, Component>();
  private sourceIds = new WeakMap<Entity | Component, string>();
  // A failed activation invalidates the diff baseline: live objects may be partially updated.
  private needsResync = false;
  private instances: RuntimeInstanceIdentities;
  private componentIdentities = new WeakMap<Component, RuntimeComponentIdentity>();
  private previous: GalaceanSourceSceneFile;
  private previousRuntime: SceneFile;
  private previousMembers: RuntimeInstanceSource;
  private readonly assetChanges: RuntimeAssetChanges;

  constructor(
    private readonly scene: Scene,
    private readonly path: string,
    pack: RuntimeProjectPackage
  ) {
    this.previous = this.source(pack);
    this.previousMembers = new RuntimeInstanceSource(this.previous, pack);
    this.previousRuntime = JSON.parse(compileProjectResource(pack, path) as string);
    this.assetChanges = new RuntimeAssetChanges(pack);
    const source = this.previous;
    const byId = new Map(source.entities.map((entity) => [entity.id, entity]));
    const components = new Map(source.components.map((component) => [component.id, component]));
    const bind = (id: string, entity: Entity | undefined) => {
      const record = byId.get(id);
      if (!record || !entity) throw new Error(`Cannot bind source entity '${id}' to the loaded Scene`);
      this.entities.set(id, entity);
      if (record.instance) return;
      const all = entity.getComponents(Component, []);
      const claimed = new Set<Component>();
      for (const componentId of record.components ?? []) {
        const config = components.get(componentId)!;
        const type = this.componentClass(config, pack);
        const instance = all.find((component) => component.constructor === type && !claimed.has(component));
        if (!instance) throw new Error(`Cannot bind source component '${componentId}'`);
        claimed.add(instance);
        this.components.set(componentId, instance);
      }
      (record.children ?? []).forEach((childId, index) => bind(childId, entity.children[index]));
    };
    source.scene.rootEntities.forEach((id, index) => bind(id, scene.rootEntities[index]));
    this.instances = new RuntimeInstanceIdentities(source, this.path, pack, (id) => this.entities.get(id));
    this.indexIdentities(source);
  }

  /** Reading an unchanged asset supplies its old value, not an authored change. */
  recordAssetRead(file: RuntimeProjectPackage["project"]["files"][number], content: string | Uint8Array): void {
    this.assetChanges.recordRead(file, content);
  }

  entity(id: string): Entity | undefined {
    return this.entities.get(id) ?? this.instances.entities.get(id);
  }
  component(id: string): Component | undefined {
    return this.components.get(id) ?? this.instances.components.get(id);
  }

  private indexIdentities(source: GalaceanSourceSceneFile): void {
    this.componentIdentities = new WeakMap();
    this.sourceIds = new WeakMap();
    for (const [id, entity] of [...this.entities, ...this.instances.entities]) this.sourceIds.set(entity, id);
    for (const [id, component] of [...this.components, ...this.instances.components]) this.sourceIds.set(component, id);
    for (const identity of [...runtimeComponentIdentities(source, this.path), ...this.instances.identities]) {
      const component = this.component(identity.id);
      if (component) this.componentIdentities.set(component, identity);
    }
  }

  /** Reverse lookup uses the same current mapping as component queries, including linked instances. */
  identityOf(component: Component): RuntimeComponentIdentity | undefined {
    if (this.needsResync) throw new Error("Scene projection requires recovery before component invocation");
    const identity = this.componentIdentities.get(component);
    return identity &&
      !component.destroyed &&
      component.entity.scene === this.scene &&
      this.component(identity.id) === component
      ? { ...identity }
      : undefined;
  }

  /** Relate a live object to its existing authored record; runtime-only descendants have no invented owner. */
  sourceIdentity(object: Entity | Component): { scene: string; entityId: string; componentId?: string } | undefined {
    if (this.needsResync || object.destroyed || object.pendingDestroy) return;
    const id = this.sourceIds.get(object);
    if (!id) return;
    if (object instanceof Entity) {
      if (this.entity(id) === object && object.scene === this.scene) return { scene: this.path, entityId: id };
    } else if (this.component(id) === object) {
      const owner = this.sourceIdentity(object.entity);
      return owner && { ...owner, componentId: id };
    }
  }

  /** Only a successfully activated Scene can provide callable component identities. */
  queryComponents(selector: RuntimeComponentSelector = {}): RuntimeComponentIdentity[] {
    if (this.needsResync) throw new Error("Scene projection requires recovery before component invocation");
    return [
      ...runtimeComponentIdentities(this.previous, this.path, selector),
      ...this.instances.identities.filter(
        (identity) =>
          (selector.id === undefined || selector.id === identity.id) &&
          (selector.entityId === undefined || selector.entityId === identity.entityId) &&
          (selector.type === undefined || selector.type === identity.type)
      )
    ].filter((identity) => {
      const component = this.component(identity.id);
      return (
        component &&
        !component.destroyed &&
        component.entity.scene === this.scene &&
        component.entity === this.entity(identity.entityId)
      );
    });
  }

  resolveComponent(identity: RuntimeComponentIdentity): Component {
    const current = this.queryComponents({ id: identity.id })[0];
    if (
      !current ||
      current.scene !== identity.scene ||
      current.entityId !== identity.entityId ||
      current.type !== identity.type
    )
      throw new Error(`Component identity is no longer available: ${identity.id}`);
    return this.component(identity.id)!;
  }

  /** Authored properties for the same successfully activated identity as resolveComponent. */
  readComponent(identity: RuntimeComponentIdentity): GalaceanSourceComponentSchema {
    this.resolveComponent(identity);
    return structuredClone(
      this.previous.components.find((component) => component.id === identity.id) ??
        this.instances.records.get(identity.id)!
    );
  }

  /** Authored Entity properties for the current activated object, including Prefab overrides. */
  readEntity(id: string): GalaceanSourceEntitySchema {
    const entity = this.entity(id);
    if (!entity || this.sourceIdentity(entity)?.entityId !== id)
      throw new Error(`Entity identity is no longer available: ${id}`);
    const local = this.previous.entities.find((value) => value.id === id);
    const member = this.previousMembers.entities.get(id)?.record;
    if (!local && !member) throw new Error(`Entity has no authored record: ${id}`);
    return structuredClone(
      member ? { ...member, ...local, children: member.children, components: member.components } : local!
    );
  }

  /** Checks supported source changes without constructing or modifying Engine objects. */
  validate(pack: RuntimeProjectPackage): { source: GalaceanSourceSceneFile; runtime: SceneFile } {
    const source = this.source(pack);
    for (const file of pack.project.files) {
      if (file.type !== "Material") continue;
      const content = pack.contents[file.virtualPath];
      if (typeof content !== "string") continue;
      const material = JSON.parse(content);
      if (!Shader.find(material.shader) && !material.shaderRef) {
        throw new Error(
          `Material '${file.virtualPath}' references unregistered shader '${material.shader}' without a shaderRef`
        );
      }
    }
    const compiled = compileProjectResource(pack, this.path);
    if (typeof compiled !== "string") throw new Error("Scene compilation produced no runtime data");
    const runtime: SceneFile = JSON.parse(compiled);
    if (runtime.entities.length < source.entities.length || runtime.components.length < source.components.length) {
      throw new Error("Compiled hierarchy lost source topology");
    }
    const priorComponents = new Map(this.previous.components.map((component) => [component.id, component]));
    // Validate identities and registered classes before changing any live object.
    const oldRuntimeComponents = new Map(
      this.previous.components.map((component, index) => [component.id, this.previousRuntime.components[index]])
    );
    for (const component of source.components) {
      // New Script classes are evaluated only after publication. Native classes are already registered.
      if (component.type !== "Script") this.componentClass(component, pack);
      const prior = priorComponents.get(component.id);
      if (prior && (prior.type !== component.type || !same(prior.script, component.script)))
        throw new Error("Replace a component explicitly when changing its class");
    }
    for (let index = 0; index < source.components.length; index++) {
      const id = source.components[index].id;
      const old = oldRuntimeComponents.get(id);
      const calls = runtime.components[index].calls;
      const setters = Object.values(
        getBuiltinComponentRuntimeCapabilitySnapshot().capabilities[source.components[index].type]?.propertySetters ??
          {}
      );
      if (old && !same(old.calls, calls) && calls?.some((call) => !setters.includes(call.method))) {
        throw new Error("Replace the component explicitly when changing constructor-style calls");
      }
    }
    return { source, runtime };
  }

  /** Activates already-committed authoring data. A failure must be reported in the execution receipt. */
  async apply(pack: RuntimeProjectPackage, signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    const { source, runtime } = this.validate(pack);
    const referenceIds = runtimeSourceReferenceIds(source, {
      resolveInstanceSourceFile: (path) => readSourcePrefab(pack, path),
      resolveInstanceAssetKind: (path) =>
        pack.project.files.find((file) => file.virtualPath === path)?.type === "glTF" ? "glTF" : "Prefab"
    });
    const members = new RuntimeInstanceSource(source, pack);
    const entityOwner = (id: string) => members.entities.get(id)?.root ?? id;
    const componentOwner = (id: string) => {
      const member = members.components.get(id);
      return member && entityOwner(member.entityId);
    };
    const recovering = this.needsResync;
    this.needsResync = true;
    const changedAssets = this.assetChanges.affected(pack);
    const replacedComponents = new Set<string>();
    const replacedEntities = new Set<string>();
    // Returning inline members to Scene ownership creates new live objects under the same Source IDs.
    for (const record of source.entities)
      if (!this.entities.has(record.id) && this.instances.entities.has(record.id)) replacedEntities.add(record.id);
    for (const record of source.components)
      if (!this.components.has(record.id) && this.instances.components.has(record.id))
        replacedComponents.add(record.id);
    // The compiler lowers stable component IDs to { entity: number[], type, index }.
    // Resolve through compiled topology, not through live objects that are being replaced.
    const sourceComponentId = (ref: ComponentRef): string | undefined => {
      let entity = runtime.entities[ref.entity[0]];
      for (const child of ref.entity.slice(1)) {
        const index = entity && "children" in entity ? entity.children?.[child] : undefined;
        if (index === undefined) return undefined;
        entity = runtime.entities[index];
      }
      const indices = entity && "components" in entity ? (entity.components ?? []) : [];
      const selector = Loader.getClass(ref.type);
      const index = indices.filter((index) => {
        const candidate = Loader.getClass(runtime.components[index].type);
        return candidate === selector || (candidate && selector && candidate.prototype instanceof selector);
      })[ref.index];
      return index === undefined ? undefined : referenceIds.components[index];
    };
    const referencesChanged = (value: unknown, runtimeReference = false): boolean => {
      if (!value || typeof value !== "object") return false;
      const ref = (value as { $ref?: string | number }).$ref;
      const path = runtimeReference && typeof ref === "number" ? runtime.refs[ref]?.url : ref;
      const componentRef = (value as { $component?: string | ComponentRef }).$component;
      const componentId =
        runtimeReference && componentRef && typeof componentRef === "object"
          ? sourceComponentId(componentRef)
          : componentRef;
      return (
        // A stable compiled index can point at a different asset after source edits.
        (runtimeReference && typeof ref === "number" && !same(runtime.refs[ref], this.previousRuntime.refs[ref])) ||
        (typeof path === "string" && changedAssets.has(path)) ||
        (typeof componentId === "string" &&
          (replacedComponents.has(componentId) || replacedEntities.has(componentOwner(componentId)!))) ||
        (runtimeReference &&
          componentRef &&
          typeof componentRef === "object" &&
          replacedEntities.has(entityOwner(referenceIds.entities[(componentRef as ComponentRef).entity[0]]))) ||
        (!runtimeReference &&
          componentRef &&
          typeof componentRef === "object" &&
          "instance" in componentRef &&
          typeof componentRef.instance === "string" &&
          replacedEntities.has(entityOwner(componentRef.instance))) ||
        (runtimeReference &&
          Array.isArray((value as any).$entity) &&
          replacedEntities.has(entityOwner(referenceIds.entities[(value as any).$entity[0]]))) ||
        (!runtimeReference &&
          typeof (value as any).$entity === "string" &&
          replacedEntities.has(entityOwner((value as any).$entity))) ||
        (!runtimeReference &&
          typeof (value as any).$entity?.instance === "string" &&
          replacedEntities.has(entityOwner((value as any).$entity.instance))) ||
        Object.values(value).some((child) => referencesChanged(child, runtimeReference))
      );
    };
    const nestedState = (value: GalaceanSourceSceneFile, members: RuntimeInstanceSource, id: string) =>
      (value.prefab?.nestedOverrides as Array<{ rootSceneEntityId: string }> | undefined)?.filter(
        (entry) => (members.entities.get(entry.rootSceneEntityId)?.root ?? entry.rootSceneEntityId) === id
      ) ?? [];
    const instanceStructure = (record: GalaceanSourceEntitySchema | undefined, members: RuntimeInstanceSource) => {
      const root = record && members.entities.get(record.id);
      if (!root || !record?.instance) return record?.instance;
      const instance = structuredClone(record.instance);
      if (instance.overrides) {
        instance.overrides.entityProps = instance.overrides.entityProps?.filter(
          (patch) => patch.target !== root.target
        );
        for (const key of Object.keys(instance.overrides) as Array<
          keyof NonNullable<GalaceanInstanceSchema["overrides"]>
        >)
          if (!instance.overrides[key]?.length) delete instance.overrides[key];
        if (!Object.keys(instance.overrides).length) delete instance.overrides;
      }
      return instance;
    };
    const instanceIndices: number[] = [];
    for (const [index, record] of source.entities.entries()) {
      const prior = this.previous.entities.find((entity) => entity.id === record.id);
      if (
        record.instance &&
        (recovering ||
          !this.entities.has(record.id) ||
          !same(instanceStructure(record, members), instanceStructure(prior, this.previousMembers)) ||
          !same(nestedState(source, members, record.id), nestedState(this.previous, this.previousMembers, record.id)) ||
          (!members.entities.has(record.id) && removedValue(prior, record)) ||
          referencesChanged(record.instance))
      ) {
        instanceIndices.push(index);
        replacedEntities.add(record.id);
      } else if (!record.instance && prior?.instance) replacedEntities.add(record.id);
    }
    const priorEntities = new Map((recovering ? [] : this.previous.entities).map((entity) => [entity.id, entity]));
    const priorComponents = new Map(this.previous.components.map((component) => [component.id, component]));
    const oldRuntimeComponents = new Map(
      this.previous.components.map((component, index) => [component.id, this.previousRuntime.components[index]])
    );
    const classes = new Map(source.components.map((component) => [component.id, this.componentClass(component, pack)]));
    const owners = new Map(
      source.entities.flatMap((entity) => (entity.components ?? []).map((id) => [id, entity.id] as const))
    );
    for (const [index, record] of source.components.entries()) {
      const existing = this.components.get(record.id);
      const old = oldRuntimeComponents.get(record.id);
      const next = runtime.components[index];
      const removedProperties = removedValue(old?.props, next.props);
      const resetCalls =
        !same(priorComponents.get(record.id)?.calls, record.calls) ||
        (old?.calls ?? []).some((call) => !(next.calls ?? []).some((next) => next.method === call.method));
      if (
        existing &&
        (recovering ||
          existing.constructor !== classes.get(record.id) ||
          existing.entity !== this.entities.get(owners.get(record.id)!) ||
          removedProperties ||
          resetCalls)
      )
        replacedComponents.add(record.id);
    }
    // Instance overrides can reference replaced ordinary components or other instances.
    // Close over those references before constructing any candidate, independent of source order.
    let expanded: boolean;
    do {
      expanded = false;
      for (const [index, record] of source.entities.entries()) {
        if (record.instance && !replacedEntities.has(record.id) && referencesChanged(record.instance)) {
          instanceIndices.push(index);
          replacedEntities.add(record.id);
          expanded = true;
        }
      }
    } while (expanded);
    const sceneGroups = new Set(
      ["background", "ambient", "shadow", "fog", "ambientOcclusion"].filter((key) => {
        const group = key as keyof GalaceanSourceSceneSchema;
        return (
          recovering || !same(source.scene[group], this.previous.scene[group]) || referencesChanged(source.scene[group])
        );
      })
    );
    await applyRuntimeSceneSettings(this.scene, runtime, sceneGroups, signal);
    if (recovering || source.scene.name !== this.previous.scene.name) this.scene.name = source.scene.name ?? "";
    for (const record of source.entities) {
      if (!this.entities.has(record.id)) {
        const entity = new Entity(this.scene.engine, record.name);
        this.entities.set(record.id, entity);
      }
    }
    const retiredRoots: Entity[] = [];
    for (const record of source.entities)
      if (
        !record.instance &&
        replacedEntities.has(record.id) &&
        this.previous.entities.some((value) => value.id === record.id)
      ) {
        retiredRoots.push(this.entities.get(record.id)!);
        this.entities.set(record.id, new Entity(this.scene.engine, record.name));
      }
    const resume = new Map<Entity, boolean>();
    for (const record of source.entities) {
      const entity = this.entities.get(record.id)!;
      if (
        !priorEntities.has(record.id) ||
        record.isActive !== priorEntities.get(record.id)?.isActive ||
        (record.components ?? []).some((id) => !this.components.has(id) || replacedComponents.has(id))
      ) {
        const prior = priorEntities.get(record.id);
        resume.set(entity, !prior || record.isActive !== prior.isActive ? (record.isActive ?? true) : entity.isActive);
        entity.isActive = false;
      }
    }
    try {
      const nextIds = new Set(source.components.map((record) => record.id));
      for (const [id, component] of this.components) {
        if (!nextIds.has(id) || replacedComponents.has(id)) {
          component.destroy();
          this.components.delete(id);
        }
      }
      const context = new ParserContext(this.scene.engine, ParserType.Scene, this.scene);
      context.entityInstances = referenceIds.entities.map((id) => {
        const member = members.entities.get(id);
        if (!member) return this.entities.get(id)!;
        let entity = this.entities.get(member.root);
        for (const index of member.path) entity = entity?.children[index];
        return entity!;
      });
      // Allocate ordinary components before instance overrides can reference them.
      for (const record of source.entities)
        if (!record.instance) {
          const entity = this.entities.get(record.id)!;
          for (const id of record.components ?? [])
            if (!this.components.has(id)) this.components.set(id, entity.addComponent(classes.get(id)!));
        }
      // Compiled selectors describe authored order. Replaced components are appended by
      // Entity, so translate ordinary component IDs to their current native selectors.
      // Keep the compiled baseline intact for the next source comparison.
      const rebindComponentReferences = (value: any): any => {
        if (!value || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map(rebindComponentReferences);
        if (value.$component) {
          const id = sourceComponentId(value.$component);
          const component = id && this.components.get(id);
          if (component) {
            const type = Loader.getClass(value.$component.type);
            const index = component.entity.getComponents(type, []).indexOf(component);
            if (index < 0) throw new Error("Cannot resolve applied component identity");
            return { $component: { ...value.$component, index } };
          }
        }
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rebindComponentReferences(child)]));
      };
      if (instanceIndices.length) {
        const instanceRuntime = suppressUnavailableScriptPayloads(
          runtime,
          (path) => Loader.getClass(path)?.prototype instanceof UnavailableProjectScript
        );
        await new SceneParser(rebindComponentReferences(instanceRuntime), context, this.scene).instantiateInstances(
          instanceIndices
        );
        for (const index of instanceIndices) {
          const record = source.entities[index],
            previousEntity = this.entities.get(record.id)!;
          const entity = context.entityInstances[index];
          retiredRoots.push(previousEntity);
          resume.delete(previousEntity);
          this.entities.set(record.id, entity);
          resume.set(entity, record.isActive ?? entity.isActive);
          entity.isActive = false;
        }
      }
      const parser = new ReflectionParser(context, runtime.refs);
      const runtimeComponents = new Map(
        source.components.map((component, index) => [component.id, runtime.components[index]])
      );
      const sourceComponents = new Map(source.components.map((component) => [component.id, component]));
      for (const record of source.entities) {
        const entity = this.entities.get(record.id)!;
        const priorRecord = priorEntities.get(record.id);
        const current = { ...members.entities.get(record.id)?.record, ...record };
        const prior = priorRecord && { ...this.previousMembers.entities.get(record.id)?.record, ...priorRecord };
        // Native instance loading already applied template values and authored root overrides.
        if (record.instance && replacedEntities.has(record.id)) continue;
        for (const key of ["position", "rotation", "scale"] as const) {
          if (!same(current[key], prior?.[key])) {
            const value = current[key] ?? (key === "scale" ? [1, 1, 1] : [0, 0, 0]);
            entity.transform[key].set(value[0], value[1], value[2]);
          }
        }
        if (!prior || current.name !== prior.name) entity.name = current.name ?? "";
        if (!prior || current.layer !== prior.layer) entity.layer = current.layer ?? Layer.Layer0;
        if (!resume.has(entity) && (!prior || current.isActive !== prior.isActive))
          entity.isActive = current.isActive ?? true;
        for (const id of record.components ?? []) {
          if (!this.components.has(id)) {
            const component = entity.addComponent(classes.get(id)!);
            this.components.set(id, component);
          }
        }
      }
      const liveReferences = (value: any): any => {
        if (!value || typeof value !== "object") return value;
        if (Array.isArray(value)) return value.map(liveReferences);
        const entityPath = (path: number[]): Entity => {
          let entity = context.entityInstances[path[0]];
          for (const index of path.slice(1)) entity = entity?.children[index];
          if (!entity) throw new Error("Cannot resolve applied entity reference");
          return entity;
        };
        const contextIndex = (entity: Entity) => {
          let index = context.entityInstances.indexOf(entity);
          if (index < 0) {
            index = context.entityInstances.length;
            context.entityInstances.push(entity);
          }
          return index;
        };
        if (value.$component) {
          const ref = rebindComponentReferences(value).$component;
          const entity = entityPath(ref.entity);
          const type = Loader.getClass(ref.type);
          const component = entity.getComponents(type, [])[ref.index];
          if (!component) throw new Error("Cannot resolve applied component reference");
          return { $component: { entity: [contextIndex(entity)], type: ref.type, index: ref.index } };
        }
        if (value.$entity) return { $entity: [contextIndex(entityPath(value.$entity))] };
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, liveReferences(child)]));
      };
      for (const [id, record] of sourceComponents) {
        signal?.throwIfAborted();
        const previous = replacedComponents.has(id) ? undefined : priorComponents.get(id);
        if (previous && same(previous, record) && !referencesChanged(record)) continue;
        const component = this.components.get(id)!;
        const config = runtimeComponents.get(id)!;
        if (component instanceof UnavailableProjectScript) {
          component.enabled = false;
          continue;
        }
        for (const key of Object.keys(config.props ?? {})) {
          if (!(key in component)) throw new Error(`Unknown property '${record.type}.${key}'`);
        }
        const changedProps = Object.fromEntries(
          Object.entries(config.props ?? {}).filter(([key, value]) => {
            if (!previous) return true;
            if (referencesChanged(value, true) || referencesChanged(record.props?.[key])) return true;
            if (key in (record.props ?? {}) || key in (previous.props ?? {}))
              return !same(record.props?.[key], previous.props?.[key]);
            return !same(oldRuntimeComponents.get(id)?.props?.[key], value);
          })
        );
        await parser.parseProps(component, liveReferences(changedProps));
        const calls =
          !previous || !same(oldRuntimeComponents.get(id)?.calls, config.calls)
            ? config.calls
            : config.calls?.filter((call) => referencesChanged(call, true));
        await parser.parseCalls(component, liveReferences(calls));
      }
      signal?.throwIfAborted();
      const parents = new Map<string, string>();
      for (const record of source.entities) for (const child of record.children ?? []) parents.set(child, record.id);
      // Detach changed edges first so valid parent/child reversals never create an intermediate cycle.
      for (const record of source.entities) {
        const entity = this.entities.get(record.id)!;
        const parentId = parents.get(record.id);
        if (entity.parent && entity.parent !== (parentId ? this.entities.get(parentId) : null))
          entity.parent.removeChild(entity);
      }
      for (const record of source.entities) {
        const entity = this.entities.get(record.id)!;
        const parentId = parents.get(record.id);
        const parent = parentId ? this.entities.get(parentId)! : null;
        if (parent && entity.parent !== parent) parent.addChild(entity);
        else if (!parent && (entity.parent || entity.scene !== this.scene)) this.scene.addRootEntity(entity);
      }
      if (
        recovering ||
        !same(source.scene.rootEntities, this.previous.scene.rootEntities) ||
        source.scene.rootEntities.some((id) => replacedEntities.has(id))
      ) {
        source.scene.rootEntities.forEach((id, index) => {
          this.entities.get(id)!.siblingIndex = index;
        });
      }
      for (const record of source.entities) {
        if (
          !same(record.children, priorEntities.get(record.id)?.children) ||
          record.children?.some((id) => replacedEntities.has(id))
        ) {
          record.children?.forEach((id, index) => {
            this.entities.get(id)!.siblingIndex = index;
          });
        }
      }
      const retained = new Set(source.entities.map((entity) => entity.id));
      for (const [id, entity] of this.entities)
        if (!retained.has(id)) {
          entity.destroy();
          this.entities.delete(id);
        }
    } finally {
      for (const entity of retiredRoots) if (!entity.destroyed) entity.destroy();
      for (const [entity, active] of resume) if (!entity.destroyed) entity.isActive = active;
    }
    this.instances = new RuntimeInstanceIdentities(source, this.path, pack, (id) => this.entities.get(id));
    this.indexIdentities(source);
    this.previous = structuredClone(source);
    this.previousRuntime = runtime;
    this.previousMembers = members;
    this.assetChanges.accept(pack);
    this.needsResync = false;
  }

  private source(pack: RuntimeProjectPackage): GalaceanSourceSceneFile {
    const content = pack.contents[this.path];
    if (typeof content !== "string") throw new Error(`Missing Scene source '${this.path}'`);
    const source = JSON.parse(content);
    if (!source.asset || !source.scene) throw new Error("Projection requires editable Scene source");
    return source;
  }
  private componentClass(component: GalaceanSourceComponentSchema, pack: RuntimeProjectPackage): ComponentClass {
    let name = component.type;
    if (name === "Script") {
      const ref = component.script?.$ref;
      const file = pack.project.files.find((file) => file.virtualPath === ref);
      if (!file) throw new Error(`Unregistered Script '${ref}'`);
      name = file.virtualPath;
    }
    const type = Loader.getClass(name);
    if (!type || !(type.prototype instanceof Component)) throw new Error(`Unregistered component class '${name}'`);
    return type as ComponentClass;
  }
}
