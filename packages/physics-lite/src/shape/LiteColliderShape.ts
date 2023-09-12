import { IColliderShape, IPhysicsMaterial } from "@galacean/engine-design";
import { Matrix, Ray, Vector3 } from "@galacean/engine";
import { LiteCollider } from "../LiteCollider";
import { LiteHitResult } from "../LiteHitResult";
import { LiteTransform } from "../LiteTransform";
import { LiteUpdateFlag } from "../LiteUpdateFlag";

/**
 * Abstract class for collider shapes.
 */
export abstract class LiteColliderShape implements IColliderShape {
  private static _ray = new Ray();
  private static _tempPoint = new Vector3();

  /** @internal */
  _id: number;
  /** @internal */
  _collider: LiteCollider;
  /** @internal */
  _position: Vector3 = new Vector3();
  /** @internal */
  _scale: Vector3 = new Vector3(1, 1, 1);
  /** @internal */
  _transform: LiteTransform = new LiteTransform();
  /** @internal */
  _invModelMatrix: Matrix = new Matrix();
  /** @internal */
  _inverseWorldMatFlag: LiteUpdateFlag;

  protected constructor() {
    this._transform.owner = this;
    this._inverseWorldMatFlag = this._transform.registerWorldChangeFlag();
  }

  /**
   * {@inheritDoc IColliderShape.setRotation }
   */
  setRotation(rotation: Vector3): void {
    console.log("Physics-lite don't support setRotation. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IColliderShape.setPosition }
   */
  setPosition(position: Vector3): void {
    if (position !== this._position) {
      this._position.copyFrom(position);
    }
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    if (scale !== this._scale) {
      this._scale.copyFrom(scale);
      this._transform.scale.copyFrom(scale);
    }
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setContactOffset }
   */
  setContactOffset(offset: number): void {
    console.log("Physics-lite don't support setContactOffset. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IColliderShape.setMaterial }
   */
  setMaterial(material: IPhysicsMaterial): void {
    console.log("Physics-lite don't support setMaterial. Use Physics-PhysX instead!");
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
    console.log("Physics-lite don't support setIsTrigger. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IColliderShape.destroy }
   */
  destroy(): void {}

  /**
   * @internal
   */
  abstract _raycast(ray: Ray, hit: LiteHitResult): boolean;

  protected _updateHitResult(
    ray: Ray,
    rayDistance: number,
    outHit: LiteHitResult,
    origin: Vector3,
    isWorldRay: boolean = false
  ): void {
    const hitPoint = LiteColliderShape._tempPoint;
    ray.getPoint(rayDistance, hitPoint);
    if (!isWorldRay) {
      Vector3.transformCoordinate(hitPoint, this._transform.worldMatrix, hitPoint);
    }

    const distance = Vector3.distance(origin, hitPoint);

    if (distance < outHit.distance) {
      outHit.point.copyFrom(hitPoint);
      outHit.distance = distance;
      outHit.shapeID = this._id;
    }
  }

  protected _getLocalRay(ray: Ray): Ray {
    const worldToLocal = this._getInvModelMatrix();
    const outRay = LiteColliderShape._ray;

    Vector3.transformCoordinate(ray.origin, worldToLocal, outRay.origin);
    Vector3.transformNormal(ray.direction, worldToLocal, outRay.direction);
    outRay.direction.normalize();

    return outRay;
  }

  private _getInvModelMatrix(): Matrix {
    if (this._inverseWorldMatFlag.flag) {
      Matrix.invert(this._transform.worldMatrix, this._invModelMatrix);
      this._inverseWorldMatFlag.flag = false;
    }
    return this._invModelMatrix;
  }

  private _setLocalPose() {
    const temp = LiteColliderShape._tempPoint;

    Vector3.multiply(this._position, this._scale, temp);
    this._transform.position = temp;
  }
}
