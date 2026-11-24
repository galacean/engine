import { WebGLEngine } from "@galacean/engine";
import {
  BoxCollider,
  CharacterController,
  Collider,
  Entity,
  HitResult,
  Layer,
  MeshCollider,
  PhysicsScene,
  PrimitiveMesh,
  Rigidbody,
  Script,
  SphereCollider
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhysics } from "../../utils/physics";

class TriggerRecorder extends Script {
  onTriggerEnter = vi.fn();
  onTriggerStay = vi.fn();
  onTriggerExit = vi.fn();
  onCollisionEnter = vi.fn();
  onCollisionStay = vi.fn();
  onCollisionExit = vi.fn();
}

describe("Collider layer initialization", () => {
  let engine: WebGLEngine;
  let physics: PhysicsScene;
  let root: Entity;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("collider-layers");
    root.transform.setPosition(0, 1000, 0);
  });

  afterEach(() => {
    root.destroy();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function expectRayColliders(ray: Ray, layer: Layer, colliders: readonly Collider[]): void {
    const hits: HitResult[] = [];
    expect(physics.raycastAll(ray, 200, layer, hits)).toBe(colliders.length > 0);
    expect(hits).toHaveLength(colliders.length);
    const actual = new Set(hits.map((hit) => hit.collider));
    expect(actual.size).toBe(colliders.length);
    for (const collider of colliders) {
      expect(actual.has(collider)).toBe(true);
    }
  }

  it.each([1, 8, 64])("preserves the independent layers of %i added and cloned Colliders", (count) => {
    const source = root.createChild("source");
    const colliders: BoxCollider[] = [];
    for (let i = 0; i < count; i++) {
      const collider = source.addComponent(BoxCollider);
      collider.center.x = i * 2;
      collider.collisionLayer = Layer.Layer3;
      colliders.push(collider);
    }

    const ray = new Ray(new Vector3(-2, 1000, 0), new Vector3(1, 0, 0));
    expectRayColliders(ray, Layer.Layer3, colliders);
    expectRayColliders(ray, Layer.Layer0, []);

    const clone = source.clone();
    root.addChild(clone);
    clone.transform.setPosition(0, 0, 3);
    const clonedColliders = clone.getComponents(BoxCollider, []);
    ray.origin.z = 3;
    expectRayColliders(ray, Layer.Layer3, clonedColliders);
    expectRayColliders(ray, Layer.Layer0, []);

    clonedColliders[0].collisionLayer = Layer.Layer4;
    expectRayColliders(ray, Layer.Layer3, clonedColliders.slice(1));
    expectRayColliders(ray, Layer.Layer4, [clonedColliders[0]]);
    ray.origin.z = 0;
    expectRayColliders(ray, Layer.Layer3, colliders);
    expectRayColliders(ray, Layer.Layer4, []);
  });

  it("roundtrips Layer31 through the public collisionLayer property", () => {
    const collider = root.addComponent(BoxCollider);
    collider.collisionLayer = Layer.Layer31;
    expect(collider.collisionLayer).toBe(Layer.Layer31);
  });

  it("preserves independent Collider layers and query flags through mesh cooking and replacement", () => {
    const source = root.createChild("source");
    const box = source.addComponent(BoxCollider);
    box.collisionLayer = Layer.Layer3;
    const collider = source.addComponent(MeshCollider);
    collider.collisionLayer = Layer.Layer4;
    collider.center.x = 3;
    collider._isSceneQuery = false;
    const center = new Vector3(3, 1000.5, 0);
    const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1, { keepMeshData: true });
    collider.mesh = mesh;
    expect(physics.overlapSphereAll(center, 0.1)).toHaveLength(0);
    collider._isSceneQuery = true;

    function expectMesh(): void {
      const hits = physics.overlapSphereAll(center, 0.1, Layer.Layer4);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toBe(collider);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer3)).toHaveLength(0);
      const boxHits = physics.overlapSphereAll(new Vector3(0, 1000, 0), 0.1, Layer.Layer3);
      expect(boxHits).toHaveLength(1);
      expect(boxHits[0]).toBe(box);
    }

    expectMesh();
    collider.convex = true;
    expectMesh();
  });

  it("synchronizes controller query poses before the first simulation step", () => {
    const entity = root.createChild("controller");
    entity.transform.setPosition(3, 0, 0);
    const controller = entity.addComponent(CharacterController);
    controller.collisionLayer = Layer.Layer7;
    const center = new Vector3(3, 1000, 0);
    const ray = new Ray(new Vector3(3, 1000, 3), new Vector3(0, 0, -1));
    const hit = new HitResult();

    expect.soft(physics.raycast(ray, 5, Layer.Layer7, hit)).toBe(true);
    expect.soft(hit.collider === controller).toBe(true);
    expect.soft(physics.overlapSphereAll(center, 0.1, Layer.Layer7).includes(controller)).toBe(true);

    physics._update(1 / 60);
    expect(physics.raycast(ray, 5, Layer.Layer7, hit)).toBe(true);
    expect(hit.collider).toBe(controller);
    const overlaps = physics.overlapSphereAll(center, 0.1, Layer.Layer7);
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0]).toBe(controller);
  });

  it.each([true, false])(
    "preserves the layer and query flag of an initially enabled=%s controller clone",
    (enabled) => {
      const source = root.createChild("source");
      const controller = source.addComponent(CharacterController);
      controller.enabled = enabled;
      controller.collisionLayer = Layer.Layer7;
      controller._isSceneQuery = false;

      const clone = source.clone();
      root.addChild(clone);
      clone.transform.setPosition(3, 0, 0);
      const cloneController = clone.getComponent(CharacterController);
      cloneController.enabled = true;
      physics._update(1 / 60);
      const center = new Vector3(3, 1000, 0);
      expect(cloneController.collisionLayer).toBe(Layer.Layer7);
      expect(cloneController._isSceneQuery).toBe(false);
      expect(physics.overlapSphereAll(center, 0.1)).toHaveLength(0);

      function expectController(layer: Layer): void {
        const unfilteredHits = physics.overlapSphereAll(center, 0.1);
        expect(unfilteredHits).toHaveLength(1);
        expect(unfilteredHits[0]).toBe(cloneController);
        const hits = physics.overlapSphereAll(center, 0.1, layer);
        expect(hits).toHaveLength(1);
        expect(hits[0]).toBe(cloneController);
      }

      cloneController._isSceneQuery = true;
      expectController(Layer.Layer7);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer0)).toHaveLength(0);
      cloneController.enabled = false;
      expect(physics.overlapSphereAll(center, 0.1)).toHaveLength(0);
      cloneController.enabled = true;
      physics._update(1 / 60);
      expectController(Layer.Layer7);

      cloneController.collisionLayer = Layer.Layer9;
      cloneController.enabled = false;
      cloneController.enabled = true;
      physics._update(1 / 60);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer7)).toHaveLength(0);
      expectController(Layer.Layer9);
    }
  );
});

