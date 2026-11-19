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
      .then(() => this._parseComponentsPropsAndCalls())
      .then(() => this._parsePrefabOverrides())
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

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      const entity = entityInstances[i];
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) {
        const additions = entityConfig.instance.overrides?.addedComponents;
        const additionCount = additions?.length ?? 0;
        if (additionCount === 1) {
          const added = additions![0];
          const target = HierarchyParser._resolveEntity(entity, added.target);
          const config = allComponents[added.component];
          HierarchyParser._addComponentsFromConfigs(target, [config], refs, pendingComponents);
        } else if (additionCount > 1) {
          const grouped = new Map<Entity, ComponentSchema[]>();
          for (let j = 0; j < additionCount; j++) {
            const added = additions![j];
            const target = HierarchyParser._resolveEntity(entity, added.target);
            const config = allComponents[added.component];
            let list = grouped.get(target);
            if (!list) {
              list = [];
              grouped.set(target, list);
            }
            list.push(config);
          }
          grouped.forEach((configs, target) => {
            HierarchyParser._addComponentsFromConfigs(target, configs, refs, pendingComponents);
          });
        }
        continue;
      }

      const componentIndices = entityConfig.components;
      if (!componentIndices?.length) continue;

      const configs = new Array<ComponentSchema>(componentIndices.length);
      for (let j = 0, m = componentIndices.length; j < m; j++) {
        configs[j] = allComponents[componentIndices[j]];
      }
      HierarchyParser._addComponentsFromConfigs(entity, configs, refs, pendingComponents);
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Apply props and execute calls on components
  // ---------------------------------------------------------------------------

  private _parseComponentsPropsAndCalls(): Promise<unknown> {
    const { pendingComponents } = this.context;
    const items = new Array<{ target: Component; block: MutationBlock }>(pendingComponents.length);
    for (let i = 0, n = pendingComponents.length; i < n; i++) {
      const { instance, config } = pendingComponents[i];
      items[i] = { target: instance, block: config };
    }
    return this._applyMutationBlocks(items);
  }

  // ---------------------------------------------------------------------------
  // Stage 5: Apply prefab instance overrides
  // ---------------------------------------------------------------------------

  private _parsePrefabOverrides(): Promise<unknown> {
    const entities = this.data.entities;
    const entityInstances = this.context.entityInstances;
    const promises: Promise<unknown>[] = [];

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      if (!HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;

      const overrides = entityConfig.instance.overrides;
      if (!overrides) continue;

      this._applyOverrides(entityInstances[i], overrides, promises);
    }

    return Promise.all(promises);
  }

  private _applyOverrides(rootEntity: Entity, overrides: InstanceOverrides, promises: Promise<unknown>[]): void {
    // Pre-resolve every override target against the intact prefab instance before any mutation or destroy shifts indices
    const entityPropTargets: { entity: Entity; override: EntityPropOverride }[] = [];
    if (overrides.entityProps) {
      for (let j = 0, m = overrides.entityProps.length; j < m; j++) {
        const override = overrides.entityProps[j] as EntityPropOverride;
        entityPropTargets.push({ entity: HierarchyParser._resolveEntity(rootEntity, override.path), override });
      }
    }

    const componentPropTargets: { target: Component; block: ComponentOverride }[] = [];
    if (overrides.componentProps) {
      for (let j = 0, m = overrides.componentProps.length; j < m; j++) {
        const override = overrides.componentProps[j] as ComponentOverride;
        const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
        const target = HierarchyParser._resolveComponent(entity, override.selector);
        componentPropTargets.push({ target, block: override });
      }
    }

    const addedEntityTargets: { parent: Entity; child: Entity }[] = [];
    if (overrides.addedEntities) {
      const entityInstances = this.context.entityInstances;
      for (let j = 0, m = overrides.addedEntities.length; j < m; j++) {
        const added = overrides.addedEntities[j];
        addedEntityTargets.push({
          parent: HierarchyParser._resolveEntity(rootEntity, added.parent),
          child: entityInstances[added.entity]
        });
      }
    }

    const removedEntityTargets: Entity[] = [];
    if (overrides.removedEntities) {
      const removed = overrides.removedEntities;
      for (let j = 0, m = removed.length; j < m; j++) {
        removedEntityTargets.push(HierarchyParser._resolveEntity(rootEntity, removed[j]));
      }
    }

    const removedComponentTargets: Component[] = [];
    if (overrides.removedComponents) {
      for (let j = 0, m = overrides.removedComponents.length; j < m; j++) {
        const override = overrides.removedComponents[j];
        const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
        const selectors = override.selectors;
        for (let k = 0, p = selectors.length; k < p; k++) {
          removedComponentTargets.push(HierarchyParser._resolveComponent(entity, selectors[k]));
        }
      }
    }

    // Destroy removedComponents (dependents before dependencies) and removedEntities before componentProps
    // so removing conflicting colliders (e.g. PlaneCollider / non-convex MeshCollider) unblocks constraint updates
    if (removedComponentTargets.length > 0) {
      Entity._destroyComponents(removedComponentTargets);
    }
    for (let j = 0, m = removedEntityTargets.length; j < m; j++) {
      const entity = removedEntityTargets[j];
      if (!entity.destroyed) {
        entity.destroy();
      }
    }

    // entityProps — entity-level property overrides
    for (let j = 0, m = entityPropTargets.length; j < m; j++) {
      const { entity, override } = entityPropTargets[j];
      if (!entity.destroyed) {
        HierarchyParser._applyEntityProps(entity, override);
      }
    }

    // addedEntities — attach already-created top-level entityInstances[index] as a child
    for (let j = 0, m = addedEntityTargets.length; j < m; j++) {
      const { parent, child } = addedEntityTargets[j];
      if (!parent.destroyed && !child.destroyed) {
        parent.addChild(child);
      }
    }

    // componentProps — apply surviving component overrides in constraint phase order (relax -> neutral -> restrict)
    if (componentPropTargets.length > 0) {
      const surviving: { target: Component; block: MutationBlock }[] = [];
      for (let j = 0, m = componentPropTargets.length; j < m; j++) {
        const item = componentPropTargets[j];
        if (!item.target.destroyed) {
          surviving.push(item);
        }
      }
      if (surviving.length > 0) {
        promises.push(this._applyMutationBlocks(surviving));
      }
    }
  }

  private _applyMutationBlocks(items: readonly { target: Component; block: MutationBlock }[]): Promise<unknown> {
    const reflectionParser = this._reflectionParser;
    let relax: { target: Component; block: MutationBlock }[] | null = null;
    let neutral: { target: Component; block: MutationBlock }[] | null = null;
    let restrict: { target: Component; block: MutationBlock }[] | null = null;

    for (let i = 0, n = items.length; i < n; i++) {
      const item = items[i];
      const props = item.block.props;
      const getPhase: ((props: Record<string, unknown>) => number) | undefined = (item.target.constructor as any)
        ?._getDeserializePhase;
      const phase = props && typeof getPhase === "function" ? getPhase(props) : 0;
      if (phase < 0) {
        (relax ||= []).push(item);
      } else if (phase > 0) {
        (restrict ||= []).push(item);
      } else {
        (neutral ||= []).push(item);
      }
    }

    if (!relax && !restrict) {
      return Promise.all(items.map(({ target, block }) => reflectionParser.parseMutationBlock(target, block)));
    }

    let chain: Promise<unknown> = Promise.resolve();
    if (relax) {
      const batch = relax;
      chain = chain.then(() =>
        Promise.all(batch.map(({ target, block }) => reflectionParser.parseMutationBlock(target, block)))
      );
    }
    if (neutral) {
      const batch = neutral;
      chain = chain.then(() =>
        Promise.all(batch.map(({ target, block }) => reflectionParser.parseMutationBlock(target, block)))
      );
    }
    if (restrict) {
      const batch = restrict;
      chain = chain.then(() =>
        Promise.all(batch.map(({ target, block }) => reflectionParser.parseMutationBlock(target, block)))
      );
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

  /** Resolve a component on an entity by type name + per-type index */
  private static _resolveComponent(entity: Entity, selector: ComponentSelector): Component {
    const type = Loader.getClass(selector.type);
    if (!type) throw new Error(`HierarchyParser: override target component type "${selector.type}" is not registered`);
    const buffer = ReflectionParser._componentBuffer;
    buffer.length = 0;
    entity.getComponents(type, buffer);
    const result = buffer[selector.index];
    buffer.length = 0;
    if (!result)
      throw new Error(`HierarchyParser: override target component not found: ${selector.type}/${selector.index}`);
    return result;
  }

  /** Resolve component classes from configs and add them to the entity in dependency order. */
  private static _addComponentsFromConfigs(
    entity: Entity,
    configs: ComponentSchema[],
    refs: RefItem[],
    pendingComponents: { instance: Component; config: ComponentSchema }[]
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
    entity._addComponents(classes, (i, instance) => {
      pendingComponents.push({ instance, config: configs[i] });
    });
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
