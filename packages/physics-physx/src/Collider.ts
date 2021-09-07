import { Component, Quaternion, Vector3 } from "oasis-engine";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { PhysXManager } from "./PhysXManager";

/** Flags which affect the behavior of Shapes. */
export enum ShapeFlag {
  /** The shape will partake in collision in the physical simulation. */
  SIMULATION_SHAPE = 1 << 0,
  /** The shape will partake in scene queries (ray casts, overlap tests, sweeps, ...). */
  SCENE_QUERY_SHAPE = 1 << 1,
  /** The shape is a trigger which can send reports whenever other shapes enter/leave its volume. */
  TRIGGER_SHAPE = 1 << 2
}

/** A base class of all colliders. */
export class Collider {
  protected _position: Vector3;
  protected _rotation: Quaternion;

  protected _group_id: number = PhysXManager.physical_id++;

  protected _center: Vector3 = new Vector3();

  protected _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

  protected _material: PhysicsMaterial = new PhysicsMaterial(0.1, 0.1, 0.1);

  /**
   * PhysX static actor object
   * @internal
   */
  _pxRigidStatic: any;

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

  get center(): Vector3 {
    return this._center;
  }

  set center(value: Vector3) {
    this._center = value;
    this._setLocalPose();
  }

  get material(): PhysicsMaterial {
    return this._material;
  }

  set material(value: PhysicsMaterial) {
    this._material = value;
    this._pxShape.setMaterials([this.material._pxMaterial]);
  }

  get group_id(): number {
    return this._group_id;
  }

  set isTrigger(value: boolean) {
    this._pxShape.setFlag(PhysXManager.PhysX.PxShapeFlag.eSIMULATION_SHAPE, !value);
  }

  setFlag(flag: ShapeFlag, value: boolean) {
    this._shapeFlags = value ? this._shapeFlags | flag : this._shapeFlags & ~flag;
    this._pxShape.setFlag(flag, value);
  }

  //----------------------------------------------------------------------------
  protected _allocShape() {
    this._pxShape = PhysXManager.physics.createShape(
      this._pxGeometry,
      this._material._pxMaterial,
      false,
      new PhysXManager.PhysX.PxShapeFlags(this._shapeFlags)
    );
  }

  protected _allocActor() {
    const quat = this._rotation.normalize();
    const transform = {
      translation: {
        x: this._position.x,
        y: this._position.y,
        z: this._position.z
      },
      rotation: {
        w: quat.w, // PHYSX uses WXYZ quaternions,
        x: quat.x,
        y: quat.y,
        z: quat.z
      }
    };
    this._pxRigidStatic = PhysXManager.physics.createRigidStatic(transform);
    this._pxRigidStatic.attachShape(this._pxShape);
  }

  protected _setLocalPose() {
    const transform = {
      translation: {
        x: this._center.x,
        y: this._center.y,
        z: this._center.z
      },
      rotation: {
        w: 1,
        x: 0,
        y: 0,
        z: 0
      }
    };
    this._pxShape.setLocalPose(transform);
  }
}
