import { IBoxColliderShape } from "@oasis-engine/design";
import { BoundingBox, Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { ColliderShape } from "./ColliderShape";
import { HitResult } from "../HitResult";
import { PhysicsMaterial } from "../PhysicsMaterial";

/** LitePhysics Shape for Box */
export class BoxColliderShape extends ColliderShape implements IBoxColliderShape {
  private static _tempVec3: Vector3 = new Vector3();
  private static _tempBox: BoundingBox = new BoundingBox();

  public boxMin: Vector3 = new Vector3(-0.5, -0.5, -0.5);
  public boxMax: Vector3 = new Vector3(0.5, 0.5, 0.5);

  private _center: Vector3 = new Vector3();
  private _size: Vector3 = new Vector3();

  private _cornerFlag: boolean = false;

  /**
   * Set box from the center point and the size of the bounding box.
   * @param center - The center point
   * @param size - The size of the bounding box
   */
  setBoxCenterSize(center: Vector3, size: Vector3) {
    const halfSize = BoxColliderShape._tempVec3;
    Vector3.scale(size, 0.5, halfSize);
    Vector3.add(center, halfSize, this.boxMax);
    Vector3.subtract(center, halfSize, this.boxMin);

    this._cornerFlag = true;
  }

  setCenter(value: Vector3) {
    this._center = value;
    this.setBoxCenterSize(this._center, this._size);
  }

  /** extents of Box Shape */
  setExtents(size: Vector3): void {
    this._size = size;
    this.setBoxCenterSize(this._center, this._size);
  }

  /**
   * init Box Shape and alloc PhysX objects.
   * @param index index mark Shape
   * @param extents size of Shape
   * @param material material of Collider
   * @param position position of Shape
   * @param rotation rotation of Shape
   * @remarks must call after this component add to Entity.
   */
  constructor(index: number, extents: Vector3, material: PhysicsMaterial, position: Vector3, rotation: Quaternion) {
    super();
    this.setCenter(position);
    this.setExtents(extents);
    // Todo: Support Rotation
    this._transform.setPosition(position.x, position.y, position.z);
    this._inverseWorldMatFlag = this._transform.registerWorldChangeFlag();
    this._id = index;
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: HitResult): boolean {
    const localRay = this._getLocalRay(ray);

    const boundingBox = BoxColliderShape._tempBox;
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
