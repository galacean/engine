import { IColliderShape, IRigidCollider } from "@galacean/engine-design";
import { Collider } from "./Collider";
import { ColliderShapeChangeFlag } from "./enums/ColliderShapeChangeFlag";
import { ColliderShape } from "./shape/ColliderShape";

export abstract class RigidCollider extends Collider {
  /** @internal */
  declare _nativeCollider: IRigidCollider;

  /** @internal */
  _replaceNativeShape(shape: ColliderShape, nativeShape: IColliderShape | null): void {
    const previousShape = shape._nativeShape;
    if (previousShape === nativeShape) return;

    try {
      if (previousShape && nativeShape) {
        this._nativeCollider.replaceShape(previousShape, nativeShape);
      } else if (previousShape) {
        this._nativeCollider.removeShape(previousShape);
      } else if (nativeShape) {
        this._nativeCollider.addShape(nativeShape);
      }
    } catch (error) {
      nativeShape?.destroy();
      throw error;
    }
    shape._nativeShape = nativeShape;
    previousShape?.destroy();
    this._handleShapesChanged(ColliderShapeChangeFlag.Property);
  }
}
