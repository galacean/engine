import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { IPhysicsShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * Abstract base class for PhysX shapes.
 */
export abstract class PhysXShape implements IPhysicsShape {
  protected static readonly _yAxis = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
  protected static _tempVector4 = new Vector4();

  private static readonly _pose = {
    translation: new Vector3(),
    rotation: new Quaternion()
  };

  /** @internal */
  _pxShape: any;
  /** @internal */
  _id: number;

  protected _physXPhysics: PhysXPhysics;
  protected _pxGeometry: any;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc IPhysicsShape.setLocalPose }
   */
  setLocalPose(position: Vector3, rotation: Quaternion): void {
    this._setLocalPose(position, rotation);
  }

  /**
   * {@inheritDoc IPhysicsShape.setContactOffset }
   * @default 0.02f * PxTolerancesScale::length
   */
  setContactOffset(offset: number): void {
    // PhysX requires the contact offset to be greater than the zero rest offset.
    this._pxShape.setContactOffsets(Math.max(offset, 2 ** -126), 0);
  }

  /**
   * {@inheritDoc IPhysicsShape.setMaterial }
   */
  setMaterial(value: PhysXPhysicsMaterial): void {
    this._pxShape.setMaterial(value._pxMaterial);
  }

  /**
   * {@inheritDoc IPhysicsShape.setCollisionLayer }
   */
  setCollisionLayer(layer: number): void {
    this._pxShape.setGroup(layer);
  }

  /**
   * {@inheritDoc IPhysicsShape.setIsTrigger }
   */
  setIsTrigger(value: boolean): void {
    this._pxShape.setIsTrigger(value);
  }

  /**
   * {@inheritDoc IPhysicsShape.pointDistance }
   */
  pointDistance(point: Vector3): Vector4 {
    const info = this._pxGeometry.pointDistance(this._pxShape.getGlobalPose(), point);
    const closestPoint = info.closestPoint;
    const res = PhysXShape._tempVector4;
    res.set(closestPoint.x, closestPoint.y, closestPoint.z, info.distance);
    return res;
  }

  /**
   * {@inheritDoc IPhysicsShape.destroy }
   */
  destroy(): void {
    this._pxShape.release();
    this._pxGeometry.delete();
  }

  protected _setLocalPose(position: Vector3, rotation: Quaternion, axis?: Quaternion | null): void {
    const pose = PhysXShape._pose;
    const nativeRotation = pose.rotation;
    pose.translation.copyFrom(position);
    if (axis) {
      Quaternion.multiply(rotation, axis, nativeRotation);
    } else {
      nativeRotation.copyFrom(rotation);
    }
    nativeRotation.normalize();
    this._pxShape.setLocalPose(pose);
  }

  protected _initialize(material: PhysXPhysicsMaterial, id: number): void {
    const { _physX: physX, _pxPhysics: physics } = this._physXPhysics;
    const shapeFlags = new physX.PxShapeFlags(ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE);
    const shape = physics.createShape(this._pxGeometry, material._pxMaterial, true, shapeFlags);
    shapeFlags.delete();
    this._id = id;
    this._pxShape = shape;
    shape.setUUID(id);
  }
}

/**
 * Flags which affect the behavior of Shapes.
 */
const enum ShapeFlag {
  /** The shape will partake in collision in the physical simulation. */
  SIMULATION_SHAPE = 1 << 0,
  /** The shape will partake in scene queries (ray casts, overlap tests, sweeps, ...). */
  SCENE_QUERY_SHAPE = 1 << 1
}
