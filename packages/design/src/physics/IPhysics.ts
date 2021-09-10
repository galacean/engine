import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPlaneCollider } from "./IPlaneCollider";
import { IPhysicsManager } from "./IPhysicsManager";
import { IBoxColliderShape, ISphereColliderShape, ICapsuleColliderShape } from "./shape";
import { IDynamicCollider } from "./IDynamicCollider";
import { IStaticCollider } from "./IStaticCollider";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * PhysXPhysics Engine Interface
 */
export interface IPhysics {
  createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager;

  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider;

  createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider;

  createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial;

  createBoxColliderShape(
    index: number,
    extents: Vector3,
    material: IPhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): IBoxColliderShape;

  createSphereColliderShape(
    index: number,
    radius: number,
    material: IPhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): ISphereColliderShape;

  createCapsuleColliderShape(
    index: number,
    radius: number,
    height: number,
    material: IPhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): ICapsuleColliderShape;

  createPlaneCollider(): IPlaneCollider;
}
