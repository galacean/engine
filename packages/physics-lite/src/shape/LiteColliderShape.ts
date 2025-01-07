import { MathUtil, Matrix, Quaternion, Ray, Vector3, Vector4 } from "@galacean/engine";
import { IColliderShape, IPhysicsMaterial } from "@galacean/engine-design";
import { LiteCollider } from "../LiteCollider";
import { LiteHitResult } from "../LiteHitResult";
import { LiteTransform } from "../LiteTransform";
import { LiteUpdateFlag } from "../LiteUpdateFlag";

/**
 * Abstract class for collider shapes.
 */
export abstract class LiteColliderShape implements IColliderShape {
  protected static _tempPos = new Vector3();
  protected static _tempRot = new Quaternion();
  protected static _tempScale = new Vector3();
  protected static _tempPoint = new Vector3();
  protected static _tempVector4 = new Vector4();

  private static _ray = new Ray();

  /** @internal */
  _id: number;
  /** @internal */
  _collider: LiteCollider;
  /** @internal */
  _position: Vector3 = new Vector3();
  /** @internal */
  _worldScale: Vector3 = new Vector3(1, 1, 1);
  /** @internal */
  _transform: LiteTransform = new LiteTransform();
  /** @internal */
  _invModelMatrix: Matrix = new Matrix();
  /** @internal */
  _inverseWorldMatFlag: LiteUpdateFlag;

  private _rotation: Vector3 = new Vector3();

  protected constructor() {
    this._transform.owner = this;
    this._inverseWorldMatFlag = this._transform.registerWorldChangeFlag();
  }

  /**
   * {@inheritDoc IColliderShape.setRotation }
   */
  setRotation(rotation: Vector3): void {
    const rotationInRadians = this._rotation.set(
      MathUtil.degreeToRadian(rotation.x),
      MathUtil.degreeToRadian(rotation.y),
      MathUtil.degreeToRadian(rotation.z)
    );
    Quaternion.rotationEuler(
      rotationInRadians.x,
      rotationInRadians.y,
      rotationInRadians.z,
      this._transform.rotationQuaternion
    );
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
    this._worldScale.copyFrom(scale);
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
   * {@inheritDoc IColliderShape.pointDistance }
   */
  abstract pointDistance(point: Vector3): Vector4;

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
    const shapePosition = LiteColliderShape._tempPoint;
    Vector3.multiply(this._position, this._worldScale, shapePosition);
    this._transform.position = shapePosition;
  }
}
