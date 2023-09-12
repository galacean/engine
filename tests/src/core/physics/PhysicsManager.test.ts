import {
  Camera,
  BoxColliderShape,
  Layer,
  StaticCollider,
  DynamicCollider,
  HitResult,
  CharacterController,
  CapsuleColliderShape,
  SphereColliderShape,
  Script,
  ColliderShape,
  Entity,
  Collider
} from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import chai, { expect } from "chai";
import spies from "chai-spies";

chai.use(spies);

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
  CollisionTestScript.prototype.onCollisionEnter = chai.spy(CollisionTestScript.prototype.onCollisionEnter);
  CollisionTestScript.prototype.onCollisionStay = chai.spy(CollisionTestScript.prototype.onCollisionStay);
  CollisionTestScript.prototype.onCollisionExit = chai.spy(CollisionTestScript.prototype.onCollisionExit);

  CollisionTestScript.prototype.onTriggerEnter = chai.spy(CollisionTestScript.prototype.onTriggerEnter);
  CollisionTestScript.prototype.onTriggerStay = chai.spy(CollisionTestScript.prototype.onTriggerStay);
  CollisionTestScript.prototype.onTriggerExit = chai.spy(CollisionTestScript.prototype.onTriggerExit);
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

    before(async () => {
      // Init engine with LitePhysics.
      engineLite = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: new LitePhysics()
      });

      const rootEntityLitePhysics = engineLite.sceneManager.activeScene.createRootEntity("root_camera");

      const cameraEntityLitePhysics = rootEntityLitePhysics.createChild("camera");
      cameraEntityLitePhysics.transform.position = new Vector3(0, 0, 10);
      cameraEntityLitePhysics.transform.lookAt(new Vector3(0, 0, 0));
      cameraEntityLitePhysics.addComponent(Camera);

      engineLite.run();
    });

    it("constructor", () => {
      expect(engineLite.physicsManager.gravity.y).to.eq(-9.81);
      expect(engineLite.physicsManager.fixedTimeStep).to.eq(1 / 60);
    });

    it("gravity", () => {
      // Test that set gravity works correctly.
      engineLite.physicsManager.gravity = new Vector3(-10, 100, 0);
      expect(engineLite.physicsManager.gravity).to.be.deep.include({ x: -10, y: 100, z: 0 });
    });

    it("fixedTimeStep", () => {
      // Test that set fixedTimeStep works correctly.
      engineLite.physicsManager.fixedTimeStep = 0;
      expect(engineLite.physicsManager.fixedTimeStep).to.gt(0);

      engineLite.physicsManager.fixedTimeStep = Number.MIN_SAFE_INTEGER;
      expect(engineLite.physicsManager.fixedTimeStep).to.gt(0);

      const fixedTimeStep = 1 / 50;
      engineLite.physicsManager.fixedTimeStep = fixedTimeStep;
      expect(engineLite.physicsManager.fixedTimeStep).to.eq(fixedTimeStep);
    });

    it("raycast", () => {
      const scene = engineLite.sceneManager.activeScene;
      const root = scene.createRootEntity("root");
      const raycastTestRoot = root.createChild("root");

      const collider = raycastTestRoot.addComponent(StaticCollider);
      const box = new BoxColliderShape();
      collider.addShape(box);

      let ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, 1, 0));
      expect(engineLite.physicsManager.raycast(ray)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1, -1));
      expect(engineLite.physicsManager.raycast(ray)).to.eq(true);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(true);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(true);

      // Test that raycast with outHitResult works correctly.
      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1.25, -1));
      const outHitResult = new HitResult();
      engineLite.physicsManager.raycast(ray, outHitResult);
      expect(engineLite.physicsManager.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast with outHitResult works correctly.
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast nothing if layer is not match.
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Layer1, outHitResult)).to.eq(false);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.null;

      // Test that return origin point if origin is inside collider.
      ray = new Ray(new Vector3(0.25, -0.5, 0.5), new Vector3(0, -1, 0));
      expect(engineLite.physicsManager.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 0.25, y: -0.5, z: 0.5 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast nothing if distance is less than distance of origin to detected collider.
      expect(engineLite.physicsManager.raycast(ray, 0, Layer.Everything, outHitResult)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, -1, Layer.Everything, outHitResult)).to.eq(false);

      collider.removeShape(box);
      expect(engineLite.physicsManager.raycast(ray)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      // Test that raycast nothing if collider is disabled.
      collider.enabled = false;
      expect(engineLite.physicsManager.raycast(ray, outHitResult)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(engineLite.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

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

      updatePhysics(engineLite.physicsManager);
      expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
      expect(collisionTestScript.onTriggerStay).to.have.been.called.exactly(1);
      expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
    });

    afterEach(() => {
      const root = engineLite.sceneManager.activeScene.findEntityByName("root");
      root?.destroy();
    });
  });

  describe("PhysXPhysics", () => {
    let enginePhysX: WebGLEngine;

    before(async () => {
      // Init engine with PhysXPhysics.
      enginePhysX = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: new PhysXPhysics()
      });
      const rootEntityPhysX = enginePhysX.sceneManager.activeScene.createRootEntity("root_camera");

      const cameraEntityPhysX = rootEntityPhysX.createChild("camera");
      cameraEntityPhysX.transform.position = new Vector3(0, 0, 10);
      cameraEntityPhysX.transform.lookAt(new Vector3(0, 0, 0));
      cameraEntityPhysX.addComponent(Camera);

      enginePhysX.run();
    });

    it("constructor", () => {
      expect(enginePhysX.physicsManager.gravity.y).to.eq(-9.81);
      expect(enginePhysX.physicsManager.fixedTimeStep).to.eq(1 / 60);
    });

    it("gravity", () => {
      enginePhysX.physicsManager.gravity = new Vector3(-10, 100, 0);
      expect(enginePhysX.physicsManager.gravity).to.be.deep.include({ x: -10, y: 100, z: 0 });
    });

    it("fixedTimeStep", () => {
      // Test that set fixedTimeStep works correctly.
      const fixedTimeStep = 1 / 50;
      enginePhysX.physicsManager.fixedTimeStep = fixedTimeStep;
      expect(enginePhysX.physicsManager.fixedTimeStep).to.eq(fixedTimeStep);
    });

    it("raycast", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("root");
      const raycastTestRoot = root.createChild("root");

      const collider = raycastTestRoot.addComponent(StaticCollider);
      const boxShape = new BoxColliderShape();
      collider.addShape(boxShape);
      let ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, 1, 0).normalize());
      expect(enginePhysX.physicsManager.raycast(ray)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1, -1).normalize());
      expect(enginePhysX.physicsManager.raycast(ray)).to.eq(true);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(true);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(true);

      // Test that raycast with outHitResult works correctly.
      ray = new Ray(new Vector3(3, 3, 3), new Vector3(-1, -1.25, -1).normalize());
      const outHitResult = new HitResult();
      enginePhysX.physicsManager.raycast(ray, outHitResult);
      expect(enginePhysX.physicsManager.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 1, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast with outHitResult works correctly.
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.718, 0.01);
      expect(outHitResult.point.x).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.point.y).to.be.closeTo(-0.124, 0.01);
      expect(outHitResult.point.z).to.be.closeTo(0.5, 0.01);
      expect(outHitResult.normal).to.be.deep.include({ x: 1, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast nothing if layer is not match.
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Layer1, outHitResult)).to.eq(false);
      expect(outHitResult.distance).to.be.eq(0);
      expect(outHitResult.point).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.normal).to.be.deep.include({ x: 0, y: 0, z: 0 });
      expect(outHitResult.entity).to.be.null;

      // Test that return origin point if origin is inside collider.
      boxShape.size = new Vector3(6, 6, 6);
      ray = new Ray(new Vector3(3, 3, 3), new Vector3(0, -1, 0).normalize());
      expect(enginePhysX.physicsManager.raycast(ray, outHitResult)).to.eq(true);
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
      expect(enginePhysX.physicsManager.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast works correctly if distance eq 0 or less than 0.
      expect(enginePhysX.physicsManager.raycast(ray, 0, Layer.Everything, outHitResult)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, -1, Layer.Everything, outHitResult)).to.eq(false);

      collider.removeShape(boxShape);
      expect(enginePhysX.physicsManager.raycast(ray)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything)).to.eq(false);

      // Test that raycast nothing if collider is disabled.
      collider.enabled = false;
      expect(enginePhysX.physicsManager.raycast(ray, outHitResult)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

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
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Layer3, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.equal(rootEntityCharacter);

      // Test that raycast works correctly if shape is not at origin of coordinate.
      ray = new Ray(new Vector3(-2, 0, 0.85), new Vector3(1, 0, 0).normalize());
      rootEntityCharacter.transform.position = new Vector3(0, 0, 0.85);
      boxShape2.position = new Vector3(0, 0, 0.85);
      expect(enginePhysX.physicsManager.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.equal(rootEntityCharacter);

      // Test that raycast nothing if character controller is disabled.
      characterController.enabled = false;
      expect(enginePhysX.physicsManager.raycast(ray, outHitResult)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(enginePhysX.physicsManager.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

      root.destroy();
    });

    describe("Collision Test", () => {
      it("Dynamic Trigger vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Dynamic vs Dynamic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.called.at.least(1);
        expect(collisionTestScript.onCollisionStay).to.have.been.called.at.least(1);
        expect(collisionTestScript.onCollisionExit).to.have.been.called.at.least(1);
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Static Trigger vs Static Trigger", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Static vs Static", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Static vs Dynamic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onCollisionStay).to.have.been.called.exactly(1);
        expect(collisionTestScript.onCollisionExit).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Static Trigger vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Static Trigger vs Dynamic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Static vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Dynamic Trigger vs Dynamic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.gt(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Static Trigger vs Static", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Dynamic Kinematic vs Static", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Dynamic Kinematic vs Dynamic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onCollisionStay).to.have.been.called.gt(1);
        expect(collisionTestScript.onCollisionExit).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Dynamic Trigger Kinematic vs Dynamic", () => {
        const physicsMgr = enginePhysX.physicsManager;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);
        collisionTestScript.useLite = false;

        // Test that collision works correctly, A is dynamic, trigger and kinematic, B is dynamic.
        resetSpy();
        setColliderProps(entity1, true, true, true);
        setColliderProps(entity2, true, false, false);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.gt(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Dynamic Kinematic vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Dynamic Trigger Kinematic vs Dynamic Trigger Kinematic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Static Trigger vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Dynamic Trigger vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.gt(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Dynamic Trigger Kinematic vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.physicsManager;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);
        collisionTestScript.useLite = false;

        // Test that collision works correctly, A is dynamic, trigger and kinematic, B is dynamic and kinematic.
        resetSpy();
        setColliderProps(entity1, true, true, true);
        setColliderProps(entity2, true, false, true);
        updatePhysics(physicsMgr);

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.called.exactly(1);
        expect(collisionTestScript.onTriggerStay).to.have.been.called.gt(1);
        expect(collisionTestScript.onTriggerExit).to.have.been.called.exactly(1);
      });

      it("Dynamic Trigger Kinematic vs Static Trigger", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });

      it("Dynamic Trigger Kinematic vs Dynamic Trigger", () => {
        const physicsMgr = enginePhysX.physicsManager;

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

        expect(collisionTestScript.onCollisionEnter).to.have.been.not.called();
        expect(collisionTestScript.onCollisionStay).to.have.been.not.called();
        expect(collisionTestScript.onCollisionExit).to.have.been.not.called();
        expect(collisionTestScript.onTriggerEnter).to.have.been.not.called();
        expect(collisionTestScript.onTriggerStay).to.have.been.not.called();
        expect(collisionTestScript.onTriggerExit).to.have.been.not.called();
      });
    });

    afterEach(() => {
      const root = enginePhysX.sceneManager.activeScene.findEntityByName("root");
      root?.destroy();
    });
  });
});
