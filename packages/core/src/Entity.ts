import { Matrix } from "@galacean/engine-math";
import { BoolUpdateFlag } from "./BoolUpdateFlag";
import { Component } from "./Component";
import { ComponentsDependencies } from "./ComponentsDependencies";
import { Engine } from "./Engine";
import { Layer } from "./Layer";
import { Scene } from "./Scene";
import { Script } from "./Script";
import { Transform } from "./Transform";
import { UpdateFlagManager } from "./UpdateFlagManager";
import { ReferResource } from "./asset/ReferResource";
import { EngineObject } from "./base";
import { CloneMode, registerDefaultCloneMode } from "./clone/CloneDecorators";
import { ComponentCloner } from "./clone/ComponentCloner";
import { ActiveChangeFlag } from "./enums/ActiveChangeFlag";
import { EntityModifyFlags } from "./enums/EntityModifyFlags";
import { DisorderedArray } from "./utils/DisorderedArray";

/**
 * Entity, be used as components container.
 */
export class Entity extends EngineObject {
  private static _isTransformType(type: ComponentConstructor): boolean {
    return type === Transform || type.prototype instanceof Transform;
  }

  private static _checkTransformDependencies(type: ComponentConstructor): void {
    if (ComponentsDependencies._hasDependencies(type)) {
      throw `Transform-compatible component ${type.name} cannot declare component dependencies`;
    }
  }

  /**
   * @internal
   */
  static _findChildByName(entity: Entity, childIndex: number, paths: string[], pathIndex: number): Entity | null {
    const searchPath = paths[pathIndex];
    const isEndPath = pathIndex === paths.length - 1;
    const children = entity._children;
    for (const n = children.length; childIndex < n; childIndex++) {
      const child = children[childIndex];
      if (child.name === searchPath) {
        // Search success if end path, or downward search
        return isEndPath ? child : Entity._findChildByName(child, 0, paths, pathIndex + 1);
      }
    }

    // Search failed if first path, or upward search
    return pathIndex === 0
      ? null
      : Entity._findChildByName(entity.parent!, entity.siblingIndex + 1, paths, pathIndex - 1);
  }

  /**
   * @internal
   */
  static _traverseSetOwnerScene(entity: Entity, scene: Scene | null | undefined): void {
    Entity._assignOwnerScene(entity, scene);
    if (scene) {
      Entity._notifySceneChanged(entity, scene);
    }
  }

  private static _assignOwnerScene(entity: Entity, scene: Scene | null | undefined): void {
    entity._scene = scene;
    const children = entity._children;
    for (let i = children.length - 1; i >= 0; i--) {
      Entity._assignOwnerScene(children[i], scene);
    }
  }

  /**
   * @internal
   */
  static _notifySceneChanged(entity: Entity, scene: Scene): void {
    const components = entity._components;
    for (let i = components.length - 1; i >= 0; i--) {
      components[i]._onSceneChanged(scene);
    }
    const children = entity._children;
    for (let i = children.length - 1; i >= 0; i--) {
      Entity._notifySceneChanged(children[i], scene);
    }
  }

  /**
   * @internal
   */
  static _removeFromChildren(children: Entity[], entity: Entity): void {
    const count = children.length - 1;
    for (let i = entity._siblingIndex; i < count; i++) {
      const child = children[i + 1];
      children[i] = child;
      child._siblingIndex = i;
    }
    children.length = count;
    entity._siblingIndex = -1;
  }

  /**
   * @internal
   */
  static _addToChildren(children: Entity[], entity: Entity, index?: number): void {
    const childCount = children.length;
    if (index === undefined) {
      children[childCount] = entity;
      entity._siblingIndex = childCount;
    } else {
      if (index < 0 || index > childCount) {
        throw `The index ${index} is out of child list bounds ${childCount}`;
      }
      children.length = childCount + 1;
      for (let i = childCount; i > index; i--) {
        const swapChild = children[i - 1];
        swapChild._siblingIndex = i;
        children[i] = swapChild;
      }
      entity._siblingIndex = index;
      children[index] = entity;
    }
  }

