import { WebGLEngine } from "@galacean/engine";
import {
  BoxCollider,
  Collider,
  Entity,
  HitResult,
  Layer,
  MeshCollider,
  ModelMesh,
  PhysicsScene,
  PrimitiveMesh,
  Rigidbody
} from "@galacean/engine-core";
import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPhysics } from "../../utils/physics";

describe("Mesh collider collision layers", () => {
  let engine: WebGLEngine;
  let physics: PhysicsScene;
  let mesh: ModelMesh;
  let root: Entity;
  let collider: MeshCollider;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });
    physics = engine.sceneManager.activeScene.physics;
    mesh = PrimitiveMesh.createCuboid(engine, 10, 1, 10, { keepMeshData: true });
  });

  afterAll(() => engine.destroy());

  describe.each(["static", "kinematic"] as const)("%s", (bodyType) => {
    describe.each([
      "mesh before first query",
      "delayed mesh",
      "mesh cleared and restored",
      "convex to triangle",
      "triangle to convex",
      "cloned collider"
    ])("%s", (scenario) => {
      beforeEach(() => {
        root = engine.sceneManager.activeScene.createRootEntity("layered-mesh");
        if (bodyType === "kinematic") {
          root.addComponent(Rigidbody).isKinematic = true;
        }
        collider = root.addComponent(MeshCollider);
        collider.collisionLayer = Layer.Layer3;
        collider.convex = scenario === "convex to triangle";
        const face = new Vector3(0, 0.5, 0);

        if (scenario === "delayed mesh") {
          expect(physics.overlapSphereAll(face, 0.1)).toHaveLength(0);
        } else {
          collider.mesh = mesh;
          const hits = physics.overlapSphereAll(face, 0.1, Layer.Layer3);
          expect(hits).toHaveLength(1);
          expect(hits[0]).toBe(collider);
        }

        switch (scenario) {
          case "delayed mesh":
            collider.mesh = mesh;
            break;
          case "mesh cleared and restored":
            collider.mesh = null;
            expect(physics.overlapSphereAll(face, 0.1)).toHaveLength(0);
            collider.mesh = mesh;
            break;
          case "convex to triangle":
          case "triangle to convex":
            collider.convex = !collider.convex;
            break;
          case "cloned collider": {
            const clone = root.clone();
            root.destroy();
            root = clone;
            engine.sceneManager.activeScene.addRootEntity(root);
            collider = root.getComponent(MeshCollider);
            break;
          }
        }
      });

      afterEach(() => {
        root.destroy();
        physics.setColliderLayerCollision(Layer.Layer3, Layer.Layer4, true);
      });

      it("uses the Collider's layer for every scene query", () => {
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
          expect(physics.raycast(ray, 10, layer, hit)).toBe(expected);
          expect(hit.collider).toBe(expected ? collider : null);
          expect(physics.raycastAll(ray, 10, layer, hits)).toBe(expected);
          expect(hits).toHaveLength(expected ? 1 : 0);
          if (expected) {
            expect(hits[0].collider).toBe(collider);
          }
          expect(physics.boxCast(origin, halfExtents, direction, orientation, 10, layer)).toBe(expected);
          expect(physics.sphereCast(origin, 0.25, direction, 10, layer)).toBe(expected);
          expect(physics.capsuleCast(origin, 0.25, 1.5, direction, orientation, 10, layer)).toBe(expected);

          const overlaps: Collider[][] = [
            physics.overlapBoxAll(overlapCenter, halfExtents, orientation, layer),
            physics.overlapSphereAll(overlapCenter, 0.25, layer),
            physics.overlapCapsuleAll(overlapCenter, 0.25, 1.5, orientation, layer)
          ];
          for (const result of overlaps) {
            expect(result).toHaveLength(expected ? 1 : 0);
            if (expected) {
              expect(result[0]).toBe(collider);
            }
          }
        }
      });

      it.each([false, true])("respects layer collision enabled=%s", (enabled) => {
        physics.setColliderLayerCollision(Layer.Layer3, Layer.Layer4, enabled);
        const fallingBox = root.createChild("falling-box");
        fallingBox.transform.setPosition(0, 3, 0);
        fallingBox.addComponent(Rigidbody);
        fallingBox.addComponent(BoxCollider).collisionLayer = Layer.Layer4;

        for (let i = 0; i < 90; i++) {
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
