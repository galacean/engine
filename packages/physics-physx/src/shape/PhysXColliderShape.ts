import { IColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysXPhysicsMaterial } from "../PhysXPhysicsMaterial";
import { PhysXPhysics } from "../PhysXPhysics";

/** Flags which affect the behavior of Shapes. */
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
export class PhysXColliderShape implements IColliderShape {
  static transform = {
    translation: { x: 0, y: 0, z: 0 },
    rotation: { w: Math.sqrt(2) * 0.5, x: 0, y: 0, z: Math.sqrt(2) * 0.5 }
  };

  protected _position: Vector3 = new Vector3();
  protected _rotation: Quaternion = new Quaternion(Math.sqrt(2) * 0.5, 0, 0, Math.sqrt(2) * 0.5);

  private _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

  /**
   * PhysX shape object
   * @internal
   */
  _pxShape: any;

  /**
   * PhysX geometry object
   * @internal
   */
  _pxGeometry: any;

  /**
   * Index mark physx object
   * @internal
   */
  _id: number;

  /**
   *  Shape Flags
   *  @internal
   */
  get shapeFlags(): ShapeFlag {
    return this._shapeFlags;
  }

  set shapeFlags(flags: ShapeFlag) {
    this._shapeFlags = flags;
    this._pxShape.setFlags(new PhysXPhysics.PhysX.PxShapeFlags(this._shapeFlags));
  }

  /**
   * Set local position
   * @param value the local position
   */
  setPosition(value: Vector3): void {
    value.cloneTo(this._position);
    const { translation } = PhysXColliderShape.transform;
    translation.x = this._position.x;
    translation.y = this._position.y;
    translation.z = this._position.z;

    this._setLocalPose();
  }

  /**
   * Set local rotation
   * @param value the local rotation
   */
  setRotation(value: Vector3): void {
    Quaternion.rotationYawPitchRoll(value.x, value.y, value.z, this._rotation);
    Quaternion.rotateZ(this._rotation, Math.PI * 0.5, this._rotation);
    this._rotation.normalize();
    const { rotation } = PhysXColliderShape.transform;
    rotation.x = this._rotation.x;
    rotation.y = this._rotation.y;
    rotation.z = this._rotation.z;
    rotation.w = this._rotation.w;

    this._setLocalPose();
  }

  /**
   * Set physics material on shape
   * @param value the material
   */
  setMaterial(value: PhysXPhysicsMaterial): void {
    this._pxShape.setMaterials([value._pxMaterial]);
  }

  /**
   * Set physics shape marker
   * @param index the unique index
   */
  setID(index: number): void {
    this._id = index;
    this._pxShape.setQueryFilterData(new PhysXPhysics.PhysX.PxFilterData(index, 0, 0, 0));
  }

  /**
   * Set Trigger or not
   * @param value true for TriggerShape, false for SimulationShape
   */
  isTrigger(value: boolean): void {
    this._modifyFlag(ShapeFlag.SIMULATION_SHAPE, !value);
    this._modifyFlag(ShapeFlag.TRIGGER_SHAPE, value);
    this.shapeFlags = this._shapeFlags;
  }

  /**
   * Set Scene Query or not
   * @param value true for Query, false for not Query
   */
  isSceneQuery(value: boolean): void {
    this._modifyFlag(ShapeFlag.SCENE_QUERY_SHAPE, value);
    this.shapeFlags = this._shapeFlags;
  }

  protected _setLocalPose() {
    this._pxShape.setLocalPose(PhysXColliderShape.transform);
  }

  protected _allocShape(material: PhysXPhysicsMaterial): void {
    this._pxShape = PhysXPhysics.physics.createShape(
      this._pxGeometry,
      material._pxMaterial,
      false,
      new PhysXPhysics.PhysX.PxShapeFlags(this._shapeFlags)
    );
  }

  private _modifyFlag(flag: ShapeFlag, value: boolean): void {
    this._shapeFlags = value ? this._shapeFlags | flag : this._shapeFlags & ~flag;
  }
}
