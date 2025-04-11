import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { ICollider } from "./ICollider";
import { IDynamicCollider } from "./IDynamicCollider";
import { IPhysicsManager } from "./IPhysicsManager";
import { IPhysicsMaterial } from "./IPhysicsMaterial";
import { IPhysicsScene } from "./IPhysicsScene";
import { IStaticCollider } from "./IStaticCollider";
import { IFixedJoint, IHingeJoint, ISpringJoint } from "./joints";
import { IBoxColliderShape, ICapsuleColliderShape, IPlaneColliderShape, ISphereColliderShape } from "./shape";
import { ICollision } from "./ICollision";

/**
 * The interface of physics creation.
 */
export interface IPhysics {
  /**
   * Initialize physics.
   * @returns A promise that will resolve when the physics is initialized
   */
  initialize(): Promise<void>;

  /**
   * Create physics manager.
   */
  createPhysicsManager(): IPhysicsManager;

  /**
   * Create physics scene.
   * @param physicsManager - The physics manager
   * @param onContactEnter - Function called when contact begin
   * @param onContactExit - Function called when contact end
   * @param onContactStay - Function called when contact stay
   * @param onTriggerEnter - Function called when trigger begin
   * @param onTriggerExit - Function called when trigger end
   * @param onTriggerStay - Function called when trigger stay
   */
  createPhysicsScene(
    physicsManager: IPhysicsManager,
    onContactEnter?: (collision: ICollision) => void,
    onContactExit?: (collision: ICollision) => void,
    onContactStay?: (collision: ICollision) => void,
    onTriggerEnter?: (obj1: number, obj2: number) => void,
    onTriggerExit?: (obj1: number, obj2: number) => void,
    onTriggerStay?: (obj1: number, obj2: number) => void
  ): IPhysicsScene;

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
   * Create character controller.
   */
  createCharacterController(): ICharacterController;

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
   * @param uniqueID - Shape unique id
   * @param size - Size of the box
   * @param material - The material of this shape
   */
  createBoxColliderShape(uniqueID: number, size: Vector3, material: IPhysicsMaterial): IBoxColliderShape;

  /**
   * Create sphere collider shape.
   * @param uniqueID - Shape unique id
   * @param radius - Radius of the sphere
   * @param material - The material of this shape
   */
  createSphereColliderShape(uniqueID: number, radius: number, material: IPhysicsMaterial): ISphereColliderShape;

  /**
   * Create plane collider shape.
   * @param uniqueID - Shape unique id
   * @param material - The material of this shape
   */
  createPlaneColliderShape(uniqueID: number, material: IPhysicsMaterial): IPlaneColliderShape;

  /**
   * Create capsule collider shape.
   * @param uniqueID - Shape unique id
   * @param radius - Radius of capsule
   * @param height - Height of capsule
   * @param material - The material of this shape
   */
  createCapsuleColliderShape(
    uniqueID: number,
    radius: number,
    height: number,
    material: IPhysicsMaterial
  ): ICapsuleColliderShape;

  /**
   * Create fixed joint.
   * @param collider - Affector of joint
   */
  createFixedJoint(collider: ICollider): IFixedJoint;

  /**
   * Create hinge joint.
   * @param collider - Affector of joint
   */
  createHingeJoint(collider: ICollider): IHingeJoint;

  /**
   * Create spring joint
   * @param collider - Affector of joint
   */
  createSpringJoint(collider: ICollider): ISpringJoint;

  /**
   * Set whether two collision groups can collide with each other.
   * @param group1 - The first collision group
   * @param group2 - The second collision group
   * @param collide - Whether the groups should collide
   */
  setColliderGroupCollision(group1: number, group2: number, collide: boolean): void;

  /**
   * Get whether two collision groups can collide with each other.
   * @param group1 - The first collision group
   * @param group2 - The second collision group
   * @returns Whether the groups can collide
   */
  getColliderGroupCollision(group1: number, group2: number): boolean;

  /**
   * Set the collision group for a collider.
   * @param collider - The collider to set the group for
   * @param group - The group to set
   */
  setColliderGroup(collider: ICollider, group: number): void;

  /**
   * Get the collision group for a collider.
   * @param collider - The collider to get the group for
   * @returns The collision group
   */
  getColliderGroup(collider: ICollider): number;
}
