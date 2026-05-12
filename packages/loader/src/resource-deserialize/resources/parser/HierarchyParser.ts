import { Component, Engine, Entity, Loader, Scene } from "@galacean/engine-core";
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

  /** Root entity indices for this hierarchy (scene.roots or [prefab.root]). */
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
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;

      const entity = entityInstances[i];
      const componentIndices = entityConfig.components;
      if (!componentIndices) continue;

      for (let j = 0, m = componentIndices.length; j < m; j++) {
        const config = allComponents[componentIndices[j]];
        const instance = HierarchyParser._addComponentFromConfig(entity, config, refs);
        pendingComponents.push({ instance, config });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Apply props and execute calls on components
  // ---------------------------------------------------------------------------

  private _parseComponentsPropsAndCalls(): Promise<unknown> {
    const { pendingComponents } = this.context;
    const reflectionParser = this._reflectionParser;
    const promises: Promise<unknown>[] = [];

    for (let i = 0, n = pendingComponents.length; i < n; i++) {
      const { instance, config } = pendingComponents[i];
      promises.push(reflectionParser.parseMutationBlock(instance, config));
    }

    return Promise.all(promises);
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
    const refs = this.data.refs;
    const reflectionParser = this._reflectionParser;

    // entityProps — entity-level property overrides
    if (overrides.entityProps) {
      for (let j = 0, m = overrides.entityProps.length; j < m; j++) {
        const override = overrides.entityProps[j] as EntityPropOverride;
        HierarchyParser._applyEntityProps(HierarchyParser._resolveEntity(rootEntity, override.path), override);
      }
    }

    // componentProps — component-level property overrides
    if (overrides.componentProps) {
      for (let j = 0, m = overrides.componentProps.length; j < m; j++) {
        const override = overrides.componentProps[j] as ComponentOverride;
        const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
        const target = HierarchyParser._resolveComponent(entity, override.selector);
        promises.push(reflectionParser.parseMutationBlock(target, override));
      }
    }

    // addedComponents — attach top-level components[index] to a prefab entity and parse props
    if (overrides.addedComponents) {
      const allComponents = this.data.components;
      for (let j = 0, m = overrides.addedComponents.length; j < m; j++) {
        const added = overrides.addedComponents[j];
        const entity = HierarchyParser._resolveEntity(rootEntity, added.target);
        const config = allComponents[added.component];
        const component = HierarchyParser._addComponentFromConfig(entity, config, refs);
        promises.push(reflectionParser.parseMutationBlock(component, config));
      }
    }

    // addedEntities — attach already-created top-level entityInstances[index] as a child
    if (overrides.addedEntities) {
      const entityInstances = this.context.entityInstances;
      for (let j = 0, m = overrides.addedEntities.length; j < m; j++) {
        const added = overrides.addedEntities[j];
        const parent = HierarchyParser._resolveEntity(rootEntity, added.parent);
        parent.addChild(entityInstances[added.entity]);
      }
    }

    // removedEntities — pre-resolve all targets then destroy (destroy shifts sibling indices)
    if (overrides.removedEntities) {
      const removed = overrides.removedEntities;
      const targets = new Array<Entity>(removed.length);
      for (let j = 0, m = removed.length; j < m; j++) {
        targets[j] = HierarchyParser._resolveEntity(rootEntity, removed[j]);
      }
      for (let j = 0, m = targets.length; j < m; j++) {
        targets[j].destroy();
      }
    }

    // removedComponents — pre-resolve all targets then destroy (destroy shifts component indices)
    if (overrides.removedComponents) {
      const targets: Component[] = [];
      for (let j = 0, m = overrides.removedComponents.length; j < m; j++) {
        const override = overrides.removedComponents[j];
        const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
        const selectors = override.selectors;
        for (let k = 0, p = selectors.length; k < p; k++) {
          targets.push(HierarchyParser._resolveComponent(entity, selectors[k]));
        }
      }
      for (let j = 0, m = targets.length; j < m; j++) {
        targets[j].destroy();
      }
    }
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

    return (
      engine.resourceManager
        // @ts-ignore
        .getResourceByRef<Entity>(refItem)
        .then((prefabResource: PrefabResource | GLTFResource) => {
          const entity =
            prefabResource instanceof PrefabResource
              ? prefabResource.instantiate()
              : prefabResource.instantiateSceneRoot();
          this._onEntityCreated(entity);
          return entity;
        })
    );
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

  /** Resolve component class from config and add to entity. Throws if class is not registered. */
  private static _addComponentFromConfig(entity: Entity, config: ComponentSchema, refs: RefItem[]): Component {
    const key =
      config.script != null
        ? resolveRefItem(refs, config.script, "HierarchyParser", "component.script").url
        : config.type;
    const Class = Loader.getClass(key);
    if (!Class) throw new Error(`Loader.getClass: class "${key}" is not registered`);
    return entity.addComponent(Class);
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
