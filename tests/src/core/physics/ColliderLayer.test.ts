import { WebGLEngine } from "@galacean/engine";
import {
  BoxColliderShape,
  CharacterController,
  ColliderShape,
  Entity,
  HitResult,
  Layer,
  MeshColliderShape,
  PhysicsScene,
  PrimitiveMesh,
  StaticCollider
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPhysics } from "../../utils/physics";

describe("Collider layer initialization", () => {
  let engine: WebGLEngine;
  let physics: PhysicsScene;
  let backend: ReturnType<typeof createPhysics>;
  let root: Entity;

  beforeAll(async () => {
    backend = createPhysics();
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: backend });
    physics = engine.sceneManager.activeScene.physics;
  });

  beforeEach(() => {
    root = engine.sceneManager.activeScene.createRootEntity("collider-layers");
    root.transform.setPosition(0, 1000, 0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    root.destroy();
  });

  afterAll(() => engine.destroy());

  function expectRayShapes(ray: Ray, layer: Layer, shapes: Readonly<ColliderShape[]>): void {
    const hits: HitResult[] = [];
    expect(physics.raycastAll(ray, 200, layer, hits)).toBe(shapes.length > 0);
    expect(hits).toHaveLength(shapes.length);
    expect(new Set(hits.map((hit) => hit.shape))).toEqual(new Set(shapes));
  }

  it.each([1, 8, 64])("initializes each of %i added and cloned shapes without actor-wide synchronization", (count) => {
    const source = root.createChild("source");
    const collider = source.addComponent(StaticCollider);
    collider.collisionLayer = Layer.Layer3;
    const setGroup = vi.spyOn(backend._physX, "setGroup");
    const attach = vi.spyOn(backend._physX.PxRigidActor.prototype, "attachShapeWithLayer");

    for (let i = 0; i < count; i++) {
      const shape = new BoxColliderShape();
      shape.position.x = i * 2;
      collider.addShape(shape);
    }

    expect(attach.mock.calls.length).toBe(count);
    expect(attach.mock.calls.every(([, layer]) => layer === 3)).toBe(true);
    expect(setGroup).not.toHaveBeenCalled();
    const ray = new Ray(new Vector3(-2, 1000, 0), new Vector3(1, 0, 0));
    expectRayShapes(ray, Layer.Layer3, collider.shapes);
    expectRayShapes(ray, Layer.Layer0, []);

    const clone = source.clone();
    root.addChild(clone);
    clone.transform.setPosition(0, 0, 3);
    const cloneCollider = clone.getComponent(StaticCollider);
    cloneCollider._onUpdate();

    expect(attach.mock.calls.length).toBe(count * 2);
    expect(attach.mock.calls.every(([, layer]) => layer === 3)).toBe(true);
    expect(setGroup).not.toHaveBeenCalled();
    ray.origin.z = 3;
    expectRayShapes(ray, Layer.Layer3, cloneCollider.shapes);
    expectRayShapes(ray, Layer.Layer0, []);

    cloneCollider.collisionLayer = Layer.Layer4;
    expect(setGroup).toHaveBeenCalledTimes(1);
    expectRayShapes(ray, Layer.Layer3, []);
    expectRayShapes(ray, Layer.Layer4, cloneCollider.shapes);
  });

  it("initializes only the attached mesh when a compound collider rebuilds or transfers it", () => {
    const source = root.createChild("source").addComponent(StaticCollider);
    const target = root.createChild("target").addComponent(StaticCollider);
    source.collisionLayer = Layer.Layer3;
    target.collisionLayer = Layer.Layer4;
    const setGroup = vi.spyOn(backend._physX, "setGroup");
    const attach = vi.spyOn(backend._physX.PxRigidActor.prototype, "attachShapeWithLayer");
    const box = new BoxColliderShape();
    source.addShape(box);
    // @ts-expect-error MeshColliderShape inherits the protected ColliderShape constructor.
    const shape = new MeshColliderShape();
    shape.position.x = 3;
    shape.isSceneQuery = false;
    source.addShape(shape);
    expect(attach.mock.calls.length).toBe(1);

    const mesh = PrimitiveMesh.createCuboid(engine, {
      keepData: true,
      width: 1,
      height: 1,
      depth: 1,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    });
    shape.mesh = mesh;
    const center = new Vector3(3, 1000.5, 0);
    expect(physics.overlapSphereAll(center, 0.1, Layer.Everything)).toEqual([]);
    shape.isSceneQuery = true;
    expect(physics.overlapSphereAll(center, 0.1, Layer.Layer3).map((shape) => shape.id)).toEqual([shape.id]);

    shape.mesh = null;
    shape.mesh = mesh;
    shape.isConvex = true;
    expect(attach.mock.calls.length).toBe(4);
    expect(physics.overlapSphereAll(center, 0.1, Layer.Layer3).map((shape) => shape.id)).toEqual([shape.id]);
    target.addShape(shape);
    expect(attach.mock.calls.length).toBe(5);
    expect(attach.mock.calls.map(([, layer]) => layer)).toEqual([3, 3, 3, 3, 4]);
    expect(setGroup).not.toHaveBeenCalled();
    expect(physics.overlapSphereAll(center, 0.1, Layer.Layer3)).toEqual([]);
    expect(physics.overlapSphereAll(center, 0.1, Layer.Layer4).map((shape) => shape.id)).toEqual([shape.id]);
    expect(physics.overlapSphereAll(new Vector3(0, 1000, 0), 0.1, Layer.Layer3).map((shape) => shape.id)).toEqual([
      box.id
    ]);
    mesh.destroy();
  });

  it.each([true, false])(
    "preserves the layer and query flag of an initially enabled=%s controller clone",
    (enabled) => {
      const source = root.createChild("source");
      const controller = source.addComponent(CharacterController);
      controller.enabled = enabled;
      controller.collisionLayer = Layer.Layer7;
      const shape = new BoxColliderShape();
      shape.isSceneQuery = false;
      controller.addShape(shape);

      const clone = source.clone();
      root.addChild(clone);
      clone.transform.setPosition(3, 0, 0);
      const cloneController = clone.getComponent(CharacterController);
      cloneController.enabled = true;
      (physics as any)._update(1 / 60);
      const cloneShape = cloneController.shapes[0];
      const center = new Vector3(3, 1000, 0);
      expect(cloneController.collisionLayer).toBe(Layer.Layer7);
      expect(cloneShape.isSceneQuery).toBe(false);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Everything)).toEqual([]);

      cloneShape.isSceneQuery = true;
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer7).map((shape) => shape.id)).toEqual([cloneShape.id]);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer0)).toEqual([]);
      cloneController.enabled = false;
      cloneController.enabled = true;
      (physics as any)._update(1 / 60);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer7).map((shape) => shape.id)).toEqual([cloneShape.id]);

      cloneController.collisionLayer = Layer.Layer9;
      cloneController.enabled = false;
      cloneController.enabled = true;
      (physics as any)._update(1 / 60);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer7)).toEqual([]);
      expect(physics.overlapSphereAll(center, 0.1, Layer.Layer9).map((shape) => shape.id)).toEqual([cloneShape.id]);
    }
  );
});
