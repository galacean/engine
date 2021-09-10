import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { ICollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./shape/ColliderShape";
import { Engine } from "../Engine";

export abstract class Collider extends Component {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _collider: ICollider;

  get index(): number {
    return this._index;
  }

  init(
    position: Vector3 = this.entity.transform.position,
    rotation: Quaternion = this.entity.transform.rotationQuaternion
  ) {
    this._collider.init(position, rotation);
  }

  createShape<T extends ColliderShape>(type: new (entity: Engine) => T): T {
    const component = new type(this.engine);
    component.init(this._index);
    return component;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param shape collider shape
   * @remarks must call after this component add to Entity.
   */
  addShape(shape: ColliderShape) {
    this._collider.addShape(shape._shape);
  }

  /**
   * @override
   */
  _onEnable() {
    super._onEnable();
    this.engine._componentsManager.addCollider(this);
  }

  /**
   * @override
   */
  _onDisable() {
    super._onDisable();
    this.engine._componentsManager.removeCollider(this);
  }

  abstract onUpdate();
}