  /** The name of entity. */
  name: string;
  /** The layer the entity belongs to. */
  layer: Layer = Layer.Layer0;

  /** @internal */
  _isActiveInHierarchy: boolean = false;
  /** @internal */
  _isActiveInScene: boolean = false;
  /** @internal */
  _components: Component[] = [];
  /** @internal */
  _scripts: DisorderedArray<Script> = new DisorderedArray<Script>();
  /** @internal */
  _scriptsVersion = 0;
  /** @internal */
  _children: Entity[] = [];
  /** @internal */
  _scene: Scene | null | undefined;
  /** @internal */
  _isRoot: boolean = false;
  /** @internal */
  _isActive: boolean = true;
  /** @internal */
  _siblingIndex: number = -1;
  /** @internal */
  _isTemplate: boolean = false;
  /** @internal */
  _updateFlagManager: UpdateFlagManager = new UpdateFlagManager();

  private _transform: Transform;
  private _templateResource: ReferResource;
  private _parent: Entity | null = null;
  private _activeChangedComponents: Component[] | null | undefined;
  private _modifyFlagManager: UpdateFlagManager;

  /**
   * The transform of this entity.
   */
  get transform(): Transform {
    return this._transform;
  }

  /**
   * Whether to activate locally.
   */
  get isActive(): boolean {
    return this._isActive;
  }

  set isActive(value: boolean) {
    if (value !== this._isActive) {
      this._isActive = value;
      if (value) {
        const parent = this._parent;

        let activeChangeFlag = ActiveChangeFlag.None;
        if (this._isRoot && this._scene!._isActiveInEngine) {
          activeChangeFlag |= ActiveChangeFlag.All;
        } else {
          parent?._isActiveInHierarchy && (activeChangeFlag |= ActiveChangeFlag.Hierarchy);
          parent?._isActiveInScene && (activeChangeFlag |= ActiveChangeFlag.Scene);
        }

        activeChangeFlag && this._processActive(activeChangeFlag);
      } else {
        let activeChangeFlag = ActiveChangeFlag.None;
        this._isActiveInHierarchy && (activeChangeFlag |= ActiveChangeFlag.Hierarchy);
        this._isActiveInScene && (activeChangeFlag |= ActiveChangeFlag.Scene);

        activeChangeFlag && this._processInActive(activeChangeFlag);
      }
    }
  }

  /**
   * Whether it is active in the hierarchy.
   */
  get isActiveInHierarchy(): boolean {
    return this._isActiveInHierarchy;
  }

  /**
   * The parent entity, or null if this entity has no parent.
   */
  get parent(): Entity | null {
    return this._parent;
  }

  set parent(value: Entity | null) {
    this._setParent(value);
  }

  /**
   * The children entities
   */
  get children(): Readonly<Entity[]> {
    return this._children;
  }

  /**
   * @deprecated Please use `children.length` property instead.
   * Number of the children entities
   */
  get childCount(): number {
    return this._children.length;
  }

  /**
   * The owning scene, or null/undefined if this entity is not in a scene.
   */
  get scene(): Scene | null | undefined {
    return this._scene;
  }

  /**
   * The sibling index.
   */
  get siblingIndex(): number {
    return this._siblingIndex;
  }

  set siblingIndex(value: number) {
    if (this._siblingIndex === -1) {
      throw `The entity ${this.name} is not in the hierarchy`;
    }

    if (this._isRoot) {
      this._setSiblingIndex(this._scene!._rootEntities, value);
    } else {
      const parent = this._parent!;
      this._setSiblingIndex(parent._children, value);
      parent._dispatchModify(EntityModifyFlags.Child, parent);
    }
  }

