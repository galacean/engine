import {
  Entity,
  MeshColliderShape,
  SphereColliderShape,
  BoxColliderShape,
  DynamicCollider,
  StaticCollider,
  PhysicsMaterial,
  Script,
  ModelMesh
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
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
      const vertices = new Float32Array([
        -5,
        0,
        -5, // v0
        5,
        0,
        -5, // v1
        -5,
        0,
        5, // v2
        5,
        0,
        -5, // v3
        5,
        0,
        5, // v4
        -5,
        0,
        5 // v5
      ]);
      const indices = new Uint16Array([0, 1, 2, 3, 4, 5]);

      meshShape.setMeshData(vertices, indices);
      const defaultMaterial = meshShape.material; // Get material after setMeshData
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
      // Vertices for a ground plane at y=0
      // Using CCW winding (from top view) to make normal point UP (+Y)
      const vertices = new Float32Array([
        -10,
        0,
        -10, // v0: back-left
        10,
        0,
        -10, // v1: back-right
        -10,
        0,
        10, // v2: front-left
        10,
        0,
        10 // v3: front-right
      ]);
      // Triangle 1: v0, v2, v1 (CCW from top) -> normal +Y
      // Triangle 2: v1, v2, v3 (CCW from top) -> normal +Y
      const indices = new Uint16Array([0, 2, 1, 1, 2, 3]);
      meshShape.setMeshData(vertices, indices);
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
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);

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
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);

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
  });

  describe("tightBounds Property", () => {
    it("should get and set tightBounds property", () => {
      const entity = root.createChild("tightBoundsMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      meshShape.isConvex = true;

      // Default value
      expect(meshShape.tightBounds).toBe(true);

      // Set before mesh data
      meshShape.tightBounds = false;
      expect(meshShape.tightBounds).toBe(false);

      const vertices = new Float32Array([0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]);
      meshShape.setMeshData(vertices);
      staticCollider.addShape(meshShape);

      // Set after mesh data
      meshShape.tightBounds = true;
      expect(meshShape.tightBounds).toBe(true);

      entity.destroy();
      meshMaterial?.destroy();
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

      const vertices = new Float32Array([
        0,
        1,
        0, // top
        -1,
        0,
        -1, // back left
        1,
        0,
        -1, // back right
        0,
        0,
        1 // front
      ]);

      meshShape.setMeshData(vertices);
      dynamicCollider.addShape(meshShape);

      expect(meshShape.isConvex).toBe(true);
      expect(dynamicCollider.shapes.length).toBe(1);

      entity.destroy();
      defaultMaterial?.destroy();
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
      const vertices = new Float32Array([0, 0.5, 0, -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0, -0.5, 0.5]);
      meshShape.setMeshData(vertices);
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
      const vertices = new Float32Array([
        -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1, -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1
      ]);
      meshShape.setMeshData(vertices);
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
      const vertices = new Float32Array([-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, 2, -2, 0, 2]);
      // Flip winding order to make normals face +Y (up)
      const indices = new Uint16Array([0, 2, 1, 3, 5, 4]);
      meshShape.setMeshData(vertices, indices);
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
      const vertices = new Float32Array([-2, 0, -2, 2, 0, -2, -2, 0, 2, 2, 0, -2, 2, 0, 2, -2, 0, 2]);
      const indices = new Uint16Array([0, 2, 1, 3, 5, 4]);
      meshShape.setMeshData(vertices, indices);
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
      const vertices1 = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices1 = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices1, indices1);
      staticCollider.addShape(meshShape);

      // Update mesh
      const vertices2 = new Float32Array([0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0]);
      const indices2 = new Uint16Array([0, 1, 2, 3, 4, 5]);
      meshShape.setMeshData(vertices2, indices2);

      expect(staticCollider.shapes.length).toBe(1);

      entity.destroy();
      defaultMaterial?.destroy();
    });
  });

  describe("doubleSided Property Sync", () => {
    it("should detect raycast from back side when doubleSided is true", async () => {
      // 验证：doubleSided=true 时，从背面的射线应该能检测到碰撞
      // PhysX 的 eDOUBLE_SIDED 标志只影响 raycast 和 sweep，不影响刚体碰撞
      const groundEntity = root.createChild("doubleSidedGround");
      groundEntity.transform.setPosition(0, 0, 0);
      const groundCollider = groundEntity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;
      meshShape.doubleSided = true; // 先设置双面

      // 顶点构成一个水平面，法线朝 +Y
      const vertices = new Float32Array([
        -5, 0, -5, // v0
        5, 0, -5, // v1
        -5, 0, 5, // v2
        5, 0, 5 // v3
      ]);
      // CCW 顺序使法线朝 +Y
      const indices = new Uint16Array([0, 2, 1, 1, 2, 3]);
      meshShape.setMeshData(vertices, indices);
      groundCollider.addShape(meshShape);

      // 从下方向上发射射线（从背面检测）
      const ray = new Ray(new Vector3(0, -2, 0), new Vector3(0, 1, 0));
      const hitFromBack = physicsScene.raycast(ray);

      console.log("[TEST] Raycast from back side hit:", hitFromBack);

      // doubleSided=true 时，从背面的射线应该能检测到碰撞
      expect(hitFromBack).toBe(true);

      groundEntity.destroy();
      meshMaterial?.destroy();
    });
  });

  describe("setMesh Error Handling", () => {
    it("should warn when setMesh is called with non-ModelMesh", () => {
      const warnSpy = vi.spyOn(console, "warn");
      const entity = root.createChild("nonModelMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;

      // Set initial data so shape exists
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);
      staticCollider.addShape(meshShape);

      // Create a mock non-ModelMesh object
      const fakeMesh = { notAModelMesh: true } as any;
      meshShape.setMesh(fakeMesh);

      expect(warnSpy).toHaveBeenCalledWith("MeshColliderShape: Only ModelMesh is supported");

      warnSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
    });

    it("should not call _updateNativeMesh when mesh extraction fails", () => {
      const entity = root.createChild("errorMesh");
      const staticCollider = entity.addComponent(StaticCollider);

      const meshShape = new MeshColliderShape();
      const meshMaterial = meshShape.material;

      // Set initial valid mesh data
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);
      staticCollider.addShape(meshShape);

      // Spy on _updateNativeMesh to verify it's NOT called on failure
      // @ts-ignore - Access private method for testing
      const updateSpy = vi.spyOn(meshShape, "_updateNativeMesh");
      const warnSpy = vi.spyOn(console, "warn");

      // Create a mock object that passes instanceof check by setting prototype
      const mockMesh = Object.create(ModelMesh.prototype);
      Object.defineProperty(mockMesh, "_primitive", {
        value: {
          _vertexElementMap: {}, // No Position attribute
          vertexBufferBindings: []
        },
        writable: true
      });
      Object.defineProperty(mockMesh, "vertexCount", {
        value: 0,
        writable: true
      });
      mockMesh.getIndices = () => null;

      // Call setMesh with invalid mesh - should warn and NOT update
      meshShape.setMesh(mockMesh);

      // Should have warned about missing position attribute
      expect(warnSpy).toHaveBeenCalledWith("MeshColliderShape: Mesh has no position attribute");

      // _updateNativeMesh should NOT have been called (this is the key assertion)
      expect(updateSpy).not.toHaveBeenCalled();

      updateSpy.mockRestore();
      warnSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
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
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("triangle mesh"));

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
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);

      dynamicCollider.addShape(meshShape); // OK with kinematic
      expect(errorSpy).not.toHaveBeenCalled();

      dynamicCollider.isKinematic = false; // Switch to non-kinematic

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("triangle mesh"));

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
      const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
      const indices = new Uint16Array([0, 1, 2]);
      meshShape.setMeshData(vertices, indices);

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
      const vertices = new Float32Array([0, 1, 0, -1, 0, -1, 1, 0, -1, 0, 0, 1]);
      meshShape.setMeshData(vertices);

      dynamicCollider.addShape(meshShape);

      expect(errorSpy).not.toHaveBeenCalled();

      errorSpy.mockRestore();
      entity.destroy();
      meshMaterial?.destroy();
    });
  });

  describe("DynamicCollider.move()", () => {
    it("should warn when move() is called on non-kinematic DynamicCollider", () => {
      const warnSpy = vi.spyOn(console, "warn");

      const entity = root.createChild("nonKinematicMove");
      const dynamicCollider = entity.addComponent(DynamicCollider);
      dynamicCollider.isKinematic = false;

      dynamicCollider.move(new Vector3(1, 0, 0));

      expect(warnSpy).toHaveBeenCalledWith("DynamicCollider.move() should only be called when isKinematic is true.");

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
});
