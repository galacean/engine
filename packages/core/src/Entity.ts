import { Matrix, Quaternion, Vector3 } from "@oasis-engine/math";
import { EngineObject } from "./base";
import { ComponentCloner } from "./clone/ComponentCloner";
import { Component } from "./Component";
import { ComponentsDependencies } from "./ComponentsDependencies";
import { Engine } from "./Engine";
import { Layer } from "./Layer";
import { Scene } from "./Scene";
import { Transform } from "./Transform";
import { UpdateFlag } from "./UpdateFlag";

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

  name: string;
  /** The layer the entity belongs to. */
  layer: Layer = Layer.Layer0;
  readonly transform: Transform;

  /** @internal */
  _isActiveInHierarchy: boolean = false;
  /** @internal */
  _components: Component[] = [];
  /** @internal */
  _children: Entity[] = [];
  /** @internal */
  _scene: Scene;
  /** @internal */
  _isRoot: boolean = false;
  /** @internal */
  _isActive: boolean = true;

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

  set parent(entity: Entity) {
    if (entity !== this._parent) {
      const oldParent = this._removeFromParent();
      const newParent = (this._parent = entity);
      if (newParent) {
        newParent._children.push(this);
        const parentScene = newParent._scene;
        if (this._scene !== parentScene) {
          Entity._traverseSetOwnerScene(this, parentScene);
        }

        if (newParent._isActiveInHierarchy) {
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

  /**
   * The children entities
   */
  get children(): Readonly<Entity[]> {
    return this._children;
  }

  /**
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
   * The engine the entity belongs to.
   */
  get engine(): Engine {
    return this._engine;
  }

  /**
   * Create a entity.
   * @param engine - The engine the entity belongs to.
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
    this.transform = this.addComponent(Transform);
    this._inverseWorldMatFlag = this.transform.registerWorldChangeFlag();
  }

  /**
   * Add component based on the component type.
   * @param type - The type of the component.
   * @returns	The component which has been added.
   */
  addComponent<T extends Component>(type: new (entity: Entity) => T): T {
    ComponentsDependencies._addCheck(this, type);
    const component = new type(this);
    this._components.push(component);
    if (this._isActiveInHierarchy) {
      component._setActive(true);
    }
    return component;
  }

  /**
   * Get component which match the type.
   * @param type - The type of the component.
   * @returns	The first component which match type.
   */
  getComponent<T extends Component>(type: new (entity: Entity) => T): T {
    for (let i = this._components.length - 1; i >= 0; i--) {
      const component = this._components[i];
      if (component instanceof type) {
        return component;
      }
    }
  }

  /**
   * Get components which match the type.
   * @param type - The type of the component.
   * @param results - The components which match type.
   * @returns	The components which match type.
   */
  getComponents<T extends Component>(type: new (entity: Entity) => T, results: T[]): T[] {
    results.length = 0;
    for (let i = this._components.length - 1; i >= 0; i--) {
      const component = this._components[i];
      if (component instanceof type) {
        results.push(component);
      }
    }
    return results;
  }

  /**
   * Get the components which match the type of the entity and it's children.
   * @param type - The component type.
   * @param results - The components collection.
   * @returns	The components collection which match the type.
   */
  getComponentsIncludeChildren<T extends Component>(type: new (entity: Entity) => T, results: T[]): T[] {
    results.length = 0;
    this._getComponentsInChildren<T>(type, results);
    return results;
  }

  /**
   * Add child entity.
   * @param child - The child entity which want to be added.
   */
  addChild(child: Entity): void {
    child.parent = this;
  }

  /**
   * Remove child entitiy.
   * @param child - The child entity which want to be removed.
   */
  removeChild(child: Entity): void {
    child.parent = null;
  }

  /**
   * Find child entity by index.
   * @param index - The index of the child entity.
   * @returns	The component which be finded.
   */
  getChild(index: number): Entity {
    return this._children[index];
  }

  /**
   * Find child entity by name.
   * @param name - The name of the entity which want to be finded.
   * @returns The component which be finded.
   */
  findByName(name: string): Entity {
    const children = this._children;
    const child = Entity._findChildByName(this, name);
    if (child) return child;
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      const grandson = child.findByName(name);
      if (grandson) {
        return grandson;
      }
    }
    return null;
  }

  /**
   * Find the entity by path.
   * @param path - The path fo the entity eg: /entity.
   * @returns The component which be finded.
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
   * @param name - The child entity's name.
   * @returns The child entity.
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
   * Clone
   * @returns Cloned entity.
   */
  clone(): Entity {
    const cloneEntity = new Entity(this._engine, this.name);

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
  destroy(): void {
    const abilityArray = this._components;
    for (let i = abilityArray.length - 1; i >= 0; i--) {
      abilityArray[i].destroy();
    }
    this._components.length = 0;

    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      children[i].destroy();
    }
    this._children.length = 0;

    if (this._parent != null) {
      const parentChildren = this._parent._children;
      parentChildren.splice(parentChildren.indexOf(this), 1);
    }
    this._parent = null;
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
  _removeFromParent(): Entity {
    const oldParent = this._parent;
    if (oldParent != null) {
      const oldParentChildren = oldParent._children;
      oldParentChildren.splice(oldParentChildren.indexOf(this), 1);
      this._parent = null;
    }
    return oldParent;
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
      activeChangedComponents.push(components[i]);
    }
    const children = this._children;
    for (let i = children.length - 1; i >= 0; i--) {
      const child: Entity = children[i];
      child.isActive && child._setActiveInHierarchy(activeChangedComponents);
    }
  }

  private _setInActiveInHierarchy(activeChangedComponents: Component[]): void {
    this._isActiveInHierarchy = false;
    const components = this._components;
    for (let i = components.length - 1; i >= 0; i--) {
      activeChangedComponents.push(components[i]);
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

  //--------------------------------------------------------------deprecated----------------------------------------------------------------
  private _invModelMatrix: Matrix = new Matrix();
  private _inverseWorldMatFlag: UpdateFlag;

  /**
   * @deprecated
   * Use transform.position instead.
   */
  get position(): Vector3 {
    return this.transform.position;
  }

  set position(val: Vector3) {
    this.transform.position = val;
  }

  /**
   * @deprecated
   * Use transform.worldPosition instead.
   */
  get worldPosition(): Vector3 {
    return this.transform.worldPosition;
  }

  set worldPosition(val: Vector3) {
    this.transform.worldPosition = val;
  }

  /**
   * @deprecated
   * Use transform.rotationQuaternion instead.
   */
  get rotation(): Quaternion {
    return this.transform.rotationQuaternion;
  }

  set rotation(val: Quaternion) {
    this.transform.rotationQuaternion = val;
  }

  /**
   * @deprecated
   * Use transform.scale instead.
   */
  get scale(): Vector3 {
    return this.transform.scale;
  }

  set scale(val: Vector3) {
    this.transform.scale = val;
  }

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
