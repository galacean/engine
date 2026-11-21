import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { IColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * Flags which affect the behavior of Shapes.
 */
enum ShapeFlag {
  /** The shape will partake in collision in the physical simulation. */
  SIMULATION_SHAPE = 1 << 0,
  /** The shape will partake in scene queries (ray casts, overlap tests, sweeps, ...). */
  SCENE_QUERY_SHAPE = 1 << 1,
  /** The shape is a trigger which can send reports whenever other shapes enter/leave its volume. */
  TRIGGER_SHAPE = 1 << 2
}

/**
 * Abstract class for collider shapes.
 */
export abstract class PhysXColliderShape implements IColliderShape {
  protected static readonly _yAxis = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
  private static readonly _pose = {
    translation: new Vector3(),
    rotation: new Quaternion()
  };

  protected static _tempVector4 = new Vector4();

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
   * {@inheritDoc IColliderShape.setLocalPose }
   */
  setLocalPose(position: Vector3, rotation: Quaternion): void {
    this._setLocalPose(position, rotation);
  }

  /**
   * {@inheritDoc IColliderShape.setContactOffset }
   * @default 0.02f * PxTolerancesScale::length
   */
  setContactOffset(offset: number): void {
    this._pxShape.setContactOffsets(offset, 0);
  }

  /**
   * {@inheritDoc IColliderShape.setMaterial }
   */
  setMaterial(value: PhysXPhysicsMaterial): void {
    this._pxShape.setMaterial(value._pxMaterial);
  }

  /**
   * {@inheritDoc IColliderShape.setCollisionLayer }
   */
  setCollisionLayer(layer: number): void {
    this._pxShape.setGroup(layer);
  }

  /**
   * {@inheritDoc IColliderShape.setIsTrigger }
   */
  setIsTrigger(value: boolean): void {
    this._pxShape.setIsTrigger(value);
  }

  /**
   * {@inheritDoc IColliderShape.setIsSceneQuery }
   */
  setIsSceneQuery(value: boolean): void {
    this._pxShape.setSceneQueryEnabled(value);
  }

  /**
   * {@inheritDoc IColliderShape.pointDistance }
   */
  pointDistance(point: Vector3): Vector4 {
    const info = this._pxGeometry.pointDistance(this._pxShape.getGlobalPose(), point);
    const closestPoint = info.closestPoint;
    const res = PhysXColliderShape._tempVector4;
    res.set(closestPoint.x, closestPoint.y, closestPoint.z, info.distance);
    return res;
  }

  /**
   * {@inheritDoc IColliderShape.destroy }
   */
  destroy(): void {
    this._pxShape.release();
    this._pxGeometry?.delete();
  }

  protected _setLocalPose(position: Vector3, rotation: Quaternion, axis?: Quaternion | null): void {
    const pose = PhysXColliderShape._pose;
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
    this._id = id;
    this._pxShape = this._createShape(this._pxGeometry, material);
    this._pxShape.setUUID(id);
  }

  protected _createShape(geometry: any, material: PhysXPhysicsMaterial): any {
    const { _physX: physX, _pxPhysics: physics } = this._physXPhysics;
    const shapeFlags = new physX.PxShapeFlags(ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE);
    const shape = physics.createShape(geometry, material._pxMaterial, true, shapeFlags);
    shapeFlags.delete();
    return shape;
  }
}
