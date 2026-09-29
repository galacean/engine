import {
  Entity,
  MeshColliderShape,
  MeshColliderShapeCookingFlag,
  SphereColliderShape,
  BoxColliderShape,
  DynamicCollider,
  HitResult,
  StaticCollider,
  PhysicsMaterial,
  Script,
  ModelMesh,
  Layer
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { createPhysics } from "./PhysicsTestUtils";
import { describe, beforeAll, beforeEach, afterAll, expect, it, vi } from "vitest";

class CollisionScript extends Script {
  onCollisionEnter(other) {}
  onCollisionStay(other) {}
  onCollisionExit(other) {}
  onTriggerEnter(other) {}
  onTriggerStay(other) {}
  onTriggerExit(other) {}
}

/**
 * Create a ModelMesh from raw vertex positions and optional indices.
 * @param engine - The engine instance
 * @param positions - Flat array of vertex positions [x,y,z, x,y,z, ...]
 * @param indices - Optional triangle indices
 * @returns A ModelMesh with readable data
 */
function createModelMesh(engine: WebGLEngine, positions: number[], indices?: number[]): ModelMesh {
  const mesh = new ModelMesh(engine);
  const vec3Positions: Vector3[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    vec3Positions.push(new Vector3(positions[i], positions[i + 1], positions[i + 2]));
  }
  mesh.setPositions(vec3Positions);
  if (indices) {
    mesh.setIndices(new Uint16Array(indices));
  }
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

const runtimeModes = [PhysXRuntimeMode.WebAssembly, PhysXRuntimeMode.WebAssemblySIMD];

describe.each(runtimeModes)("MeshColliderShape PhysX (%s)", (runtimeMode) => {
  let engine: WebGLEngine;
  let root: Entity;
  let physicsScene: any;

  beforeAll(async () => {
    engine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: createPhysics(runtimeMode)
    });
    engine.run();

    const scene = engine.sceneManager.activeScene;
    physicsScene = scene.physics;
    physicsScene.gravity = new Vector3(0, -9.81, 0);
    root = scene.createRootEntity("root");
  });

  afterAll(() => {
    engine.destroy();
  });

  beforeEach(() => {
    // Reset collision script spies
    CollisionScript.prototype.onCollisionEnter = vi.fn();
    CollisionScript.prototype.onCollisionStay = vi.fn();
    CollisionScript.prototype.onCollisionExit = vi.fn();
    CollisionScript.prototype.onTriggerEnter = vi.fn();
    CollisionScript.prototype.onTriggerStay = vi.fn();
    CollisionScript.prototype.onTriggerExit = vi.fn();
  });

  describe("Triangle Mesh (Static)", () => {
    it("should create triangle mesh collider", () => {
      const groundEntity = root.createChild("ground");
      const staticCollider = groundEntity.addComponent(StaticCollider);

      // Create a simple ground plane using two triangles
      const meshShape = new MeshColliderShape();
      const mesh = createModelMesh(
        engine,
        [-5, 0, -5, 5, 0, -5, -5, 0, 5, 5, 0, -5, 5, 0, 5, -5, 0, 5],
        [0, 1, 2, 3, 4, 5]
      );
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      expect(meshShape).toBeDefined();
      expect(staticCollider.shapes.length).toBe(1);

      // Cleanup
      groundEntity.destroy();
    });

    it("should detect collision between sphere and triangle mesh", async () => {
      // Create ground mesh
      const groundEntity = root.createChild("meshGround");
      groundEntity.transform.setPosition(0, 0, 0);
      const groundCollider = groundEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      // Ground plane at y=0, CCW winding -> normal +Y
      const mesh = createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]);
      meshShape.mesh = mesh;
      groundCollider.addShape(meshShape);

      // Create falling sphere
      const sphereEntity = root.createChild("fallingSphere");
      sphereEntity.transform.setPosition(0, 2, 0);
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      const sphereShape = new SphereColliderShape();
      sphereShape.radius = 0.5;
      dynamicCollider.addShape(sphereShape);

      const collisionScript = sphereEntity.addComponent(CollisionScript);

      // Simulate physics
      for (let i = 0; i < 60; i++) {
        physicsScene._update(1 / 60);
      }

      // Sphere should have fallen and collided with mesh ground
      const sphereY = sphereEntity.transform.position.y;
      expect(sphereY).toBeLessThan(2); // Should have fallen
      expect(sphereY).toBeGreaterThan(-1); // Should be stopped by ground
      expect(collisionScript.onCollisionEnter).toHaveBeenCalled();

      // Cleanup
      groundEntity.destroy();
      sphereEntity.destroy();
    });

    it("should support position and rotation offset", () => {
      const entity = root.createChild("offsetMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      // Set position and rotation
      meshShape.position = new Vector3(1, 2, 3);
      meshShape.rotation = new Vector3(0, 45, 0);

      staticCollider.addShape(meshShape);

      expect(meshShape.position).toEqual(expect.objectContaining({ x: 1, y: 2, z: 3 }));
      expect(meshShape.rotation).toEqual(expect.objectContaining({ x: 0, y: 45, z: 0 }));

      entity.destroy();
    });

    it("should support physics material", () => {
      const entity = root.createChild("materialMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      const material = new PhysicsMaterial();
      material.staticFriction = 0.5;
      material.dynamicFriction = 0.3;
      material.bounciness = 0.2;
      meshShape.material = material;

      staticCollider.addShape(meshShape);

      expect(meshShape.material).toBe(material);
      expect(meshShape.material.staticFriction).toBe(0.5);

      entity.destroy();
      material?.destroy();
    });
  });

  describe("Convex Mesh (Dynamic)", () => {
    it("should create convex mesh collider", () => {
      const entity = root.createChild("convexEntity");
      const dynamicCollider = entity.addComponent(DynamicCollider);

      // Create a simple tetrahedron (convex shape)
      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true;

      const mesh = createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]);
      meshShape.mesh = mesh;
      dynamicCollider.addShape(meshShape);

      expect(meshShape.isConvex).toBe(true);
      expect(dynamicCollider.shapes.length).toBe(1);

      entity.destroy();
    });

    it("keeps the convex shape when non-convex mode is unsupported", () => {
      const entity = root.createChild("unsupportedDynamicMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);

      const meshShape = new MeshColliderShape();
      const convexMesh = createModelMesh(
        engine,
        [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
      );
      meshShape.isConvex = true;
      meshShape.mesh = convexMesh;
      dynamicCollider.addShape(meshShape);
      const nativeShape = (meshShape as any)._nativeShape;

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        meshShape.isConvex = false;
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        expect(meshShape.isConvex).toBe(true);
        expect((meshShape as any)._nativeShape).toBe(nativeShape);
        expect((dynamicCollider as any)._nativeCollider._shapes).toEqual([nativeShape]);
      } finally {
        consoleErrorSpy.mockRestore();
        entity.destroy();
      }
    });

    it("should allow convex mesh on dynamic collider", async () => {
      // Create ground
      const groundEntity = root.createChild("ground2");
      groundEntity.transform.setPosition(0, -2, 0);
      const groundCollider = groundEntity.addComponent(StaticCollider);
      const groundShape = new BoxColliderShape();
      groundShape.size = new Vector3(20, 1, 20);
      groundCollider.addShape(groundShape);

      // Create falling convex mesh
      const convexEntity = root.createChild("fallingConvex");
      convexEntity.transform.setPosition(0, 3, 0);
      const dynamicCollider = convexEntity.addComponent(DynamicCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true;
      const mesh = createModelMesh(engine, [0, 0.5, 0, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, -0.5, 0.5]);
      meshShape.mesh = mesh;
      dynamicCollider.addShape(meshShape);

      const collisionScript = convexEntity.addComponent(CollisionScript);

      // Simulate
      for (let i = 0; i < 120; i++) {
        physicsScene._update(1 / 60);
      }

      // Should have fallen and stopped on ground
      const convexY = convexEntity.transform.position.y;
      expect(convexY).toBeLessThan(3);
      expect(convexY).toBeGreaterThan(-3);
      expect(collisionScript.onCollisionEnter).toHaveBeenCalled();

      groundEntity.destroy();
      convexEntity.destroy();
    });
  });

  describe("Mesh as Trigger", () => {
    it("should work as trigger", async () => {
      // Create trigger mesh zone
      const triggerEntity = root.createChild("triggerZone");
      triggerEntity.transform.setPosition(0, 1, 0);
      const triggerCollider = triggerEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true;
      const mesh = createModelMesh(
        engine,
        [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]
      );
      meshShape.mesh = mesh;
      meshShape.isTrigger = true;
      triggerCollider.addShape(meshShape);

      // Create passing sphere
      const sphereEntity = root.createChild("passingSphere");
      sphereEntity.transform.setPosition(0, 5, 0);
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      const sphereShape = new SphereColliderShape();
      sphereShape.radius = 0.3;
      dynamicCollider.addShape(sphereShape);

      const triggerScript = sphereEntity.addComponent(CollisionScript);

      // Simulate - sphere falls through trigger zone
      for (let i = 0; i < 60; i++) {
        physicsScene._update(1 / 60);
      }

      expect(triggerScript.onTriggerEnter).toHaveBeenCalled();

      triggerEntity.destroy();
      sphereEntity.destroy();
    });
  });

  describe("Mesh Scale", () => {
    it.each([false, true])("keeps shape and cooked mesh when scaling (convex: %s)", (isConvex) => {
      const entity = root.createChild("scaledMeshUpdate");
      const collider = entity.addComponent(StaticCollider);
      const shape = new MeshColliderShape();
      shape.isConvex = isConvex;
      shape.position.x = 1;
      const mesh = createCubeMesh(engine);
      const replacementMesh = createCubeMesh(engine, 2);
      shape.mesh = mesh;
      collider.addShape(shape);
      physicsScene._update(1 / 60);
      const nativeShape = (shape as any)._nativeShape;
      const pxShape = nativeShape._pxShape;
      const pxMesh = nativeShape._pxMesh;
      const hit = new HitResult();
      const scaleRay = new Ray(new Vector3(3, 5, 0), new Vector3(0, -1, 0));
      const updateRay = new Ray(new Vector3(5, 5, 0), new Vector3(0, -1, 0));

      expect(physicsScene.raycast(scaleRay, hit)).toBe(false);
      entity.transform.setScale(2, 1, 1);
      physicsScene._update(1 / 60);
      expect(nativeShape._pxShape).toBe(pxShape);
      expect(nativeShape._pxMesh).toBe(pxMesh);
      expect(physicsScene.raycast(scaleRay, hit)).toBe(true);
      expect(hit.shape).toBe(shape);
      expect(physicsScene.raycast(updateRay, hit)).toBe(false);

      shape.mesh = replacementMesh;
      expect(nativeShape._pxShape).toBe(pxShape);
      expect(physicsScene.raycast(updateRay, hit)).toBe(true);
      expect(hit.shape).toBe(shape);

      entity.destroy();
      mesh.destroy();
      replacementMesh.destroy();
    });

    it("should respect entity scale", async () => {
      // Create scaled ground mesh
      const groundEntity = root.createChild("scaledGround");
      groundEntity.transform.setPosition(0, 0, 0);
      groundEntity.transform.setScale(2, 1, 2); // Scale X and Z by 2
      const groundCollider = groundEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      // Flip winding order to make normals face +Y (up)
      const mesh = createModelMesh(
        engine,
        [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, 2, -2, 0, 2],
        [0, 2, 1, 3, 5, 4]
      );
      meshShape.mesh = mesh;
      groundCollider.addShape(meshShape);

      // Create sphere at edge (should still be over ground due to scale)
      const sphereEntity = root.createChild("edgeSphere");
      sphereEntity.transform.setPosition(3, 2, 0); // At x=3, within scaled range
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      const sphereShape = new SphereColliderShape();
      sphereShape.radius = 0.5;
      dynamicCollider.addShape(sphereShape);

      // Simulate
      for (let i = 0; i < 60; i++) {
        physicsScene._update(1 / 60);
      }

      // Sphere should be stopped by scaled ground
      expect(sphereEntity.transform.position.y).toBeGreaterThan(-1);

      groundEntity.destroy();
      sphereEntity.destroy();
    });

    it("should apply correct scale when adding shape to existing collider at runtime", async () => {
      // This test verifies that setWorldScale is called in _addNativeShape.
      // Without it, shapes added to an existing collider (where transform hasn't changed)
      // would have incorrect scale because _onUpdate only runs when _updateFlag.flag is true.

      // Create scaled entity with collider
      const groundEntity = root.createChild("runtimeScaleGround");
      groundEntity.transform.setPosition(0, 0, 0);
      groundEntity.transform.setScale(2, 1, 2); // Scale X and Z by 2
      const groundCollider = groundEntity.addComponent(StaticCollider);

      // Add initial shape and run physics to clear _updateFlag
      const initialShape = new BoxColliderShape();
      initialShape.size = new Vector3(0.1, 0.1, 0.1); // Small box, won't interfere
      initialShape.position = new Vector3(100, 0, 100); // Far away
      groundCollider.addShape(initialShape);

      // Run physics multiple times to ensure _updateFlag.flag becomes false
      for (let i = 0; i < 10; i++) {
        physicsScene._update(1 / 60);
      }

      // Now add mesh shape at runtime - this is the critical test
      // If setWorldScale is not called in _addNativeShape, the mesh will have scale (1,1,1)
      const meshShape = new MeshColliderShape();
      // Small ground plane: -2 to 2 in local space, but scaled by 2 -> -4 to 4 in world space
      const mesh = createModelMesh(
        engine,
        [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, 2, -2, 0, 2],
        [0, 2, 1, 3, 5, 4]
      );
      meshShape.mesh = mesh;
      groundCollider.addShape(meshShape);

      // Create sphere at x=3, which is:
      // - Outside unscaled mesh range (-2 to 2)
      // - Inside scaled mesh range (-4 to 4)
      const sphereEntity = root.createChild("runtimeScaleSphere");
      sphereEntity.transform.setPosition(3, 2, 0);
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      const sphereShape = new SphereColliderShape();
      sphereShape.radius = 0.5;
      dynamicCollider.addShape(sphereShape);

      // Simulate - sphere should be stopped by correctly scaled mesh
      for (let i = 0; i < 60; i++) {
        physicsScene._update(1 / 60);
      }

      // If scale is correct (2x), sphere at x=3 should land on the ground
      // If scale is wrong (1x), sphere would fall through (mesh only covers -2 to 2)
      expect(sphereEntity.transform.position.y).toBeGreaterThan(-1);

      groundEntity.destroy();
      sphereEntity.destroy();
    });
  });

  describe("Mesh Data Update", () => {
    it.each(["mesh", "cookingFlags", "isConvex", "clear and restore"])(
      "preserves collision filtering after changing %s",
      (property) => {
        const entity = root.createChild("filteredMesh");
        entity.transform.setPosition(100, 100, 0);
        const collider = entity.addComponent(StaticCollider);
        const shape = new MeshColliderShape();
        const vertices = [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1];
        const indices = [
          0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5
        ];
        const mesh = createModelMesh(engine, vertices, indices);
        const replacementMesh = createModelMesh(engine, vertices, indices);
        shape.mesh = mesh;
        collider.addShape(shape);
        collider.collisionLayer = Layer.Layer5;
        physicsScene.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, false);

        class ContactScript extends Script {
          collided = false;

          onCollisionEnter(): void {
            this.collided = true;
          }
        }

        const detectsCollision = () => {
          const probe = root.createChild("filteredMeshProbe");
          probe.transform.setPosition(100, 101.25, 0);
          const probeCollider = probe.addComponent(DynamicCollider);
          probeCollider.useGravity = false;
          const probeShape = new SphereColliderShape();
          probeCollider.addShape(probeShape);
          probeCollider.collisionLayer = Layer.Layer6;
          const script = probe.addComponent(ContactScript);
          physicsScene._update(1 / 60);
          const collided = script.collided;
          probe.destroy();
          return collided;
        };

        try {
          expect(detectsCollision()).toBe(false);
          switch (property) {
            case "mesh":
              shape.mesh = replacementMesh;
              break;
            case "cookingFlags":
              shape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
              break;
            case "isConvex":
              shape.isConvex = true;
              break;
            case "clear and restore":
              shape.mesh = null;
              shape.mesh = mesh;
              break;
          }
          expect(collider.collisionLayer).toBe(Layer.Layer5);
          expect(detectsCollision()).toBe(false);

          collider.collisionLayer = Layer.Layer0;
          expect(detectsCollision()).toBe(true);
        } finally {
          physicsScene.setColliderLayerCollision(Layer.Layer5, Layer.Layer6, true);
          entity.destroy();
          mesh.destroy();
          replacementMesh.destroy();
        }
      }
    );

    it.each([false, true])("reuses the native shape when updating mesh data (convex: %s)", (isConvex) => {
      const entity = root.createChild("updateMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = isConvex;

      // Initial mesh
      const mesh1 = createCubeMesh(engine);
      meshShape.mesh = mesh1;
      staticCollider.addShape(meshShape);
      const firstNativeShape = (meshShape as any)._nativeShape;
      const pxShape = firstNativeShape._pxShape;
      const actor = (staticCollider as any)._nativeCollider._pxActor;
      const createShapeSpy = vi.spyOn(firstNativeShape._physXPhysics._pxPhysics, "createShape");
      const attachSpy = vi.spyOn(actor, "attachShape");
      const detachSpy = vi.spyOn(actor, "detachShape");
      const ray = new Ray(new Vector3(1.5, 3, 0), new Vector3(0, -1, 0));
      const hit = new HitResult();
      expect(physicsScene.raycast(ray, hit)).toBe(false);

      // Update mesh
      const mesh2 = createCubeMesh(engine, 2);
      meshShape.mesh = mesh2;

      expect(staticCollider.shapes.length).toBe(1);
      expect((meshShape as any)._nativeShape).toBe(firstNativeShape);
      expect(firstNativeShape._pxShape).toBe(pxShape);
      expect(createShapeSpy).not.toHaveBeenCalled();
      expect(attachSpy).not.toHaveBeenCalled();
      expect(detachSpy).not.toHaveBeenCalled();
      expect(mesh1.refCount).toBe(0);
      expect(mesh2.refCount).toBe(1);
      expect((staticCollider as any)._nativeCollider._shapes).toEqual([(meshShape as any)._nativeShape]);
      expect(physicsScene.raycast(ray, hit)).toBe(true);
      expect(hit.shape).toBe(meshShape);

      createShapeSpy.mockRestore();
      attachSpy.mockRestore();
      detachSpy.mockRestore();
      entity.destroy();
      mesh1.destroy();
      mesh2.destroy();
    });

    it.each(["mesh", "cookingFlags"])(
      "keeps %s and the native mesh when recooking fails, then permits retry",
      (property) => {
        const groundEntity = root.createChild("transactionalMeshUpdateGround");
        const staticCollider = groundEntity.addComponent(StaticCollider);
        const meshShape = new MeshColliderShape();
        const groundMesh = createModelMesh(
          engine,
          [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10],
          [0, 2, 1, 1, 2, 3]
        );
        meshShape.mesh = groundMesh;
        staticCollider.addShape(meshShape);

        const nativeShape = (meshShape as any)._nativeShape;
        const pxShape = nativeShape._pxShape;
        const pxMesh = nativeShape._pxMesh;
        const pxGeometry = nativeShape._pxGeometry;
        const meshData = (meshShape as any)._meshData;
        const oldCookingFlags = meshShape.cookingFlags;
        const destroySpy = vi.spyOn(nativeShape, "destroy");
        const releaseSpy = vi.spyOn(pxMesh, "release");
        const cooking = nativeShape._physXPhysics._pxCooking;
        const originalCreateTriMesh = cooking.createTriMesh;
        const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const replacementMesh = createModelMesh(engine, [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2], [0, 2, 1, 1, 2, 3]);
        const update = () => {
          if (property === "mesh") {
            meshShape.mesh = replacementMesh;
          } else {
            meshShape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
          }
        };
        const ray = new Ray(new Vector3(5, 2, 0), new Vector3(0, -1, 0));
        const hit = new HitResult();

        try {
          cooking.createTriMesh = () => null;
          update();

          expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to create triangle mesh"));
          expect(meshShape.mesh).toBe(groundMesh);
          expect(meshShape.cookingFlags).toBe(oldCookingFlags);
          expect((meshShape as any)._meshData).toBe(meshData);
          expect(groundMesh.refCount).toBe(1);
          expect(replacementMesh.refCount).toBe(0);
          expect((meshShape as any)._nativeShape).toBe(nativeShape);
          expect(nativeShape._pxShape).toBe(pxShape);
          expect(nativeShape._pxMesh).toBe(pxMesh);
          expect(nativeShape._pxGeometry).toBe(pxGeometry);
          expect((staticCollider as any)._nativeCollider._shapes).toEqual([nativeShape]);
          expect(destroySpy).not.toHaveBeenCalled();
          expect(releaseSpy).not.toHaveBeenCalled();
          expect(physicsScene.raycast(ray, hit)).toBe(true);
          expect(hit.shape).toBe(meshShape);

          cooking.createTriMesh = originalCreateTriMesh;
          update();
          expect(nativeShape._pxShape).toBe(pxShape);
          expect(nativeShape._pxMesh).not.toBe(pxMesh);
          expect(releaseSpy).toHaveBeenCalledTimes(1);
          expect(meshShape.mesh).toBe(property === "mesh" ? replacementMesh : groundMesh);
          expect(meshShape.cookingFlags).toBe(
            property === "mesh" ? oldCookingFlags : MeshColliderShapeCookingFlag.Cleaning
          );
          expect(physicsScene.raycast(ray, hit)).toBe(property !== "mesh");
        } finally {
          cooking.createTriMesh = originalCreateTriMesh;
          consoleErrorSpy.mockRestore();
          destroySpy.mockRestore();
          releaseSpy.mockRestore();
          groundEntity.destroy();
          groundMesh.destroy();
          replacementMesh.destroy();
        }
      }
    );

    it("updates dynamic mass properties after replacing mesh geometry in place", () => {
      const entity = root.createChild("convexMeshMassUpdate");
      const collider = entity.addComponent(DynamicCollider);
      collider.useGravity = false;
      const shape = new MeshColliderShape();
      shape.isConvex = true;
      const mesh = createCubeMesh(engine);
      const replacementMesh = createCubeMesh(engine, 2, 3);
      shape.mesh = mesh;
      collider.addShape(shape);
      const pxShape = (shape as any)._nativeShape._pxShape;
      const inertia = collider.inertiaTensor.clone();
      expect(collider.centerOfMass.x).toBeCloseTo(0);

      shape.mesh = replacementMesh;

      expect((shape as any)._nativeShape._pxShape).toBe(pxShape);
      expect(collider.centerOfMass.x).toBeCloseTo(3);
      expect(collider.inertiaTensor.x).toBeCloseTo(inertia.x * 4);
      expect(collider.inertiaTensor.y).toBeCloseTo(inertia.y * 4);
      expect(collider.inertiaTensor.z).toBeCloseTo(inertia.z * 4);

      entity.destroy();
      mesh.destroy();
      replacementMesh.destroy();
    });

    it("keeps the attached mesh and active trigger when convex recooking fails", () => {
      const entity = root.createChild("failedMeshRecooking");
      const staticCollider = entity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true;
      meshShape.isTrigger = true;
      const oldMesh = createModelMesh(
        engine,
        [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1]
      );
      meshShape.mesh = oldMesh;
      staticCollider.addShape(meshShape);

      const sphereEntity = root.createChild("replacementTriggerOverlap");
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = true;
      const sphereShape = new SphereColliderShape();
      sphereShape.radius = 0.25;
      dynamicCollider.addShape(sphereShape);
      const triggerScript = sphereEntity.addComponent(CollisionScript);
      physicsScene._update(1 / 60);
      expect(triggerScript.onTriggerEnter).toHaveBeenCalledTimes(1);

      const oldNativeShape = (meshShape as any)._nativeShape;
      const nativeCollider = (staticCollider as any)._nativeCollider;
      const oldDestroySpy = vi.spyOn(oldNativeShape, "destroy");
      const actorAttachSpy = vi.spyOn(nativeCollider._pxActor, "attachShape");
      const actorDetachSpy = vi.spyOn(nativeCollider._pxActor, "detachShape");
      const cookSpy = vi.spyOn(oldNativeShape._physXPhysics._pxCooking, "createConvexMesh").mockReturnValueOnce(null);
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      try {
        const replacementMesh = createModelMesh(engine, [0, 2, 0, -2, -2, -2, 2, -2, -2, 0, -2, 2]);

        meshShape.mesh = replacementMesh;
        expect(meshShape.mesh).toBe(oldMesh);
        expect(oldMesh.refCount).toBe(1);
        expect(replacementMesh.refCount).toBe(0);
        expect((meshShape as any)._nativeShape).toBe(oldNativeShape);
        expect(nativeCollider._shapes).toEqual([oldNativeShape]);
        expect(actorAttachSpy).not.toHaveBeenCalled();
        expect(actorDetachSpy).not.toHaveBeenCalled();
        expect(oldDestroySpy).not.toHaveBeenCalled();

        physicsScene._update(1 / 60);
        expect(triggerScript.onTriggerEnter).toHaveBeenCalledTimes(1);
        expect(triggerScript.onTriggerExit).not.toHaveBeenCalled();
        expect(triggerScript.onTriggerStay).toHaveBeenCalled();
        replacementMesh.destroy();
      } finally {
        cookSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        actorAttachSpy.mockRestore();
        actorDetachSpy.mockRestore();
        oldDestroySpy.mockRestore();
        entity.destroy();
        sphereEntity.destroy();
        oldMesh.destroy();
      }
    });
  });

  describe("Triangle Mesh with DynamicCollider", () => {
    it("should log error when adding triangle mesh to non-kinematic DynamicCollider", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("nonKinematicMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = false; // Ensure non-kinematic

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = false; // Triangle mesh
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Non-convex MeshColliderShape"));

      errorSpy.mockRestore();
      entity.destroy();
    });

    it("should log error when setting isKinematic to false with existing triangle mesh", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("kinematicToNonKinematic");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = true; // Start as kinematic

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = false; // Triangle mesh
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape); // OK with kinematic
      expect(errorSpy).not.toHaveBeenCalled();

      dynamicCollider.isKinematic = false; // Switch to non-kinematic

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("non-convex MeshColliderShape"));

      errorSpy.mockRestore();
      entity.destroy();
    });

    it("should NOT log error when adding triangle mesh to kinematic DynamicCollider", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("kinematicMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = true;

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = false; // Triangle mesh
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      entity.destroy();
    });

    it("should clone a kinematic triangle mesh that participates in raycasts", () => {
      const entity = root.createChild("clonedKinematicMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = true;
      dynamicCollider.automaticCenterOfMass = false;
      dynamicCollider.automaticInertiaTensor = false;

      const meshShape = new MeshColliderShape();
      const mesh = createModelMesh(engine, [-5, 0, -5, 5, 0, -5, -5, 0, 5, 5, 0, 5], [0, 2, 1, 1, 2, 3]);
      meshShape.mesh = mesh;
      dynamicCollider.addShape(meshShape);

      const clone = entity.clone();
      root.addChild(clone);
      const clonedCollider = clone.getComponent(DynamicCollider);
      const clonedShape = clonedCollider.shapes[0];
      entity.destroy();

      const hit = new HitResult();
      expect(physicsScene.raycast(new Ray(new Vector3(0, 2, 0), new Vector3(0, -1, 0)), hit)).toBe(true);
      expect(hit.entity).toBe(clone);
      expect(hit.shape).toBe(clonedShape);

      clone.destroy();
    });

    it("should NOT log error when adding convex mesh to non-kinematic DynamicCollider", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("convexNonKinematic");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = false;

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true; // Convex mesh - should work
      const mesh = createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      entity.destroy();
    });
  });

  describe("Native Shape Attachment", () => {
    it("keeps convex mode unchanged when replacement attachment fails", () => {
      const entity = root.createChild("rejectedMeshConfiguration");
      const collider = entity.addComponent(StaticCollider);
      const shape = new MeshColliderShape();
      const mesh = createModelMesh(
        engine,
        [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
      );
      shape.mesh = mesh;
      collider.addShape(shape);
      const nativeCollider = (collider as any)._nativeCollider;
      const nativeShape = (shape as any)._nativeShape;
      const attachSpy = vi.spyOn(nativeCollider._pxActor, "attachShape").mockReturnValueOnce(false);
      const originalReplaceShape = nativeCollider.replaceShape.bind(nativeCollider);
      let candidateDestroySpy: ReturnType<typeof vi.spyOn>;
      const replaceSpy = vi.spyOn(nativeCollider, "replaceShape").mockImplementationOnce((previousShape, newShape) => {
        candidateDestroySpy = vi.spyOn(newShape, "destroy");
        return originalReplaceShape(previousShape, newShape);
      });

      try {
        expect(() => (shape.isConvex = true)).toThrowError(
          "Collider: failed to attach replacement shape to the native actor."
        );
        expect(shape.isConvex).toBe(false);
        expect(shape.mesh).toBe(mesh);
        expect(mesh.refCount).toBe(1);
        expect((shape as any)._nativeShape).toBe(nativeShape);
        expect(nativeCollider._shapes).toEqual([nativeShape]);
        expect(candidateDestroySpy).toHaveBeenCalledTimes(1);

        shape.isConvex = true;
        expect(shape.isConvex).toBe(true);
        expect((shape as any)._nativeShape).not.toBe(nativeShape);
      } finally {
        attachSpy.mockRestore();
        replaceSpy.mockRestore();
        candidateDestroySpy?.mockRestore();
        entity.destroy();
        mesh.destroy();
      }
    });

    it("releases a rejected first native mesh and allows retry on the same collider", () => {
      const entity = root.createChild("rejectedFirstNativeMesh");
      const collider = entity.addComponent(StaticCollider);
      const shape = new MeshColliderShape();
      collider.addShape(shape);
      const mesh = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, 0, 0, 1], [0, 1, 2]);
      const nativeCollider = (collider as any)._nativeCollider;
      const attachSpy = vi.spyOn(nativeCollider._pxActor, "attachShape").mockReturnValueOnce(false);
      const originalAddShape = nativeCollider.addShape.bind(nativeCollider);
      let candidateDestroySpy: any;
      const addSpy = vi.spyOn(nativeCollider, "addShape").mockImplementationOnce((nativeShape) => {
        candidateDestroySpy = vi.spyOn(nativeShape, "destroy");
        return originalAddShape(nativeShape);
      });

      try {
        expect(() => (shape.mesh = mesh)).toThrowError(
          "Collider: failed to attach replacement shape to the native actor."
        );
        expect(candidateDestroySpy).toHaveBeenCalledTimes(1);
        expect(shape.mesh).toBeNull();
        expect((shape as any)._nativeShape).toBeUndefined();
        expect(mesh.refCount).toBe(0);
        expect(shape.collider).toBe(collider);
        expect(collider.shapes).toEqual([shape]);
        expect(nativeCollider._shapes).toHaveLength(0);

        shape.mesh = mesh;
        expect(shape.mesh).toBe(mesh);
        expect(mesh.refCount).toBe(1);
        expect(nativeCollider._shapes).toEqual([(shape as any)._nativeShape]);
      } finally {
        attachSpy.mockRestore();
        addSpy.mockRestore();
        candidateDestroySpy?.mockRestore();
        entity.destroy();
        mesh.destroy();
      }
    });

    it("should not record a shape when PhysX rejects the native attachment", () => {
      const entity = root.createChild("rejectedNativeShape");
      const collider = entity.addComponent(StaticCollider);
      const shape = new BoxColliderShape();
      const nativeCollider = (collider as any)._nativeCollider;
      const attachSpy = vi.spyOn(nativeCollider._pxActor, "attachShape").mockReturnValue(false);

      try {
        expect(() => collider.addShape(shape)).toThrowError("Collider: failed to attach shape to the native actor.");
        expect(collider.shapes).toHaveLength(0);
        expect(nativeCollider._shapes).toHaveLength(0);
        expect(shape.collider).toBeFalsy();
      } finally {
        attachSpy.mockRestore();
        entity.destroy();
        (shape as any)._destroy();
      }
    });
  });

  describe("Inaccessible Mesh Guard", () => {
    it("should warn and not create native shape when mesh data is released", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("inaccessibleMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();

      // Create mesh with releaseData=true so accessible becomes false
      const mesh = new ModelMesh(engine);
      const positions = [new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)];
      mesh.setPositions(positions);
      mesh.setIndices(new Uint16Array([0, 1, 2]));
      mesh.uploadData(true); // Releases data, _accessible = false

      staticCollider.addShape(meshShape);
      meshShape.mesh = mesh;

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not accessible"));
      // @ts-ignore - access internal _nativeShape for verification
      expect(meshShape._nativeShape).toBeFalsy();

      warnSpy.mockRestore();
      entity.destroy();
    });

    it("should warn when non-convex mesh has no indices", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("noIndicesMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = false;

      // Create mesh without indices
      const mesh = new ModelMesh(engine);
      mesh.setPositions([new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.uploadData(false);

      staticCollider.addShape(meshShape);
      meshShape.mesh = mesh;

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Non-convex mesh requires indices"));
      // @ts-ignore
      expect(meshShape._nativeShape).toBeFalsy();

      warnSpy.mockRestore();
      entity.destroy();
    });
  });

  describe("isConvex Switching", () => {
    it("should destroy and recreate native shape when toggling isConvex", () => {
      const entity = root.createChild("switchConvex");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true;

      const mesh = createModelMesh(
        engine,
        [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
      );
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      const firstNativeShape = meshShape._nativeShape;
      expect(firstNativeShape).not.toBeNull();

      // Switch from convex to triangle mesh
      meshShape.isConvex = false;

      // @ts-ignore
      const secondNativeShape = meshShape._nativeShape;
      expect(secondNativeShape).not.toBeNull();
      // Should be a different native shape instance (destroyed and recreated)
      expect(secondNativeShape).not.toBe(firstNativeShape);

      entity.destroy();
    });

    it("should switch to non-convex using cached indices after mesh data is released", () => {
      const entity = root.createChild("releasedConvexMeshData");
      const staticCollider = entity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      const mesh = createModelMesh(
        engine,
        [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
      );
      meshShape.isConvex = true;
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);
      mesh.uploadData(true);
      const nativeShape = (meshShape as any)._nativeShape;

      meshShape.isConvex = false;

      expect(meshShape.isConvex).toBe(false);
      expect((meshShape as any)._nativeShape).not.toBe(nativeShape);
      expect((staticCollider as any)._nativeCollider._shapes).toEqual([(meshShape as any)._nativeShape]);

      entity.destroy();
    });

    it("should keep the convex shape when switching requires missing indices", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("switchConvexNoIndices");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = true;

      // Create convex mesh (no indices needed for convex)
      const mesh = new ModelMesh(engine);
      mesh.setPositions([new Vector3(0, 1, 0), new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
      mesh.uploadData(false);

      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      const nativeShape = (meshShape as any)._nativeShape;
      expect(nativeShape).not.toBeNull();

      // Switch to non-convex - should fail because no indices
      meshShape.isConvex = false;

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Non-convex mesh requires indices"));
      expect(meshShape.isConvex).toBe(true);
      expect((meshShape as any)._nativeShape).toBe(nativeShape);
      expect((staticCollider as any)._nativeCollider._shapes).toEqual([nativeShape]);

      warnSpy.mockRestore();
      entity.destroy();
    });
  });

  describe("Set Mesh Null", () => {
    it("should detach the native shape and accept a new mesh after setting mesh to null", () => {
      const entity = root.createChild("nullMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();

      const mesh1 = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh1;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      expect(meshShape._nativeShape).not.toBeNull();

      // Set mesh to null - should disable shape
      meshShape.mesh = null;

      // @ts-ignore
      expect(meshShape._nativeShape).toBeNull();
      expect(meshShape.mesh).toBeNull();
      expect((staticCollider as any)._nativeCollider._shapes).toHaveLength(0);

      const mesh2 = createModelMesh(engine, [0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0], [0, 1, 2, 3, 4, 5]);
      meshShape.mesh = mesh2;
      // @ts-ignore
      expect(meshShape._nativeShape).not.toBeNull();
      expect((staticCollider as any)._nativeCollider._shapes).toEqual([(meshShape as any)._nativeShape]);

      entity.destroy();
    });
  });

  describe("CookingFlags", () => {
    it("should switch to convex using cached data after mesh upload data is released", () => {
      const entity = root.createChild("releasedMeshData");
      const staticCollider = entity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      const mesh = createModelMesh(
        engine,
        [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
      );
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);
      mesh.uploadData(true);

      meshShape.isConvex = true;

      expect(meshShape.isConvex).toBe(true);
      expect((staticCollider as any)._nativeCollider._shapes).toEqual([(meshShape as any)._nativeShape]);

      entity.destroy();
    });

    it.each([false, true])("reuses the native shape when changing cookingFlags (convex: %s)", (isConvex) => {
      const entity = root.createChild("cookingFlags");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      meshShape.isConvex = isConvex;
      const mesh = createCubeMesh(engine);
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      const nativeShapeBefore = meshShape._nativeShape;
      expect(nativeShapeBefore).not.toBeNull();
      const pxShape = (nativeShapeBefore as any)._pxShape;
      const pxMesh = (nativeShapeBefore as any)._pxMesh;

      meshShape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;

      const nativeShapeAfter = (meshShape as any)._nativeShape;
      expect(nativeShapeAfter).toBe(nativeShapeBefore);
      expect(nativeShapeAfter._pxShape).toBe(pxShape);
      expect(nativeShapeAfter._pxMesh).not.toBe(pxMesh);
      expect((staticCollider as any)._nativeCollider._shapes).toEqual([nativeShapeAfter]);

      entity.destroy();
      mesh.destroy();
    });

    it("should not update when no mesh is set", () => {
      const meshShape = new MeshColliderShape();

      // Change cookingFlags without mesh - should not throw
      meshShape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
      expect(meshShape.cookingFlags).toBe(MeshColliderShapeCookingFlag.Cleaning);
    });
  });

  describe("DynamicCollider.move()", () => {
    it("should warn when move() is called on non-kinematic DynamicCollider", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("nonKinematicMove");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = false;

      dynamicCollider.move(new Vector3(1, 0, 0));

      expect(warnSpy).toHaveBeenCalledWith("DynamicCollider: move() is only supported when isKinematic is true.");

      warnSpy.mockRestore();
      entity.destroy();
    });

    it("should resync collisionDetectionMode when switching from kinematic to dynamic", () => {
      const entity = root.createChild("kinematicCCDResync");
      const dynamicCollider = entity.addComponent(DynamicCollider);

      // Set CCD mode first
      dynamicCollider.collisionDetectionMode = 1; // Continuous
      dynamicCollider.isKinematic = true;

      // Switch back to dynamic - should resync CCD
      dynamicCollider.isKinematic = false;

      expect(dynamicCollider.collisionDetectionMode).toBe(1);

      entity.destroy();
    });
  });

  describe("mesh refCount (slot-ownership contract)", () => {
    it("clone acquires ownership, reassignment transfers it, and destroy releases it", () => {
      const meshA = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, 0, 0, 1], [0, 1, 2]);
      const meshB = createModelMesh(engine, [-2, 0, -2, 2, 0, -2, 0, 0, 2], [0, 1, 2]);
      const entity = root.createChild("meshRefSlot");
      const collider = entity.addComponent(StaticCollider);
      const shape = new MeshColliderShape();
      shape.mesh = meshA;
      collider.addShape(shape);
      expect(meshA.refCount).toBe(1);

      const clone = entity.clone();
      root.addChild(clone);
      expect(meshA.refCount).toBe(2);

      const clonedShape = clone.getComponent(StaticCollider).shapes[0] as MeshColliderShape;
      expect(clonedShape).not.toBe(shape);
      clonedShape.mesh = meshB;
      expect(meshA.refCount).toBe(1);
      expect(meshB.refCount).toBe(1);

      clone.destroy();
      expect(meshB.refCount).toBe(0);
      expect(meshA.refCount).toBe(1);

      entity.destroy();
      expect(meshA.refCount).toBe(0);
    });

    it.each(["mesh", "empty", "cooking failure"])("releases constructor presets when cloning (%s)", (mode) => {
      const presets: { mesh: ModelMesh; nativeShape: any; destroy: ReturnType<typeof vi.spyOn> }[] = [];

      class ShapeScript extends Script {
        shape = new MeshColliderShape();

        constructor(entity: Entity) {
          super(entity);
          const mesh = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, 0, 0, 1], [0, 1, 2]);
          this.shape.mesh = mesh;
          const nativeShape = this.shape._nativeShape;
          presets.push({ mesh, nativeShape, destroy: vi.spyOn(nativeShape, "destroy") });
        }
      }

      const entity = root.createChild("meshClonePreset");
      const source = entity.addComponent(ShapeScript);
      const sourceMesh = source.shape.mesh;
      const physics = (source.shape._nativeShape as any)._physXPhysics;
      const createShape = physics.createMeshColliderShape.bind(physics);
      const createShapeSpy = vi.spyOn(physics, "createMeshColliderShape");
      let clone: Entity;

      try {
        if (mode === "empty") {
          source.shape.mesh = null;
        } else {
          sourceMesh.uploadData(true);
        }
        if (mode === "cooking failure") {
          createShapeSpy.mockImplementationOnce(createShape).mockReturnValueOnce(null);
        }

        clone = entity.clone();
        const clonedShape = clone.getComponent(ShapeScript).shape;
        expect(clonedShape.mesh).toBe(mode === "mesh" ? sourceMesh : null);
        expect(presets[1].mesh.refCount).toBe(0);
        expect(presets[1].destroy).toHaveBeenCalledOnce();
        expect(Boolean(clonedShape._nativeShape)).toBe(mode === "mesh");
        expect(sourceMesh.refCount).toBe(mode === "mesh" ? 2 : mode === "empty" ? 0 : 1);
      } finally {
        clone?.getComponent(ShapeScript).shape._destroy();
        source.shape._destroy();
        for (const preset of presets) {
          if (preset.destroy.mock.calls.length === 0) {
            preset.nativeShape.destroy();
          }
          preset.destroy.mockRestore();
        }
        createShapeSpy.mockRestore();
        clone?.destroy();
        entity.destroy();
      }
      expect(sourceMesh.refCount).toBe(0);
    });

    it("keeps a failed mesh clone empty without acquiring source ownership", () => {
      const entity = root.createChild("failedMeshCloneSource");
      const collider = entity.addComponent(StaticCollider);
      const shape = new MeshColliderShape();
      const mesh = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, 0, 0, 1], [0, 1, 2]);
      shape.mesh = mesh;
      collider.addShape(shape);

      const nativeShape = (shape as any)._nativeShape;
      const cooking = nativeShape._physXPhysics._pxCooking;
      const originalCreateTriMesh = cooking.createTriMesh;
      const sourceRefCount = mesh.refCount;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let clone: Entity | null = null;

      try {
        cooking.createTriMesh = () => null;
        clone = entity.clone();
        const clonedCollider = clone.getComponent(StaticCollider);
        const clonedShape = clonedCollider.shapes[0] as MeshColliderShape;

        expect(clonedShape.mesh).toBeNull();
        expect((clonedShape as any)._nativeShape).toBeNull();
        expect((clonedCollider as any)._nativeCollider._shapes).toHaveLength(0);
        expect(mesh.refCount).toBe(sourceRefCount);
        expect(shape.mesh).toBe(mesh);
        expect((shape as any)._nativeShape).toBe(nativeShape);
      } finally {
        cooking.createTriMesh = originalCreateTriMesh;
        consoleErrorSpy.mockRestore();
        clone?.destroy();
        entity.destroy();
      }
    });
  });
});
