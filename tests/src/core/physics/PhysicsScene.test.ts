import {
  BoxColliderShape,
  Camera,
  CharacterController,
  Collider,
  ColliderShape,
  DynamicCollider,
  Entity,
  HitResult,
  Layer,
  PhysicsScene,
  Scene,
  Script,
  SphereColliderShape,
  StaticCollider,
  OverlapHitResult
} from "@galacean/engine-core";
import { Ray, Vector3, Quaternion } from "@galacean/engine-math";
import type { IPhysicsScene } from "@galacean/engine-design";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine";
import { vi, describe, beforeAll, expect, it, afterEach } from "vitest";

const physXWasmModeUrl = new URL("../../../../packages/physics-physx/libs/physx.release.js", import.meta.url).href;
const physXWasmSIMDModeUrl = new URL("../../../../packages/physics-physx/libs/physx.release.simd.js", import.meta.url)
  .href;

class CollisionTestScript extends Script {
  onCollisionEnter(other) {}

  onCollisionStay(other) {
    this.setEntityProperties(this.entity.getComponent(Collider), other.shape.collider);
  }

  onCollisionExit(other) {}

  onTriggerEnter(other: ColliderShape): void {}

  onTriggerStay(other: ColliderShape): void {
    this.setEntityProperties(this.entity.getComponent(Collider), other.collider);
  }

  onTriggerExit(other: ColliderShape): void {}

  setEntityProperties(thisCollider: Collider, other: Collider) {
    if (other instanceof DynamicCollider) {
      const dynamicCollider = other as DynamicCollider;
      if (dynamicCollider.isKinematic) {
        other.move(new Vector3(-10, 0, 0));
      } else {
        dynamicCollider.applyForce(new Vector3(-100, 0, 0));
      }
    } else {
      other.entity.transform.position = new Vector3(-10, 0, 0);
    }

    if (thisCollider instanceof DynamicCollider) {
      const dynamicCollider = thisCollider as DynamicCollider;
      if (dynamicCollider.isKinematic) {
        thisCollider.move(new Vector3(10, 0, 0));
      } else {
        dynamicCollider.applyForce(new Vector3(100, 0, 0));
      }
    } else {
      thisCollider.entity.transform.position = new Vector3(10, 0, 0);
    }
  }
}

class CollisionConsumerScript extends Script {
  onCollisionEnter(): void {}
}

class TriggerConsumerScript extends Script {
  onTriggerEnter(): void {}
}

function updatePhysics(physics) {
  for (let i = 0; i < 5; ++i) {
    physics._update(8);
  }
}

function watchSetContactEventEnabled(physicsScene: PhysicsScene) {
  return vi.spyOn((physicsScene as any)._nativePhysicsScene, "setContactEventEnabled");
}

function resetSpy() {
  // reset spy on collision test script.
  CollisionTestScript.prototype.onCollisionEnter = vi.fn(CollisionTestScript.prototype.onCollisionEnter);
  CollisionTestScript.prototype.onCollisionStay = vi.fn(CollisionTestScript.prototype.onCollisionStay);
  CollisionTestScript.prototype.onCollisionExit = vi.fn(CollisionTestScript.prototype.onCollisionExit);

  CollisionTestScript.prototype.onTriggerEnter = vi.fn(CollisionTestScript.prototype.onTriggerEnter);
  CollisionTestScript.prototype.onTriggerStay = vi.fn(CollisionTestScript.prototype.onTriggerStay);
  CollisionTestScript.prototype.onTriggerExit = vi.fn(CollisionTestScript.prototype.onTriggerExit);
}

/**
 * @param entity entity need to set collider properties.
 * @param isDynamic set entity is dynamic or static.
 * @param isTrigger set collider is trigger or not.
 * @param isKinematic set collider is kinematic or not.
 */
function setColliderProps(entity: Entity, isDynamic: boolean, isTrigger: boolean, isKinematic: boolean) {
  let collider = entity.getComponent(Collider);
  collider?.destroy();
  entity.transform.setPosition(0, 0, 0);
  entity.transform.setRotation(0, 0, 0);
  if (isDynamic) {
    const dynamicCollider = entity.addComponent(DynamicCollider);
    dynamicCollider.isKinematic = isKinematic;
    collider = dynamicCollider;
  } else {
    collider = entity.addComponent(StaticCollider);
  }
  const shape = new BoxColliderShape();
  shape.isTrigger = isTrigger;
  collider.addShape(shape);
}

