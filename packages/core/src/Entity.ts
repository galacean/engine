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
  static _assignOwnerScene(entity: Entity, scene: Scene | null | undefined): void {
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

  private static _addToChildren(children: Entity[], entity: Entity, index?: number): void {
    const childCount = children.length;
    if (index === undefined) {
      children[childCount] = entity;
      entity._siblingIndex = childCount;
    } else {
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
      const current = this._getActiveFlags();
      const flags = value
        ? Entity._getOwnerActiveFlags(this._parent, this._isRoot ? this._scene : null) & ~current
        : current;
      if (flags) this._assertActivationIdle();
      this._isActive = value;
      if (flags) {
        if (value) this._processActive(flags);
        else this._processInActive(flags);
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

    if (n === 1) {
      const type = components[0];
      if (type !== transformType) this.addComponent(type);
    } else if (n > 1) {
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
   * Detaches the children present when this method is called.
   */
  clearChildren(): void {
    const children = this._children.slice();
    for (let i = children.length - 1; i >= 0; i--) {
      this.removeChild(children[i]);
    }
  }

  /**
   * Clone this Entity, including children and components.
   * @returns A detached clone that must be added to a parent Entity or Scene to update and render
   */
  clone(): Entity {
    return this._clone();
  }

  /** @internal */
  _clone(templateOwner?: ReferResource): Entity {
    const cloneMap = new Map<object, object>();
    // Component constructors can start another clone while the type array is in use.
    const cloneEntity = this._createCloneEntity(cloneMap, [], templateOwner);
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
   * Apply removals in reverse dependency order and additions in dependency order.
   * When a removed component is replaced by a type in `addedTypes`, surviving scene-active dependents are temporarily
   * deactivated in the scene and re-activated against the replacement.
   */
  _applyComponentChanges(
    removed: readonly Component[],
    addedTypes: readonly ComponentConstructor[],
    onAdd?: (index: number, component: Component) => void
  ): void {
    const addedCount = addedTypes.length;
    if (removed.length === 0) {
      if (addedCount > 0) this._addComponents(addedTypes, onAdd);
      return;
    }
    if (addedCount === 0) {
      ComponentsDependencies._forEachInRemoveOrder(removed, (i) => removed[i].destroy());
      return;
    }

    const replacedEntries: Array<{ dependency: ComponentConstructor; dependents: Component[] }> = [];
    const suspendedDependents: Component[] = [];

    ComponentsDependencies._forEachInRemoveOrder(removed, (i) => {
      const component = removed[i];
      if (component.destroyed) return;
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
      }
      component.destroy();
    });

    if (replacedEntries.length === 0) {
      this._addComponents(addedTypes, onAdd);
      return;
    }

    const addedComponents = new Array<Component>(addedCount);
    this._addComponents(addedTypes, (i, component) => {
      addedComponents[i] = component;
      onAdd?.(i, component);
    });

    const components = this._components;
    const moveWithDependenciesBefore = (comp: Component, limitIndex: number): number => {
      const currentIndex = components.indexOf(comp);
      if (currentIndex <= limitIndex) return limitIndex;
      // Moving only predecessors keeps currentIndex valid.
      let type = comp.constructor as ComponentConstructor;
      while (type && type !== Component) {
        const depInfo = ComponentsDependencies._dependenciesMap.get(type);
        if (depInfo) {
          const deps = depInfo.components;
          for (let j = 0, len = deps.length; j < len; j++) {
            const depType = deps[j];
            for (let k = 0; k < currentIndex; k++) {
              const candidate = components[k];
              if (candidate instanceof depType) {
                limitIndex = moveWithDependenciesBefore(candidate, limitIndex);
                break;
              }
            }
          }
        }
        type = Object.getPrototypeOf(type);
      }

      components.splice(currentIndex, 1);
      components.splice(limitIndex, 0, comp);
      return limitIndex + 1;
    };

    for (let i = 0, n = replacedEntries.length; i < n; i++) {
      const { dependency, dependents } = replacedEntries[i];
      let earliestDependentIndex = components.length;
      for (let j = 0, m = dependents.length; j < m; j++) {
        const idx = components.indexOf(dependents[j]);
        if (idx !== -1 && idx < earliestDependentIndex) {
          earliestDependentIndex = idx;
        }
      }
      if (earliestDependentIndex === components.length) continue;

      for (let j = 0; j < addedCount; j++) {
        const addedComp = addedComponents[j];
        if (addedComp instanceof dependency) {
          earliestDependentIndex = moveWithDependenciesBefore(addedComp, earliestDependentIndex);
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

  private _createCloneEntity(
    cloneMap: Map<object, object>,
    types: ComponentConstructor[],
    templateOwner?: ReferResource
  ): Entity {
    const components = this._components;
    const n = components.length;
    const cloneEntity = new Entity(this.engine, this.name, components[0].constructor as ComponentConstructor);
    if (templateOwner) {
      cloneEntity._markAsTemplate(templateOwner);
    }
    cloneMap.set(this, cloneEntity);
    cloneMap.set(components[0], cloneEntity._components[0]);
    if (n > 1) {
      types.length = n - 1;
      for (let i = 1; i < n; i++) {
        types[i - 1] = components[i].constructor as ComponentConstructor;
      }
      cloneEntity._addComponents(types, (i, comp) => {
        cloneMap.set(components[i + 1], comp);
      });
    }
    const templateResource = this._templateResource;
    if (templateResource && !templateOwner) {
      cloneEntity._templateResource = templateResource;
      templateResource._addReferCount(1);
    }

    cloneEntity.layer = this.layer;
    cloneEntity._isActive = this._isActive;
    const srcChildren = this._children;
    for (let i = 0, n = srcChildren.length; i < n; i++) {
      cloneEntity.addChild(srcChildren[i]._createCloneEntity(cloneMap, types));
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
   * Destroys this entity, its components, and its descendants.
   */
  override destroy(): void {
    if (this._destroyed) return;
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
    // Destroy callbacks can remove other components from the live list.
    const removalOrder = components.length > 1 ? components.slice().reverse() : components;
    ComponentsDependencies._forEachInRemoveOrder(removalOrder, (i) => {
      try {
        removalOrder[i].destroy();
      } catch (error) {
        recordError(error);
      }
    });
    this._components.length = 0;

    const children = this._children;
    while (children.length > 0) {
      const child = children[0];
      try {
        child.destroy();
      } catch (error) {
        recordError(error);
      }
      if (children[0] === child) {
        // A reentrant parent destroy can encounter a child already being destroyed.
        try {
          child._detachFromHierarchy();
        } catch (error) {
          recordError(error);
        }
      }
    }

    this._isActive = this._isActiveInHierarchy = this._isActiveInScene = false;
    try {
      if (this._isRoot) {
        this._scene!.removeRootEntity(this);
      } else {
        this._setParent(null);
      }
    } catch (error) {
      recordError(error);
    }
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

  private _removeFromParent(): void {
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
    this._assertActivationIdle();
    this._activeChangedComponents = this._scene!._componentsManager.getActiveChangedTempList();
    this._setActiveInHierarchy(this._activeChangedComponents!, activeChangeFlag);
    this._setActiveComponents(true, activeChangeFlag);
  }

  /**
   * @internal
   */
  _processInActive(activeChangeFlag: ActiveChangeFlag): void {
    this._assertActivationIdle();
    this._activeChangedComponents = this._scene!._componentsManager.getActiveChangedTempList();
    this._setInActiveInHierarchy(this._activeChangedComponents!, activeChangeFlag);
    this._setActiveComponents(false, activeChangeFlag);
  }

  private _setParentChange(): void {
    this._transform._parentChange();
    this._dispatchModify(EntityModifyFlags.Parent, this);
  }

  private _assertActivationIdle(): void {
    if (this._activeChangedComponents) {
      throw new Error("Cannot change an entity's activation while its lifecycle callbacks are running.");
    }
  }

  private _getActiveFlags(): ActiveChangeFlag {
    return (
      (this._isActiveInHierarchy ? ActiveChangeFlag.Hierarchy : ActiveChangeFlag.None) |
      (this._isActiveInScene ? ActiveChangeFlag.Scene : ActiveChangeFlag.None)
    );
  }

  private static _getOwnerActiveFlags(parent: Entity | null, scene: Scene | null | undefined): ActiveChangeFlag {
    if (parent) return parent._getActiveFlags();
    if (scene) return scene._sceneManager && scene.isActive ? ActiveChangeFlag.All : ActiveChangeFlag.Scene;
    return ActiveChangeFlag.None;
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

  private _isSelfOrDescendantOf(ancestor: Entity): boolean {
    for (let current: Entity | null = this; current != null; current = current._parent) {
      if (current === ancestor) return true;
    }
    return false;
  }

  private _setParent(parent: Entity | null, siblingIndex?: number): void {
    if (parent !== this._parent) {
      if (parent) {
        this._attachToHierarchy(parent, siblingIndex);
      } else {
        this._detachFromHierarchy();
      }
    } else if (parent && siblingIndex !== undefined) {
      this.siblingIndex = siblingIndex;
    }
  }

  /** @internal */
  _attachToHierarchy(owner: Entity | Scene, index?: number): void {
    const parent = owner instanceof Entity ? owner : null;
    const oldParent = this._parent;
    const oldScene = this._scene;
    const wasRoot = this._isRoot;
    const scene = parent ? parent._scene : <Scene>owner;
    if (!parent && wasRoot && oldScene === scene) return;

    const siblings = parent ? parent._children : scene!._rootEntities;
    const requestError = this._getHierarchyTargetError(parent, siblings.length, index);
    if (requestError) throw requestError;
    const current = this._getActiveFlags();
    const target = Entity._getOwnerActiveFlags(parent, scene);
    const deactivation = current & (~target | (oldScene !== scene ? ActiveChangeFlag.Scene : ActiveChangeFlag.None));
    if (deactivation || (this._isActive && target & ~current)) {
      this._assertActivationIdle();
    }

    let firstError: unknown;
    let failed = false;
    if (deactivation) {
      try {
        // Keep both source links valid while user callbacks run.
        this._processInActive(deactivation);
      } catch (error) {
        firstError = error;
        failed = true;
      }
    }
    if (this._parent === oldParent && this._scene === oldScene && this._isRoot === wasRoot && !this.destroyed) {
      const destination = parent ? parent._scene : scene;
      const targetRemoved =
        destination?.destroyed ||
        destination?.pendingDestroy ||
        (deactivation && (parent?.destroyed || parent?.pendingDestroy));
      const targetError =
        deactivation && !targetRemoved && this._getHierarchyTargetError(parent, siblings.length, index);
      if (targetError) {
        if (!failed) {
          firstError = targetError;
          failed = true;
        }
      } else if (!targetRemoved) {
        if (wasRoot) {
          Entity._removeFromChildren(oldScene!._rootEntities, this);
        } else if (oldParent) {
          Entity._removeFromChildren(oldParent._children, this);
        }
        this._parent = parent;
        this._isRoot = !parent;
        Entity._addToChildren(siblings, this, index);
        if (parent?._isActiveInScene && this._isActiveInScene) {
          destination!.physics._invalidateBodyOrder();
        }
        if (oldScene !== destination) Entity._assignOwnerScene(this, destination);
        if (oldScene !== destination && destination) Entity._notifySceneChanged(this, destination);
        if (parent !== oldParent || !wasRoot) this._setParentChange();
        oldParent?._dispatchModify(EntityModifyFlags.Child, oldParent);
        parent?._dispatchModify(EntityModifyFlags.Child, parent);
      }

      // On cancellation, restore activity from the source that still owns this entity.
      const activation = this._isActive
        ? Entity._getOwnerActiveFlags(this._parent, this._isRoot ? this._scene : null) & ~this._getActiveFlags()
        : ActiveChangeFlag.None;
      if (activation) {
        try {
          this._processActive(activation);
        } catch (error) {
          if (!failed) throw error;
        }
      }
    }
    if (failed) throw firstError;
  }

  private _getHierarchyTargetError(parent: Entity | null, count: number, index?: number): Error | null {
    if (parent?._isSelfOrDescendantOf(this)) {
      return new Error("Cannot set parent to self or a descendant entity.");
    }
    if (index !== undefined && (index < 0 || index > count)) {
      return new RangeError(`The index ${index} is out of child list bounds ${count}`);
    }
    return null;
  }

  /** @internal */
  _detachFromHierarchy(): void {
    if (!this._destroyed) this._assertActivationIdle();
    const oldParent = this._parent;
    if (this._isRoot) {
      Entity._removeFromChildren(this._scene!._rootEntities, this);
      this._isRoot = false;
    } else {
      this._removeFromParent();
    }
    const deactivation = this._getActiveFlags();
    try {
      if (deactivation) this._processInActive(deactivation);
    } finally {
      // A callback may have attached this entity elsewhere after unlinking it.
      if (!this._parent && !this._isRoot) {
        Entity._assignOwnerScene(this, null);
        if (oldParent) this._setParentChange();
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
