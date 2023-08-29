import { ICharacterController, ICollider, IPhysics, IPhysicsManager } from "@galacean/engine-design";
import { Ray, Vector3, MathUtil } from "@galacean/engine-math";
import { DisorderedArray } from "../DisorderedArray";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { CharacterController } from "./CharacterController";
import { Collider } from "./Collider";
import { Collision } from "./Collision";
import { HitResult } from "./HitResult";
import { ColliderShape } from "./shape";

/**
 * A physics manager is a collection of colliders and constraints which can interact.
 */
export class PhysicsManager {
  private static _collision = new Collision();

  /** @internal */
  static _nativePhysics: IPhysics;

  /** @internal */
  _initialized: boolean = false;

  private _engine: Engine;
  private _restTime: number = 0;
  private _fixedTimeStep: number = 1 / 60;

  private _colliders: DisorderedArray<Collider> = new DisorderedArray();

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);
  private _nativePhysicsManager: IPhysicsManager;
  private _physicalObjectsMap: Record<number, ColliderShape> = {};
  private _onContactEnter = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      if (!script._waitHandlingInValid) {
        let collision = PhysicsManager._collision;
        collision.shape = shape2;
        script.onCollisionEnter(collision);
      }
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      if (!script._waitHandlingInValid) {
        let collision = PhysicsManager._collision;
        collision.shape = shape1;
        script.onCollisionEnter(collision);
      }
    }
  };
  private _onContactExit = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      if (!script._waitHandlingInValid) {
        let collision = PhysicsManager._collision;
        collision.shape = shape2;
        script.onCollisionExit(collision);
      }
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      if (!script._waitHandlingInValid) {
        let collision = PhysicsManager._collision;
        collision.shape = shape1;
        script.onCollisionExit(collision);
      }
    }
  };
  private _onContactStay = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      if (!script._waitHandlingInValid) {
        let collision = PhysicsManager._collision;
        collision.shape = shape2;
        script.onCollisionStay(collision);
      }
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      if (!script._waitHandlingInValid) {
        let collision = PhysicsManager._collision;
        collision.shape = shape1;
        script.onCollisionStay(collision);
      }
    }
  };
  private _onTriggerEnter = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onTriggerEnter(shape2);
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onTriggerEnter(shape1);
    }
  };

  private _onTriggerExit = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, n = scripts.length; i < n; i++) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onTriggerExit(shape2);
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, n = scripts.length; i < n; i++) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onTriggerExit(shape1);
    }
  };

  private _onTriggerStay = (obj1: number, obj2: number) => {
    const shape1 = this._physicalObjectsMap[obj1];
    const shape2 = this._physicalObjectsMap[obj2];

    let scripts = shape1.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onTriggerStay(shape2);
    }

    scripts = shape2.collider.entity._scripts;
    for (let i = 0, len = scripts.length; i < len; i++) {
      const script = scripts.get(i);
      script._waitHandlingInValid || script.onTriggerStay(shape1);
    }
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

  /** The fixed time step in seconds at which physics are performed. */
  get fixedTimeStep(): number {
    return this._fixedTimeStep;
  }

  set fixedTimeStep(value: number) {
    this._fixedTimeStep = Math.max(value, MathUtil.zeroTolerance);
  }

  constructor(engine: Engine) {
    this._engine = engine;

    this._setGravity = this._setGravity.bind(this);
    //@ts-ignore
    this._gravity._onValueChanged = this._setGravity;
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

    const onRaycast = (obj: number) => {
      const shape = this._physicalObjectsMap[obj];
      return shape.collider.entity.layer & layerMask && shape.isSceneQuery;
    };

    if (hitResult != undefined) {
      const result = this._nativePhysicsManager.raycast(ray, distance, onRaycast, (idx, distance, position, normal) => {
        hitResult.entity = this._physicalObjectsMap[idx]._collider.entity;
        hitResult.distance = distance;
        hitResult.normal.copyFrom(normal);
        hitResult.point.copyFrom(position);
      });

      if (result) {
        return true;
      } else {
        hitResult.entity = null;
        hitResult.distance = 0;
        hitResult.point.set(0, 0, 0);
        hitResult.normal.set(0, 0, 0);
        return false;
      }
    } else {
      return this._nativePhysicsManager.raycast(ray, distance, onRaycast);
    }
  }

  /**
   * @internal
   */
  _initialize(physics: IPhysics): void {
    PhysicsManager._nativePhysics = physics;
    this._nativePhysicsManager = PhysicsManager._nativePhysics.createPhysicsManager(
      this._onContactEnter,
      this._onContactExit,
      this._onContactStay,
      this._onTriggerEnter,
      this._onTriggerExit,
      this._onTriggerStay
    );
    this._initialized = true;
  }

  /**
   * Call on every frame to update pose of objects.
   * @internal
   */
  _update(deltaTime: number): void {
    const { _fixedTimeStep: fixedTimeStep, _nativePhysicsManager: nativePhysicsManager } = this;
    const componentsManager = this._engine._componentsManager;

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
   * Add ColliderShape into the manager.
   * @param colliderShape - The Collider Shape.
   * @internal
   */
  _addColliderShape(colliderShape: ColliderShape): void {
    this._physicalObjectsMap[colliderShape.id] = colliderShape;
    this._nativePhysicsManager.addColliderShape(colliderShape._nativeShape);
  }

  /**
   * Remove ColliderShape.
   * @param colliderShape - The Collider Shape.
   * @internal
   */
  _removeColliderShape(colliderShape: ColliderShape): void {
    delete this._physicalObjectsMap[colliderShape.id];
    this._nativePhysicsManager.removeColliderShape(colliderShape._nativeShape);
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
    this._nativePhysicsManager.addCollider(<ICollider>collider._nativeCollider);
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
    this._nativePhysicsManager.addCharacterController(<ICharacterController>controller._nativeCollider);
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
    this._nativePhysicsManager.removeCollider(<ICollider>collider._nativeCollider);
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
    this._nativePhysicsManager.removeCharacterController(<ICharacterController>controller._nativeCollider);
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

  private _setGravity(): void {
    this._nativePhysicsManager.setGravity(this._gravity);
  }
}
