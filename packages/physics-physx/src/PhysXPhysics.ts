import {
  IPhysics,
  IPhysicsMaterial,
  IPlaneCollider,
  IPhysicsManager,
  IBoxColliderShape,
  ISphereColliderShape,
  ICapsuleColliderShape,
  IDynamicCollider,
  IStaticCollider
} from "@oasis-engine/design";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { PlaneCollider } from "./PlaneCollider";
import { PhysXPhysicsManager } from "./PhysXPhysicsManager";
import { PhysXManager } from "./PhysXManager";
import { BoxColliderShape } from "./shape/BoxColliderShape";
import { SphereColliderShape } from "./shape/SphereColliderShape";
import { CapsuleColliderShape } from "./shape/CapsuleColliderShape";
import { DynamicCollider } from "./DynamicCollider";
import { StaticCollider } from "./StaticCollider";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";
import { Quaternion, Vector3 } from "@oasis-engine/math";

@StaticInterfaceImplement<IPhysics>()
export class PhysXPhysics {
  static init(): Promise<void> {
    return new Promise((resolve) => {
      PhysXManager.init().then(() => {
        resolve();
      });
    });
  }

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

  static createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new StaticCollider(position, rotation);
  }

  static createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new DynamicCollider(position, rotation);
  }

  static createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial {
    return new PhysicsMaterial(staticFriction, dynamicFriction, bounciness, frictionCombine, bounceCombine);
  }

  static createBoxColliderShape(
    index: number,
    extents: Vector3,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): IBoxColliderShape {
    return new BoxColliderShape(index, extents, material, position, rotation);
  }

  static createSphereColliderShape(
    index: number,
    radius: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): ISphereColliderShape {
    return new SphereColliderShape(index, radius, material, position, rotation);
  }

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

  static createPlaneCollider(): IPlaneCollider {
    return new PlaneCollider();
  }
}
