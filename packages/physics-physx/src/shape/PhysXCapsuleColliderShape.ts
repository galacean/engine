import { ICapsuleColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXColliderShape } from "./PhysXColliderShape";

/**
 * Capsule collider shape in PhysX.
 */
export class PhysXCapsuleColliderShape extends PhysXColliderShape implements ICapsuleColliderShape {
  /** @internal */
  _radius: number;
  /** @internal */
  _halfHeight: number;
  private _upAxis: ColliderShapeUpAxis = ColliderShapeUpAxis.Y;

  /**
   * Init PhysXCollider and alloc PhysX objects.
   * @param uniqueID - UniqueID mark collider
   * @param radius - Radius of CapsuleCollider
   * @param height - Height of CapsuleCollider
   * @param material - Material of PhysXCollider
   */
  constructor(uniqueID: number, radius: number, height: number, material: PhysXPhysicsMaterial) {
    super();

    this._radius = radius;
    this._halfHeight = height * 0.5;
    this._axis = new Quaternion(0, 0, PhysXColliderShape.halfSqrt, PhysXColliderShape.halfSqrt);
    this._physxRotation.copyFrom(this._axis);

    this._pxGeometry = new PhysXPhysics._physX.PxCapsuleGeometry(this._radius, this._halfHeight);
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setRadius }
   */
  setRadius(value: number): void {
    this._radius = value;
    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        this._pxGeometry.radius = this._radius * Math.max(this._scale.y, this._scale.z);
        break;
      case ColliderShapeUpAxis.Y:
        this._pxGeometry.radius = this._radius * Math.max(this._scale.x, this._scale.z);
        break;
      case ColliderShapeUpAxis.Z:
        this._pxGeometry.radius = this._radius * Math.max(this._scale.x, this._scale.y);
        break;
    }
    this._pxShape.setGeometry(this._pxGeometry);

    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._pxController.setRadius(value);
    }
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setHeight }
   */
  setHeight(value: number): void {
    this._halfHeight = value * 0.5;
    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        this._pxGeometry.halfHeight = this._halfHeight * this._scale.x;
        break;
      case ColliderShapeUpAxis.Y:
        this._pxGeometry.halfHeight = this._halfHeight * this._scale.y;
        break;
      case ColliderShapeUpAxis.Z:
        this._pxGeometry.halfHeight = this._halfHeight * this._scale.z;
        break;
    }
    this._pxShape.setGeometry(this._pxGeometry);

    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._pxController.setHeight(value);
    }
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setUpAxis }
   */
  setUpAxis(upAxis: ColliderShapeUpAxis): void {
    const { _rotation: rotation, _axis: axis, _physxRotation: physxRotation } = this;

    this._upAxis = upAxis;
    switch (this._upAxis) {
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
    if (rotation) {
      Quaternion.rotationYawPitchRoll(rotation.x, rotation.y, rotation.z, physxRotation);
      Quaternion.multiply(physxRotation, axis, physxRotation);
    } else {
      physxRotation.copyFrom(axis);
    }
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    this._scale.copyFrom(scale);
    this._setLocalPose();

    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        this._pxGeometry.radius = this._radius * Math.max(scale.y, scale.z);
        this._pxGeometry.halfHeight = this._halfHeight * scale.x;
        break;
      case ColliderShapeUpAxis.Y:
        this._pxGeometry.radius = this._radius * Math.max(scale.x, scale.z);
        this._pxGeometry.halfHeight = this._halfHeight * scale.y;
        break;
      case ColliderShapeUpAxis.Z:
        this._pxGeometry.radius = this._radius * Math.max(scale.x, scale.y);
        this._pxGeometry.halfHeight = this._halfHeight * scale.z;
        break;
    }
    this._pxShape.setGeometry(this._pxGeometry);
  }
}

/**
 * The up axis of the collider shape.
 */
enum ColliderShapeUpAxis {
  /** Up axis is X. */
  X,
  /** Up axis is Y. */
  Y,
  /** Up axis is Z. */
  Z
}
