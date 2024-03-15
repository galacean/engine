import { BoundingBox, Ray, Vector3 } from "@galacean/engine";
import { IBoxColliderShape } from "@galacean/engine-design";
import { LiteHitResult } from "../LiteHitResult";
import { LitePhysicsMaterial } from "../LitePhysicsMaterial";
import { LiteColliderShape } from "./LiteColliderShape";

/**
 * Box collider shape in Lite.
 */
export class LiteBoxColliderShape extends LiteColliderShape implements IBoxColliderShape {
  private static _tempBox: BoundingBox = new BoundingBox();
  private _halfSize: Vector3 = new Vector3();
  private _sizeScale: Vector3 = new Vector3(1, 1, 1);

  /** @internal */
  _boxMin: Vector3 = new Vector3(-0.5, -0.5, -0.5);
  /** @internal */
  _boxMax: Vector3 = new Vector3(0.5, 0.5, 0.5);

  /**
   * Init Box Shape.
   * @param uniqueID - UniqueID mark Shape.
   * @param size - Size of Shape.
   * @param material - Material of PhysXCollider.
   */
  constructor(uniqueID: number, size: Vector3, material: LitePhysicsMaterial) {
    super();
    this._id = uniqueID;
    this._halfSize.set(size.x * 0.5, size.y * 0.5, size.z * 0.5);
    this._setBondingBox();
  }

  /**
   * {@inheritDoc IColliderShape.setPosition }
   */
  override setPosition(position: Vector3): void {
    super.setPosition(position);
    this._setBondingBox();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._sizeScale.copyFrom({
      x: Math.abs(scale.x),
      y: Math.abs(scale.y),
      z: Math.abs(scale.z)
    });
    this._setBondingBox();
  }

  /**
   * {@inheritDoc IBoxColliderShape.setSize }
   */
  setSize(value: Vector3): void {
    this._halfSize.set(value.x * 0.5, value.y * 0.5, value.z * 0.5);
    this._setBondingBox();
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: LiteHitResult): boolean {
    const localRay = this._getLocalRay(ray);
    const sizeScale = this._sizeScale;

    const boundingBox = LiteBoxColliderShape._tempBox;
    boundingBox.min.set(
      -this._halfSize.x * sizeScale.x,
      -this._halfSize.y * sizeScale.y,
      -this._halfSize.z * sizeScale.z
    );
    boundingBox.max.set(this._halfSize.x * sizeScale.x, this._halfSize.y * sizeScale.y, this._halfSize.z * sizeScale.z);
    const rayDistance = localRay.intersectBox(boundingBox);
    if (rayDistance !== -1) {
      this._updateHitResult(localRay, rayDistance, hit, ray.origin);
      return true;
    } else {
      return false;
    }
  }

  private _setBondingBox(): void {
    const { position } = this._transform;
    const scale = this._sizeScale;
    const halfSize = this._halfSize;

    this._boxMin.set(
      -halfSize.x * scale.x + position.x,
      -halfSize.y * scale.y + position.y,
      -halfSize.z * scale.z + position.z
    );
    this._boxMax.set(
      halfSize.x * scale.x + position.x,
      halfSize.y * scale.y + position.y,
      halfSize.z * scale.z + position.z
    );
  }
}
