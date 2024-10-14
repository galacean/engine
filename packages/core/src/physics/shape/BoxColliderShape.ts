import { IBoxColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneManager";
import { PhysicsScene } from "../PhysicsScene";
import { ColliderShape } from "./ColliderShape";

/**
 * Physical collider shape for box.
 */
export class BoxColliderShape extends ColliderShape {
  @ignoreClone
  private _size: Vector3 = new Vector3(1, 1, 1);

  /**
   * Size of box shape.
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    if (this._size !== value) {
      this._size.copyFrom(value);
    }
  }

  constructor() {
    super();
    this._nativeShape = PhysicsScene._nativePhysics.createBoxColliderShape(
      this._id,
      this._size,
      this._material._nativeMaterial
    );

    this._setSize = this._setSize.bind(this);
    //@ts-ignore
    this._size._onValueChanged = this._setSize;
  }

  /**
   * @internal
   */
  override _cloneTo(target: BoxColliderShape) {
    super._cloneTo(target);
    target.size = this.size;
  }

  @ignoreClone
  private _setSize(): void {
    (<IBoxColliderShape>this._nativeShape).setSize(this._size);
  }
}
