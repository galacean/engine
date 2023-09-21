import { ColliderShape } from "./ColliderShape";
import { IBoxColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { PhysicsScene } from "../PhysicsScene";
import { ignoreClone } from "../../clone/CloneManager";

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
      this._setSize();
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

  clone(): BoxColliderShape {
    const dest = new BoxColliderShape();
    this.cloneTo(dest);
    return dest;
  }

  override cloneTo(target: BoxColliderShape) {
    super.cloneTo(target);
    target.size = this.size;
  }

  private _setSize(): void {
    (<IBoxColliderShape>this._nativeShape).setSize(this._size);
  }
}
