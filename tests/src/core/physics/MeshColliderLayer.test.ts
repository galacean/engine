import { WebGLEngine } from "@galacean/engine";
import {
  BoxColliderShape,
  DynamicCollider,
  Entity,
  HitResult,
  Layer,
  MeshColliderShape,
  ModelMesh,
  PhysicsScene,
  PrimitiveMesh,
  StaticCollider
} from "@galacean/engine-core";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPhysics } from "../../utils/physics";

describe("Mesh collider collision layers", () => {
  let engine: WebGLEngine;
  let physics: PhysicsScene;
  let mesh: ModelMesh;
  let root: Entity;
  let shape: MeshColliderShape;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
    mesh = PrimitiveMesh.createCuboid(engine, {
      keepData: true,
      width: 10,
      height: 1,
      depth: 10,
      widthSegments: 1,
      heightSegments: 1,
      depthSegments: 1
    });
  });

  afterAll(() => engine.destroy());

  describe.each([
    ["static", StaticCollider],
    ["kinematic", DynamicCollider]
  ] as const)("%s", (_, ColliderType) => {
    describe.each([
      "mesh before attachment",
      "delayed mesh",
      "mesh cleared and restored",
      "convex to triangle",
      "triangle to convex",
      "cloned collider",
      "transferred shape"
    ])("%s", (scenario) => {
      beforeEach(() => {
        root = engine.sceneManager.activeScene.createRootEntity("layered-mesh");
        const collider = root.addComponent(ColliderType);
        if (collider instanceof DynamicCollider) {
          collider.isKinematic = true;
        }
        collider.collisionLayer = Layer.Layer3;
        // @ts-expect-error MeshColliderShape inherits the protected ColliderShape constructor.
        shape = new MeshColliderShape();
        shape.isConvex = scenario === "convex to triangle";
        if (scenario !== "delayed mesh") {
          shape.mesh = mesh;
        }
        collider.addShape(shape);

        switch (scenario) {
          case "delayed mesh":
            shape.mesh = mesh;
            break;
          case "mesh cleared and restored":
            shape.mesh = null;
            shape.mesh = mesh;
            break;
          case "convex to triangle":
          case "triangle to convex":
            shape.isConvex = !shape.isConvex;
            break;
          case "cloned collider": {
            const clone = root.clone();
            root.destroy();
            root = clone;
            engine.sceneManager.activeScene.addRootEntity(root);
            shape = root.getComponent(ColliderType).shapes[0] as MeshColliderShape;
            break;
          }
          case "transferred shape": {
            collider.collisionLayer = Layer.Layer4;
            const target = root.createChild("target").addComponent(ColliderType);
            if (target instanceof DynamicCollider) {
              target.isKinematic = true;
            }
            target.collisionLayer = Layer.Layer3;
            target.addShape(shape);
            break;
          }
        }
      });

      afterEach(() => {
        root.destroy();
        physics.setColliderLayerCollision(Layer.Layer3, Layer.Layer4, true);
      });

      it("uses the collider layer for every scene query", () => {
        const origin = new Vector3(0, 3, 0);
        const direction = new Vector3(0, -1, 0);
        const ray = new Ray(origin, direction);
        const orientation = new Quaternion();
        const halfExtents = new Vector3(0.25, 0.25, 0.25);
        const overlapCenter = new Vector3(0, 0.5, 0);

        for (const layer of [Layer.Layer3, Layer.Layer0]) {
          const expected = layer === Layer.Layer3;
          const hit = new HitResult();
          const hits: HitResult[] = [];
          expect.soft(physics.raycast(ray, 10, layer, hit)).toBe(expected);
          expect.soft(hit.shape).toBe(expected ? shape : null);
          expect.soft(physics.raycastAll(ray, 10, layer, hits)).toBe(expected);
          expect.soft(hits.map((hit) => hit.shape)).toEqual(expected ? [shape] : []);
          expect.soft(physics.boxCast(origin, halfExtents, direction, orientation, 10, layer)).toBe(expected);
          expect.soft(physics.sphereCast(origin, 0.25, direction, 10, layer)).toBe(expected);
          expect.soft(physics.capsuleCast(origin, 0.25, 1, direction, orientation, 10, layer)).toBe(expected);
          expect
            .soft(physics.overlapBoxAll(overlapCenter, halfExtents, orientation, layer))
            .toEqual(expected ? [shape] : []);
          expect.soft(physics.overlapSphereAll(overlapCenter, 0.25, layer)).toEqual(expected ? [shape] : []);
          expect
            .soft(physics.overlapCapsuleAll(overlapCenter, 0.25, 1, orientation, layer))
            .toEqual(expected ? [shape] : []);
        }
      });

      it.each([false, true])("respects layer collision enabled=%s", (enabled) => {
        physics.setColliderLayerCollision(Layer.Layer3, Layer.Layer4, enabled);
        const fallingBox = root.createChild("falling-box");
        fallingBox.transform.setPosition(0, 3, 0);
        const collider = fallingBox.addComponent(DynamicCollider);
        collider.collisionLayer = Layer.Layer4;
        collider.addShape(new BoxColliderShape());

        for (let i = 0; i < 90; i++) {
          // @ts-ignore
          physics._update(1 / 60);
        }

        const height = fallingBox.transform.worldPosition.y;
        if (enabled) {
          expect(height).toBeCloseTo(1, 1);
        } else {
          expect(height).toBeLessThan(-2);
        }
      });
    });
  });
});
