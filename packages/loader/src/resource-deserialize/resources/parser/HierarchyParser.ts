import { Component, ComponentConstructor, Entity, Loader, Scene, Transform } from "@galacean/engine-core";
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
import type { RefItem } from "../../../schema/CommonSchema";
import type { HierarchyFile } from "../../../schema/HierarchySchema";
import { ParserContext, ParserType } from "./ParserContext";
import { ReflectionParser } from "./ReflectionParser";

/** @Internal */
export abstract class HierarchyParser<T extends Scene | PrefabResource> {
  private static readonly _emptyComponents = [] as const;

  protected _reflectionParser: ReflectionParser;
  private _overrideEntityProps: Array<{ entity: Entity; override: EntityPropOverride }> = [];
  private _overrideComponentProps: Array<{ target: Component; block: ComponentOverride }> = [];
  private _overrideRemovedEntities: Entity[] = [];

  constructor(
    public readonly data: HierarchyFile,
    public readonly context: ParserContext<T>
  ) {
    if (data.version !== "2.0") {
      const resourceType = context.type === ParserType.Scene ? "scene" : "prefab";
      throw new Error(`Unsupported ${resourceType} format version "${data.version}". Expected "2.0".`);
    }

    this._reflectionParser = new ReflectionParser(context, data.refs);
  }

  async start(): Promise<void> {
    await this._parseEntities();
    this._organizeEntities();
    this._parseComponents();
    await this._parseComponentsPropsAndOverrides();
  }

  /** Root entity indices for this hierarchy (scene.rootEntities or [prefab.root]). */
  protected abstract _getRootIndices(): number[];
  protected abstract _handleRootEntity(index: number): void;

  protected _onEntityCreated?(entity: Entity): void;

  // ---------------------------------------------------------------------------
  // Stage 1: Create entity instances
  // ---------------------------------------------------------------------------

