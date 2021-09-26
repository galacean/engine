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
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { StaticCollider } from "./StaticCollider";
import { PhysicsMaterial } from "./PhysicsMaterial";
import { BoxColliderShape } from "./shape/BoxColliderShape";
import { LitePhysicsManager } from "./LitePhysicsManager";
import { SphereColliderShape } from "./shape/SphereColliderShape";

@StaticInterfaceImplement<IPhysics>()
export class LitePhysics {
  static createPhysicsManager(
    onContactBegin?: Function,
    onContactEnd?: Function,
    onContactPersist?: Function,
    onTriggerBegin?: Function,
    onTriggerEnd?: Function,
    onTriggerPersist?: Function
  ): IPhysicsManager {
    return new LitePhysicsManager(
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
    throw "Not Implemented";
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

  static createPlaneColliderShape(
    index: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): IPlaneColliderShape {
    throw "Not Implemented";
  }

  static createCapsuleColliderShape(
    index: number,
    radius: number,
    height: number,
    material: PhysicsMaterial,
    position: Vector3,
    rotation: Quaternion
  ): ICapsuleColliderShape {
    throw "Not Implemented";
  }
}
