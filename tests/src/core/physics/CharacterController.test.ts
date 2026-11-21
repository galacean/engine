import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  CharacterController,
  CharacterControllerGeometry,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  Entity,
  HitResult,
  Layer,
  PhysicsScene,
  PlaneCollider,
  Rigidbody,
  Script
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

describe("CharacterController", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let role: Entity;
  let controller: CharacterController;
  let physics: PhysicsScene;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("controllers");
    role = root.createChild("role");
    controller = role.addComponent(CharacterController);
    controller.geometry = CharacterControllerGeometry.Box;
    addPlane(new Vector3(), new Quaternion());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function addPlane(position: Vector3, rotation: Quaternion): Entity {
    const entity = root.createChild("plane");
    entity.transform.position = position;
    entity.transform.rotationQuaternion = rotation;
    entity.addComponent(PlaneCollider);
    return entity;
  }

  function addBox(size: Vector3, position: Vector3): BoxCollider {
    const box = root.createChild("box").addComponent(BoxCollider);
    box.size = size;
    box.entity.transform.position = position;
    return box;
  }

  function move(displacement: Vector3): number {
    return controller.move(displacement, 0.0001, physics.fixedTimeStep);
  }

  function update(count = 1): void {
    for (let i = 0; i < count; i++) physics._update(physics.fixedTimeStep);
  }

  function walkTo(position: Vector3, steps: number): void {
    const displacement = position
      .clone()
      .subtract(role.transform.position)
      .scale(1 / steps);
    let fallingTime = 0;
    for (let i = 0; i < steps; i++) {
      const flags = move(displacement);
      if (flags & ControllerCollisionFlag.Down) fallingTime = 0;
      else {
        fallingTime += physics.fixedTimeStep;
        move(new Vector3(0, -9.8 * physics.fixedTimeStep * fallingTime, 0));
      }
    }
  }

  it("defaults to inline capsule geometry and standard movement settings", () => {
    const capsule = root.createChild("capsule").addComponent(CharacterController);
    expect(capsule.contactOffset).toBe(0.02);
    expect(capsule.geometry).toBe(CharacterControllerGeometry.Capsule);
    expect(capsule.radius).toBe(0.5);
    expect(capsule.height).toBe(1);
    expect(capsule.size.x).toBe(1);
    expect(capsule.size.y).toBe(1);
    expect(capsule.size.z).toBe(1);
    expect(capsule.stepOffset).toBe(0.5);
    expect(capsule.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbing);
    expect(capsule.upDirection.x).toBe(0);
    expect(capsule.upDirection.y).toBe(1);
    expect(capsule.upDirection.z).toBe(0);
    expect(capsule.slopeLimit).toBe(45);
  });

  it("writes the world position immediately when moved under a transformed parent", () => {
    root.transform.setPosition(10, 20, 30);
    root.transform.setScale(2, 2, 2);
    role.transform.setPosition(1, 5, 2);
    move(new Vector3(0, 0, 1));
    expect(role.transform.worldPosition.x).toBeCloseTo(12);
    expect(role.transform.worldPosition.y).toBeCloseTo(30);
    expect(role.transform.worldPosition.z).toBeCloseTo(35);
    expect(role.transform.position.z).toBeCloseTo(2.5);
    update(2);
    expect(role.transform.worldPosition.z).toBeCloseTo(35);
  });

  it("moves during a real physics script callback", () => {
    role.transform.setPosition(0, 2, 0);
    class Movement extends Script {
      override onPhysicsUpdate(): void {
        this.entity.getComponent(CharacterController).move(new Vector3(0, 0, 0.25), 0.0001, physics.fixedTimeStep);
      }
    }
    role.addComponent(Movement);
    engine.update();
    const start = role.transform.position.z;
    update(4);
    expect(role.transform.position.z).toBeCloseTo(start + 1);
  });

  it.each([true, false])("scene-query participation %s preserves controller collisions", (enabled) => {
    role.transform.setPosition(0, 2, 0);
    const wall = addBox(new Vector3(10, 10, 1), new Vector3(0, 2, 2));
    wall.isSceneQuery = enabled;
    expect(physics.raycastAll(new Ray(new Vector3(0, 5, 0), new Vector3(0, 0, 1)))).toBe(enabled);
    expect(move(new Vector3(0, 0, 4)) & ControllerCollisionFlag.Sides).toBe(ControllerCollisionFlag.Sides);
    expect(role.transform.position.z).toBeCloseTo(0.98, 4);
  });

  it("updates upDirection before and after the first move", () => {
    expect(move(new Vector3(0, 0, 1)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
    controller.upDirection = new Vector3(0, -1, 0);
    expect(move(new Vector3(0, 0, 1)) & ControllerCollisionFlag.Up).toBe(ControllerCollisionFlag.Up);
    controller.upDirection.set(0, 1, 0);
    // A sideways move only probes the ground after a grounded move, so push into the ground instead
    expect(move(new Vector3(0, -0.1, 0)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
  });

  it("applies contactOffset to the collision skin immediately", () => {
    move(new Vector3(0, 0, 0.1));
    move(new Vector3(0, 0, 0.1));
    expect(role.transform.position.y).toBeCloseTo(0.52, 5);
    controller.contactOffset = 1;
    move(new Vector3(0, 0, 0.1));
    move(new Vector3(0, 0, 0.1));
    expect(role.transform.position.y).toBeCloseTo(1.5, 5);
  });

  it.each([false, true])("rejects invalid contactOffset without changing its value (live=%s)", (live) => {
    controller.contactOffset = 0.3;
    if (live) move(new Vector3(0, 0, 0.1));
    for (const value of [-1, 0, NaN, Infinity, -Infinity]) {
      expect(() => (controller.contactOffset = value)).toThrow();
      expect(controller.contactOffset).toBe(0.3);
    }
    move(new Vector3(0, 0, 0.1));
    move(new Vector3(0, 0, 0.1));
    expect(role.transform.position.y).toBeCloseTo(0.8, 5);
  });

  it.each([false, true])("rejects trigger mode before and after synchronization (live=%s)", (live) => {
    if (live) move(new Vector3(0, 0, 1));
    expect(() => (controller.isTrigger = true)).toThrow();
    controller.isTrigger = false;
    expect(controller.isTrigger).toBe(false);
  });

  it("logs an error for an invalid descriptor and recovers once the geometry allows it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    controller.size = new Vector3(1, 1, 1);
    // stepOffset above the box height makes PhysX reject the descriptor
    controller.stepOffset = 100;
    physics._update(physics.fixedTimeStep);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed to create"));
    expect(() => controller.move(new Vector3(0.1, 0, 0), 0, physics.fixedTimeStep)).not.toThrow();

    controller.stepOffset = 0.1;
    controller.size = new Vector3(2, 2, 2);
    role.transform.setPosition(0, 2, 0);
    physics._update(physics.fixedTimeStep);
    controller.move(new Vector3(0.1, 0, 0), 0, physics.fixedTimeStep);
    expect(role.transform.position.x).toBeGreaterThan(0.05);
  });

  it("retries creation when only the offending field is corrected", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    controller.size = new Vector3(1, 1, 1);
    controller.stepOffset = 100;
    role.transform.setPosition(0, 2, 0);
    physics._update(physics.fixedTimeStep);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("failed to create"));

    // Correcting stepOffset alone must be enough, without another geometry change
    controller.stepOffset = 0.1;
    controller.move(new Vector3(0.1, 0, 0), 0, physics.fixedTimeStep);
    expect(role.transform.position.x).toBeGreaterThan(0.05);
  });

  it("reports unsupported getClosestPoint without changing its output", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const closest = new Vector3(1, 2, 3);
    expect(controller.getClosestPoint(new Vector3(), closest)).toBe(-1);
    expect(errors).toHaveBeenCalledOnce();
    expect(closest.x).toBe(1);
    expect(closest.y).toBe(2);
    expect(closest.z).toBe(3);
  });

  it.each([CharacterControllerGeometry.Box, CharacterControllerGeometry.Capsule])(
    "scales inline geometry and center by world scale (geometry=%s)",
    (geometry) => {
      controller.geometry = geometry;
      controller.size.set(1, 2, 1);
      controller.center = new Vector3(0, 1, 0);
      role.transform.setScale(2, 3, 4);
      role.transform.setPosition(0, 10, 0);
      const flags = move(new Vector3(0, -20, 0));
      expect(flags & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
      expect(role.transform.position.y).toBeCloseTo(geometry === CharacterControllerGeometry.Box ? 0.02 : 0.52, 4);
      controller.center.y = 0;
      role.transform.setPosition(0, 10, 0);
      move(new Vector3(0, -20, 0));
      expect(role.transform.position.y).toBeCloseTo(geometry === CharacterControllerGeometry.Box ? 3.02 : 3.52, 4);
      role.transform.setScale(1, 1, 1);
      role.transform.setPosition(0, 10, 0);
      move(new Vector3(0, -20, 0));
      expect(role.transform.position.y).toBeCloseTo(1.02, 4);
    }
  );

  it("changes capsule radius and cylinder height after creation", () => {
    controller.geometry = CharacterControllerGeometry.Capsule;
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(1.02, 4);
    controller.radius = 1;
    controller.height = 4;
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(3.02, 4);
  });

  it("updates box width through assignment and vector mutation", () => {
    controller.size = new Vector3(1, 1, 1);
    role.transform.setPosition(0, 2, 0);
    addBox(new Vector3(1, 10, 10), new Vector3(3, 2, 0));
    move(new Vector3(5, 0, 0));
    expect(role.transform.position.x).toBeCloseTo(1.98, 4);
    controller.size.x = 3;
    role.transform.setPosition(0, 2, 0);
    move(new Vector3(5, 0, 0));
    expect(role.transform.position.x).toBeCloseTo(0.98, 4);
  });

  it("updates box height to block passage under a low ceiling", () => {
    addBox(new Vector3(5, 0.4, 1), new Vector3(0, 1.5, 2));
    controller.stepOffset = 0.1;
    controller.size.set(1, 1, 1);
    role.transform.setPosition(0, 0.52, 0);
    move(new Vector3(0, 0, 3));
    expect(role.transform.position.z).toBeCloseTo(3, 4);
    controller.size.set(1, 2, 1);
    role.transform.setPosition(0, 1.02, 0);
    move(new Vector3(0, 0, 3));
    expect(role.transform.position.z).toBeLessThan(1.1);
  });

  it("switches live geometry in both directions without changing Entity position", () => {
    role.transform.setPosition(4, 5, 6);
    controller.size.set(4, 1, 1);
    const ray = new Ray(new Vector3(5.5, 10, 6), new Vector3(0, -1, 0));
    const hit = new HitResult();
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider === controller).toBe(true);
    controller.geometry = CharacterControllerGeometry.Capsule;
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider === controller).toBe(false);
    expect(role.transform.position.x).toBe(4);
    expect(role.transform.position.y).toBe(5);
    expect(role.transform.position.z).toBe(6);
    controller.geometry = CharacterControllerGeometry.Box;
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider === controller).toBe(true);
    move(new Vector3(0, 0, 1));
    expect(role.transform.position.z).toBe(7);
  });

  it.each([1, 45])("uses slopeLimit %s to control climbing", (limit) => {
    physics.overlapSphereAll(new Vector3(0, 5, 0), 0.1);
    controller.slopeLimit = limit;
    // A slope exactly at the limit depends on float rounding, so use one clearly below 45 degrees
    addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX((-40 * Math.PI) / 180));
    walkTo(new Vector3(0, 0, 3), 50);
    if (limit === 45) expect(role.transform.position.z).toBeCloseTo(3, 5);
    else expect(role.transform.position.z).toBeLessThan(2);
  });

  it.each([0.5, 1])("uses stepOffset %s to control stepping over an obstacle", (offset) => {
    physics.overlapSphereAll(new Vector3(0, 5, 0), 0.1);
    controller.stepOffset = offset;
    addBox(new Vector3(1, 1, 1), new Vector3(0, 0.5, 3));
    walkTo(new Vector3(0, 0, 3), 2);
    if (offset === 1) {
      expect(role.transform.position.z).toBeCloseTo(3, 5);
      expect(role.transform.position.y).toBeGreaterThan(1);
    } else {
      expect(role.transform.position.z).toBeLessThan(2);
      expect(role.transform.position.y).toBeLessThan(1);
    }
    controller.stepOffset = -1;
    expect(controller.stepOffset).toBe(0);
  });

  it.each([ControllerNonWalkableMode.PreventClimbing, ControllerNonWalkableMode.PreventClimbingAndForceSliding])(
    "applies nonWalkableMode %s on steep slopes",
    (mode) => {
      physics.overlapSphereAll(new Vector3(0, 5, 0), 0.1);
      controller.slopeLimit = 1;
      controller.nonWalkableMode = mode;
      addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
      walkTo(new Vector3(0, 0.02, 3), 50);
      if (mode === ControllerNonWalkableMode.PreventClimbing) expect(role.transform.position.y).toBeGreaterThan(1);
      else expect(role.transform.position.y).toBeLessThan(1);
    }
  );

  it.each(["enabled", "active"])("preserves position and settings after %s re-entry", (state) => {
    controller.contactOffset = 0.3;
    controller.center.set(0, 0.2, 0);
    role.transform.setPosition(0, 2, 3);
    move(new Vector3(0, -3, 0));
    expect(role.transform.position.y).toBeCloseTo(0.6, 4);
    if (state === "enabled") controller.enabled = false;
    else role.isActive = false;
    expect(move(new Vector3(0, 0, 10))).toBe(0);
    expect(role.transform.position.z).toBe(3);
    expect(physics.overlapSphereAll(new Vector3(0, 0.8, 3), 0.1)).toHaveLength(0);
    controller.stepOffset = 0.2;
    controller.slopeLimit = 30;
    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    if (state === "enabled") controller.enabled = true;
    else role.isActive = true;
    expect(physics.overlapSphereAll(new Vector3(0, 0.8, 3), 0.1)[0]).toBe(controller);
    move(new Vector3(0, 0, 1));
    expect(role.transform.position.z).toBeCloseTo(4);
    expect(role.transform.position.y).toBeCloseTo(0.6, 4);
    expect(controller.contactOffset).toBe(0.3);
    expect(controller.stepOffset).toBe(0.2);
    expect(controller.slopeLimit).toBe(30);
    expect(controller.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbingAndForceSliding);
  });

  it.each([CharacterControllerGeometry.Box, CharacterControllerGeometry.Capsule])(
    "applies geometry edited while disabled on re-entry (geometry=%s)",
    (geometry) => {
      role.transform.setPosition(0, 10, 0);
      move(new Vector3(0, 0, 1));
      controller.enabled = false;
      controller.geometry = geometry;
      controller.size = new Vector3(2, 4, 2);
      controller.radius = 0.2;
      controller.height = 1;
      controller.contactOffset = 0.1;
      controller.enabled = true;
      move(new Vector3(0, -20, 0));
      expect(role.transform.position.y).toBeCloseTo(geometry === CharacterControllerGeometry.Box ? 2.1 : 0.8, 4);
      expect(role.transform.position.z).toBeCloseTo(1);
    }
  );

  it.each([CharacterControllerGeometry.Box, CharacterControllerGeometry.Capsule])(
    "clones inline geometry and movement settings independently (geometry=%s)",
    (geometry) => {
      controller.geometry = geometry;
      controller.center.set(0, 0.2, 0);
      controller.contactOffset = 0.1;
      controller.size.set(2, 4, 2);
      controller.radius = 0.2;
      controller.height = 1;
      controller.stepOffset = 0.2;
      controller.slopeLimit = 30;
      controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
      const clone = role.clone();
      root.addChild(clone);
      clone.transform.setPosition(10, 10, 0);
      const copy = clone.getComponent(CharacterController);
      expect(copy).not.toBe(controller);
      expect(copy.geometry).toBe(geometry);
      expect(copy.size).not.toBe(controller.size);
      expect(copy.center).not.toBe(controller.center);
      expect(copy.upDirection).not.toBe(controller.upDirection);
      expect(copy.contactOffset).toBe(0.1);
      expect(copy.radius).toBe(0.2);
      expect(copy.height).toBe(1);
      expect(copy.stepOffset).toBe(0.2);
      expect(copy.slopeLimit).toBe(30);
      expect(copy.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbingAndForceSliding);
      copy.move(new Vector3(0, -20, 0), 0.0001, physics.fixedTimeStep);
      expect(clone.transform.position.y).toBeCloseTo(geometry === CharacterControllerGeometry.Box ? 1.9 : 0.6, 4);
      copy.center.y = 3;
      copy.size.y = 8;
      expect(controller.center.y).toBe(0.2);
      expect(controller.size.y).toBe(4);
    }
  );

  it.each([Layer.Layer1, Layer.Layer10])("filters controller triggers using collisionLayer %s", (layer) => {
    controller.collisionLayer = layer;
    const trigger = addBox(new Vector3(1, 1, 1), new Vector3(0, 0.6, 2));
    trigger.collisionLayer = Layer.Layer2;
    trigger.isTrigger = true;
    class TriggerRecorder extends Script {
      onTriggerEnter = vi.fn();
      onTriggerExit = vi.fn();
    }
    const recorder = trigger.entity.addComponent(TriggerRecorder);
    move(new Vector3(0, 0, 2));
    // PhysX moves the controller's kinematic actor at the end of a step, so triggers see the move in the next one
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    role.transform.setPosition(0, 0.6, 0);
    update(2);
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    physics.setColliderLayerCollision(layer, Layer.Layer2, false);
    try {
      move(new Vector3(0, 0, 2));
      update(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    } finally {
      physics.setColliderLayerCollision(layer, Layer.Layer2, true);
    }
  });

  it("recovers at the updated position after invalid geometry without unrelated setter error spam", () => {
    const entity = root.createChild("recovering-controller");
    entity.transform.setPosition(0, 5, 0);
    const cc = entity.addComponent(CharacterController);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    cc.stepOffset = 10;
    physics._update(physics.fixedTimeStep);
    const errorCountAfterInvalid = errors.mock.calls.length;
    expect(errorCountAfterInvalid).toBeGreaterThan(0);

    cc.collisionLayer = Layer.Layer3;
    cc.isSceneQuery = true;
    expect(errors.mock.calls.length).toBe(errorCountAfterInvalid);

    entity.transform.setPosition(8, 2, 0);
    cc.stepOffset = 0.5;

    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(8, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3, hit)).toBe(true);
    expect(hit.collider === cc).toBe(true);
    expect(hit.point.x).toBeCloseTo(8, 3);
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3)).toBe(false);
  });

  it("normalizes non-unit upDirection and tolerates transient zero upDirection", () => {
    controller.upDirection.set(0, 2, 0);
    expect(controller.upDirection.x).toBeCloseTo(0, 5);
    expect(controller.upDirection.y).toBeCloseTo(1, 5);
    expect(controller.upDirection.z).toBeCloseTo(0, 5);

    controller.upDirection.set(0, 0, 0);
    controller.upDirection.y = 3;
    expect(controller.upDirection.y).toBeCloseTo(1, 5);

    role.transform.setPosition(0, 3, 0);
    const flags = move(new Vector3(0, -5, 0));
    expect(Boolean(flags & ControllerCollisionFlag.Down)).toBe(true);
    expect(role.transform.position.y).toBeCloseTo(0.52, 2);
  });

  it("clamps slopeLimit to [0, 90] and rejects non-finite slopeLimit or stepOffset", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    controller.slopeLimit = 120;
    expect(controller.slopeLimit).toBe(90);
    controller.slopeLimit = -10;
    expect(controller.slopeLimit).toBe(0);
    controller.slopeLimit = 90;

    controller.enabled = false;
    controller.enabled = true;
    expect(errors).not.toHaveBeenCalled();

    role.transform.setPosition(0, 2, 0);
    const flags = move(new Vector3(0, -4, 0));
    expect(Boolean(flags & ControllerCollisionFlag.Down)).toBe(true);

    expect(() => {
      controller.slopeLimit = NaN;
    }).toThrow();
    expect(() => {
      controller.slopeLimit = Infinity;
    }).toThrow();
    expect(() => {
      controller.stepOffset = NaN;
    }).toThrow();
    expect(() => {
      controller.stepOffset = Infinity;
    }).toThrow();
  });

  it("ignores move calls after destroy while the entity stays active", () => {
    controller.destroy();
    expect(controller.destroyed).toBe(true);
    expect(move(new Vector3(1, 0, 0))).toBe(0);
  });

  it("updates scene queries immediately when teleported via entity transform or center", () => {
    role.transform.setPosition(0, 2, 0);
    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Everything, hit)).toBe(
      true
    );
    expect(hit.collider).toBe(controller);

    // Teleport without stepping simulation: queries must immediately reflect the new pose
    role.transform.setPosition(12, 2, 0);
    expect(physics.overlapSphereAll(new Vector3(12, 2, 0), 0.1)).toContain(controller);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1)).not.toContain(controller);

    controller.center = new Vector3(0, 3, 0);
    expect(physics.overlapSphereAll(new Vector3(12, 5, 0), 0.1)).toContain(controller);
    expect(physics.overlapSphereAll(new Vector3(12, 2, 0), 0.1)).not.toContain(controller);
  });

  it("clamps negative dimensions, rejects non-finite scalars, and detaches cleanly on zero dimensions or scale", () => {
    for (const invalid of [NaN, Infinity, -Infinity]) {
      expect(() => (controller.radius = invalid)).toThrow();
      expect(() => (controller.height = invalid)).toThrow();
    }
    controller.radius = -1;
    controller.height = -2;
    expect(controller.radius).toBe(0);
    expect(controller.height).toBe(0);

    controller.size = new Vector3(-1, 2, 1);
    expect(controller.size.x).toBe(0);
    expect(controller.size.y).toBe(2);

    // Valid box first
    controller.size = new Vector3(1, 1, 1);
    role.transform.setPosition(0, 2, 0);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1)).toContain(controller);

    // Zero scale detaches cleanly (no stale hitbox, move returns 0 without throwing)
    role.transform.setScale(0, 1, 1);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1)).not.toContain(controller);
    expect(move(new Vector3(2, 0, 0))).toBe(0);
    expect(role.transform.position.x).toBe(0);

    // Restoring positive scale re-attaches cleanly
    role.transform.setScale(1, 1, 1);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1)).toContain(controller);
    move(new Vector3(2, 0, 0));
    expect(role.transform.position.x).toBeCloseTo(2, 4);

    // Capsule with zero height detaches and recovers cleanly
    controller.geometry = CharacterControllerGeometry.Capsule;
    controller.radius = 0.5;
    controller.height = 0;
    expect(physics.overlapSphereAll(new Vector3(2, 2, 0), 0.1)).not.toContain(controller);
    expect(move(new Vector3(2, 0, 0))).toBe(0);
    controller.height = 1;
    expect(physics.overlapSphereAll(new Vector3(2, 2, 0), 0.1)).toContain(controller);
    move(new Vector3(1, 0, 0));
    expect(role.transform.position.x).toBeCloseTo(3, 4);
  });

  describe("move() collision layer and matrix filtering", () => {
    afterEach(() => {
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, true);
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer3, true);
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer4, true);
    });

    it("filters static and dynamic colliders and invalidates cached obstacles on matrix or layer change", () => {
      controller.collisionLayer = Layer.Layer1;
      role.transform.setPosition(0, 2, 0);

      // Static wall on Layer2
      const staticWall = addBox(new Vector3(1, 4, 4), new Vector3(2, 2, 0));
      staticWall.collisionLayer = Layer.Layer2;
      // Dynamic wall (kinematic body) on Layer3
      const dynEntity = root.createChild("dyn-wall");
      dynEntity.transform.setPosition(5, 2, 0);
      const dynWall = dynEntity.addComponent(BoxCollider);
      dynWall.size = new Vector3(1, 4, 4);
      dynWall.collisionLayer = Layer.Layer3;
      dynEntity.addComponent(Rigidbody).isKinematic = true;

      // Initially blocked by static wall at x = 2 (stops near 2 - 0.5 - 0.5 - 0.02 = 0.98)
      const hitStatic = move(new Vector3(4, 0, 0));
      expect(Boolean(hitStatic & ControllerCollisionFlag.Sides)).toBe(true);
      expect(role.transform.position.x).toBeCloseTo(0.98, 2);

      // Disable Layer1 <-> Layer2: must pass through static wall and stop at dynamic wall (x = 5 -> ~3.98)
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, false);
      const hitDyn = move(new Vector3(6, 0, 0));
      expect(Boolean(hitDyn & ControllerCollisionFlag.Sides)).toBe(true);
      expect(role.transform.position.x).toBeCloseTo(3.98, 2);

      // Disable Layer1 <-> Layer3: must pass through dynamic wall as well
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer3, false);
      move(new Vector3(4, 0, 0));
      expect(role.transform.position.x).toBeCloseTo(7.98, 2);

      // Re-enable Layer1 <-> Layer2 and move back: static wall must block again (cache invalidated)
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, true);
      move(new Vector3(-10, 0, 0));
      expect(role.transform.position.x).toBeCloseTo(3.02, 2);
    });

    it("filters compound Rigidbody child colliders independently by layer and never blocks on triggers", () => {
      controller.collisionLayer = Layer.Layer1;
      role.transform.setPosition(0, 2, 0);

      // Trigger on an ENABLED layer must NOT block move()
      const triggerWall = addBox(new Vector3(1, 4, 4), new Vector3(1.5, 2, 0));
      triggerWall.collisionLayer = Layer.Layer1;
      triggerWall.isTrigger = true;
      class TriggerRecorder extends Script {
        onTriggerEnter = vi.fn();
      }
      const triggerRecorder = triggerWall.entity.addComponent(TriggerRecorder);

      // Compound kinematic Rigidbody with two child colliders on different layers
      const compound = root.createChild("compound");
      compound.addComponent(Rigidbody).isKinematic = true;
      const firstChild = compound.createChild("passable");
      firstChild.transform.setPosition(3, 2, 0);
      const firstCol = firstChild.addComponent(BoxCollider);
      firstCol.size = new Vector3(1, 4, 4);
      firstCol.collisionLayer = Layer.Layer2;
      const secondChild = compound.createChild("solid");
      secondChild.transform.setPosition(6, 2, 0);
      const secondCol = secondChild.addComponent(BoxCollider);
      secondCol.size = new Vector3(1, 4, 4);
      secondCol.collisionLayer = Layer.Layer3;
      secondCol.isSceneQuery = false; // non-query solid must still block CCT

      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, false);
      const flags = move(new Vector3(10, 0, 0));
      expect(Boolean(flags & ControllerCollisionFlag.Sides)).toBe(true);
      // Passed through trigger at 1.5 and Layer2 child at 3, stopped at Layer3 child at 6 (~4.98)
      expect(role.transform.position.x).toBeCloseTo(4.98, 2);

      // Walk back into trigger to verify triggers still fire events
      role.transform.setPosition(0, 2, 0);
      move(new Vector3(1.5, 0, 0));
      update(2);
      expect(triggerRecorder.onTriggerEnter).toHaveBeenCalled();
    });

    it("filters controller-vs-controller collisions using collisionLayer and the layer matrix", () => {
      controller.collisionLayer = Layer.Layer1;
      role.transform.setPosition(0, 2, 0);

      const otherEntity = root.createChild("other-cct");
      otherEntity.transform.setPosition(3, 2, 0);
      const otherCC = otherEntity.addComponent(CharacterController);
      otherCC.geometry = CharacterControllerGeometry.Box;
      otherCC.collisionLayer = Layer.Layer4;

      // Sync both controllers into scene
      otherCC.move(new Vector3(0, 0, 0), 0.0001, physics.fixedTimeStep);

      // Enabled layer pair -> blocked before x = 3 (box half-width 0.5 + 0.5 + contactOffset 0.02 + 0.02)
      const blockedFlags = move(new Vector3(5, 0, 0));
      expect(Boolean(blockedFlags & ControllerCollisionFlag.Sides)).toBe(true);
      expect(role.transform.position.x).toBeLessThan(2.1);

      // Disable Layer1 <-> Layer4 -> passes straight through otherCC
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer4, false);
      role.transform.setPosition(0, 2, 0);
      move(new Vector3(6, 0, 0));
      expect(role.transform.position.x).toBeCloseTo(6, 2);

      // Re-enable and change otherCC layer to Layer2 with Layer1<->Layer2 disabled -> still passes through
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer4, true);
      physics.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, false);
      otherCC.collisionLayer = Layer.Layer2;
      role.transform.setPosition(0, 2, 0);
      move(new Vector3(6, 0, 0));
      expect(role.transform.position.x).toBeCloseTo(6, 2);
    });

    it("validates size, upDirection, float32 bounds, negative move args, and clean failed-creation recovery", () => {
      for (const invalid of [new Vector3(NaN, 1, 1), new Vector3(1, Infinity, 1), new Vector3(1, 1, -Infinity)]) {
        expect(() => (controller.size = invalid)).toThrow();
        expect(() => (controller.upDirection = invalid)).toThrow();
      }
      expect(() => (controller.size.x = NaN)).toThrow();
      expect(Number.isFinite(controller.size.x)).toBe(true);
      expect(() => (controller.upDirection.y = NaN)).toThrow();
      expect(controller.upDirection.y).toBeCloseTo(1, 5);

      // Whole-vector zero upDirection is rejected without JS/native drift
      controller.upDirection = new Vector3(0, 1, 0);
      controller.upDirection = new Vector3(0, 0, 0);
      expect(controller.upDirection.y).toBeCloseTo(1, 5);

      // Float32 underflow / overflow detaches and recovers cleanly
      controller.height = 1e-40;
      expect(move(new Vector3(1, 0, 0))).toBe(0);
      controller.height = 1e40;
      expect(move(new Vector3(1, 0, 0))).toBe(0);
      controller.height = 1;
      controller.radius = 0.5;
      role.transform.setPosition(0, 2, 0);

      // Negative minDist / elapsedTime rejected cleanly by native guard
      expect(controller.move(new Vector3(1, 0, 0), -0.1, physics.fixedTimeStep)).toBe(0);
      expect(controller.move(new Vector3(1, 0, 0), 0.0001, -1)).toBe(0);

      // Failed-creation recovery: unrelated setters do not spam errors and recovery uses updated position
      const recoverEntity = root.createChild("recover-cct");
      recoverEntity.transform.setPosition(0, 5, 0);
      const recoverCC = recoverEntity.addComponent(CharacterController);
      recoverCC.stepOffset = 10; // invalid (> total capsule height 2)

      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      recoverCC.move(new Vector3(0, -0.1, 0), 0.0001, physics.fixedTimeStep);
      expect(errors).toHaveBeenCalledTimes(1);

      errors.mockClear();
      recoverEntity.transform.setPosition(7, 4, -2);
      recoverCC.collisionLayer = Layer.Layer3;
      recoverCC.isSceneQuery = true;
      recoverCC.nonWalkableMode = ControllerNonWalkableMode.ForceSliding;
      recoverCC.upDirection = new Vector3(0, 1, 0);
      expect(errors).not.toHaveBeenCalled();

      recoverCC.stepOffset = 0.3;
      recoverCC.move(new Vector3(0, 0, 0), 0.0001, physics.fixedTimeStep);
      expect(errors).not.toHaveBeenCalled();
      expect(recoverEntity.transform.position.x).toBeCloseTo(7, 4);
      expect(recoverEntity.transform.position.y).toBeCloseTo(4, 4);
      expect(recoverEntity.transform.position.z).toBeCloseTo(-2, 4);

      const hit = new HitResult();
      expect(physics.raycast(new Ray(new Vector3(7, 8, -2), new Vector3(0, -1, 0)), 10, Layer.Layer3, hit)).toBe(true);
      expect(hit.collider).toBe(recoverCC);
    });

    it("updates proxy actor orientation immediately on live upDirection changes for asymmetric Box CCT", () => {
      const boxEntity = root.createChild("asymmetric-box-cct");
      boxEntity.transform.setPosition(0, 0, 0);
      const boxCC = boxEntity.addComponent(CharacterController);
      boxCC.geometry = CharacterControllerGeometry.Box;
      // Local X = 2 (halfSide=1), Y = 4 (halfHeight=2), Z = 6 (halfForward=3)
      boxCC.size.set(2, 4, 6);
      boxCC.stepOffset = 0.2;
      boxCC.upDirection = new Vector3(0, 1, 0);

      const hit = new HitResult();
      // With up = +Y: Y extent is [-2, 2], X extent is [-1, 1]
      expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
      expect(hit.collider).toBe(boxCC);
      expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);

      // Live upDirection change to +X swaps halfHeight (2) onto world X and halfSide (1) onto world Y immediately
      boxCC.upDirection = new Vector3(1, 0, 0);
      expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
      expect(hit.collider).toBe(boxCC);
      expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);

      // Stepping physics preserves the updated orientation (kinematic target matches global pose)
      physics._update(physics.fixedTimeStep);
      expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
      expect(hit.collider).toBe(boxCC);
      expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);

      // In-place NaN throws and syncs fallback (0, 1, 0) back to native immediately
      expect(() => (boxCC.upDirection.x = NaN)).toThrow();
      expect(boxCC.upDirection.y).toBeCloseTo(1, 5);
      expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
      expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);
    });

    it("syncs sub-1e-6 scale, position, and center edits without dropping updates", () => {
      const tinyScaleEntity = root.createChild("tiny-scale-cct");
      tinyScaleEntity.transform.setPosition(0, 10, 0);
      tinyScaleEntity.transform.setScale(1e-6, 1e-6, 1e-6);
      const tinyScaleCC = tinyScaleEntity.addComponent(CharacterController);
      tinyScaleCC.geometry = CharacterControllerGeometry.Box;
      tinyScaleCC.size.set(1e6, 1e6, 1e6);
      tinyScaleCC.contactOffset = 0.01;
      tinyScaleCC.collisionLayer = Layer.Layer5;

      const hit = new HitResult();
      const edgeRay = new Ray(new Vector3(0.6, 10, 5), new Vector3(0, 0, -1));
      expect(physics.raycast(edgeRay, 10, Layer.Layer5, hit)).toBe(false);

      // Delta 5e-7 < 1e-6: world size grows from 1.0 to 1.5
      tinyScaleEntity.transform.setScale(1.5e-6, 1.5e-6, 1.5e-6);
      expect(physics.raycast(edgeRay, 10, Layer.Layer5, hit)).toBe(true);
      expect(hit.collider).toBe(tinyScaleCC);

      // Simultaneous -2^-21 translation + +2^-21 center edit on a narrow box keeps the exact world center
      const shift = 2 ** -21;
      const shiftEntity = root.createChild("sub-eps-shift-cct");
      shiftEntity.transform.setPosition(0, 20, 0);
      const shiftCC = shiftEntity.addComponent(CharacterController);
      shiftCC.geometry = CharacterControllerGeometry.Box;
      shiftCC.size.set(4e-7, 1, 1);
      shiftCC.center.set(1, 0, 0);
      shiftCC.contactOffset = 1e-7;
      shiftCC.collisionLayer = Layer.Layer6;

      const centerRay = new Ray(new Vector3(1, 20, 5), new Vector3(0, 0, -1));
      expect(physics.raycast(centerRay, 10, Layer.Layer6, hit)).toBe(true);
      expect(hit.collider).toBe(shiftCC);

      shiftEntity.transform.setPosition(-shift, 20, 0);
      expect(physics.raycast(centerRay, 10, Layer.Layer6, hit)).toBe(false);

      shiftCC.center.set(1 + shift, 0, 0);
      expect(physics.raycast(centerRay, 10, Layer.Layer6, hit)).toBe(true);
      expect(hit.collider).toBe(shiftCC);
    });

    it("keeps one native pose when offset and world position cancel each other", () => {
      const ray = new Ray(new Vector3(0, 8, 0), new Vector3(0, -1, 0));
      const hit = new HitResult();
      expect(physics.raycast(ray, hit) && hit.collider === controller).toBe(true);
      const native = controller["_native"] as unknown as { _syncControllerPose(): void };
      const writes = vi.spyOn(native, "_syncControllerPose");

      role.transform.position.x = 1;
      controller.center.x = -1;

      expect(physics.raycast(ray, hit) && hit.collider === controller).toBe(true);
      expect(writes).not.toHaveBeenCalled();
    });

    it("uses the authored position and center before composing the native controller pose", () => {
      const entity = engine.sceneManager.activeScene.createRootEntity("offset-controller");
      try {
        const x = 2 ** 23;
        entity.transform.setPosition(x, 10, 0);
        const cc = entity.addComponent(CharacterController);
        cc.geometry = CharacterControllerGeometry.Box;
        cc.size.set(0.1, 1, 0.1);
        cc.stepOffset = 0.05;
        cc.contactOffset = 0.01;
        cc.center.x = -x;
        cc.collisionLayer = Layer.Layer6;
        const hit = new HitResult();
        const hits = (x: number) =>
          physics.raycast(new Ray(new Vector3(x, 10, 5), new Vector3(0, 0, -1)), 10, Layer.Layer6, hit) &&
          hit.collider === cc;

        expect(hits(0)).toBe(true);
        entity.transform.position.x += 0.25;
        expect(hits(0)).toBe(false);
        expect(hits(0.25)).toBe(true);
        cc.center.x += 0.25;
        expect(hits(0.25)).toBe(false);
        expect(hits(0.5)).toBe(true);
      } finally {
        entity.destroy();
      }
    });

    it("retries creation after a scale edit makes the native step offset valid", () => {
      const entity = engine.sceneManager.activeScene.createRootEntity("controller-rescale");
      try {
        entity.transform.setPosition(0, 10, 0);
        const cc = entity.addComponent(CharacterController);
        cc.geometry = CharacterControllerGeometry.Box;
        cc.size.set(1, 1.5, 1);
        cc.stepOffset = 1.5 + 2 ** -23;
        cc.collisionLayer = Layer.Layer6;
        const hit = new HitResult();
        const ray = new Ray(new Vector3(0, 10, 5), new Vector3(0, 0, -1));
        expect(physics.raycast(ray, 10, Layer.Layer6, hit)).toBe(false);

        entity.transform.scale.y = 1 + 2 ** -24;
        expect(physics.raycast(ray, 10, Layer.Layer6, hit)).toBe(true);
        expect(hit.collider).toBe(cc);
      } finally {
        entity.destroy();
      }
    });
  });
});
