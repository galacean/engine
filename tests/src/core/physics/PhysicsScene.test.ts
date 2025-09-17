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
import { LitePhysics } from "@galacean/engine-physics-lite";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { vi, describe, beforeAll, expect, it, afterEach } from "vitest";

class CollisionTestScript extends Script {
  useLite: boolean = true;

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
    if (!this.useLite) {
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
    } else {
      if (other instanceof StaticCollider) {
        other.entity.transform.position = new Vector3(-10, 0, 0);
      }
      if (thisCollider instanceof StaticCollider) {
        thisCollider.entity.transform.position = new Vector3(10, 0, 0);
      }
    }
  }
}

function updatePhysics(physics) {
  for (let i = 0; i < 5; ++i) {
    physics._update(8);
  }
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
  describe("LitePhysics", () => {
    let engineLite: WebGLEngine;
    let physics: LitePhysics;
    let physicsScene: PhysicsScene;
    beforeAll(async () => {
      physics = new LitePhysics();
      // Init engine with LitePhysics.
      engineLite = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics
      });
      physicsScene = engineLite.sceneManager.activeScene.physics;

      const rootEntityLitePhysics = engineLite.sceneManager.activeScene.createRootEntity("root_camera");

      const cameraEntityLitePhysics = rootEntityLitePhysics.createChild("camera");
      cameraEntityLitePhysics.transform.position = new Vector3(0, 0, 10);
      cameraEntityLitePhysics.transform.lookAt(new Vector3(0, 0, 0));
      cameraEntityLitePhysics.addComponent(Camera);

      engineLite.run();
    });

    it("removeShape", () => {
      const scene = engineLite.sceneManager.activeScene;
      const root = scene.createRootEntity("root");
      const removeShapeRoot1 = root.createChild("root");
      removeShapeRoot1.transform.position = new Vector3(1000, 1000, 1000);

      const enterEvent = [];
      const collider1 = removeShapeRoot1.addComponent(StaticCollider);
      const box1 = new BoxColliderShape();
      enterEvent[box1.id] = [];
      collider1.addShape(box1);
      removeShapeRoot1.addComponent(
        class extends Script {
          onTriggerEnter(other: ColliderShape): void {
            ++enterEvent[box1.id][other.id];
          }
        }
      );
      const removeShapeRoot2 = root.createChild("root");
      removeShapeRoot2.transform.position = new Vector3(1000, 1000, 1000);
      const collider2 = removeShapeRoot2.addComponent(StaticCollider);
      const box2 = new BoxColliderShape();
      enterEvent[box2.id] = [];
      collider2.addShape(box2);
      removeShapeRoot2.addComponent(
        class extends Script {
          onTriggerEnter(other: ColliderShape) {
            ++enterEvent[box2.id][other.id];
          }
        }
      );
      // @ts-ignore
      engineLite.sceneManager.scenes[0].physics._update(8);
      // Remove collider shape.
      removeShapeRoot2.isActive = false;
      const removeShapeRoot3 = root.createChild("root");
      removeShapeRoot3.transform.position = new Vector3(1000, 1000, 1000);
      const collider3 = removeShapeRoot3.addComponent(DynamicCollider);
      const box3 = new BoxColliderShape();
      enterEvent[box3.id] = [];
      collider3.addShape(box3);
      removeShapeRoot3.addComponent(
        class extends Script {
          onTriggerEnter(other: ColliderShape) {
            ++enterEvent[box3.id][other.id];
          }
        }
      );
      removeShapeRoot2.isActive = true;
      enterEvent[box1.id][box2.id] = 0;
      enterEvent[box1.id][box3.id] = 0;
      enterEvent[box2.id][box1.id] = 0;
      enterEvent[box2.id][box3.id] = 0;
      enterEvent[box3.id][box1.id] = 0;
      enterEvent[box3.id][box2.id] = 0;
      // @ts-ignore
      engineLite.sceneManager.scenes[0].physics._update(8);
      expect(enterEvent[box1.id][box2.id]).to.eq(0);
      expect(enterEvent[box1.id][box3.id]).to.eq(1);
      expect(enterEvent[box2.id][box1.id]).to.eq(0);
      expect(enterEvent[box2.id][box3.id]).to.eq(1);
      expect(enterEvent[box3.id][box1.id]).to.eq(1);
      expect(enterEvent[box3.id][box2.id]).to.eq(1);

      removeShapeRoot1.destroy();
      removeShapeRoot2.destroy();
      removeShapeRoot3.destroy();
    });

    it("constructor", () => {
      expect(engineLite.sceneManager.scenes[0].physics.gravity.y).to.eq(-9.81);
      expect(engineLite.sceneManager.scenes[0].physics.fixedTimeStep).to.eq(1 / 60);
    });

    it("gravity", () => {
      // Test that set gravity works correctly.
      engineLite.sceneManager.scenes[0].physics.gravity = new Vector3(-10, 100, 0);
      expect(engineLite.sceneManager.scenes[0].physics.gravity).to.be.deep.include({ x: -10, y: 100, z: 0 });
    });

    it("fixedTimeStep", () => {
      // Test that set fixedTimeStep works correctly.
      engineLite.sceneManager.scenes[0].physics.fixedTimeStep = 0;
      expect(engineLite.sceneManager.scenes[0].physics.fixedTimeStep).to.gt(0);

      engineLite.sceneManager.scenes[0].physics.fixedTimeStep = Number.MIN_SAFE_INTEGER;
      expect(engineLite.sceneManager.scenes[0].physics.fixedTimeStep).to.gt(0);

      const fixedTimeStep = 1 / 50;
      engineLite.sceneManager.scenes[0].physics.fixedTimeStep = fixedTimeStep;
      expect(engineLite.sceneManager.scenes[0].physics.fixedTimeStep).to.eq(fixedTimeStep);
    });

    it("raycast", () => {
      const scene = engineLite.sceneManager.scenes[0];
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const raycastTestRoot = root.createChild("root");

      const collider = raycastTestRoot.addComponent(StaticCollider);
      const box = new BoxColliderShape();
      collider.addShape(box);

      let ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, 1, 0));
      expect(physicsScene.raycast(ray)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1, -1));
      expect(physicsScene.raycast(ray)).to.eq(true);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE)).to.eq(true);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(true);

      // Test that raycast the nearest collider.
      const collider2 = raycastTestRoot.addComponent(DynamicCollider);
      const outHitResult = new HitResult();
      const box2 = new BoxColliderShape();
      box2.position = new Vector3(0, 0.5, 0);
      collider2.addShape(box2);

      ray = new Ray(new Vector3(0, 3, 0), new Vector3(0, -1, 0));
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.shape.id).to.eq(box2.id);

      ray = new Ray(new Vector3(0, -3, 0), new Vector3(0, 1, 0));
      box.position = new Vector3(1, 0, 0);

      // Test that raycast nothing if distance is less than distance of origin to detected collider.
      expect(physicsScene.raycast(ray, -3, outHitResult)).to.eq(false);

      box.position = new Vector3(0, 0, 0);
      collider2.destroy();
      // Test that raycast with outHitResult works correctly.
      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1.25, -1));
      physicsScene.raycast(ray, outHitResult);
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);
      expect(outHitResult.shape).to.be.eq(box);

      // Test that raycast with outHitResult works correctly.
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);
      expect(outHitResult.shape).to.be.eq(box);

      // Test that raycast nothing if layer is not match.
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Layer1, outHitResult)).to.eq(false);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.null;
      expect(outHitResult.shape).to.be.null;

      // Test that return origin point if origin is inside collider.
      ray = new Ray(new Vector3(0.25, -0.5, 0.5), new Vector3(0, -1, 0));
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 0.25, y: -0.5, z: 0.5 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);
      expect(outHitResult.shape).to.be.eq(box);

      // Test that raycast nothing if distance is less than distance of origin to detected collider.
      expect(physicsScene.raycast(ray, 0, Layer.Everything, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, -1, Layer.Everything, outHitResult)).to.eq(false);

      collider.removeShape(box);
      expect(physicsScene.raycast(ray)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      // Test that raycast nothing if collider is disabled.
      collider.enabled = false;
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

      root.destroy();
    });

    it("Collision Test", () => {
      const root = engineLite.sceneManager.activeScene.createRootEntity("root");
      const collisionTestRoot = root.createChild("root_collisionTest");
      const boxEntity = collisionTestRoot.createChild("BoxPhysicsModel");
      const boxCollider = boxEntity.addComponent(DynamicCollider);
      const boxShape = new BoxColliderShape();
      boxCollider.addShape(boxShape);

      const sphereEntity = collisionTestRoot.createChild("CapsulePhysicsModel");
      const sphereCollider = sphereEntity.addComponent(StaticCollider);
      const sphereShape = new SphereColliderShape();
      sphereCollider.addShape(sphereShape);
      const collisionTestScript = sphereEntity.addComponent(CollisionTestScript);
      collisionTestScript.useLite = true;

      resetSpy();

      updatePhysics(engineLite.sceneManager.scenes[0].physics);
      expect(collisionTestScript.onTriggerEnter).toHaveBeenCalledTimes(1);
      expect(collisionTestScript.onTriggerStay).toHaveBeenCalledTimes(1);
      expect(collisionTestScript.onTriggerExit).toHaveBeenCalledTimes(1);
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

    afterEach(() => {
      const root = engineLite.sceneManager.activeScene.findEntityByName("root");
      root?.destroy();
    });
  });

  describe("PhysXPhysics", () => {
    let enginePhysX: WebGLEngine;
    let physicsScene: PhysicsScene;

    beforeAll(async () => {
      // Init engine with PhysXPhysics.
      enginePhysX = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: new PhysXPhysics()
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

      // Test that return origin point if origin is inside collider.
      boxShape.size = new Vector3(6, 6, 6);
      ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, -1, 0).normalize());
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 3, y: 3, z: 3 });
      expect(outHitResult.normal.x).to.be.eq(0);
      expect(outHitResult.normal.y).to.be.eq(1);
      expect(outHitResult.normal.z).to.be.eq(0);
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

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
      rootEntityCharacter.layer = Layer.Layer3;
      rootEntityCharacter.transform.position = new Vector3(0, 0, 0);

      const characterController = rootEntityCharacter.addComponent(CharacterController);
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

      // Test boxCast when box is inside collider
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
      ).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0);

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

      // Test sphereCast when sphere is inside collider
      center.set(0, 0, 0);
      expect(
        physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Everything, outHitResult)
      ).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0);

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

      // Test capsuleCast when capsule is inside collider
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
      ).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0);

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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
        collisionTestScript.useLite = false;

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

    afterEach(() => {
      const root = enginePhysX.sceneManager.activeScene.findEntityByName("root");
      root?.destroy();
    });
  });
});
