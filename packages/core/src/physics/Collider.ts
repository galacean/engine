import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { ICollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./shape/ColliderShape";

export abstract class Collider extends Component {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _collider: ICollider;

  _shape: ColliderShape;

  _position: Vector3 = this.entity.transform.position;
  _rotation: Quaternion = this.entity.transform.rotationQuaternion;

  getID(): number {
    return this._shape._id;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param shape collider shape
   * @remarks must call after this component add to Entity.
   */
  addShape(shape: ColliderShape) {
    this._shape = shape;
    this._collider.addShape(shape._nativeShape);
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