  /**
   * Create a entity.
   * @param engine - The engine the entity belongs to
   * @param name - The name of the entity
   * @param components - The types of components you wish to add
   */
  constructor(engine: Engine, name?: string, ...components: ComponentConstructor[]) {
    super(engine);
    this.name = name ?? "Entity";
    let transformType: ComponentConstructor = Transform;
    const n = components.length;
    for (let i = n - 1; i >= 0; i--) {
      const componentType = components[i];
      if (Entity._isTransformType(componentType)) {
        transformType = componentType;
        break;
      }
    }

    Entity._checkTransformDependencies(transformType);
    const transform = <Transform>new transformType(this);
    // Constructors may add components, but Transform always owns slot zero
    this._components.unshift(transform);
    this._transform = transform;
    transform._setActive(true, ActiveChangeFlag.All);

    if (n > 0) {
      ComponentsDependencies._forEachInAddOrder(this, components, (i) => {
        const componentType = components[i];
        if (!Entity._isTransformType(componentType)) {
          this.addComponent(componentType);
        }
      });
    }
    this._inverseWorldMatFlag = this.registerWorldChangeFlag();
  }

  /**
   * Add component based on the component type.
   * @param type - The type of the component
   * @param args - The arguments of the component
   * @returns	The component which has been added
   */
  addComponent<T extends ComponentConstructor>(type: T, ...args: ComponentArguments<T>): InstanceType<T> {
    const isTransform = Entity._isTransformType(type);
    if (isTransform) {
      Entity._checkTransformDependencies(type);
      ComponentsDependencies._removeCheck(this, this._transform.constructor as ComponentConstructor, type);
    } else {
      ComponentsDependencies._addCheck(this, type);
    }

    const component = new type(this, ...args) as InstanceType<T>;
    if (isTransform) {
      this._replaceTransform(<Transform>component);
    } else {
      this._components.push(component);
    }
    component._setActive(true, ActiveChangeFlag.All);
    return component;
  }

