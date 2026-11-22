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
   * The box size in local units. Finite negative components are clamped to 0.
   * @defaultValue `(1, 1, 1)`
   * @remarks Mutating the returned vector changes the size. Simulation and queries require valid, positive world extents.
   * @throws When a component is non-finite.
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

  private static _clampSize(size: Vector3): boolean {
    const { x, y, z } = size;
    const finiteX = Number.isFinite(x);
    const finiteY = Number.isFinite(y);
    const finiteZ = Number.isFinite(z);
    const finite = finiteX && finiteY && finiteZ;
    if (!finite || x < 0 || y < 0 || z < 0) {
      //@ts-ignore
      const listener = size._onValueChanged;
      //@ts-ignore
      size._onValueChanged = null;
      size.set(finiteX && x >= 0 ? x : 0, finiteY && y >= 0 ? y : 0, finiteZ && z >= 0 ? z : 0);
      //@ts-ignore
      size._onValueChanged = listener;
    }
    return finite;
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

  protected override _onDestroy(): void {
    //@ts-ignore
    this._size._onValueChanged = null;
    super._onDestroy();
  }

  private _onSizeChanged(): void {
    const finite = BoxCollider._clampSize(this._size);
    this._geometryDirty = true;
    this._markDirty();
    if (!finite) throw new Error("BoxCollider size must be finite.");
  }
}
