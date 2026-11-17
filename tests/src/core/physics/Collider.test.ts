import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  CapsuleCollider,
  ColliderShapeUpAxis,
  Entity,
  HitResult,
  Layer,
  PhysicsMaterial,
  PhysicsScene,
  PlaneCollider,
  Rigidbody,
  Scene,
  Script,
  SphereCollider
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class CollisionRecorder extends Script {
  onCollisionEnter = vi.fn();
  onCollisionStay = vi.fn();
  onCollisionExit = vi.fn();
  onTriggerEnter = vi.fn();
  onTriggerStay = vi.fn();
  onTriggerExit = vi.fn();
}

describe("Collider", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let physics: PhysicsScene;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("colliders");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    physics.gravity.set(0, 0, 0);
    root.destroy();
    engine.resourceManager.gc();
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).toHaveLength(0);
  });

  afterAll(() => engine.destroy());

  function update(count = 1): void {
    for (let i = 0; i < count; i++) {
      physics._update(physics.fixedTimeStep);
    }
  }

  function expectPoint(actual: Vector3, x: number, y: number, z: number): void {
    expect(actual.x).toBeCloseTo(x, 4);
    expect(actual.y).toBeCloseTo(y, 4);
    expect(actual.z).toBeCloseTo(z, 4);
  }

  describe.each([
    { name: "BoxCollider", Type: BoxCollider },
    { name: "SphereCollider", Type: SphereCollider },
    { name: "CapsuleCollider", Type: CapsuleCollider },
    { name: "PlaneCollider", Type: PlaneCollider }
  ])("$name shared properties", ({ Type }) => {
    it("stores center, local rotation, contact offset and material before and after synchronization", () => {
      const collider = root.createChild("geometry").addComponent(Type);
      const center = new Vector3(1, 2, -1);
      const rotation = new Vector3(40, -182, 720);
      collider.center = center;
      collider.rotation = rotation;
      collider.contactOffset = 0.3;
      const material = new PhysicsMaterial(engine);
      collider.material = material;
      physics.overlapSphereAll(new Vector3(0, 10, 0), 0.1);

      expectPoint(collider.center, 1, 2, -1);
      expectPoint(collider.rotation, 40, -182, 720);
      expect(collider.center).not.toBe(center);
      expect(collider.rotation).not.toBe(rotation);
      expect(collider.material).toBe(material);
      expect(collider.contactOffset).toBe(0.3);

      collider.contactOffset = -2;
      expect(collider.contactOffset).toBe(0);
      collider.contactOffset = 2.7;
      expect(collider.contactOffset).toBe(2.7);
      for (const value of [NaN, Infinity, -Infinity]) {
        expect(() => (collider.contactOffset = value)).toThrow();
        expect(collider.contactOffset).toBe(2.7);
      }
      collider.material = null;
      expect(collider.material).toBeNull();
    });
  });

  it.each([0, -1, NaN, Layer.Everything])("rejects invalid collision layer %s and keeps query filtering", (value) => {
    const box = root.addComponent(BoxCollider);
    box.collisionLayer = Layer.Layer4;
    expect(physics.overlapSphereAll(new Vector3(), 0.1, Layer.Layer4)[0]).toBe(box);
    expect(() => (box.collisionLayer = value)).toThrow();
    expect(box.collisionLayer).toBe(Layer.Layer4);
    expect(physics.overlapSphereAll(new Vector3(), 0.1, Layer.Layer4)[0]).toBe(box);
    expect(physics.overlapSphereAll(new Vector3(), 0.1, Layer.Layer0)).toHaveLength(0);
  });

  it("applies contactOffset changes to collision detection", () => {
    const box = root.createChild("box").addComponent(BoxCollider);
    const probe = root.createChild("probe");
    probe.transform.setPosition(1.2, 0, 0);
    probe.addComponent(BoxCollider);
    probe.addComponent(Rigidbody).useGravity = false;
    const recorder = probe.addComponent(CollisionRecorder);
    update();
    expect(recorder.onCollisionEnter).not.toHaveBeenCalled();

    box.contactOffset = 0.3;
    update();
    expect(recorder.onCollisionEnter).toHaveBeenCalledTimes(1);
  });

  it("updates box size through assignment and vector mutation", () => {
    const box = root.addComponent(BoxCollider);
    const closest = new Vector3();
    box.size = new Vector3(2, 4, 6);
    expect(box.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(4);
    expectPoint(closest, 1, 0, 0);
    box.size.set(4, 2, 2);
    expect(box.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(3);
    expectPoint(closest, 2, 0, 0);
  });

  it("updates sphere radius before and after synchronization", () => {
    const sphere = root.addComponent(SphereCollider);
    const closest = new Vector3();
    sphere.radius = 0.5;
    expect(sphere.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(4.5);
    sphere.radius = 2;
    expect(sphere.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(3);
    expectPoint(closest, 2, 0, 0);
  });

  it.each([ColliderShapeUpAxis.X, ColliderShapeUpAxis.Y, ColliderShapeUpAxis.Z])(
    "updates capsule radius, cylinder height and direction %s",
    (direction) => {
      const capsule = root.addComponent(CapsuleCollider);
      capsule.radius = 0.5;
      capsule.height = 2;
      const axis = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)][direction];
      const closest = new Vector3();
      const point = axis.clone().scale(5);
      capsule.direction = direction;
      expect(capsule.getClosestPoint(point, closest)).toBeCloseTo(3.5);
      expectPoint(closest, axis.x * 1.5, axis.y * 1.5, axis.z * 1.5);

      capsule.radius = 1;
      capsule.height = 4;
      expect(capsule.getClosestPoint(point, closest)).toBeCloseTo(2);
      capsule.direction = (direction + 1) % 3;
      expect(capsule.getClosestPoint(point, closest)).toBeCloseTo(4);
      expectPoint(closest, axis.x, axis.y, axis.z);
    }
  );

  it("applies plane center and local rotation to raycasts", () => {
    const plane = root.addComponent(PlaneCollider);
    const hit = new HitResult();
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider).toBe(plane);
    expect(hit.distance).toBeCloseTo(5);
    plane.center = new Vector3(0, 2, 0);
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.distance).toBeCloseTo(3);
    plane.rotation = new Vector3(0, 0, -90);
    ray.origin.set(5, 3, 0);
    ray.direction.set(-1, 0, 0);
    expect(physics.raycast(ray, hit)).toBe(true);
    expect(hit.collider).toBe(plane);
    expect(hit.distance).toBeCloseTo(5);

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const closest = new Vector3(9, 8, 7);
    expect(plane.getClosestPoint(new Vector3(), closest)).toBe(-1);
    expect(errors).toHaveBeenCalledOnce();
    expectPoint(closest, 9, 8, 7);
  });

  it("finds the closest point on a scaled and rotated box, including points inside", () => {
    const box = root.addComponent(BoxCollider);
    box.size.set(2, 4, 6);
    box.center.set(1, 2, 3);
    box.rotation.set(0, 0, 90);
    root.transform.setPosition(10, 20, 30);
    root.transform.setScale(2, 3, 4);
    root.transform.setRotation(0, 90, 0);
    // Scaled center (2,6,12), rotated by the Entity, gives world center (22,26,28).
    // Box half extents (2,6,12) become (12,2,6) in world space.
    const closest = new Vector3();
    expect(box.getClosestPoint(new Vector3(40, 26, 28), closest)).toBeCloseTo(6);
    expectPoint(closest, 34, 26, 28);
    expect(box.getClosestPoint(new Vector3(22, 27, 28), closest)).toBe(0);
    expectPoint(closest, 22, 27, 28);

    root.transform.setScale(1, 1, 1);
    root.transform.setRotation(0, 0, 0);
    expect(box.getClosestPoint(new Vector3(11, 22, 33), closest)).toBe(0);
    expectPoint(closest, 11, 22, 33);
  });

  it("uses the largest absolute world scale for the sphere and scales its center", () => {
    const sphere = root.addComponent(SphereCollider);
    sphere.radius = 2;
    sphere.center.set(1, 2, 3);
    root.transform.setPosition(10, 20, 30);
    root.transform.setScale(-2, 3, 4);
    root.transform.setRotation(0, 90, 0);
    const closest = new Vector3();
    expect(sphere.getClosestPoint(new Vector3(40, 26, 28), closest)).toBeCloseTo(10);
    expectPoint(closest, 30, 26, 28);
    expect(sphere.getClosestPoint(new Vector3(22, 26, 28), closest)).toBe(0);
    expectPoint(closest, 22, 26, 28);
  });

  it.each([ColliderShapeUpAxis.X, ColliderShapeUpAxis.Y, ColliderShapeUpAxis.Z])(
    "scales capsule length along direction %s and radius across it",
    (direction) => {
      const capsule = root.addComponent(CapsuleCollider);
      capsule.direction = direction;
      capsule.radius = 0.5;
      capsule.height = 2;
      root.transform.setScale(2, 3, 4);
      const scales = [2, 3, 4];
      const radius = 0.5 * Math.max(scales[(direction + 1) % 3], scales[(direction + 2) % 3]);
      const axis = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)][direction];
      const closest = new Vector3();
      expect(capsule.getClosestPoint(axis.clone().scale(10), closest)).toBeCloseTo(10 - scales[direction] - radius);
      expectPoint(
        closest,
        axis.x * (scales[direction] + radius),
        axis.y * (scales[direction] + radius),
        axis.z * (scales[direction] + radius)
      );
      expect(capsule.getClosestPoint(new Vector3(), closest)).toBe(0);
      expectPoint(closest, 0, 0, 0);
    }
  );

  it.each(["enabled", "active"])("returns -1 while %s is false and resumes after re-entry", (state) => {
    const box = root.addComponent(BoxCollider);
    const point = new Vector3(2, 0, 0);
    const closest = new Vector3();
    expect(box.getClosestPoint(point, closest)).toBeCloseTo(1.5);
    if (state === "enabled") box.enabled = false;
    else root.isActive = false;
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    closest.set(9, 8, 7);
    expect(box.getClosestPoint(point, closest)).toBe(-1);
    expectPoint(closest, 9, 8, 7);
    expect(warnings).toHaveBeenCalledOnce();
    if (state === "enabled") box.enabled = true;
    else root.isActive = true;
    box.size.set(2, 2, 2);
    expect(box.getClosestPoint(point, closest)).toBeCloseTo(1);
  });

  it.each([
    { name: "BoxCollider", Type: BoxCollider },
    { name: "SphereCollider", Type: SphereCollider },
    { name: "CapsuleCollider", Type: CapsuleCollider }
  ])("clones independent $name geometry", ({ Type }) => {
    const source = root.createChild("source");
    const collider = source.addComponent(Type);
    collider.center.set(1, 2, 3);
    collider.rotation.set(0, 90, 0);
    if (collider instanceof BoxCollider) collider.size.set(2, 3, 4);
    else collider.radius = 2;
    if (collider instanceof CapsuleCollider) {
      collider.height = 3;
      collider.direction = ColliderShapeUpAxis.Z;
    }
    const clone = source.clone();
    root.addChild(clone);
    clone.transform.setPosition(20, 0, 0);
    const copy = clone.getComponent(Type);
    expect(copy).not.toBe(collider);
    expect(copy.center).not.toBe(collider.center);
    expectPoint(copy.center, 1, 2, 3);
    expectPoint(copy.rotation, 0, 90, 0);
    const closest = new Vector3();
    const originalDistance = collider.getClosestPoint(new Vector3(10, 2, 3), closest);
    expect(copy.getClosestPoint(new Vector3(30, 2, 3), closest)).toBeCloseTo(originalDistance);
    if (copy instanceof BoxCollider) copy.size.set(9, 9, 9);
    else copy.radius = 4;
    expect(copy.getClosestPoint(new Vector3(30, 2, 3), closest)).toBeLessThan(originalDistance);
    expect(collider.getClosestPoint(new Vector3(10, 2, 3), closest)).toBeCloseTo(originalDistance);
    clone.destroy();
    expect(collider.getClosestPoint(new Vector3(10, 2, 3), closest)).toBeCloseTo(originalDistance);
  });

  it("keeps an overlapping trigger pair when its collider moves between static and dynamic owners", () => {
    const volume = root.createChild("volume");
    volume.addComponent(BoxCollider);
    const probe = root.createChild("probe");
    const sphere = probe.addComponent(SphereCollider);
    sphere.isTrigger = true;
    probe.addComponent(Rigidbody).isKinematic = true;
    const recorder = probe.addComponent(CollisionRecorder);
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();

    // Static to dynamic
    const body = volume.addComponent(Rigidbody);
    body.useGravity = false;
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).not.toHaveBeenCalled();

    // Dynamic to static
    body.destroy();
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).not.toHaveBeenCalled();

    // A real separation still exits exactly once
    probe.transform.setPosition(10, 0, 0);
    update(2);
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
  });

  it("returns no closest point while the owning Rigidbody is disabled", () => {
    const entity = root.createChild("body box");
    const box = entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.isKinematic = true;
    update();
    const closest = new Vector3();
    expect(box.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(4.5);
    body.enabled = false;
    expect(box.getClosestPoint(new Vector3(5, 0, 0), closest)).toBe(-1);
    body.enabled = true;
    update();
    expect(box.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(4.5);
  });

  it("keeps a child collider at its relative pose while the body writes back its motion", () => {
    const entity = root.createChild("moving body");
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    const child = entity.createChild("child collider");
    child.transform.setPosition(2, 0, 0);
    const box = child.addComponent(BoxCollider);
    body.linearVelocity = new Vector3(1, 0, 0);
    update(60);
    const x = entity.transform.position.x;
    expect(x).toBeGreaterThan(0.5);
    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(x + 2, 5, 0), new Vector3(0, -1, 0)), hit)).toBe(true);
    expect(hit.collider).toBe(box);
    expect(hit.point.x).toBeCloseTo(x + 2, 1);
    expect(physics.raycast(new Ray(new Vector3(2, 5, 0), new Vector3(0, -1, 0)), hit)).toBe(false);
  });

  it("syncs collider geometry when simulated rotation changes its world scale", () => {
    const parent = root.createChild("scaled parent");
    parent.transform.setScale(2, 1, 1);
    const entity = parent.createChild("rotating body");
    const box = entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    body.useGravity = false;
    body.angularVelocity = new Vector3(0, 0, Math.PI / 2);
    update(30);
    const transform = entity.transform;
    const point = new Vector3(10, 0, 0);
    Vector3.transformByQuat(point, transform.worldRotationQuaternion, point);
    Vector3.add(point, transform.worldPosition, point);
    const closest = new Vector3();
    // The query must reflect the current lossy scale, not the scale from before the simulated rotation
    expect(box.getClosestPoint(point, closest)).toBeCloseTo(10 - 0.5 * transform.lossyWorldScale.x, 2);
  });

  it("keeps trigger events working when a collider moves between scenes and back", () => {
    const sceneA = engine.sceneManager.activeScene;
    const probe = root.createChild("probe");
    const sphere = probe.addComponent(SphereCollider);
    sphere.isTrigger = true;
    probe.addComponent(Rigidbody).isKinematic = true;
    const recorder = probe.addComponent(CollisionRecorder);
    root.createChild("volume").addComponent(BoxCollider);
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();

    const sceneB = new Scene(engine);
    engine.sceneManager.addScene(sceneB);
    const flushB = () => sceneB.physics.raycast(new Ray(new Vector3(0, 100, 0), new Vector3(0, -1, 0)));
    const updateB = () => sceneB.physics._update(sceneB.physics.fixedTimeStep);

    sceneB.addRootEntity(probe);
    flushB();
    sceneA.addRootEntity(probe);
    update();
    // The removed scene updates first: its deferred cleanup must not touch the other scene's pairs
    updateB();
    expect(() => update(2)).not.toThrow();
    const enters = recorder.onTriggerEnter.mock.calls.length;

    // Move both sides, then deactivate before the old scene steps
    sceneB.addRootEntity(probe);
    sceneB.addRootEntity(root.children.find((child) => child.name === "volume")!);
    flushB();
    probe.isActive = false;
    updateB();
    expect(() => update(2)).not.toThrow();
    expect(recorder.onTriggerEnter.mock.calls.length).toBeGreaterThanOrEqual(enters);
    sceneB.destroy();
  });

  describe("collision response", () => {
    it.each([false, true])(
      "keeps trigger and solid components on the same dynamic body (kinematic probe=%s)",
      (kinematic) => {
        const box = root.createChild("box");
        box.transform.setPosition(5, 0, 0);
        box.addComponent(BoxCollider).size.set(2, 2, 2);
        const trigger = box.addComponent(BoxCollider);
        trigger.size.set(3, 3, 3);
        trigger.isTrigger = true;
        box.addComponent(Rigidbody).useGravity = false;
        const sphere = root.createChild("sphere");
        sphere.addComponent(SphereCollider).radius = 0.5;
        const body = sphere.addComponent(Rigidbody);
        body.isKinematic = kinematic;
        body.useGravity = false;
        const recorder = sphere.addComponent(CollisionRecorder);
        if (kinematic) {
          for (let x = 0.25; x <= 8; x += 0.25) {
            body.move(new Vector3(x, 0, 0));
            update();
          }
        } else {
          body.applyForce(new Vector3(500, 0, 0));
          update(120);
        }
        sphere.transform.setPosition(-10, 0, 0);
        update(2);
        expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
        expect(recorder.onTriggerStay).toHaveBeenCalled();
        expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
        expect(recorder.onCollisionEnter).toHaveBeenCalled();
        expect(box.transform.position.x).toBeGreaterThan(5);
      }
    );

    it.each(["static", "dynamic"])("cloned %s collider keeps friction behavior", (kind) => {
      physics.gravity.set(0, -9.81, 0);
      const ground = root.createChild("ground");
      ground.addComponent(PlaneCollider);
      function addSlidingBox(): Entity {
        const entity = root.createChild("sliding box");
        entity.transform.setPosition(0, 0.5, 0);
        const collider = entity.addComponent(BoxCollider);
        const material = collider.getInstanceMaterial();
        material.dynamicFriction = 1;
        material.staticFriction = 0;
        const body = entity.addComponent(Rigidbody);
        body.automaticCenterOfMass = false;
        body.automaticInertiaTensor = false;
        body.inertiaTensor.set(10000000, 10000000, 10000000);
        body.applyForce(new Vector3(1000, 0, 0));
        return entity;
      }
      const source = addSlidingBox();
      update(60);
      const speed = source.getComponent(Rigidbody).linearVelocity.x;
      expect(speed).toBeCloseTo(0.97066, 4);
      if (kind === "static") {
        const clone = ground.clone();
        root.addChild(clone);
        ground.isActive = false;
        source.isActive = false;
        const probe = addSlidingBox();
        update(60);
        expect(probe.getComponent(Rigidbody).linearVelocity.x).toBeCloseTo(speed, 4);
      } else {
        const clone = source.clone();
        root.addChild(clone);
        clone.transform.position.z = 2;
        expect(clone.getComponent(Rigidbody).linearVelocity.x).toBeCloseTo(speed, 4);
        expect(clone.getComponent(BoxCollider).material.dynamicFriction).toBe(1);
        update(120);
        expect(source.getComponent(Rigidbody).linearVelocity.x).toBeCloseTo(0, 4);
        expect(clone.getComponent(Rigidbody).linearVelocity.x).toBeCloseTo(0, 4);
      }
    });

    it.each(["dynamic", "static", "kinematic"])("dynamic sphere collides with a %s box", (kind) => {
      const ground = root.createChild("ground");
      ground.addComponent(PlaneCollider);
      physics.gravity.set(0, -9.81, 0);
      const boxEntity = root.createChild("box");
      boxEntity.transform.setPosition(5, 1, 0);
      boxEntity.addComponent(BoxCollider).size.set(2, 2, 2);
      if (kind !== "static") boxEntity.addComponent(Rigidbody).isKinematic = kind === "kinematic";
      const sphereEntity = root.createChild("sphere");
      sphereEntity.transform.setPosition(0, 1.25, 0);
      sphereEntity.addComponent(SphereCollider).radius = 1.25;
      const body = sphereEntity.addComponent(Rigidbody);
      const recorder = sphereEntity.addComponent(CollisionRecorder);
      body.applyForce(new Vector3(500, 0, 0));
      update(120);
      expect(recorder.onCollisionEnter.mock.calls.length).toBeGreaterThan(1);
      expect(recorder.onCollisionStay).toHaveBeenCalled();
      expect(recorder.onCollisionExit).toHaveBeenCalled();
      if (kind === "dynamic") expect(boxEntity.transform.position.x).not.toBe(5);
      else expect(boxEntity.transform.position.x).toBe(5);
    });

    it.each(["static", "kinematic"])("kinematic sphere reports contact with a %s box", (kind) => {
      const box = root.createChild("box");
      box.addComponent(BoxCollider).size.set(2, 2, 2);
      if (kind === "kinematic") box.addComponent(Rigidbody).isKinematic = true;
      const sphere = root.createChild("sphere");
      sphere.transform.setPosition(-3, 0, 0);
      sphere.addComponent(SphereCollider).radius = 0.5;
      const body = sphere.addComponent(Rigidbody);
      body.isKinematic = true;
      const recorder = sphere.addComponent(CollisionRecorder);
      for (let x = -2.75; x <= 3; x += 0.25) {
        body.move(new Vector3(x, 0, 0));
        update();
      }
      expect(recorder.onCollisionEnter).toHaveBeenCalledOnce();
      expect(recorder.onCollisionStay).toHaveBeenCalled();
      expect(recorder.onCollisionExit).toHaveBeenCalledOnce();
      expect(box.transform.position.x).toBe(0);
    });

    it.each([
      [false, false],
      [true, false],
      [false, true],
      [true, true]
    ])("trigger toggle with kinematic probe=%s and dynamic target=%s", (kinematicProbe, dynamicTarget) => {
      const target = root.createChild("target");
      const trigger = target.addComponent(BoxCollider);
      if (dynamicTarget) target.addComponent(Rigidbody).useGravity = false;
      trigger.isTrigger = true;
      const probe = root.createChild("probe");
      probe.addComponent(SphereCollider).radius = 0.25;
      const body = probe.addComponent(Rigidbody);
      body.isKinematic = kinematicProbe;
      body.useGravity = false;
      const recorder = probe.addComponent(CollisionRecorder);
      update(3);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerStay).toHaveBeenCalledTimes(2);
      expect(recorder.onCollisionEnter).not.toHaveBeenCalled();
      probe.transform.setPosition(5, 0, 0);
      update(2);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();

      trigger.isTrigger = false;
      if (kinematicProbe) body.move(new Vector3(0.7, 0, 0));
      else probe.transform.setPosition(0.7, 0, 0);
      update(3);
      expect(recorder.onCollisionEnter).toHaveBeenCalledOnce();
    });
  });
});
