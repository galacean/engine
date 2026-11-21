import { IBoxColliderShape } from "@galacean/engine-design";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Collider } from "./Collider";

/**
 * A box-shaped collider.
 */
export class BoxCollider extends Collider {
  private static readonly _tempHalfExtents = new Vector3();

  private _size = new Vector3(1, 1, 1);

  /**
   * The size of the box in the Entity's local space. Negative components are clamped to 0.
   * @defaultValue `(1, 1, 1)`
   * @remarks A box with any non-positive effective world extent is excluded from simulation and queries until positive.
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.y) || !Number.isFinite(value.z)) {
      throw new Error("BoxCollider size must be finite.");
    }
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
    this._size._onValueChanged = this._onSizeChanged.bind(this);
  }

  protected override _syncGeometry(shape: IBoxColliderShape | null, scale: Vector3): IBoxColliderShape | null {
    const size = this._size;
    const x = size.x * scale.x * 0.5;
    const y = size.y * scale.y * 0.5;
    const z = size.z * scale.z * 0.5;
    if (
      !Collider._isValidPositiveFloat32(x) ||
      !Collider._isValidPositiveFloat32(y) ||
      !Collider._isValidPositiveFloat32(z)
    ) {
      return null;
    }
    const extents = BoxCollider._tempHalfExtents.set(x, y, z);
    if (!shape) {
      return Engine._nativePhysics.createBoxColliderShape(this._id, extents, this._getNativeMaterial());
    }
    shape.setHalfExtents(extents);
    return shape;
  }

  private _onSizeChanged(): void {
    const finite = BoxCollider._clampBoxSize(this._size);
    this._geometryDirty = true;
    this._markDirty();
    if (!finite) throw new Error("BoxCollider size must be finite.");
  }
}
