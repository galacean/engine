import { IPhysicsEvents, IPhysicsScene } from "@galacean/engine-design";
import { MathUtil, Ray, Vector3, Quaternion } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { Scene } from "../Scene";
import { Script } from "../Script";
import { Collider } from "./Collider";
import { Collision } from "./Collision";
import { HitResult } from "./HitResult";
import { Rigidbody } from "./Rigidbody";

/**
 * A physics scene is a collection of colliders and constraints which can interact.
 * @remarks Component changes are collected and applied in one pass before each simulation step and each query, so the
 * order in which components are enabled never produces intermediate native states.
 */
export class PhysicsScene {
  private static _collision = new Collision();
  private static _identityQuaternion = new Quaternion(0, 0, 0, 1);
  private static _tempDirection = new Vector3();
  private static _raycastHitPool: HitResult[] = [];
  private static _raycastSeenHits = new Set<HitResult>();
  private static _scriptIndexSetter = (element: Script, index: number) => {
    element._entityScriptsIndex = index;
  };

  private _scene: Scene;
  private _restTime: number = 0;
  private _fixedTimeStep: number = 1 / 60;

  private _bodies: Rigidbody[] = [];
  private _dirtyBodies: Rigidbody[] = [];
  private _dirtyColliders: Collider[] = [];
  private _massDirtyBodies: Rigidbody[] = [];

  private _gravity: Vector3 = new Vector3(0, -9.81, 0);
  /** @internal */
  _nativePhysicsScene: IPhysicsScene;

