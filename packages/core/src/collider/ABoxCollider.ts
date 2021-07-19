import { BoundingBox, Ray, Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { Collider } from "./Collider";
import { HitResult } from "../PhysicsManager";

/**
 * Axis Aligned Bound Box (AABB).
 * @extends Collider
 */
export class ABoxCollider extends Collider {
  /** @internal */
  _tepmBox: BoundingBox = new BoundingBox();

  private static _tempVec3: Vector3 = new Vector3();

  public boxMin: Vector3;
  public boxMax: Vector3;
  private _corners: Array<Vector3> = [];
  private _cornerFlag: boolean = false;

  /**
   * Constructor of ABoxCollider.
   * @param entity - Entity which the box belongs to
   */
  constructor(entity: Entity) {
    super(entity);
    this.boxMin = new Vector3(-0.5, -0.5, -0.5);
    this.boxMax = new Vector3(0.5, 0.5, 0.5);
  }

  /**
   * Set box from the minimum point of the box and the maximum point of the box.
   * @param min - The minimum point of the box
   * @param max - The maximum point of the box
   */
  setBoxMinMax(min: Vector3, max: Vector3) {
    this.boxMin = min;
    this.boxMax = max;

    this._cornerFlag = true;
  }

  /**
   * Set box from the center point and the size of the bounding box.
   * @param center - The center point
   * @param size - The size of the bounding box
   */
  setBoxCenterSize(center: Vector3, size: Vector3) {
    const halfSize = ABoxCollider._tempVec3;
    Vector3.scale(size, 0.5, halfSize);
    Vector3.add(center, halfSize, this.boxMax);
    Vector3.subtract(center, halfSize, this.boxMin);

    this._cornerFlag = true;
  }

  /**
   * Get the eight corners of this bounding box.
   */
  getCorners(): Vector3[] {
    if (this._cornerFlag) {
      const minX = this.boxMin.x;
      const minY = this.boxMin.y;
      const minZ = this.boxMin.z;
      const w = this.boxMax.x - minX;
      const h = this.boxMax.y - minY;
      const d = this.boxMax.z - minZ;

      if (this._corners.length === 0) {
        for (let i = 0; i < 8; ++i) {
          this._corners.push(new Vector3());
        }
      }

      this._corners[0].setValue(minX + w, minY + h, minZ + d);
      this._corners[1].setValue(minX, minY + h, minZ + d);
      this._corners[2].setValue(minX, minY, minZ + d);
      this._corners[3].setValue(minX + w, minY, minZ + d);
      this._corners[4].setValue(minX + w, minY + h, minZ);
      this._corners[5].setValue(minX, minY + h, minZ);
      this._corners[6].setValue(minX, minY, minZ);
      this._corners[7].setValue(minX + w, minY, minZ);

      this._cornerFlag = false;
    }

    return this._corners;
    // if (this._corners.length === 0) {
    //   const minX = this.boxMin.x;
    //   const minY = this.boxMin.y;
    //   const minZ = this.boxMin.z;
    //   const w = this.boxMax.x - minX;
    //   const h = this.boxMax.y - minY;
    //   const d = this.boxMax.z - minZ;

    //   this._corners = [
    //     new Vector3(minX + w, minY + h, minZ + d),
    //     new Vector3(minX, minY + h, minZ + d),
    //     new Vector3(minX, minY, minZ + d),
    //     new Vector3(minX + w, minY, minZ + d),
    //     new Vector3(minX + w, minY + h, minZ),
    //     new Vector3(minX, minY + h, minZ),
    //     new Vector3(minX, minY, minZ),
    //     new Vector3(minX + w, minY, minZ)
    //   ];
    // }

    // return this._corners;
  }

  _raycast(ray: Ray, hit: HitResult): boolean {
    const localRay = this._getLocalRay(ray);
    // TODO
    this.boxMin.cloneTo(this._tepmBox.min);
    this.boxMax.cloneTo(this._tepmBox.max);
    const intersect = localRay.intersectBox(this._tepmBox);
    if (intersect !== -1) {
      this._updateHitResult(localRay, intersect, hit, ray.origin);
      return true;
    } else {
      return false;
    } // end of else
  }
}
