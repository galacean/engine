import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  IDynamicCollider,
  IFixedJoint,
  IHingeJoint,
  IPhysics,
  IPhysicsManager,
  IPhysicsMaterial,
  IPlaneColliderShape,
  ISphereColliderShape,
  ISpringJoint,
  IStaticCollider
} from "@galacean/engine-design";
import { Quaternion, Vector3 } from "@galacean/engine";
import { LiteCollider } from "./LiteCollider";
import { LiteDynamicCollider } from "./LiteDynamicCollider";
import { LitePhysicsManager } from "./LitePhysicsManager";
import { LitePhysicsMaterial } from "./LitePhysicsMaterial";
import { LiteStaticCollider } from "./LiteStaticCollider";
import { LiteBoxColliderShape } from "./shape/LiteBoxColliderShape";
import { LiteSphereColliderShape } from "./shape/LiteSphereColliderShape";

export class LitePhysics implements IPhysics {
  /**
   * {@inheritDoc IPhysics.initialize }
   */
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsManager }
   */
  createPhysicsManager(
    onContactBegin?: (obj1: number, obj2: number) => void,
    onContactEnd?: (obj1: number, obj2: number) => void,
    onContactPersist?: (obj1: number, obj2: number) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerPersist?: (obj1: number, obj2: number) => void
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

  /**
   * {@inheritDoc IPhysics.createStaticCollider }
   */
  createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new LiteStaticCollider(position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createDynamicCollider }
   */
  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new LiteDynamicCollider(position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createCharacterController }
   */
  createCharacterController(): ICharacterController {
    throw "Physics-lite don't support createCharacterController. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsMaterial }
   */
  createPhysicsMaterial(
    staticFriction: number,
    dynamicFriction: number,
    bounciness: number,
    frictionCombine: number,
    bounceCombine: number
  ): IPhysicsMaterial {
    return new LitePhysicsMaterial(staticFriction, dynamicFriction, bounciness, frictionCombine, bounceCombine);
  }

  /**
   * {@inheritDoc IPhysics.createBoxColliderShape }
   */
  createBoxColliderShape(uniqueID: number, size: Vector3, material: LitePhysicsMaterial): IBoxColliderShape {
    return new LiteBoxColliderShape(uniqueID, size, material);
  }

  /**
   * {@inheritDoc IPhysics.createSphereColliderShape }
   */
  createSphereColliderShape(uniqueID: number, radius: number, material: LitePhysicsMaterial): ISphereColliderShape {
    return new LiteSphereColliderShape(uniqueID, radius, material);
  }

  /**
   * {@inheritDoc IPhysics.createPlaneColliderShape }
   */
  createPlaneColliderShape(uniqueID: number, material: LitePhysicsMaterial): IPlaneColliderShape {
    throw "Physics-lite don't support PlaneColliderShape. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createCapsuleColliderShape }
   */
  createCapsuleColliderShape(
    uniqueID: number,
    radius: number,
    height: number,
    material: LitePhysicsMaterial
  ): ICapsuleColliderShape {
    throw "Physics-lite don't support CapsuleColliderShape. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createFixedJoint }
   */
  createFixedJoint(collider: LiteCollider): IFixedJoint {
    throw "Physics-lite don't support CapsuleColliderShape. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createHingeJoint }
   */
  createHingeJoint(collider: LiteCollider): IHingeJoint {
    throw "Physics-lite don't support CapsuleColliderShape. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createSpringJoint }
   */
  createSpringJoint(collider: LiteCollider): ISpringJoint {
    throw "Physics-lite don't support CapsuleColliderShape. Use Physics-PhysX instead!";
  }
}