describe("Physics Test", () => {
  describe("PhysXPhysics", () => {
    let enginePhysX: WebGLEngine;
    let physicsScene: PhysicsScene;

    beforeAll(async () => {
      // Init engine with PhysXPhysics.
      enginePhysX = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: new PhysXPhysics(PhysXRuntimeMode.Auto, {
          wasmModeUrl: physXWasmModeUrl,
          wasmSIMDModeUrl: physXWasmSIMDModeUrl
        })
      });
      physicsScene = enginePhysX.sceneManager.activeScene.physics;

      const rootEntityPhysX = enginePhysX.sceneManager.activeScene.createRootEntity("root_camera");

      const cameraEntityPhysX = rootEntityPhysX.createChild("camera");
      cameraEntityPhysX.transform.position = new Vector3(0, 0, 10);
      cameraEntityPhysX.transform.lookAt(new Vector3(0, 0, 0));
      cameraEntityPhysX.addComponent(Camera);

      enginePhysX.run();
    });

    it("constructor", () => {
      expect(enginePhysX.sceneManager.scenes[0].physics.gravity.y).to.eq(-9.81);
      expect(enginePhysX.sceneManager.scenes[0].physics.fixedTimeStep).to.eq(1 / 60);
    });

    it("gravity", () => {
      enginePhysX.sceneManager.scenes[0].physics.gravity = new Vector3(-10, 100, 0);
      expect(enginePhysX.sceneManager.scenes[0].physics.gravity).to.be.deep.include({ x: -10, y: 100, z: 0 });
    });

    it("fixedTimeStep", () => {
      // Test that set fixedTimeStep works correctly.
      const fixedTimeStep = 1 / 50;
      enginePhysX.sceneManager.scenes[0].physics.fixedTimeStep = fixedTimeStep;
      expect(enginePhysX.sceneManager.scenes[0].physics.fixedTimeStep).to.eq(fixedTimeStep);
    });

    it("enables native contact events for any active collision callback script", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("contact-event-global");
      const setContactEventEnabled = watchSetContactEventEnabled(physicsScene);
      const script = root.createChild("script-only").addComponent(CollisionConsumerScript);

      try {
        expect(setContactEventEnabled).toHaveBeenCalledTimes(1);
        expect(setContactEventEnabled).toHaveBeenLastCalledWith(true);

        script.enabled = false;
        expect(setContactEventEnabled).toHaveBeenCalledTimes(2);
        expect(setContactEventEnabled).toHaveBeenLastCalledWith(false);
      } finally {
        setContactEventEnabled.mockRestore();
        root.destroy();
      }
    });

    it("toggles native contact events only at active collision callback count boundaries", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("contact-event-enabled");
      const setContactEventEnabled = watchSetContactEventEnabled(physicsScene);
      const script1 = root.createChild("script-1").addComponent(CollisionConsumerScript);

      try {
        expect(setContactEventEnabled).toHaveBeenCalledTimes(1);
        expect(setContactEventEnabled).toHaveBeenLastCalledWith(true);

        const script2 = root.createChild("script-2").addComponent(CollisionConsumerScript);
        expect(setContactEventEnabled).toHaveBeenCalledTimes(1);

        script1.enabled = false;
        expect(setContactEventEnabled).toHaveBeenCalledTimes(1);

        script2.enabled = false;
        expect(setContactEventEnabled).toHaveBeenCalledTimes(2);
        expect(setContactEventEnabled).toHaveBeenLastCalledWith(false);
      } finally {
        setContactEventEnabled.mockRestore();
        root.destroy();
      }
    });

    it("stops contact events at the native callback boundary", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("contact-boundary");
      const entity1 = root.createChild("dynamic-1");
      const entity2 = root.createChild("dynamic-2");
      const script = entity1.addComponent(CollisionConsumerScript);
      const bufferContactEvent = vi.spyOn((physicsScene as any)._nativePhysicsScene, "_bufferContactEvent");
      const gravity = physicsScene.gravity.clone();

      try {
        physicsScene.gravity = new Vector3(0, 0, 0);
        setColliderProps(entity1, true, false, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsScene);
        expect(bufferContactEvent).toHaveBeenCalled();

        script.enabled = false;
        const enabledCallCount = bufferContactEvent.mock.calls.length;
        setColliderProps(entity1, true, false, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsScene);
        expect(bufferContactEvent).toHaveBeenCalledTimes(enabledCallCount);

        script.enabled = true;
        setColliderProps(entity1, true, false, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsScene);
        expect(bufferContactEvent.mock.calls.length).toBeGreaterThan(enabledCallCount);
      } finally {
        physicsScene.gravity = gravity;
        bufferContactEvent.mockRestore();
        root.destroy();
      }
    });

    it("does not toggle native contact events during fixed substeps", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const fixedTimeStep = physicsScene.fixedTimeStep;
      const root = scene.createRootEntity("contact-event-substeps");
      const entity = root.createChild("body");
      const collider = entity.addComponent(StaticCollider);
      collider.addShape(new BoxColliderShape());
      const setContactEventEnabled = watchSetContactEventEnabled(physicsScene);
      entity.addComponent(CollisionConsumerScript);

      try {
        expect(setContactEventEnabled).toHaveBeenCalledTimes(1);
        expect(setContactEventEnabled).toHaveBeenLastCalledWith(true);

        physicsScene.fixedTimeStep = 1 / 480;
        physicsScene._update(1 / 60);
        expect(setContactEventEnabled).toHaveBeenCalledTimes(1);
      } finally {
        physicsScene.fixedTimeStep = fixedTimeStep;
        setContactEventEnabled.mockRestore();
        root.destroy();
      }
    });

    it("keeps native contact events disabled without blocking trigger callbacks", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("contact-event-trigger-only");
      const setContactEventEnabled = watchSetContactEventEnabled(physicsScene);
      const triggerEntity = root.createChild("trigger");
      const triggerCollider = triggerEntity.addComponent(DynamicCollider);
      triggerCollider.isKinematic = true;
      const triggerShape = new BoxColliderShape();
      triggerShape.isTrigger = true;
      triggerCollider.addShape(triggerShape);
      root.createChild("static").addComponent(StaticCollider).addShape(new BoxColliderShape());
      const script = triggerEntity.addComponent(TriggerConsumerScript);
      const triggerEnter = vi.spyOn(script, "onTriggerEnter");

      try {
        physicsScene._update(physicsScene.fixedTimeStep);
        expect(setContactEventEnabled).not.toHaveBeenCalled();
        expect(triggerEnter).toHaveBeenCalled();
      } finally {
        triggerEnter.mockRestore();
        setContactEventEnabled.mockRestore();
        root.destroy();
      }
    });

    it("raycast", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const raycastTestRoot = root.createChild("root");

      const collider = raycastTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      collider.addShape(boxShape);
      let ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, 1, 0).normalize());
      expect(physicsScene.raycast(ray)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1, -1).normalize());
      expect(physicsScene.raycast(ray)).to.eq(true);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE)).to.eq(true);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(true);

      // Test that raycast with outHitResult works correctly.
      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1.25, -1).normalize());
      const outHitResult = new HitResult();
      physicsScene.raycast(ray, outHitResult);
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 1, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast with outHitResult works correctly.
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 1, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast nothing if layer is not match.
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Layer1, outHitResult)).to.eq(false);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.null;

      // Test that initial overlap is skipped when ray origin is inside collider.
      // Use a strictly-inside origin (2.9,2.9,2.9) rather than the box corner
      // (3,3,3), which is a boundary point whose hit/miss depends on PhysX edge
      // tolerance and can flake regardless of the initial-overlap-skip behavior.
      boxShape.size = new Vector3(6, 6, 6);
      ray = new Ray(new Vector3(2.9, 2.9, 2.9), new Vector3(0, -1, 0).normalize());
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(false);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.entity).to.be.null;

      // Test that raycast works correctly if shape is not at origin of coordinate.
      boxShape.size = new Vector3(1, 1, 1);
      ray = new Ray(new Vector3(-2, 0, 0.85), new Vector3(1, 0, 0).normalize());
      raycastTestRoot.transform.position = new Vector3(0, 0, 0.85);
      boxShape.position = new Vector3(0, 0, 0.85);
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast works correctly if distance eq 0 or less than 0.
      expect(physicsScene.raycast(ray, 0, Layer.Everything, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, -1, Layer.Everything, outHitResult)).to.eq(false);

      collider.removeShape(boxShape);
      expect(physicsScene.raycast(ray)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      // Test that raycast nothing if collider is disabled.
      collider.enabled = false;
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

      const rootEntityCharacter = root.createChild("root_character");
      rootEntityCharacter.transform.position = new Vector3(0, 0, 0);

      const characterController = rootEntityCharacter.addComponent(CharacterController);
      characterController.collisionLayer = Layer.Layer3;
      const boxShape2 = new BoxColliderShape();
      boxShape2.size.set(1, 1, 1);
      boxShape2.position = new Vector3(0, 0, 0);
      characterController.addShape(boxShape2);

      // Test that raycast character controller.
      ray = new Ray(new Vector3(-2, 0, 0), new Vector3(1, 0, 0).normalize());
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Layer3, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.equal(rootEntityCharacter);

      boxShape2.position = new Vector3(0, 0, 0.85);
      updatePhysics(enginePhysX.sceneManager.scenes[0].physics);

      // Test that raycast works correctly if shape is not at origin of coordinate.
      ray = new Ray(new Vector3(-2, 0, 0.85), new Vector3(1, 0, 0).normalize());
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.equal(rootEntityCharacter);
      // Test that set collider position not effect entity position.
      expect(rootEntityCharacter.transform.position).to.be.deep.include({ x: 0, y: 0, z: 0 });

      // Test that raycast nothing if character controller is disabled.
      characterController.enabled = false;
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

      root.destroy();
    });

    it("raycastAll", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("raycast_all_root");
      const nearEntity = root.createChild("near");
      nearEntity.transform.position = new Vector3(0, 0, 0);
      const nearCollider = nearEntity.addComponent(StaticCollider);
      const nearShape = new BoxColliderShape();
      nearShape.size = new Vector3(1, 1, 1);
      nearCollider.addShape(nearShape);

      const farEntity = root.createChild("far");
      farEntity.transform.position = new Vector3(5, 0, 0);
      const farCollider = farEntity.addComponent(StaticCollider);
      farCollider.collisionLayer = Layer.Layer1;
      const farShape = new BoxColliderShape();
      farShape.size = new Vector3(1, 1, 1);
      farCollider.addShape(farShape);

      const ray = new Ray(new Vector3(-3, 0, 0), new Vector3(1, 0, 0));
      const results = physicsScene.raycastAll(ray);
      expect(results).to.have.length(2);
      expect(results.map((result) => result.shape)).to.have.members([nearShape, farShape]);
      expect(results.map((result) => result.entity)).to.have.members([nearEntity, farEntity]);
      expect(results.every((result) => result.distance > 0)).to.eq(true);

      const nativeScene = (physicsScene as any)._nativePhysicsScene as IPhysicsScene;
      expect(() => (nativeScene.raycastAll as any)(ray, Number.MAX_VALUE, () => true)).to.throw();

      const nativeHitIds: number[] = [];
      nativeScene.raycastAll(
        ray,
        Number.MAX_VALUE,
        () => true,
        (shapeUniqueID) => nativeHitIds.push(shapeUniqueID)
      );
      expect(nativeHitIds).to.have.members([nearShape.id, farShape.id]);

      const limitedResults = physicsScene.raycastAll(ray, 5);
      expect(limitedResults).to.have.length(1);
      expect(limitedResults[0].shape).to.eq(nearShape);
      expect(limitedResults[0].entity).to.eq(nearEntity);

      const filteredResults = physicsScene.raycastAll(ray, Number.MAX_VALUE, Layer.Layer1);
      expect(filteredResults).to.have.length(1);
      expect(filteredResults[0].shape).to.eq(farShape);
      expect(filteredResults[0].entity).to.eq(farEntity);
      expect(physicsScene.raycastAll(ray, 0)).to.have.length(0);

      farShape.isSceneQuery = false;
      const queryFilteredResults = physicsScene.raycastAll(ray);
      expect(queryFilteredResults).to.have.length(1);
      expect(queryFilteredResults[0].shape).to.eq(nearShape);

      root.destroy();
    });

    it("raycastAll returns every hit beyond the native touch chunk", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("raycast_all_many_root");
      const expectedShapes = new Set<ColliderShape>();
      const expectedEntities = new Set<Entity>();
      const hitCount = 257;

      for (let i = 0; i < hitCount; i++) {
        const entity = root.createChild(`hit-${i}`);
        entity.transform.position = new Vector3(i * 2, 0, 0);
        const collider = entity.addComponent(StaticCollider);
        const shape = new BoxColliderShape();
        shape.size = new Vector3(1, 1, 1);
        collider.addShape(shape);
        expectedEntities.add(entity);
        expectedShapes.add(shape);
      }

      const results = physicsScene.raycastAll(new Ray(new Vector3(-1, 0, 0), new Vector3(1, 0, 0)));
      const resultShapes = new Set(results.map((result) => result.shape));
      const resultEntities = new Set(results.map((result) => result.entity));
      expect(results).to.have.length(hitCount);
      expect(resultShapes.size).to.eq(hitCount);
      expect(resultEntities.size).to.eq(hitCount);
      for (const shape of expectedShapes) {
        expect(resultShapes.has(shape)).to.eq(true);
      }
      for (const entity of expectedEntities) {
        expect(resultEntities.has(entity)).to.eq(true);
      }

      root.destroy();
    });

    it("raycast skips initial overlap when ray origin is inside a collider", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");

      // Box at origin, encompassing the ray origin
      const insideBox = root.createChild("inside_box");
      insideBox.transform.position = new Vector3(0, 0, 0);
      const insideCollider = insideBox.addComponent(StaticCollider);
      const insideShape = new BoxColliderShape();
      insideShape.size = new Vector3(2, 2, 2);
      insideCollider.addShape(insideShape);

      // Box further along the ray direction
      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farCollider = farBox.addComponent(StaticCollider);
      const farShape = new BoxColliderShape();
      farShape.size = new Vector3(2, 2, 2);
      farCollider.addShape(farShape);

      // Cast ray from origin (inside `insideBox`) outward
      const hit = new HitResult();
      const ray = new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0));
      const ok = physicsScene.raycast(ray, 100, hit);

      expect(ok).to.eq(true);
      // Should hit the far box, NOT the box at origin (initial overlap is skipped)
      expect(hit.entity).to.eq(farBox);
      expect(hit.distance).to.be.greaterThan(0);

      root.destroy();
    });

    it("boxCast skips initial overlap and hits far collider beyond", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("boxcast_initial_overlap_root");

      const insideBox = root.createChild("inside_box");
      insideBox.transform.position = new Vector3(0, 0, 0);
      const insideCol = insideBox.addComponent(StaticCollider);
      const insideShape = new BoxColliderShape();
      insideShape.size = new Vector3(2, 2, 2);
      insideCol.addShape(insideShape);

      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farCol = farBox.addComponent(StaticCollider);
      const farShape = new BoxColliderShape();
      farShape.size = new Vector3(2, 2, 2);
      farCol.addShape(farShape);

      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const direction = new Vector3(1, 0, 0);
      const hit = new HitResult();
      // Sweep origin (0,0,0) is inside insideBox; should skip and hit farBox
      const ok = physicsScene.boxCast(new Vector3(0, 0, 0), halfExtents, direction, 100, hit);

      expect(ok).to.eq(true);
      expect(hit.entity).to.eq(farBox);
      expect(hit.distance).to.be.greaterThan(0);

      root.destroy();
    });

    it("sphereCast skips initial overlap and hits far collider beyond", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("spherecast_initial_overlap_root");

      const insideBox = root.createChild("inside_box");
      insideBox.transform.position = new Vector3(0, 0, 0);
      const insideCol = insideBox.addComponent(StaticCollider);
      const insideShape = new BoxColliderShape();
      insideShape.size = new Vector3(2, 2, 2);
      insideCol.addShape(insideShape);

      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farCol = farBox.addComponent(StaticCollider);
      const farShape = new BoxColliderShape();
      farShape.size = new Vector3(2, 2, 2);
      farCol.addShape(farShape);

      const direction = new Vector3(1, 0, 0);
      const hit = new HitResult();
      const ok = physicsScene.sphereCast(new Vector3(0, 0, 0), 0.4, direction, 100, hit);

      expect(ok).to.eq(true);
      expect(hit.entity).to.eq(farBox);
      expect(hit.distance).to.be.greaterThan(0);

      root.destroy();
    });

    it("capsuleCast skips initial overlap and hits far collider beyond", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("capsulecast_initial_overlap_root");

      const insideBox = root.createChild("inside_box");
      insideBox.transform.position = new Vector3(0, 0, 0);
      const insideCol = insideBox.addComponent(StaticCollider);
      const insideShape = new BoxColliderShape();
      insideShape.size = new Vector3(2, 2, 2);
      insideCol.addShape(insideShape);

      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farCol = farBox.addComponent(StaticCollider);
      const farShape = new BoxColliderShape();
      farShape.size = new Vector3(2, 2, 2);
      farCol.addShape(farShape);

      const direction = new Vector3(1, 0, 0);
      const hit = new HitResult();
      const ok = physicsScene.capsuleCast(new Vector3(0, 0, 0), 0.3, 0.5, direction, 100, hit);

      expect(ok).to.eq(true);
      expect(hit.entity).to.eq(farBox);
      expect(hit.distance).to.be.greaterThan(0);

      root.destroy();
    });

    it("raycast nested inside another raycast's onRaycast keeps stack ordering", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("nested_raycast_root");
      // Native PhysX scene exposes the (ray, distance, onRaycast, hit) signature
      // that takes a per-call filter; the persistent-callback stack pattern is
      // verified through this layer.
      const nativeScene = (scene.physics as any)._nativePhysicsScene;

      const boxA = root.createChild("box_a");
      boxA.transform.position = new Vector3(2, 0, 0);
      const colA = boxA.addComponent(StaticCollider);
      const shapeA = new BoxColliderShape();
      shapeA.size = new Vector3(1, 1, 1);
      colA.addShape(shapeA);

      const boxB = root.createChild("box_b");
      boxB.transform.position = new Vector3(0, 2, 0);
      const colB = boxB.addComponent(StaticCollider);
      const shapeB = new BoxColliderShape();
      shapeB.size = new Vector3(1, 1, 1);
      colB.addShape(shapeB);

      const seenInOuter: number[] = [];
      const seenInInner: number[] = [];

      const outerRay = new Ray(new Vector3(-5, 0, 0), new Vector3(1, 0, 0));
      nativeScene.raycast(outerRay, 100, (uuid: number) => {
        seenInOuter.push(uuid);
        // Nested raycast inside the outer's filter callback. If the stack got
        // mixed up, the inner ray's preFilter would dispatch to the outer
        // recorder (or vice versa).
        const innerRay = new Ray(new Vector3(0, -5, 0), new Vector3(0, 1, 0));
        nativeScene.raycast(innerRay, 100, (innerUuid: number) => {
          seenInInner.push(innerUuid);
          return true;
        });
        return true;
      });

      // The outer ray (along +X from -5,0,0) cannot intersect boxB at (0,2,0),
      // so its preFilter must never see shapeB. Conversely, the inner ray
      // (along +Y from 0,-5,0) cannot intersect boxA at (2,0,0), so its
      // preFilter must never see shapeA. Stack mixing would violate either.
      expect(seenInOuter).to.not.include(shapeB.id);
      expect(seenInInner).to.not.include(shapeA.id);
      // Both filters must have run — otherwise the assertions above are vacuous.
      expect(seenInOuter.length).to.be.greaterThan(0);
      expect(seenInInner.length).to.be.greaterThan(0);

      root.destroy();
    });

    it("sweep nested inside raycast's onRaycast uses independent filter stacks", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("nested_mixed_root");
      const nativeScene = (scene.physics as any)._nativePhysicsScene;

      const boxA = root.createChild("box_a");
      boxA.transform.position = new Vector3(3, 0, 0);
      const colA = boxA.addComponent(StaticCollider);
      const shapeA = new BoxColliderShape();
      shapeA.size = new Vector3(1, 1, 1);
      colA.addShape(shapeA);

      let outerCalls = 0;
      let innerSweepCalls = 0;
      const innerSweepUuids: number[] = [];

      const outerRay = new Ray(new Vector3(-5, 0, 0), new Vector3(1, 0, 0));
      const outerHitFn = (uuid: number, distance: number, _p: Vector3, _n: Vector3) => {
        // The outer raycast must successfully report a hit on shapeA's UUID.
        expect(uuid).to.eq(shapeA.id);
        expect(distance).to.be.greaterThan(0);
      };
      const result = nativeScene.raycast(
        outerRay,
        100,
        (uuid: number) => {
          outerCalls++;
          // Nested boxCast (sweep) inside the raycast filter — uses a different
          // persistent callback / stack on the PhysX side. The two stacks must
          // not interfere.
          const sweepCenter = new Vector3(3, 0, 0);
          const halfExtents = new Vector3(0.5, 0.5, 0.5);
          const direction = new Vector3(0, 1, 0);
          const orientation = new Quaternion(0, 0, 0, 1);
          nativeScene.boxCast(sweepCenter, orientation, halfExtents, direction, 100, (sweepUuid: number) => {
            innerSweepCalls++;
            innerSweepUuids.push(sweepUuid);
            return false; // skip everything in inner sweep
          });
          return uuid === shapeA.id;
        },
        outerHitFn
      );

      // Outer raycast must succeed despite the nested sweep with its own filter.
      expect(result).to.eq(true);
      expect(outerCalls).to.be.greaterThan(0);
      // Nested sweep had to actually run at least once for this test to be meaningful.
      expect(innerSweepCalls).to.be.greaterThan(0);

      root.destroy();
    });

    it("raycast callback throwing leaves the filter stack clean for subsequent calls", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("throw_recovery_root");
      const nativeScene = (scene.physics as any)._nativePhysicsScene;

      const box = root.createChild("box");
      box.transform.position = new Vector3(2, 0, 0);
      const col = box.addComponent(StaticCollider);
      const shape = new BoxColliderShape();
      shape.size = new Vector3(1, 1, 1);
      col.addShape(shape);

      const ray = new Ray(new Vector3(-5, 0, 0), new Vector3(1, 0, 0));

      expect(() => {
        nativeScene.raycast(ray, 100, () => {
          throw new Error("intentional in test");
        });
      }).to.throw("intentional in test");

      // Stack must be clean — subsequent raycast must work and the shared
      // persistent callback must dispatch to the new filter, not a stale one.
      let secondCalled = false;
      let observedUuid = -1;
      const ok = nativeScene.raycast(
        ray,
        100,
        (uuid: number) => {
          secondCalled = true;
          observedUuid = uuid;
          return true;
        },
        (_uuid: number, _distance: number, _p: Vector3, _n: Vector3) => {}
      );

      expect(secondCalled).to.eq(true);
      expect(ok).to.eq(true);
      expect(observedUuid).to.eq(shape.id);

      root.destroy();
    });

    it("boxCast", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = sweepTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      // Test boxCast with no hit
      const center = new Vector3(3, 3, 3);
      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const direction = new Vector3(0, 1, 0);
      const orientation = new Quaternion();
      expect(physicsScene.boxCast(center, halfExtents, direction, orientation)).to.eq(false);

      // Test boxCast with hit
      direction.set(-1, -1, -1);
      direction.normalize();
      const outHitResult = new HitResult();
      expect(
        physicsScene.boxCast(
          center,
          halfExtents,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.shape).to.be.eq(boxShape);

      // Test boxCast with layer mask
      expect(
        physicsScene.boxCast(center, halfExtents, direction, orientation, Number.MAX_VALUE, Layer.Layer1, outHitResult)
      ).to.eq(false);

      // Test boxCast with distance limit
      expect(
        physicsScene.boxCast(center, halfExtents, direction, orientation, 0.1, Layer.Everything, outHitResult)
      ).to.eq(false);

      // Test that initial overlap is skipped when sweep starts inside a collider.
      center.set(0, 0, 0);
      expect(
        physicsScene.boxCast(
          center,
          halfExtents,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(false);

      // Test boxCast with rotation
      Quaternion.rotationEuler(0, Math.PI / 4, 0, orientation);
      center.set(2, 0, 0);
      direction.set(-1, 0, 0);
      expect(
        physicsScene.boxCast(
          center,
          halfExtents,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(true);

      // Test boxCast with multiple colliders
      const collider2 = sweepTestRoot.addComponent(StaticCollider);
      const boxShape2 = new BoxColliderShape();
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.position = new Vector3(1, 0, 0);
      collider2.addShape(boxShape2);
      center.set(3, 0, 0);
      direction.set(-1, 0, 0);
      expect(
        physicsScene.boxCast(
          center,
          halfExtents,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(0.79, 0.1);

      // Test boxCast with parallel direction
      center.set(0, 2, 0);
      direction.set(0, 1, 0);
      expect(
        physicsScene.boxCast(
          center,
          halfExtents,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(false);

      root.destroy();
    });

    it("boxCast - New Overloads", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = sweepTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      const center = new Vector3(3, 3, 3);
      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const direction = new Vector3(-1, -1, -1).normalize();
      const outHitResult = new HitResult();

      // Test boxCast(center, halfExtents, direction, outHitResult) - direct HitResult
      expect(physicsScene.boxCast(center, halfExtents, direction, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.shape).to.be.eq(boxShape);

      // Test boxCast(center, halfExtents, direction, distance) - distance only
      expect(physicsScene.boxCast(center, halfExtents, direction, 0.1)).to.eq(false);
      expect(physicsScene.boxCast(center, halfExtents, direction, Number.MAX_VALUE)).to.eq(true);

      // Test boxCast(center, halfExtents, direction, distance, outHitResult) - distance + result
      outHitResult.distance = 0;
      expect(physicsScene.boxCast(center, halfExtents, direction, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.distance).to.be.greaterThan(0);

      // Test distance limit with result
      expect(physicsScene.boxCast(center, halfExtents, direction, 0.1, outHitResult)).to.eq(false);

      root.destroy();
    });

    it("sphereCast", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = sweepTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      // Test sphereCast with no hit
      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const direction = new Vector3(0, 1, 0);
      expect(physicsScene.sphereCast(center, radius, direction)).to.eq(false);

      // Test sphereCast with hit
      direction.set(-1, -1, -1);
      direction.normalize();
      const outHitResult = new HitResult();
      expect(
        physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Everything, outHitResult)
      ).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.shape).to.be.eq(boxShape);

      // Test sphereCast with layer mask
      expect(physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Layer1, outHitResult)).to.eq(
        false
      );

      // Test sphereCast with distance limit
      expect(physicsScene.sphereCast(center, radius, direction, 0.1, Layer.Everything, outHitResult)).to.eq(false);

      // Test that initial overlap is skipped when sphere starts inside a collider.
      center.set(0, 0, 0);
      expect(
        physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Everything, outHitResult)
      ).to.eq(false);

      // Test sphereCast with multiple colliders
      const collider2 = sweepTestRoot.addComponent(StaticCollider);
      const boxShape2 = new BoxColliderShape();
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.position = new Vector3(1, 0, 0);
      collider2.addShape(boxShape2);
      center.set(3, 0, 0);
      direction.set(-1, 0, 0);
      expect(
        physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Everything, outHitResult)
      ).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(1.0, 0.1);

      // Test sphereCast with parallel direction
      center.set(0, 2, 0);
      direction.set(0, 1, 0);
      expect(
        physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Everything, outHitResult)
      ).to.eq(false);

      root.destroy();
    });

    it("sphereCast - New Overloads", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = sweepTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const direction = new Vector3(-1, -1, -1).normalize();
      const outHitResult = new HitResult();

      // Test sphereCast(center, radius, direction, outHitResult) - direct HitResult
      expect(physicsScene.sphereCast(center, radius, direction, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.shape).to.be.eq(boxShape);

      // Test sphereCast(center, radius, direction, distance) - distance only
      expect(physicsScene.sphereCast(center, radius, direction, 0.1)).to.eq(false);
      expect(physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE)).to.eq(true);

      // Test sphereCast(center, radius, direction, distance, outHitResult) - distance + result
      outHitResult.distance = 0;
      expect(physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.distance).to.be.greaterThan(0);

      // Test distance limit with result
      expect(physicsScene.sphereCast(center, radius, direction, 0.1, outHitResult)).to.eq(false);

      root.destroy();
    });

    it("capsuleCast", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = sweepTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      // Test capsuleCast with no hit
      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const height = 1.0;
      const direction = new Vector3(0, 1, 0);
      const orientation = new Quaternion();
      expect(
        physicsScene.capsuleCast(center, radius, height, direction, orientation, Number.MAX_VALUE, Layer.Everything)
      ).to.eq(false);

      // Test capsuleCast with hit
      direction.set(-1, -1, -1);
      direction.normalize();
      const outHitResult = new HitResult();
      expect(
        physicsScene.capsuleCast(
          center,
          radius,
          height,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(3.717, 0.1);

      // Test capsuleCast with layer mask
      expect(
        physicsScene.capsuleCast(
          center,
          radius,
          height,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Layer1,
          outHitResult
        )
      ).to.eq(false);

      // Test capsuleCast with distance limit
      expect(
        physicsScene.capsuleCast(center, radius, height, direction, orientation, 0.1, Layer.Everything, outHitResult)
      ).to.eq(false);

      // Test that initial overlap is skipped when capsule starts inside a collider.
      center.set(0, 0, 0);
      expect(
        physicsScene.capsuleCast(
          center,
          radius,
          height,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(false);

      // Test capsuleCast with rotation
      Quaternion.rotationEuler(0, Math.PI / 4, 0, orientation);
      center.set(2, 0, 0);
      direction.set(-1, 0, 0);
      expect(
        physicsScene.capsuleCast(
          center,
          radius,
          height,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(true);

      // Test capsuleCast with multiple colliders
      orientation.set(0, 0, 0, 1);
      const collider2 = sweepTestRoot.addComponent(StaticCollider);
      const boxShape2 = new BoxColliderShape();
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.position = new Vector3(1, 0, 0);
      collider2.addShape(boxShape2);
      center.set(3, 0, 0);
      direction.set(-1, 0, 0);
      expect(
        physicsScene.capsuleCast(
          center,
          radius,
          height,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0.5);
      expect(outHitResult.shape.id).to.be.eq(boxShape2.id);

      // Test capsuleCast with parallel direction
      center.set(0, 2, 0);
      direction.set(0, 1, 0);
      expect(
        physicsScene.capsuleCast(
          center,
          radius,
          height,
          direction,
          orientation,
          Number.MAX_VALUE,
          Layer.Everything,
          outHitResult
        )
      ).to.eq(false);

      root.destroy();
    });

    it("capsuleCast - New Overloads", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = sweepTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const height = 1.0;
      const direction = new Vector3(-1, -1, -1).normalize();
      const outHitResult = new HitResult();

      // Test capsuleCast(center, radius, height, direction, outHitResult) - direct HitResult
      expect(physicsScene.capsuleCast(center, radius, height, direction, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.shape).to.be.eq(boxShape);

      // Test capsuleCast(center, radius, height, direction, distance) - distance only
      expect(physicsScene.capsuleCast(center, radius, height, direction, 0.1)).to.eq(false);
      expect(physicsScene.capsuleCast(center, radius, height, direction, Number.MAX_VALUE)).to.eq(true);

      // Test capsuleCast(center, radius, height, direction, distance, outHitResult) - distance + result
      outHitResult.distance = 0;
      expect(physicsScene.capsuleCast(center, radius, height, direction, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.distance).to.be.greaterThan(0);

      // Test distance limit with result
      expect(physicsScene.capsuleCast(center, radius, height, direction, 0.1, outHitResult)).to.eq(false);

      root.destroy();
    });

    it("overlapBoxAll", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const overlapTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = overlapTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      // Test overlapBox with no overlap
      const center = new Vector3(3, 3, 3);
      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const orientation = new Quaternion();
      expect(physicsScene.overlapBoxAll(center, halfExtents, orientation)).to.have.length(0);

      // Test overlapBox with overlap
      center.set(0.5, 0.5, 0.5);
      const shapes1 = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything);
      expect(shapes1).to.have.length(1);
      expect(shapes1[0]).to.be.eq(boxShape);

      // Test overlapBox with layer mask
      const shapesMask = enginePhysX.sceneManager.scenes[0].physics.overlapBoxAll(
        center,
        halfExtents,
        orientation,
        Layer.Layer1
      );
      expect(shapesMask).to.have.length(0);

      // Test overlapBox when box contains collider
      center.set(0, 0, 0);
      halfExtents.set(2, 2, 2);
      const shapesContain = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything);
      expect(shapesContain).to.have.length(1);
      expect(shapesContain[0]).to.eq(boxShape);

      // Test overlapBox with rotation
      Quaternion.rotationEuler(0, Math.PI / 4, 0, orientation);
      center.set(0.5, 0, 0);
      const shapesRot = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything);
      expect(shapesRot).to.include(boxShape);

      // Test overlapBox with multiple colliders
      const collider2 = overlapTestRoot.addComponent(StaticCollider);
      const boxShape2 = new BoxColliderShape();
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.position = new Vector3(1, 0, 0);
      collider2.addShape(boxShape2);
      center.set(0.5, 0, 0);
      const shapesMulti = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything);
      expect(shapesMulti).to.have.length(2);
      expect(shapesMulti).to.include.members([boxShape, boxShape2]);

      // Test overlapBox with edge contact
      center.set(0.5, 0.5, 0.5);
      halfExtents.set(0.5, 0.5, 0.5);
      const shapesEdge = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything);
      expect(shapesEdge).to.have.length(2);
      expect(shapesEdge).to.include.members([boxShape, boxShape2]);

      // Test overlapBox with custom array parameter
      const customArray: ColliderShape[] = [];
      const shapesCustom = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything, customArray);
      expect(shapesCustom).to.be.eq(customArray);
      expect(shapesCustom).to.have.length(2);
      expect(shapesCustom).to.include.members([boxShape, boxShape2]);

      root.destroy();
    });

    it("overlapSphereAll", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("root");
      const overlapTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = overlapTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      // Test overlapSphere with no overlap
      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      expect(enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(center, radius)).to.have.length(0);

      // Test overlapSphere with overlap
      center.set(0.5, 0.5, 0.5);
      const s1 = enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(center, radius, Layer.Everything);
      expect(s1).to.have.length(1);
      expect(s1[0]).to.eq(boxShape);

      // Test overlapSphere with layer mask
      expect(enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(center, radius, Layer.Layer1)).to.have.length(
        0
      );

      // Test overlapSphere when sphere contains collider
      center.set(0, 0, 0);
      let sphereRadius = 2;
      const sContain = enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(
        center,
        sphereRadius,
        Layer.Everything
      );
      expect(sContain).to.have.length(1);
      expect(sContain[0]).to.eq(boxShape);

      // Test overlapSphere with multiple colliders
      const collider2 = overlapTestRoot.addComponent(StaticCollider);
      const boxShape2 = new BoxColliderShape();
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.position = new Vector3(1, 0, 0);
      collider2.addShape(boxShape2);
      center.set(0.5, 0, 0);
      const sMulti = enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(
        center,
        sphereRadius,
        Layer.Everything
      );
      expect(sMulti).to.have.length(2);
      expect(sMulti).to.include.members([boxShape, boxShape2]);

      // Test overlapSphere with edge contact
      center.set(0.5, 0.5, 0.5);
      sphereRadius = 0.5;
      const sEdge = enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(center, sphereRadius, Layer.Everything);
      expect(sEdge).to.have.length(2);
      expect(sEdge).to.include.members([boxShape, boxShape2]);

      // Test overlapSphere with custom array parameter
      const customSphereArray: ColliderShape[] = [];
      const sCustom = enginePhysX.sceneManager.scenes[0].physics.overlapSphereAll(
        center,
        sphereRadius,
        Layer.Everything,
        customSphereArray
      );
      expect(sCustom).to.be.eq(customSphereArray);
      expect(sCustom).to.have.length(2);
      expect(sCustom).to.include.members([boxShape, boxShape2]);

      root.destroy();
    });

    it("overlapCapsuleAll", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("root");
      const overlapTestRoot = root.createChild("root");

      // Create a box collider to test against
      const collider = overlapTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      boxShape.size = new Vector3(1, 1, 1);
      collider.addShape(boxShape);

      // Test overlapCapsule with no overlap
      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const height = 1.0;
      const orientation = new Quaternion();
      expect(
        enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(center, radius, height, orientation)
      ).to.have.length(0);

      // Test overlapCapsule with overlap
      center.set(0.5, 0.5, 0.5);
      const c1 = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        radius,
        height,
        orientation,
        Layer.Everything
      );
      expect(c1).to.have.length(1);
      expect(c1[0]).to.eq(boxShape);

      // Test overlapCapsule with layer mask
      expect(
        enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(center, radius, height, orientation, Layer.Layer1)
      ).to.have.length(0);

      // Test overlapCapsule when capsule contains collider
      center.set(0, 0, 0);
      let capsuleRadius = 2;
      let capsuleHeight = 4;
      const cContain = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        capsuleRadius,
        capsuleHeight,
        orientation,
        Layer.Everything
      );
      expect(cContain).to.have.length(1);
      expect(cContain[0]).to.eq(boxShape);

      // Test overlapCapsule with rotation
      Quaternion.rotationEuler(0, Math.PI / 4, 0, orientation);
      center.set(2, 0, 0);
      const direction = new Vector3(-1, 0, 0);
      const cRot = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        capsuleRadius,
        capsuleHeight,
        orientation,
        Layer.Everything
      );
      expect(cRot).to.include(boxShape);

      // Test overlapCapsule with multiple colliders
      const collider2 = overlapTestRoot.addComponent(StaticCollider);
      const boxShape2 = new BoxColliderShape();
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.position = new Vector3(1, 0, 0);
      collider2.addShape(boxShape2);
      center.set(0.5, 0, 0);
      const cMulti = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        capsuleRadius,
        capsuleHeight,
        orientation,
        Layer.Everything
      );
      expect(cMulti).to.have.length(2);
      expect(cMulti).to.include.members([boxShape, boxShape2]);

      // Test overlapCapsule with edge contact
      center.set(0.5, 0.5, 0.5);
      capsuleRadius = 0.5;
      capsuleHeight = 1;
      const cEdge = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        capsuleRadius,
        capsuleHeight,
        orientation,
        Layer.Everything
      );
      expect(cEdge).to.have.length(2);
      expect(cEdge).to.include.members([boxShape, boxShape2]);

      // Test overlapCapsule with custom array parameter
      const customCapsuleArray: ColliderShape[] = [];
      const cCustom = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        capsuleRadius,
        capsuleHeight,
        orientation,
        Layer.Everything,
        customCapsuleArray
      );
      expect(cCustom).to.be.eq(customCapsuleArray);
      expect(cCustom).to.have.length(2);
      expect(cCustom).to.include.members([boxShape, boxShape2]);

      root.destroy();
    });

    describe("Collision Group Tests", () => {
      it("should set and get collision group settings correctly", () => {
        physicsScene.setColliderLayerCollision(Layer.Layer0, Layer.Layer1, true);
        expect(physicsScene.getColliderLayerCollision(Layer.Layer0, Layer.Layer1)).to.eq(true);
        physicsScene.setColliderLayerCollision(Layer.Layer0, Layer.Layer2, false);
        expect(physicsScene.getColliderLayerCollision(Layer.Layer0, Layer.Layer2)).to.eq(false);
        physicsScene.setColliderLayerCollision(Layer.Layer1, Layer.Layer2, true);
        expect(physicsScene.getColliderLayerCollision(Layer.Layer1, Layer.Layer2)).to.eq(true);
      });

      it("should handle edge cases in collision group matrix", () => {
        const maxGroup = Layer.Layer31;

        physicsScene.setColliderLayerCollision(maxGroup, Layer.Layer0, false);
        expect(physicsScene.getColliderLayerCollision(maxGroup, Layer.Layer0)).to.eq(false);
        physicsScene.setColliderLayerCollision(maxGroup, Layer.Layer0, true);
        expect(physicsScene.getColliderLayerCollision(maxGroup, Layer.Layer0)).to.eq(true);
      });

      it("should handle invalid collision groups correctly", () => {
        const invalidGroup = -1;
        // @ts-ignore
        expect(() => physicsScene.setColliderLayerCollision(invalidGroup, Layer.Layer0, false)).to.throw();
        // @ts-ignore
        expect(() => physicsScene.setColliderLayerCollision(invalidGroup, Layer.Layer0, true)).to.throw();
      });
    });

    describe("Collision Test", () => {
      it("Dynamic Trigger vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, both A,B are dynamic and trigger.
        resetSpy();
        setColliderProps(entity1, true, true, false);
        setColliderProps(entity2, true, true, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Dynamic vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision not works, both A,B are dynamic.
        resetSpy();
        setColliderProps(entity1, true, false, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Static Trigger vs Static Trigger", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, both A,B are static and trigger.
        resetSpy();
        setColliderProps(entity1, false, true, false);
        setColliderProps(entity2, false, true, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Static vs Static", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision not works, both A,B are static.
        resetSpy();
        setColliderProps(entity1, false, false, false);
        setColliderProps(entity2, false, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Static vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and B is dynamic.
        resetSpy();
        setColliderProps(entity1, false, false, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Static Trigger vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and B is dynamic, both A,B are trigger.
        resetSpy();
        setColliderProps(entity1, false, true, false);
        setColliderProps(entity2, true, true, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Static Trigger vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and trigger, B is dynamic.
        resetSpy();
        setColliderProps(entity1, false, true, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).toHaveBeenCalled();
      });

      it("Static vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static, B is dynamic and trigger.
        resetSpy();
        setColliderProps(entity1, false, false, false);
        setColliderProps(entity2, true, true, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).toHaveBeenCalled();
      });

      it("Dynamic Trigger vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is dynamic and trigger, B is dynamic.
        resetSpy();
        setColliderProps(entity1, true, true, false);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).toHaveBeenCalled();
      });

      it("Static Trigger vs Static", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and trigger, B is static.
        resetSpy();
        setColliderProps(entity1, false, true, false);
        setColliderProps(entity2, false, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Dynamic Kinematic vs Static", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is dynamic and kinematic, B is static.
        resetSpy();
        setColliderProps(entity1, true, false, true);
        setColliderProps(entity2, false, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Dynamic Kinematic vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is dynamic, and kinematic, B is dynamic.
        resetSpy();
        setColliderProps(entity1, true, false, true);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Dynamic Trigger Kinematic vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, both A,B are dynamic, trigger, kinematic.
        resetSpy();
        setColliderProps(entity1, true, true, true);
        setColliderProps(entity2, true, true, true);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Static Trigger vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and trigger, B is dynamic and kinematic.
        resetSpy();
        setColliderProps(entity1, false, true, false);
        setColliderProps(entity2, true, false, true);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).toHaveBeenCalled();
      });

      it("Dynamic Trigger vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is dynamic and trigger, B is dynamic and kinematic.
        resetSpy();
        setColliderProps(entity1, true, true, false);
        setColliderProps(entity2, true, false, true);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).toHaveBeenCalled();
      });

      it("Dynamic Trigger Kinematic vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, both A,B are dynamic, kinematic.
        resetSpy();
        setColliderProps(entity1, true, false, true);
        setColliderProps(entity2, true, false, true);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Dynamic Trigger Kinematic vs Static Trigger", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is dynamic, trigger and kinematic, B is static and trigger.
        resetSpy();
        setColliderProps(entity1, true, true, true);
        setColliderProps(entity2, false, true, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });

      it("Dynamic Trigger Kinematic vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is dynamic, trigger and kinematic, B is dynamic and trigger.
        resetSpy();
        setColliderProps(entity1, true, true, true);
        setColliderProps(entity2, true, true, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onCollisionExit).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerEnter).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerStay).not.toHaveBeenCalled();
        expect(collisionTestScript.onTriggerExit).not.toHaveBeenCalled();
      });
    });

    it("destroy with characterController", () => {
      const newScene = new Scene(enginePhysX);
      enginePhysX.sceneManager.addScene(newScene);
      const root = newScene.createRootEntity("root");
      const characterController = root.addComponent(CharacterController);
      characterController.addShape(new BoxColliderShape());
      newScene.destroy();
      expect(characterController.shapes.length).eq(0);
      expect(characterController.destroyed).eq(true);
      expect(newScene.destroyed).eq(true);
    });

    it("create and destroy physics objects in onCollisionEnter should work correctly", () => {
      const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");

      // Zero gravity so objects don't fall
      physicsMgr.gravity = new Vector3(0, 0, 0);

      // Create two dynamic boxes at distance, will be pushed together
      const entityA = root.createChild("boxA");
      entityA.transform.setPosition(-3, 0, 0);
      const colliderA = entityA.addComponent(DynamicCollider);
      colliderA.addShape(new BoxColliderShape());

      const entityB = root.createChild("boxB");
      entityB.transform.setPosition(0, 0, 0);
      const colliderB = entityB.addComponent(DynamicCollider);
      colliderB.addShape(new BoxColliderShape());

      let newEntity: Entity = null;
      const onCollisionEnter = vi.fn(() => {
        // Create a new physics object at the collision point (like 2048 game merge)
        newEntity = root.createChild("newBox");
        newEntity.transform.setPosition(0, 5, 0);
        const newCollider = newEntity.addComponent(DynamicCollider);
        newCollider.addShape(new BoxColliderShape());

        // Destroy the colliding objects
        entityA.destroy();
        entityB.destroy();
      });

      entityA.addComponent(
        class extends Script {
          onCollisionEnter(): void {
            if (!entityA.pendingDestroy) {
              onCollisionEnter();
            }
          }
        }
      );

      // Push A toward B
      colliderA.applyForce(new Vector3(1000, 0, 0));

      // Simulate inside engine frame
      // @ts-ignore
      enginePhysX._frameInProcess = true;
      // @ts-ignore
      expect(() => physicsMgr._update(1)).not.toThrow();
      // @ts-ignore
      enginePhysX._frameInProcess = false;

      expect(onCollisionEnter).toHaveBeenCalled();
      expect(newEntity).not.toBeNull();
      expect(entityA.pendingDestroy).eq(true);
      expect(entityB.pendingDestroy).eq(true);
    });

    it("new entity created in onCollisionEnter should preserve correct position", () => {
      const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");

      physicsMgr.gravity = new Vector3(0, 0, 0);

      const entityA = root.createChild("boxA");
      entityA.transform.setPosition(-3, 0, 0);
      const colliderA = entityA.addComponent(DynamicCollider);
      colliderA.addShape(new BoxColliderShape());

      const entityB = root.createChild("boxB");
      entityB.transform.setPosition(0, 0, 0);
      const colliderB = entityB.addComponent(DynamicCollider);
      colliderB.addShape(new BoxColliderShape());

      const targetPos = new Vector3(0, 5, 0);
      let newEntity: Entity = null;

      entityA.addComponent(
        class extends Script {
          onCollisionEnter(): void {
            if (!entityA.pendingDestroy) {
              newEntity = root.createChild("newBox");
              newEntity.transform.position = targetPos.clone();
              const newCollider = newEntity.addComponent(DynamicCollider);
              newCollider.addShape(new BoxColliderShape());
              entityA.destroy();
              entityB.destroy();
            }
          }
        }
      );

      colliderA.applyForce(new Vector3(1000, 0, 0));

      // @ts-ignore
      enginePhysX._frameInProcess = true;
      // @ts-ignore
      physicsMgr._update(1);
      // @ts-ignore
      enginePhysX._frameInProcess = false;

      // The key assertion: new entity's position should NOT be overwritten
      // by _callColliderOnLateUpdate (the bug that was fixed)
      expect(newEntity).not.toBeNull();
      const pos = newEntity.transform.position;
      expect(pos.x).closeTo(targetPos.x, 0.01);
      expect(pos.y).closeTo(targetPos.y, 0.01);
      expect(pos.z).closeTo(targetPos.z, 0.01);
    });

    it("destroy entity in onCollisionEnter should not crash", () => {
      const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");

      physicsMgr.gravity = new Vector3(0, 0, 0);

      const entityA = root.createChild("boxA");
      entityA.transform.setPosition(-3, 0, 0);
      const colliderA = entityA.addComponent(DynamicCollider);
      colliderA.addShape(new BoxColliderShape());

      const entityB = root.createChild("boxB");
      entityB.transform.setPosition(0, 0, 0);
      const colliderB = entityB.addComponent(DynamicCollider);
      colliderB.addShape(new BoxColliderShape());

      const onCollisionEnter = vi.fn(() => {
        entityA.destroy();
        entityB.destroy();
      });

      entityA.addComponent(
        class extends Script {
          onCollisionEnter(): void {
            if (!entityA.pendingDestroy) {
              onCollisionEnter();
            }
          }
        }
      );

      colliderA.applyForce(new Vector3(1000, 0, 0));

      // @ts-ignore
      enginePhysX._frameInProcess = true;
      // @ts-ignore
      expect(() => physicsMgr._update(1)).not.toThrow();
      // @ts-ignore
      enginePhysX._frameInProcess = false;

      expect(onCollisionEnter).toHaveBeenCalled();
      expect(entityA.pendingDestroy).eq(true);
      expect(entityB.pendingDestroy).eq(true);
    });

    // @see https://github.com/galacean/engine/issues/2877
    it("destroy entity in onTriggerEnter should not crash", () => {
      const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
      const entity1 = root.createChild("triggerA");
      const entity2 = root.createChild("triggerB");

      // Both at origin to guarantee overlap
      setColliderProps(entity1, false, true, false);
      setColliderProps(entity2, true, false, false);

      const onTriggerEnter = vi.fn((other: ColliderShape) => {
        entity2.destroy();
      });
      const onTriggerEnterB = vi.fn();

      entity1.addComponent(
        class extends Script {
          onTriggerEnter(other: ColliderShape): void {
            onTriggerEnter(other);
          }
        }
      );
      entity2.addComponent(
        class extends Script {
          onTriggerEnter(other: ColliderShape): void {
            onTriggerEnterB(other);
          }
        }
      );

      // Simulate being inside Engine.update() where _frameInProcess = true
      // @ts-ignore
      enginePhysX._frameInProcess = true;
      expect(() => updatePhysics(physicsMgr)).not.toThrow();
      // @ts-ignore
      enginePhysX._frameInProcess = false;

      expect(onTriggerEnter).toHaveBeenCalled();
      expect(entity2.pendingDestroy).eq(true);
      expect(entity2.destroyed).eq(false);
    });

    afterEach(() => {
      const root = enginePhysX.sceneManager.activeScene.findEntityByName("root");
      root?.destroy();
    });
  });
});
