import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { IPhysicsActor } from "./IPhysicsActor";
import { IDynamicActor } from "./IDynamicActor";
import { IPhysicsMaterial, IPhysicsMaterialProperties } from "./IPhysicsMaterial";
import { IPhysicsScene } from "./IPhysicsScene";
import { IStaticActor } from "./IStaticActor";
import { IFixedJoint, IHingeJoint, ISpringJoint } from "./joints";
import { IBoxShape, ICapsuleShape, IMeshShape, IPlaneShape, ISphereShape } from "./shape";

/**
 * Creates and configures objects for the physics backend.
 */
export interface IPhysics {
  /**
   * Initialize physics.
   * @returns A promise that will resolve when the physics is initialized
   */
  initialize(): Promise<void>;

  /**
   * Create a native simulation scene.
   */
  createPhysicsScene(): IPhysicsScene;

  /**
   * Create a dynamic rigid actor.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  createDynamicActor(position: Vector3, rotation: Quaternion): IDynamicActor;

  /**
   * Create a static rigid actor.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  createStaticActor(position: Vector3, rotation: Quaternion): IStaticActor;

  /**
   * Create a character controller for later insertion into a scene.
   * @param uniqueID - The collider ID reported by queries and events
   * @param material - The controller material
   */
  createCharacterController(uniqueID: number, material: IPhysicsMaterial): ICharacterController;

  /**
   * Create physics material.
   * @param properties - Physics material properties
   */
  createPhysicsMaterial(properties: IPhysicsMaterialProperties): IPhysicsMaterial;

  /**
   * Create a box shape.
   * @param uniqueID - The collider ID reported by queries and events
   * @param halfExtents - Half the size along each box axis, with entity scale applied
   * @param material - The material of this shape
   */
  createBoxShape(uniqueID: number, halfExtents: Vector3, material: IPhysicsMaterial): IBoxShape;

  /**
   * Create a sphere shape.
   * @param uniqueID - The collider ID reported by queries and events
   * @param radius - The radius with entity scale applied
   * @param material - The material of this shape
   */
  createSphereShape(uniqueID: number, radius: number, material: IPhysicsMaterial): ISphereShape;

  /**
   * Create a plane shape.
   * @param uniqueID - The collider ID reported by queries and events
   * @param material - The material of this shape
   */
  createPlaneShape(uniqueID: number, material: IPhysicsMaterial): IPlaneShape;

  /**
   * Create a capsule shape.
   * @param uniqueID - The collider ID reported by queries and events
   * @param radius - The radius with entity scale applied
   * @param halfHeight - Half the cylindrical height, with entity scale applied
   * @param material - The material of this shape
   * @param upAxis - The local up axis
   */
  createCapsuleShape(
    uniqueID: number,
    radius: number,
    halfHeight: number,
    material: IPhysicsMaterial,
    upAxis: number
  ): ICapsuleShape;

  /**
   * Create a shape from cooked mesh data.
   * @param uniqueID - The collider ID reported by queries and events
   * @param positions - Unscaled vertices in mesh-local space
   * @param indices - Triangle indices, or null for a convex mesh
   * @param isConvex - Whether to create convex mesh (true) or triangle mesh (false)
   * @param material - The material of this shape
   * @param cookingFlags - Cooking flags
   * @param scale - The absolute world scale applied to the cooked mesh
   * @returns The shape, or null if mesh cooking or shape creation fails
   */
  createMeshShape(
    uniqueID: number,
    positions: Vector3[],
    indices: Uint8Array | Uint16Array | Uint32Array | null,
    isConvex: boolean,
    material: IPhysicsMaterial,
    cookingFlags: number,
    scale: Vector3
  ): IMeshShape | null;

  /**
   * Create fixed joint.
   * @param actor - Owning actor of the joint
   */
  createFixedJoint(actor: IPhysicsActor): IFixedJoint;

  /**
   * Create hinge joint.
   * @param actor - Owning actor of the joint
   */
  createHingeJoint(actor: IPhysicsActor): IHingeJoint;

  /**
   * Create spring joint.
   * @param actor - Owning actor of the joint
   */
  createSpringJoint(actor: IPhysicsActor): ISpringJoint;

  /**
   * Release the physics backend.
   */
  destroy(): void;
}
