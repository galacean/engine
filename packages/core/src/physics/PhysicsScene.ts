import { ICharacterController, ICollider, ICollision, IGeometry, IPhysicsScene } from "@galacean/engine-design";
import { MathUtil, Ray, Vector3, Quaternion } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { Scene } from "../Scene";
import { Script } from "../Script";
import { DisorderedArray } from "../utils/DisorderedArray";
import { CharacterController } from "./CharacterController";
import { Collider } from "./Collider";
import { Collision } from "./Collision";
import { HitResult, OverlapHitResult } from "./HitResult";

/**
 * A physics scene is a collection of colliders and constraints which can interact.
 */
export class PhysicsScene {
  private static _collision = new Collision();
  private static _tempPose: { translation: Vector3; rotation: Quaternion } = {
    translation: new Vector3(),
    rotation: new Quaternion()
  };

  private _scene: Scene;
  private _restTime: number = 0;
  private _fixedTimeStep: number = 1 / 60;

  private _colliders: DisorderedArray<Collider> = new DisorderedArray();

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);
  private _nativePhysicsScene: IPhysicsScene;

  private _onContactEnter = (nativeCollision: ICollision) => {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const { shape0Id, shape1Id } = nativeCollision;
    const shape1 = physicalObjectsMap[shape0Id];
    const shape2 = physicalObjectsMap[shape1Id];
    const collision = PhysicsScene._collision;
    collision._nativeCollision = nativeCollision;

    shape1.collider.entity._scripts.forEach(
      (element: Script) => {
        collision.shape = shape2;
        element.onCollisionEnter(collision);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );

    shape2.collider.entity._scripts.forEach(
      (element: Script) => {
        collision.shape = shape1;
        element.onCollisionEnter(collision);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  };

  private _onContactExit = (nativeCollision: ICollision) => {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const { shape0Id, shape1Id } = nativeCollision;
    const shape1 = physicalObjectsMap[shape0Id];
    const shape2 = physicalObjectsMap[shape1Id];
    const collision = PhysicsScene._collision;
    collision._nativeCollision = nativeCollision;

    shape1.collider.entity._scripts.forEach(
      (element: Script) => {
        collision.shape = shape2;
        element.onCollisionExit(collision);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );

    shape2.collider.entity._scripts.forEach(
      (element: Script) => {
        collision.shape = shape1;
        element.onCollisionExit(collision);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  };
  private _onContactStay = (nativeCollision: ICollision) => {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const { shape0Id, shape1Id } = nativeCollision;
    const shape1 = physicalObjectsMap[shape0Id];
    const shape2 = physicalObjectsMap[shape1Id];
    const collision = PhysicsScene._collision;
    collision._nativeCollision = nativeCollision;

    shape1.collider.entity._scripts.forEach(
      (element: Script) => {
        collision.shape = shape2;
        element.onCollisionStay(collision);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );

    shape2.collider.entity._scripts.forEach(
      (element: Script) => {
        collision.shape = shape1;
        element.onCollisionStay(collision);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  };
  private _onTriggerEnter = (obj1: number, obj2: number) => {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const shape1 = physicalObjectsMap[obj1];
    const shape2 = physicalObjectsMap[obj2];

    shape1.collider.entity._scripts.forEach(
      (element: Script) => {
        element.onTriggerEnter(shape2);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );

    shape2.collider.entity._scripts.forEach(
      (element: Script) => {
        element.onTriggerEnter(shape1);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  };

  private _onTriggerExit = (obj1: number, obj2: number) => {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const shape1 = physicalObjectsMap[obj1];
    const shape2 = physicalObjectsMap[obj2];

    shape1.collider.entity._scripts.forEach(
      (element: Script) => {
        element.onTriggerExit(shape2);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );

    shape2.collider.entity._scripts.forEach(
      (element: Script) => {
        element.onTriggerExit(shape1);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  };

  private _onTriggerStay = (obj1: number, obj2: number) => {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const shape1 = physicalObjectsMap[obj1];
    const shape2 = physicalObjectsMap[obj2];

    shape1.collider.entity._scripts.forEach(
      (element: Script) => {
        element.onTriggerStay(shape2);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );

    shape2.collider.entity._scripts.forEach(
      (element: Script) => {
        element.onTriggerStay(shape1);
      },
      (element: Script, index: number) => {
        element._entityScriptsIndex = index;
      }
    );
  };

  /**
   * The gravity of physics scene.
   */
  get gravity(): Vector3 {
    return this._gravity;
  }

  set gravity(value: Vector3) {
    const gravity = this._gravity;
    if (gravity !== value) {
      gravity.copyFrom(value);
    }
  }

  /**
   * The fixed time step in seconds at which physics are performed.
   */
  get fixedTimeStep(): number {
    return this._fixedTimeStep;
  }

  set fixedTimeStep(value: number) {
    this._fixedTimeStep = Math.max(value, MathUtil.zeroTolerance);
  }

  constructor(scene: Scene) {
    this._scene = scene;

    this._setGravity = this._setGravity.bind(this);
    //@ts-ignore
    this._gravity._onValueChanged = this._setGravity;

    const engine = scene.engine;
    if (engine._physicsInitialized) {
      this._nativePhysicsScene = Engine._nativePhysics.createPhysicsScene(
        engine._nativePhysicsManager,
        this._onContactEnter,
        this._onContactExit,
        this._onContactStay,
        this._onTriggerEnter,
        this._onTriggerExit,
        this._onTriggerStay
      );
    }
  }

  /**
   * Get whether two colliders can collide with each other.
   * @param layer1 - The first collision layer
   * @param layer2 - The second collision layer
   * @returns Whether the colliders should collide
   */
  getColliderLayerCollision(layer1: Layer, layer2: Layer): boolean {
    const index1 = Math.log2(layer1);
    const index2 = Math.log2(layer2);
    if (!Number.isInteger(index1) || !Number.isInteger(index1)) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }

    return Engine._nativePhysics.getColliderLayerCollision(index1, index2);
  }

  /**
   * Set whether two colliders can collide with each other.
   * @param layer1 - The first collision layer
   * @param layer2 - The second collision layer
   * @param isCollide - Whether the colliders should collide
   */
  setColliderLayerCollision(layer1: Layer, layer2: Layer, isCollide: boolean): void {
    const index1 = Math.log2(layer1);
    const index2 = Math.log2(layer2);
    if (!Number.isInteger(index1) || !Number.isInteger(index1)) {
      throw new Error("Collision layer must be a single layer (Layer.Layer0 to Layer.Layer31)");
    }

    Engine._nativePhysics.setColliderLayerCollision(index1, index2, isCollide);
  }

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, outHitResult: HitResult): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, distance: number): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, distance: number, outHitResult: HitResult): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(ray: Ray, distance: number, layerMask: Layer): boolean;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when casting
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false.
   */
  raycast(ray: Ray, distance: number, layerMask: Layer, outHitResult: HitResult): boolean;

  raycast(
    ray: Ray,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    let hitResult: HitResult;

    let distance = Number.MAX_VALUE;
    if (typeof distanceOrResult === "number") {
      distance = distanceOrResult;
    } else if (distanceOrResult != undefined) {
      hitResult = distanceOrResult;
    }

    let layerMask = Layer.Everything;
    if (typeof layerMaskOrResult === "number") {
      layerMask = layerMaskOrResult;
    } else if (layerMaskOrResult != undefined) {
      hitResult = layerMaskOrResult;
    }

    if (outHitResult) {
      hitResult = outHitResult;
    }

    const preFilter = (obj: number) => {
      const shape = Engine._physicalObjectsMap[obj];
      if (!shape) {
        return false;
      }
      return shape.collider.entity.layer & layerMask && shape.isSceneQuery;
    };
    let outIDX: number;
    let outDistance: number;
    let outPosition: Vector3;
    let outNormal: Vector3;

    if (hitResult != undefined) {
      const result = this._nativePhysicsScene.raycast(ray, distance, preFilter, (idx, distance, position, normal) => {
        outIDX = idx;
        outDistance = distance;
        outPosition = position;
        outNormal = normal;
      });

      if (result) {
        const hitShape = Engine._physicalObjectsMap[outIDX];
        hitResult.entity = hitShape._collider.entity;
        hitResult.shape = hitShape;
        hitResult.distance = outDistance;
        hitResult.point.copyFrom(outPosition);
        hitResult.normal.copyFrom(outNormal);
        return true;
      } else {
        hitResult.entity = null;
        hitResult.shape = null;
        hitResult.distance = 0;
        hitResult.point.set(0, 0, 0);
        hitResult.normal.set(0, 0, 0);
        return false;
      }
    } else {
      return this._nativePhysicsScene.raycast(ray, distance, preFilter);
    }
  }

  /**
   * Casts a box through the Scene and returns true if there is any hit.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param direction - The direction to sweep along
   * @param orientation - The rotation of the box
   * @param distance - The max distance to sweep, default is Number.MAX_VALUE
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when sweeping, default is Layer.Everything
   * @returns Returns True if the box intersects with any collider, otherwise false
   */
  boxCast(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    direction: Vector3,
    distance?: number,
    layerMask?: Layer,
    outHitResult?: HitResult
  ): boolean {
    const boxGeometry = Engine._nativePhysics.createBoxGeometry(halfExtents);
    const pose = PhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);

    return this._sweep(boxGeometry, pose, direction, distance, layerMask, outHitResult);
  }

  /**
   * Casts a sphere through the Scene and returns true if there is any hit.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep, default is Number.MAX_VALUE
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when sweeping, default is Layer.Everything
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the sphere intersects with any collider, otherwise false
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance?: number,
    layerMask?: Layer,
    outHitResult?: HitResult
  ): boolean {
    const sphereGeometry = Engine._nativePhysics.createSphereGeometry(radius);
    const pose = PhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    return this._sweep(sphereGeometry, pose, direction, distance, layerMask, outHitResult);
  }

  /**
   * Casts a capsule through the Scene and returns true if there is any hit.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param direction - The direction to sweep along
   * @param orientation - The rotation of the capsule
   * @param distance - The max distance to sweep, default is Number.MAX_VALUE
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when sweeping, default is Layer.Everything
   * @returns Returns True if the capsule intersects with any collider, otherwise false
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    direction: Vector3,
    distance?: number,
    layerMask?: Layer,
    outHitResult?: HitResult
  ): boolean {
    const capsuleGeometry = Engine._nativePhysics.createCapsuleGeometry(radius, height);
    const pose = PhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._sweep(capsuleGeometry, pose, direction, distance, layerMask, outHitResult);
  }

  /**
   * Check if a box overlaps with any collider in the scene.
   * @param center - The center of the box
   * @param orientation - The rotation of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when checking, default is Layer.Everything
   * @returns Returns True if the box overlaps with any collider, otherwise false
   */
  overlapBox(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    layerMask?: Layer,
    outOverlapHitResult?: OverlapHitResult
  ): boolean {
    const boxGeometry = Engine._nativePhysics.createBoxGeometry(halfExtents);
    const pose = PhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._overlap(boxGeometry, pose, layerMask, outOverlapHitResult);
  }

  /**
   * Check if a sphere overlaps with any collider in the scene.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when checking, default is Layer.Everything
   * @returns Returns True if the sphere overlaps with any collider, otherwise false
   */
  overlapSphere(center: Vector3, radius: number, layerMask?: Layer, outOverlapHitResult?: OverlapHitResult): boolean {
    const sphereGeometry = Engine._nativePhysics.createSphereGeometry(radius);
    const pose = PhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    return this._overlap(sphereGeometry, pose, layerMask, outOverlapHitResult);
  }

  /**
   * Check if a capsule overlaps with any collider in the scene.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param orientation - The rotation of the capsule
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when checking, default is Layer.Everything
   * @returns Returns True if the capsule overlaps with any collider, otherwise false
   */
  overlapCapsule(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    layerMask?: Layer,
    outOverlapHitResult?: OverlapHitResult
  ): boolean {
    const capsuleGeometry = Engine._nativePhysics.createCapsuleGeometry(radius, height);
    const pose = PhysicsScene._tempPose;
    pose.translation.copyFrom(center);
    pose.rotation.copyFrom(orientation);
    return this._overlap(capsuleGeometry, pose, layerMask, outOverlapHitResult);
  }

  /**
   * Call on every frame to update pose of objects.
   * @internal
   */
  _update(deltaTime: number): void {
    const { _fixedTimeStep: fixedTimeStep, _nativePhysicsScene: nativePhysicsManager } = this;
    const componentsManager = this._scene._componentsManager;

    const simulateTime = this._restTime + deltaTime;
    const step = Math.floor(simulateTime / fixedTimeStep);
    this._restTime = simulateTime - step * fixedTimeStep;
    for (let i = 0; i < step; i++) {
      componentsManager.callScriptOnPhysicsUpdate();
      this._callColliderOnUpdate();
      nativePhysicsManager.update(fixedTimeStep);
      this._callColliderOnLateUpdate();
    }
  }

  /**
   * Add collider into the manager.
   * @param collider - StaticCollider or DynamicCollider.
   * @internal
   */
  _addCollider(collider: Collider): void {
    if (collider._index === -1) {
      collider._index = this._colliders.length;
      this._colliders.add(collider);
    }
    this._nativePhysicsScene.addCollider(<ICollider>collider._nativeCollider);
  }

  /**
   * Add character controller into the manager.
   * @param controller - Character Controller.
   * @internal
   */
  _addCharacterController(controller: CharacterController): void {
    if (controller._index === -1) {
      controller._index = this._colliders.length;
      this._colliders.add(controller);
    }
    this._nativePhysicsScene.addCharacterController(<ICharacterController>controller._nativeCollider);
  }

  /**
   * Remove collider.
   * @param collider - StaticCollider or DynamicCollider.
   * @internal
   */
  _removeCollider(collider: Collider): void {
    const replaced = this._colliders.deleteByIndex(collider._index);
    replaced && (replaced._index = collider._index);
    collider._index = -1;
    this._nativePhysicsScene.removeCollider(<ICollider>collider._nativeCollider);
  }

  /**
   * Remove collider.
   * @param controller - Character Controller.
   * @internal
   */
  _removeCharacterController(controller: CharacterController): void {
    const replaced = this._colliders.deleteByIndex(controller._index);
    replaced && (replaced._index = controller._index);
    controller._index = -1;
    this._nativePhysicsScene.removeCharacterController(<ICharacterController>controller._nativeCollider);
  }

  /**
   * @internal
   */
  _callColliderOnUpdate(): void {
    const elements = this._colliders._elements;
    for (let i = this._colliders.length - 1; i >= 0; --i) {
      elements[i]._onUpdate();
    }
  }

  /**
   * @internal
   */
  _callColliderOnLateUpdate(): void {
    const elements = this._colliders._elements;
    for (let i = this._colliders.length - 1; i >= 0; --i) {
      elements[i]._onLateUpdate();
    }
  }

  /**
   * @internal
   */
  _gc(): void {
    this._colliders.garbageCollection();
  }

  /**
   * @internal
   */
  _destroy() {
    this._nativePhysicsScene?.destroy();
  }

  private _setGravity(): void {
    this._nativePhysicsScene.setGravity(this._gravity);
  }

  private _sweep(
    geometry: IGeometry,
    pose: { translation: Vector3; rotation: Quaternion },
    direction: Vector3,
    distance?: number,
    layerMask?: Layer,
    outHitResult?: HitResult
  ): boolean {
    const maxDistance = distance ?? Number.MAX_VALUE;
    const mask = layerMask ?? Layer.Everything;

    const preFilter = (obj: number) => {
      const shape = Engine._physicalObjectsMap[obj];
      if (!shape) {
        return false;
      }
      return shape.collider.entity.layer & mask && shape.isSceneQuery;
    };

    if (outHitResult !== undefined) {
      const result = this._nativePhysicsScene.sweep(
        geometry,
        pose,
        direction,
        maxDistance,
        preFilter,
        (shapeUniqueID, distance, position, normal) => {
          outHitResult.entity = Engine._physicalObjectsMap[shapeUniqueID].collider.entity;
          outHitResult.shape = Engine._physicalObjectsMap[shapeUniqueID];
          outHitResult.distance = distance;
          outHitResult.point.copyFrom(position);
          outHitResult.normal.copyFrom(normal);
        }
      );

      if (!result) {
        outHitResult.entity = null;
        outHitResult.shape = null;
        outHitResult.distance = 0;
        outHitResult.point.set(0, 0, 0);
        outHitResult.normal.set(0, 0, 0);
        return false;
      }
      return true;
    }

    return this._nativePhysicsScene.sweep(geometry, pose, direction, maxDistance, preFilter);
  }

  private _overlap(
    geometry: IGeometry,
    pose: { translation: Vector3; rotation: Quaternion },
    layerMask?: Layer,
    outOverlapHitResult?: OverlapHitResult
  ): boolean {
    const mask = layerMask ?? Layer.Everything;

    const preFilter = (obj: number) => {
      const shape = Engine._physicalObjectsMap[obj];
      if (!shape) {
        return false;
      }
      return shape.collider.entity.layer & mask && shape.isSceneQuery;
    };

    if (outOverlapHitResult !== undefined) {
      const result = this._nativePhysicsScene.overlapAny(geometry, pose, preFilter, (shapeUniqueID) => {
        const hitShape = Engine._physicalObjectsMap[shapeUniqueID];
        outOverlapHitResult.entity = hitShape._collider.entity;
        outOverlapHitResult.shape = hitShape;
      });

      if (!result) {
        outOverlapHitResult.entity = null;
        outOverlapHitResult.shape = null;
        return false;
      }
      return true;
    }

    return this._nativePhysicsScene.overlapAny(geometry, pose, preFilter);
  }
}
