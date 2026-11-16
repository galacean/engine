import { ICapsuleColliderShape } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Capsule collider shape in PhysX.
 */
export class PhysXCapsuleColliderShape extends PhysXColliderShape implements ICapsuleColliderShape {
  private _radius: number;
  private _halfHeight: number;
  private _upAxis: ColliderShapeUpAxis = ColliderShapeUpAxis.Y;

  constructor(
    physXPhysics: PhysXPhysics,
    uniqueID: number,
    radius: number,
    height: number,
    material: PhysXPhysicsMaterial
  ) {
    super(physXPhysics);

    this._radius = radius;
    this._halfHeight = height * 0.5;
    this._axis = new Quaternion(0, 0, PhysXColliderShape.halfSqrt, PhysXColliderShape.halfSqrt);

    this._pxGeometry = new physXPhysics._physX.PxCapsuleGeometry(radius, this._halfHeight);
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setRadius }
   */
  setRadius(value: number): void {
    this._radius = value;
    this._updateGeometry();
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setHeight }
   */
  setHeight(value: number): void {
    this._halfHeight = value * 0.5;
    this._updateGeometry();
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setUpAxis }
   */
  setUpAxis(upAxis: ColliderShapeUpAxis): void {
    this._upAxis = upAxis;
    const axis = this._axis!;
    switch (upAxis) {
      case ColliderShapeUpAxis.X:
        axis.set(0, 0, 0, 1);
        break;
      case ColliderShapeUpAxis.Y:
        axis.set(0, 0, PhysXColliderShape.halfSqrt, PhysXColliderShape.halfSqrt);
        break;
      case ColliderShapeUpAxis.Z:
        axis.set(0, PhysXColliderShape.halfSqrt, 0, PhysXColliderShape.halfSqrt);
        break;
    }
    this._setLocalPose();
    this._updateGeometry();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    this._updateGeometry();
  }

  private _updateGeometry(): void {
    const scale = this._worldScale;
    const geometry = this._pxGeometry;
    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        geometry.radius = this._radius * Math.max(scale.y, scale.z);
        geometry.halfHeight = this._halfHeight * scale.x;
        break;
      case ColliderShapeUpAxis.Y:
        geometry.radius = this._radius * Math.max(scale.x, scale.z);
        geometry.halfHeight = this._halfHeight * scale.y;
        break;
      case ColliderShapeUpAxis.Z:
        geometry.radius = this._radius * Math.max(scale.x, scale.y);
        geometry.halfHeight = this._halfHeight * scale.z;
        break;
    }
    this._pxShape.setGeometry(geometry);
  }
}

/**
 * The up axis of the collider shape.
 */
export enum ColliderShapeUpAxis {
  /** Up axis is X. */
  X,
  /** Up axis is Y. */
  Y,
  /** Up axis is Z. */
  Z
}
