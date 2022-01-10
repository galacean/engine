import { IColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "oasis-engine";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXPhysics } from "../PhysXPhysics";

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
    translation: null,
    rotation: null
  };
  protected _position: Vector3 = new Vector3();
  protected _rotation: Quaternion = new Quaternion(0, 0, PhysXColliderShape.halfSqrt, PhysXColliderShape.halfSqrt);
  protected _scale: Vector3 = new Vector3(1, 1, 1);

  private _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;
  private _pxMaterials: any[] = new Array(1);

  /** @internal */
  _pxShape: any;
  /** @internal */
  _pxGeometry: any;
  /** @internal */
  _id: number;

  /**
   * {@inheritDoc IColliderShape.setPosition }
   */
  setPosition(value: Vector3): void {
    value.cloneTo(this._position);
    this._setLocalPose();
  }

  /**
   * {@inheritDoc IColliderShape.setWorldScale }
   */
  abstract setWorldScale(scale: Vector3): void;

  /**
   * {@inheritDoc IColliderShape.setMaterial }
   */
  setMaterial(value: PhysXPhysicsMaterial): void {
    this._pxMaterials[0] = value._pxMaterial;
    this._pxShape.setMaterials(this._pxMaterials);
  }

  /**
   * {@inheritDoc IColliderShape.setUniqueID }
   */
  setUniqueID(index: number): void {
    this._id = index;
    this._pxShape.setQueryFilterData(new PhysXPhysics._physX.PxFilterData(index, 0, 0, 0));
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
    this._modifyFlag(ShapeFlag.SCENE_QUERY_SHAPE, value);
    this._setShapeFlags(this._shapeFlags);
  }

  /**
   *  @internal
   */
  _setShapeFlags(flags: ShapeFlag) {
    this._shapeFlags = flags;
    this._pxShape.setFlags(new PhysXPhysics._physX.PxShapeFlags(this._shapeFlags));
  }

  protected _setLocalPose(): void {
    const transform = PhysXColliderShape.transform;
    transform.translation = this._position;
    transform.rotation = this._rotation;
    this._pxShape.setLocalPose(PhysXColliderShape.transform);
  }

  protected _allocShape(material: PhysXPhysicsMaterial): void {
    this._pxShape = PhysXPhysics._pxPhysics.createShape(
      this._pxGeometry,
      material._pxMaterial,
      false,
      new PhysXPhysics._physX.PxShapeFlags(this._shapeFlags)
    );
  }

  private _modifyFlag(flag: ShapeFlag, value: boolean): void {
    this._shapeFlags = value ? this._shapeFlags | flag : this._shapeFlags & ~flag;
  }
}