  private _parseEntities(): Promise<unknown> {
    const entities = this.data.entities;
    const entityInstances = this.context.entityInstances;
    const engine = this.context.engine;
    const promises: Promise<void>[] = [];

    try {
      for (let i = 0, n = entities.length; i < n; i++) {
        const entityConfig = entities[i];

        if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) {
          promises.push(this._loadPrefabInstance(entityConfig, i));
        } else {
          const entity = (entityInstances[i] = new Entity(engine, entityConfig.name));
          HierarchyParser._applyEntityProps(entity, entityConfig);
          this._onEntityCreated?.(entity);
        }
      }
    } catch (error) {
      promises.push(Promise.reject(error));
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
  // Stage 3: Resolve overrides and build the instance component layout
  // ---------------------------------------------------------------------------

  private _parseComponents(): void {
    const entities = this.data.entities;
    const allComponents = this.data.components;
    const entityInstances = this.context.entityInstances;
    const pendingComponents = this.context.pendingComponents;
    const refs = this.data.refs;
    const prefabOverrides: Array<{ rootEntity: Entity; overrides: InstanceOverrides }> = [];
    const changesByEntity = new Map<Entity, { removed?: Component[]; added?: ComponentSchema[] }>();
    const getChanges = (entity: Entity) => {
      let entry = changesByEntity.get(entity);
      if (!entry) {
        entry = {};
        changesByEntity.set(entity, entry);
      }
      return entry;
    };

    // Resolve entity property paths before appending children. Capture removal targets before removals shift indices.
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

      const addedEntities = overrides.addedEntities;
      if (addedEntities) {
        // A later addition can target a child appended earlier in this list.
        for (let j = 0, m = addedEntities.length; j < m; j++) {
          const added = addedEntities[j];
          const parent = HierarchyParser._resolveEntity(rootEntity, added.parent);
          const child = entityInstances[added.entity];
          if (!parent.destroyed && !child.destroyed) {
            parent.addChild(child);
          }
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
          const removedList = (getChanges(entity).removed ||= []);
          const selectors = override.selectors;
          for (let k = 0, p = selectors.length; k < p; k++) {
            removedList.push(HierarchyParser._resolveComponent(entity, selectors[k], snapshot));
          }
        }
      }
    }

    // A regular entity's own additions precede its prefab instance additions in selector order.
    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;
      const componentIndices = entityConfig.components;
      if (!componentIndices?.length) continue;

      const addedList = (getChanges(entityInstances[i]).added ||= []);
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
        (getChanges(target).added ||= []).push(allComponents[added.component]);
      }
    }

    changesByEntity.forEach(({ removed, added }, entity) => {
      this._applyEntityComponentChanges(
        entity,
        removed ?? HierarchyParser._emptyComponents,
        added ?? HierarchyParser._emptyComponents,
        refs,
        pendingComponents
      );
    });

    // Component property overrides can target additions. Use selector order even when construction changed live indices.
    const snapshots = this.context.componentSnapshots;
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
  // Stage 4: Remove entities and apply base mutations before instance overrides
  // ---------------------------------------------------------------------------

  private _parseComponentsPropsAndOverrides(): Promise<unknown> {
    const removedEntities = this._overrideRemovedEntities;
    const entityProps = this._overrideEntityProps;
    const componentProps = this._overrideComponentProps;
    const reflectionParser = this._reflectionParser;

    // Keep sibling indices stable for $entity references after these children are destroyed.
    if (removedEntities.length > 0) {
      const childSnapshots = (this.context.childSnapshots ||= new Map());
      for (let i = 0, n = removedEntities.length; i < n; i++) {
        const parent = removedEntities[i].parent;
        if (parent && !childSnapshots.has(parent)) {
          childSnapshots.set(parent, parent.children.slice());
        }
      }
      for (let i = 0, n = removedEntities.length; i < n; i++) {
        removedEntities[i].destroy();
      }
      removedEntities.length = 0;
    }

    const { pendingComponents } = this.context;
    let basePromises: Promise<unknown>[] | undefined;
    for (let i = 0, n = pendingComponents.length; i < n; i++) {
      const { instance, config } = pendingComponents[i];
      if (!instance.destroyed && (config.props || config.calls?.length)) {
        (basePromises ||= []).push(reflectionParser.parseMutationBlock(instance, config));
      }
    }

    if (entityProps.length === 0 && componentProps.length === 0) {
      return basePromises ? Promise.all(basePromises) : Promise.resolve();
    }
    const applyOverrides = (): Promise<unknown> => {
      // Apply entity overrides after base calls so instance values take precedence.
      for (let i = 0, n = entityProps.length; i < n; i++) {
        const { entity, override } = entityProps[i];
        if (!entity.destroyed) HierarchyParser._applyEntityProps(entity, override);
      }
      entityProps.length = 0;

      let chains: Map<Component, Promise<unknown>> | undefined;
      for (let i = 0, n = componentProps.length; i < n; i++) {
        const { target, block } = componentProps[i];
        if (target.destroyed || (!block.props && !block.calls?.length)) continue;
        const prev = (chains ||= new Map()).get(target);
        const next = prev
          ? prev.then(() => reflectionParser.parseMutationBlock(target, block))
          : reflectionParser.parseMutationBlock(target, block);
        chains.set(target, next);
      }
      componentProps.length = 0;
      return chains ? Promise.all(chains.values()) : Promise.resolve();
    };

    return basePromises ? Promise.all(basePromises).then(applyOverrides) : applyOverrides();
  }

  // ---------------------------------------------------------------------------
  // Prefab instance loading
  // ---------------------------------------------------------------------------

  private _loadPrefabInstance(entityConfig: PrefabInstanceEntitySchema, index: number): Promise<void> {
    const instance = entityConfig.instance;
    let refItem: RefItem;
    try {
      refItem = resolveRefItem(this.data.refs, instance.asset, "HierarchyParser", "instance.asset");
    } catch (error) {
      return Promise.reject(error);
    }

    const context = this.context;
    const owner = context.resource;
    return context.resourceManager.getResourceByRef<PrefabResource | GLTFResource>(refItem).then((source) => {
      if (owner.destroyed || owner.pendingDestroy) {
        throw new Error("Cannot load an instance into a scene or prefab being destroyed.");
      }
      if (!source) throw new Error(`HierarchyParser: instance asset "${refItem.url}" was not found.`);
      if (owner instanceof PrefabResource) {
        context.entityInstances[index] = owner._instantiateTemplate(source);
      } else {
        context.entityInstances[index] =
          source instanceof PrefabResource ? source.instantiate() : source.instantiateSceneRoot();
      }
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

  private static _resolveComponent(entity: Entity, selector: ComponentSelector, snapshot?: Component[]): Component {
    const type = Loader.getClass(selector.type);
    if (!type) throw new Error(`HierarchyParser: override target component type "${selector.type}" is not registered`);
    const result = ParserContext._findComponent(snapshot ?? entity._components, type, selector.index);
    if (!result)
      throw new Error(`HierarchyParser: override target component not found: ${selector.type}/${selector.index}`);
    return result;
  }

  private _applyEntityComponentChanges(
    entity: Entity,
    removed: readonly Component[],
    configs: readonly ComponentSchema[],
    refs: RefItem[],
    pendingComponents: { instance: Component; config: ComponentSchema }[]
  ): void {
    const n = configs.length;
    if (n === 0) {
      entity._applyComponentChanges(removed, HierarchyParser._emptyComponents);
      return;
    }

    const classes = new Array<ComponentConstructor>(n);
    for (let i = 0, len = n; i < len; i++) {
      const config = configs[i];
      const key =
        config.script != null
          ? resolveRefItem(refs, config.script, "HierarchyParser", "component.script").url
          : config.type;
      const Class = Loader.getClass(key);
      if (!Class) throw new Error(`Loader.getClass: class "${key}" is not registered`);
      classes[i] = Class;
    }
    const componentSnapshot = this.context.componentSnapshots?.get(entity);
    const pendingStart = pendingComponents.length;
    // Keep explicit additions in declaration order for selectors, even if dependencies construct them out of order.
    let authored = componentSnapshot && n > 1 ? new Array<Component>(n) : undefined;
    entity._applyComponentChanges(removed, classes, (i, instance) => {
      const addedCount = pendingComponents.length - pendingStart;
      if (!authored && i !== addedCount) {
        authored = new Array<Component>(n);
        for (let j = 0; j < addedCount; j++) {
          authored[j] = pendingComponents[pendingStart + j].instance;
        }
      }
      if (authored) authored[i] = instance;
      pendingComponents.push({ instance, config: configs[i] });
    });
    if (!authored && !componentSnapshot) return;

    // Keep the single Transform slot pointing at the replacement, including one supplied by AutoAdd.
    if (componentSnapshot) componentSnapshot[0] = entity.transform;
    const template = componentSnapshot && new Set(componentSnapshot);
    const explicit = authored && new Set(authored);
    const components = entity._components;
    let reordered: Component[] | undefined;
    // Keep removed template slots reserved. Order explicit additions without shifting implicit providers.
    for (let i = 1, next = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (template?.has(component)) continue;
      let ordered = component;
      if (explicit?.has(component)) {
        while (authored![next] instanceof Transform) next++;
        ordered = authored![next++];
      }
      if (componentSnapshot) {
        componentSnapshot.push(ordered);
      } else if (component !== ordered) {
        (reordered ||= components.slice())[i] = ordered;
      }
    }
    if (reordered) (this.context.componentSnapshots ||= new Map()).set(entity, reordered);
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
