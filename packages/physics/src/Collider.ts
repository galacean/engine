import { Component, Vector3 } from "oasis-engine";
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
export class Collider extends Component {
  protected _group_id: number = PhysXManager.physical_id++;

  protected _center: Vector3 = new Vector3();

  protected _shapeFlags: ShapeFlag = ShapeFlag.SCENE_QUERY_SHAPE | ShapeFlag.SIMULATION_SHAPE;

  protected _material: PhysicsMaterial = new PhysicsMaterial(0.1, 0.1, 0.1);

  /**
   * PhysX static actor object
   * @internal
   */
  _PxRigidStatic: any;

  /**
   * PhysX shape object
   * @internal
   */
  _pxShape: any;

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

  protected _allocActor() {
    const local_pos = this.entity.transform.position;
    const local_rot = this.entity.transform.rotationQuaternion;
    {
      const transform = {
        translation: {
          x: this._center.x + local_pos.x,
          y: this._center.y + local_pos.y,
          z: this._center.z + local_pos.z
        },
        rotation: {
          w: local_rot.w,
          x: local_rot.x,
          y: local_rot.y,
          z: local_rot.z
        }
      };
      this._PxRigidStatic = PhysXManager.physics.createRigidStatic(transform);
    }

    this._PxRigidStatic.attachShape(this._pxShape);
  }

  protected _setLocalPose() {
    {
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
}
