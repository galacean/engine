import { Matrix } from "@galacean/engine-math";
import { BoolUpdateFlag } from "./BoolUpdateFlag";
import { Component } from "./Component";
import { ComponentsDependencies } from "./ComponentsDependencies";
import { DisorderedArray } from "./DisorderedArray";
import { Engine } from "./Engine";
import { Layer } from "./Layer";
import { Scene } from "./Scene";
import { Script } from "./Script";
import { Transform } from "./Transform";
import { ReferResource } from "./asset/ReferResource";
import { EngineObject } from "./base";
import { ComponentCloner } from "./clone/ComponentCloner";

/**
 * Entity, be used as components container.
 */
export class Entity extends EngineObject {
  /**
   * @internal
   */
  static _findChildByName(root: Entity, name: string): Entity {
    const children = root._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.name === name) {
        return child;
      }
    }
    return null;
  }

  /**
   * @internal
   */
  static _traverseSetOwnerScene(entity: Entity, scene: Scene): void {
    entity._scene = scene;
    const children = entity._children;
    for (let i = entity.childCount - 1; i >= 0; i--) {
      this._traverseSetOwnerScene(children[i], scene);
    }
  }

  /** The name of entity. */
  name: string;
  /** The layer the entity belongs to. */
  layer: Layer = Layer.Layer0;
  /** Transform component. */
  readonly transform: Transform;

  /** @internal */
  _isActiveInHierarchy: boolean = false;
  /** @internal */
  _components: Component[] = [];
  /** @internal */
  _scripts: DisorderedArray<Script> = new DisorderedArray<Script>();
  /** @internal */
  _children: Entity[] = [];
  /** @internal */
  _scene: Scene;
  /** @internal */
  _isRoot: boolean = false;
  /** @internal */
  _isActive: boolean = true;
  /** @internal */
  _siblingIndex: number = -1;
  /** @internal @todo: temporary solution */
  _hookResource: ReferResource;

  private _parent: Entity = null;
  private _activeChangedComponents: Component[];

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
        if (parent?._isActiveInHierarchy || (this._isRoot && this._scene._isActiveInEngine)) {
          this._processActive();
        }
      } else {
        if (this._isActiveInHierarchy) {
          this._processInActive();
        }
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
   * The parent entity.
   */
  get parent(): Entity {
    return this._parent;
  }

  set parent(value: Entity) {
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
   * The scene the entity belongs to.
   */
  get scene(): Scene {
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

    this._setSiblingIndex(this._isRoot ? this._scene._rootEntities : this._parent._children, value);
  }

  /**
   * Create a entity.
   * @param engine - The engine the entity belongs to
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
    this.transform = this.addComponent(Transform);
    this._inverseWorldMatFlag = this.transform.registerWorldChangeFlag();
  }

  /**
   * Add component based on the component type.
   * @param type - The type of the component
   * @returns	The component which has been added
   */
  addComponent<T extends Component>(type: new (entity: Entity) => T): T {
    ComponentsDependencies._addCheck(this, type);
    const component = new type(this);
    this._components.push(component);
    component._setActive(true);
    return component;
  }

  /**
   * Get component which match the type.
   * @param type - The type of the component
   * @returns	The first component which match type
   */
  getComponent<T extends Component>(type: new (entity: Entity) => T): T | null {
    const components = this._components;
    // @todo: should inverse traversal
    for (let i = components.length - 1; i >= 0; i--) {
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
  getComponents<T extends Component>(type: new (entity: Entity) => T, results: T[]): T[] {
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
   * @param type - The component type
   * @param results - The components collection
   * @returns	The components collection which match the type
   */
  getComponentsIncludeChildren<T extends Component>(type: new (entity: Entity) => T, results: T[]): T[] {
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
    let index: number;
    if (typeof indexOrChild === "number") {
      index = indexOrChild;
    } else {
      index = undefined;
      child = indexOrChild;
    }

    if (child._isRoot) {
      child._scene._removeFromEntityList(child);
      child._isRoot = false;

      this._addToChildrenList(index, child);
      child._parent = this;

      const newScene = this._scene;
      if (child._scene !== newScene) {
        Entity._traverseSetOwnerScene(child, newScene);
      }

      if (this._isActiveInHierarchy) {
        !child._isActiveInHierarchy && child._isActive && child._processActive();
      } else {
        child._isActiveInHierarchy && child._processInActive();
      }

      child._setTransformDirty();
    } else {
      child._setParent(this, index);
    }
  }

  /**
   * Remove child entity.
   * @param child - The child entity which want to be removed
   */
  removeChild(child: Entity): void {
    child._setParent(null);
  }

  /**
   * @deprecated Please use `children` property instead.
   * Find child entity by index.
   * @param index - The index of the child entity
   * @returns	The component which be found
   */
  getChild(index: number): Entity {
    return this._children[index];
  }

  /**
   * Find entity by name.
   * @param name - The name of the entity which want to be found
   * @returns The component which be found
   */
  findByName(name: string): Entity {
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
   * Find the entity by path.
   * @param path - The path fo the entity eg: /entity
   * @returns The component which be found
   */
  findByPath(path: string): Entity {
    const splits = path.split("/");
    let entity: Entity = this;
    for (let i = 0, length = splits.length; i < length; ++i) {
      const split = splits[i];
      if (split) {
        entity = Entity._findChildByName(entity, split);
        if (!entity) {
          return null;
        }
      }
    }
    return entity;
  }

  /**
   * Create child entity.
   * @param name - The child entity's name
   * @returns The child entity
   */
  createChild(name?: string): Entity {
    const child = new Entity(this.engine, name);
    child.layer = this.layer;
    child.parent = this;
    return child;
  }

  /**
   * Clear children entities.
   */
  clearChildren(): void {
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      child._parent = null;
      child._isActiveInHierarchy && child._processInActive();
      Entity._traverseSetOwnerScene(child, null); // Must after child._processInActive().
    }
    children.length = 0;
  }

  /**
   * Clone.
   * @returns Cloned entity
   */
  clone(): Entity {
    const cloneEntity = new Entity(this._engine, this.name);
    const { _hookResource: hookResource } = this;
    if (hookResource) {
      cloneEntity._hookResource = hookResource;
      hookResource._addReferCount(1);
    }
    cloneEntity.layer = this.layer;
    cloneEntity._isActive = this._isActive;
    cloneEntity.transform.localMatrix = this.transform.localMatrix;

    const children = this._children;
    for (let i = 0, len = this._children.length; i < len; i++) {
      const child = children[i];
      cloneEntity.addChild(child.clone());
    }

    const components = this._components;
    for (let i = 0, n = components.length; i < n; i++) {
      const sourceComp = components[i];
      if (!(sourceComp instanceof Transform)) {
        const targetComp = cloneEntity.addComponent(<new (entity: Entity) => Component>sourceComp.constructor);
        ComponentCloner.cloneComponent(sourceComp, targetComp);
      }
    }

    return cloneEntity;
  }

  /**
   * Destroy self.
   */
  override destroy(): void {
    if (this._destroyed) {
      return;
    }

    super.destroy();
    if (this._hookResource) {
      this._hookResource._addReferCount(-1);
      this._hookResource = null;
    }

    this.isActive = false;

    if (this._isRoot) {
      this._scene.removeRootEntity(this);
    } else {
      this._setParent(null);
    }

    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      components[i].destroy();
    }
    this._components.length = 0;

    const children = this._children;
    while (children.length > 0) {
      children[0].destroy();
    }
  }

  /**
   * @internal
   */
  _removeComponent(component: Component): void {
    ComponentsDependencies._removeCheck(this, component.constructor as any);
    const components = this._components;
    components.splice(components.indexOf(component), 1);
  }

  /**
   * @internal
   */
  _addScript(script: Script) {
    script._entityScriptsIndex = this._scripts.length;
    this._scripts.add(script);
  }

  /**
   * @internal
   */
  _removeScript(script: Script): void {
    const replaced = this._scripts.deleteByIndex(script._entityScriptsIndex);
    replaced && (replaced._entityScriptsIndex = script._entityScriptsIndex);
    script._entityScriptsIndex = -1;
  }

  /**
   * @internal
   */
  _removeFromParent(): void {
    const oldParent = this._parent;
    if (oldParent != null) {
      const oldSibling = oldParent._children;
      let index = this._siblingIndex;
      oldSibling.splice(index, 1);
      for (let n = oldSibling.length; index < n; index++) {
        oldSibling[index]._siblingIndex--;
      }
      this._parent = null;
      this._siblingIndex = -1;
    }
  }

  /**
   * @internal
   */
  _processActive(): void {
    if (this._activeChangedComponents) {
      throw "Note: can't set the 'main inActive entity' active in hierarchy, if the operation is in main inActive entity or it's children script's onDisable Event.";
    }
    this._activeChangedComponents = this._engine._componentsManager.getActiveChangedTempList();
    this._setActiveInHierarchy(this._activeChangedComponents);
    this._setActiveComponents(true);
  }

  /**
   * @internal
   */
  _processInActive(): void {
    if (this._activeChangedComponents) {
      throw "Note: can't set the 'main active entity' inActive in hierarchy, if the operation is in main active entity or it's children script's onEnable Event.";
    }
    this._activeChangedComponents = this._engine._componentsManager.getActiveChangedTempList();
    this._setInActiveInHierarchy(this._activeChangedComponents);
    this._setActiveComponents(false);
  }

  private _addToChildrenList(index: number, child: Entity): void {
    const children = this._children;
    const childCount = children.length;
    if (index === undefined) {
      child._siblingIndex = childCount;
      children.push(child);
    } else {
      if (index < 0 || index > childCount) {
        throw `The index ${index} is out of child list bounds ${childCount}`;
      }
      child._siblingIndex = index;
      children.splice(index, 0, child);
      for (let i = index + 1, n = childCount + 1; i < n; i++) {
        children[i]._siblingIndex++;
      }
    }
  }

  private _setParent(parent: Entity, siblingIndex?: number): void {
    const oldParent = this._parent;
    if (parent !== oldParent) {
      this._removeFromParent();
      this._parent = parent;
      if (parent) {
        parent._addToChildrenList(siblingIndex, this);

        const parentScene = parent._scene;
        if (this._scene !== parentScene) {
          Entity._traverseSetOwnerScene(this, parentScene);
        }

        if (parent._isActiveInHierarchy) {
          !this._isActiveInHierarchy && this._isActive && this._processActive();
        } else {
          this._isActiveInHierarchy && this._processInActive();
        }
      } else {
        this._isActiveInHierarchy && this._processInActive();
        if (oldParent) {
          Entity._traverseSetOwnerScene(this, null);
        }
      }
      this._setTransformDirty();
    }
  }

  private _getComponentsInChildren<T extends Component>(type: new (entity: Entity) => T, results: T[]): void {
    for (let i = this._components.length - 1; i >= 0; i--) {
      const component = this._components[i];
      if (component instanceof type) {
        results.push(component);
      }
    }
    for (let i = this._children.length - 1; i >= 0; i--) {
      this._children[i]._getComponentsInChildren<T>(type, results);
    }
  }

  private _setActiveComponents(isActive: boolean): void {
    const activeChangedComponents = this._activeChangedComponents;
    for (let i = 0, length = activeChangedComponents.length; i < length; ++i) {
      activeChangedComponents[i]._setActive(isActive);
    }
    this._engine._componentsManager.putActiveChangedTempList(activeChangedComponents);
    this._activeChangedComponents = null;
  }

  private _setActiveInHierarchy(activeChangedComponents: Component[]): void {
    this._isActiveInHierarchy = true;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      (component.enabled || !component._awoken) && activeChangedComponents.push(component);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      child.isActive && child._setActiveInHierarchy(activeChangedComponents);
    }
  }

  private _setInActiveInHierarchy(activeChangedComponents: Component[]): void {
    this._isActiveInHierarchy = false;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      component.enabled && activeChangedComponents.push(component);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child: Entity = children[i];
      child.isActive && child._setInActiveInHierarchy(activeChangedComponents);
    }
  }

  private _setTransformDirty() {
    if (this.transform) {
      this.transform._parentChange();
    } else {
      for (let i = 0, len = this._children.length; i < len; i++) {
        this._children[i]._setTransformDirty();
      }
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

  //--------------------------------------------------------------deprecated----------------------------------------------------------------
  private _invModelMatrix: Matrix = new Matrix();
  private _inverseWorldMatFlag: BoolUpdateFlag;

  /**
   * @deprecated
   */
  getInvModelMatrix(): Matrix {
    if (this._inverseWorldMatFlag.flag) {
      Matrix.invert(this.transform.worldMatrix, this._invModelMatrix);
      this._inverseWorldMatFlag.flag = false;
    }
    return this._invModelMatrix;
  }
}
