import { Component } from "../Component";
import { ignoreClone } from "../clone/CloneManager";
import { ICollider } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./shape/ColliderShape";
import { DisorderedArray } from "../DisorderedArray";

export abstract class Collider extends Component {
  /** @internal */
  @ignoreClone
  _index: number = -1;

  /** @internal */
  _nativeStaticCollider: ICollider;

  private _shapes: DisorderedArray<ColliderShape> = new DisorderedArray();

  protected _position: Vector3 = this.entity.transform.position;
  protected _rotation: Quaternion = this.entity.transform.rotationQuaternion;

  /** The shape of the Collider. */
  get shapes(): Readonly<ColliderShape[]> {
    return this._shapes._elements;
  }

  /**
   * init Collider and alloc PhysX objects.
   * @param shape collider shape
   * @remarks must call after this component add to Entity.
   */
  addShape(shape: ColliderShape) {
    this._nativeStaticCollider.addShape(shape._nativeShape);
    shape._index = this._shapes.length;
    this._shapes.add(shape);
  }

  /**
   * Remove a collider shape.
   * @param shape - The collider shape.
   */
  removeShape(shape: ColliderShape): void {
    this._nativeStaticCollider.removeShape(shape._nativeShape);
    const replaced = this._shapes.deleteByIndex(shape._index);
    replaced && (replaced._index = shape._index);
    shape._index = -1;
  }

  /**
   * Clear all shape collection.
   */
  clearShapes(): void {
    this._nativeStaticCollider.clearShapes();
    this._shapes.length = 0;
    this._shapes.garbageCollection();
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
