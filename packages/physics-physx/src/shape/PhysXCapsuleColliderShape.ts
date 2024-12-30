import { ICapsuleColliderShape } from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
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
    this._physXRotation.copyFrom(this._axis);

    this._pxGeometry = new physXPhysics._physX.PxCapsuleGeometry(this._radius, this._halfHeight);
    this._initialize(material, uniqueID);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setRadius }
   */
  setRadius(value: number): void {
    this._radius = value;
    const sizeScale = this._worldScale;
    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        this._pxGeometry.radius = this._radius * Math.max(sizeScale.y, sizeScale.z);
        break;
      case ColliderShapeUpAxis.Y:
        this._pxGeometry.radius = this._radius * Math.max(sizeScale.x, sizeScale.z);
        break;
      case ColliderShapeUpAxis.Z:
        this._pxGeometry.radius = this._radius * Math.max(sizeScale.x, sizeScale.y);
        break;
    }
    this._pxShape.setGeometry(this._pxGeometry);

    const radius = this._pxGeometry.radius;
    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._pxController?.setRadius(radius);
    }
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setHeight }
   */
  setHeight(value: number): void {
    this._halfHeight = value * 0.5;
    const sizeScale = this._worldScale;
    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        this._pxGeometry.halfHeight = this._halfHeight * sizeScale.x;
        break;
      case ColliderShapeUpAxis.Y:
        this._pxGeometry.halfHeight = this._halfHeight * sizeScale.y;
        break;
      case ColliderShapeUpAxis.Z:
        this._pxGeometry.halfHeight = this._halfHeight * sizeScale.z;
        break;
    }
    this._pxShape.setGeometry(this._pxGeometry);

    const height = this._pxGeometry.halfHeight * 2;
    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._pxController?.setHeight(height);
    }
  }

  /**
   * {@inheritDoc ICapsuleColliderShape.setUpAxis }
   */
  setUpAxis(upAxis: ColliderShapeUpAxis): void {
    const { _rotation: rotation, _axis: axis, _physXRotation: physXRotation } = this;

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
      Quaternion.rotationYawPitchRoll(rotation.y, rotation.x, rotation.z, physXRotation);
      Quaternion.multiply(physXRotation, axis, physXRotation);
    } else {
      physXRotation.copyFrom(axis);
    }
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  override setWorldScale(scale: Vector3): void {
    super.setWorldScale(scale);
    const sizeScale = this._worldScale;
    const geometry = this._pxGeometry;
    switch (this._upAxis) {
      case ColliderShapeUpAxis.X:
        geometry.radius = this._radius * Math.max(sizeScale.y, sizeScale.z);
        geometry.halfHeight = this._halfHeight * sizeScale.x;
        break;
      case ColliderShapeUpAxis.Y:
        geometry.radius = this._radius * Math.max(sizeScale.x, sizeScale.z);
        geometry.halfHeight = this._halfHeight * sizeScale.y;
        break;
      case ColliderShapeUpAxis.Z:
        geometry.radius = this._radius * Math.max(sizeScale.x, sizeScale.y);
        geometry.halfHeight = this._halfHeight * sizeScale.z;
        break;
    }
    this._pxShape.setGeometry(geometry);

    const radius = geometry.radius;
    const height = geometry.halfHeight * 2;
    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      const pxController = controllers.get(i)._pxController;
      if (pxController) {
        pxController.setRadius(radius);
        pxController.setHeight(height);
      }
    }
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