describe("Collider layer validation", () => {
  let engine: WebGLEngine;
  let physics: PhysicsScene;
  let root: Entity;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("layer-validation");
  });

  afterEach(() => {
    root.destroy();
    engine.resourceManager.gc();
  });

  afterAll(() => engine.destroy());

  function update(count = 1): void {
    for (let i = 0; i < count; i++) physics._update(physics.fixedTimeStep);
  }

  it("rejects collision layers that are not a single layer", () => {
    const box = root.createChild("box").addComponent(BoxCollider);
    for (let i = 0; i < 32; i++) {
      const layer = ((1 << i) >>> 0) as Layer;
      box.collisionLayer = layer;
      expect(box.collisionLayer).toBe(layer);
    }
    box.collisionLayer = Layer.Layer0;

    for (const invalid of [
      Layer.Layer0 | Layer.Layer1,
      0.5,
      2 ** 32,
      2 ** 32 + 1,
      2147483648.0000005,
      2147483647.9999998,
      -2147483648,
      0,
      NaN,
      "1" as unknown as Layer,
      true as unknown as Layer
    ]) {
      expect(() => (box.collisionLayer = invalid as Layer)).toThrow();
    }
    expect(box.collisionLayer).toBe(Layer.Layer0);
    expect(() => physics.setColliderLayerCollision(Layer.Layer0 | Layer.Layer2, Layer.Layer1, true)).toThrow();
    expect(() => physics.getColliderLayerCollision(0.5 as Layer, Layer.Layer1)).toThrow();
  });

  it("ends a trigger pair with Exit when a layer change disables the collision", () => {
    const trigger = root.createChild("trigger");
    const sphere = trigger.addComponent(SphereCollider);
    sphere.isTrigger = true;
    trigger.addComponent(Rigidbody).isKinematic = true;
    const recorder = trigger.addComponent(TriggerRecorder);
    const box = root.createChild("box").addComponent(BoxCollider);
    try {
      update(2);
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
      physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, false);
      box.collisionLayer = Layer.Layer1;
      update(2);
      expect(recorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(recorder.onTriggerEnter).toHaveBeenCalledOnce();
    } finally {
      physics.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, true);
    }
  });

  it("refilters existing overlapping triggers and solid contacts when only setColliderLayerCollision flips", () => {
    try {
      physics.gravity.set(0, -9.81, 0);

      // Pair 1 (Layer5 <-> Layer6): overlapping trigger pair
      const triggerEntity = root.createChild("matrix-trigger");
      triggerEntity.transform.setPosition(0, 5, 0);
      const triggerBox = triggerEntity.addComponent(BoxCollider);
      triggerBox.isTrigger = true;
      triggerBox.collisionLayer = Layer.Layer5;
      triggerEntity.addComponent(Rigidbody).isKinematic = true;
      const triggerRecorder = triggerEntity.addComponent(TriggerRecorder);

      const probeEntity = root.createChild("matrix-probe");
      probeEntity.transform.setPosition(0, 5, 0);
      const probeBox = probeEntity.addComponent(BoxCollider);
      probeBox.collisionLayer = Layer.Layer6;

      // Pair 2 (Layer7 <-> Layer8): unrelated overlapping trigger pair that must stay untouched
      const otherTrigger = root.createChild("unrelated-trigger");
      otherTrigger.transform.setPosition(20, 5, 0);
      const otherTriggerBox = otherTrigger.addComponent(BoxCollider);
      otherTriggerBox.isTrigger = true;
      otherTriggerBox.collisionLayer = Layer.Layer7;
      otherTrigger.addComponent(Rigidbody).isKinematic = true;
      const otherRecorder = otherTrigger.addComponent(TriggerRecorder);

      const otherProbe = root.createChild("unrelated-probe");
      otherProbe.transform.setPosition(20, 5, 0);
      otherProbe.addComponent(BoxCollider).collisionLayer = Layer.Layer8;

      // Pair 3 (Layer5 <-> Layer6): dynamic solid crate resting on a static floor
      const floor = root.createChild("matrix-floor");
      floor.transform.setPosition(40, 0, 0);
      const floorBox = floor.addComponent(BoxCollider);
      floorBox.size = new Vector3(10, 1, 10);
      floorBox.collisionLayer = Layer.Layer6;

      const crate = root.createChild("matrix-crate");
      crate.transform.setPosition(40, 1.0, 0);
      const crateBox = crate.addComponent(BoxCollider);
      crateBox.size = new Vector3(1, 1, 1);
      crateBox.collisionLayer = Layer.Layer5;
      const crateBody = crate.addComponent(Rigidbody);
      const crateRecorder = crate.addComponent(TriggerRecorder);

      // Settle initial overlaps and let the crate rest (asleep) on the floor
      update(40);
      expect(triggerRecorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(otherRecorder.onTriggerEnter).toHaveBeenCalledOnce();
      expect(crateRecorder.onCollisionEnter).toHaveBeenCalled();
      expect(crate.transform.position.y).toBeCloseTo(1.0, 1);
      crateBody.sleep();
      expect(crateBody.isSleeping()).toBe(true);

      // Leave collider layers unchanged so the pair updates come from the matrix edit alone.
      triggerRecorder.onTriggerStay.mockClear();
      triggerRecorder.onTriggerExit.mockClear();
      otherRecorder.onTriggerEnter.mockClear();
      otherRecorder.onTriggerStay.mockClear();
      otherRecorder.onTriggerExit.mockClear();
      crateRecorder.onCollisionExit.mockClear();

      physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, false);
      update(1);

      // Trigger pair immediately fires Exit with 0 Stay; unrelated pair continues Stay with 0 Exit/Enter
      expect(triggerRecorder.onTriggerExit).toHaveBeenCalledOnce();
      expect(triggerRecorder.onTriggerStay).not.toHaveBeenCalled();
      expect(otherRecorder.onTriggerExit).not.toHaveBeenCalled();
      expect(otherRecorder.onTriggerEnter).not.toHaveBeenCalled();
      expect(otherRecorder.onTriggerStay).toHaveBeenCalled();

      // The resting crate must wake when the matrix removes its supporting contact.
      update(25);
      expect(crateRecorder.onCollisionExit).toHaveBeenCalled();
      expect(crate.transform.position.y).toBeLessThan(0.5);

      triggerRecorder.onTriggerEnter.mockClear();
      physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, true);
      update(1);
      expect(triggerRecorder.onTriggerEnter).toHaveBeenCalledOnce();
    } finally {
      physics.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, true);
    }
  });
});
