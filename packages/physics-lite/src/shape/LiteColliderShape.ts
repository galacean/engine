import { IColliderShape, IPhysicsMaterial } from "@oasis-engine/design";
import { Matrix, Quaternion, Ray, Vector3 } from "@oasis-engine/math";
import { HitResult } from "../HitResult";
import { Transform } from "../Transform";
import { LiteCollider } from "../LiteCollider";
import { UpdateFlag } from "../UpdateFlag";

/** Abstract class for collision shapes. */
export abstract class LiteColliderShape implements IColliderShape {
  private static _ray = new Ray();

  /** @internal */
  _id: number;
  /** @internal */
  _collider: LiteCollider;
  /** @internal */
  _transform: Transform = new Transform();

  /** @internal */
  _invModelMatrix: Matrix = new Matrix();
  /** @internal */
  _inverseWorldMatFlag: UpdateFlag;

  protected constructor() {
    this._transform.owner = this;
  }

  /**
   * {@inheritDoc IColliderShape.setPosition }
   */
  setPosition(position: Vector3): void {
    this._transform.setPosition(position.x, position.y, position.z);
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  abstract setWorldScale(scale: Vector3): void;

  /**
   * {@inheritDoc IColliderShape.setMaterial }
   */
  setMaterial(material: IPhysicsMaterial): void {
    throw "Not Support Material";
  }

  /**
   * {@inheritDoc IColliderShape.setUniqueID }
   */
  setUniqueID(id: number): void {
    this._id = id;
  }

  /**
   * {@inheritDoc IColliderShape.setIsTrigger }
   */
  setIsTrigger(value: boolean): void {
    throw "Not Support Trigger Flag";
  }

  /**
   * {@inheritDoc IColliderShape.setIsSceneQuery }
   */
  setIsSceneQuery(value: boolean): void {
    throw "Not Support Scene Query Flag";
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
  ): void {
    ray.getPoint(distance, outHit.point);
    if (!isWorldRay) {
      Vector3.transformCoordinate(outHit.point, this._transform.worldMatrix, outHit.point);
    }

    outHit.distance = Vector3.distance(origin, outHit.point);
    outHit.shapeID = this._id;
  }

  protected _getLocalRay(ray: Ray): Ray {
    const worldToLocal = this.getInvModelMatrix();
    const outRay = LiteColliderShape._ray;

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
