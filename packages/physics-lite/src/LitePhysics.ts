import {
  IPhysics,
  IPhysicsMaterial,
  IPhysicsManager,
  IBoxColliderShape,
  ISphereColliderShape,
  ICapsuleColliderShape,
  IDynamicCollider,
  IStaticCollider,
  IPlaneColliderShape,
  ICapsuleCharacterControllerDesc,
  ICollider,
  IConfigurableJoint,
  IFixedJoint,
  IHingeJoint,
  IPhysicsCapsuleObstacle,
  ISphericalJoint,
  ISpringJoint,
  ITranslationalJoint
} from "@oasis-engine/design";
import { StaticInterfaceImplement } from "./StaticInterfaceImplement";
import { Quaternion, Vector3 } from "oasis-engine";
import { LiteStaticCollider } from "./LiteStaticCollider";
import { LitePhysicsMaterial } from "./LitePhysicsMaterial";
import { LiteBoxColliderShape } from "./shape/LiteBoxColliderShape";
import { LitePhysicsManager } from "./LitePhysicsManager";
import { LiteSphereColliderShape } from "./shape/LiteSphereColliderShape";
import { LiteDynamicCollider } from "./LiteDynamicCollider";

@StaticInterfaceImplement<IPhysics>()
export class LitePhysics {
  /**
   * {@inheritDoc IPhysics.createPhysicsManager }
   */
  static createPhysicsManager(
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
  static createStaticCollider(position: Vector3, rotation: Quaternion): IStaticCollider {
    return new LiteStaticCollider(position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createDynamicCollider }
   */
  static createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new LiteDynamicCollider(position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsMaterial }
   */
  static createPhysicsMaterial(
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
  static createBoxColliderShape(uniqueID: number, size: Vector3, material: LitePhysicsMaterial): IBoxColliderShape {
    return new LiteBoxColliderShape(uniqueID, size, material);
  }

  /**
   * {@inheritDoc IPhysics.createSphereColliderShape }
   */
  static createSphereColliderShape(
    uniqueID: number,
    radius: number,
    material: LitePhysicsMaterial
  ): ISphereColliderShape {
    return new LiteSphereColliderShape(uniqueID, radius, material);
  }

  /**
   * {@inheritDoc IPhysics.createPlaneColliderShape }
   */
  static createPlaneColliderShape(uniqueID: number, material: LitePhysicsMaterial): IPlaneColliderShape {
    throw "Physics-lite don't support PlaneColliderShape. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createCapsuleColliderShape }
   */
  static createCapsuleColliderShape(
    uniqueID: number,
    radius: number,
    height: number,
    material: LitePhysicsMaterial
  ): ICapsuleColliderShape {
    throw "Physics-lite don't support CapsuleColliderShape. Use Physics-PhysX instead!";
  }

  //MARK: - Joint
  /**
   * {@inheritDoc IPhysics.createFixedJoint }
   */
  static createFixedJoint(
    actor0: ICollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: ICollider,
    position1: Vector3,
    rotation1: Quaternion
  ): IFixedJoint {
    throw "Physics-lite don't support FixedJoint. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createHingeJoint }
   */
  static createHingeJoint(
    actor0: ICollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: ICollider,
    position1: Vector3,
    rotation1: Quaternion
  ): IHingeJoint {
    throw "Physics-lite don't support HingeJoint. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createSphericalJoint }
   */
  static createSphericalJoint(
    actor0: ICollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: ICollider,
    position1: Vector3,
    rotation1: Quaternion
  ): ISphericalJoint {
    throw "Physics-lite don't support SphericalJoint. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createSpringJoint }
   */
  static createSpringJoint(
    actor0: ICollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: ICollider,
    position1: Vector3,
    rotation1: Quaternion
  ): ISpringJoint {
    throw "Physics-lite don't support SpringJoint. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createTranslationalJoint }
   */
  static createTranslationalJoint(
    actor0: ICollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: ICollider,
    position1: Vector3,
    rotation1: Quaternion
  ): ITranslationalJoint {
    throw "Physics-lite don't support TranslationalJoint. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createConfigurableJoint }
   */
  static createConfigurableJoint(
    actor0: ICollider,
    position0: Vector3,
    rotation0: Quaternion,
    actor1: ICollider,
    position1: Vector3,
    rotation1: Quaternion
  ): IConfigurableJoint {
    throw "Physics-lite don't support ConfigurableJoint. Use Physics-PhysX instead!";
  }

  //MARK: - Character Controller
  /**
   * {@inheritDoc IPhysics.createCapsuleCharacterControllerDesc }
   */
  static createCapsuleCharacterControllerDesc(): ICapsuleCharacterControllerDesc {
    throw "Physics-lite don't support CapsuleCharacterControllerDesc. Use Physics-PhysX instead!";
  }

  /**
   * {@inheritDoc IPhysics.createCapsuleObstacle }
   */
  static createCapsuleObstacle(): IPhysicsCapsuleObstacle {
    throw "Physics-lite don't support CapsuleObstacle. Use Physics-PhysX instead!";
  }
}
