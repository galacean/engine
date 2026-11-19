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

  protected override _hasValidGeometry(scale: Vector3): boolean {
    const size = this._size;
    return (
      Collider._isValidPositiveFloat32(size.x * scale.x * 0.5) &&
      Collider._isValidPositiveFloat32(size.y * scale.y * 0.5) &&
      Collider._isValidPositiveFloat32(size.z * scale.z * 0.5)
    );
  }

  protected override _syncGeometry(shape: IBoxColliderShape): void {
    shape.setSize(this._size);
  }

  protected override _createNative(): IBoxColliderShape {
    const shape = Engine._nativePhysics.createBoxColliderShape(this._id, this._size, this._getNativeMaterial());
    this._initializeNativeShape(shape);
    return shape;
  }

  @ignoreClone
  private _onSizeChanged(): void {
    const size = this._size;
    const xFinite = Number.isFinite(size.x);
    const yFinite = Number.isFinite(size.y);
    const zFinite = Number.isFinite(size.z);
    if (!xFinite || !yFinite || !zFinite) {
      //@ts-ignore
      const listener = size._onValueChanged;
      //@ts-ignore
      size._onValueChanged = null;
      size.set(
        xFinite && size.x >= 0 ? size.x : 0,
        yFinite && size.y >= 0 ? size.y : 0,
        zFinite && size.z >= 0 ? size.z : 0
      );
      //@ts-ignore
      size._onValueChanged = listener;
      this._geometryDirty = true;
      this._markDirty();
      throw new Error("BoxCollider size must be finite.");
    }
    if (size.x < 0 || size.y < 0 || size.z < 0) {
      //@ts-ignore
      const listener = size._onValueChanged;
      //@ts-ignore
      size._onValueChanged = null;
      size.set(size.x < 0 ? 0 : size.x, size.y < 0 ? 0 : size.y, size.z < 0 ? 0 : size.z);
      //@ts-ignore
      size._onValueChanged = listener;
    }
    this._geometryDirty = true;
    this._markDirty();
  }
}