  /**
   * Get component which match the type.
   * @param type - The type of the component
   * @returns	The first component which match type
   */
  getComponent<T extends Component>(type: ComponentConstructor<T>): T | null {
    const components = this._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (component instanceof type) {
        return component;
      }
    }
    return null;
  }

  /**
   * Get components which match the type.
   * @param type - The type of the component
   * @param results - The components which match type
   * @returns	The components which match type
   */
  getComponents<T extends Component>(type: ComponentConstructor<T>, results: T[]): T[] {
    results.length = 0;
    const components = this._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (component instanceof type) {
        results.push(component);
      }
    }
    return results;
  }

  /**
   * Get the components which match the type of the entity and it's children.
   * @remarks The components are returned in depth-first pre-order: the entity itself first, then each child's subtree in sibling order.
   * @param type - The component type
   * @param results - The components collection
   * @returns The components collection which match the type
   */
  getComponentsIncludeChildren<T extends Component>(type: ComponentConstructor<T>, results: T[]): T[] {
    results.length = 0;
    this._getComponentsInChildren<T>(type, results);
    return results;
  }

  /**
   * Add child entity.
   * @param child - The child entity which want to be added
   */
  addChild(child: Entity): void;

  /**
   * Add child entity at specified index.
   * @param index - specified index
   * @param child - The child entity which want to be added
   */
  addChild(index: number, child: Entity): void;

  addChild(indexOrChild: number | Entity, child?: Entity): void {
    let index: number | undefined;
    if (typeof indexOrChild === "number") {
      index = indexOrChild;
    } else {
      index = undefined;
      child = indexOrChild;
    }
    child!._setParent(this, index);
  }

  /**
   * Remove child entity.
   * @param child - The child entity which want to be removed
   */
  removeChild(child: Entity): void {
    if (child._parent !== this) return;
    child._setParent(null);
  }

  /**
   * Get a child entity by index.
   * @param index - The zero-based child index
   * @returns The child at the index, or undefined if none exists
   * @deprecated Please use `children` property instead.
   */
  getChild(index: number): Entity | undefined {
    return this._children[index];
  }

  /**
   * Find the first entity with the given name in this entity and its descendants.
   * @param name - The name of the entity to find
   * @returns The first matching entity, or null if none is found
   */
  findByName(name: string): Entity | null {
    if (name === this.name) {
      return this;
    }
    const children = this._children;
    for (let i = 0, n = children.length; i < n; i++) {
      const target = children[i].findByName(name);
      if (target) {
        return target;
      }
    }
    return null;
  }

  /**
   * Find a descendant by its path relative to this entity.
   * @param path - The entity path, with names separated by "/"
   * @returns The matching entity, this entity for an empty path, or null if none is found
   */
  findByPath(path: string): Entity | null {
    const splits = path.split("/").filter(Boolean);
    if (!splits.length) {
      return this;
    }
    return Entity._findChildByName(this, 0, splits, 0);
  }

  /**
   * Create child entity.
   * @param name - The child entity's name
   * @returns The child entity
   */
  createChild(name?: string): Entity {
    const transform = this._transform;
    const child = transform
      ? new Entity(this.engine, name, transform.constructor as ComponentConstructor)
      : new Entity(this.engine, name);
    child.layer = this.layer;
    child.parent = this;
    return child;
  }

  /**
   * Clear children entities.
   */
  clearChildren(): void {
    const children = this._children;
    while (children.length > 0) {
      children[children.length - 1]._setParent(null);
    }
  }

  /**
   * Clone this Entity, including children and components.
   * @returns A detached clone that must be added to a parent Entity or Scene to update and render
   */
  clone(): Entity {
    const cloneMap = new Map<object, object>();
    const cloneEntity = this._createCloneEntity(cloneMap);
    this._parseCloneEntity(this, cloneEntity, cloneMap);
    return cloneEntity;
  }

  /**
   * Listen for changes in the world pose of this `Entity`.
   * @returns Change flag
   */
  registerWorldChangeFlag(): BoolUpdateFlag {
    return this._updateFlagManager.createFlag(BoolUpdateFlag);
  }

  /**
   * @internal
   */
  _addComponents(types: readonly ComponentConstructor[], onAdd?: (index: number, component: Component) => void): void {
    ComponentsDependencies._forEachInAddOrder(this, types, (i) => {
      const component = this.addComponent(types[i]);
      onAdd?.(i, component);
    });
  }

  /**
   * @internal
   * Remove `removed` components (in reverse dependency order) and add `addedTypes` (in dependency order) atomically.
   * When a removed component is replaced by a type in `addedTypes`, surviving scene-active dependents are temporarily
   * deactivated in the scene and re-activated against the replacement.
   */
  _applyComponentChanges(
    removed: readonly Component[],
    addedTypes: readonly ComponentConstructor[],
    onAdd?: (index: number, component: Component) => void
  ): void {
    const replacedEntries: Array<{ dependency: ComponentConstructor; dependents: Component[] }> = [];
    const suspendedDependents: Component[] = [];

    if (removed.length > 0) {
      ComponentsDependencies._forEachInRemoveOrder(removed, (i) => {
        const component = removed[i];
        if (component.destroyed) return;
        if (addedTypes.length > 0) {
          const prevLen = replacedEntries.length;
          const needsReplacement = ComponentsDependencies._removeCheck(
            this,
            component.constructor as ComponentConstructor,
            addedTypes,
            replacedEntries
          );
          if (needsReplacement) {
            for (let j = prevLen, m = replacedEntries.length; j < m; j++) {
              const dependents = replacedEntries[j].dependents;
              for (let k = 0, p = dependents.length; k < p; k++) {
                const dep = dependents[k];
                if (dep._deactivateInScene()) {
                  suspendedDependents.push(dep);
                }
              }
            }
            this._removeComponent(component);
            component.destroy();
            return;
          }
        }
        component.destroy();
      });
    }

    if (addedTypes.length > 0) {
      const addedComponents = replacedEntries.length > 0 ? new Array<Component>(addedTypes.length) : null;
      this._addComponents(addedTypes, (i, component) => {
        if (addedComponents) {
          addedComponents[i] = component;
        }
        onAdd?.(i, component);
      });

      if (addedComponents) {
        const addedSet = new Set<Component>(addedComponents);
        const moveWithDependenciesBefore = (comp: Component, limitIndex: number): void => {
          const components = this._components;
          let type = comp.constructor as ComponentConstructor;
          while (type && type !== Component) {
            const depInfo = ComponentsDependencies._dependenciesMap.get(type);
            if (depInfo) {
              const deps = depInfo.components;
              for (let j = 0, len = deps.length; j < len; j++) {
                const depType = deps[j];
                for (let k = 0, n = components.length; k < n; k++) {
                  const candidate = components[k];
                  if (candidate instanceof depType && addedSet.has(candidate)) {
                    moveWithDependenciesBefore(candidate, limitIndex);
                    break;
                  }
                }
              }
            }
            type = Object.getPrototypeOf(type);
          }

          const currentIndex = components.indexOf(comp);
          if (currentIndex > limitIndex && !Entity._isTransformType(comp.constructor as ComponentConstructor)) {
            components.splice(currentIndex, 1);
            components.splice(limitIndex, 0, comp);
          }
        };

        for (let i = 0, n = replacedEntries.length; i < n; i++) {
          const { dependency, dependents } = replacedEntries[i];
          let earliestDependentIndex = this._components.length;
          for (let j = 0, m = dependents.length; j < m; j++) {
            const idx = this._components.indexOf(dependents[j]);
            if (idx !== -1 && idx < earliestDependentIndex) {
              earliestDependentIndex = idx;
            }
          }
          if (earliestDependentIndex === this._components.length) continue;

          for (let j = 0, m = addedComponents.length; j < m; j++) {
            const addedComp = addedComponents[j];
            if (addedComp instanceof dependency) {
              moveWithDependenciesBefore(addedComp, earliestDependentIndex);
              // Recompute earliest dependent index after moving replacement(s) ahead of it
              earliestDependentIndex = this._components.length;
              for (let k = 0, p = dependents.length; k < p; k++) {
                const idx = this._components.indexOf(dependents[k]);
                if (idx !== -1 && idx < earliestDependentIndex) {
                  earliestDependentIndex = idx;
                }
              }
            }
          }
        }
      }
    }

    for (let i = 0, n = suspendedDependents.length; i < n; i++) {
      const dep = suspendedDependents[i];
      if (!dep.destroyed) {
        dep._setActive(true, ActiveChangeFlag.Scene);
      }
    }
  }

  /**
   * @internal
   */
  _markAsTemplate(templateResource: ReferResource): void {
    this._isTemplate = true;
    this._templateResource = templateResource;
  }

  private _createCloneEntity(cloneMap: Map<object, object>): Entity {
    const components = this._components;
    const n = components.length;
    const cloneEntity = new Entity(this.engine, this.name, components[0].constructor as ComponentConstructor);
    cloneMap.set(this, cloneEntity);
    cloneMap.set(components[0], cloneEntity._components[0]);
    if (n > 1) {
      const types = new Array<ComponentConstructor>(n - 1);
      for (let i = 1; i < n; i++) {
        types[i - 1] = components[i].constructor as ComponentConstructor;
      }
      cloneEntity._addComponents(types, (i, comp) => {
        cloneMap.set(components[i + 1], comp);
      });
    }
    const templateResource = this._templateResource;
    if (templateResource) {
      cloneEntity._templateResource = templateResource;
      templateResource._addReferCount(1);
    }

    cloneEntity.layer = this.layer;
    cloneEntity._isActive = this._isActive;
    const srcChildren = this._children;
    for (let i = 0, n = srcChildren.length; i < n; i++) {
      cloneEntity.addChild(srcChildren[i]._createCloneEntity(cloneMap));
    }
    return cloneEntity;
  }

  private _parseCloneEntity(src: Entity, target: Entity, cloneMap: Map<object, object>): void {
    const srcChildren = src._children;
    const targetChildren = target._children;
    for (let i = 0, n = srcChildren.length; i < n; i++) {
      this._parseCloneEntity(srcChildren[i], targetChildren[i], cloneMap);
    }

    const components = src._components;
    for (let i = 0, n = components.length; i < n; i++) {
      ComponentCloner.cloneComponent(components[i], cloneMap.get(components[i]) as Component, cloneMap);
    }
  }

  /**
   * Destroy self.
   */
  override destroy(): void {
    super.destroy();
    if (!this._destroyed) {
      return;
    }

    let firstError: unknown;
    let hasError = false;
    const recordError = (error: unknown): void => {
      if (!hasError) {
        firstError = error;
        hasError = true;
      }
    };

    if (this._templateResource) {
      this._isTemplate || this._templateResource._addReferCount(-1);
      this._templateResource = null!;
    }

    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      if (!component) continue;
      try {
        component.destroy();
      } catch (error) {
        recordError(error);
      }
    }
    this._components.length = 0;

    const children = this._children;
    while (children.length > 0) {
      const child = children[0];
      try {
        child.destroy();
      } catch (error) {
        recordError(error);
        if (children[0] === child) {
          child._removeFromParent();
          Entity._traverseSetOwnerScene(child, null);
        }
      }
    }

    try {
      if (this._isRoot) {
        this._scene!.removeRootEntity(this);
      } else {
        this._setParent(null);
      }
    } catch (error) {
      recordError(error);
    }

    this.isActive = false;

    if (hasError) {
      throw firstError;
    }
  }

  /**
   * @internal
   */
  _removeComponent(component: Component): void {
    const components = this._components;
    const index = components.indexOf(component);
    // A replaced Transform is detached from the component slot immediately but
    // can still reach here later because object destruction may be deferred
    if (index < 0) return;
    components.splice(index, 1);
  }

  /**
   * @internal
   */
  _addScript(script: Script) {
    script._entityScriptsIndex = this._scripts.length;
    this._scripts.add(script);
    this._scriptsVersion++;
  }

  /**
   * @internal
   */
  _removeScript(script: Script): void {
    const replaced = this._scripts.deleteByIndex(script._entityScriptsIndex);
    replaced && (replaced._entityScriptsIndex = script._entityScriptsIndex);
    script._entityScriptsIndex = -1;
    this._scriptsVersion++;
  }

  /**
   * @internal
   */
  _removeFromParent(): void {
    const oldParent = this._parent;
    if (oldParent != null) {
      Entity._removeFromChildren(oldParent._children, this);
      this._parent = null;
      oldParent._dispatchModify(EntityModifyFlags.Child, oldParent);
    }
  }

  /**
   * @internal
   */
  _processActive(activeChangeFlag: ActiveChangeFlag): void {
    if (this._activeChangedComponents) {
      throw "Note: can't set the 'main inActive entity' active in hierarchy, if the operation is in main inActive entity or it's children script's onDisable Event.";
    }
    this._activeChangedComponents = this._scene!._componentsManager.getActiveChangedTempList();
    this._setActiveInHierarchy(this._activeChangedComponents!, activeChangeFlag);
    this._setActiveComponents(true, activeChangeFlag);
  }

  /**
   * @internal
   */
  _processInActive(activeChangeFlag: ActiveChangeFlag): void {
    if (this._activeChangedComponents) {
      throw "Note: can't set the 'main active entity' inActive in hierarchy, if the operation is in main active entity or it's children script's onEnable Event.";
    }
    this._activeChangedComponents = this._scene!._componentsManager.getActiveChangedTempList();
    this._setInActiveInHierarchy(this._activeChangedComponents!, activeChangeFlag);
    this._setActiveComponents(false, activeChangeFlag);
  }

  /**
   * @internal
   */
  _setParentChange() {
    this._transform._parentChange();
    this._dispatchModify(EntityModifyFlags.Parent, this);
  }

  /**
   * @internal
   */
  _registerModifyListener(onChange: (flag: EntityModifyFlags) => void): void {
    (this._modifyFlagManager ||= new UpdateFlagManager()).addListener(onChange);
  }

  /**
   * @internal
   */
  _unRegisterModifyListener(onChange: (flag: EntityModifyFlags) => void): void {
    this._modifyFlagManager?.removeListener(onChange);
  }

  private _dispatchModify(flag: EntityModifyFlags, param?: any): void {
    this._modifyFlagManager?.dispatch(flag, param);
  }

  private _addToChildrenList(index: number | undefined, child: Entity): void {
    Entity._addToChildren(this._children, child, index);
    this._dispatchModify(EntityModifyFlags.Child, this);
  }

  private _isSelfOrDescendantOf(ancestor: Entity): boolean {
    for (let current: Entity | null = this; current != null; current = current._parent) {
      if (current === ancestor) return true;
    }
    return false;
  }

  private _setParent(parent: Entity | null, siblingIndex?: number): void {
    const oldParent = this._parent;
    if (parent !== oldParent) {
      if (parent) {
        if (parent._isSelfOrDescendantOf(this)) {
          throw new Error("Cannot set parent to self or a descendant entity.");
        }
        if (siblingIndex !== undefined) {
          const childCount = parent._children.length;
          if (siblingIndex < 0 || siblingIndex > childCount) {
            throw `The index ${siblingIndex} is out of child list bounds ${childCount}`;
          }
        }
      }

      if (this._isRoot) {
        Entity._removeFromChildren(this._scene!._rootEntities, this);
        this._isRoot = false;
      } else {
        this._removeFromParent();
      }
      this._parent = parent;
      if (parent) {
        this._isRoot = false;
        if (this._isActiveInScene && parent._isActiveInScene && this._scene === parent._scene) {
          this._scene!.physics._invalidateBodyOrder();
        }
        parent._addToChildrenList(siblingIndex, this);

        const oldScene = this._scene;
        const parentScene = parent._scene;

        let inActiveChangeFlag = ActiveChangeFlag.None;
        if (!parent._isActiveInHierarchy) {
          this._isActiveInHierarchy && (inActiveChangeFlag |= ActiveChangeFlag.Hierarchy);
        }
        if (parent._isActiveInScene) {
          // Cross-scene transfer deactivates before reactivating in the destination scene.
          this._isActiveInScene && oldScene !== parentScene && (inActiveChangeFlag |= ActiveChangeFlag.Scene);
        } else {
          this._isActiveInScene && (inActiveChangeFlag |= ActiveChangeFlag.Scene);
        }
        inActiveChangeFlag && this._processInActive(inActiveChangeFlag);

        if (oldScene !== parentScene) {
          Entity._traverseSetOwnerScene(this, parentScene);
        }

        let activeChangeFlag = ActiveChangeFlag.None;
        if (this._isActive) {
          if (parent._isActiveInHierarchy) {
            !this._isActiveInHierarchy && (activeChangeFlag |= ActiveChangeFlag.Hierarchy);
          }
          if (parent._isActiveInScene) {
            (!this._isActiveInScene || oldScene !== parentScene) && (activeChangeFlag |= ActiveChangeFlag.Scene);
          }
        }
        activeChangeFlag && this._processActive(activeChangeFlag);
      } else {
        let inActiveChangeFlag = ActiveChangeFlag.None;
        this._isActiveInHierarchy && (inActiveChangeFlag |= ActiveChangeFlag.Hierarchy);
        this._isActiveInScene && (inActiveChangeFlag |= ActiveChangeFlag.Scene);
        try {
          inActiveChangeFlag && this._processInActive(inActiveChangeFlag);
        } finally {
          if (oldParent) {
            Entity._traverseSetOwnerScene(this, null);
          }
        }
      }
      this._setParentChange();
    } else {
      if (parent && siblingIndex !== undefined) {
        this.siblingIndex = siblingIndex;
      }
    }
  }

  private _getComponentsInChildren<T extends Component>(type: ComponentConstructor<T>, results: T[]): void {
    const components = this._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      if (component instanceof type) {
        results.push(component);
      }
    }
    const children = this._children;
    for (let i = 0, n = children.length; i < n; i++) {
      children[i]._getComponentsInChildren<T>(type, results);
    }
  }

  private _setActiveComponents(isActive: boolean, activeChangeFlag: ActiveChangeFlag): void {
    const activeChangedComponents = this._activeChangedComponents!;
    const ownerScene = this._scene!;
    const componentsManager = ownerScene._componentsManager;
    ownerScene._activeProcessCount++;
    let firstError: unknown;
    let hasError = false;
    try {
      for (let i = 0, length = activeChangedComponents.length; i < length; ++i) {
        try {
          activeChangedComponents[i]._setActive(isActive, activeChangeFlag);
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
    } finally {
      this._activeChangedComponents = null;
      componentsManager.putActiveChangedTempList(activeChangedComponents);
      if (--ownerScene._activeProcessCount === 0) {
        try {
          ownerScene._flushPendingPhysicsDestroy();
        } catch (error) {
          if (!hasError) {
            firstError = error;
            hasError = true;
          }
        }
      }
      if (!this._scene && !this._destroyed && !hasError) {
        firstError = new Error("Cannot detach an entity from its scene while it is processing active state changes.");
        hasError = true;
      }
    }
    if (hasError) {
      throw firstError;
    }
  }

  private _setActiveInHierarchy(activeChangedComponents: Component[], activeChangeFlag: ActiveChangeFlag): void {
    activeChangeFlag & ActiveChangeFlag.Hierarchy && (this._isActiveInHierarchy = true);
    activeChangeFlag & ActiveChangeFlag.Scene && (this._isActiveInScene = true);
    const components = this._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      (component.enabled || !component._awoken) && activeChangedComponents.push(component);
    }
    const children = this._children;
    for (let i = 0, n = children.length; i < n; i++) {
      const child = children[i];
      child.isActive && child._setActiveInHierarchy(activeChangedComponents, activeChangeFlag);
    }
  }

  private _setInActiveInHierarchy(activeChangedComponents: Component[], activeChangeFlag: ActiveChangeFlag): void {
    // Children-first, reverse traversal for safe removeChild during callbacks
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      child.isActive && child._setInActiveInHierarchy(activeChangedComponents, activeChangeFlag);
    }
    activeChangeFlag & ActiveChangeFlag.Hierarchy && (this._isActiveInHierarchy = false);
    activeChangeFlag & ActiveChangeFlag.Scene && (this._isActiveInScene = false);
    const components = this._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const component = components[i];
      component.enabled && activeChangedComponents.push(component);
    }
  }

  private _setSiblingIndex(sibling: Entity[], target: number): void {
    target = Math.min(target, sibling.length - 1);
    if (target < 0) {
      throw `Sibling index ${target} should large than 0`;
    }
    if (this._siblingIndex !== target) {
      const oldIndex = this._siblingIndex;
      if (target < oldIndex) {
        for (let i = oldIndex; i >= target; i--) {
          const child = i == target ? this : sibling[i - 1];
          sibling[i] = child;
          child._siblingIndex = i;
        }
      } else {
        for (let i = oldIndex; i <= target; i++) {
          const child = i == target ? this : sibling[i + 1];
          sibling[i] = child;
          child._siblingIndex = i;
        }
      }
    }
  }

  private _replaceTransform(replacement: Transform): void {
    const previous = this._transform;
    replacement._copyLocalPoseFrom(previous);
    this._components[0] = replacement;
    this._transform = replacement;

    const children = this._children;
    for (let i = 0, n = children.length; i < n; i++) {
      children[i].transform._parentChange();
    }
    previous.destroy();
  }

  //--------------------------------------------------------------deprecated----------------------------------------------------------------
  private _invModelMatrix: Matrix = new Matrix();
  private _inverseWorldMatFlag: BoolUpdateFlag;

  /**
   * @deprecated
   */
  getInvModelMatrix(): Matrix {
    if (this._inverseWorldMatFlag.flag) {
      Matrix.invert(this._transform.worldMatrix, this._invModelMatrix);
      this._inverseWorldMatFlag.flag = false;
    }
    return this._invModelMatrix;
  }
}

registerDefaultCloneMode(Entity, CloneMode.Remap);

export type ComponentArguments<T extends new (entity: Entity, ...args: any[]) => Component> = T extends new (
  entity: Entity,
  ...args: infer P
) => Component
  ? P
  : never;

export type ComponentConstructor<T extends Component = Component> = new (entity: Entity, ...args: any[]) => T;
