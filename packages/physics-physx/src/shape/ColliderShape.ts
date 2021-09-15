import { IColliderShape } from "@oasis-engine/design";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PhysicsMaterial } from "../PhysicsMaterial";
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
export class ColliderShape implements IColliderShape {
  protected _position: Vector3 = new Vector3();
  protected _rotation: Quaternion = new Quaternion();

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
   * mark physx object
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

  constructor(position: Vector3, rotation: Quaternion) {
    position.cloneTo(this._position);
    Quaternion.rotateZ(rotation, Math.PI * 0.5, this._rotation);
  }

  /**
   * set local position
   * @param value the local position
   */
  setPosition(value: Vector3) {
    value.cloneTo(this._position);
    this._setLocalPose();
  }

  /**
   * set local rotation
   * @param value the local rotation
   */
  setRotation(value: Quaternion) {
    Quaternion.rotateZ(value, Math.PI * 0.5, this._rotation);
    this._setLocalPose();
  }

  /**
   * set physics material on shape
   * @param value the material
   */
  setMaterial(value: PhysicsMaterial) {
    this._pxShape.setMaterials([value._pxMaterial]);
  }

  /**
   * set physics shape marker
   * @param index the unique index
   */
  setID(index: number) {
    this._id = index;
    this._pxShape.setQueryFilterData(new PhysXPhysics.PhysX.PxFilterData(index, 0, 0, 0));
  }

  /**
   * set Trigger or not
   * @param value true for TriggerShape, false for SimulationShape
   */
  isTrigger(value: boolean) {
    this._modifyFlag(ShapeFlag.SIMULATION_SHAPE, !value);
    this._modifyFlag(ShapeFlag.TRIGGER_SHAPE, value);
    this.shapeFlags = this._shapeFlags;
  }

  /**
   * set Scene Query or not
   * @param value true for Query, false for not Query
   */
  isSceneQuery(value: boolean) {
    this._modifyFlag(ShapeFlag.SCENE_QUERY_SHAPE, value);
    this.shapeFlags = this._shapeFlags;
  }

  protected _setLocalPose(position: Vector3 = this._position, rotation: Quaternion = this._rotation) {
    this._position = position;
    this._rotation = rotation;
    const quat = this._rotation.normalize();
    const transform = {
      translation: {
        x: this._position.x,
        y: this._position.y,
        z: this._position.z
      },
      rotation: {
        w: quat.w,
        x: quat.x,
        y: quat.y,
        z: quat.z
      }
    };
    this._pxShape.setLocalPose(transform);
  }

  protected _allocShape(material: PhysicsMaterial) {
    this._pxShape = PhysXPhysics.physics.createShape(
      this._pxGeometry,
      material._pxMaterial,
      false,
      new PhysXPhysics.PhysX.PxShapeFlags(this._shapeFlags)
    );
  }

  private _modifyFlag(flag: ShapeFlag, value: boolean) {
    this._shapeFlags = value ? this._shapeFlags | flag : this._shapeFlags & ~flag;
  }
}
