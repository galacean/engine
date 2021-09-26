import { IColliderShape, IPhysicsMaterial } from "@oasis-engine/design";
import { Matrix, Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "../HitResult";
import { Transform } from "../Transform";
import { Collider } from "../Collider";
import { UpdateFlag } from "../UpdateFlag";

/** Abstract class for collision shapes. */
export abstract class ColliderShape implements IColliderShape {
  private static _ray = new Ray();

  /** @internal */
  _id: number;
  /** @internal */
  _invModelMatrix: Matrix = new Matrix();
  /** @internal */
  _inverseWorldMatFlag: UpdateFlag;
  /** @internal */
  _parent: Collider;
  /** @internal */
  _transform: Transform = new Transform();

  /** local position */
  setPosition(position: Vector3): void {
    this._transform.setPosition(position.x, position.y, position.z);
  }

  /** local rotation */
  setRotation(rotation: Quaternion): void {
    this._transform.setRotationQuaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  }

  /** physics material on shape */
  setMaterial(material: IPhysicsMaterial): void {
    // TODO: Support Material
  }

  /** physics shape marker */
  setID(id: number): void {
    this._id = id;
  }

  /** Set Trigger or not */
  isTrigger(value: boolean) {
    // TODO: Support Trigger Flag
  }

  /** Set Scene Query or not */
  isSceneQuery(value: boolean) {
    // TODO: Support Scene Query Flag
  }

  getInvModelMatrix(): Matrix {
    if (this._inverseWorldMatFlag.flag) {
      Matrix.invert(this._transform.worldMatrix, this._invModelMatrix);
      this._inverseWorldMatFlag.flag = false;
    }
    return this._invModelMatrix;
  }

  protected _updateHitResult(
    ray: Ray,
    distance: number,
    outHit: HitResult,
    origin: Vector3,
    isWorldRay: boolean = false
  ) {
    ray.getPoint(distance, outHit.point);
    if (!isWorldRay) {
      Vector3.transformCoordinate(outHit.point, this._transform.worldMatrix, outHit.point);
    }

    outHit.distance = Vector3.distance(origin, outHit.point);
    outHit.shapeID = this._id;
  }

  protected _getLocalRay(ray: Ray): Ray {
    const worldToLocal = this.getInvModelMatrix();
    const outRay = ColliderShape._ray;

    Vector3.transformCoordinate(ray.origin, worldToLocal, outRay.origin);
    Vector3.transformNormal(ray.direction, worldToLocal, outRay.direction);
    outRay.direction.normalize();

    return outRay;
  }

  /**
   * @internal
   */
  abstract _raycast(ray: Ray, hit: HitResult): boolean;
}
