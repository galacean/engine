import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPhysicsManager } from "./IPhysicsManager";
import { IBoxColliderShape, ISphereColliderShape, ICapsuleColliderShape, IPlaneColliderShape } from "./shape";
import { IDynamicCollider } from "./IDynamicCollider";
import { IStaticCollider } from "./IStaticCollider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * the interface of physics creation.
 */
export interface IPhysics {
  /**
   * create physics manager
   * @param onContactBegin function called when contact begin
   * @param onContactEnd function called when contact end
   * @param onContactPersist function called when contact stay
   * @param onTriggerBegin function called when trigger begin
   * @param onTriggerEnd function called when trigger end
   * @param onTriggerPersist function called when trigger staty
   */
  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager;

  /**
   * create dynamic collider
   * @param position the global position
   * @param rotation the global rotation
   */
  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider;

  /**
   * create static collider
   * @param position the global position
   * @param rotation the global rotation
   */
  createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider;

  /**
   * create physics material
   * @param staticFriction static friction
   * @param dynamicFriction dynamic friction
   * @param bounciness restitution
   * @param frictionCombine the mode to combine the friction of collider
   * @param bounceCombine the mode to combine the bounce of collider
   */
  createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial;

  /**
   * create box collider shape
   * @param index unique index to mark the shape
   * @param extents extents of the box
   * @param material the material of this shape
   */
  createBoxColliderShape(index: number, extents: Vector3, material: IPhysicsMaterial): IBoxColliderShape;

  /**
   * create sphere collider shape
   * @param index unique index to mark the shape
   * @param radius radius of the sphere
   * @param material the material of this shape
   */
  createSphereColliderShape(index: number, radius: number, material: IPhysicsMaterial): ISphereColliderShape;

  /**
   * create plane collider shape
   * @param index unique index to mark the shape
   * @param material the material of this shape
   */
  createPlaneColliderShape(index: number, material: IPhysicsMaterial): IPlaneColliderShape;

  /**
   * create capsule collider shape
   * @param index unique index to mark the shape
   * @param radius radius of capsule
   * @param height height of capsule
   * @param material the material of this shape
   */
  createCapsuleColliderShape(
    index: number,
    radius: number,
    height: number,
    material: IPhysicsMaterial
  ): ICapsuleColliderShape;
}
