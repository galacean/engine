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
  _nativeStaticCollider: ICollider;

  private _shapes: ColliderShape[] = [];

  protected _position: Vector3 = this.entity.transform.position;
  protected _rotation: Quaternion = this.entity.transform.rotationQuaternion;

  /** The shape of the Collider. */
  get shapes(): Readonly<ColliderShape[]> {
    return this._shapes;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param shape collider shape
   * @remarks must call after this component add to Entity.
   */
  addShape(shape: ColliderShape) {
    this._shapes.push(shape);
    this._nativeStaticCollider.addShape(shape._nativeShape);
  }

  /**
   * Remove a collider shape.
   * @param shape - The collider shape.
   */
  removeShape(shape: ColliderShape): void {
    //todo
  }

  /**
   * Clear all shape collection.
   */
  clearShapes(): void {
    //todo
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
