import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  CapsuleCollider,
  ColliderShapeUpAxis,
  Entity,
  HitResult,
  Layer,
  MeshCollider,
  PhysicsMaterial,
  PhysicsScene,
  PlaneCollider,
  PrimitiveMesh,
  Rigidbody,
  Scene,
  Script,
  SphereCollider,
  Transform
} from "@galacean/engine-core";
import { Matrix, Ray, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { UITransform } from "@galacean/engine-ui";
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

  it.each([false, true])(
    "keeps a nested Rigidbody independent of its moving parent (parent added last=%s)",
    (parentLast) => {
      const parent = root.createChild("moving parent");
      parent.addComponent(BoxCollider);
      const parentBody = parentLast ? undefined : parent.addComponent(Rigidbody);
      const child = parent.createChild("independent child");
      child.transform.setPosition(10, 0, 0);
      child.addComponent(BoxCollider);
      const childBody = child.addComponent(Rigidbody);
      childBody.useGravity = false;
      const movingBody = parentBody ?? parent.addComponent(Rigidbody);
      movingBody.useGravity = false;
      movingBody.linearVelocity.set(6, 0, 0);

      update();
      expect(parent.transform.worldPosition.x).toBeCloseTo(0.1, 4);
      expect(child.transform.worldPosition.x).toBeCloseTo(10, 4);
      update();
      expect(parent.transform.worldPosition.x).toBeCloseTo(0.2, 4);
      expect(child.transform.worldPosition.x).toBeCloseTo(10, 4);
    }
  );

  it.each([false, true])(
    "writes nested poses after reparenting through an intermediate entity (intermediate body disabled=%s)",
    (disabledBoundary) => {
      const child = root.createChild("independent child");
      child.transform.setPosition(10, 0, 0);
      child.addComponent(BoxCollider);
      child.addComponent(Rigidbody).useGravity = false;
      const parent = root.createChild("rotating parent");
      parent.addComponent(BoxCollider);
      const parentBody = parent.addComponent(Rigidbody);
      parentBody.useGravity = false;
      parentBody.angularVelocity.set(0, Math.PI / 2, 0);
      const middle = parent.createChild("intermediate");
      if (disabledBoundary) middle.addComponent(Rigidbody).enabled = false;
      middle.addChild(child);

      update(2);
      expect(Math.abs(parent.transform.worldRotationQuaternion.y)).toBeGreaterThan(0);
      expectPoint(child.transform.worldPosition, 10, 0, 0);
      expectPoint(child.transform.worldRotation, 0, 0, 0);
    }
  );

  it("keeps independent poses and registration after reordering three nested bodies", () => {
    const parent = root.createChild("parent");
    parent.addComponent(BoxCollider);
    const middle = parent.createChild("middle");
    middle.transform.setPosition(5, 0, 0);
    middle.addComponent(BoxCollider);
    const child = middle.createChild("child");
    child.transform.setPosition(5, 0, 0);
    const childCollider = child.addComponent(BoxCollider);
    child.addComponent(Rigidbody).useGravity = false;
    const middleBody = middle.addComponent(Rigidbody);
    middleBody.useGravity = false;
    middleBody.linearVelocity.set(12, 0, 0);
    const parentBody = parent.addComponent(Rigidbody);
    parentBody.useGravity = false;
    parentBody.linearVelocity.set(6, 0, 0);

    update(2);
    expectPoint(parent.transform.worldPosition, 0.2, 0, 0);
    expectPoint(middle.transform.worldPosition, 5.4, 0, 0);
    expectPoint(child.transform.worldPosition, 10, 0, 0);
    middleBody.enabled = false;
    update();
    expectPoint(parent.transform.worldPosition, 0.3, 0, 0);
    expectPoint(child.transform.worldPosition, 10, 0, 0);
    expect(physics.overlapSphereAll(new Vector3(10, 0, 0), 0.1)).toEqual([childCollider]);
  });

  it("updates ownership and raycasts without resubmitting an unchanged shape scale", () => {
    const shapeEntity = root.createChild();
    shapeEntity.transform.setPosition(2, 0, 0);
    shapeEntity.transform.setScale(2, 1, 1);
    const box = shapeEntity.addComponent(BoxCollider);
    const hit = new HitResult();
    const ray = new Ray(new Vector3(2.75, 4, 0), new Vector3(0, -1, 0));
    expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);
    const geometryWrites = vi.spyOn(box._native["_pxShape"], "setGeometry");

    const bodyEntity = root.createChild();
    bodyEntity.transform.setPosition(10, 0, 0);
    const body = bodyEntity.addComponent(Rigidbody);
    body.isKinematic = true;
    bodyEntity.addChild(shapeEntity);
    expect(physics.raycast(ray)).toBe(false);
    ray.origin.x += 10;
    expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);
    expect(box.attachedRigidbody).toBe(body);
    expect(geometryWrites).not.toHaveBeenCalled();
  });

  it.each([false, true])("honors a custom world matrix after adding a Rigidbody (intermediate=%s)", (intermediate) => {
    class TranslatedTransform extends Transform {
      private readonly _matrix = new Matrix();

      constructor(entity: Entity) {
        super(entity);
        this._matrix.elements[12] = 5;
      }

      override get worldMatrix(): Matrix {
        return this._matrix;
      }
    }

    const parent = root.createChild();
    const translated = parent.createChild();
    translated.addComponent(TranslatedTransform);
    const entity = intermediate ? translated.createChild() : translated;
    const collider = entity.addComponent(BoxCollider);
    const translatedRay = new Ray(new Vector3(5, 0, -3), new Vector3(0, 0, 1));
    const originRay = new Ray(new Vector3(0, 0, -3), new Vector3(0, 0, 1));
    const hit = new HitResult();

    expect(physics.raycast(translatedRay, 5, hit)).toBe(true);
    expect(hit.collider).toBe(collider);

    const body = parent.addComponent(Rigidbody);
    body.isKinematic = true;
    expect(collider.attachedRigidbody).toBe(body);
    expect(entity.transform.worldPosition.x).toBe(5);
    expect(physics.raycast(translatedRay, 5, hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(physics.raycast(originRay, 5)).toBe(false);
  });

  it("keeps a compound child at its world position when the root overrides its local matrix", () => {
    class MatrixTransform extends Transform {
      private readonly _matrix = new Matrix();

      constructor(entity: Entity) {
        super(entity);
        this._matrix.elements[12] = 10;
      }

      override get localMatrix(): Matrix {
        return this._matrix;
      }
    }

    const bodyEntity = new Entity(engine, "custom body", MatrixTransform);
    const entity = new Entity(engine);
    bodyEntity.addChild(entity);
    entity.transform.setPosition(1, 0, 0);
    const collider = entity.addComponent(BoxCollider);
    bodyEntity.addComponent(Rigidbody).isKinematic = true;
    root.scene.addRootEntity(bodyEntity);
    try {
      const hit = new HitResult();
      const ray = new Ray(new Vector3(entity.transform.worldPosition.x, 0, -3), new Vector3(0, 0, 1));
      expect(physics.raycast(ray, 5, hit) && hit.collider === collider).toBe(true);
      ray.origin.x = 1;
      expect(physics.raycast(ray, 5)).toBe(false);
    } finally {
      bodyEntity.destroy();
    }
  });

  it.each([
    { placement: "static", compound: false },
    { placement: "compound", compound: true }
  ])("keeps a $placement Collider's pose during a nested query", ({ compound }) => {
    const cast = (x: number, y = 0) => physics.raycast(new Ray(new Vector3(x, y, -3), new Vector3(0, 0, 1)), 5);
    let nestedResult: boolean | undefined;
    let queryDuringSync = false;
    class QueryingTransform extends Transform {
      override get worldPosition(): Vector3 {
        if (queryDuringSync) {
          queryDuringSync = false;
          nestedResult = cast(compound ? 5.1 : 0, 20);
        }
        return super.worldPosition;
      }
    }

    const other = root.createChild();
    other.transform.setPosition(0, 20, 0);
    const target = root.createChild();
    let otherBoxEntity = other;
    let targetBoxEntity = target;
    if (compound) {
      other.addComponent(Rigidbody).isKinematic = true;
      target.addComponent(Rigidbody).isKinematic = true;
      otherBoxEntity = other.createChild();
      targetBoxEntity = target.createChild();
    }
    const otherBox = otherBoxEntity.addComponent(BoxCollider);
    if (compound) otherBox.center.x = 5;
    targetBoxEntity.addComponent(QueryingTransform);
    const box = targetBoxEntity.addComponent(BoxCollider);
    box.center.x = 2;
    expect(cast(2)).toBe(true);

    if (compound) {
      otherBox.center.x = 5.1;
    } else {
      other.transform.setScale(3, 3, 3);
    }
    box.center.x = 2.5;
    queryDuringSync = true;

    expect(cast(2.5)).toBe(true);
    expect(nestedResult).toBe(true);
    expect(cast(compound ? 5.1 : 7.5)).toBe(false);
  });

  it("keeps Box geometry and mass unchanged when a UITransform only rotates", () => {
    const parent = root.createChild();
    parent.addComponent(UITransform);
    const entity = parent.createChild();
    const transform = entity.transform;
    const box = entity.addComponent(BoxCollider);
    const body = entity.addComponent(Rigidbody);
    const ray = new Ray(new Vector3(0, 0, -3), new Vector3(0, 0, 1));
    expect(physics.raycast(ray, 5)).toBe(true);
    const geometryWrites = vi.spyOn(box._native["_pxShape"], "setGeometry");
    const massRebuilds = vi.spyOn(body["_nativeActor"]!, "setMassAndUpdateInertia");

    for (let degrees = 1; degrees <= 20; degrees++) {
      transform.setRotation(0, 0, degrees);
      expect(physics.raycast(ray, 5)).toBe(true);
    }

    expect(geometryWrites).not.toHaveBeenCalled();
    expect(massRebuilds).not.toHaveBeenCalled();
  });

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

  it("keeps scene-query participation independent of trigger mode", () => {
    const box = root.addComponent(BoxCollider);
    const ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
    const hit = new HitResult();
    expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);

    box.isSceneQuery = false;
    box.isTrigger = true;
    expect(physics.raycast(ray, hit)).toBe(false);
    box.isTrigger = false;
    expect(physics.raycast(ray, hit)).toBe(false);

    box.isSceneQuery = true;
    expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);
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
    const geometryWrites = vi.spyOn(box._native["_pxShape"], "setGeometry");
    root.transform.setScale(2, 1, 1);
    box.size.set(4, 2, 2);
    expect(box.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(1);
    expectPoint(closest, 4, 0, 0);
    expect(geometryWrites).toHaveBeenCalledTimes(1);
  });

  it("updates sphere radius before and after synchronization", () => {
    const sphere = root.addComponent(SphereCollider);
    const closest = new Vector3();
    sphere.radius = 0.5;
    expect(sphere.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(4.5);
    const geometryWrites = vi.spyOn(sphere._native["_pxShape"], "setGeometry");
    root.transform.setScale(2, 1, 1);
    sphere.radius = 2;
    expect(sphere.getClosestPoint(new Vector3(5, 0, 0), closest)).toBeCloseTo(1);
    expectPoint(closest, 4, 0, 0);
    expect(geometryWrites).toHaveBeenCalledTimes(1);
  });

  it.each([ColliderShapeUpAxis.X, ColliderShapeUpAxis.Y, ColliderShapeUpAxis.Z])(
    "updates capsule radius, total height and direction %s",
    (direction) => {
      const capsule = root.addComponent(CapsuleCollider);
      capsule.radius = 0.5;
      capsule.height = 3;
      const axis = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)][direction];
      const closest = new Vector3();
      const point = axis.clone().scale(5);
      capsule.direction = direction;
      expect(capsule.getClosestPoint(point, closest)).toBeCloseTo(3.5);
      expectPoint(closest, axis.x * 1.5, axis.y * 1.5, axis.z * 1.5);

      capsule.radius = 1;
      capsule.height = 6;
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
      capsule.height = 3;
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
      collider.height = 7;
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
    else {
      if (copy instanceof CapsuleCollider) copy.height = 11;
      copy.radius = 4;
    }
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

    const body = volume.addComponent(Rigidbody);
    body.useGravity = false;
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).not.toHaveBeenCalled();

    body.destroy();
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).not.toHaveBeenCalled();

    // The pair survives ownership changes. Separating the colliders ends it.
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
    body.angularVelocity = new Vector3(0, 0, 0.03);
    update(30);
    const transform = entity.transform;
    const point = new Vector3(10, 0, 0);
    Vector3.transformByQuat(point, transform.worldRotationQuaternion, point);
    Vector3.add(point, transform.worldPosition, point);
    const closest = new Vector3();
    // Read through a query before another simulation step can refresh the rotated shape.
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
    // Step the source first so its deferred trigger cleanup runs before the destination's.
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

  describe("degenerate dimensions and zero world scale", () => {
    it("clamps negative box size and detaches zero-sized or zero-scaled boxes without NaN or stale hitboxes", () => {
      const entity = root.createChild("degenerate-box");
      entity.transform.setPosition(0, 5, 0);
      const box = entity.addComponent(BoxCollider);
      const body = entity.addComponent(Rigidbody);
      const ray = new Ray(new Vector3(-5, 5, 0), new Vector3(1, 0, 0));
      const hit = new HitResult();

      // Pre-scene negative size clamps to 0 and excludes from queries without crashing
      box.size = new Vector3(-2, 2, 2);
      expect(box.size.x).toBe(0);
      expect(box.size.y).toBe(2);
      expect(physics.raycast(ray, hit)).toBe(false);

      box.size.set(2, 2, 2);
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.collider).toBe(box);
      expect(hit.normal.x).toBeCloseTo(-1, 4);

      // Zeroing an axis live detaches (no stale hitbox, no NaN inertia/pose)
      box.size.x = 0;
      expect(physics.raycast(ray, hit)).toBe(false);
      expect(box.getClosestPoint(new Vector3(5, 5, 0), new Vector3())).toBe(-1);
      physics.gravity.set(0, -9.81, 0);
      update(5);
      expect(Number.isFinite(entity.transform.worldPosition.y)).toBe(true);
      expect(Number.isFinite(body.inertiaTensor.x)).toBe(true);

      // Restoring positive size and zeroing world scale detaches and recovers cleanly
      box.size.set(2, 2, 2);
      entity.transform.setPosition(0, 5, 0);
      expect(physics.raycast(ray, hit)).toBe(true);
      entity.transform.setScale(0, 1, 1);
      expect(physics.raycast(ray, hit)).toBe(false);
      update(5);
      expect(Number.isFinite(entity.transform.worldPosition.y)).toBe(true);
      expect(Number.isFinite(body.inertiaTensor.x)).toBe(true);

      entity.transform.setScale(1, 1, 1);
      entity.transform.setPosition(0, 5, 0);
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.normal.x).toBeCloseTo(-1, 4);
    });

    it("clamps negative sphere radius, rejects non-finite values, and handles zero radius/scale without NaN", () => {
      const entity = root.createChild("degenerate-sphere");
      entity.transform.setPosition(0, 5, 0);
      const sphere = entity.addComponent(SphereCollider);
      const body = entity.addComponent(Rigidbody);
      const ray = new Ray(new Vector3(-5, 5, 0), new Vector3(1, 0, 0));
      const hit = new HitResult();

      for (const invalid of [NaN, Infinity, -Infinity]) {
        expect(() => (sphere.radius = invalid)).toThrow();
      }
      sphere.radius = -1;
      expect(sphere.radius).toBe(0);
      expect(physics.raycast(ray, hit)).toBe(false);
      physics.gravity.set(0, -9.81, 0);
      update(5);
      expect(Number.isFinite(entity.transform.worldPosition.y)).toBe(true);
      expect(Number.isFinite(body.inertiaTensor.x)).toBe(true);

      sphere.radius = 1;
      entity.transform.setPosition(0, 5, 0);
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.normal.x).toBeCloseTo(-1, 4);

      entity.transform.setScale(0, 0, 0);
      expect(physics.raycast(ray, hit)).toBe(false);
      update(5);
      expect(Number.isFinite(entity.transform.worldPosition.y)).toBe(true);
      expect(Number.isFinite(body.inertiaTensor.x)).toBe(true);

      entity.transform.setScale(2, 1, 1);
      entity.transform.setPosition(0, 5, 0);
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.distance).toBeCloseTo(3, 4);
    });

    it("clamps capsule dimensions, requires positive radius and height, and detaches when degenerate", () => {
      const entity = root.createChild("degenerate-capsule");
      entity.transform.setPosition(0, 5, 0);
      const capsule = entity.addComponent(CapsuleCollider);
      const body = entity.addComponent(Rigidbody);
      const ray = new Ray(new Vector3(-5, 5, 0), new Vector3(1, 0, 0));
      const hit = new HitResult();

      for (const invalid of [NaN, Infinity, -Infinity]) {
        expect(() => (capsule.radius = invalid)).toThrow();
        expect(() => (capsule.height = invalid)).toThrow();
      }
      capsule.radius = -2;
      capsule.height = -3;
      expect(capsule.radius).toBe(0);
      expect(capsule.height).toBe(0);
      expect(physics.raycast(ray, hit)).toBe(false);

      capsule.radius = 1;
      capsule.height = 2;
      expect(physics.raycast(ray, hit)).toBe(false);
      expect(capsule.getClosestPoint(new Vector3(-5, 5, 0), new Vector3())).toBe(-1);

      capsule.height = 4;
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.normal.x).toBeCloseTo(-1, 4);
      expect(hit.distance).toBeCloseTo(4, 4);
      expect(capsule.getClosestPoint(new Vector3(-5, 5, 0), new Vector3())).toBeCloseTo(4, 4);

      // Scale (0, 1, 1) makes X-direction worldHeight = 0 (detached), while Y-direction stays valid
      entity.transform.setScale(0, 1, 1);
      capsule.direction = ColliderShapeUpAxis.X;
      expect(physics.raycast(ray, hit)).toBe(false);
      physics.gravity.set(0, -9.81, 0);
      update(5);
      expect(Number.isFinite(entity.transform.worldPosition.y)).toBe(true);
      expect(Number.isFinite(body.inertiaTensor.x)).toBe(true);

      entity.transform.setPosition(0, 5, 0);
      capsule.direction = ColliderShapeUpAxis.Y;
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.collider).toBe(capsule);
    });

    it("rejects non-finite BoxCollider.size and detaches float32 underflow/overflow extents cleanly", () => {
      const ray = new Ray(new Vector3(-5, 5, 0), new Vector3(1, 0, 0));
      const hit = new HitResult();

      const boxEntity = root.createChild("f32-box");
      boxEntity.transform.setPosition(0, 5, 0);
      const box = boxEntity.addComponent(BoxCollider);
      for (const invalid of [new Vector3(NaN, 1, 1), new Vector3(1, Infinity, 1), new Vector3(1, 1, -Infinity)]) {
        expect(() => (box.size = invalid)).toThrow();
      }
      expect(() => (box.size.x = NaN)).toThrow();
      expect(Number.isFinite(box.size.x)).toBe(true);

      box.size.set(1, 1, 1);
      expect(physics.raycast(ray, hit)).toBe(true);

      box.size.set(1e-40, 1, 1);
      expect(physics.raycast(ray, hit)).toBe(false);
      box.size.set(1e40, 1, 1);
      expect(physics.raycast(ray, hit)).toBe(false);
      box.size.set(1, 1, 1);
      expect(physics.raycast(ray, hit)).toBe(true);
      boxEntity.destroy();

      const sphereEntity = root.createChild("f32-sphere");
      sphereEntity.transform.setPosition(0, 5, 0);
      const sphere = sphereEntity.addComponent(SphereCollider);
      sphere.radius = 1e-40;
      expect(physics.raycast(ray, hit)).toBe(false);
      sphere.radius = 1e40;
      expect(physics.raycast(ray, hit)).toBe(false);
      sphere.radius = 1;
      expect(physics.raycast(ray, hit)).toBe(true);
      sphereEntity.destroy();

      const capsuleEntity = root.createChild("f32-capsule");
      capsuleEntity.transform.setPosition(0, 5, 0);
      const capsule = capsuleEntity.addComponent(CapsuleCollider);
      capsule.height = 1e-40;
      expect(physics.raycast(ray, hit)).toBe(false);
      capsule.height = 1e40;
      expect(physics.raycast(ray, hit)).toBe(false);
      capsule.height = 4;
      expect(physics.raycast(ray, hit)).toBe(true);
    });

    it("handles simultaneous CapsuleCollider scale and direction changes without degenerate intermediate geometry", () => {
      const entity = root.createChild("sync-capsule");
      entity.transform.setPosition(0, 5, 0);
      const capsule = entity.addComponent(CapsuleCollider);
      capsule.direction = ColliderShapeUpAxis.X;
      const ray = new Ray(new Vector3(-5, 5, 0), new Vector3(1, 0, 0));
      const hit = new HitResult();

      expect(physics.raycast(ray, hit)).toBe(true);
      const pxShape = (capsule._native as any)._pxShape;
      const setGeometrySpy = vi.spyOn(pxShape, "setGeometry");

      // Same-frame transition: (X, scale=(1,1,1)) -> (Y, scale=(0,1,1)) stays valid
      entity.transform.setScale(0, 1, 1);
      capsule.direction = ColliderShapeUpAxis.Y;
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.distance).toBeCloseTo(4);
      expect(setGeometrySpy).toHaveBeenCalledTimes(1);

      // Same-frame reverse transition: (Y, scale=(0,1,1)) -> (X, scale=(1,0,1)) stays valid
      setGeometrySpy.mockClear();
      entity.transform.setScale(1, 0, 1);
      capsule.direction = ColliderShapeUpAxis.X;
      capsule.radius = 0.5;
      capsule.height = 4;
      expect(physics.raycast(ray, hit)).toBe(true);
      expect(hit.distance).toBeCloseTo(3);
      expect(setGeometrySpy).toHaveBeenCalledTimes(1);
    });

    it("avoids per-substep Collider._sync churn during Rigidbody._writeBack under uniform scale", () => {
      const entity = root.createChild("falling-box");
      entity.transform.setPosition(0, 20, 0);
      const box = entity.addComponent(BoxCollider);
      entity.addComponent(Rigidbody);

      const syncSpy = vi.spyOn(box, "_sync");
      physics.gravity.set(0, -9.81, 0);
      update(1);
      expect(syncSpy).toHaveBeenCalledTimes(1);

      syncSpy.mockClear();
      update(10);
      expect(entity.transform.position.y).toBeLessThan(19.9);
      expect(syncSpy).not.toHaveBeenCalled();

      entity.transform.setScale(2, 2, 2);
      update(1);
      expect(syncSpy).toHaveBeenCalledTimes(1);
    });

    it("honors small world scale edits across all transform entrypoints while keeping uniform rotation zero-churn", () => {
      const downwardRay = (x: number) => new Ray(new Vector3(x, 8, 0), new Vector3(0, -1, 0));
      const hit = new HitResult();
      const nextX = 1.0000005;
      const outside = downwardRay(1_000_000.25);

      // 1. Direct root 1.0000005 scale edit on a large BoxCollider
      const largeRoot = engine.sceneManager.activeScene.createRootEntity("large-scale-root");
      try {
        const box = largeRoot.addComponent(BoxCollider);
        box.size = new Vector3(2_000_000, 2, 2);
        expect(physics.raycast(downwardRay(999_999), hit) && hit.collider === box).toBe(true);
        expect(physics.raycast(outside)).toBe(false);
        largeRoot.transform.setScale(nextX, 1, 1);
        expect(physics.raycast(outside, hit) && hit.collider === box).toBe(true);
      } finally {
        largeRoot.destroy();
      }

      // 2. All child/parent/rotate-then-scale/matrix/reparent entrypoints sync on first raycast
      for (const entry of [
        "child-scale",
        "parent-scale",
        "rotate-then-child-scale",
        "child-scale-then-rotate",
        "rotate-then-parent-scale",
        "localMatrix",
        "worldMatrix",
        "reparent"
      ] as const) {
        const parent = engine.sceneManager.activeScene.createRootEntity(`scale-parent-${entry}`);
        const destination = engine.sceneManager.activeScene.createRootEntity(`scale-dst-${entry}`);
        const child = parent.createChild("collider");
        const matrixEdit = entry === "localMatrix" || entry === "worldMatrix";
        if (matrixEdit) child.transform.setScale(1, 2, 1);
        else parent.transform.setScale(1, 2, 1);
        destination.transform.setScale(nextX, 2, 1);
        const box = child.addComponent(BoxCollider);
        box.size.set(2_000_000, 2, 2);
        try {
          expect(physics.raycast(downwardRay(999_999), hit) && hit.collider === box).toBe(true);
          expect(physics.raycast(outside)).toBe(false);
          const matrix = new Matrix();
          switch (entry) {
            case "child-scale":
              child.transform.setScale(nextX, 1, 1);
              break;
            case "parent-scale":
              parent.transform.setScale(nextX, 2, 1);
              break;
            case "rotate-then-child-scale":
              parent.transform.setRotation(19, 0, 0);
              child.transform.setScale(nextX, 1, 1);
              break;
            case "child-scale-then-rotate":
              child.transform.setScale(nextX, 1, 1);
              parent.transform.setRotation(19, 0, 0);
              break;
            case "rotate-then-parent-scale":
              parent.transform.setRotation(19, 0, 0);
              parent.transform.setScale(nextX, 2, 1);
              break;
            case "localMatrix":
              Matrix.scaling(new Vector3(nextX, 2, 1), matrix);
              child.transform.localMatrix = matrix;
              break;
            case "worldMatrix":
              Matrix.scaling(new Vector3(nextX, 2, 1), matrix);
              child.transform.worldMatrix = matrix;
              break;
            case "reparent":
              destination.addChild(child);
              break;
          }
          expect(physics.raycast(outside, hit) && hit.collider === box).toBe(true);
        } finally {
          parent.destroy();
          destination.destroy();
        }
      }

      // Uniform scale makes pure Y rotation a pose-only edit.
      const bodyEntity = root.createChild("rotate-uniform");
      bodyEntity.transform.setScale(2, 2, 2);
      const body = bodyEntity.addComponent(Rigidbody);
      body.isKinematic = true;
      const child = bodyEntity.createChild("collider");
      const box = child.addComponent(BoxCollider);
      expect(physics.raycast(downwardRay(0), hit) && hit.collider === box).toBe(true);
      const geometryWrites = vi.spyOn(box._native["_pxShape"], "setGeometry");
      const massSpy = vi.spyOn((body as any)._nativeActor, "setMassAndUpdateInertia");
      for (let i = 1; i <= 90; i++) {
        bodyEntity.transform.setRotation(0, i * 3.7, 0);
        expect(physics.raycast(downwardRay(0), hit) && hit.collider === box).toBe(true);
      }
      expect(geometryWrites).not.toHaveBeenCalled();
      expect(massSpy).not.toHaveBeenCalled();

      // 4. Tiny supported scale change 1e-6 -> 1.5e-6 applies accurately
      const tiny = root.createChild("tiny-scale-box");
      tiny.transform.setScale(1e-6, 1e-6, 1e-6);
      const tinyBox = tiny.addComponent(BoxCollider);
      tinyBox.size.set(4e6, 2e6, 4e6);
      update();
      expect(physics.raycast(downwardRay(2.5))).toBe(false);
      tiny.transform.setScale(1.5e-6, 1e-6, 1e-6);
      update();
      expect(physics.raycast(downwardRay(2.5), hit) && hit.collider === tinyBox).toBe(true);
    });

    it("keeps offset center and world pose exact whenever scale updates (static/kinematic, with/without resize, narrow offset)", () => {
      const next = 1.0000005;
      const matrix = new Matrix();
      Matrix.scaling(new Vector3(next, 2, 1), matrix);

      for (const [owner, resize] of [
        ["static", false],
        ["kinematic", false],
        ["static", true]
      ] as const) {
        const live = engine.sceneManager.activeScene.createRootEntity(`offset-live-${owner}-${resize}`);
        const controlRoot = engine.sceneManager.activeScene.createRootEntity(`offset-ctrl-${owner}-${resize}`);
        try {
          const setup = (parent: Entity, final: boolean) => {
            if (owner === "kinematic") parent.addComponent(Rigidbody).isKinematic = true;
            const child = parent.createChild("offset-box");
            if (final) child.transform.localMatrix = matrix;
            else child.transform.setScale(1, 2, 1);
            const box = child.addComponent(BoxCollider);
            if (final && resize) box.size.y = 3;
            box.center.set(1, 0, 0);
            return box;
          };
          const box = setup(live, false);
          const control = setup(controlRoot, true);
          const query = new Vector3(Math.fround(0.49999988), 0, 0);
          const closest = new Vector3();
          const before = box.getClosestPoint(query, closest);
          const expected = control.getClosestPoint(query, closest);
          const controlX = closest.x;
          expect(expected).toBeGreaterThan(before);

          box.entity.transform.localMatrix = matrix;
          if (resize) box.size.y = 3;
          const actual = box.getClosestPoint(query, closest);
          expect(actual).toBeCloseTo(expected, 10);
          expect(closest.x).toBeCloseTo(controlX, 10);
        } finally {
          live.destroy();
          controlRoot.destroy();
        }
      }

      // Narrow offset box moves completely clear of the old center after 1 -> 1.0000005 scale edit
      const narrow = engine.sceneManager.activeScene.createRootEntity("narrow-live");
      const narrowCtrl = engine.sceneManager.activeScene.createRootEntity("narrow-ctrl");
      try {
        const makeNarrow = (parent: Entity, x: number) => {
          const child = parent.createChild("offset");
          child.transform.setScale(x, 2, 1);
          const box = child.addComponent(BoxCollider);
          box.center.set(1, 0, 0);
          box.size.set(4e-7, 1, 1);
          return box;
        };
        const box = makeNarrow(narrow, 1);
        const control = makeNarrow(narrowCtrl, next);
        const query = new Vector3(1, 0, 0);
        const closest = new Vector3();
        expect(box.getClosestPoint(query, closest)).toBe(0);
        const expected = control.getClosestPoint(query, closest);
        const controlX = closest.x;
        expect(expected).toBeGreaterThan(2e-7);

        box.entity.transform.setScale(next, 2, 1);
        const actual = box.getClosestPoint(query, closest);
        expect(actual).toBeCloseTo(expected, 10);
        expect(closest.x).toBeCloseTo(controlX, 10);
      } finally {
        narrow.destroy();
        narrowCtrl.destroy();
      }

      // Simultaneous -2^-21 translation + (1 + 2^-21) scale cancellation keeps exact world center across static/kinematic owners
      const shift = 2 ** -21;
      for (const [owner, edit] of [
        ["static", "setters"],
        ["static", "matrix-and-resize"],
        ["same-entity", "setters"],
        ["same-entity", "matrix-and-resize"],
        ["child", "setters"]
      ] as const) {
        const live = engine.sceneManager.activeScene.createRootEntity(`shift-live-${owner}-${edit}`);
        const controlRoot = engine.sceneManager.activeScene.createRootEntity(`shift-ctrl-${owner}-${edit}`);
        const applyEdit = (target: Entity) => {
          if (edit === "matrix-and-resize") {
            const m = new Matrix();
            Matrix.scaling(new Vector3(1 + shift, 2, 1), m);
            m.elements[12] = -shift;
            target.transform.localMatrix = m;
          } else {
            target.transform.setScale(1 + shift, 2, 1);
            target.transform.setPosition(-shift, 0, 0);
          }
        };
        try {
          const setup = (target: Entity, fromFinal: boolean) => {
            if (fromFinal) applyEdit(target);
            else target.transform.setScale(1, 2, 1);
            const body = owner === "static" ? null : target.addComponent(Rigidbody);
            if (body) body.isKinematic = true;
            const holder = owner === "child" ? target.createChild("shape") : target;
            const box = holder.addComponent(BoxCollider);
            box.center.set(1, 0, 0);
            box.size.set(4e-7, fromFinal && edit === "matrix-and-resize" ? 3 : 1, 1);
            return box;
          };
          const box = setup(live, false);
          const control = setup(controlRoot, true);
          const point = new Vector3(1, 0, 0);
          const closest = new Vector3();
          expect(box.getClosestPoint(point, closest)).toBe(0);
          expect(control.getClosestPoint(point, closest)).toBe(0);

          applyEdit(live);
          if (edit === "matrix-and-resize") box.size.y = 3;
          expect(box.getClosestPoint(point, closest)).toBe(0);
        } finally {
          live.destroy();
          controlRoot.destroy();
        }
      }
    });
    it.each(["static-position", "static-center", "child-position", "body-center"] as const)(
      "syncs a small position edit without a scale change (%s)",
      (edit) => {
        const bodyEntity = root.createChild(edit);
        if (edit === "child-position" || edit === "body-center") bodyEntity.addComponent(Rigidbody).isKinematic = true;
        const holder = edit === "child-position" ? bodyEntity.createChild("shape") : bodyEntity;
        const box = holder.addComponent(BoxCollider);
        box.size.set(4e-7, 1, 1);
        const point = new Vector3();
        const closest = new Vector3();
        expect(box.getClosestPoint(point, closest)).toBe(0);

        const offset = 2 ** -21;
        if (edit === "static-position" || edit === "child-position") holder.transform.setPosition(offset, 0, 0);
        else box.center.x = offset;
        expect(box.getClosestPoint(point, closest)).toBeCloseTo(offset - 2e-7, 10);
      }
    );
  });

  it.each(["inherited", "authored"] as const)(
    "keeps the compound collider at its Entity origin under %s shear",
    (source) => {
      const body = root.createChild("body");
      if (source === "inherited") {
        root.transform.setScale(4, 1, 1);
        body.transform.setRotation(0, 0, 45);
      } else {
        const matrix = new Matrix();
        matrix.elements[4] = matrix.elements[1] = 0.0625;
        body.transform.localMatrix = matrix;
      }
      body.addComponent(Rigidbody).isKinematic = true;
      const child = body.createChild("box");
      child.transform.setPosition(0, 8, 0);
      const box = child.addComponent(BoxCollider);
      box.size.set(0.25, 0.25, 0.25);
      const position = child.transform.worldPosition;
      const hit = new HitResult();
      const ray = new Ray(new Vector3(position.x, position.y, 8), new Vector3(0, 0, -1));
      expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);
    }
  );

  it.each(["static actor", "rigidbody", "shape pose"] as const)(
    "applies a small authored rotation to the %s",
    (route) => {
      if (route === "rigidbody") root.addComponent(Rigidbody).isKinematic = true;
      const box = root.addComponent(BoxCollider);
      box.size.set(200000, 1, 0.04);
      const ray = new Ray(new Vector3(90000, 2, 0), new Vector3(0, -1, 0));
      const hit = new HitResult();
      expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);

      if (route === "shape pose") {
        box.rotation.y = 0.00005;
      } else {
        root.transform.rotation.y = 0.00005;
      }
      expect(physics.raycast(ray)).toBe(false);
      ray.origin.z = -0.07854;
      expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);
    }
  );

  describe("unchanged local pose under body motion", () => {
    it("accounts for signed body scale and intermediate transforms in the center of mass", () => {
      const bodyEntity = root.createChild("scaled body");
      bodyEntity.transform.setScale(-2, 3, 4);
      bodyEntity.transform.setRotation(0, 0, 90);
      const body = bodyEntity.addComponent(Rigidbody);
      const middle = bodyEntity.createChild("rotated descendant");
      middle.transform.setPosition(1, 0, 0);
      middle.transform.setRotation(0, 90, 0);
      const child = middle.createChild("shape");
      child.transform.setPosition(0, 0, 0.5);
      child.addComponent(BoxCollider).center.z = 1;

      // The child origin is at (1.5, 0, 0) before body scale and the rotated shape center adds 2 on X.
      const center = body.centerOfMass;
      expect(center.x).toBeCloseTo(-1, 6);
      expect(center.y).toBeCloseTo(0, 6);
      expect(center.z).toBeCloseTo(0, 6);
    });

    it.each(["child-position", "child-center", "child-mesh", "same-entity-center"] as const)(
      "writes no native geometry, local pose, or mass while a body rotates around an unchanged scale axis (%s)",
      (setup) => {
        const bodyEntity = root.createChild(setup);
        bodyEntity.transform.setScale(2, 3, 2);
        const body = bodyEntity.addComponent(Rigidbody);
        body.isKinematic = true;
        const holder = setup === "same-entity-center" ? bodyEntity : bodyEntity.createChild("shape");
        if (setup === "child-position" || setup === "child-mesh") holder.transform.setPosition(1, 0, 0.25);
        let collider: BoxCollider | MeshCollider;
        if (setup === "child-mesh") {
          const mesh = holder.addComponent(MeshCollider);
          mesh.convex = true;
          mesh.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
          collider = mesh;
        } else {
          collider = holder.addComponent(BoxCollider);
        }
        if (setup === "child-center" || setup === "same-entity-center") collider.center.set(1, 0, 0.25);

        const center = new Vector3();
        const closest = new Vector3();
        const hit = new HitResult();
        const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
        const expectHit = () => {
          Vector3.transformCoordinate(collider.center, holder.transform.worldMatrix, center);
          ray.origin.set(center.x, 8, center.z);
          expect(physics.raycast(ray, hit) && hit.collider === collider).toBe(true);
          expect(collider.getClosestPoint(center, closest)).toBe(0);
        };
        expectHit();

        const shape = collider["_native"]!;
        const geometryWrites = vi.spyOn(shape["_pxShape"], "setGeometry");
        const poseWrites = vi.spyOn(shape, "setLocalPose");
        const massRebuilds = vi.spyOn(body["_nativeActor"]!, "setMassAndUpdateInertia");
        for (let step = 1; step <= 90; step++) {
          bodyEntity.transform.setRotation(0, step * 3.7, 0);
          expectHit();
        }
        expect(geometryWrites).not.toHaveBeenCalled();
        expect(poseWrites).not.toHaveBeenCalled();
        expect(massRebuilds).not.toHaveBeenCalled();
      }
    );

    it.each([true, false])(
      "writes no native geometry, local pose, or mass while translating a compound body (kinematic=%s)",
      (kinematic) => {
        const bodyEntity = root.createChild("translating body");
        const body = bodyEntity.addComponent(Rigidbody);
        body.isKinematic = kinematic;
        body.useGravity = false;
        const child = bodyEntity.createChild("shape");
        child.transform.setPosition(0.2, 0, 0);
        const box = child.addComponent(BoxCollider);
        const hit = new HitResult();
        const ray = new Ray(new Vector3(0.2, 8, 0), new Vector3(0, -1, 0));
        const expectHit = () => {
          ray.origin.x = child.transform.worldPosition.x;
          expect(physics.raycast(ray, hit) && hit.collider === box).toBe(true);
        };
        expectHit();

        const shape = box["_native"]!;
        const geometryWrites = vi.spyOn(shape["_pxShape"], "setGeometry");
        const poseWrites = vi.spyOn(shape, "setLocalPose");
        const massRebuilds = vi.spyOn(body["_nativeActor"]!, "setMassAndUpdateInertia");
        for (let step = 1; step <= 90; step++) {
          bodyEntity.transform.setPosition(step % 2 === 0 ? 0 : 128, 0, 0);
          expectHit();
        }
        expect(geometryWrites).not.toHaveBeenCalled();
        expect(poseWrites).not.toHaveBeenCalled();
        expect(massRebuilds).not.toHaveBeenCalled();
      }
    );
  });
});
