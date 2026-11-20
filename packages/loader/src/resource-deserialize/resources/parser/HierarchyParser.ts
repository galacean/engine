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
import { DeferredPropCheck, ReflectionParser } from "./ReflectionParser";

type MutationWaveItem = {
  target: Component;
  blocks: MutationBlock[];
  deferCheck?: DeferredPropCheck;
  firstBlockPreResolved?: Record<string, unknown>;
};

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
    const wave0: MutationWaveItem[] = [];
    const wave1: MutationWaveItem[] = [];
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
        const wave1Item = wave1[i];
        const { target, blocks } = wave1Item;
        const wave0Index = wave0ByTarget.get(target);
        if (wave0Index === undefined) continue;

        const getDeferredRules:
          | ((
              baseProps: Record<string, unknown>,
              overrideProps: Record<string, unknown>
            ) => Record<string, true | ((value: unknown) => boolean)> | null)
          | undefined = (target.constructor as any)?._getDeferredDeserializeProps;
        if (typeof getDeferredRules !== "function") continue;

        const baseBlock = wave0[wave0Index].blocks[0];
        const firstOverride = blocks[0];
        if (baseBlock.props && firstOverride.props) {
          const rules = getDeferredRules(baseBlock.props, firstOverride.props);
          if (rules) {
            const baseProps = baseBlock.props;
            let staticDeferred: Record<string, unknown> | null = null;
            let predicates: Record<string, (value: unknown) => boolean> | null = null;
            for (const key in rules) {
              if (!(key in baseProps)) continue;
              const rule = rules[key];
              if (rule === true) {
                (staticDeferred ||= {})[key] = baseProps[key];
              } else {
                (predicates ||= {})[key] = rule;
              }
            }
            if (staticDeferred) {
              const remainingProps: Record<string, unknown> = {};
              let hasRemaining = false;
              for (const key in baseProps) {
                if (!(key in staticDeferred)) {
                  remainingProps[key] = baseProps[key];
                  hasRemaining = true;
                }
              }
              blocks[0] = HierarchyParser._mergeMutationBlocks({ props: staticDeferred }, firstOverride);
              if (hasRemaining || baseBlock.calls?.length) {
                wave0[wave0Index].blocks[0] = {
                  ...(hasRemaining ? { props: remainingProps } : {}),
                  ...(baseBlock.calls?.length ? { calls: baseBlock.calls } : {})
                };
              } else {
                wave0[wave0Index].blocks.length = 0;
                hasEmptyBase = true;
              }
            }
            if (predicates && wave0[wave0Index].blocks.length > 0) {
              const deferredValues: Record<string, unknown> = {};
              wave0[wave0Index].deferCheck = { predicates, deferredValues };
              wave1Item.firstBlockPreResolved = deferredValues;
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

  private _applyMutationWave(items: readonly MutationWaveItem[]): Promise<unknown> {
    const reflectionParser = this._reflectionParser;
    const applyBlock = (
      target: Component,
      block: MutationBlock,
      deferCheck?: DeferredPropCheck,
      preResolvedProps?: Record<string, unknown>
    ): Promise<unknown> =>
      target.destroyed
        ? Promise.resolve()
        : reflectionParser.parseMutationBlock(target, block, deferCheck, preResolvedProps);
    const runItemChain = ({
      target,
      blocks,
      deferCheck,
      firstBlockPreResolved
    }: MutationWaveItem): Promise<unknown> => {
      if (blocks.length === 1) {
        return applyBlock(target, blocks[0], deferCheck, firstBlockPreResolved);
      }
      let chain: Promise<unknown> = Promise.resolve();
      for (let i = 0, n = blocks.length; i < n; i++) {
        const block = blocks[i];
        const blockDefer = i === 0 ? deferCheck : undefined;
        const blockPreResolved = i === 0 ? firstBlockPreResolved : undefined;
        chain = chain.then(() => applyBlock(target, block, blockDefer, blockPreResolved));
      }
      return chain;
    };

    const noop = (): void => {};
    type PhasedQueue = MutationWaveItem & {
      phases: number[];
      cursor: number;
      tail: Promise<unknown> | null;
    };

    const runPhasedGroup = (queues: PhasedQueue[]): Promise<unknown> => {
      const allDone: Promise<unknown>[] = [];
      const launchBlock = (
        q: PhasedQueue,
        idx: number
      ): { propsDone: Promise<unknown>; blockDone: Promise<unknown> } => {
        const target = q.target;
        const block = q.blocks[idx];
        const deferCheck = idx === 0 ? q.deferCheck : undefined;
        const preResolvedProps = idx === 0 ? q.firstBlockPreResolved : undefined;
        const runProps = (): Promise<unknown> =>
          target.destroyed
            ? Promise.resolve()
            : reflectionParser.parseProps(target, block.props, deferCheck, preResolvedProps);
        const propsDone = q.tail ? q.tail.then(runProps) : runProps();
        const blockDone = block.calls?.length
          ? propsDone.then(() => (target.destroyed ? undefined : reflectionParser.parseCalls(target, block.calls)))
          : propsDone;
        q.tail = blockDone;
        // Mark handled so an early barrier failure never triggers an unhandled rejection before allDone settles.
        blockDone.catch(noop);
        allDone.push(blockDone);
        return { propsDone, blockDone };
      };

      const runNextStep = (): Promise<unknown> => {
        let minPhase = 2;
        for (let i = 0, n = queues.length; i < n; i++) {
          const q = queues[i];
          if (q.cursor < q.blocks.length) {
            const p = q.phases[q.cursor];
            if (p < minPhase) minPhase = p;
          }
        }
        if (minPhase === 2) {
          return Promise.all(allDone);
        }

        const barrier: Promise<unknown>[] = [];
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
              const { blockDone } = launchBlock(q, q.cursor++);
              barrier.push(blockDone);
              // Serialize mutually-restricting physics blocks that immediately relax within the same
              // (ownerRigidbody, owned MeshColliders) group so paired constraints never collide.
              if (minPhase > 0) {
                break;
              }
            }
          }
        }

        if (!pickedUnblocking) {
          for (let i = 0, n = queues.length; i < n; i++) {
            const q = queues[i];
            if (q.cursor < q.blocks.length && q.phases[q.cursor] === minPhase) {
              const { propsDone } = launchBlock(q, q.cursor++);
              // Relaxing props (-1) satisfy the cross-target physics barrier as soon as props finish;
              // neutral blocks without a future relax (0) never gate peer targets.
              if (minPhase !== 0) {
                barrier.push(propsDone);
              }
            }
          }
        }

        return barrier.length > 0 ? Promise.all(barrier).then(runNextStep) : runNextStep();
      };

      return runNextStep();
    };

    // Scope physics phase ordering strictly to each (ownerRigidbody, owned MeshColliders) group.
    // All neutral targets, standalone MeshColliders, independent Rigidbodies, and MeshCollider-only
    // groups run their sequential chains concurrently with zero cross-group blocking.
    let groups: Map<object, PhasedQueue[]> | null = null;
    const independentItems: MutationWaveItem[] = [];

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
        const groupKey: object | null = (item.target as any)._getDeserializeGroup?.() ?? null;
        if (groupKey) {
          groups ||= new Map<object, PhasedQueue[]>();
          let group = groups.get(groupKey);
          if (!group) {
            group = [];
            groups.set(groupKey, group);
          }
          group.push({
            target: item.target,
            blocks: item.blocks,
            deferCheck: item.deferCheck,
            firstBlockPreResolved: item.firstBlockPreResolved,
            phases: phases!,
            cursor: 0,
            tail: null
          });
          continue;
        }
      }
      independentItems.push(item);
    }

    if (!groups) {
      return Promise.all(items.map(runItemChain));
    }

    const tasks: Promise<unknown>[] = [];
    for (let i = 0, n = independentItems.length; i < n; i++) {
      tasks.push(runItemChain(independentItems[i]));
    }
    groups.forEach((group, groupKey) => {
      // Cross-component phase constraints exist only when a group contains BOTH the owner (Rigidbody)
      // and at least one owned component (MeshCollider); otherwise each target runs independently.
      let hasOwner = false;
      if (group.length > 1) {
        for (let i = 0, n = group.length; i < n; i++) {
          if (group[i].target === groupKey) {
            hasOwner = true;
            break;
          }
        }
      }
      if (hasOwner) {
        tasks.push(runPhasedGroup(group));
      } else {
        for (let i = 0, n = group.length; i < n; i++) {
          tasks.push(runItemChain(group[i]));
        }
      }
    });

    return Promise.all(tasks);
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
