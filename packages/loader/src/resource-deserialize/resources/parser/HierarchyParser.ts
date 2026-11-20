import { Component, ComponentConstructor, Engine, Entity, Loader, Scene } from "@galacean/engine-core";
import { GLTFResource } from "../../../gltf";
import { PrefabResource } from "../../../prefab/PrefabResource";
import { resolveRefItem } from "../../../schema/refs";
import {
  type ComponentSchema,
  type ComponentSelector,
  type ComponentOverride,
  type EntityPropOverride,
  type EntityOverrideProps,
  type EntitySchema,
  type InstanceOverrides,
  type PrefabInstanceEntitySchema
} from "../../../schema/HierarchySchema";
import type { MutationBlock, RefItem } from "../../../schema/CommonSchema";
import type { HierarchyFile } from "../../../schema/HierarchySchema";
import { ParserContext, ParserType } from "./ParserContext";
import { ReflectionParser } from "./ReflectionParser";

/** @Internal */
export abstract class HierarchyParser<T extends Scene | PrefabResource, V extends ParserContext> {
  readonly promise: Promise<T>;

  protected _resolve: (item: T) => void;
  protected _reject: (reason: any) => void;
  protected _engine: Engine;
  protected _reflectionParser: ReflectionParser;
  private _overrideEntityProps: Array<{ entity: Entity; override: EntityPropOverride }> = [];
  private _overrideComponentProps: Array<{ target: Component; block: ComponentOverride }> = [];
  private _overrideRemovedEntities: Entity[] = [];

  constructor(
    public readonly data: HierarchyFile,
    public readonly context: V
  ) {
    if (data.version !== "2.0") {
      const resourceType = context.type === ParserType.Scene ? "scene" : "prefab";
      throw new Error(`Unsupported ${resourceType} format version "${data.version}". Expected "2.0".`);
    }

    this._engine = this.context.engine;
    this.promise = new Promise<T>((resolve, reject) => {
      this._reject = reject;
      this._resolve = resolve;
    });
    this._reflectionParser = new ReflectionParser(context, data.refs);
  }

  public start() {
    this._parseEntities()
      .then(() => this._organizeEntities())
      .then(() => this._parseComponents())
      .then(() => this._parseComponentsPropsAndOverrides())
      .then(() => this._clearAndResolve())
      .then(this._resolve)
      .catch(this._reject);
  }

  /** Root entity indices for this hierarchy (scene.rootEntities or [prefab.root]). */
  protected abstract _getRootIndices(): number[];
  protected abstract _handleRootEntity(index: number): void;
  protected abstract _clearAndResolve(): Scene | PrefabResource;

  protected _onEntityCreated(_entity: Entity): void {}

  // ---------------------------------------------------------------------------
  // Stage 1: Create entity instances
  // ---------------------------------------------------------------------------

