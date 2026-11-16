import { Quaternion, Vector3, Vector4 } from "@galacean/engine";
import { IColliderShape } from "@galacean/engine-design";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";

/**
 * Flags which affect the behavior of Shapes.
 */
export enum ShapeFlag {
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
  static readonly halfSqrt: number = 0.70710678118655;
  static transform = {
    translation: new Vector3(),
    rotation: null as Quaternion | null
  };

  protected static _tempVector4 = new Vector4();
  private static _tempRotation = new Quaternion();

  /** @internal */
  _worldScale: Vector3 = new Vector3(1, 1, 1);
  /** @internal */
  _pxMaterial: any;
  /** @internal */
  _pxShape: any;
  /** @internal */
  _id: number;

  protected _physXPhysics: PhysXPhysics;
  protected _pxGeometry: any;
  /** Rotation from the shape's logical up axis to the PhysX geometry axis, applied after the local rotation. */
  protected _axis: Quaternion | null = null;
  protected _localPosition: Vector3 = new Vector3();
  protected _localRotation: Quaternion = new Quaternion();

  private _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc IColliderShape.setLocalPose }
   */
  setLocalPose(position: Vector3, rotation: Quaternion): void {
    this._localPosition.copyFrom(position);
    this._localRotation.copyFrom(rotation);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    this._worldScale.set(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
  }

  /**
   * {@inheritDoc IColliderShape.setContactOffset }
   * @default 0.02f * PxTolerancesScale::length
   */
  setContactOffset(offset: number): void {
    this._pxShape.setContactOffset(offset);
  }

  /**
   * {@inheritDoc IColliderShape.setMaterial }
   */
  setMaterial(value: PhysXPhysicsMaterial): void {
    this._pxMaterial = value._pxMaterial;
    this._pxShape.setMaterial(this._pxMaterial);
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
    this._modifyFlag(ShapeFlag.SIMULATION_SHAPE, !value);
    this._modifyFlag(ShapeFlag.TRIGGER_SHAPE, value);
    this._setShapeFlags(this._shapeFlags);
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

  /**
   *  @internal
   */
  _setShapeFlags(flags: ShapeFlag) {
    this._shapeFlags = flags;
    const shapeFlags = new this._physXPhysics._physX.PxShapeFlags(this._shapeFlags);
    this._pxShape.setFlags(shapeFlags);
    shapeFlags.delete();
  }

  protected _setLocalPose(): void {
    const transform = PhysXColliderShape.transform;
    const rotation = PhysXColliderShape._tempRotation;
    transform.translation.copyFrom(this._localPosition);
    if (this._axis) {
      Quaternion.multiply(this._localRotation, this._axis, rotation);
    } else {
      rotation.copyFrom(this._localRotation);
    }
    transform.rotation = rotation.normalize();
    this._pxShape.setLocalPose(transform);
  }

  protected _initialize(material: PhysXPhysicsMaterial, id: number): void {
    this._id = id;
    this._pxMaterial = material._pxMaterial;
    const shapeFlags = new this._physXPhysics._physX.PxShapeFlags(this._shapeFlags);
    this._pxShape = this._physXPhysics._pxPhysics.createShape(this._pxGeometry, this._pxMaterial, true, shapeFlags);
    shapeFlags.delete();
    this._pxShape.setUUID(id);
  }

  private _modifyFlag(flag: ShapeFlag, value: boolean): void {
    this._shapeFlags = value ? this._shapeFlags | flag : this._shapeFlags & ~flag;
  }
}