  private _contactEventConsumerCount = 0;

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
      this._nativePhysicsScene = Engine._nativePhysics.createPhysicsScene();
      this._nativePhysicsScene.setContactEventEnabled(false);
    }
  }

  /**
   * Get whether two colliders can collide with each other.
   * @param layer1 - The first collision layer
   * @param layer2 - The second collision layer
   * @returns Whether the colliders should collide
   */
  getColliderLayerCollision(layer1: Layer, layer2: Layer): boolean {
    return Engine._nativePhysics.getColliderLayerCollision(
      Collider._getLayerIndex(layer1),
      Collider._getLayerIndex(layer2)
    );
  }

  /**
   * Set whether two colliders can collide with each other.
   * @param layer1 - The first collision layer
   * @param layer2 - The second collision layer
   * @param isCollide - Whether the colliders should collide
   */
  setColliderLayerCollision(layer1: Layer, layer2: Layer, isCollide: boolean): void {
    Engine._nativePhysics.setColliderLayerCollision(
      Collider._getLayerIndex(layer1),
      Collider._getLayerIndex(layer2),
      isCollide
    );
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
    let hitResult: HitResult | undefined;

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

    const normalizedDirection = PhysicsScene._normalizeDirection(ray.direction);

    let result = false;
    if (normalizedDirection) {
      this._syncColliders();
      result = this._nativePhysicsScene.raycast(
        ray.origin,
        normalizedDirection,
        distance,
        layerMask,
        hitResult ? this._createHitCallback(hitResult) : undefined
      );
    }

    if (!result && hitResult) {
      this._clearHitResult(hitResult);
    }
    return result;
  }

  /**
   * Casts a ray and writes all hits in unspecified order.
   * @param ray - World-space ray; its direction is normalized internally
   * @param outHitResults - Receives the hits, reusing existing objects; resized to the hit count
   * @returns Whether any hit was found
   *
   * @remarks All result objects, including caller-supplied ones, are borrowed and overwritten on reuse.
   * Copy values to retain them. Unused objects are cleared and recycled for other queries.
   * Reuse the array without clearing it; manually removed objects are not pooled.
   * Do not share objects across output arrays or resubmit recycled objects. Duplicate entries share the last write.
   */
  raycastAll(ray: Ray, outHitResults: HitResult[]): boolean;

  /**
   * Casts a ray and writes all hits in unspecified order.
   * @param ray - World-space ray; its direction is normalized internally
   * @param distance - Maximum query distance; non-positive values return no hits
   * @param outHitResults - Receives the hits, reusing existing objects; resized to the hit count
   * @returns Whether any hit was found
   *
   * @remarks All result objects, including caller-supplied ones, are borrowed and overwritten on reuse.
   * Copy values to retain them. Unused objects are cleared and recycled for other queries.
   * Reuse the array without clearing it; manually removed objects are not pooled.
   * Do not share objects across output arrays or resubmit recycled objects. Duplicate entries share the last write.
   */
  raycastAll(ray: Ray, distance: number, outHitResults: HitResult[]): boolean;

  /**
   * Casts a ray and optionally writes all hits in unspecified order.
   * @param ray - World-space ray; its direction is normalized internally
   * @param distance - Maximum query distance; defaults to `Number.MAX_VALUE`
   * @param layerMask - Collision layers to include; defaults to `Layer.Everything`
   * @param outHitResults - Receives the hits; resized to the hit count. Omit to test for a hit only
   * @returns Whether any hit was found
   *
   * @remarks All result objects, including caller-supplied ones, are borrowed and overwritten on reuse.
   * Copy values to retain them. Unused objects are cleared and recycled for other queries.
   * Reuse the array without clearing it; manually removed objects are not pooled.
   * Do not share objects across output arrays or resubmit recycled objects. Duplicate entries share the last write.
   * Non-positive distances or directions that cannot be normalized clear the output; hits at distance 0 are ignored.
   */
  raycastAll(ray: Ray, distance?: number, layerMask?: Layer, outHitResults?: HitResult[]): boolean;

  raycastAll(
    ray: Ray,
    distance: number | HitResult[] = Number.MAX_VALUE,
    layerMask: Layer | HitResult[] = Layer.Everything,
    outHitResults?: HitResult[]
  ): boolean {
    if (typeof layerMask !== "number") {
      outHitResults ||= layerMask;
      layerMask = Layer.Everything;
    }
    if (typeof distance !== "number") {
      outHitResults ||= distance;
      distance = Number.MAX_VALUE;
    }
    if (!outHitResults) {
      return this.raycast(ray, distance, layerMask);
    }

    const pool = PhysicsScene._raycastHitPool;
    let hitCount = 0;
    const normalizedDirection = PhysicsScene._normalizeDirection(ray.direction);
    if (distance > 0 && normalizedDirection) {
      this._syncColliders();
      this._nativePhysicsScene.raycastAll(
        ray.origin,
        normalizedDirection,
        distance,
        layerMask,
        (colliderID: number, hitDistance: number, position: Vector3, normal: Vector3) => {
          const hitResult = (outHitResults[hitCount++] ||= pool.pop() ?? new HitResult());
          this._setHitResult(hitResult, colliderID, hitDistance, position, normal);
        }
      );
    }
    const length = outHitResults.length;
    if (hitCount < length) {
      // Preserve active aliases and recycle each unused object only once
      const seenHits = PhysicsScene._raycastSeenHits;
      for (let i = 0; i < hitCount; i++) {
        seenHits.add(outHitResults[i]);
      }
      for (let i = hitCount; i < length; i++) {
        const hitResult = outHitResults[i];
        if (hitResult && !seenHits.has(hitResult)) {
          seenHits.add(hitResult);
          this._clearHitResult(hitResult);
          pool.push(hitResult);
        }
      }
      seenHits.clear();
    }
    outHitResults.length = hitCount;
    return hitCount > 0;
  }

  /**
   * Casts a box through the Scene and returns true if there is any hit.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param direction - The direction to sweep along
   * @returns Returns true if the box intersects with any collider, otherwise false
   */
  boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3): boolean;

  /**
   * Casts a box through the Scene and returns true if there is any hit.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param direction - The direction to sweep along
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the box intersects with any collider, otherwise false
   */
  boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, outHitResult: HitResult): boolean;

  /**
   * Casts a box through the Scene and returns true if there is any hit.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @returns Returns true if the box intersects with any collider, otherwise false
   */
  boxCast(center: Vector3, halfExtents: Vector3, direction: Vector3, distance: number): boolean;

  /**
   * Casts a box through the Scene and returns true if there is any hit.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the box intersects with any collider, otherwise false
   */
  boxCast(
    center: Vector3,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    outHitResult: HitResult
  ): boolean;

  /**
   * Casts a box through the Scene and returns true if there is any hit.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param direction - The direction to sweep along
   * @param orientation - The rotation of the box. @defaultValue `Quaternion(0, 0, 0, 1)`
   * @param distance - The max distance to sweep. @defaultValue `Number.MAX_VALUE`
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when sweeping. @defaultValue `Layer.Everything`
   * @param outHitResult - Optional HitResult object to store detailed hit information
   * @returns Returns true if the box intersects with any collider, otherwise false
   */
  boxCast(
    center: Vector3,
    halfExtents: Vector3,
    direction: Vector3,
    orientation: Quaternion,
    distance: number,
    layerMask: Layer,
    outHitResult?: HitResult
  ): boolean;

  boxCast(
    center: Vector3,
    halfExtents: Vector3,
    direction: Vector3,
    orientationOrDistanceOrResult?: Quaternion | number | HitResult,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    let hitResult: HitResult | undefined;
    let orientation = PhysicsScene._identityQuaternion;
    let distance = Number.MAX_VALUE;
    let layerMask = Layer.Everything;

    // Parse parameters based on new overload patterns
    if (typeof orientationOrDistanceOrResult === "number") {
      distance = orientationOrDistanceOrResult;
      if (distanceOrResult?.constructor === HitResult) {
        hitResult = distanceOrResult;
      }
    } else if (orientationOrDistanceOrResult?.constructor === HitResult) {
      hitResult = orientationOrDistanceOrResult;
    } else if (orientationOrDistanceOrResult?.constructor === Quaternion) {
      orientation = orientationOrDistanceOrResult;
      if (typeof distanceOrResult === "number") {
        distance = distanceOrResult;
        if (typeof layerMaskOrResult === "number") {
          layerMask = layerMaskOrResult;
        }
      }
    }

    if (outHitResult) {
      hitResult = outHitResult;
    }

    const normalizedDirection = PhysicsScene._normalizeDirection(direction);

    let result = false;
    if (normalizedDirection) {
      this._syncColliders();
      result = this._nativePhysicsScene.boxCast(
        center,
        orientation,
        halfExtents,
        normalizedDirection,
        distance,
        layerMask,
        hitResult ? this._createHitCallback(hitResult) : undefined
      );
    }

    if (!result && hitResult) {
      this._clearHitResult(hitResult);
    }
    return result;
  }

  /**
   * Casts a sphere through the Scene and returns true if there is any hit.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param direction - The direction to sweep along
   * @returns Returns true if the sphere intersects with any collider, otherwise false
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3): boolean;

  /**
   * Casts a sphere through the Scene and returns true if there is any hit.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param direction - The direction to sweep along
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the sphere intersects with any collider, otherwise false
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3, outHitResult: HitResult): boolean;

  /**
   * Casts a sphere through the Scene and returns true if there is any hit.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @returns Returns true if the sphere intersects with any collider, otherwise false
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3, distance: number): boolean;

  /**
   * Casts a sphere through the Scene and returns true if there is any hit.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the sphere intersects with any collider, otherwise false
   */
  sphereCast(center: Vector3, radius: number, direction: Vector3, distance: number, outHitResult: HitResult): boolean;

  /**
   * Casts a sphere through the Scene and returns true if there is any hit.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep. @defaultValue `Number.MAX_VALUE`
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when sweeping. @defaultValue `Layer.Everything`
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the sphere intersects with any collider, otherwise false
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    layerMask: Layer,
    outHitResult?: HitResult
  ): boolean;

  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    let hitResult: HitResult | undefined;
    let distance = Number.MAX_VALUE;
    let layerMask = Layer.Everything;

    // Parse parameters based on new overload patterns
    if (typeof distanceOrResult === "number") {
      distance = distanceOrResult;
      if (layerMaskOrResult?.constructor === HitResult) {
        hitResult = layerMaskOrResult;
      } else if (typeof layerMaskOrResult === "number") {
        layerMask = layerMaskOrResult;
      }
    } else if (distanceOrResult?.constructor === HitResult) {
      hitResult = distanceOrResult;
    }

    if (outHitResult) {
      hitResult = outHitResult;
    }

    const normalizedDirection = PhysicsScene._normalizeDirection(direction);

    let result = false;
    if (normalizedDirection) {
      this._syncColliders();
      result = this._nativePhysicsScene.sphereCast(
        center,
        radius,
        normalizedDirection,
        distance,
        layerMask,
        hitResult ? this._createHitCallback(hitResult) : undefined
      );
    }

    if (!result && hitResult) {
      this._clearHitResult(hitResult);
    }
    return result;
  }

  /**
   * Casts a capsule through the Scene and returns true if there is any hit.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param direction - The direction to sweep along
   * @returns Returns true if the capsule intersects with any collider, otherwise false
   */
  capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3): boolean;

  /**
   * Casts a capsule through the Scene and returns true if there is any hit.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param direction - The direction to sweep along
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the capsule intersects with any collider, otherwise false
   */
  capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, outHitResult: HitResult): boolean;

  /**
   * Casts a capsule through the Scene and returns true if there is any hit.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @returns Returns true if the capsule intersects with any collider, otherwise false
   */
  capsuleCast(center: Vector3, radius: number, height: number, direction: Vector3, distance: number): boolean;

  /**
   * Casts a capsule through the Scene and returns true if there is any hit.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns true if the capsule intersects with any collider, otherwise false
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    direction: Vector3,
    distance: number,
    outHitResult: HitResult
  ): boolean;

  /**
   * Casts a capsule through the Scene and returns true if there is any hit.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param direction - The direction to sweep along
   * @param orientation - The rotation of the capsule. @defaultValue `Quaternion(0, 0, 0, 1)`
   * @param distance - The max distance to sweep. @defaultValue `Number.MAX_VALUE`
   * @param layerMask - Layer mask that is used to selectively ignore Colliders when sweeping. @defaultValue `Layer.Everything`
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the capsule intersects with any collider, otherwise false
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    direction: Vector3,
    orientation: Quaternion,
    distance: number,
    layerMask: Layer,
    outHitResult?: HitResult
  ): boolean;

  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    direction: Vector3,
    orientationOrDistanceOrResult?: Quaternion | number | HitResult,
    distanceOrResult?: number | HitResult,
    layerMaskOrResult?: Layer | HitResult,
    outHitResult?: HitResult
  ): boolean {
    let hitResult: HitResult | undefined;
    let orientation = PhysicsScene._identityQuaternion;
    let distance = Number.MAX_VALUE;
    let layerMask = Layer.Everything;

    if (typeof orientationOrDistanceOrResult === "number") {
      distance = orientationOrDistanceOrResult;
      if (distanceOrResult?.constructor === HitResult) {
        hitResult = distanceOrResult;
      }
    } else if (orientationOrDistanceOrResult?.constructor === HitResult) {
      hitResult = orientationOrDistanceOrResult;
    } else if (orientationOrDistanceOrResult?.constructor === Quaternion) {
      orientation = orientationOrDistanceOrResult;
      if (typeof distanceOrResult === "number") {
        distance = distanceOrResult;
        if (typeof layerMaskOrResult === "number") {
          layerMask = layerMaskOrResult;
        }
      }
    }

    if (outHitResult) {
      hitResult = outHitResult;
    }

    const normalizedDirection = PhysicsScene._normalizeDirection(direction);

    let result = false;
    if (normalizedDirection) {
      this._syncColliders();
      result = this._nativePhysicsScene.capsuleCast(
        center,
        radius,
        height,
        orientation,
        normalizedDirection,
        distance,
        layerMask,
        hitResult ? this._createHitCallback(hitResult) : undefined
      );
    }

    if (!result && hitResult) {
      this._clearHitResult(hitResult);
    }
    return result;
  }

  /**
   * Get all colliders that overlap with a box in the scene.
   * @param center - The center of the box
   * @param halfExtents - Half the size of the box in each dimension
   * @param orientation - The rotation of the box. @defaultValue `Quaternion(0, 0, 0, 1)`
   * @param layerMask - Layer mask that is used to selectively filter colliders. @defaultValue `Layer.Everything`
   * @param colliders - Array to store overlapping colliders. @defaultValue `[]`
   * @returns The colliders overlapping with the box
   */
  overlapBoxAll(
    center: Vector3,
    halfExtents: Vector3,
    orientation: Quaternion = PhysicsScene._identityQuaternion,
    layerMask: Layer = Layer.Everything,
    colliders: Collider[] = []
  ): Collider[] {
    this._syncColliders();
    const ids = this._nativePhysicsScene.overlapBoxAll(center, orientation, halfExtents, layerMask);

    return PhysicsScene._collectColliders(ids, colliders);
  }

  /**
   * Get all colliders that overlap with a sphere in the scene.
   * @param center - The center of the sphere
   * @param radius - The radius of the sphere
   * @param layerMask - Layer mask that is used to selectively filter colliders. @defaultValue `Layer.Everything`
   * @param colliders - Array to store overlapping colliders. @defaultValue `[]`
   * @returns The colliders overlapping with the sphere
   */
  overlapSphereAll(
    center: Vector3,
    radius: number,
    layerMask: Layer = Layer.Everything,
    colliders: Collider[] = []
  ): Collider[] {
    this._syncColliders();
    const ids = this._nativePhysicsScene.overlapSphereAll(center, radius, layerMask);

    return PhysicsScene._collectColliders(ids, colliders);
  }

  /**
   * Get all colliders that overlap with a capsule in the scene.
   * @param center - The center of the capsule
   * @param radius - The radius of the capsule
   * @param height - The height of the capsule
   * @param orientation - The rotation of the capsule. @defaultValue `Quaternion(0, 0, 0, 1)`
   * @param layerMask - Layer mask that is used to selectively filter colliders. @defaultValue `Layer.Everything`
   * @param colliders - Array to store overlapping colliders. @defaultValue `[]`
   * @returns The colliders overlapping with the capsule
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion = PhysicsScene._identityQuaternion,
    layerMask: Layer = Layer.Everything,
    colliders: Collider[] = []
  ): Collider[] {
    this._syncColliders();
    const ids = this._nativePhysicsScene.overlapCapsuleAll(center, radius, height, orientation, layerMask);

    return PhysicsScene._collectColliders(ids, colliders);
  }

  /**
   * Call on every frame to update pose of objects.
   * @internal
   */
  _update(deltaTime: number): void {
    const { _fixedTimeStep: fixedTimeStep, _nativePhysicsScene: nativePhysicsScene } = this;
    const componentsManager = this._scene._componentsManager;

    const simulateTime = this._restTime + deltaTime;
    const step = Math.floor(simulateTime / fixedTimeStep);
    this._restTime = simulateTime - step * fixedTimeStep;
    for (let i = 0; i < step; i++) {
      componentsManager.callScriptOnPhysicsUpdate();
      this._syncColliders();
      nativePhysicsScene.update(fixedTimeStep);
      const bodies = this._bodies;
      for (let i = 0, n = bodies.length; i < n; i++) {
        bodies[i]._writeBack();
      }
      this._dispatchEvents(nativePhysicsScene.updateEvents());
    }
  }

  /**
   * @internal
   * Apply pending component changes to the native scene: Rigidbody poses first, then Collider ownership and poses
   * relative to them, and finally the mass properties that depend on the attached Colliders.
   */
  _syncColliders(): void {
    const dirtyBodies = this._dirtyBodies;
    while (dirtyBodies.length) {
      const body = dirtyBodies.pop()!;
      body._dirtyIndex = -1;
      body._syncPose();
    }
    const dirtyColliders = this._dirtyColliders;
    while (dirtyColliders.length) {
      const collider = dirtyColliders.pop()!;
      collider._dirtyIndex = -1;
      collider._sync();
    }
    const massDirtyBodies = this._massDirtyBodies;
    while (massDirtyBodies.length) {
      const body = massDirtyBodies.pop()!;
      body._massDirty = false;
      body._updateMass();
    }
  }

  /**
   * @internal
   */
  _removeCollider(collider: Collider): void {
    PhysicsScene._removeDirty(this._dirtyColliders, collider);
    collider._detach();
  }

  /**
   * @internal
   */
  _markColliderDirty(collider: Collider): void {
    PhysicsScene._addDirty(this._dirtyColliders, collider);
  }

  /**
   * @internal
   */
  _addRigidbody(body: Rigidbody): void {
    this._nativePhysicsScene.addCollider(body._getNativeActor());
    const bodies = this._bodies;
    body._index = bodies.length;
    bodies.push(body);
    PhysicsScene._addDirty(this._dirtyBodies, body);
    this._markMassDirty(body);
  }

  /**
   * @internal
   */
  _removeRigidbody(body: Rigidbody): void {
    PhysicsScene._removeDirty(this._dirtyBodies, body);
    if (body._massDirty) {
      // Entering a scene again marks the mass dirty there
      body._massDirty = false;
      const massDirtyBodies = this._massDirtyBodies;
      massDirtyBodies.splice(massDirtyBodies.indexOf(body), 1);
    }
    const bodies = this._bodies;
    const last = bodies.pop()!;
    if (last !== body) {
      bodies[body._index] = last;
      last._index = body._index;
    }
    body._index = -1;
    this._nativePhysicsScene.removeCollider(body._getNativeActor());
  }

  /**
   * @internal
   */
  _markBodyDirty(body: Rigidbody): void {
    PhysicsScene._addDirty(this._dirtyBodies, body);
  }

  /**
   * @internal
   */
  _markMassDirty(body: Rigidbody): void {
    if (!body._massDirty) {
      body._massDirty = true;
      this._massDirtyBodies.push(body);
    }
  }

  /**
   * @internal
   */
  _addContactEventConsumer(delta: 1 | -1): void {
    const wasEnabled = this._contactEventConsumerCount > 0;
    this._contactEventConsumerCount += delta;
    const enabled = this._contactEventConsumerCount > 0;
    if (wasEnabled !== enabled) {
      this._nativePhysicsScene?.setContactEventEnabled(enabled);
    }
  }

  /**
   * @internal
   */
  _gc(): void {
    PhysicsScene._raycastHitPool.length = 0;
    PhysicsScene._raycastSeenHits.clear();
    this._nativePhysicsScene?.gc();
  }

  /**
   * @internal
   */
  _destroy(): void {
    PhysicsScene._raycastHitPool.length = 0;
    PhysicsScene._raycastSeenHits.clear();
    this._nativePhysicsScene?.destroy();
  }

  private _dispatchEvents(events: IPhysicsEvents): void {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    const collision = PhysicsScene._collision;
    const { contactEvents, contactEventCount, triggerEvents } = events;

    for (let i = 0, n = contactEventCount; i < n; i++) {
      const event = contactEvents[i];
      const collider0 = physicalObjectsMap[event.shape0Id];
      const collider1 = physicalObjectsMap[event.shape1Id];
      // A Collider destroyed during dispatch is removed from the map; deferred entity destruction keeps it valid
      if (!collider0 || !collider1) continue;
      collision._nativeCollision = event;
      const state = event.state;
      PhysicsScene._dispatchCollision(collision, state, collider0, collider1);
      PhysicsScene._dispatchCollision(collision, state, collider1, collider0);
    }

    for (let i = 0, n = triggerEvents.length; i < n; i++) {
      const event = triggerEvents[i];
      const collider0 = physicalObjectsMap[event.index1];
      const collider1 = physicalObjectsMap[event.index2];
      if (!collider0 || !collider1) continue;
      const state = event.dispatchState;
      PhysicsScene._dispatchTrigger(state, collider0, collider1);
      PhysicsScene._dispatchTrigger(state, collider1, collider0);
    }
  }

  private static _dispatchCollision(
    collision: Collision,
    state: PhysicsEventState,
    self: Collider,
    other: Collider
  ): void {
    self.entity._scripts.forEach((script: Script) => {
      // A script may receive several events; set both sides before each call
      collision.collider = other;
      collision.selfCollider = self;
      switch (state) {
        case PhysicsEventState.Enter:
          script.onCollisionEnter(collision);
          break;
        case PhysicsEventState.Stay:
          script.onCollisionStay(collision);
          break;
        case PhysicsEventState.Exit:
          script.onCollisionExit(collision);
          break;
      }
    }, PhysicsScene._scriptIndexSetter);
  }

  private static _dispatchTrigger(state: PhysicsEventState, self: Collider, other: Collider): void {
    self.entity._scripts.forEach((script: Script) => {
      switch (state) {
        case PhysicsEventState.Enter:
          script.onTriggerEnter(other, self);
          break;
        case PhysicsEventState.Stay:
          script.onTriggerStay(other, self);
          break;
        case PhysicsEventState.Exit:
          script.onTriggerExit(other, self);
          break;
      }
    }, PhysicsScene._scriptIndexSetter);
  }

  private static _addDirty<T extends { _dirtyIndex: number }>(list: T[], item: T): void {
    if (item._dirtyIndex === -1) {
      item._dirtyIndex = list.length;
      list.push(item);
    }
  }

  private static _removeDirty<T extends { _dirtyIndex: number }>(list: T[], item: T): void {
    const index = item._dirtyIndex;
    if (index !== -1) {
      const last = list.pop()!;
      if (last !== item) {
        list[index] = last;
        last._dirtyIndex = index;
      }
      item._dirtyIndex = -1;
    }
  }

  private static _collectColliders(ids: ArrayLike<number>, out: Collider[]): Collider[] {
    const physicalObjectsMap = Engine._physicalObjectsMap;
    out.length = 0;
    for (let i = 0, n = ids.length; i < n; i++) {
      out.push(physicalObjectsMap[ids[i]]);
    }
    return out;
  }

  private static _normalizeDirection(direction: Vector3): Vector3 | null {
    const out = PhysicsScene._tempDirection;
    return Vector3.normalize(direction, out) ? out : null;
  }

  private _setGravity(): void {
    this._nativePhysicsScene.setGravity(this._gravity);
  }

  private _createHitCallback(
    outHitResult: HitResult
  ): (colliderID: number, distance: number, position: Vector3, normal: Vector3) => void {
    return (colliderID: number, distance: number, position: Vector3, normal: Vector3) => {
      this._setHitResult(outHitResult, colliderID, distance, position, normal);
    };
  }

  private _setHitResult(
    outHitResult: HitResult,
    colliderID: number,
    distance: number,
    position: Vector3,
    normal: Vector3
  ): void {
    const collider = Engine._physicalObjectsMap[colliderID];
    outHitResult.entity = collider.entity;
    outHitResult.collider = collider;
    outHitResult.distance = distance;
    outHitResult.point.copyFrom(position);
    outHitResult.normal.copyFrom(normal);
  }

  private _clearHitResult(hitResult: HitResult): void {
    hitResult.entity = null;
    hitResult.collider = null;
    hitResult.distance = 0;
    hitResult.point.set(0, 0, 0);
    hitResult.normal.set(0, 0, 0);
  }
}

/**
 * @internal
 */
enum PhysicsEventState {
  Enter = 0,
  Stay = 1,
  Exit = 2
}