  private _parseEntities(): Promise<unknown> {
    const entities = this.data.entities;
    const entityInstances = this.context.entityInstances;
    const engine = this._engine;
    const promises: Promise<void>[] = [];

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];

      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) {
        promises.push(
          this._loadPrefabInstance(entityConfig, engine).then((entity) => {
            entityInstances[i] = entity;
          })
        );
      } else {
        const entity = new Entity(engine, entityConfig.name);
        HierarchyParser._applyEntityProps(entity, entityConfig);
        this._onEntityCreated(entity);
        entityInstances[i] = entity;
      }
    }

    return Promise.all(promises);
  }

  // ---------------------------------------------------------------------------
  // Stage 2: Build parent-child hierarchy
  // ---------------------------------------------------------------------------

  private _organizeEntities(): void {
    const entities = this.data.entities;
    const entityInstances = this.context.entityInstances;

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      // Prefab instance entities manage their own children.
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;

      const children = entityConfig.children;
      if (!children) continue;

      const parent = entityInstances[i];
      for (let j = 0, m = children.length; j < m; j++) {
        parent.addChild(entityInstances[children[j]]);
      }
    }

    const rootIndices = this._getRootIndices();
    for (let i = 0, n = rootIndices.length; i < n; i++) {
      this._handleRootEntity(rootIndices[i]);
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 3: Add components to entities
  // ---------------------------------------------------------------------------

  private _parseComponents(): void {
    const entities = this.data.entities;
    const allComponents = this.data.components;
    const entityInstances = this.context.entityInstances;
    const pendingComponents = this.context.pendingComponents;
    const refs = this.data.refs;
    const prefabOverrides: Array<{ rootEntity: Entity; overrides: InstanceOverrides }> = [];
    const addedEntityTargets: Array<{ parent: Entity; child: Entity }> = [];
    const changesByEntity = new Map<Entity, { removed: Component[]; added: ComponentSchema[] }>();
    const getChanges = (entity: Entity) => {
      let entry = changesByEntity.get(entity);
      if (!entry) {
        entry = { removed: [], added: [] };
        changesByEntity.set(entity, entry);
      }
      return entry;
    };

    // Pass 1: Pre-resolve template-side override targets before mutating hierarchy or components,
    // and collect removedComponents per entity (capturing pre-removal snapshots).
    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      if (!HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;
      const overrides = entityConfig.instance.overrides;
      if (!overrides) continue;

      const rootEntity = entityInstances[i];
      prefabOverrides.push({ rootEntity, overrides });

      if (overrides.entityProps) {
        for (let j = 0, m = overrides.entityProps.length; j < m; j++) {
          const override = overrides.entityProps[j] as EntityPropOverride;
          this._overrideEntityProps.push({
            entity: HierarchyParser._resolveEntity(rootEntity, override.path),
            override
          });
        }
      }

      if (overrides.addedEntities) {
        for (let j = 0, m = overrides.addedEntities.length; j < m; j++) {
          const added = overrides.addedEntities[j];
          addedEntityTargets.push({
            parent: HierarchyParser._resolveEntity(rootEntity, added.parent),
            child: entityInstances[added.entity]
          });
        }
      }

      if (overrides.removedEntities) {
        const removed = overrides.removedEntities;
        for (let j = 0, m = removed.length; j < m; j++) {
          this._overrideRemovedEntities.push(HierarchyParser._resolveEntity(rootEntity, removed[j]));
        }
      }

      if (overrides.removedComponents?.length) {
        const snapshots = (this.context.componentSnapshots ||= new Map());
        for (let j = 0, m = overrides.removedComponents.length; j < m; j++) {
          const override = overrides.removedComponents[j];
          const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
          let snapshot = snapshots.get(entity);
          if (!snapshot) {
            snapshot = entity._components.slice();
            snapshots.set(entity, snapshot);
          }
          const removedList = getChanges(entity).removed;
          const selectors = override.selectors;
          for (let k = 0, p = selectors.length; k < p; k++) {
            removedList.push(HierarchyParser._resolveComponent(entity, selectors[k], snapshot));
          }
        }
      }
    }

    // Pass 2: Attach all addedEntities (appends to end of children; never shifts template indices 0..k-1).
    for (let i = 0, n = addedEntityTargets.length; i < n; i++) {
      const { parent, child } = addedEntityTargets[i];
      if (!parent.destroyed && !child.destroyed) {
        parent.addChild(child);
      }
    }

    // Pass 3: Collect all component additions per entity — normal entityConfig.components first,
    // then prefab override addedComponents — independent of entities[] ordering.
    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;
      const componentIndices = entityConfig.components;
      if (!componentIndices?.length) continue;

      const addedList = getChanges(entityInstances[i]).added;
      for (let j = 0, m = componentIndices.length; j < m; j++) {
        addedList.push(allComponents[componentIndices[j]]);
      }
    }

    for (let i = 0, n = prefabOverrides.length; i < n; i++) {
      const { rootEntity, overrides } = prefabOverrides[i];
      const additions = overrides.addedComponents;
      if (!additions?.length) continue;

      for (let j = 0, m = additions.length; j < m; j++) {
        const added = additions[j];
        const target = HierarchyParser._resolveEntity(rootEntity, added.target);
        getChanges(target).added.push(allComponents[added.component]);
      }
    }

    // Pass 4: Apply removed + added component changes exactly once per entity.
    const snapshots = this.context.componentSnapshots;
    changesByEntity.forEach(({ removed, added }, entity) => {
      HierarchyParser._applyEntityComponentChanges(
        entity,
        removed,
        added,
        refs,
        pendingComponents,
        snapshots?.get(entity)
      );
    });

    // Pass 5: Resolve componentProps after all structural edits so overrides targeting
    // newly added components or surviving components after removals resolve cleanly.
    for (let i = 0, n = prefabOverrides.length; i < n; i++) {
      const { rootEntity, overrides } = prefabOverrides[i];
      const propOverrides = overrides.componentProps;
      if (!propOverrides?.length) continue;

      for (let j = 0, m = propOverrides.length; j < m; j++) {
        const override = propOverrides[j];
        const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
        const target = HierarchyParser._resolveComponent(entity, override.selector, snapshots?.get(entity));
        this._overrideComponentProps.push({ target, block: override });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Apply removedEntities, entityProps, and unified component props/calls/overrides
  // ---------------------------------------------------------------------------

  private _parseComponentsPropsAndOverrides(): Promise<unknown> {
    const removedEntities = this._overrideRemovedEntities;
    const entityProps = this._overrideEntityProps;
    const componentProps = this._overrideComponentProps;

    // Destroy removedEntities before resolving props/calls (snapshotting parent children for $entity refs)
    if (removedEntities.length > 0) {
      const childSnapshots = (this.context.childSnapshots ||= new Map());
      for (let i = 0, n = removedEntities.length; i < n; i++) {
        const parent = removedEntities[i].parent;
        if (parent && !childSnapshots.has(parent)) {
          childSnapshots.set(parent, parent.children.slice());
        }
      }
      for (let i = 0, n = removedEntities.length; i < n; i++) {
        const entity = removedEntities[i];
        if (!entity.destroyed) {
          entity.destroy();
        }
      }
      removedEntities.length = 0;
    }

    // entityProps — entity-level property overrides
    for (let i = 0, n = entityProps.length; i < n; i++) {
      const { entity, override } = entityProps[i];
      if (!entity.destroyed) {
        HierarchyParser._applyEntityProps(entity, override);
      }
    }
    entityProps.length = 0;

    // Group base component blocks (pendingComponents) and prefab componentProps per target component.
    // Merge an incoming block into the preceding block on the same target ONLY when the preceding block
    // has no `calls`, preserving `calls` state boundaries while merging props-only blocks (e.g. MeshCollider
    // base isTrigger=true + override convex=true) for one global phase-ordered pass.
    const { pendingComponents } = this.context;
    const items: Array<{ target: Component; blocks: MutationBlock[] }> = [];
    const byTarget = componentProps.length > 0 ? new Map<Component, number>() : null;

    for (let i = 0, n = pendingComponents.length; i < n; i++) {
      const { instance, config } = pendingComponents[i];
      if (instance.destroyed) continue;
      if (byTarget) {
        byTarget.set(instance, items.length);
      }
      items.push({ target: instance, blocks: [config] });
    }

    for (let i = 0, n = componentProps.length; i < n; i++) {
      const { target, block } = componentProps[i];
      if (target.destroyed) continue;
      const existingIndex = byTarget!.get(target);
      if (existingIndex !== undefined) {
        const blocks = items[existingIndex].blocks;
        const prev = blocks[blocks.length - 1];
        if (!prev.calls?.length) {
          blocks[blocks.length - 1] = HierarchyParser._mergeMutationBlocks(prev, block);
        } else {
          blocks.push(block);
        }
      } else {
        byTarget!.set(target, items.length);
        items.push({ target, blocks: [block] });
      }
    }
    componentProps.length = 0;

    return items.length > 0 ? this._applyMutationBlocks(items) : Promise.resolve();
  }

  private static _mergeMutationBlocks(base: MutationBlock, override: MutationBlock): MutationBlock {
    const props =
      base.props && override.props
        ? HierarchyParser._mergeProps(base.props, override.props)
        : (override.props ?? base.props);
    return { props, calls: override.calls };
  }

  private static _mergeProps(
    base: Record<string, unknown>,
    override: Record<string, unknown>
  ): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...base };
    for (const key in override) {
      const baseVal = merged[key];
      const overrideVal = override[key];
      merged[key] =
        HierarchyParser._isPlainPropsObject(baseVal) && HierarchyParser._isPlainPropsObject(overrideVal)
          ? HierarchyParser._mergeProps(baseVal, overrideVal)
          : overrideVal;
    }
    return merged;
  }

  private static _isPlainPropsObject(value: unknown): value is Record<string, unknown> {
    if (value == null || typeof value !== "object" || Array.isArray(value)) return false;
    for (const key in value as Record<string, unknown>) {
      if (key.charCodeAt(0) === 36) return false;
    }
    return true;
  }

  private _applyMutationBlocks(
    items: readonly { target: Component; blocks: readonly MutationBlock[] }[]
  ): Promise<unknown> {
    const reflectionParser = this._reflectionParser;
    const applyItem = ({
      target,
      blocks
    }: {
      target: Component;
      blocks: readonly MutationBlock[];
    }): Promise<unknown> => {
      if (blocks.length === 1) {
        return reflectionParser.parseMutationBlock(target, blocks[0]);
      }
      let chain: Promise<unknown> = Promise.resolve();
      for (let i = 0, n = blocks.length; i < n; i++) {
        const block = blocks[i];
        chain = chain.then(() => reflectionParser.parseMutationBlock(target, block));
      }
      return chain;
    };

    let relax: { target: Component; blocks: readonly MutationBlock[] }[] | null = null;
    let neutral: { target: Component; blocks: readonly MutationBlock[] }[] | null = null;
    let restrict: { target: Component; blocks: readonly MutationBlock[] }[] | null = null;

    for (let i = 0, n = items.length; i < n; i++) {
      const item = items[i];
      const getPhase: ((props: Record<string, unknown>) => number) | undefined = (item.target.constructor as any)
        ?._getDeserializePhase;
      let phase = 0;
      if (typeof getPhase === "function") {
        const blocks = item.blocks;
        for (let j = blocks.length - 1; j >= 0; j--) {
          const props = blocks[j].props;
          if (!props) continue;
          const blockPhase = getPhase(props);
          if (blockPhase !== 0) {
            phase = blockPhase;
            break;
          }
        }
      }
      if (phase < 0) {
        (relax ||= []).push(item);
      } else if (phase > 0) {
        (restrict ||= []).push(item);
      } else {
        (neutral ||= []).push(item);
      }
    }

    if (!relax && !restrict) {
      return Promise.all(items.map(applyItem));
    }

    let chain: Promise<unknown> = Promise.resolve();
    if (relax) {
      const batch = relax;
      chain = chain.then(() => Promise.all(batch.map(applyItem)));
    }
    if (neutral) {
      const batch = neutral;
      chain = chain.then(() => Promise.all(batch.map(applyItem)));
    }
    if (restrict) {
      const batch = restrict;
      chain = chain.then(() => Promise.all(batch.map(applyItem)));
    }
    return chain;
  }

  // ---------------------------------------------------------------------------
  // Prefab instance loading
  // ---------------------------------------------------------------------------

  private _loadPrefabInstance(entityConfig: PrefabInstanceEntitySchema, engine: Engine): Promise<Entity> {
    const instance = entityConfig.instance;
    let refItem: RefItem;
    try {
      refItem = resolveRefItem(this.data.refs, instance.asset, "HierarchyParser", "instance.asset");
    } catch (error) {
      return Promise.reject(error);
    }

    return engine.resourceManager
      .getResourceByRef<PrefabResource | GLTFResource>(refItem)
      .then<Entity>((prefabResource) => {
        const entity =
          prefabResource instanceof PrefabResource
            ? prefabResource.instantiate()
            : prefabResource!.instantiateSceneRoot();
        this._onEntityCreated(entity);
        return entity;
      });
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /** Resolve an entity inside a prefab instance by walking the child-index path from root */
  private static _resolveEntity(root: Entity, path: number[]): Entity {
    let entity = root;
    for (let i = 0, n = path.length; i < n; i++) {
      entity = entity.children[path[i]];
      if (!entity)
        throw new Error(`HierarchyParser: override target entity not found at path [${path}], failed at depth ${i}`);
    }
    return entity;
  }

  /** Resolve a component on an entity by type name + per-type index (using pre-removal+addition snapshot when present). */
  private static _resolveComponent(entity: Entity, selector: ComponentSelector, snapshot?: Component[]): Component {
    const type = Loader.getClass(selector.type);
    if (!type) throw new Error(`HierarchyParser: override target component type "${selector.type}" is not registered`);
    if (snapshot) {
      let matchIndex = 0;
      for (let i = 0, n = snapshot.length; i < n; i++) {
        const candidate = snapshot[i];
        if (candidate instanceof type) {
          if (matchIndex === selector.index) {
            return candidate;
          }
          matchIndex++;
        }
      }
      throw new Error(`HierarchyParser: override target component not found: ${selector.type}/${selector.index}`);
    }
    const buffer = ReflectionParser._componentBuffer;
    buffer.length = 0;
    entity.getComponents(type, buffer);
    const result = buffer[selector.index];
    buffer.length = 0;
    if (!result)
      throw new Error(`HierarchyParser: override target component not found: ${selector.type}/${selector.index}`);
    return result;
  }

  /** Apply per-entity removals and resolve/add component configs in dependency order. */
  private static _applyEntityComponentChanges(
    entity: Entity,
    removed: readonly Component[],
    configs: readonly ComponentSchema[],
    refs: RefItem[],
    pendingComponents: { instance: Component; config: ComponentSchema }[],
    componentSnapshot?: Component[]
  ): void {
    const n = configs.length;
    const classes = new Array<ComponentConstructor>(n);
    for (let i = 0; i < n; i++) {
      const config = configs[i];
      const key =
        config.script != null
          ? resolveRefItem(refs, config.script, "HierarchyParser", "component.script").url
          : config.type;
      const Class = Loader.getClass(key);
      if (!Class) throw new Error(`Loader.getClass: class "${key}" is not registered`);
      classes[i] = Class;
    }
    const addedInConfigOrder = componentSnapshot && n > 0 ? new Array<Component>(n) : null;
    entity._applyComponentChanges(removed, classes, (i, instance) => {
      pendingComponents.push({ instance, config: configs[i] });
      if (addedInConfigOrder) {
        addedInConfigOrder[i] = instance;
      }
    });
    if (componentSnapshot && addedInConfigOrder) {
      for (let i = 0; i < n; i++) {
        componentSnapshot.push(addedInConfigOrder[i]);
      }
    }
  }

  private static _isPrefabInstanceEntity(entityConfig: EntitySchema): entityConfig is PrefabInstanceEntitySchema {
    return "instance" in entityConfig;
  }

  /** Apply entity-level props (name, isActive, layer, transform) to an entity. */
  private static _applyEntityProps(entity: Entity, props: EntityOverrideProps): void {
    if (props.name != null) entity.name = props.name;
    if (props.isActive != null) entity.isActive = props.isActive;
    if (props.layer != null) entity.layer = props.layer;
    if (props.position) entity.transform.position.set(props.position[0], props.position[1], props.position[2]);
    if (props.rotation) entity.transform.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
    if (props.scale) entity.transform.scale.set(props.scale[0], props.scale[1], props.scale[2]);
  }
}
