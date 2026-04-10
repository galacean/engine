import { Component, Engine, Entity, Loader, Scene } from "@galacean/engine-core";
import { GLTFResource } from "../../../gltf";
import { PrefabResource } from "../../../prefab/PrefabResource";
import {
  assetRefToEngine,
  type GalaceanEntityOverrideProps,
  type GalaceanEntitySchema,
  type GalaceanInlineEntitySchema,
  type IHierarchyFile
} from "../../../scene-format/types";
import { ParserContext, type PrefabInstanceContext } from "./ParserContext";
import { ReflectionParser } from "./ReflectionParser";

/** @Internal */
export abstract class HierarchyParser<T extends Scene | PrefabResource, V extends ParserContext<IHierarchyFile>> {
  readonly promise: Promise<T>;

  protected _resolve: (item: T) => void;
  protected _reject: (reason: any) => void;
  protected _engine: Engine;
  protected _reflectionParser: ReflectionParser;

  private _prefabContextMap = new WeakMap<Entity, PrefabInstanceContext>();

  constructor(
    public readonly data: IHierarchyFile,
    public readonly context: V
  ) {
    this._engine = this.context.engine;
    this._organizeEntities = this._organizeEntities.bind(this);
    this._parseComponents = this._parseComponents.bind(this);
    this._parseComponentsProps = this._parseComponentsProps.bind(this);
    this._parsePrefabOverrides = this._parsePrefabOverrides.bind(this);
    this._clearAndResolve = this._clearAndResolve.bind(this);
    this.promise = new Promise<T>((resolve, reject) => {
      this._reject = reject;
      this._resolve = resolve;
    });
    this._reflectionParser = new ReflectionParser(context);
  }

  public start() {
    this._parseEntities()
      .then(this._organizeEntities)
      .then(this._parseComponents)
      .then(this._parseComponentsProps)
      .then(this._parsePrefabOverrides)
      .then(this._clearAndResolve)
      .then(this._resolve)
      .catch(this._reject);
  }

  /** Root entity indices for this hierarchy (scene.entities or [prefab.root]). */
  protected abstract _getRootIndices(): number[];
  protected abstract _handleRootEntity(index: number): void;
  protected abstract _clearAndResolve(): Scene | PrefabResource;

  protected _applyEntityData(entity: Entity, entityConfig: GalaceanEntitySchema): Entity {
    HierarchyParser._applyEntityProps(entity, entityConfig);
    return entity;
  }

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

