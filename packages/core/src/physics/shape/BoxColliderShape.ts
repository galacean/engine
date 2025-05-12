import { ColliderShape } from "./ColliderShape";
import { IBoxColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { deepClone, ignoreClone } from "../../clone/CloneManager";

/**
 * Physical collider shape for box.
 */
export class BoxColliderShape extends ColliderShape {
  @deepClone
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
    this._nativeShape = Engine._nativePhysics.createBoxColliderShape(
      this._id,
      this._size,
      this._material._nativeMaterial
    );

    //@ts-ignore
    this._size._onValueChanged = this._setSize.bind(this);
  }

  protected override _syncNative(): void {
    super._syncNative();
    this._setSize();
  }

  @ignoreClone
  private _setSize(): void {
    (<IBoxColliderShape>this._nativeShape).setSize(this._size);
  }
}
