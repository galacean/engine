import {
  Entity,
  MeshColliderShape,
  MeshColliderShapeCookingFlag,
  SphereColliderShape,
  BoxColliderShape,
  DynamicCollider,
  Engine,
  StaticCollider,
  PhysicsMaterial,
  Script,
  ModelMesh
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { describe, beforeAll, beforeEach, expect, it, vi } from "vitest";

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

function getNativeShapeCount(collider: DynamicCollider): number {
  return (collider as any)._nativeCollider._shapes.length;
}

describe("MeshColliderShape PhysX", () => {
  let engine: WebGLEngine;
  let root: Entity;
  let physicsScene: any;

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
    engine.run();

    const scene = engine.sceneManager.activeScene;
    physicsScene = scene.physics;
    physicsScene.gravity = new Vector3(0, -9.81, 0);
    root = scene.createRootEntity("root");
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
      const defaultMaterial = meshShape.material;
      staticCollider.addShape(meshShape);

      expect(meshShape).toBeDefined();
      expect(staticCollider.shapes.length).toBe(1);

      // Cleanup
      groundEntity.destroy();
      defaultMaterial?.destroy();
    });

    it("should detect collision between sphere and triangle mesh", async () => {
      // Create ground mesh
      const groundEntity = root.createChild("meshGround");
      groundEntity.transform.setPosition(0, 0, 0);
      const groundCollider = groundEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      // Ground plane at y=0, CCW winding -> normal +Y
      const mesh = createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]);
      meshShape.mesh = mesh;
      groundCollider.addShape(meshShape);

      // Create falling sphere
      const sphereEntity = root.createChild("fallingSphere");
      sphereEntity.transform.setPosition(0, 2, 0);
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      const sphereShape = new SphereColliderShape();
      const sphereMaterial = sphereShape.material;
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
      meshMaterial?.destroy();
      sphereMaterial?.destroy();
    });

    it("should support position and rotation offset", () => {
      const entity = root.createChild("offsetMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      // Set position and rotation
      meshShape.position = new Vector3(1, 2, 3);
      meshShape.rotation = new Vector3(0, 45, 0);

      staticCollider.addShape(meshShape);

      expect(meshShape.position).toEqual(expect.objectContaining({ x: 1, y: 2, z: 3 }));
      expect(meshShape.rotation).toEqual(expect.objectContaining({ x: 0, y: 45, z: 0 }));

      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("should support physics material", () => {
      const entity = root.createChild("materialMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
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
      defaultMaterial?.destroy();
      material?.destroy();
    });

    it("cloned MeshColliderShape rebuilds its native PhysX shape", async () => {
      const groundEntity = root.createChild("meshGroundForClone");
      groundEntity.transform.setPosition(0, 0, 0);
      const groundCollider = groundEntity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      const mesh = createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]);
      meshShape.mesh = mesh;
      groundCollider.addShape(meshShape);

      const clonedGround = groundEntity.clone();
      // Move the original aside so the cloned ground is the only surface below the sphere.
      groundEntity.transform.setPosition(1000, 0, 0);
      root.addChild(clonedGround);
      clonedGround.transform.setPosition(0, 0, 0);

      const sphereEntity = root.createChild("sphereForClone");
      sphereEntity.transform.setPosition(0, 2, 0);
      const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
      const sphereShape = new SphereColliderShape();
      const sphereMaterial = sphereShape.material;
      sphereShape.radius = 0.5;
      dynamicCollider.addShape(sphereShape);

      for (let i = 0; i < 60; i++) {
        physicsScene._update(1 / 60);
      }

      // Sphere lands on cloned ground (y > -1), not falls forever (y < -10).
      const sphereY = sphereEntity.transform.position.y;
      expect(sphereY).toBeGreaterThan(-1);
      expect(sphereY).toBeLessThan(2);

      groundEntity.destroy();
      clonedGround.destroy();
      sphereEntity.destroy();
      meshMaterial?.destroy();
      sphereMaterial?.destroy();
    });
  });

  describe("Convex Mesh (Dynamic)", () => {
    it("should create convex mesh collider", () => {
      const entity = root.createChild("convexEntity");
      const dynamicCollider = entity.addComponent(DynamicCollider);

      // Create a simple tetrahedron (convex shape)
      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      meshShape.isConvex = true;

      const mesh = createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]);
      meshShape.mesh = mesh;
      dynamicCollider.addShape(meshShape);

      expect(meshShape.isConvex).toBe(true);
      expect(dynamicCollider.shapes.length).toBe(1);

      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("does not retry non-convex mesh creation on non-kinematic dynamic colliders", () => {
      const entity = root.createChild("unsupportedDynamicMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      const convexMesh = createModelMesh(
        engine,
        [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1],
        [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]
      );
      meshShape.isConvex = true;
      meshShape.mesh = convexMesh;
      dynamicCollider.addShape(meshShape);

      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        meshShape.isConvex = false;
        consoleErrorSpy.mockClear();

        const triangleMesh = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, 0, 0, 1], [0, 1, 2]);
        meshShape.mesh = triangleMesh;
        expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
        consoleErrorSpy.mockClear();

        for (let i = 0; i < 3; i++) {
          physicsScene._update(1 / 60);
        }
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      } finally {
        consoleErrorSpy.mockRestore();
        entity.destroy();
        meshMaterial?.destroy();
      }
    });

    it("should clone convex mesh with exactly one native shape", () => {
      const entity = root.createChild("cloneConvexMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      meshShape.isConvex = true;
      dynamicCollider.addShape(meshShape);

      const mesh = createModelMesh(engine, [-1, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 1, 1, -1, 1, 0, 1, 1]);
      meshShape.mesh = mesh;

      expect(dynamicCollider.shapes).toHaveLength(1);
      expect(getNativeShapeCount(dynamicCollider)).toBe(1);
      expect(mesh._getReferCount()).toBe(1);

      const clonedEntity = entity.clone();
      const clonedCollider = clonedEntity.getComponent(DynamicCollider);
      const clonedShape = clonedCollider.shapes[0] as MeshColliderShape;

      expect(clonedCollider.shapes).toHaveLength(1);
      expect(clonedShape.mesh).toBe(mesh);
      expect((clonedShape as any)._nativeShape).toBeTruthy();
      expect((clonedShape as any)._isShapeAttached).toBe(true);
      expect(getNativeShapeCount(clonedCollider)).toBe(1);
      expect(mesh._getReferCount()).toBe(2);

      clonedEntity.destroy();
      expect(mesh._getReferCount()).toBe(1);
      entity.destroy();
      expect(mesh._getReferCount()).toBe(0);
      defaultMaterial?.destroy();
    });

    it("should create a cloned native shape when mesh data becomes available later", () => {
      const entity = root.createChild("cloneDelayedConvexMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      meshShape.isConvex = true;
      dynamicCollider.addShape(meshShape);

      const clonedEntity = entity.clone();
      const clonedCollider = clonedEntity.getComponent(DynamicCollider);
      const clonedShape = clonedCollider.shapes[0] as MeshColliderShape;

      expect(clonedCollider.shapes).toHaveLength(1);
      expect((clonedShape as any)._nativeShape).toBeFalsy();
      expect((clonedShape as any)._isShapeAttached).toBe(false);
      expect(getNativeShapeCount(clonedCollider)).toBe(0);

      const mesh = createModelMesh(engine, [-1, -1, -1, 1, -1, -1, 0, 1, -1, -1, -1, 1, 1, -1, 1, 0, 1, 1]);
      clonedShape.mesh = mesh;

      expect((clonedShape as any)._nativeShape).toBeTruthy();
      expect((clonedShape as any)._isShapeAttached).toBe(true);
      expect(getNativeShapeCount(clonedCollider)).toBe(1);
      expect(mesh._getReferCount()).toBe(1);

      clonedEntity.destroy();
      expect(mesh._getReferCount()).toBe(0);
      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("should keep an inaccessible mesh native-less when cloned", () => {
      const warnSpy = vi.spyOn(console, "warn");
      const entity = root.createChild("cloneInaccessibleConvexMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      meshShape.isConvex = true;
      dynamicCollider.addShape(meshShape);

      const mesh = new ModelMesh(engine);
      mesh.setPositions([new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0)]);
      mesh.uploadData(true);
      meshShape.mesh = mesh;

      expect((meshShape as any)._nativeShape).toBeFalsy();
      expect(getNativeShapeCount(dynamicCollider)).toBe(0);
      expect(mesh._getReferCount()).toBe(1);

      const clonedEntity = entity.clone();
      const clonedCollider = clonedEntity.getComponent(DynamicCollider);
      const clonedShape = clonedCollider.shapes[0] as MeshColliderShape;

      expect(clonedShape.mesh).toBe(mesh);
      expect((clonedShape as any)._nativeShape).toBeFalsy();
      expect((clonedShape as any)._isShapeAttached).toBe(false);
      expect(getNativeShapeCount(clonedCollider)).toBe(0);
      expect(mesh._getReferCount()).toBe(2);

      clonedEntity.destroy();
      expect(mesh._getReferCount()).toBe(1);
      entity.destroy();
      expect(mesh._getReferCount()).toBe(0);
      defaultMaterial?.destroy();
      warnSpy.mockRestore();
    });

    it("should allow convex mesh on dynamic collider", async () => {
      // Create ground
      const groundEntity = root.createChild("ground2");
      groundEntity.transform.setPosition(0, -2, 0);
      const groundCollider = groundEntity.addComponent(StaticCollider);
      const groundShape = new BoxColliderShape();
      const groundMaterial = groundShape.material;
      groundShape.size = new Vector3(20, 1, 20);
      groundCollider.addShape(groundShape);

      // Create falling convex mesh
      const convexEntity = root.createChild("fallingConvex");
      convexEntity.transform.setPosition(0, 3, 0);
      const dynamicCollider = convexEntity.addComponent(DynamicCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
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
      groundMaterial?.destroy();
      meshMaterial?.destroy();
    });
  });

  describe("Mesh as Trigger", () => {
    it("should work as trigger", async () => {
      // Create trigger mesh zone
      const triggerEntity = root.createChild("triggerZone");
      triggerEntity.transform.setPosition(0, 1, 0);
      const triggerCollider = triggerEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
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
      const sphereMaterial = sphereShape.material;
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
      meshMaterial?.destroy();
      sphereMaterial?.destroy();
    });
  });

  describe("Mesh Scale", () => {
    it("should respect entity scale", async () => {
      // Create scaled ground mesh
      const groundEntity = root.createChild("scaledGround");
      groundEntity.transform.setPosition(0, 0, 0);
      groundEntity.transform.setScale(2, 1, 2); // Scale X and Z by 2
      const groundCollider = groundEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
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
      const sphereMaterial = sphereShape.material;
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
      meshMaterial?.destroy();
      sphereMaterial?.destroy();
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
      const initialMaterial = initialShape.material;
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
      const meshMaterial = meshShape.material;
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
      const sphereMaterial = sphereShape.material;
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
      initialMaterial?.destroy();
      meshMaterial?.destroy();
      sphereMaterial?.destroy();
    });
  });

  describe("Mesh Data Update", () => {
    it("should update mesh data", () => {
      const entity = root.createChild("updateMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;

      // Initial mesh
      const mesh1 = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh1;
      staticCollider.addShape(meshShape);

      // Update mesh
      const mesh2 = createModelMesh(engine, [0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0], [0, 1, 2, 3, 4, 5]);
      meshShape.mesh = mesh2;

      expect(staticCollider.shapes.length).toBe(1);

      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("keeps the existing native mesh when runtime mesh recooking fails", () => {
      const groundEntity = root.createChild("transactionalMeshUpdateGround");
      const staticCollider = groundEntity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      const groundMesh = createModelMesh(engine, [-10, 0, -10, 10, 0, -10, -10, 0, 10, 10, 0, 10], [0, 2, 1, 1, 2, 3]);
      meshShape.mesh = groundMesh;
      staticCollider.addShape(meshShape);

      const nativeShape = (meshShape as any)._nativeShape;
      const cooking = nativeShape._physXPhysics._pxCooking;
      const originalCreateTriMesh = cooking.createTriMesh;
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      let sphereEntity: Entity | undefined;
      let sphereMaterial: PhysicsMaterial | undefined;

      try {
        cooking.createTriMesh = () => null;
        const replacementMesh = createModelMesh(engine, [-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, 2], [0, 2, 1, 1, 2, 3]);
        meshShape.mesh = replacementMesh;

        expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to create triangle mesh"));
        expect(meshShape.mesh).toBe(groundMesh);

        sphereEntity = root.createChild("transactionalMeshUpdateSphere");
        sphereEntity.transform.setPosition(0, 2, 0);
        const dynamicCollider = sphereEntity.addComponent(DynamicCollider);
        const sphereShape = new SphereColliderShape();
        sphereMaterial = sphereShape.material;
        sphereShape.radius = 0.5;
        dynamicCollider.addShape(sphereShape);

        for (let i = 0; i < 60; i++) {
          physicsScene._update(1 / 60);
        }

        expect(sphereEntity.transform.position.y).toBeGreaterThan(-1);
      } finally {
        cooking.createTriMesh = originalCreateTriMesh;
        consoleErrorSpy.mockRestore();
        sphereEntity?.destroy();
        groundEntity.destroy();
        meshMaterial?.destroy();
        sphereMaterial?.destroy();
      }
    });

    it("does not retry terminal native shape creation failures every physics tick", () => {
      const entity = root.createChild("terminalCookFailure");
      const staticCollider = entity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      const mesh = createModelMesh(engine, [-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], [0, 2, 1, 1, 2, 3]);
      const nativePhysics = (Engine as any)._nativePhysics;
      const originalCreateMeshColliderShape = nativePhysics.createMeshColliderShape;
      const createMeshColliderShapeSpy = vi.fn(() => null);

      try {
        nativePhysics.createMeshColliderShape = createMeshColliderShapeSpy;
        staticCollider.addShape(meshShape);
        meshShape.mesh = mesh;

        expect(createMeshColliderShapeSpy).toHaveBeenCalledTimes(1);

        for (let i = 0; i < 3; i++) {
          physicsScene._update(1 / 60);
        }

        expect(createMeshColliderShapeSpy).toHaveBeenCalledTimes(1);
      } finally {
        nativePhysics.createMeshColliderShape = originalCreateMeshColliderShape;
        entity.destroy();
        meshMaterial?.destroy();
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
      const meshMaterial = meshShape.material;
      meshShape.isConvex = false; // Triangle mesh
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Non-convex MeshColliderShape"));

      errorSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
    });

    it("should log error when setting isKinematic to false with existing triangle mesh", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("kinematicToNonKinematic");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = true; // Start as kinematic

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      meshShape.isConvex = false; // Triangle mesh
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape); // OK with kinematic
      expect(errorSpy).not.toHaveBeenCalled();

      dynamicCollider.isKinematic = false; // Switch to non-kinematic

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("non-convex MeshColliderShape"));

      errorSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
    });

    it("should NOT log error when adding triangle mesh to kinematic DynamicCollider", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("kinematicMesh");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = true;

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      meshShape.isConvex = false; // Triangle mesh
      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
    });

    it("should NOT log error when adding convex mesh to non-kinematic DynamicCollider", () => {
      const errorSpy = vi.spyOn(console, "error");

      const entity = root.createChild("convexNonKinematic");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = false;

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      meshShape.isConvex = true; // Convex mesh - should work
      const mesh = createModelMesh(engine, [0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]);
      meshShape.mesh = mesh;

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
    });
  });

  describe("Inaccessible Mesh Guard", () => {
    it("should warn and not create native shape when mesh data is released", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("inaccessibleMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;

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
      defaultMaterial?.destroy();
    });

    it("should warn when non-convex mesh has no indices", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("noIndicesMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
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
      defaultMaterial?.destroy();
    });
  });

  describe("isConvex Switching", () => {
    it("should destroy and recreate native shape when toggling isConvex", () => {
      const entity = root.createChild("switchConvex");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
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
      defaultMaterial?.destroy();
    });

    it("should disable shape when switching to non-convex and mesh has no indices", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("switchConvexNoIndices");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      meshShape.isConvex = true;

      // Create convex mesh (no indices needed for convex)
      const mesh = new ModelMesh(engine);
      mesh.setPositions([new Vector3(0, 1, 0), new Vector3(-1, 0, -1), new Vector3(1, 0, -1), new Vector3(0, 0, 1)]);
      mesh.uploadData(false);

      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      expect(meshShape._nativeShape).not.toBeNull();

      // Switch to non-convex - should fail because no indices
      meshShape.isConvex = false;

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Non-convex mesh requires indices"));
      // @ts-ignore - shape should be destroyed (failure = disable)
      expect(meshShape._nativeShape).toBeNull();

      warnSpy.mockRestore();
      entity.destroy();
      defaultMaterial?.destroy();
    });
  });

  describe("Set Mesh Null", () => {
    it("should destroy native shape when setting mesh to null", () => {
      const entity = root.createChild("nullMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;

      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      expect(meshShape._nativeShape).not.toBeNull();

      // Set mesh to null - should disable shape
      meshShape.mesh = null;

      // @ts-ignore
      expect(meshShape._nativeShape).toBeNull();
      expect(meshShape.mesh).toBeNull();

      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("should still work after setting mesh to null and then setting a new mesh", () => {
      const entity = root.createChild("nullThenNewMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;

      const mesh1 = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh1;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      expect(meshShape._nativeShape).not.toBeNull();

      // Disable
      meshShape.mesh = null;
      // @ts-ignore
      expect(meshShape._nativeShape).toBeNull();

      // Re-enable with new mesh
      const mesh2 = createModelMesh(engine, [0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0], [0, 1, 2, 3, 4, 5]);
      meshShape.mesh = mesh2;
      // @ts-ignore
      expect(meshShape._nativeShape).not.toBeNull();

      entity.destroy();
      defaultMaterial?.destroy();
    });
  });

  describe("CookingFlags", () => {
    it("should reuse existing native shape when changing cookingFlags", () => {
      const entity = root.createChild("cookingFlags");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;

      const mesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      meshShape.mesh = mesh;
      staticCollider.addShape(meshShape);

      // @ts-ignore
      const nativeShapeBefore = meshShape._nativeShape;
      expect(nativeShapeBefore).not.toBeNull();

      // Change cooking flags - should reuse existing shape via setMeshData
      meshShape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;

      // @ts-ignore - same native shape instance (reused, not recreated)
      expect(meshShape._nativeShape).toBe(nativeShapeBefore);

      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("rolls back cached state when native recooking throws", () => {
      const entity = root.createChild("recookingRollback");
      const staticCollider = entity.addComponent(StaticCollider);
      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;
      const originalMesh = createModelMesh(engine, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
      const replacementMesh = createModelMesh(engine, [0, 0, 0, 2, 0, 0, 0, 2, 0], [0, 1, 2]);
      meshShape.mesh = originalMesh;
      staticCollider.addShape(meshShape);

      const originalFlags = meshShape.cookingFlags;
      const nativeShape = (meshShape as any)._nativeShape;
      vi.spyOn(nativeShape, "setMeshData").mockImplementation(() => {
        throw new Error("recook failed");
      });

      expect(() => {
        meshShape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
      }).toThrow("recook failed");
      expect(meshShape.cookingFlags).toBe(originalFlags);

      expect(() => {
        meshShape.mesh = replacementMesh;
      }).toThrow("recook failed");
      expect(meshShape.mesh).toBe(originalMesh);
      expect(originalMesh._getReferCount()).toBe(1);
      expect(replacementMesh._getReferCount()).toBe(0);

      entity.destroy();
      defaultMaterial?.destroy();
    });

    it("should not update when no mesh is set", () => {
      const meshShape = new MeshColliderShape();
      const defaultMaterial = meshShape.material;

      // Change cookingFlags without mesh - should not throw
      meshShape.cookingFlags = MeshColliderShapeCookingFlag.Cleaning;
      expect(meshShape.cookingFlags).toBe(MeshColliderShapeCookingFlag.Cleaning);

      defaultMaterial?.destroy();
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
    it("clone acquires via the setter, churn transfers, destroy releases", () => {
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
      // The rebuilt native shape must be attached exactly once (setter attaches; _syncNative skips).
      expect((clone.getComponent(StaticCollider) as any)._nativeCollider._shapes.length).toBe(1);
      clonedShape.mesh = meshB;
      expect(meshA.refCount).toBe(1);
      expect(meshB.refCount).toBe(1);

      clone.destroy();
      expect(meshB.refCount).toBe(0);
      expect(meshA.refCount).toBe(1);

      entity.destroy();
      expect(meshA.refCount).toBe(0);
    });
  });
});
