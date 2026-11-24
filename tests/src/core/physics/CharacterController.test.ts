import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  CharacterController,
  Collider,
  ControllerCollisionFlag,
  ControllerNonWalkableMode,
  Entity,
  HitResult,
  Layer,
  PhysicsScene,
  PlaneCollider,
  Rigidbody,
  Script,
  Transform
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
    expect(capsule.radius).toBe(0.5);
    expect(capsule.height).toBe(2);
    expect(capsule.stepOffset).toBe(0.5);
    expect(capsule.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbing);
    expect(capsule.upDirection.x).toBe(0);
    expect(capsule.upDirection.y).toBe(1);
    expect(capsule.upDirection.z).toBe(0);
    expect(capsule.slopeLimit).toBe(45);
  });

  it("clones authored capsule dimensions and syncs subsequent mutations on the clone", () => {
    controller.radius = 0.5;
    controller.height = 4;
    const clone = role.clone();
    clone.transform.setPosition(3, 3, 0);
    root.addChild(clone);
    const cloneController = clone.getComponent(CharacterController);
    const ray = new Ray(new Vector3(4, 3, -3), new Vector3(0, 0, 1));
    const hit = new HitResult();

    expect(cloneController.height).toBe(4);
    expect(physics.raycast(ray, 6)).toBe(false);
    cloneController.radius = 1.5;
    expect(controller.radius).toBe(0.5);
    expect(physics.raycast(ray, 6, hit)).toBe(true);
    expect(hit.collider).toBe(cloneController);
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

  it("keeps each controller's move when publishing one position moves another controller", () => {
    let follow: (() => void) | undefined;
    class FollowingTransform extends Transform {
      override get worldPosition(): Vector3 {
        return super.worldPosition;
      }
      override set worldPosition(value: Vector3) {
        follow?.();
        super.worldPosition = value;
      }
    }
    const leader = new Entity(engine, "leader", FollowingTransform);
    root.addChild(leader);
    leader.transform.setPosition(0, 20, 0);
    role.transform.setPosition(20, 20, 0);
    const leadController = leader.addComponent(CharacterController);
    const step = new Vector3(1, 0, 0);
    leadController.move(step, 0, physics.fixedTimeStep);
    follow = () => {
      follow = undefined;
      leadController.height = 3;
      move(step);
    };

    leadController.move(new Vector3(2, 0, 0), 0, physics.fixedTimeStep);
    expect(leader.transform.worldPosition.x).toBeCloseTo(3);
    expect(role.transform.worldPosition.x).toBeCloseTo(21);
    leadController.move(step, 0, physics.fixedTimeStep);
    expect(leader.transform.worldPosition.x).toBeCloseTo(4);
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

  it("updates upDirection before and after the first move", () => {
    expect(move(new Vector3(0, 0, 1)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
    controller.upDirection = new Vector3(0, -1, 0);
    expect(move(new Vector3(0, 0, 1)) & ControllerCollisionFlag.Up).toBe(ControllerCollisionFlag.Up);
    controller.upDirection = { x: 0, y: 1, z: 0 };
    // Move down first so the controller has a ground contact for the sideways probe.
    expect(move(new Vector3(0, -0.1, 0)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
  });

  it("applies contactOffset to the collision skin immediately", () => {
    move(new Vector3(0, 0, 0.1));
    move(new Vector3(0, 0, 0.1));
    expect(role.transform.position.y).toBeCloseTo(1.02, 5);
    controller.contactOffset = 1;
    move(new Vector3(0, 0, 0.1));
    move(new Vector3(0, 0, 0.1));
    expect(role.transform.position.y).toBeCloseTo(2.0, 5);
  });

  it.each([false, true])("rejects invalid contactOffset without changing its value (live=%s)", (live) => {
    controller.contactOffset = 0.3;
    if (live) move(new Vector3(0, 0, 0.1));
    for (const value of [-1, 0, 1e-40, 1e39, NaN, Infinity, -Infinity]) {
      expect(() => (controller.contactOffset = value)).toThrow();
      expect(controller.contactOffset).toBe(0.3);
    }
    move(new Vector3(0, 0, 0.1));
    move(new Vector3(0, 0, 0.1));
    expect(role.transform.position.y).toBeCloseTo(1.3, 5);
  });

  it.each([false, true])("rejects trigger mode before and after synchronization (live=%s)", (live) => {
    if (live) move(new Vector3(0, 0, 1));
    expect(() => (controller.isTrigger = true)).toThrow();
    controller.isTrigger = false;
    expect(controller.isTrigger).toBe(false);
  });

  it("validates finite stepOffset and clamps effective step height to scaled capsule total height", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => (controller.stepOffset = invalid)).toThrow();
      expect(controller.stepOffset).toBe(0.5);
    }

    role.transform.setPosition(0, 2, 0);
    controller.radius = 0.25;
    controller.height = 1.0;
    const hit = new HitResult();
    const ray = new Ray(new Vector3(0, 2, 5), new Vector3(0, 0, -1));
    const canHitController = () => physics.raycast(ray, 10, hit) && hit.collider === controller;

    controller.stepOffset = 1.5;
    expect(controller.stepOffset).toBe(1.5);
    expect(canHitController()).toBe(true);
    expect(error).not.toHaveBeenCalled();

    // Default radius=0.5, height=2, stepOffset=0.5 scaled by 0.2 has total height 0.4:
    // stays active with effective step height clamped to 0.4, then restores 0.5 when scaled back to 1.
    addBox(new Vector3(1, 0.46, 1), new Vector3(0, 0.23, 2));
    controller.radius = 0.5;
    controller.height = 2;
    controller.stepOffset = 0.5;
    role.transform.setScale(0.2, 0.2, 0.2);
    role.transform.setPosition(0, 0.22, 0);
    expect(physics.overlapSphereAll(new Vector3(0, 0.22, 0), 0.1).includes(controller)).toBe(true);
    walkTo(new Vector3(0, 0.22, 3), 6);
    expect(controller.stepOffset).toBe(0.5);
    expect(role.transform.position.z).toBeLessThan(1.5);
    expect(error).not.toHaveBeenCalled();

    role.transform.setScale(1, 1, 1);
    role.transform.setPosition(0, 1.02, 0);
    walkTo(new Vector3(0, 1.02, 3), 2);
    expect(role.transform.position.z).toBeCloseTo(3, 4);
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

  it("scales inline total height, radius, and center by world scale", () => {
    controller.center = new Vector3(0, 1, 0);
    role.transform.setScale(2, 3, 4);
    role.transform.setPosition(0, 10, 0);
    const flags = move(new Vector3(0, -20, 0));
    expect(flags & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
    expect(role.transform.position.y).toBeCloseTo(0.02, 4);
    controller.center.y = 0;
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(3.02, 4);

    // Non-uniform total-height rule: max(height * scaleY, 2 * scaledRadius)
    controller.radius = 1;
    controller.height = 4;
    role.transform.setScale(1.5, 1, 1.5);
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(2.02, 4);

    role.transform.setScale(1, 3, 1);
    role.transform.setPosition(0, 20, 0);
    move(new Vector3(0, -40, 0));
    expect(role.transform.position.y).toBeCloseTo(6.02, 4);

    controller.radius = 0.5;
    controller.height = 2;
    role.transform.setScale(1, 1, 1);
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(1.02, 4);
  });

  it("changes capsule radius and total height after creation", () => {
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(1.02, 4);
    controller.radius = 1;
    controller.height = 6;
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(3.02, 4);
  });

  it("updates capsule height to block passage under a low ceiling", () => {
    addBox(new Vector3(5, 0.4, 1), new Vector3(0, 1.5, 2));
    controller.stepOffset = 0.1;
    controller.radius = 0.3;
    controller.height = 1.0;
    role.transform.setPosition(0, 0.52, 0);
    move(new Vector3(0, 0, 3));
    expect(role.transform.position.z).toBeCloseTo(3, 4);
    controller.height = 2.0;
    role.transform.setPosition(0, 1.02, 0);
    move(new Vector3(0, 0, 3));
    expect(role.transform.position.z).toBeLessThan(1.25);
  });

  it.each([1, 45])("uses slopeLimit %s to control climbing", (limit) => {
    physics.overlapSphereAll(new Vector3(0, 5, 0), 0.1);
    controller.slopeLimit = limit;
    role.transform.setPosition(0, 1.02, 0);
    // Keep the slope below the limit to avoid a rounding-dependent result.
    addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX((-40 * Math.PI) / 180));
    walkTo(new Vector3(0, 1.02, 3), 50);
    if (limit === 45) expect(role.transform.position.z).toBeCloseTo(3, 5);
    else expect(role.transform.position.z).toBeLessThan(2);
  });

  it.each([0.5, 1])("uses stepOffset %s to control stepping over an obstacle", (offset) => {
    physics.overlapSphereAll(new Vector3(0, 5, 0), 0.1);
    controller.stepOffset = offset;
    role.transform.setPosition(0, 1.02, 0);
    addBox(new Vector3(1, 1, 1), new Vector3(0, 0.5, 3));
    walkTo(new Vector3(0, 1.02, 3), 2);
    if (offset === 1) {
      expect(role.transform.position.z).toBeCloseTo(3, 5);
      expect(role.transform.position.y).toBeGreaterThan(1.5);
    } else {
      expect(role.transform.position.z).toBeLessThan(2);
      expect(role.transform.position.y).toBeLessThan(1.5);
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
      role.transform.setPosition(0, 4, 4);
      addPlane(new Vector3(0, 0, 2), new Quaternion().rotateX(-Math.PI / 4));
      for (let i = 0; i < 40; i++) move(new Vector3(0, -0.1, 0));
      if (mode === ControllerNonWalkableMode.PreventClimbing) expect(role.transform.position.y).toBeGreaterThan(2.5);
      else expect(role.transform.position.y).toBeLessThan(1.5);
    }
  );

  it.each(["enabled", "active"])("preserves position and settings after %s re-entry", (state) => {
    controller.contactOffset = 0.3;
    controller.center.set(0, 0.2, 0);
    role.transform.setPosition(0, 2, 3);
    move(new Vector3(0, -3, 0));
    expect(role.transform.position.y).toBeCloseTo(1.1, 4);
    if (state === "enabled") controller.enabled = false;
    else role.isActive = false;
    expect(move(new Vector3(0, 0, 10))).toBe(0);
    expect(role.transform.position.z).toBe(3);
    expect(physics.overlapSphereAll(new Vector3(0, 1.3, 3), 0.1)).toHaveLength(0);
    controller.stepOffset = 0.2;
    controller.slopeLimit = 30;
    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    if (state === "enabled") controller.enabled = true;
    else role.isActive = true;
    expect(physics.overlapSphereAll(new Vector3(0, 1.3, 3), 0.1)[0]).toBe(controller);
    move(new Vector3(0, 0, 1));
    expect(role.transform.position.z).toBeCloseTo(4);
    expect(role.transform.position.y).toBeCloseTo(1.1, 4);
    expect(controller.contactOffset).toBe(0.3);
    expect(controller.stepOffset).toBe(0.2);
    expect(controller.slopeLimit).toBe(30);
    expect(controller.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbingAndForceSliding);
  });

  it("applies geometry edited while disabled on re-entry", () => {
    role.transform.setPosition(0, 10, 0);
    move(new Vector3(0, 0, 1));
    controller.enabled = false;
    controller.radius = 0.2;
    controller.height = 1.4;
    controller.contactOffset = 0.1;
    controller.enabled = true;
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(0.8, 4);
    expect(role.transform.position.z).toBeCloseTo(1);
  });

  it("clones inline geometry and movement settings independently", () => {
    controller.center.set(0, 0.2, 0);
    controller.contactOffset = 0.1;
    controller.radius = 0.2;
    controller.height = 1.4;
    controller.stepOffset = 0.2;
    controller.slopeLimit = 30;
    controller.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    const clone = role.clone();
    root.addChild(clone);
    clone.transform.setPosition(10, 10, 0);
    const copy = clone.getComponent(CharacterController);
    expect(copy).not.toBe(controller);
    expect(copy.center).not.toBe(controller.center);
    expect(copy.upDirection).toEqual(controller.upDirection);
    expect(copy.contactOffset).toBe(0.1);
    expect(copy.radius).toBe(0.2);
    expect(copy.height).toBe(1.4);
    expect(copy.stepOffset).toBe(0.2);
    expect(copy.slopeLimit).toBe(30);
    expect(copy.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbingAndForceSliding);
    copy.move(new Vector3(0, -20, 0), 0.0001, physics.fixedTimeStep);
    expect(clone.transform.position.y).toBeCloseTo(0.6, 4);
    copy.center.y = 3;
    copy.radius = 0.4;
    copy.height = 3;
    expect(controller.center.y).toBe(0.2);
    expect(controller.radius).toBe(0.2);
    expect(controller.height).toBe(1.4);
  });

  it.each([Layer.Layer1, Layer.Layer10])("filters controller triggers using collisionLayer %s", (layer) => {
    controller.collisionLayer = layer;
    role.transform.setPosition(0, 1.02, 0);
    const trigger = addBox(new Vector3(1, 1, 1), new Vector3(0, 0.6, 2));
    trigger.collisionLayer = Layer.Layer2;
    trigger.isTrigger = true;
    class TriggerRecorder extends Script {
      onTriggerEnter = vi.fn();
      onTriggerExit = vi.fn();
    }
    const recorder = trigger.entity.addComponent(TriggerRecorder);
    move(new Vector3(0, 0, 2));
    // Trigger detection sees the proxy pose on the step after PhysX applies the kinematic target.
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    role.transform.setPosition(0, 1.02, 0);
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

    cc.radius = 0;
    physics._update(physics.fixedTimeStep);
    expect(errors).not.toHaveBeenCalled();

    cc.collisionLayer = Layer.Layer3;
    expect(errors).not.toHaveBeenCalled();

    entity.transform.setPosition(8, 2, 0);
    cc.radius = 0.5;

    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(8, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3, hit)).toBe(true);
    expect(hit.collider === cc).toBe(true);
    expect(hit.point.x).toBeCloseTo(8, 3);
    expect(physics.raycast(new Ray(new Vector3(0, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer3)).toBe(false);
  });

  it("normalizes upDirection and retains it on a zero vector assignment", () => {
    controller.upDirection = { x: 0, y: 2, z: 0 };
    expect(controller.upDirection).toMatchObject({ x: 0, y: 1, z: 0 });

    controller.upDirection = { x: 0, y: 0, z: 0 };
    expect(controller.upDirection.y).toBe(1);

    role.transform.setPosition(0, 3, 0);
    const flags = move(new Vector3(0, -5, 0));
    expect(Boolean(flags & ControllerCollisionFlag.Down)).toBe(true);
    expect(role.transform.position.y).toBeCloseTo(1.02, 2);
  });

  it("clamps slopeLimit to [0, 90] and rejects non-finite values", () => {
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
  });

  it("ignores move calls after destroy while the entity stays active", () => {
    controller.destroy();
    expect(controller.destroyed).toBe(true);
    expect(move(new Vector3(1, 0, 0))).toBe(0);
  });

  it("returns a read-only up direction snapshot", () => {
    const { upDirection } = controller;
    controller.upDirection = new Vector3(1, 0, 0);
    expect(upDirection.y).toBe(1);
    expect(controller.upDirection.x).toBe(1);
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

    controller.radius = 0.5;
    controller.height = 2;
    role.transform.setPosition(0, 2, 0);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1).includes(controller)).toBe(true);

    // Zero radial scale detaches cleanly; zero axial scale (1, 0, 1) degenerates to a sphere of radius 0.5
    role.transform.setScale(0, 1, 0);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1).includes(controller)).toBe(false);
    expect(move(new Vector3(2, 0, 0))).toBe(0);
    expect(role.transform.position.x).toBe(0);

    role.transform.setScale(1, 0, 1);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1).includes(controller)).toBe(true);
    role.transform.setPosition(0, 5, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(0.52, 4);

    role.transform.setScale(1, 1, 1);
    role.transform.setPosition(0, 2, 0);
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 0.1).includes(controller)).toBe(true);
    move(new Vector3(2, 0, 0));
    expect(role.transform.position.x).toBeCloseTo(2, 4);

    // height <= 2 * radius degenerates to a sphere of radius 0.5 (resting at y ≈ 0.52 with stepOffset <= 2 * radius)
    controller.height = 1;
    role.transform.setPosition(2, 5, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(0.52, 4);
    update();
    expect(physics.overlapSphereAll(new Vector3(2, 0.52, 0), 0.1).includes(controller)).toBe(true);
    expect(physics.raycast(new Ray(new Vector3(2, 1.2, 5), new Vector3(0, 0, -1)), 10)).toBe(false);

    // stepOffset above sphere total height is clamped silently on sync instead of ejecting the controller.
    const stepErrors = vi.spyOn(console, "error").mockImplementation(() => {});
    controller.stepOffset = 1.01;
    expect(physics.overlapSphereAll(new Vector3(2, 0.52, 0), 0.1).includes(controller)).toBe(true);
    expect(controller.stepOffset).toBe(1.01);
    expect(stepErrors).not.toHaveBeenCalled();
    controller.stepOffset = 0.5;
    stepErrors.mockRestore();

    controller.height = 0.2;
    role.transform.setPosition(2, 5, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(0.52, 4);

    controller.height = 2;
    role.transform.setPosition(2, 5, 0);
    move(new Vector3(0, -20, 0));
    expect(role.transform.position.y).toBeCloseTo(1.02, 4);
    update();
    expect(physics.raycast(new Ray(new Vector3(2, 1.4, 5), new Vector3(0, 0, -1)), 10)).toBe(true);
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

      const staticWall = addBox(new Vector3(1, 4, 4), new Vector3(2, 2, 0));
      staticWall.collisionLayer = Layer.Layer2;
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

      // Enable the layer pair to isolate trigger behavior from layer filtering.
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
      otherCC.collisionLayer = Layer.Layer4;

      otherCC.move(new Vector3(0, 0, 0), 0.0001, physics.fixedTimeStep);

      // Enabled layer pair -> blocked before x = 3 (radius 0.5 + 0.5 + contactOffset 0.02 + 0.02)
      const blockedFlags = move(new Vector3(5, 0, 0));
      expect(Boolean(blockedFlags & ControllerCollisionFlag.Sides)).toBe(true);
      expect(role.transform.position.x).toBeLessThan(2.1);

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
  });

  it("validates upDirection, float32 bounds, negative move args, and clean failed-creation recovery", () => {
    for (const invalid of [new Vector3(NaN, 1, 1), new Vector3(1, Infinity, 1), new Vector3(1, 1, -Infinity)]) {
      expect(() => (controller.upDirection = invalid)).toThrow();
    }
    expect(controller.upDirection.y).toBeCloseTo(1, 5);

    // A zero assignment keeps the last valid up direction in both the component and PhysX.
    controller.upDirection = new Vector3(0, 1, 0);
    controller.upDirection = new Vector3(0, 0, 0);
    expect(controller.upDirection.y).toBeCloseTo(1, 5);

    role.transform.setPosition(0, 5, 0);
    controller.height = 1e-40;
    expect(move(new Vector3(0, -20, 0)) & ControllerCollisionFlag.Down).toBe(ControllerCollisionFlag.Down);
    expect(role.transform.position.y).toBeCloseTo(0.52, 4);

    controller.radius = 1e-40;
    expect(move(new Vector3(1, 0, 0))).toBe(0);
    controller.radius = 1e40;
    expect(move(new Vector3(1, 0, 0))).toBe(0);
    controller.radius = 0.5;
    controller.height = 1e40;
    expect(move(new Vector3(1, 0, 0))).toBe(0);
    controller.height = 2;
    controller.radius = 0.5;
    role.transform.setPosition(0, 2, 0);

    // Invalid move arguments must leave the position unchanged.
    expect(controller.move(new Vector3(1, 0, 0), -0.1, physics.fixedTimeStep)).toBe(0);
    expect(controller.move(new Vector3(1, 0, 0), 0.0001, -1)).toBe(0);

    // Move the Entity before recovery to detect reuse of the stale native pose.
    const recoverEntity = root.createChild("recover-cct");
    recoverEntity.transform.setPosition(0, 5, 0);
    const recoverCC = recoverEntity.addComponent(CharacterController);
    recoverCC.radius = 0; // invalid (zero radius detaches controller cleanly)

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(recoverCC.move(new Vector3(0, -0.1, 0), 0.0001, physics.fixedTimeStep)).toBe(0);
    expect(errors).not.toHaveBeenCalled();

    recoverEntity.transform.setPosition(7, 4, -2);
    recoverCC.collisionLayer = Layer.Layer3;
    recoverCC.nonWalkableMode = ControllerNonWalkableMode.PreventClimbingAndForceSliding;
    recoverCC.upDirection = new Vector3(0, 1, 0);
    expect(errors).not.toHaveBeenCalled();

    recoverCC.radius = 0.5;
    recoverCC.move(new Vector3(0, 0, 0), 0.0001, physics.fixedTimeStep);
    expect(errors).not.toHaveBeenCalled();
    expect(recoverCC.nonWalkableMode).toBe(ControllerNonWalkableMode.PreventClimbingAndForceSliding);
    expect(recoverEntity.transform.position.x).toBeCloseTo(7, 4);
    expect(recoverEntity.transform.position.y).toBeCloseTo(4, 4);
    expect(recoverEntity.transform.position.z).toBeCloseTo(-2, 4);

    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(7, 8, -2), new Vector3(0, -1, 0)), 10, Layer.Layer3, hit)).toBe(true);
    expect(hit.collider).toBe(recoverCC);
  });

  it("updates proxy actor orientation immediately on live upDirection changes", () => {
    const entity = root.createChild("asymmetric-cct");
    entity.transform.setPosition(0, 0, 0);
    const cc = entity.addComponent(CharacterController);
    // Capsule spans [-2, 2] along upDirection with radial extent [-1, 1].
    cc.radius = 1;
    cc.height = 4;
    cc.stepOffset = 0.2;
    cc.upDirection = new Vector3(0, 1, 0);

    const hit = new HitResult();
    // With up = +Y: Y extent is [-2, 2], X extent is [-1, 1]
    expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
    expect(hit.collider).toBe(cc);
    expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);

    // Live upDirection change to +X swaps halfHeight (2) onto world X and radius (1) onto world Y immediately
    cc.upDirection = new Vector3(1, 0, 0);
    expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
    expect(hit.collider).toBe(cc);
    expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);

    const up = cc.upDirection;
    cc.upDirection = { x: 2, y: 0, z: 0 };
    cc.upDirection = { x: 0, y: 0, z: 0 };
    expect(cc.upDirection).toBe(up);

    // Stepping checks that the queued kinematic target matches the immediate pose.
    physics._update(physics.fixedTimeStep);
    expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
    expect(hit.collider).toBe(cc);
    expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);

    const clone = entity.clone();
    try {
      const clonedController = clone.getComponent(CharacterController);
      expect(clonedController.upDirection).not.toBe(cc.upDirection);
      expect(clonedController.upDirection).toMatchObject({ x: 1, y: 0, z: 0 });
      clonedController.upDirection = { x: 0, y: 1, z: 0 };
      expect(cc.upDirection.x).toBe(1);
    } finally {
      clone.destroy();
    }

    expect(() => (cc.upDirection = { x: NaN, y: 0, z: 0 })).toThrow();
    expect(cc.upDirection).toBe(up);
    expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
    expect(hit.collider).toBe(cc);
    expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);
  });

  it("syncs sub-1e-6 scale, position, and center edits without dropping updates", () => {
    const tinyScaleEntity = root.createChild("tiny-scale-cct");
    tinyScaleEntity.transform.setPosition(0, 10, 0);
    tinyScaleEntity.transform.setScale(1e-6, 1e-6, 1e-6);
    const tinyScaleCC = tinyScaleEntity.addComponent(CharacterController);
    tinyScaleCC.radius = 0.5e6;
    tinyScaleCC.height = 2e6;
    tinyScaleCC.contactOffset = 0.01;
    tinyScaleCC.collisionLayer = Layer.Layer5;

    const hit = new HitResult();
    const edgeRay = new Ray(new Vector3(0.6, 10, 5), new Vector3(0, 0, -1));
    expect(physics.raycast(edgeRay, 10, Layer.Layer5, hit)).toBe(false);

    // Delta 5e-7 < 1e-6: world radius grows from 0.5 to 0.75
    tinyScaleEntity.transform.setScale(1.5e-6, 1.5e-6, 1.5e-6);
    expect(physics.raycast(edgeRay, 10, Layer.Layer5, hit)).toBe(true);
    expect(hit.collider).toBe(tinyScaleCC);

    // Simultaneous -2^-21 translation + +2^-21 center edit on a narrow capsule keeps the exact world center
    const shift = 2 ** -21;
    const shiftEntity = root.createChild("sub-eps-shift-cct");
    shiftEntity.transform.setPosition(0, 20, 0);
    const shiftCC = shiftEntity.addComponent(CharacterController);
    shiftCC.radius = 2e-7;
    shiftCC.height = 1;
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

  it("publishes a pose edit that keeps the center unchanged after move, before the next step", () => {
    role.transform.setPosition(0, 2, 0);
    const ray = new Ray(new Vector3(0, 2, 5), new Vector3(0, 0, -1));
    const hit = new HitResult();
    const hitsController = (x: number): boolean => {
      ray.origin.x = x;
      return physics.raycast(ray, hit) && hit.collider === controller;
    };

    expect(hitsController(0)).toBe(true);
    move(new Vector3(4, 0, 0));
    const x = role.transform.worldPosition.x;
    expect(x).toBeCloseTo(4, 5);
    expect(hitsController(x)).toBe(false);

    role.transform.worldPosition.x = x + 1;
    controller.center.x = -1;

    expect(hitsController(0)).toBe(false);
    expect(hitsController(x)).toBe(true);
  });

  it("uses the authored position and center before composing the native controller pose", () => {
    const entity = engine.sceneManager.activeScene.createRootEntity("offset-controller");
    try {
      const x = 2 ** 23;
      entity.transform.setPosition(x, 10, 0);
      const cc = entity.addComponent(CharacterController);
      cc.radius = 0.05;
      cc.height = 1;
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

  it("recovers controller queries after scaling radial axes back from zero", () => {
    const entity = engine.sceneManager.activeScene.createRootEntity("controller-rescale");
    try {
      entity.transform.setPosition(0, 10, 0);
      entity.transform.setScale(0, 1, 0);
      const cc = entity.addComponent(CharacterController);
      cc.radius = 0.25;
      cc.height = 1.5;
      cc.stepOffset = 1.5 + 2 ** -23;
      cc.collisionLayer = Layer.Layer6;
      const hit = new HitResult();
      const ray = new Ray(new Vector3(0, 10, 5), new Vector3(0, 0, -1));
      expect(physics.raycast(ray, 10, Layer.Layer6, hit)).toBe(false);

      entity.transform.setScale(1, 1 + 2 ** -23, 1);
      expect(physics.raycast(ray, 10, Layer.Layer6, hit)).toBe(true);
      expect(hit.collider).toBe(cc);
    } finally {
      entity.destroy();
    }
  });

  it("rejects invalid whole-vector assignments while preserving the prior native orientation", () => {
    const entity = root.createChild("nan-up-cct");
    entity.transform.setPosition(0, 0, 0);
    const cc = entity.addComponent(CharacterController);
    cc.radius = 1;
    cc.height = 4;
    cc.stepOffset = 0.2;
    cc.upDirection = new Vector3(1, 0, 0);

    expect(() => (cc.upDirection = new Vector3(Number.NaN, 0, 0))).toThrow();
    expect([cc.upDirection.x, cc.upDirection.y, cc.upDirection.z]).toEqual([1, 0, 0]);

    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(1.5, 0, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(true);
    expect(hit.collider).toBe(cc);
    expect(physics.raycast(new Ray(new Vector3(0, 1.5, 5), new Vector3(0, 0, -1)), 10, hit)).toBe(false);
  });

  it("remains unowned by sibling or ancestor Rigidbodies and dispatches trigger events to its own Entity", () => {
    const ancestor = root.createChild("ancestor");
    ancestor.addComponent(BoxCollider);
    const ancestorBody = ancestor.addComponent(Rigidbody);
    ancestorBody.isKinematic = true;
    let ancestorTriggers = 0;
    ancestor.addComponent(
      class extends Script {
        override onTriggerEnter(): void {
          ancestorTriggers++;
        }
      }
    );

    const zone = root.createChild("zone").addComponent(BoxCollider);
    zone.size.set(4, 4, 4);
    zone.isTrigger = true;
    zone.entity.transform.setPosition(5, 2, 0);

    const child = ancestor.createChild("child-cct");
    child.transform.setPosition(5, 2, 0);
    const siblingBody = child.addComponent(Rigidbody);
    siblingBody.isKinematic = true;
    const cc = child.addComponent(CharacterController);
    const enters: [Collider, Collider][] = [];
    child.addComponent(
      class extends Script {
        override onTriggerEnter(other: Collider, self: Collider): void {
          enters.push([other, self]);
        }
      }
    );

    expect(cc.attachedRigidbody).toBeNull();
    cc.move(new Vector3(0.5, 0, 0), 0.001, physics.fixedTimeStep);
    expect(child.transform.worldPosition.x).toBeCloseTo(5.5, 3);
    expect(ancestor.transform.worldPosition.x).toBe(0);

    physics._update(physics.fixedTimeStep);
    expect(enters).toEqual([[zone, cc]]);
    expect(ancestorTriggers).toBe(0);
  });

  it("mirrors center offsets across negative Entity scale while keeping radius and height positive", () => {
    const entity = root.createChild("mirrored-cct");
    entity.transform.setScale(-2, 2, 1);
    const cc = entity.addComponent(CharacterController);
    cc.radius = 0.5;
    cc.height = 2;
    cc.center.set(1, 1, 0);
    cc.collisionLayer = Layer.Layer6;

    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(-2, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer6, hit)).toBe(true);
    expect(hit.collider).toBe(cc);
    // PhysX PxController scales its query proxy half-extents by default scaleCoeff (0.8): 2 + (1 + 1) * 0.8 = 3.6.
    expect(hit.point.y).toBeCloseTo(3.6, 3);
    expect(physics.raycast(new Ray(new Vector3(2, 10, 0), new Vector3(0, -1, 0)), 20, Layer.Layer6)).toBe(false);
  });

  it("detaches cleanly on non-finite or Float32-overflowing pose and recovers without toggling enabled", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const entity = root.createChild("invalid-pose-cct");
    entity.transform.setPosition(0, 2, 0);
    const cc = entity.addComponent(CharacterController);
    cc.collisionLayer = Layer.Layer5;

    // First attach with NaN center must neither register nor emit native creation errors.
    cc.center.x = NaN;
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 1, Layer.Layer5)).toEqual([]);
    expect(cc.move(new Vector3(1, 0, 0), 0.001, physics.fixedTimeStep)).toBe(ControllerCollisionFlag.None);
    expect(entity.transform.position.x).toBe(0);

    cc.center.x = 0;
    expect(physics.overlapSphereAll(new Vector3(0, 2, 0), 1, Layer.Layer5)).toContain(cc);
    cc.move(new Vector3(1, 0, 0), 0.001, physics.fixedTimeStep);
    expect(entity.transform.position.x).toBeCloseTo(1, 3);

    // Live NaN center while attached must detach cleanly and preserve the valid transform position.
    cc.center.x = NaN;
    expect(cc.move(new Vector3(1, 0, 0), 0.001, physics.fixedTimeStep)).toBe(ControllerCollisionFlag.None);
    expect(Number.isFinite(entity.transform.position.x)).toBe(true);
    expect(entity.transform.position.x).toBeCloseTo(1, 3);
    expect(physics.overlapSphereAll(new Vector3(1, 2, 0), 1, Layer.Layer5)).not.toContain(cc);

    cc.center.x = 0;
    expect(physics.overlapSphereAll(new Vector3(1, 2, 0), 1, Layer.Layer5)).toContain(cc);
    cc.move(new Vector3(1, 0, 0), 0.001, physics.fixedTimeStep);
    expect(entity.transform.position.x).toBeCloseTo(2, 3);

    // Float32-overflowing pose while attached must also detach and recover once restored.
    cc.center.x = 1e39;
    expect(cc.move(new Vector3(1, 0, 0), 0.001, physics.fixedTimeStep)).toBe(ControllerCollisionFlag.None);
    expect(entity.transform.position.x).toBeCloseTo(2, 3);
    expect(physics.overlapSphereAll(new Vector3(2, 2, 0), 1, Layer.Layer5)).not.toContain(cc);

    cc.center.x = 0;
    expect(physics.overlapSphereAll(new Vector3(2, 2, 0), 1, Layer.Layer5)).toContain(cc);
    cc.move(new Vector3(1, 0, 0), 0.001, physics.fixedTimeStep);
    expect(entity.transform.position.x).toBeCloseTo(3, 3);
    expect(errors).not.toHaveBeenCalled();
  });

  it("skips transform writeback and resync churn when move leaves worldPosition unchanged", () => {
    const child = role.createChild("mesh");
    role.transform.setPosition(0, 1.5, 0);
    // Land on the ground plane and settle once so the entity and child transforms are clean.
    expect(move(new Vector3(0, -2, 0)) & ControllerCollisionFlag.Down).toBeTruthy();
    expect(move(new Vector3(0, -0.1, 0)) & ControllerCollisionFlag.Down).toBeTruthy();
    update();
    role.transform.worldMatrix;
    child.transform.worldMatrix;

    const settledY = role.transform.worldPosition.y;
    const roleDispatch = vi.spyOn(role._updateFlagManager, "dispatch");
    const childDispatch = vi.spyOn(child._updateFlagManager, "dispatch");
    const syncSpy = vi.spyOn(controller, "_sync");

    expect(move(new Vector3(0, -0.1, 0)) & ControllerCollisionFlag.Down).toBeTruthy();
    expect(move(new Vector3(0, 0, 0))).toBe(ControllerCollisionFlag.None);
    update();

    expect(role.transform.worldPosition.y).toBe(settledY);
    expect(roleDispatch).not.toHaveBeenCalled();
    expect(childDispatch).not.toHaveBeenCalled();
    expect(syncSpy).not.toHaveBeenCalled();

    // Subsequent actual motion and direct transform teleport still publish and sync normally.
    move(new Vector3(1, 0, 0));
    expect(role.transform.worldPosition.x).toBeCloseTo(1, 4);
    expect(roleDispatch).toHaveBeenCalled();

    role.transform.setPosition(5, 2, 0);
    expect(physics.overlapSphereAll(new Vector3(5, 2, 0), 0.2)).toContain(controller);
  });
});
