import { Quaternion, Vector3 } from "@galacean/engine";
import { IColliderShape } from "@galacean/engine-design";
import { DisorderedArray } from "../DisorderedArray";
import { PhysXCharacterController } from "../PhysXCharacterController";
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
    rotation: null
  };

  /** @internal */
  _controllers: DisorderedArray<PhysXCharacterController> = new DisorderedArray<PhysXCharacterController>();

  protected _physXPhysics: PhysXPhysics;
  protected _worldScale: Vector3 = new Vector3(1, 1, 1);
  protected _position: Vector3 = new Vector3();
  protected _rotation: Vector3 = null;
  protected _axis: Quaternion = null;
  protected _physXRotation: Quaternion = new Quaternion();

  private _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

  /** @internal */
  _pxMaterial: any;
  /** @internal */
  _pxShape: any;
  /** @internal */
  _pxGeometry: any;
  /** @internal */
  _id: number;

  constructor(physXPhysics: PhysXPhysics) {
    this._physXPhysics = physXPhysics;
  }

  /**
   * {@inheritDoc IColliderShape.setRotation }
   */
  setRotation(value: Vector3): void {
    this._rotation = value;
    Quaternion.rotationYawPitchRoll(value.x, value.y, value.z, this._physXRotation);
    this._axis && Quaternion.multiply(this._physXRotation, this._axis, this._physXRotation);
    this._physXRotation.normalize();
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setPosition }
   */
  setPosition(value: Vector3): void {
    if (value !== this._position) {
      this._position.copyFrom(value);
    }
    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._updateShapePosition(this._position, this._worldScale);
    }

    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  setWorldScale(scale: Vector3): void {
    this._worldScale.copyFrom(scale);
    this._setLocalPose();

    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._updateShapePosition(this._position, this._worldScale);
    }
  }

  /**
   * {@inheritDoc IColliderShape.setContactOffset }
   * @default 0.02f * PxTolerancesScale::length
   */
  setContactOffset(offset: number): void {
    this._pxShape.setContactOffset(offset);

    const controllers = this._controllers;
    for (let i = 0, n = controllers.length; i < n; i++) {
      controllers.get(i)._pxController?.setContactOffset(offset);
    }
  }

  /**
   * {@inheritDoc IColliderShape.setMaterial }
   */
  setMaterial(value: PhysXPhysicsMaterial): void {
    this._pxMaterial = value._pxMaterial;
    this._pxShape.setMaterial(this._pxMaterial);
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
   * {@inheritDoc IColliderShape.destroy }
   */
  destroy(): void {
    this._pxShape.release();
  }

  /**
   *  @internal
   */
  _setShapeFlags(flags: ShapeFlag) {
    this._shapeFlags = flags;
    this._pxShape.setFlags(new this._physXPhysics._physX.PxShapeFlags(this._shapeFlags));
  }

  protected _setLocalPose(): void {
    const transform = PhysXColliderShape.transform;
    Vector3.multiply(this._position, this._worldScale, transform.translation);
    transform.rotation = this._physXRotation;
    this._pxShape.setLocalPose(transform);
  }

  protected _initialize(material: PhysXPhysicsMaterial, id: number): void {
    this._id = id;
    this._pxMaterial = material._pxMaterial;
    this._pxShape = this._physXPhysics._pxPhysics.createShape(
      this._pxGeometry,
      material._pxMaterial,
      true,
      new this._physXPhysics._physX.PxShapeFlags(this._shapeFlags)
    );
    this._pxShape.setUUID(id);
  }

  private _modifyFlag(flag: ShapeFlag, value: boolean): void {
    this._shapeFlags = value ? this._shapeFlags | flag : this._shapeFlags & ~flag;
  }
}
