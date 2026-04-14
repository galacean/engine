import { Component, Engine, Entity, Loader, Scene } from "@galacean/engine-core";
import { GLTFResource } from "../../../gltf";
import { PrefabResource } from "../../../prefab/PrefabResource";
import { resolveRefItem } from "../../../scene-format/refs";
import {
  type ComponentSchema,
  type ComponentSelector,
  type ComponentOverride,
  type EntityPropOverride,
  type EntityOverrideProps,
  type EntitySchema,
  type HierarchyFile,
  type InlineEntitySchema,
  type NormalEntitySchema,
  type PrefabInstanceEntitySchema,
  type RefItem
} from "../../../scene-format/types";
import { ParserContext, ParserType } from "./ParserContext";
import { ReflectionParser } from "./ReflectionParser";

/** @Internal */
export abstract class HierarchyParser<T extends Scene | PrefabResource, V extends ParserContext> {
  private static _componentBuffer: Component[] = [];

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

  /** Root entity indices for this hierarchy (scene.entities or [prefab.root]). */
  protected abstract _getRootIndices(): number[];
  protected abstract _handleRootEntity(index: number): void;
  protected abstract _clearAndResolve(): Scene | PrefabResource;

  protected _applyEntityData(entity: Entity, entityConfig: NormalEntitySchema): Entity {
    HierarchyParser._applyEntityProps(entity, entityConfig);
    return entity;
  }

  protected _onEntityCreated(_entity: Entity): void {}

  // ---------------------------------------------------------------------------
  // Stage 1: Create entity instances
  // ---------------------------------------------------------------------------

  private _parseEntities(): Promise<void> {
    const entities = this.data.entities;
    const entityMap = this.context.entityMap;
    const engine = this._engine;
    const promises: Promise<void>[] = [];

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];

      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) {
        promises.push(
          this._loadPrefabInstance(entityConfig, engine).then((entity) => {
            entityMap.set(i, entity);
          })
        );
      } else {
        const entity = new Entity(engine, entityConfig.name);
        this._applyEntityData(entity, entityConfig);
        this._onEntityCreated(entity);
        entityMap.set(i, entity);
      }
    }

    return Promise.all(promises) as any;
  }

  // ---------------------------------------------------------------------------
  // Stage 2: Build parent-child hierarchy
  // ---------------------------------------------------------------------------

  private _organizeEntities(): void {
    const entities = this.data.entities;
    const entityMap = this.context.entityMap;

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      // Prefab instance entities manage their own children.
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;

      const children = entityConfig.children;
      if (!children) continue;

      const parent = entityMap.get(i);
      for (let j = 0, m = children.length; j < m; j++) {
        parent.addChild(entityMap.get(children[j]));
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
    const entityMap = this.context.entityMap;
    const componentPairs = this.context.componentPairs;

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      if (HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;

      const entity = entityMap.get(i);
      const componentIndices = entityConfig.components;
      if (!componentIndices) continue;

      for (let j = 0, m = componentIndices.length; j < m; j++) {
        const config = allComponents[componentIndices[j]];
        const component = HierarchyParser._addComponentFromConfig(entity, config, this.data.refs);
        componentPairs.push({ component, config });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Apply props and execute calls on components
  // ---------------------------------------------------------------------------

  private _parseComponentsPropsAndCalls(): Promise<void> {
    const { componentPairs } = this.context;
    const reflectionParser = this._reflectionParser;
    const promises: Promise<any>[] = [];

    for (let i = 0, n = componentPairs.length; i < n; i++) {
      const { component, config } = componentPairs[i];
      promises.push(reflectionParser.parseProps(component, config.props));
      if (config.calls) {
        promises.push(reflectionParser.parseCalls(component, config.calls));
      }
    }

    return Promise.all(promises) as any;
  }

  // ---------------------------------------------------------------------------
  // Stage 5: Apply prefab instance overrides
  // ---------------------------------------------------------------------------

  private _parsePrefabOverrides(): Promise<void> {
    const entities = this.data.entities;
    const entityMap = this.context.entityMap;
    const promises: Promise<any>[] = [];

    for (let i = 0, n = entities.length; i < n; i++) {
      const entityConfig = entities[i];
      if (!HierarchyParser._isPrefabInstanceEntity(entityConfig)) continue;

      const instance = entityConfig.instance;
      if (!instance.overrides) continue;

      const rootEntity = entityMap.get(i);
      const overrides = instance.overrides;

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
          promises.push(this._reflectionParser.parseMutationBlock(target, override));
        }
      }

      // addedComponents — new components on existing prefab entities
      if (overrides.addedComponents) {
        for (let j = 0, m = overrides.addedComponents.length; j < m; j++) {
          const added = overrides.addedComponents[j];
          const entity = HierarchyParser._resolveEntity(rootEntity, added.target);
          const component = HierarchyParser._addComponentFromConfig(entity, added.component, this.data.refs);
          promises.push(this._reflectionParser.parseMutationBlock(component, added.component));
        }
      }

      // addedEntities — new child entities in prefab tree
      if (overrides.addedEntities) {
        for (let j = 0, m = overrides.addedEntities.length; j < m; j++) {
          const added = overrides.addedEntities[j];
          this._createInlineEntity(added.entity, HierarchyParser._resolveEntity(rootEntity, added.parent), promises);
        }
      }

      // removedEntities — destroy entities from prefab tree
      if (overrides.removedEntities) {
        for (let j = 0, m = overrides.removedEntities.length; j < m; j++) {
          HierarchyParser._resolveEntity(rootEntity, overrides.removedEntities[j]).destroy();
        }
      }

      // removedComponents — destroy components from prefab entities
      if (overrides.removedComponents) {
        for (let j = 0, m = overrides.removedComponents.length; j < m; j++) {
          const override = overrides.removedComponents[j];
          const entity = HierarchyParser._resolveEntity(rootEntity, override.path);
          const selectors = override.selectors;
          for (let k = 0, p = selectors.length; k < p; k++) {
            HierarchyParser._resolveComponent(entity, selectors[k]).destroy();
          }
        }
      }
    }

    return Promise.all(promises) as any;
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
        .getResourceByRef<Entity>({ $ref: refItem.url, key: refItem.key })
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
  // Inline entity creation (for addedEntities overrides)
  // ---------------------------------------------------------------------------

  private _createInlineEntity(config: InlineEntitySchema, parent: Entity, promises: Promise<any>[]): void {
    const entity = new Entity(this._engine, config.name);
    HierarchyParser._applyEntityProps(entity, config);
    this._onEntityCreated(entity);
    parent.addChild(entity);

    if (config.components) {
      for (let i = 0, n = config.components.length; i < n; i++) {
        const compConfig = config.components[i];
        const component = HierarchyParser._addComponentFromConfig(entity, compConfig, this.data.refs);
        promises.push(this._reflectionParser.parseMutationBlock(component, compConfig));
      }
    }

    if (config.children) {
      for (let i = 0, n = config.children.length; i < n; i++) {
        this._createInlineEntity(config.children[i], entity, promises);
      }
    }
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
    const buffer = HierarchyParser._componentBuffer;
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
    const key = config.script
      ? resolveRefItem(refs, config.script.$ref, "HierarchyParser", "component.script").url
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
