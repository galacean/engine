import {
  CapsuleColliderShape,
  CharacterController,
  ControllerCollisionFlag,
  Script,
  Layer,
  Vector3,
  type Entity,
  type Ray
} from "@galacean/engine";
import type {
  TerrainNavigationRuntime,
  TerrainNavigationLocomotionOwner
} from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { PLANNING_REFERENCE } from "../../../planning-data/PlanningReference.ts";

/** Reserved physics layer for the player capsule; rendering layers and collision matrix are unchanged. */
export const PLAYER_COLLISION_LAYER = Layer.Layer27;

class RockNavigationDriver extends Script {
  synchronize?: () => void;
  override onUpdate(): void {
    this.synchronize?.();
  }
}

/** Lab capsule collide-and-slide adapted to Seed's existing first-person input and canonical ground/bridges. */
export class RockNavigation implements TerrainNavigationLocomotionOwner {
  private readonly root: Entity;
  private readonly driver: RockNavigationDriver;
  private actor?: Entity;
  private controller?: CharacterController;
  private readonly displacement = new Vector3();
  private readonly lastEye = new Vector3();
  private readonly halfHeight = PLANNING_REFERENCE.actor.heightM / 2;
  private verticalVelocity = 0;
  private grounded = false;
  private disposed = false;

  constructor(
    parent: Entity,
    private readonly navigation: TerrainNavigationRuntime,
    private readonly sampleGround: (x: number, z: number) => number | undefined
  ) {
    this.root = parent.createChild("Seed rock mesh navigation");
    this.driver = this.root.addComponent(RockNavigationDriver);
    this.driver.synchronize = () =>
      this.setActive(
        this.navigation.enabled &&
          this.navigation.groundCollision &&
          !this.navigation.verticalMovementEnabled &&
          !this.navigation.locomotionOwner &&
          this.navigation.groundedLocomotionOwner === this
      );
    navigation.groundedLocomotionOwner = this;
  }

  /** First-person interaction rays must not hit the player's own movement capsule. */
  raycastWorld(ray: Ray, distance: number): boolean {
    return this.root.scene!.physics.raycast(ray, distance, Layer.Everything & ~PLAYER_COLLISION_LAYER);
  }

  setActive(active: boolean): void {
    if (this.disposed) return;
    if (!active) {
      this.actor?.destroy();
      this.actor = undefined;
      this.controller = undefined;
      this.grounded = false;
      this.verticalVelocity = 0;
    } else if (!this.actor) {
      const eye = this.navigation.entity.transform.worldPosition;
      const actor = this.root.createChild("Seed walking capsule");
      try {
        actor.transform.setWorldPosition(eye.x, eye.y - this.navigation.eyeHeight + this.halfHeight, eye.z);
        const controller = actor.addComponent(CharacterController),
          capsule = new CapsuleColliderShape();
        controller.collisionLayer = PLAYER_COLLISION_LAYER;
        capsule.radius = PLANNING_REFERENCE.actor.radiusM;
        capsule.height = PLANNING_REFERENCE.actor.heightM - 2 * capsule.radius;
        capsule.contactOffset = 0.025;
        capsule.material.staticFriction = capsule.material.dynamicFriction = 0;
        controller.addShape(capsule);
        controller.slopeLimit = 50;
        controller.stepOffset = 0.32;
        this.actor = actor;
        this.controller = controller;
        this.lastEye.copyFrom(eye);
      } catch (error) {
        actor.destroy();
        throw error;
      }
    }
  }

  applyInput(right: number, forward: number, sprint: boolean, deltaTime: number): void {
    if (this.disposed || !this.actor || !this.controller) return;
    const nav = this.navigation,
      eye = nav.entity.transform.worldPosition;
    // Camera bookmarks/authoring can teleport. Recreate the capsule at the accepted pose,
    // rather than sweeping a controller across the world or using Engine private teleport APIs.
    if (Vector3.distanceSquared(eye, this.lastEye) > 1e-6) {
      this.setActive(false);
      this.setActive(true);
    }
    const actor = this.actor!,
      controller = this.controller!;
    const dt = Math.min(0.05, Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0);
    if (!dt) return;
    const start = actor.transform.worldPosition,
      startX = start.x,
      startZ = start.z,
      foot = start.y - this.halfHeight;
    const direction = nav.entity.transform.worldForward;
    let fx = direction.x,
      fz = direction.z;
    if (Math.hypot(fx, fz) < 1e-6) {
      const r = nav.entity.transform.worldRight;
      fx = r.z;
      fz = -r.x;
    }
    const heading = Math.hypot(fx, fz);
    fx /= heading;
    fz /= heading;
    const magnitude = Math.hypot(right, forward);
    const strength = magnitude > 0 ? Math.min(1, magnitude * nav.movementSensitivity) / magnitude : 0;
    const distance = Math.max(0, nav.movementSpeed) * (sprint ? 8.5 / 4.8 : 1) * dt * strength;
    let dx = (-fz * right + fx * forward) * distance,
      dz = (fx * right + fz * forward) * distance;
    const targetFloor = this.sampleGround(startX + dx, startZ + dz);
    if (targetFloor === undefined || !Number.isFinite(targetFloor)) dx = dz = 0;
    this.verticalVelocity -= 9.81 * dt;
    const groundRise = targetFloor !== undefined && Number.isFinite(targetFloor) ? targetFloor - foot : -Infinity;
    let collision = controller.move(
      this.displacement.set(dx, Math.max(this.verticalVelocity * dt, groundRise), dz),
      0.0005,
      dt
    );
    // Native terrain/bridge support remains authoritative. The capsule resolves rock walls,
    // slabs and ceilings; no duplicate million-triangle Terrain collider is cooked at startup.
    let position = actor.transform.worldPosition;
    const floor = this.sampleGround(position.x, position.z);
    if (floor !== undefined && Number.isFinite(floor) && position.y - this.halfHeight < floor)
      collision |= controller.move(this.displacement.set(0, floor - (position.y - this.halfHeight), 0), 0.0005, dt);
    position = actor.transform.worldPosition;
    this.grounded =
      Boolean(collision & ControllerCollisionFlag.Down) ||
      (floor !== undefined && Math.abs(position.y - this.halfHeight - floor) <= 0.03);
    if (this.grounded && this.verticalVelocity < 0) this.verticalVelocity = -0.8;
    if (collision & ControllerCollisionFlag.Up && this.verticalVelocity > 0) this.verticalVelocity = 0;
    nav.entity.transform.setWorldPosition(position.x, position.y - this.halfHeight + nav.eyeHeight, position.z);
    this.lastEye.copyFrom(nav.entity.transform.worldPosition);
    const travelled = Math.hypot(position.x - startX, position.z - startZ);
    if (this.grounded && travelled > 0) nav.onGroundedTravel?.(travelled);
  }

  /** Current player foot height keeps rock support and airborne descent above water dry. */
  sampleContactHeight(x: number, z: number): number | undefined {
    const p = this.actor?.transform.worldPosition;
    return p && Math.abs(p.x - x) < 1e-3 && Math.abs(p.z - z) < 1e-3 ? p.y - this.halfHeight : undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.setActive(false);
    this.disposed = true;
    if (this.navigation.groundedLocomotionOwner === this) this.navigation.groundedLocomotionOwner = null;
    this.driver.synchronize = undefined;
    this.root.destroy();
  }
}
