import { Quaternion, Vector3, Layer } from "@galacean/engine";
import {
  IBoxColliderShape,
  ICapsuleColliderShape,
  ICharacterController,
  ICollider,
  ICollision,
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
import { LiteCollider } from "./LiteCollider";
import { LiteDynamicCollider } from "./LiteDynamicCollider";
import { LitePhysicsMaterial } from "./LitePhysicsMaterial";
import { LitePhysicsScene } from "./LitePhysicsScene";
import { LiteStaticCollider } from "./LiteStaticCollider";
import { LiteBoxColliderShape } from "./shape/LiteBoxColliderShape";
import { LiteSphereColliderShape } from "./shape/LiteSphereColliderShape";
import { LitePhysicsManager } from "./LitePhysicsManager";

export class LitePhysics implements IPhysics {
  private _layerCollisionMatrix: boolean[] = [];

  /**
   * {@inheritDoc IPhysics.initialize }
   */
  initialize(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsManager }
   */
  createPhysicsManager(): IPhysicsManager {
    return null;
  }

  /**
   * {@inheritDoc IPhysics.createPhysicsScene }
   */
  createPhysicsScene(
    physicsManager: LitePhysicsManager,
    onContactBegin?: (collision: ICollision) => void,
    onContactEnd?: (collision: ICollision) => void,
    onContactPersist?: (collision: ICollision) => void,
    onTriggerBegin?: (obj1: number, obj2: number) => void,
    onTriggerEnd?: (obj1: number, obj2: number) => void,
    onTriggerPersist?: (obj1: number, obj2: number) => void
  ): LitePhysicsScene {
    return new LitePhysicsScene(
      this,
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
    return new LiteStaticCollider(this, position, rotation);
  }

  /**
   * {@inheritDoc IPhysics.createDynamicCollider }
   */
  createDynamicCollider(position: Vector3, rotation: Quaternion): IDynamicCollider {
    return new LiteDynamicCollider(this, position, rotation);
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
    throw new Error("Physics-lite doesn't support PlaneColliderShape. Use Physics-PhysX instead!");
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
    throw new Error("Physics-lite doesn't support CapsuleColliderShape. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysics.createFixedJoint }
   */
  createFixedJoint(collider: LiteCollider): IFixedJoint {
    throw new Error("Physics-lite doesn't support FixedJoint. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysics.createHingeJoint }
   */
  createHingeJoint(collider: LiteCollider): IHingeJoint {
    throw new Error("Physics-lite doesn't support HingeJoint. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysics.createSpringJoint }
   */
  createSpringJoint(collider: LiteCollider): ISpringJoint {
    throw new Error("Physics-lite doesn't support SpringJoint. Use Physics-PhysX instead!");
  }

  /**
   * {@inheritDoc IPhysics.setColliderLayer }
   */
  setColliderLayer(collider: LiteCollider, layer: Layer): void {
    collider._collisionLayer = layer;
  }

  /**
   * {@inheritDoc IPhysics.getColliderLayerCollision }
   */
  getColliderLayerCollision(layer1: number, layer2: number): boolean {
    const index = this._getColliderLayerIndex(layer1, layer2);
    if (index > -1) {
      return this._layerCollisionMatrix[index] ?? true;
    }
    // If either layer is Layer.Nothing, they cant collide
    return false;
  }

  /**
   * {@inheritDoc IPhysics.setColliderLayerCollision }
   */
  setColliderLayerCollision(layer1: number, layer2: number, collide: boolean): void {
    const index = this._getColliderLayerIndex(layer1, layer2);
    if (index > -1) {
      this._layerCollisionMatrix[index] = collide;
    }
  }

  /**
   * {@inheritDoc IPhysics.destroy }
   */
  destroy(): void {}

  private _getColliderLayerIndex(layer1: number, layer2: number): number {
    if (layer1 === 32 || layer2 === 32) {
      return -1;
    }

    const min = Math.min(layer1, layer2);
    const max = Math.max(layer1, layer2);

    // Calculate a unique index for the layer pair using the triangular number formula
    // This ensures that each layer combination maps to a unique index in the collision matrix
    return (max * (max + 1)) / 2 + min;
  }
}
