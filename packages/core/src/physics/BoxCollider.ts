import { IBoxShape } from "@galacean/engine-design";
import { type BoundingBox, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { setRotatedBounds } from "./colliderBounds";
import { isValidPositiveFloat32 } from "./float32";

/**
 * A box-shaped collider.
 */
export class BoxCollider extends Collider {
  private static readonly _tempHalfExtents = new Vector3();

  private _size = new Vector3(1, 1, 1);

  /**
   * The box size in local units. Use positive, finite components.
   * @defaultValue `(1, 1, 1)`
   * @remarks Mutating the returned vector changes the size. The collider is excluded from simulation and queries
   * until all scaled half-extents round to positive, normal, finite Float32 values.
   */
  get size(): Vector3 {
    return this._size;
  }

  set size(value: Vector3) {
    value !== this._size && this._size.copyFrom(value);
  }

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
    //@ts-ignore
    this._size._onValueChanged = this._onSizeChanged.bind(this);
  }

  override getBounds(out: BoundingBox): boolean {
    const transform = this.entity.transform;
    const scale = transform.lossyWorldScale;
    const extents = this._getHalfExtents(Collider._getAbsoluteScale(scale));
    if (!extents) {
      return false;
    }
    const rotation = transform.worldRotationQuaternion;
    const center = this._getBoundsCenter(transform, scale, rotation);
    return setRotatedBounds(out, center, rotation, extents.x, extents.y, extents.z);
  }

  protected override _syncGeometry(shape: IBoxShape | null, scale: Vector3): IBoxShape | null {
    const extents = this._getHalfExtents(scale);
    if (!extents) {
      return null;
    }
    if (!shape) {
      return Engine._nativePhysics.createBoxShape(this._id, extents, this._getNativeMaterial());
    }
    shape.setHalfExtents(extents);
    return shape;
  }

  protected override _onDestroy(): void {
    //@ts-ignore
    this._size._onValueChanged = null;
    super._onDestroy();
  }

  private _getHalfExtents(scale: Vector3): Vector3 | null {
    const size = this._size;
    const x = size.x * scale.x * 0.5;
    const y = size.y * scale.y * 0.5;
    const z = size.z * scale.z * 0.5;
    return isValidPositiveFloat32(x) && isValidPositiveFloat32(y) && isValidPositiveFloat32(z)
      ? BoxCollider._tempHalfExtents.set(x, y, z)
      : null;
  }

  private _onSizeChanged(): void {
    this._geometryDirty = true;
    this._markDirty();
  }
}
