import { IBoxColliderShape } from "@oasis-engine/design";
import { BoundingBox, Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { LiteColliderShape } from "./LiteColliderShape";
import { HitResult } from "../HitResult";
import { LitePhysicsMaterial } from "../LitePhysicsMaterial";

/** LitePhysics Shape for Box */
export class LiteBoxColliderShape extends LiteColliderShape implements IBoxColliderShape {
  private static _tempVec3: Vector3 = new Vector3();
  private static _tempBox: BoundingBox = new BoundingBox();

  private _size: Vector3 = new Vector3();

  public boxMin: Vector3 = new Vector3(-0.5, -0.5, -0.5);
  public boxMax: Vector3 = new Vector3(0.5, 0.5, 0.5);
  private _center: Vector3 = new Vector3();
  private _cornerFlag: boolean = false;

  /**
   * init Box Shape and alloc PhysX objects.
   * @param uniqueID index mark Shape
   * @param size size of Shape
   * @param material material of LiteCollider
   * @remarks must call after this component add to Entity.
   */
  constructor(uniqueID: number, size: Vector3, material: LitePhysicsMaterial) {
    super();
    this.setSize(size);
    this._id = uniqueID;
  }

  /**
   * {@inheritDoc IBoxColliderShape.setSize }
   */
  setSize(value: Vector3): void {
    this._size = value;
    this.setBoxCenterSize(this._center, this._size);
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {}

  /**
   * Set box from the center point and the size of the bounding box.
   * @param center - The center point
   * @param size - The size of the bounding box
   */
  setBoxCenterSize(center: Vector3, size: Vector3) {
    const halfSize = LiteBoxColliderShape._tempVec3;
    Vector3.scale(size, 0.5, halfSize);
    Vector3.add(center, halfSize, this.boxMax);
    Vector3.subtract(center, halfSize, this.boxMin);

    this._cornerFlag = true;
  }

  setCenter(value: Vector3) {
    this._center = value;
    this.setBoxCenterSize(this._center, this._size);
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: HitResult): boolean {
    const localRay = this._getLocalRay(ray);

    const boundingBox = LiteBoxColliderShape._tempBox;
    this.boxMin.cloneTo(boundingBox.min);
    this.boxMax.cloneTo(boundingBox.max);
    const intersect = localRay.intersectBox(boundingBox);
    if (intersect !== -1) {
      this._updateHitResult(localRay, intersect, hit, ray.origin);
      return true;
    } else {
      return false;
    } // end of else
  }
}
