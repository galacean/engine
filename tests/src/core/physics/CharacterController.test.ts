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
});
