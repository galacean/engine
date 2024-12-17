import { BoundingBox, Matrix, Quaternion, Ray, Vector3 } from "@galacean/engine";
import { IBoxColliderShape, IPointDistanceInfo } from "@galacean/engine-design";
import { LiteHitResult } from "../LiteHitResult";
import { LitePhysicsMaterial } from "../LitePhysicsMaterial";
import { LiteColliderShape } from "./LiteColliderShape";

/**
 * Box collider shape in Lite.
 */
export class LiteBoxColliderShape extends LiteColliderShape implements IBoxColliderShape {
  private static _tempBox: BoundingBox = new BoundingBox();
  private static _tempMatrix: Matrix = new Matrix();
  private static _tempInvMatrix: Matrix = new Matrix();
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
    this._sizeScale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
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
   * {@inheritDoc IColliderShape.pointDistance }
   */
  override pointDistance(position: Vector3, rotation: Quaternion, point: Vector3): IPointDistanceInfo {
    const { position: shapePosition } = this._transform;
    const m = LiteBoxColliderShape._tempMatrix;
    const invM = LiteBoxColliderShape._tempInvMatrix;
    const p = LiteColliderShape._tempPoint;

    const boundingBox = LiteBoxColliderShape._tempBox;
    const { _boxMin, _boxMax } = this;
    p.copyFrom(_boxMin);
    p.subtract(shapePosition);
    boundingBox.min.set(p.x, p.y, p.z);
    p.copyFrom(_boxMax);
    p.subtract(shapePosition);
    boundingBox.max.set(p.x, p.y, p.z);

    Matrix.affineTransformation(this._sizeScale, rotation, position, m);
    Matrix.invert(m, invM);
    Vector3.transformCoordinate(point, invM, p);

    const min = boundingBox.min;
    const max = boundingBox.max;
    p.x = Math.max(min.x, Math.min(p.x, max.x));
    p.y = Math.max(min.y, Math.min(p.y, max.y));
    p.z = Math.max(min.z, Math.min(p.z, max.z));
    Vector3.transformCoordinate(p, m, p);

    if (Vector3.equals(p, point)) {
      return {
        distance: 0,
        closestPoint: point
      };
    }

    return {
      distance: Vector3.distanceSquared(p, point),
      closestPoint: p
    };
  }

  /**
   * @internal
   */
  _raycast(ray: Ray, hit: LiteHitResult): boolean {
    const localRay = this._getLocalRay(ray);
    const sizeScale = this._sizeScale;
    const halfSize = this._halfSize;
    const boundingBox = LiteBoxColliderShape._tempBox;
    boundingBox.min.set(-halfSize.x * sizeScale.x, -halfSize.y * sizeScale.y, -halfSize.z * sizeScale.z);
    boundingBox.max.set(halfSize.x * sizeScale.x, halfSize.y * sizeScale.y, halfSize.z * sizeScale.z);
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
