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

    // Strict two-wave barrier: Wave 0 (base pendingComponents) -> Wave 1 (prefab componentProps overrides).
    // Overrides never promote into Wave 0, so Wave 0 base calls/setters always see base state identically
    // regardless of unrelated components' calls. Only base props explicitly flagged by a component's
    // `_getDeferredDeserializeProps` (e.g. MeshCollider's `isTrigger` when Wave 1 sets `convex: true`)
    // are extracted onto the first Wave 1 override so all other base props still execute on time in Wave 0.
    const { pendingComponents } = this.context;
    const wave0: Array<{ target: Component; blocks: MutationBlock[] }> = [];
    const wave1: Array<{ target: Component; blocks: MutationBlock[] }> = [];
    const wave0ByTarget = componentProps.length > 0 ? new Map<Component, number>() : null;
    const wave1ByTarget = componentProps.length > 0 ? new Map<Component, number>() : null;

    for (let i = 0, n = pendingComponents.length; i < n; i++) {
      const { instance, config } = pendingComponents[i];
      if (instance.destroyed) continue;
      if (wave0ByTarget) {
        wave0ByTarget.set(instance, wave0.length);
      }
      wave0.push({ target: instance, blocks: [config] });
    }

    for (let i = 0, n = componentProps.length; i < n; i++) {
      const { target, block } = componentProps[i];
      if (target.destroyed) continue;

      const wave1Index = wave1ByTarget!.get(target);
      if (wave1Index !== undefined) {
        const blocks = wave1[wave1Index].blocks;
        const prev = blocks[blocks.length - 1];
        if (!prev.calls?.length) {
          blocks[blocks.length - 1] = HierarchyParser._mergeMutationBlocks(prev, block);
        } else {
          blocks.push(block);
        }
      } else {
        wave1ByTarget!.set(target, wave1.length);
        wave1.push({ target, blocks: [block] });
      }
    }
    componentProps.length = 0;

    if (wave0ByTarget && wave1.length > 0) {
      let hasEmptyBase = false;
      for (let i = 0, n = wave1.length; i < n; i++) {
        const { target, blocks } = wave1[i];
        const wave0Index = wave0ByTarget.get(target);
        if (wave0Index === undefined) continue;

        const getDeferredProps:
          | ((baseProps: Record<string, unknown>, overrideProps: Record<string, unknown>) => readonly string[] | null)
          | undefined = (target.constructor as any)?._getDeferredDeserializeProps;
        if (typeof getDeferredProps !== "function") continue;

        const baseBlock = wave0[wave0Index].blocks[0];
        const firstOverride = blocks[0];
        if (!baseBlock.calls?.length && baseBlock.props && firstOverride.props) {
          const deferredKeys = getDeferredProps(baseBlock.props, firstOverride.props);
          if (deferredKeys && deferredKeys.length > 0) {
            const baseProps = baseBlock.props;
            const deferredProps: Record<string, unknown> = {};
            for (let j = 0, m = deferredKeys.length; j < m; j++) {
              const key = deferredKeys[j];
              if (key in baseProps) {
                deferredProps[key] = baseProps[key];
              }
            }
            const remainingProps: Record<string, unknown> = {};
            let hasRemaining = false;
            for (const key in baseProps) {
              if (!(key in deferredProps)) {
                remainingProps[key] = baseProps[key];
                hasRemaining = true;
              }
            }
            blocks[0] = HierarchyParser._mergeMutationBlocks({ props: deferredProps }, firstOverride);
            if (hasRemaining) {
              wave0[wave0Index].blocks[0] = { props: remainingProps };
            } else {
              wave0[wave0Index].blocks.length = 0;
              hasEmptyBase = true;
            }
          }
        }
      }
      if (hasEmptyBase) {
        let write = 0;
        for (let i = 0, n = wave0.length; i < n; i++) {
          if (wave0[i].blocks.length > 0) {
            wave0[write++] = wave0[i];
          }
        }
        wave0.length = write;
      }
    }

    if (wave0.length === 0) {
      return wave1.length > 0 ? this._applyMutationWave(wave1) : Promise.resolve();
    }
    if (wave1.length === 0) {
      return this._applyMutationWave(wave0);
    }
    return this._applyMutationWave(wave0).then(() => this._applyMutationWave(wave1));
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

  private _applyMutationWave(
    items: readonly { target: Component; blocks: readonly MutationBlock[] }[]
  ): Promise<unknown> {
    const reflectionParser = this._reflectionParser;
    const applyBlock = (target: Component, block: MutationBlock): Promise<unknown> =>
      target.destroyed ? Promise.resolve() : reflectionParser.parseMutationBlock(target, block);
    const runItemChain = ({
      target,
      blocks
    }: {
      target: Component;
      blocks: readonly MutationBlock[];
    }): Promise<unknown> => {
      if (blocks.length === 1) {
        return applyBlock(target, blocks[0]);
      }
      let chain: Promise<unknown> = Promise.resolve();
      for (let i = 0, n = blocks.length; i < n; i++) {
        const block = blocks[i];
        chain = chain.then(() => applyBlock(target, block));
      }
      return chain;
    };

    // Only engage phased scheduling for targets that actually contain a non-zero phase block.
    // All-neutral targets run their own sequential chains independently so unrelated async calls
    // never lockstep or deadlock behind another target's pending promise.
    let phasedQueues: Array<{
      target: Component;
      blocks: readonly MutationBlock[];
      phases: number[];
      cursor: number;
    }> | null = null;
    let neutralItems: Array<{ target: Component; blocks: readonly MutationBlock[] }> | null = null;

    for (let i = 0, n = items.length; i < n; i++) {
      const item = items[i];
      const getPhase: ((props: Record<string, unknown>) => number) | undefined = (item.target.constructor as any)
        ?._getDeserializePhase;
      let hasNonZeroPhase = false;
      let phases: number[] | null = null;
      if (typeof getPhase === "function") {
        const blocks = item.blocks;
        phases = new Array<number>(blocks.length);
        for (let j = 0, m = blocks.length; j < m; j++) {
          const props = blocks[j].props;
          if (props) {
            const p = getPhase(props);
            const normalized = p < 0 ? -1 : p > 0 ? 1 : 0;
            phases[j] = normalized;
            if (normalized !== 0) {
              hasNonZeroPhase = true;
            }
          } else {
            phases[j] = 0;
          }
        }
      }
      if (hasNonZeroPhase) {
        if (!phasedQueues) {
          phasedQueues = [];
          neutralItems = items.slice(0, i);
        }
        phasedQueues.push({ target: item.target, blocks: item.blocks, phases: phases!, cursor: 0 });
      } else if (neutralItems) {
        neutralItems.push(item);
      }
    }

    if (!phasedQueues) {
      return Promise.all(items.map(runItemChain));
    }

    let neutralPending = neutralItems!.length > 0;
    const queues = phasedQueues;

    const runNextStep = (): Promise<unknown> => {
      let minPhase = neutralPending ? 0 : 2;
      for (let i = 0, n = queues.length; i < n; i++) {
        const q = queues[i];
        if (q.cursor < q.blocks.length) {
          const p = q.phases[q.cursor];
          if (p < minPhase) minPhase = p;
        }
      }
      if (minPhase === 2) {
        return Promise.resolve();
      }

      const promises: Promise<unknown>[] = [];
      let pickedUnblocking = false;
      if (minPhase > -1) {
        for (let i = 0, n = queues.length; i < n; i++) {
          const q = queues[i];
          if (q.cursor >= q.blocks.length || q.phases[q.cursor] !== minPhase) continue;
          let hasFutureRelax = false;
          for (let j = q.cursor + 1, m = q.phases.length; j < m; j++) {
            if (q.phases[j] < 0) {
              hasFutureRelax = true;
              break;
            }
          }
          if (hasFutureRelax) {
            pickedUnblocking = true;
            promises.push(applyBlock(q.target, q.blocks[q.cursor++]));
            // Serialize mutually-restricting physics blocks that immediately relax so e.g.
            // Rigidbody(isKinematic=false->true) and MeshCollider(convex=false->true) don't collide.
            if (minPhase > 0) {
              break;
            }
          }
        }
      }

      if (!pickedUnblocking) {
        if (minPhase === 0 && neutralPending) {
          neutralPending = false;
          for (let i = 0, n = neutralItems!.length; i < n; i++) {
            promises.push(runItemChain(neutralItems![i]));
          }
        }
        for (let i = 0, n = queues.length; i < n; i++) {
          const q = queues[i];
          if (q.cursor < q.blocks.length && q.phases[q.cursor] === minPhase) {
            promises.push(applyBlock(q.target, q.blocks[q.cursor++]));
          }
        }
      }

      return Promise.all(promises).then(runNextStep);
    };

    return runNextStep();
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
