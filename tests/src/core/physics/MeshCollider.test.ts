import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  Entity,
  HitResult,
  Layer,
  MeshCollider,
  MeshColliderShapeCookingFlag,
  ModelMesh,
  PhysicsMaterial,
  PhysicsScene,
  Rigidbody,
  Script,
  SphereCollider
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

class CollisionRecorder extends Script {
  onCollisionEnter = vi.fn();
  onTriggerEnter = vi.fn();
  onTriggerStay = vi.fn();
  onTriggerExit = vi.fn();
}

function createModelMesh(engine: WebGLEngine, positions: number[], indices?: number[]): ModelMesh {
  const mesh = new ModelMesh(engine);
  const vertices: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    vertices.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  mesh.setPositions(vertices);
  if (indices) mesh.setIndices(new Uint16Array(indices));
  mesh.uploadData(false);
  return mesh;
}

function createCubeMesh(engine: WebGLEngine, size = 1, offsetX = 0): ModelMesh {
  const vertices = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
  const indices = [
    0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
  ];
  return createModelMesh(
    engine,
    vertices.map((value, index) => value * size + (index % 3 === 0 ? offsetX : 0)),
    indices
  );
}

describe("MeshCollider", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let physics: PhysicsScene;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("mesh colliders");
    physics.gravity.set(0, -9.81, 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
    engine.resourceManager.gc();
    expect(engine.resourceManager.findResourcesByType(PhysicsMaterial)).toHaveLength(0);
  });

  afterAll(() => engine.destroy());

  function update(count = 1): void {
    for (let i = 0; i < count; i++) physics._update(physics.fixedTimeStep);
  }

  function rayAt(x: number, y = 5): Ray {
    return new Ray(new Vector3(x, y, 0), new Vector3(0, -1, 0));
  }

  function addMesh(convex = false, mesh = createCubeMesh(engine)): MeshCollider {
    const collider = root.createChild("mesh").addComponent(MeshCollider);
    collider.convex = convex;
    collider.mesh = mesh;
    return collider;
  }

  function addTriggerProbe(radius = 1.5): CollisionRecorder {
    const entity = root.createChild("probe");
    const sphere = entity.addComponent(SphereCollider);
    sphere.radius = radius;
    sphere.isTrigger = true;
    entity.addComponent(Rigidbody).isKinematic = true;
    return entity.addComponent(CollisionRecorder);
  }

  it("creates a triangle mesh lazily for raycasts", () => {
    const collider = addMesh(
      false,
      createModelMesh(engine, [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2], [0, 2, 1, 1, 2, 3])
    );
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(hit.entity).toBe(collider.entity);
    expect(hit.distance).toBeCloseTo(5);
  });

  it("supports a convex hull without indices on a dynamic Rigidbody", () => {
    const collider = addMesh(true, createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]));
    collider.entity.addComponent(Rigidbody).useGravity = false;
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(hit.point.y).toBeCloseTo(1);
  });

  it.each([false, true])("stops a falling object on mesh geometry (convex=%s)", (convex) => {
    const ground = root.createChild("ground").addComponent(BoxCollider);
    ground.size.set(20, 1, 20);
    ground.entity.transform.setPosition(0, -2, 0);
    let falling: Entity;
    if (convex) {
      const mesh = addMesh(true, createModelMesh(engine, [0, 0.5, 0, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, -0.5, 0.5]));
      falling = mesh.entity;
    } else {
      ground.destroy();
      addMesh(false, createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]));
      falling = root.createChild("sphere");
      falling.addComponent(SphereCollider).radius = 0.5;
    }
    falling.transform.setPosition(0, 3, 0);
    falling.addComponent(Rigidbody);
    const recorder = falling.addComponent(CollisionRecorder);
    update(120);
    expect(falling.transform.position.y).toBeLessThan(3);
    expect(falling.transform.position.y).toBeGreaterThan(convex ? -2 : 0.4);
    expect(recorder.onCollisionEnter).toHaveBeenCalled();
  });

  it("applies the mesh center, local rotation, entity pose and material", () => {
    const collider = addMesh();
    collider.center.set(1, 2, 3);
    collider.rotation.set(0, 90, 0);
    collider.entity.transform.setPosition(10, 0, 0);
    collider.entity.transform.setScale(2, 1, 1);
    const material = new PhysicsMaterial(engine);
    material.staticFriction = 0.5;
    material.dynamicFriction = 0.3;
    material.bounciness = 0.2;
    collider.material = material;
    const hit = new HitResult();
    expect(physics.raycast(new Ray(new Vector3(12, 5, 3), new Vector3(0, -1, 0)), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(hit.point.y).toBeCloseTo(3);
    expect(collider.material).toBe(material);
    expect(collider.material.dynamicFriction).toBe(0.3);
  });

  it("reports enter, stay and exit when a sphere falls through a convex mesh trigger", () => {
    const mesh = addMesh(true);
    mesh.isTrigger = true;
    const sphere = root.createChild("falling sphere");
    sphere.transform.setPosition(0, 5, 0);
    sphere.addComponent(SphereCollider).radius = 0.3;
    sphere.addComponent(Rigidbody);
    const recorder = sphere.addComponent(CollisionRecorder);
    update(90);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerStay).toHaveBeenCalled();
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    expect(sphere.transform.position.y).toBeLessThan(-1);
  });

  it.each([false, true])("preserves scaled center and geometry through mesh updates (convex=%s)", (convex) => {
    const collider = addMesh(convex);
    collider.center.x = 1;
    const hit = new HitResult();
    expect(physics.raycast(rayAt(3), hit)).toBe(false);
    collider.entity.transform.setScale(2, 1, 1);
    expect(physics.raycast(rayAt(3), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(physics.raycast(rayAt(5), hit)).toBe(false);
    collider.mesh = createCubeMesh(engine, 2);
    expect(physics.raycast(rayAt(5), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it.each([false, true])("applies world scale to mesh components created after synchronization (late=%s)", (late) => {
    const entity = root.createChild("scaled ground");
    entity.transform.setScale(2, 1, 2);
    if (late) {
      entity.addComponent(BoxCollider).center.set(100, 0, 100);
      update();
    }
    const collider = entity.addComponent(MeshCollider);
    collider.mesh = createModelMesh(engine, [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2], [0, 2, 1, 1, 2, 3]);
    const sphere = root.createChild("edge sphere");
    sphere.transform.setPosition(3, 2, 0);
    sphere.addComponent(SphereCollider).radius = 0.5;
    sphere.addComponent(Rigidbody);
    update(90);
    expect(sphere.transform.position.y).toBeCloseTo(0.5, 1);
  });

  it.each([
    { name: "Uint8Array", IndexArray: Uint8Array },
    { name: "Uint16Array", IndexArray: Uint16Array },
    { name: "Uint32Array", IndexArray: Uint32Array }
  ])("updates indexed triangle meshes with $name indices", ({ IndexArray }) => {
    const collider = addMesh();
    const hit = new HitResult();
    expect(physics.raycast(rayAt(1.5), hit)).toBe(false);
    const previous = collider.mesh;
    const replacement = createCubeMesh(engine, 2);
    replacement.setIndices(new IndexArray(replacement.getIndices()));
    collider.mesh = replacement;
    expect(collider.mesh).toBe(replacement);
    expect(previous.refCount).toBe(0);
    expect(replacement.refCount).toBe(1);
    expect(physics.raycast(rayAt(1.5), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it("finds closest points on a scaled convex mesh and updates them after replacement", () => {
    const collider = addMesh(true);
    collider.center.x = 1;
    collider.entity.transform.setScale(2, 1, 1);
    const closest = new Vector3();
    expect(collider.getClosestPoint(new Vector3(6, 0, 0), closest)).toBeCloseTo(2);
    expect(closest.x).toBeCloseTo(4);
    expect(closest.y).toBeCloseTo(0);
    expect(closest.z).toBeCloseTo(0);
    expect(collider.getClosestPoint(new Vector3(2, 0, 0), closest)).toBe(0);
    expect(closest.x).toBeCloseTo(2);
    collider.mesh = createCubeMesh(engine, 2);
    expect(collider.getClosestPoint(new Vector3(6, 0, 0), closest)).toBeCloseTo(0);
    expect(closest.x).toBeCloseTo(6);
  });

  it("updates automatic mass properties after replacing convex mesh geometry", () => {
    const collider = addMesh(true);
    const body = collider.entity.addComponent(Rigidbody);
    body.useGravity = false;
    physics.raycast(rayAt(0));
    const inertia = body.inertiaTensor.clone();
    expect(body.centerOfMass.x).toBeCloseTo(0);
    collider.mesh = createCubeMesh(engine, 2, 3);
    physics.raycast(rayAt(3));
    expect(body.centerOfMass.x).toBeCloseTo(3);
    expect(body.inertiaTensor.x).toBeCloseTo(inertia.x * 4);
    expect(body.inertiaTensor.y).toBeCloseTo(inertia.y * 4);
    expect(body.inertiaTensor.z).toBeCloseTo(inertia.z * 4);
  });

  it.each(["mesh", "cookingFlags", "convex", "clear and restore"])(
    "preserves collision filtering after changing %s",
    (property) => {
      const collider = addMesh();
      collider.collisionLayer = Layer.Layer5;
      physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, false);
      function detectsCollision(): boolean {
        const entity = root.createChild("filtered probe");
        entity.transform.setPosition(0, 1.25, 0);
        const sphere = entity.addComponent(SphereCollider);
        sphere.collisionLayer = Layer.Layer6;
        entity.addComponent(Rigidbody).useGravity = false;
        const recorder = entity.addComponent(CollisionRecorder);
        update();
        const collided = recorder.onCollisionEnter.mock.calls.length > 0;
        entity.destroy();
        return collided;
      }
      try {
        expect(detectsCollision()).toBe(false);
        switch (property) {
          case "mesh":
            collider.mesh = createCubeMesh(engine, 1.1);
            break;
          case "cookingFlags":
            collider.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
            break;
          case "convex":
            collider.convex = true;
            break;
          case "clear and restore": {
            const mesh = collider.mesh;
            collider.mesh = null;
            collider.mesh = mesh;
            break;
          }
        }
        expect(collider.collisionLayer).toBe(Layer.Layer5);
        expect(detectsCollision()).toBe(false);
        collider.collisionLayer = Layer.Layer0;
        expect(detectsCollision()).toBe(true);
      } finally {
        physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, true);
      }
    }
  );

  it.each([false, true])("rejects invalid mesh data transactionally (live=%s)", (live) => {
    const collider = addMesh();
    const previous = collider.mesh;
    if (live) expect(physics.raycast(rayAt(0))).toBe(true);
    const inaccessible = createCubeMesh(engine, 2);
    inaccessible.uploadData(true);
    const noIndices = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const empty = new ModelMesh(engine);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const mesh of [inaccessible, noIndices, empty]) {
      collider.mesh = mesh;
      expect(collider.mesh).toBe(previous);
      expect(previous.refCount).toBe(1);
      expect(mesh.refCount).toBe(0);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
      expect(hit.point.y).toBeCloseTo(1);
    }
    expect(warnings).toHaveBeenCalledTimes(3);
  });

  it("leaves an empty collider queryable only after a valid mesh is assigned", () => {
    const collider = root.addComponent(MeshCollider);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(collider.getClosestPoint(new Vector3(5, 0, 0), new Vector3())).toBe(-1);
    expect(warnings).toHaveBeenCalledOnce();
    expect(physics.raycast(rayAt(0))).toBe(false);
    collider.mesh = createCubeMesh(engine);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it.each([false, true])(
    "keeps cooked geometry after released mesh data rejects convex and flag changes (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      expect(physics.raycast(rayAt(0))).toBe(true);
      const flags = collider.cookingFlags;
      collider.mesh.uploadData(true);
      const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
      collider.convex = !convex;
      collider.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
      expect(collider.convex).toBe(convex);
      expect(collider.cookingFlags).toBe(flags);
      expect(warnings).toHaveBeenCalledTimes(2);
      const hit = new HitResult();
      expect(physics.raycast(rayAt(0), hit)).toBe(true);
      expect(hit.collider).toBe(collider);
    }
  );

  it("keeps the convex hull when switching requires missing indices", () => {
    const collider = addMesh(true, createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]));
    expect(physics.raycast(rayAt(0))).toBe(true);
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    collider.convex = false;
    expect(collider.convex).toBe(true);
    expect(warnings).toHaveBeenCalledOnce();
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it.each([false, true])(
    "keeps mesh and active trigger pairs when actual mesh cooking fails, then allows retry (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      const previous = collider.mesh;
      const recorder = addTriggerProbe();
      update();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      const invalid = createModelMesh(engine, [0, 0, 0], [0, 0, 0]);
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      collider.mesh = invalid;
      expect(errors).toHaveBeenCalled();
      expect(collider.mesh).toBe(previous);
      expect(previous.refCount).toBe(1);
      expect(invalid.refCount).toBe(0);
      update(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
      expect(recorder.onTriggerStay).toHaveBeenCalledTimes(2);
      const replacement = createCubeMesh(engine, 1.1);
      collider.mesh = replacement;
      expect(collider.mesh).toBe(replacement);
      expect(previous.refCount).toBe(0);
      expect(replacement.refCount).toBe(1);
      update();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
    }
  );

  it.each([false, true])("keeps cookingFlags when actual recooking fails, then allows retry (convex=%s)", (convex) => {
    const collider = addMesh(convex);
    const mesh = collider.mesh;
    const positions = mesh.getPositions().map((point) => point.clone());
    const indices = mesh.getIndices();
    const flags = collider.cookingFlags;
    expect(physics.raycast(rayAt(0))).toBe(true);
    mesh.setPositions([new Vector3()]);
    mesh.setIndices(new Uint16Array([0, 0, 0]));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    collider.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
    expect(errors).toHaveBeenCalled();
    expect(collider.cookingFlags).toBe(flags);
    expect(collider.mesh).toBe(mesh);
    expect(physics.raycast(rayAt(0))).toBe(true);
    mesh.setPositions(positions);
    mesh.setIndices(indices);
    collider.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
    expect(collider.cookingFlags).toBe(MeshColliderShapeCookingFlag.Cleaning);
    expect(physics.raycast(rayAt(0))).toBe(true);
  });

  it.each([false, true])(
    "maintains trigger continuity across repeated convex replacements (meshFirst=%s)",
    (meshFirst) => {
      let collider: MeshCollider;
      let recorder: CollisionRecorder;
      if (meshFirst) {
        collider = addMesh();
        recorder = addTriggerProbe();
      } else {
        recorder = addTriggerProbe();
        collider = addMesh();
      }
      update();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      for (const convex of [true, false, true, false]) {
        const previousStays = recorder.onTriggerStay.mock.calls.length;
        collider.convex = convex;
        expect(collider.convex).toBe(convex);
        update(2);
        expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
        expect(recorder.onTriggerExit).not.toHaveBeenCalled();
        expect(recorder.onTriggerStay).toHaveBeenCalledTimes(previousStays + 2);
      }
      recorder.entity.transform.setPosition(10, 0, 0);
      update(3);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerStay).toHaveBeenCalledTimes(8);
    }
  );

  it("ends an overlap when a convex hull becomes a hollow non-overlapping triangle mesh", () => {
    const collider = addMesh(
      true,
      createModelMesh(
        engine,
        [-3, -1, -1, -2.5, -1, -1, -3, 1, -1, -3, -1, 1, 3, -1, -1, 2.5, -1, -1, 3, 1, -1, 3, -1, 1],
        [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]
      )
    );
    const recorder = addTriggerProbe(0.5);
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    expect(recorder.onTriggerStay).toHaveBeenCalledOnce();
    collider.convex = false;
    update(3);
    expect(recorder.onTriggerStay).toHaveBeenCalledOnce();
    expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
    collider.convex = true;
    update(2);
    expect(recorder.onTriggerEnter).toHaveBeenCalledTimes(2);
    expect(recorder.onTriggerStay).toHaveBeenCalledTimes(2);
    recorder.entity.transform.setPosition(10, 0, 0);
    update(3);
    expect(recorder.onTriggerExit).toHaveBeenCalledTimes(2);
    expect(recorder.onTriggerStay).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "preserves trigger continuity when mesh data or cooking flags change (convex=%s)",
    (convex) => {
      const collider = addMesh(convex);
      const recorder = addTriggerProbe();
      update();
      collider.mesh = createCubeMesh(engine, 1.1);
      update(2);
      collider.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
      update(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(recorder.onTriggerExit).not.toHaveBeenCalled();
      expect(recorder.onTriggerStay).toHaveBeenCalledTimes(4);
    }
  );

  it("removes query geometry and releases the mesh on null, then accepts replacement geometry", () => {
    const collider = addMesh();
    const original = collider.mesh;
    expect(physics.raycast(rayAt(0))).toBe(true);
    collider.mesh = null;
    expect(collider.mesh).toBeNull();
    expect(original.refCount).toBe(0);
    expect(physics.raycast(rayAt(0))).toBe(false);
    collider.mesh = createCubeMesh(engine, 2);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(1.5), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
  });

  it("stores cooking flags before assigning geometry", () => {
    const collider = root.addComponent(MeshCollider);
    collider.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
    collider.mesh = createCubeMesh(engine);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    expect(collider.cookingFlags).toBe(MeshColliderShapeCookingFlag.Cleaning);
  });

  it.each([false, true])("clones independent mesh components and retains shared meshes (kinematic=%s)", (kinematic) => {
    const collider = addMesh();
    if (kinematic) collider.entity.addComponent(Rigidbody).isKinematic = true;
    const sourceMesh = collider.mesh;
    expect(physics.raycast(rayAt(0))).toBe(true);
    const clone = collider.entity.clone();
    root.addChild(clone);
    clone.transform.setPosition(5, 0, 0);
    const copy = clone.getComponent(MeshCollider);
    expect(copy).not.toBe(collider);
    expect(copy.mesh).toBe(sourceMesh);
    expect(sourceMesh.refCount).toBe(2);
    const hit = new HitResult();
    expect(physics.raycast(rayAt(5), hit)).toBe(true);
    expect(hit.collider).toBe(copy);
    expect(hit.entity).toBe(clone);
    const replacement = createCubeMesh(engine, 2);
    copy.mesh = replacement;
    expect(sourceMesh.refCount).toBe(1);
    expect(replacement.refCount).toBe(1);
    clone.destroy();
    expect(replacement.refCount).toBe(0);
    expect(sourceMesh.refCount).toBe(1);
    expect(physics.raycast(rayAt(0), hit)).toBe(true);
    expect(hit.collider).toBe(collider);
    collider.destroy();
    expect(sourceMesh.refCount).toBe(0);
  });
});
