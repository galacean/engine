import {
  IPhysics,
  IPhysicsMaterial,
  IPhysicsManager,
  IBoxColliderShape,
  ISphereColliderShape,
  ICapsuleColliderShape,
  IDynamicCollider,
  IStaticCollider,
  IPlaneColliderShape
} from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
import { PhysXManager } from "./PhysXManager";
import { BoxColliderShape } from "./shape/BoxColliderShape";
import { SphereColliderShape } from "./shape/SphereColliderShape";
import { CapsuleColliderShape } from "./shape/CapsuleColliderShape";
import { DynamicCollider } from "./DynamicCollider";
import { StaticCollider } from "./StaticCollider";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { PlaneColliderShape } from "./shape/PlaneColliderShape";

/**
 * physics object creation.
 */
@StaticInterfaceImplement<IPhysics>()
export class PhysXPhysics {
  /**
   * Async initializer
   */
  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }

  /**
   * create physics manager
   * @param onContactBegin function called when contact begin
   * @param onContactEnd function called when contact end
   * @param onContactPersist function called when contact stay
   * @param onTriggerBegin function called when trigger begin
   * @param onTriggerEnd function called when trigger end
   * @param onTriggerPersist function called when trigger staty
   */
  static createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager {
    return new PhysXPhysicsManager(
      onContactBegin,
      onContactEnd,
      onContactPersist,
      onTriggerBegin,
      onTriggerEnd,
      onTriggerPersist
    );
  }

  /**
   * create dynamic collider
   * @param position the global position
   * @param rotation the global rotation
   */
  static createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new StaticCollider(position, rotation);
  }

  /**
   * create static collider
   * @param position the global position
   * @param rotation the global rotation
   */
  static createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new DynamicCollider(position, rotation);
  }

  /**
   * create physics material
   * @param staticFriction static friction
   * @param dynamicFriction dynamic friction
   * @param bounciness restitution
   * @param frictionCombine the mode to combine the friction of collider
   * @param bounceCombine the mode to combine the bounce of collider
   */
  static createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness, frictionCombine, bounceCombine);
  }

  /**
   * create box collider shape
   * @param index unique index to mark the shape
   * @param extents extents of the box
   * @param material the material of this shape
   * @param position the local position
   * @param rotation the local rotation
   */
  static createBoxColliderShape(
    index: number,
    extents: Vector3,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): IBoxColliderShape {
    return new BoxColliderShape(index, extents, material, position, rotation);
  }

  /**
   * create sphere collider shape
   * @param index unique index to mark the shape
   * @param radius radius of the sphere
   * @param material the material of this shape
   * @param position the local position
   * @param rotation the local rotation
   */
  static createSphereColliderShape(
    index: number,
    radius: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): ISphereColliderShape {
    return new SphereColliderShape(index, radius, material, position, rotation);
  }

  /**
   * create plane collider shape
   * @param index unique index to mark the shape
   * @param material the material of this shape
   * @param position the local position
   * @param rotation the local rotation
   */
  static createPlaneColliderShape(
    index: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): IPlaneColliderShape {
    return new PlaneColliderShape(index, material, position, rotation);
  }

  /**
   * create capsule collider shape
   * @param index unique index to mark the shape
   * @param radius radius of capsule
   * @param height height of capsule
   * @param material the material of this shape
   * @param position the local position
   * @param rotation the local rotation
   */
  static createCapsuleColliderShape(
    index: number,
    radius: number,
    height: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): ICapsuleColliderShape {
    return new CapsuleColliderShape(index, radius, height, material, position, rotation);
  }
}