      if (entityConfig.instance) {
        promises.push(
          this._loadPrefabInstance(entityConfig, engine).then((entity) => {
            entityMap.set(i, entity);
          })
        );
      } else {
        const entity = new Entity(engine, entityConfig.name);
        this._applyEntityData(entity, entityConfig);
        entityMap.set(i, entity);
      }
    }

    return Promise.all(promises).then(() => {});
  }

  // ---------------------------------------------------------------------------
  // Stage 2: Build parent-child hierarchy
  // ---------------------------------------------------------------------------

  private _organizeEntities(): void {
    const entities = this.data.entities;
    const entityMap = this.context.entityMap;

    for (let i = 0, n = entities.length; i < n; i++) {
      const children = entities[i].children;
      if (!children) continue;
      // Prefab instance entities manage their own children
      if (entities[i].instance) continue;

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
      if (entityConfig.instance) continue;

      const entity = entityMap.get(i);
      const componentIndices = entityConfig.components;
      if (!componentIndices) continue;

      for (let j = 0, m = componentIndices.length; j < m; j++) {
        const config = allComponents[componentIndices[j]];
        const key = config.script ? config.script.$ref : config.type;
        const component = entity.addComponent(Loader.getClass(key));
        componentPairs.push({ component, config });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stage 4: Apply props to components
  // ---------------------------------------------------------------------------

  private _parseComponentsProps(): Promise<void> {
    const { componentPairs } = this.context;
    const reflectionParser = this._reflectionParser;
    const promises: Promise<any>[] = [];

    for (let i = 0, n = componentPairs.length; i < n; i++) {
      const { component, config } = componentPairs[i];
      if (config.props) {
        promises.push(reflectionParser.parseProps(component, config.props));
      }
    }

    return Promise.all(promises).then(() => {});
  }

  // ---------------------------------------------------------------------------
  // Stage 5: Apply prefab instance overrides
  // ---------------------------------------------------------------------------

  private _parsePrefabOverrides(): Promise<void> {
    const entities = this.data.entities;
    const entityMap = this.context.entityMap;
    const promises: Promise<any>[] = [];

    for (let i = 0, n = entities.length; i < n; i++) {
      const instance = entities[i].instance;
      if (!instance?.overrides) continue;

      const rootEntity = entityMap.get(i);
      const ctx = this._prefabContextMap.get(rootEntity);
      if (!ctx) continue;

      const overrides = instance.overrides;

      // entityProps — entity-level property overrides
      if (overrides.entityProps) {
        for (const key in overrides.entityProps) {
          const path = HierarchyParser._overrideKeyToPath(key);
          const target = ctx.entityMap.get(path);
          if (target) {
            HierarchyParser._applyEntityProps(target, overrides.entityProps[key]);
          }
        }
      }

      // componentProps — component-level property overrides
      if (overrides.componentProps) {
        for (const key in overrides.componentProps) {
          const path = HierarchyParser._overrideKeyToPath(key);
          const componentMap = overrides.componentProps[key];
          for (const selector in componentMap) {
            const componentKey = path ? `${path}:${selector}` : `:${selector}`;
            const target = ctx.components.get(componentKey);
            if (target) {
              promises.push(this._reflectionParser.parseProps(target, componentMap[selector]));
            }
          }
        }
      }

      // addedComponents — new components on existing prefab entities
      if (overrides.addedComponents) {
        for (let j = 0, m = overrides.addedComponents.length; j < m; j++) {
          const added = overrides.addedComponents[j];
          const path = added.target.join("/");
          const target = ctx.entityMap.get(path);
          if (target) {
            const compConfig = added.component;
            const compKey = compConfig.script ? compConfig.script.$ref : compConfig.type;
            const component = target.addComponent(Loader.getClass(compKey));
            if (compConfig.props) {
              promises.push(this._reflectionParser.parseProps(component, compConfig.props));
            }
          }
        }
      }

      // addedEntities — new child entities in prefab tree
      if (overrides.addedEntities) {
        for (let j = 0, m = overrides.addedEntities.length; j < m; j++) {
          const added = overrides.addedEntities[j];
          const path = added.parent.join("/");
          const parent = ctx.entityMap.get(path);
          if (parent) {
            this._createInlineEntity(added.entity, parent, promises);
          }
        }
      }

      // removedEntities — destroy entities from prefab tree
      if (overrides.removedEntities) {
        for (let j = 0, m = overrides.removedEntities.length; j < m; j++) {
          const path = overrides.removedEntities[j].join("/");
          const target = ctx.entityMap.get(path);
          if (target) target.destroy();
        }
      }

      // removedComponents — destroy components from prefab entities
      if (overrides.removedComponents) {
        for (const key in overrides.removedComponents) {
          const path = HierarchyParser._overrideKeyToPath(key);
          const selectors = overrides.removedComponents[key];
          for (let j = 0, m = selectors.length; j < m; j++) {
            const componentKey = path ? `${path}:${selectors[j]}` : `:${selectors[j]}`;
            const target = ctx.components.get(componentKey);
            if (target) target.destroy();
          }
        }
      }
    }

    return Promise.all(promises).then(() => {});
  }

  // ---------------------------------------------------------------------------
  // Prefab instance loading
  // ---------------------------------------------------------------------------

  private _loadPrefabInstance(entityConfig: GalaceanEntitySchema, engine: Engine): Promise<Entity> {
    const instance = entityConfig.instance;

    return (
      engine.resourceManager
        // @ts-ignore
        .getResourceByRef<Entity>(assetRefToEngine(instance.asset))
        .then((prefabResource: PrefabResource | GLTFResource) => {
          const entity =
            prefabResource instanceof PrefabResource
              ? prefabResource.instantiate()
              : prefabResource.instantiateSceneRoot();

          this._applyEntityData(entity, entityConfig);

          const instanceContext = HierarchyParser._buildInstanceContext(entity);
          this._prefabContextMap.set(entity, instanceContext);

          return entity;
        })
    );
  }

  private static _buildInstanceContext(entity: Entity): PrefabInstanceContext {
    const ctx: PrefabInstanceContext = {
      entityMap: new Map(),
      components: new Map()
    };
    HierarchyParser._walkPrefabTree(entity, ctx, "");
    return ctx;
  }

  private static _walkPrefabTree(entity: Entity, ctx: PrefabInstanceContext, path: string): void {
    ctx.entityMap.set(path, entity);
    const componentIndexMap: Record<string, number> = {};

    // @ts-ignore
    entity._components.forEach((component: Component) => {
      // @ts-ignore
      const name = Loader.getClassName(component.constructor);
      if (!(name in componentIndexMap)) componentIndexMap[name] = 0;
      ctx.components.set(`${path}:${name}/${componentIndexMap[name]++}`, component);
    });

    for (let i = 0, n = entity.children.length; i < n; i++) {
      const childPath = path ? `${path}/${i}` : `${i}`;
      HierarchyParser._walkPrefabTree(entity.children[i], ctx, childPath);
    }
  }

  // ---------------------------------------------------------------------------
  // Inline entity creation (for addedEntities overrides)
  // ---------------------------------------------------------------------------

  private _createInlineEntity(config: GalaceanInlineEntitySchema, parent: Entity, promises: Promise<any>[]): void {
    const entity = new Entity(this._engine, config.name);
    HierarchyParser._applyEntityProps(entity, config);
    parent.addChild(entity);

    if (config.components) {
      for (let i = 0, n = config.components.length; i < n; i++) {
        const compConfig = config.components[i];
        const key = compConfig.script ? compConfig.script.$ref : compConfig.type;
        const component = entity.addComponent(Loader.getClass(key));
        if (compConfig.props) {
          promises.push(this._reflectionParser.parseProps(component, compConfig.props));
        }
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

  /** Convert override key "[0,1]" → path string "0/1" */
  private static _overrideKeyToPath(key: string): string {
    return key.slice(1, -1).replace(/,/g, "/");
  }

  /** Apply entity-level props (name, isActive, layer, transform) to an entity. */
  private static _applyEntityProps(entity: Entity, props: GalaceanEntityOverrideProps): void {
    if (props.name != null) entity.name = props.name;
    if (props.isActive != null) entity.isActive = props.isActive;
    if (props.layer != null) entity.layer = props.layer;
    if (props.position) entity.transform.position.set(props.position[0], props.position[1], props.position[2]);
    if (props.rotation) entity.transform.rotation.set(props.rotation[0], props.rotation[1], props.rotation[2]);
    if (props.scale) entity.transform.scale.set(props.scale[0], props.scale[1], props.scale[2]);
  }
}
