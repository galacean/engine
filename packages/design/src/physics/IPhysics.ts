import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPhysicsManager } from "./IPhysicsManager";
import { IBoxColliderShape, ISphereColliderShape, ICapsuleColliderShape, IPlaneColliderShape } from "./shape";
import { IDynamicCollider } from "./IDynamicCollider";
import { IStaticCollider } from "./IStaticCollider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * The interface of physics creation.
 */
export interface IPhysics {
  /**
   * Create physics manager.
   * @param onContactBegin - Function called when contact begin
   * @param onContactEnd - Function called when contact end
   * @param onContactPersist - Function called when contact stay
   * @param onTriggerBegin - Function called when trigger begin
   * @param onTriggerEnd - Function called when trigger end
   * @param onTriggerPersist - Function called when trigger stay
   */
  createPhysicsManager(
    onContactBegin?: (obj1: number, obj2: number) => void,
    onContactEnd?: (obj1: number, obj2: number) => void,
    onContactPersist?: (obj1: number, obj2: number) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerPersist?: (obj1: number, obj2: number) => void
  ): IPhysicsManager;

  /**
   * Create dynamic collider.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider;

  /**
   * Create static collider.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider;

  /**
   * Create physics material.
   * @param staticFriction - Static friction
   * @param dynamicFriction - Dynamic friction
   * @param bounciness - Restitution
   * @param frictionCombine - The mode to combine the friction of collider
   * @param bounceCombine - The mode to combine the bounce of collider
   */
  createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial;

  /**
   * Create box collider shape.
   * @param index - Unique index to mark the shape
   * @param extents - Extents of the box
   * @param material - The material of this shape
   */
  createBoxColliderShape(index: number, extents: Vector3, material: IPhysicsMaterial): IBoxColliderShape;

  /**
   * Create sphere collider shape.
   * @param index - Unique index to mark the shape
   * @param radius - Radius of the sphere
   * @param material - The material of this shape
   */
  createSphereColliderShape(index: number, radius: number, material: IPhysicsMaterial): ISphereColliderShape;

  /**
   * Create plane collider shape.
   * @param index - Unique index to mark the shape
   * @param material - The material of this shape
   */
  createPlaneColliderShape(index: number, material: IPhysicsMaterial): IPlaneColliderShape;

  /**
   * Create capsule collider shape.
   * @param index - Unique index to mark the shape
   * @param radius - Radius of capsule
   * @param height - Height of capsule
   * @param material - The material of this shape
   */
  createCapsuleColliderShape(
    index: number,
    radius: number,
    height: number,
    material: IPhysicsMaterial
  ): ICapsuleColliderShape;
}
