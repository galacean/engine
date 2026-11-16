import { IBoxColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Collider } from "./Collider";

/**
 * A box-shaped collider.
 */
export class BoxCollider extends Collider {
  private _size = new Vector3(1, 1, 1);

  /**
   * The size of the box in the Entity's local space.
   * @defaultValue `(1, 1, 1)`
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    if (this._size !== value) {
      this._size.copyFrom(value);
    }
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    //@ts-ignore
    this._size._onValueChanged = this._setSize.bind(this);
  }

  protected override _createNative(): IBoxColliderShape {
    const shape = Engine._nativePhysics.createBoxColliderShape(this._id, this._size, this._getNativeMaterial());
    this._initializeNativeShape(shape);
    return shape;
  }

  @ignoreClone
  private _setSize(): void {
    const shape = <IBoxColliderShape>this._native;
    if (shape) {
      shape.setSize(this._size);
      this._onGeometryChanged();
    }
  }
}
