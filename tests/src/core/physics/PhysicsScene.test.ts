import { createPhysics } from "../../utils/physics";
import {
  BoxCollider,
  CapsuleCollider,
  CharacterController,
  Collider,
  Collision,
  Rigidbody,
  Entity,
  HitResult,
  Layer,
  PhysicsScene,
  Scene,
  Script,
  SphereCollider
} from "@galacean/engine-core";
import { Ray, Vector3, Quaternion } from "@galacean/engine-math";
import { PhysicsEventState, type IPhysicsEvents, type IPhysicsScene } from "@galacean/engine-design";
import { WebGLEngine } from "@galacean/engine";
import { vi, describe, beforeAll, beforeEach, afterAll, expect, it, afterEach } from "vitest";

class CollisionTestScript extends Script {
  onCollisionEnter(other: Collision): void {}

  onCollisionStay(other: Collision): void {
    this.setEntityProperties(other.selfCollider, other.collider);
  }

  onCollisionExit(other: Collision): void {}

  onTriggerEnter(other: Collider, self: Collider): void {}

  onTriggerStay(other: Collider, self: Collider): void {
    this.setEntityProperties(self, other);
  }

  onTriggerExit(other: Collider, self: Collider): void {}

  setEntityProperties(self: Collider, other: Collider): void {
    for (const [collider, x] of [
      [other, -10],
      [self, 10]
    ] as const) {
      const body = collider.attachedRigidbody;
      if (body?.isKinematic) {
        body.move(new Vector3(x, 0, 0));
      } else if (body) {
        body.applyForce(new Vector3(x * 10, 0, 0));
      } else {
        collider.entity.transform.position = new Vector3(x, 0, 0);
      }
    }
  }
}

class CollisionConsumerScript extends Script {
  onCollisionEnter(): void {}
}

class TriggerConsumerScript extends Script {
  onTriggerEnter(): void {}
}

function updatePhysics(physics: PhysicsScene): void {
  physics._update(2);
}

// Run deterministic physics time inside a real engine frame, including its deferred destruction phase.
function updateEnginePhysics(engine: WebGLEngine): void {
  const scene = engine.sceneManager.activeScene;
  const stepEntity = scene.createRootEntity("physics-step");
  stepEntity.addComponent(
    class extends Script {
      onUpdate(): void {
        scene.physics._update(1);
      }
    }
  );
  try {
    engine.update();
  } finally {
    stepEntity.destroy();
  }
}

function watchSetContactEventEnabled(physicsScene: PhysicsScene) {
  return vi.spyOn(physicsScene._nativePhysicsScene, "setContactEventEnabled");
}

function watchCollisionCallbacks(script: CollisionTestScript): void {
  vi.spyOn(script, "onCollisionEnter");
  vi.spyOn(script, "onCollisionStay");
  vi.spyOn(script, "onCollisionExit");
  vi.spyOn(script, "onTriggerEnter");
  vi.spyOn(script, "onTriggerStay");
  vi.spyOn(script, "onTriggerExit");
}

function setColliderProps(entity: Entity, isDynamic: boolean, isTrigger: boolean, isKinematic: boolean): void {
  entity.getComponent(Collider)?.destroy();
  entity.getComponent(Rigidbody)?.destroy();
  entity.transform.setPosition(0, 0, 0);
  entity.transform.setRotation(0, 0, 0);
  if (isDynamic) {
    entity.addComponent(Rigidbody).isKinematic = isKinematic;
  }
  entity.addComponent(BoxCollider).isTrigger = isTrigger;
}

describe("Physics Test", () => {
  describe("PhysXPhysics", () => {
    let enginePhysX: WebGLEngine;
    let physicsScene: PhysicsScene;
    let physicsBackend: ReturnType<typeof createPhysics>;

    beforeAll(async () => {
      physicsBackend = createPhysics();
      enginePhysX = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: physicsBackend
      });
      physicsScene = enginePhysX.sceneManager.activeScene.physics;
    });

    beforeEach(() => {
      physicsScene.gravity = new Vector3(0, -9.81, 0);
      physicsScene.fixedTimeStep = 1 / 60;
    });

    afterAll(() => enginePhysX.destroy());

    it("constructor", () => {
      expect(enginePhysX.sceneManager.scenes[0].physics.gravity.y).to.eq(-9.81);
      expect(enginePhysX.sceneManager.scenes[0].physics.fixedTimeStep).to.eq(1 / 60);
    });

    it("gravity", () => {
      enginePhysX.sceneManager.scenes[0].physics.gravity = new Vector3(-10, 100, 0);
      expect(enginePhysX.sceneManager.scenes[0].physics.gravity).to.be.deep.include({ x: -10, y: 100, z: 0 });
    });

    it("ignores native gravity updates when physics is uninitialized or destroyed", async () => {
      const noPhysicsEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
      const noPhysics = noPhysicsEngine.sceneManager.activeScene.physics;
      expect(() => {
        noPhysics.gravity = new Vector3(1, -2, 3);
        noPhysics.gravity.set(4, -5, 6);
      }).not.toThrow();
      expect(noPhysics.gravity).to.be.deep.include({ x: 4, y: -5, z: 6 });
      noPhysicsEngine.destroy();

      const destroyedScene = new Scene(enginePhysX, "destroyed-gravity");
      enginePhysX.sceneManager.addScene(destroyedScene);
      const destroyedPhysics = destroyedScene.physics;
      destroyedScene.destroy();
      expect(() => {
        destroyedPhysics.gravity = new Vector3(0, -1, 0);
        destroyedPhysics.gravity.set(1, 2, 3);
      }).not.toThrow();
    });

    it("fixedTimeStep", () => {
      // Test that set fixedTimeStep works correctly.
      const fixedTimeStep = 1 / 50;
      enginePhysX.sceneManager.scenes[0].physics.fixedTimeStep = fixedTimeStep;
      expect(enginePhysX.sceneManager.scenes[0].physics.fixedTimeStep).to.eq(fixedTimeStep);
    });

    it("keeps nested rigidbody poses independent after reparenting, disabling a body, and changing scenes", () => {
      const root = enginePhysX.sceneManager.activeScene.createRootEntity();
      const destination = new Scene(enginePhysX);
      enginePhysX.sceneManager.addScene(destination);
      try {
        const removable = root.createChild();
        removable.transform.setPosition(-10, 0, 0);
        removable.addComponent(BoxCollider);
        const removableBody = removable.addComponent(Rigidbody);
        removableBody.useGravity = false;
        const branch = root.createChild();
        const child = branch.createChild();
        child.transform.setPosition(10, 0, 0);
        child.addComponent(BoxCollider);
        child.addComponent(Rigidbody).useGravity = false;
        const parent = root.createChild();
        parent.addComponent(BoxCollider);
        const parentBody = parent.addComponent(Rigidbody);
        parentBody.useGravity = false;
        parentBody.linearVelocity.set(6, 0, 0);
        physicsScene._update(physicsScene.fixedTimeStep);

        branch.parent = parent;
        const childX = child.transform.worldPosition.x;
        physicsScene._update(physicsScene.fixedTimeStep);
        expect(parent.transform.worldPosition.x).toBeCloseTo(0.2, 4);
        expect(child.transform.worldPosition.x).toBeCloseTo(childX, 4);

        removableBody.enabled = false;
        physicsScene._update(physicsScene.fixedTimeStep);
        expect(parent.transform.worldPosition.x).toBeCloseTo(0.3, 4);
        expect(child.transform.worldPosition.x).toBeCloseTo(childX, 4);

        destination.addRootEntity(root);
        destination.physics._update(destination.physics.fixedTimeStep);
        expect(parent.transform.worldPosition.x).toBeCloseTo(0.4, 4);
        expect(child.transform.worldPosition.x).toBeCloseTo(childX, 4);
      } finally {
        root.destroy();
        destination.destroy();
      }
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
      entity.addComponent(BoxCollider);
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
      const triggerCollider = triggerEntity.addComponent(Rigidbody);
      triggerCollider.isKinematic = true;
      const triggerShape = triggerEntity.addComponent(BoxCollider);
      triggerShape.isTrigger = true;
      root.createChild("static").addComponent(BoxCollider);
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

      const boxShape = raycastTestRoot.addComponent(BoxCollider);
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

      // Use an origin strictly inside the box to avoid a boundary hit.
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
      ray = new Ray(new Vector3(-2, 0, 1.7), new Vector3(1, 0, 0).normalize());
      raycastTestRoot.transform.position = new Vector3(0, 0, 0.85);
      boxShape.center = new Vector3(0, 0, 0.85);
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(raycastTestRoot);

      // Test that raycast works correctly if distance eq 0 or less than 0.
      expect(physicsScene.raycast(ray, 0, Layer.Everything, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, -1, Layer.Everything, outHitResult)).to.eq(false);

      boxShape.enabled = false;
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

      const rootEntityCharacter = root.createChild("root_character");
      rootEntityCharacter.transform.position = new Vector3(0, 0, 0);

      const characterController = rootEntityCharacter.addComponent(CharacterController);
      characterController.collisionLayer = Layer.Layer3;

      // Test that raycast character controller.
      ray = new Ray(new Vector3(-2, 0, 0), new Vector3(1, 0, 0).normalize());
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Layer3, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.equal(rootEntityCharacter);

      characterController.center = new Vector3(0, 0, 0.85);
      updatePhysics(enginePhysX.sceneManager.scenes[0].physics);

      // Test that raycast works correctly if shape is not at origin of coordinate.
      ray = new Ray(new Vector3(-2, 0, 0.85), new Vector3(1, 0, 0).normalize());
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.equal(rootEntityCharacter);
      // A controller center offset does not move its Entity.
      expect(rootEntityCharacter.transform.position).to.be.deep.include({ x: 0, y: 0, z: 0 });

      // Test that raycast nothing if character controller is disabled.
      characterController.enabled = false;
      expect(physicsScene.raycast(ray, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, outHitResult)).to.eq(false);
      expect(physicsScene.raycast(ray, Number.MAX_VALUE, Layer.Everything, outHitResult)).to.eq(false);

      root.destroy();
    });

    it("non-unit direction", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      root.createChild("box").addComponent(BoxCollider);
      updatePhysics(physicsScene);

      // The box spans z in [-0.5, 0.5], so its front face is 4.5 away from z = 5.
      const origin = new Vector3(0, 0, 5);
      const shortDir = new Vector3(0, 0, -0.1);
      const longDir = new Vector3(0, 0, -10);
      const outHitResult = new HitResult();

      // distance is a length in world units, whatever the length of the direction.
      expect(physicsScene.raycast(new Ray(origin, shortDir), 6, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.5, 1e-4);
      expect(physicsScene.raycast(new Ray(origin, longDir), 6, outHitResult)).to.eq(true);
      expect(outHitResult.distance).to.be.closeTo(4.5, 1e-4);
      expect(physicsScene.raycast(new Ray(origin, longDir), 4)).to.eq(false);

      const halfExtents = new Vector3(0.1, 0.1, 0.1);
      expect(physicsScene.boxCast(origin, halfExtents, shortDir, 6)).to.eq(true);
      expect(physicsScene.boxCast(origin, halfExtents, longDir, 4)).to.eq(false);
      expect(physicsScene.sphereCast(origin, 0.1, shortDir, 6)).to.eq(true);
      expect(physicsScene.sphereCast(origin, 0.1, longDir, 4)).to.eq(false);
      expect(physicsScene.capsuleCast(origin, 0.1, 0.7, shortDir, 6)).to.eq(true);
      expect(physicsScene.capsuleCast(origin, 0.1, 0.7, longDir, 4)).to.eq(false);

      // The caller's vectors are left untouched.
      expect(shortDir.z).to.eq(-0.1);
      expect(longDir.z).to.eq(-10);

      root.destroy();
    });

    it("degenerate direction", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      root.createChild("box").addComponent(BoxCollider);
      updatePhysics(physicsScene);

      // The box spans z in [-0.5, 0.5], so its front face is 4.5 away from z = 5.
      const origin = new Vector3(0, 0, 5);
      const inside = new Vector3(0, 0, 0);
      const zeroDir = new Vector3(0, 0, 0);
      const tinyDir = new Vector3(0, 0, -1e-8);
      const outHitResult = new HitResult();

      // A unit direction still hits the front face and fills the hit result.
      expect(physicsScene.raycast(new Ray(origin, new Vector3(0, 0, -1)), 6, outHitResult)).to.eq(true);
      expect(outHitResult.collider).to.not.eq(null);

      // `Vector3.normalize` leaves directions no longer than `MathUtil.zeroTolerance` untouched, so
      // those have no unit form: the queries report a miss and clear the caller's hit result instead
      // of casting a scaled distance or letting the backends answer with an initial overlap hit.
      expect(physicsScene.raycast(new Ray(inside, zeroDir), 6, outHitResult)).to.eq(false);
      expect(outHitResult.collider).to.eq(null);
      expect(physicsScene.raycast(new Ray(inside, tinyDir), 6)).to.eq(false);

      const halfExtents = new Vector3(0.1, 0.1, 0.1);
      expect(physicsScene.boxCast(inside, halfExtents, tinyDir, 6)).to.eq(false);
      expect(physicsScene.sphereCast(inside, 0.1, tinyDir, 6)).to.eq(false);
      expect(physicsScene.capsuleCast(inside, 0.1, 0.7, tinyDir, 6)).to.eq(false);

      root.destroy();
    });

    it("raycastAll", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("raycast_all_root");
      const nearEntity = root.createChild("near");
      nearEntity.transform.position = new Vector3(0, 0, 0);
      const nearShape = nearEntity.addComponent(BoxCollider);
      nearShape.size = new Vector3(1, 1, 1);

      const farEntity = root.createChild("far");
      farEntity.transform.position = new Vector3(5, 0, 0);
      const farShape = farEntity.addComponent(BoxCollider);
      farShape.collisionLayer = Layer.Layer1;
      farShape.size = new Vector3(1, 1, 1);

      const ray = new Ray(new Vector3(-3, 0, 0), new Vector3(1, 0, 0));
      const results = [new HitResult(), new HitResult()];
      const initialHits = results.slice();
      expect(physicsScene.raycastAll(ray, results)).to.eq(true);
      expect(results[0]).to.eq(initialHits[0]);
      expect(results[1]).to.eq(initialHits[1]);
      expect(results).to.have.length(2);
      expect(results.map((result) => result.collider)).to.have.members([nearShape, farShape]);
      expect(results.map((result) => result.entity)).to.have.members([nearEntity, farEntity]);
      expect(results.every((result) => result.distance > 0)).to.eq(true);

      const nativeScene = (physicsScene as any)._nativePhysicsScene as IPhysicsScene;
      const nativeHitIds: number[] = [];
      nativeScene.raycastAll(ray.origin, ray.direction, Number.MAX_VALUE, Layer.Everything, (shapeUniqueID) =>
        nativeHitIds.push(shapeUniqueID)
      );
      expect(nativeHitIds).to.have.length(2);
      expect(new Set(nativeHitIds).size).to.eq(2);

      const previousHits = results.slice();
      const previousDistances = previousHits.map((hit) => hit.distance);
      const shiftedRay = new Ray(new Vector3(-4, 0, 0), ray.direction);
      const separateResults: HitResult[] = [];
      expect(physicsScene.raycastAll(shiftedRay, separateResults)).to.eq(true);
      expect(previousHits.map((hit) => hit.distance)).to.deep.equal(previousDistances);
      expect(separateResults.some((hit) => previousHits.includes(hit))).to.eq(false);
      expect(physicsScene.raycastAll(shiftedRay, Number.MAX_VALUE, Layer.Everything, results)).to.eq(true);
      expect(results[0]).to.eq(previousHits[0]);
      expect(results[1]).to.eq(previousHits[1]);
      expect(results.map((hit) => hit.distance)).to.have.members(previousDistances.map((distance) => distance + 1));
      expect(physicsScene.raycastAll(ray, 0, Layer.Everything, results)).to.eq(false);
      expect(results).to.have.length(0);
      expect(previousHits.every((hit) => hit.collider === null && hit.entity === null)).to.eq(true);
      expect(physicsScene.raycastAll(ray, results)).to.eq(true);
      expect(new Set(results).size).to.eq(2);

      const spareHit = results[1];
      expect(physicsScene.raycastAll(ray, 5, results)).to.eq(true);
      expect(results).to.have.length(1);
      expect(spareHit.collider).to.eq(null);
      expect(spareHit.entity).to.eq(null);
      expect(physicsScene.raycastAll(ray, results)).to.eq(true);
      expect(results[1]).to.eq(spareHit);

      results.length = 0;
      expect(physicsScene.raycastAll(ray, 100, Layer.Nothing, results)).to.eq(false);
      expect(physicsScene.raycastAll(ray, results)).to.eq(true);
      expect(results.some((hit) => previousHits.includes(hit))).to.eq(false);

      const sparseResults = new Array<HitResult>(4);
      expect(physicsScene.raycastAll(ray, sparseResults)).to.eq(true);
      expect(sparseResults).to.have.length(2);
      const sparseHits = sparseResults.slice();
      expect(physicsScene.raycastAll(new Ray(ray.origin, new Vector3()), sparseResults)).to.eq(false);
      expect(sparseResults).to.have.length(0);
      expect(physicsScene.raycastAll(ray, sparseResults)).to.eq(true);
      expect(sparseResults).to.have.members(sparseHits);

      const limitedResults: HitResult[] = [];
      expect(physicsScene.raycastAll(ray, 5, limitedResults)).to.eq(true);
      expect(limitedResults).to.have.length(1);
      expect(limitedResults[0].collider).to.eq(nearShape);
      expect(limitedResults[0].entity).to.eq(nearEntity);

      const filteredResults: HitResult[] = [];
      expect(physicsScene.raycastAll(ray, Number.MAX_VALUE, Layer.Layer1, filteredResults)).to.eq(true);
      expect(filteredResults).to.have.length(1);
      expect(filteredResults[0].collider).to.eq(farShape);
      expect(filteredResults[0].entity).to.eq(farEntity);
      expect(physicsScene.raycastAll(ray, undefined, Layer.Layer1, filteredResults)).to.eq(true);
      expect(filteredResults).to.have.length(1);
      expect(filteredResults[0].collider).to.be.eq(farShape);
      expect(physicsScene.raycastAll(ray, 5, undefined, filteredResults)).to.eq(true);
      expect(filteredResults).to.have.length(1);
      expect(filteredResults[0].collider).to.be.eq(nearShape);
      expect(physicsScene.raycastAll(ray, undefined, undefined, filteredResults)).to.eq(true);
      expect(filteredResults.map((hit) => hit.collider)).to.have.members([nearShape, farShape]);
      expect(physicsScene.raycastAll(ray)).to.eq(true);
      expect(physicsScene.raycastAll(ray, 5)).to.eq(true);
      expect(physicsScene.raycastAll(ray, 100, Layer.Nothing)).to.eq(false);
      expect(physicsScene.raycastAll(ray, 0)).to.eq(false);

      farShape._isSceneQuery = false;
      const queryFilteredResults: HitResult[] = [];
      expect(physicsScene.raycastAll(ray, queryFilteredResults)).to.eq(true);
      expect(queryFilteredResults).to.have.length(1);
      expect(queryFilteredResults[0].collider).to.eq(nearShape);

      root.destroy();
    });

    it("raycastAll shares only retired results across arrays and scenes", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("shared-raycast-output");
      for (let i = 0; i < 3; i++) {
        const entity = root.createChild();
        entity.transform.setPosition(i * 5, 100, 0);
        entity.addComponent(BoxCollider);
      }
      const otherScene = new Scene(enginePhysX);
      enginePhysX.sceneManager.addScene(otherScene);
      const otherRoot = otherScene.createRootEntity();
      otherRoot.transform.setPosition(0, 100, 0);
      otherRoot.addComponent(BoxCollider);

      const ray = new Ray(new Vector3(-3, 100, 0), new Vector3(1, 0, 0));
      const results: HitResult[] = [];
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      const initialHits = results.slice();
      const points = initialHits.map((hit) => hit.point);
      const normals = initialHits.map((hit) => hit.normal);
      expect(otherScene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results).to.have.length(1);
      expect(results[0]).to.eq(initialHits[0]);
      const active = results[0];
      const activePoint = active.point.clone();
      expect(initialHits.slice(1).every((hit) => hit.entity === null && hit.collider === null)).to.eq(true);
      expect(
        initialHits.slice(1).every((hit) => hit.distance === 0 && hit.point.length() === 0 && hit.normal.length() === 0)
      ).to.eq(true);

      const otherResults: HitResult[] = [];
      expect(scene.physics.raycastAll(ray, otherResults)).to.eq(true);
      expect(otherResults).to.include(initialHits[1]);
      expect(otherResults).to.include(initialHits[2]);
      expect(otherResults).to.not.include(active);
      for (let i = 1; i < initialHits.length; i++) {
        expect(initialHits[i].point).to.eq(points[i]);
        expect(initialHits[i].normal).to.eq(normals[i]);
      }
      expect(active.entity).to.eq(otherRoot);
      expect(active.point).to.deep.equal(activePoint);
      expect(new Set([...results, ...otherResults]).size).to.eq(4);

      const otherEntities = otherResults.map((hit) => hit.entity);
      const otherDistances = otherResults.map((hit) => hit.distance);
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results[0]).to.eq(active);
      expect(new Set([...results, ...otherResults]).size).to.eq(6);
      otherResults.forEach((hit, index) => {
        expect(hit.entity).toBe(otherEntities[index]);
        expect(hit.distance).toBe(otherDistances[index]);
      });

      root.destroy();
      otherScene.destroy();
    });

    it("raycastAll uses current caller storage without tracking removed objects", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("mutated-raycast-output");
      const shapes: Collider[] = [];
      for (let i = 0; i < 2; i++) {
        const entity = root.createChild();
        entity.transform.setPosition(i * 5, 1100, 0);
        const shape = entity.addComponent(BoxCollider);
        shapes.push(shape);
      }
      const ray = new Ray(new Vector3(-3, 1100, 0), new Vector3(1, 0, 0));
      const results: HitResult[] = [];
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      results.reverse();
      const reordered = results.slice();
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results[0]).to.eq(reordered[0]);
      expect(results[1]).to.eq(reordered[1]);

      const removed = results.shift()!;
      const retained = results[0];
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results[0]).to.eq(retained);
      expect(results).to.not.include(removed);
      expect(results.map((hit) => hit.collider)).to.have.members(shapes);

      const replacement = new HitResult();
      results[0] = replacement;
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results[0]).to.eq(replacement);
      expect(results).to.not.include(retained);
      const discarded = results.slice();
      results.length = 0;
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results.some((hit) => discarded.includes(hit))).to.eq(false);
      expect(results.map((hit) => hit.collider)).to.have.members(shapes);

      const supplied = new HitResult();
      results.length = 0;
      results[1] = supplied;
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results[1]).to.eq(supplied);
      expect(new Set(results).size).to.eq(2);
      expect(results.map((hit) => hit.collider)).to.have.members(shapes);
      root.destroy();
    });

    it("raycastAll writes into caller-supplied entries without replacing aliases", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("duplicate-raycast-output");
      const shapes: Collider[] = [];
      for (let i = 0; i < 3; i++) {
        const entity = root.createChild();
        entity.transform.setPosition(i * 5, 1200, 0);
        const shape = entity.addComponent(BoxCollider);
        shapes.push(shape);
      }
      const ray = new Ray(new Vector3(-3, 1200, 0), new Vector3(1, 0, 0));
      const results: HitResult[] = [];
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      const originalHits = results.slice();
      results[0] = originalHits[2];
      results[1] = originalHits[2];
      results[2] = originalHits[1];
      expect(scene.physics.raycastAll(ray, results)).to.eq(true);
      expect(results[0] === originalHits[2]).to.eq(true);
      expect(results[1] === originalHits[2]).to.eq(true);
      expect(results[2] === originalHits[1]).to.eq(true);
      expect(results).to.have.length(3);
      expect(shapes).to.include(results[0].collider);
      expect(shapes).to.include(results[2].collider);

      root.destroy();
    });

    it.each([0, 1, 2])("raycastAll retires duplicate entries safely with %i hits", (hitCount) => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("retired-raycast-aliases");
      const shapes: Collider[] = [];
      for (let i = 0; i < 3; i++) {
        const entity = root.createChild();
        entity.transform.setPosition(i * 5, 1400, 0);
        const shape = entity.addComponent(BoxCollider);
        shapes.push(shape);
      }
      const ray = new Ray(new Vector3(-3, 1400, 0), new Vector3(1, 0, 0));
      const shared = new HitResult();
      const spare = new HitResult();
      const results = [shared, shared, spare, spare];
      enginePhysX.resourceManager.gc();

      try {
        expect(scene.physics.raycastAll(ray, hitCount * 5, results)).to.eq(hitCount > 0);
        expect(results).to.have.length(hitCount);
        if (hitCount > 0) {
          expect(results[0]).to.eq(shared);
          if (hitCount === 2) {
            expect(results[1]).to.eq(shared);
          }
          expect(shapes.slice(0, hitCount)).to.include(shared.collider);
          expect(shared.entity).to.eq(shared.collider!.entity);
          expect(shared.distance).to.be.greaterThan(0);
          expect(shared.point.y).to.eq(1400);
          expect(shared.normal.length()).to.be.closeTo(1, 1e-4);
        } else {
          expect(shared.collider).to.eq(null);
          expect(shared.entity).to.eq(null);
        }
        expect(spare.collider).to.eq(null);
        expect(spare.entity).to.eq(null);
        const activeShape = shared.collider;
        const activeDistance = shared.distance;
        const activePoint = shared.point.clone();
        const activeNormal = shared.normal.clone();

        const nextResults: HitResult[] = [];
        expect(scene.physics.raycastAll(ray, nextResults)).to.eq(true);
        expect(nextResults).to.have.length(3);
        expect(new Set(nextResults).size).to.eq(3);
        expect(nextResults.map((hit) => hit.collider)).to.have.members(shapes);
        expect(nextResults).to.include(spare);
        if (hitCount > 0) {
          expect(nextResults).to.not.include(shared);
          expect(shared.collider).to.eq(activeShape);
          expect(shared.distance).to.eq(activeDistance);
          expect(shared.point).to.deep.equal(activePoint);
          expect(shared.normal).to.deep.equal(activeNormal);
        } else {
          expect(nextResults).to.include(shared);
        }
      } finally {
        root.destroy();
        enginePhysX.resourceManager.gc();
      }
    });

    it.each(["gc", "destroy"])("raycastAll releases only idle storage on %s", (release) => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("released-raycast-output");
      root.transform.setPosition(0, 1300, 0);
      root.addComponent(BoxCollider);
      const otherScene = new Scene(enginePhysX);
      enginePhysX.sceneManager.addScene(otherScene);
      const otherRoot = otherScene.createRootEntity();
      otherRoot.transform.setPosition(0, 1300, 0);
      otherRoot.addComponent(BoxCollider);

      const ray = new Ray(new Vector3(-3, 1300, 0), new Vector3(1, 0, 0));
      const idleResults: HitResult[] = [];
      expect(otherScene.physics.raycastAll(ray, idleResults)).to.eq(true);
      const retired = idleResults[0];
      const supplied = new HitResult();
      const activeResults = [supplied];
      expect(scene.physics.raycastAll(ray, activeResults)).to.eq(true);
      const point = supplied.point.clone();
      const normal = supplied.normal.clone();
      const distance = supplied.distance;
      const shape = supplied.collider;
      expect(otherScene.physics.raycastAll(ray, 0, idleResults)).to.eq(false);
      expect(retired.entity).to.eq(null);
      expect(retired.collider).to.eq(null);

      if (release === "gc") {
        enginePhysX.resourceManager.gc();
      } else {
        otherScene.destroy();
      }
      expect(activeResults[0]).to.eq(supplied);
      expect(supplied.entity).to.eq(root);
      expect(supplied.collider).to.eq(shape);
      expect(supplied.distance).to.eq(distance);
      expect(supplied.point).to.deep.equal(point);
      expect(supplied.normal).to.deep.equal(normal);
      expect(scene.physics.raycastAll(ray, idleResults)).to.eq(true);
      expect(idleResults[0]).to.not.eq(retired);
      expect(idleResults[0]).to.not.eq(supplied);
      expect(scene.physics.raycastAll(ray, activeResults)).to.eq(true);
      expect(activeResults[0]).to.eq(supplied);

      root.destroy();
      if (!otherScene.destroyed) {
        otherScene.destroy();
      }
    });

    it("query filters follow native shape and layer changes", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physics = scene.physics;
      const root = scene.createRootEntity("native-query-filters");
      const near = root.createChild("near");
      const nearShape = near.addComponent(BoxCollider);
      nearShape.collisionLayer = Layer.Layer1;
      const far = root.createChild("far");
      far.transform.position = new Vector3(4, 0, 0);
      const farShape = far.addComponent(BoxCollider);
      farShape.collisionLayer = Layer.Layer31;
      const ray = new Ray(new Vector3(-3, 0, 0), new Vector3(2, 0, 0));
      const originalDirection = ray.direction.clone();
      const hit = new HitResult();
      const hits: HitResult[] = [];
      const mask = Layer.Layer1 | Layer.Layer31;
      expect(physics.raycastAll(ray, 100, mask, hits)).to.eq(true);
      expect(hits.map((hit) => hit.collider)).to.have.members([nearShape, farShape]);
      expect(ray.direction).to.deep.equal(originalDirection);
      expect(physics.raycastAll(ray, 100, Layer.Layer31, hits)).to.eq(true);
      expect(hits).to.have.length(1);
      expect(hits[0].collider).to.be.eq(farShape);
      expect(physics.raycastAll(ray, 100, Layer.Nothing, hits)).to.eq(false);
      expect(hits).to.have.length(0);
      expect(physics.raycast(ray, 100, Layer.Layer31, hit)).to.eq(true);
      expect(hit.collider).to.eq(farShape);

      nearShape._isSceneQuery = false;
      nearShape.isTrigger = true;
      expect(physics.raycastAll(ray, 100, mask, hits)).to.eq(true);
      expect(hits).to.have.length(1);
      expect(hits[0].collider).to.be.eq(farShape);
      expect(
        physics.boxCast(ray.origin, new Vector3(0.1, 0.1, 0.1), ray.direction, new Quaternion(), 100, mask, hit)
      ).to.eq(true);
      expect(hit.collider).to.eq(farShape);
      expect(physics.sphereCast(ray.origin, 0.1, ray.direction, 100, mask, hit)).to.eq(true);
      expect(hit.collider).to.eq(farShape);
      expect(physics.capsuleCast(ray.origin, 0.1, 0.4, ray.direction, new Quaternion(), 100, mask, hit)).to.eq(true);
      expect(hit.collider).to.eq(farShape);
      const center = new Vector3(2, 0, 0);
      {
        const overlap = physics.overlapBoxAll(center, new Vector3(5, 5, 5), new Quaternion(), mask);
        expect(overlap).to.have.length(1);
        expect(overlap[0]).to.be.eq(farShape);
      }
      {
        const overlap = physics.overlapSphereAll(center, 5, mask);
        expect(overlap).to.have.length(1);
        expect(overlap[0]).to.be.eq(farShape);
      }
      {
        const overlap = physics.overlapCapsuleAll(center, 5, 11, new Quaternion(), mask);
        expect(overlap).to.have.length(1);
        expect(overlap[0]).to.be.eq(farShape);
      }
      nearShape._isSceneQuery = true;
      nearShape.collisionLayer = Layer.Layer31;
      expect(physics.raycastAll(ray, 100, Layer.Layer1, hits)).to.eq(false);
      expect(physics.raycastAll(ray, 100, Layer.Layer31, hits)).to.eq(true);
      expect(hits).to.have.length(2);
      const addedShape = near.addComponent(SphereCollider);
      addedShape.collisionLayer = Layer.Layer31;
      expect(physics.raycastAll(ray, 100, Layer.Layer31, hits)).to.eq(true);
      expect(hits).to.have.length(3);
      nearShape._isSceneQuery = false;
      const cloneEntity = near.clone();
      root.addChild(cloneEntity);
      const clone = cloneEntity.getComponent(BoxCollider);
      expect(clone._isSceneQuery).to.eq(false);
      expect(physics.raycastAll(ray, hits)).to.eq(true);
      expect(hits.map((hit) => hit.collider)).to.not.include(clone);
      root.destroy();
    });

    it("character-controller query settings survive native recreation", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("controller-query-settings");
      const entity = root.createChild("controller");
      const controller = entity.addComponent(CharacterController);
      controller.collisionLayer = Layer.Layer31;
      controller._isSceneQuery = false;
      const ray = new Ray(new Vector3(-3, 0, 0), new Vector3(1, 0, 0));
      const hits: HitResult[] = [];
      expect(scene.physics.raycastAll(ray, hits)).to.eq(false);
      expect(hits).to.have.length(0);
      controller._isSceneQuery = true;
      expect(scene.physics.raycastAll(ray, 100, Layer.Layer31, hits)).to.eq(true);
      expect(hits).to.have.length(1);
      expect(hits[0].collider).to.be.eq(controller);
      controller._isSceneQuery = false;
      controller.enabled = false;
      controller.enabled = true;
      expect(scene.physics.raycastAll(ray, hits)).to.eq(false);
      expect(hits).to.have.length(0);
      controller._isSceneQuery = true;
      expect(scene.physics.raycastAll(ray, 100, Layer.Layer31, hits)).to.eq(true);
      expect(hits).to.have.length(1);
      expect(hits[0].collider).to.be.eq(controller);
      expect(scene.physics.raycastAll(ray, 100, Layer.Layer0, hits)).to.eq(false);
      expect(hits).to.have.length(0);
      root.destroy();
    });

    it("native hit buffers preserve all bits of shape IDs", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const native = (scene.physics as any)._nativePhysicsScene as IPhysicsScene;
      const backend = physicsBackend;
      const material = backend.createPhysicsMaterial({
        staticFriction: 0,
        dynamicFriction: 0,
        bounciness: 0,
        frictionCombine: 0,
        bounceCombine: 0
      });
      const id = 0xffffffff;
      const nativeShape = backend.createBoxShape(id, new Vector3(0.5, 0.5, 0.5), material);
      const nativeActor = backend.createStaticActor(new Vector3(0, 3, 0), new Quaternion());
      nativeActor.addShape(nativeShape);
      nativeShape.setCollisionLayer(0);
      native.addActor(nativeActor);
      const hits: number[] = [];
      native.raycastAll(new Vector3(-3, 3, 0), new Vector3(1, 0, 0), 100, Layer.Everything, (shapeID) =>
        hits.push(shapeID)
      );
      expect(hits).to.deep.equal([id]);
      expect(Array.from(native.overlapSphereAll(new Vector3(0, 3, 0), 1, Layer.Everything))).to.deep.equal([id]);
      native.removeActor(nativeActor);
      nativeActor.removeShape(nativeShape);
      nativeShape.destroy();
      nativeActor.destroy();
      material.destroy();
    });

    it("raycastAll preserves outer hits across nested queries and gc", () => {
      const nativeScene = physicsBackend.createPhysicsScene();
      const material = physicsBackend.createPhysicsMaterial({
        staticFriction: 0.5,
        dynamicFriction: 0.5,
        bounciness: 0,
        frictionCombine: 0,
        bounceCombine: 0
      });
      const rotation = new Quaternion();
      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const bodies = [1, 2, 3, 4, 5, 6].map((id) => {
        const y = id <= 3 ? 0 : 4;
        const x = (id <= 3 ? id : id - 3) * 2;
        const actor = physicsBackend.createStaticActor(new Vector3(x, y, 0), rotation);
        const shape = physicsBackend.createBoxShape(id, halfExtents, material);
        actor.addShape(shape);
        nativeScene.addActor(actor);
        return { actor, shape };
      });

      try {
        const direction = new Vector3(1, 0, 0);
        const outerOrigin = new Vector3(0, 0, 0);
        const innerOrigin = new Vector3(0, 4, 0);

        const runNested = (): void => {
          const outerIds: number[] = [];
          const innerIds: number[] = [];
          const retainedPositions: Vector3[] = [];
          nativeScene.raycastAll(outerOrigin, direction, 10, Layer.Everything, (id, _distance, position) => {
            outerIds.push(id);
            retainedPositions.push(position.clone());
            if (outerIds.length === 1) {
              nativeScene.raycastAll(innerOrigin, direction, 10, Layer.Everything, (innerId) => {
                innerIds.push(innerId);
              });
            }
          });
          expect(outerIds.sort((a, b) => a - b)).to.deep.equal([1, 2, 3]);
          expect(innerIds.sort((a, b) => a - b)).to.deep.equal([4, 5, 6]);
          expect(retainedPositions).to.have.length(3);
        };

        runNested();
        nativeScene.gc();
        runNested();
      } finally {
        for (const { actor, shape } of bodies) {
          nativeScene.removeActor(actor);
          actor.removeShape(shape);
          shape.destroy();
          actor.destroy();
        }
        nativeScene.destroy();
        material.destroy();
      }
    });

    it("raycastAll returns every hit beyond the native touch chunk", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("raycast_all_many_root");
      const expectedShapes = new Set<Collider>();
      const expectedEntities = new Set<Entity>();
      const hitCount = 257;

      for (let i = 0; i < hitCount; i++) {
        const entity = root.createChild(`hit-${i}`);
        entity.transform.position = new Vector3(i * 2, 0, 0);
        const shape = entity.addComponent(BoxCollider);
        shape.size = new Vector3(1, 1, 1);
        expectedEntities.add(entity);
        expectedShapes.add(shape);
      }

      const ray = new Ray(new Vector3(-1, 0, 0), new Vector3(1, 0, 0));
      const results: HitResult[] = [];
      expect(physicsScene.raycastAll(ray, results)).to.eq(true);
      const resultShapes = new Set(results.map((result) => result.collider));
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

      const previousHits = results.slice();
      const previousPoints = results.map((hit) => hit.point);
      const previousNormals = results.map((hit) => hit.normal);
      expect(physicsScene.raycastAll(ray, results)).to.eq(true);
      expect(results.every((hit, index) => hit === previousHits[index])).to.eq(true);
      expect(results.every((hit, index) => hit.point === previousPoints[index])).to.eq(true);
      expect(results.every((hit, index) => hit.normal === previousNormals[index])).to.eq(true);

      // Reuse the output from the larger query to detect stale tail hits.
      expect(physicsScene.raycastAll(ray, 2, results)).toBe(true);
      expect(results).toHaveLength(1);

      root.destroy();
    });

    it("raycast skips initial overlap when ray origin is inside a collider", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");

      // Box at origin, encompassing the ray origin
      const insideBox = root.createChild("inside_box");
      insideBox.transform.position = new Vector3(0, 0, 0);
      const insideShape = insideBox.addComponent(BoxCollider);
      insideShape.size = new Vector3(2, 2, 2);

      // Box further along the ray direction
      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farShape = farBox.addComponent(BoxCollider);
      farShape.size = new Vector3(2, 2, 2);

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
      const insideShape = insideBox.addComponent(BoxCollider);
      insideShape.size = new Vector3(2, 2, 2);

      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farShape = farBox.addComponent(BoxCollider);
      farShape.size = new Vector3(2, 2, 2);

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
      const insideShape = insideBox.addComponent(BoxCollider);
      insideShape.size = new Vector3(2, 2, 2);

      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farShape = farBox.addComponent(BoxCollider);
      farShape.size = new Vector3(2, 2, 2);

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
      const insideShape = insideBox.addComponent(BoxCollider);
      insideShape.size = new Vector3(2, 2, 2);

      const farBox = root.createChild("far_box");
      farBox.transform.position = new Vector3(5, 0, 0);
      const farShape = farBox.addComponent(BoxCollider);
      farShape.size = new Vector3(2, 2, 2);

      const direction = new Vector3(1, 0, 0);
      const hit = new HitResult();
      const ok = physicsScene.capsuleCast(new Vector3(0, 0, 0), 0.3, 1.1, direction, 100, hit);

      expect(ok).to.eq(true);
      expect(hit.entity).to.eq(farBox);
      expect(hit.distance).to.be.greaterThan(0);

      root.destroy();
    });

    it("boxCast", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      const boxShape = sweepTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

      // Test boxCast with no hit
      const center = new Vector3(3, 3, 3);
      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const direction = new Vector3(0, 1, 0);
      const orientation = new Quaternion();
      expect(
        physicsScene.boxCast(center, halfExtents, direction, orientation, Number.MAX_VALUE, Layer.Everything)
      ).to.eq(false);

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
      expect(outHitResult.collider).to.be.eq(boxShape);

      // Test boxCast with layer mask
      expect(
        physicsScene.boxCast(center, halfExtents, direction, orientation, Number.MAX_VALUE, Layer.Layer1, outHitResult)
      ).to.eq(false);

      // Test boxCast with distance limit
      expect(
        physicsScene.boxCast(center, halfExtents, direction, orientation, 0.1, Layer.Everything, outHitResult)
      ).to.eq(false);

      // The starting volume overlaps the box, so it must be ignored by the sweep.
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
      const boxShape2 = sweepTestRoot.addComponent(BoxCollider);
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.center = new Vector3(1, 0, 0);
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

      const boxShape = sweepTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

      const center = new Vector3(3, 3, 3);
      const halfExtents = new Vector3(0.5, 0.5, 0.5);
      const direction = new Vector3(-1, -1, -1).normalize();
      const outHitResult = new HitResult();

      // Test boxCast(center, halfExtents, direction, outHitResult) - direct HitResult
      expect(physicsScene.boxCast(center, halfExtents, direction, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.collider).to.be.eq(boxShape);

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

      const boxShape = sweepTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

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
      expect(outHitResult.collider).to.be.eq(boxShape);

      // Test sphereCast with layer mask
      expect(physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Layer1, outHitResult)).to.eq(
        false
      );

      // Test sphereCast with distance limit
      expect(physicsScene.sphereCast(center, radius, direction, 0.1, Layer.Everything, outHitResult)).to.eq(false);

      // Start inside the box to exercise initial-overlap filtering.
      center.set(0, 0, 0);
      expect(
        physicsScene.sphereCast(center, radius, direction, Number.MAX_VALUE, Layer.Everything, outHitResult)
      ).to.eq(false);

      // Test sphereCast with multiple colliders
      const boxShape2 = sweepTestRoot.addComponent(BoxCollider);
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.center = new Vector3(1, 0, 0);
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

      const boxShape = sweepTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const direction = new Vector3(-1, -1, -1).normalize();
      const outHitResult = new HitResult();

      // Test sphereCast(center, radius, direction, outHitResult) - direct HitResult
      expect(physicsScene.sphereCast(center, radius, direction, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.collider).to.be.eq(boxShape);

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

      const boxShape = sweepTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

      // Test capsuleCast with no hit
      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const height = 2;
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

      // Start inside the box to exercise initial-overlap filtering.
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
      const boxShape2 = sweepTestRoot.addComponent(BoxCollider);
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.center = new Vector3(1, 0, 0);
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
      expect(outHitResult.distance).to.be.eq(1);
      expect(outHitResult.collider).to.be.eq(boxShape2);

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

    it("uses the total height and Y-axis default orientation in capsule sweeps and overlaps", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physics = scene.physics;
      const root = scene.createRootEntity();
      const target = root.addComponent(BoxCollider);
      target.size.set(1, 1, 1);

      const radius = 0.5;
      const height = 2;
      const center = new Vector3(0, -5, 0);
      const hit = new HitResult();
      expect(physics.capsuleCast(center, radius, height, new Vector3(0, 1, 0), 10, hit)).toBe(true);
      expect(hit.collider).toBe(target);
      expect(hit.distance).toBeCloseTo(3.5, 4);

      expect(physics.overlapCapsuleAll(new Vector3(0, -1.75, 0), radius, height)).toEqual([]);
      expect(physics.overlapCapsuleAll(new Vector3(0, -1.25, 0), radius, height)).toEqual([target]);

      // Perpendicular X extent is the radius (0.5) unless orientation aligns the capsule with X.
      expect(physics.overlapCapsuleAll(new Vector3(-1.25, 0, 0), radius, height)).toEqual([]);
      expect(physics.overlapCapsuleAll(new Vector3(-0.75, 0, 0), radius, height)).toEqual([target]);
      const alignedX = new Quaternion();
      Quaternion.rotationEuler(0, 0, Math.PI / 2, alignedX);
      expect(physics.overlapCapsuleAll(new Vector3(-1.25, 0, 0), radius, height, alignedX)).toEqual([target]);

      root.destroy();
    });

    it("capsuleCast - New Overloads", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("root");
      const sweepTestRoot = root.createChild("root");

      const boxShape = sweepTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const height = 2;
      const direction = new Vector3(-1, -1, -1).normalize();
      const outHitResult = new HitResult();

      // Test capsuleCast(center, radius, height, direction, outHitResult) - direct HitResult
      expect(physicsScene.capsuleCast(center, radius, height, direction, outHitResult)).to.eq(true);
      expect(outHitResult.entity).to.be.eq(sweepTestRoot);
      expect(outHitResult.collider).to.be.eq(boxShape);

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

      const boxShape = overlapTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

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
      const boxShape2 = overlapTestRoot.addComponent(BoxCollider);
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.center = new Vector3(1, 0, 0);
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
      const customArray: Collider[] = [];
      const shapesCustom = physicsScene.overlapBoxAll(center, halfExtents, orientation, Layer.Everything, customArray);
      expect(shapesCustom).to.be.eq(customArray);
      expect(shapesCustom).to.have.length(2);
      expect(shapesCustom).to.include.members([boxShape, boxShape2]);

      root.destroy();
    });

    it("overlapBoxAll does not reuse previous rotation for degenerate quaternions", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physics = scene.physics;
      const root = scene.createRootEntity("overlap-box-zero-quaternion");
      const target = root.createChild("target");
      target.transform.setPosition(0, 1.5, 0);
      const targetCollider = target.addComponent(BoxCollider);

      try {
        const center = new Vector3(0, 0, 0);
        const halfExtents = new Vector3(2, 0.3, 0.3);
        const identity = new Quaternion();
        const vertical = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
        const zero = new Quaternion(0, 0, 0, 0);
        const nearZero = new Quaternion(0, 0, 0, 1e-8);

        expect(physics.overlapBoxAll(center, halfExtents, identity)).to.have.length(0);
        expect(physics.overlapBoxAll(center, halfExtents, zero)).to.have.length(0);
        expect(physics.overlapBoxAll(center, halfExtents, nearZero)).to.have.length(0);

        expect(physics.overlapBoxAll(center, halfExtents, vertical)).to.deep.equal([targetCollider]);

        expect(physics.overlapBoxAll(center, halfExtents, zero)).to.have.length(0);
        expect(physics.overlapBoxAll(center, halfExtents, nearZero)).to.have.length(0);
      } finally {
        root.destroy();
      }
    });

    it("overlapAll preserves every shape beyond the native touch chunk", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const physicsScene = scene.physics;
      const root = scene.createRootEntity("overlap_all_many_root");
      const expectedShapes = new Set<Collider>();
      const hitCount = 257;

      for (let i = 0; i < hitCount; i++) {
        const shape = root.addComponent(BoxCollider);
        shape.size = new Vector3(1, 1, 1);
        expectedShapes.add(shape);
      }

      const center = new Vector3(0, 0, 0);
      const orientation = new Quaternion();
      const results = [
        physicsScene.overlapBoxAll(center, new Vector3(1, 1, 1), orientation),
        physicsScene.overlapSphereAll(center, 2),
        physicsScene.overlapCapsuleAll(center, 2, 8, orientation)
      ];

      for (const shapes of results) {
        expect(shapes).to.have.length(hitCount);
        expect(new Set(shapes).size).to.eq(hitCount);
        for (const shape of expectedShapes) {
          expect(shapes).to.include(shape);
        }
      }

      root.destroy();
    });

    it("overlapSphereAll", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("root");
      const overlapTestRoot = root.createChild("root");

      const boxShape = overlapTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

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
      const boxShape2 = overlapTestRoot.addComponent(BoxCollider);
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.center = new Vector3(1, 0, 0);
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
      const customSphereArray: Collider[] = [];
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

      const boxShape = overlapTestRoot.addComponent(BoxCollider);
      boxShape.size = new Vector3(1, 1, 1);

      // Test overlapCapsule with no overlap
      const center = new Vector3(3, 3, 3);
      const radius = 0.5;
      const height = 2;
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

      center.set(0, 0, 0);
      let capsuleRadius = 2;
      let capsuleHeight = 8;
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
      const cRot = enginePhysX.sceneManager.scenes[0].physics.overlapCapsuleAll(
        center,
        capsuleRadius,
        capsuleHeight,
        orientation,
        Layer.Everything
      );
      expect(cRot).to.include(boxShape);

      // Test overlapCapsule with multiple colliders
      const boxShape2 = overlapTestRoot.addComponent(BoxCollider);
      boxShape2.size = new Vector3(1, 1, 1);
      boxShape2.center = new Vector3(1, 0, 0);
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
      capsuleHeight = 2;
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
      const customCapsuleArray: Collider[] = [];
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
      it.each([
        ["static", "static", false],
        ["dynamic", "dynamic", true],
        ["static", "dynamic", true],
        ["kinematic", "static", true],
        ["kinematic", "dynamic", true],
        ["kinematic", "kinematic", true]
      ] as const)("reports trigger overlaps for %s and %s when eligible", (first, second, emits) => {
        const root = enginePhysX.sceneManager.activeScene.createRootEntity("trigger-pair");
        root.transform.setPosition(0, 1000, 0);
        const a = root.createChild("first");
        const b = root.createChild("second");
        const enter = vi.fn();
        const stay = vi.fn();
        const exit = vi.fn();
        const collision = vi.fn();
        a.addComponent(
          class extends Script {
            onTriggerEnter = enter;
            onTriggerStay = stay;
            onTriggerExit = exit;
            onCollisionEnter = collision;
          }
        );
        setColliderProps(a, first !== "static", true, first === "kinematic");
        setColliderProps(b, second !== "static", true, second === "kinematic");

        try {
          physicsScene._update(physicsScene.fixedTimeStep);
          physicsScene._update(physicsScene.fixedTimeStep);
          b.transform.setPosition(5, 0, 0);
          physicsScene._update(physicsScene.fixedTimeStep);

          expect(enter).toHaveBeenCalledTimes(Number(emits));
          expect(stay).toHaveBeenCalledTimes(Number(emits));
          expect(exit).toHaveBeenCalledTimes(Number(emits));
          expect(collision).not.toHaveBeenCalled();
        } finally {
          root.destroy();
        }
      });

      it("tracks trigger receivers by canonical pair ID rather than event object identity and leaves counts readonly", () => {
        const root = enginePhysX.sceneManager.activeScene.createRootEntity("trigger-pair-key");
        root.transform.setPosition(0, 1600, 0);
        const entityA = root.createChild("a");
        const ownerB = root.createChild("ownerB");
        ownerB.transform.setPosition(50, 0, 0);
        ownerB.addComponent(Rigidbody).isKinematic = true;
        const entityB = ownerB.createChild("b");
        const entityC = root.createChild("c");
        entityC.transform.setPosition(-50, 0, 0);
        const colliderA = entityA.addComponent(BoxCollider);
        colliderA.isTrigger = true;
        const colliderB = entityB.addComponent(BoxCollider);
        const colliderC = entityC.addComponent(BoxCollider);
        const enterA = vi.fn();
        const stayA = vi.fn();
        const exitA = vi.fn();
        const exitOwnerB = vi.fn();
        const exitB = vi.fn();
        const enterC = vi.fn();
        const exitC = vi.fn();
        entityA.addComponent(
          class extends Script {
            onTriggerEnter = enterA;
            onTriggerStay = stayA;
            onTriggerExit = exitA;
          }
        );
        ownerB.addComponent(
          class extends Script {
            onTriggerExit = exitOwnerB;
          }
        );
        entityB.addComponent(
          class extends Script {
            onTriggerExit = exitB;
          }
        );
        entityC.addComponent(
          class extends Script {
            onTriggerEnter = enterC;
            onTriggerExit = exitC;
          }
        );

        const pooledSlot = { shape0Id: colliderA._id, shape1Id: colliderB._id, state: PhysicsEventState.Enter };
        try {
          physicsScene._syncColliders();
          // Enter (A, B) in pooledSlot while colliderB is owned by ownerB.
          (physicsScene as any)._dispatchEvents(
            Object.freeze({
              contactEvents: [],
              contactEventCount: 0,
              triggerEvents: [pooledSlot],
              bodySleepEventIds: [],
              bodySleepEventCount: 0
            } satisfies IPhysicsEvents)
          );
          expect(enterA).toHaveBeenCalledOnce();

          // Reuse the same pooledSlot object for (A, C) while (A, B) stays active under swapped order,
          // and pass non-zero frozen contactEventCount / bodySleepEventCount to verify they are never mutated.
          pooledSlot.shape0Id = colliderA._id;
          pooledSlot.shape1Id = colliderC._id;
          pooledSlot.state = PhysicsEventState.Enter;
          const frozenStep2 = Object.freeze({
            contactEvents: [
              {
                shape0Id: colliderA._id,
                shape1Id: colliderB._id,
                contactCount: 0,
                state: PhysicsEventState.Enter,
                getContact() {}
              }
            ],
            contactEventCount: 1,
            triggerEvents: [
              { shape0Id: colliderB._id, shape1Id: colliderA._id, state: PhysicsEventState.Stay },
              pooledSlot
            ],
            bodySleepEventIds: [999999],
            bodySleepEventCount: 1
          } satisfies IPhysicsEvents);
          (physicsScene as any)._dispatchEvents(frozenStep2);
          expect(frozenStep2.contactEventCount).toBe(1);
          expect(frozenStep2.bodySleepEventCount).toBe(1);
          expect(stayA).toHaveBeenCalledOnce();
          expect(enterC).toHaveBeenCalledExactlyOnceWith(colliderA, colliderC);

          // Reparent entityB away from ownerB before Exit so delivery depends on historical lookup.
          root.addChild(entityB);
          physicsScene._syncColliders();

          // Exit both using pooledSlot and swapped IDs.
          pooledSlot.shape0Id = colliderA._id;
          pooledSlot.shape1Id = colliderB._id;
          pooledSlot.state = PhysicsEventState.Exit;
          (physicsScene as any)._dispatchEvents(
            Object.freeze({
              contactEvents: [],
              contactEventCount: 0,
              triggerEvents: [
                pooledSlot,
                { shape0Id: colliderC._id, shape1Id: colliderA._id, state: PhysicsEventState.Exit }
              ],
              bodySleepEventIds: [],
              bodySleepEventCount: 0
            } satisfies IPhysicsEvents)
          );
          expect(exitA).toHaveBeenCalledTimes(2);
          expect(exitOwnerB).toHaveBeenCalledExactlyOnceWith(colliderA, colliderB);
          expect(exitB).not.toHaveBeenCalled();
          expect(exitC).toHaveBeenCalledExactlyOnceWith(colliderA, colliderC);
        } finally {
          root.destroy();
        }
      });

      it("Dynamic vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision not works, both A,B are dynamic.
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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

      it("Static Trigger vs Dynamic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and trigger, B is dynamic.
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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

      it("Static Trigger vs Dynamic Kinematic", () => {
        const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;

        const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
        const raycastTestRoot = root.createChild("root_collisionTest");
        const entity1 = raycastTestRoot.createChild("entity1");
        const entity2 = raycastTestRoot.createChild("entity2");
        const collisionTestScript = entity1.addComponent(CollisionTestScript);

        // Test that collision works correctly, A is static and trigger, B is dynamic and kinematic.
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
        watchCollisionCallbacks(collisionTestScript);
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
    });

    it("destroy with characterController", () => {
      const newScene = new Scene(enginePhysX);
      enginePhysX.sceneManager.addScene(newScene);
      const root = newScene.createRootEntity("root");
      const characterController = root.addComponent(CharacterController);
      newScene.physics._update(newScene.physics.fixedTimeStep);
      newScene.destroy();
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
      const colliderA = entityA.addComponent(Rigidbody);
      entityA.addComponent(BoxCollider);

      const entityB = root.createChild("boxB");
      entityB.transform.setPosition(0, 0, 0);
      entityB.addComponent(Rigidbody);
      entityB.addComponent(BoxCollider);

      let newEntity: Entity = null;
      const onCollisionEnter = vi.fn(() => {
        // Create a new physics object at the collision point (like 2048 game merge)
        newEntity = root.createChild("newBox");
        newEntity.transform.setPosition(0, 5, 0);
        newEntity.addComponent(Rigidbody);
        newEntity.addComponent(BoxCollider);

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

      expect(() => updateEnginePhysics(enginePhysX)).not.toThrow();

      expect(onCollisionEnter).toHaveBeenCalled();
      expect(newEntity).not.toBeNull();
      expect(entityA.destroyed).eq(true);
      expect(entityB.destroyed).eq(true);
    });

    it("new entity created in onCollisionEnter should preserve correct position", () => {
      const physicsMgr = enginePhysX.sceneManager.scenes[0].physics;
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");

      physicsMgr.gravity = new Vector3(0, 0, 0);

      const entityA = root.createChild("boxA");
      entityA.transform.setPosition(-3, 0, 0);
      const colliderA = entityA.addComponent(Rigidbody);
      entityA.addComponent(BoxCollider);

      const entityB = root.createChild("boxB");
      entityB.transform.setPosition(0, 0, 0);
      entityB.addComponent(Rigidbody);
      entityB.addComponent(BoxCollider);

      const targetPos = new Vector3(0, 5, 0);
      let newEntity: Entity = null;

      entityA.addComponent(
        class extends Script {
          onCollisionEnter(): void {
            if (!entityA.pendingDestroy) {
              newEntity = root.createChild("newBox");
              newEntity.transform.position = targetPos.clone();
              newEntity.addComponent(Rigidbody);
              newEntity.addComponent(BoxCollider);
              entityA.destroy();
              entityB.destroy();
            }
          }
        }
      );

      colliderA.applyForce(new Vector3(1000, 0, 0));

      updateEnginePhysics(enginePhysX);

      // The new body's first sync must preserve the position assigned in the callback.
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
      const colliderA = entityA.addComponent(Rigidbody);
      entityA.addComponent(BoxCollider);

      const entityB = root.createChild("boxB");
      entityB.transform.setPosition(0, 0, 0);
      entityB.addComponent(Rigidbody);
      entityB.addComponent(BoxCollider);

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

      expect(() => updateEnginePhysics(enginePhysX)).not.toThrow();

      expect(onCollisionEnter).toHaveBeenCalled();
      expect(entityA.destroyed).eq(true);
      expect(entityB.destroyed).eq(true);
    });

    // @see https://github.com/galacean/engine/issues/2877
    it("destroy entity in onTriggerEnter should not crash", () => {
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("root");
      const entity1 = root.createChild("triggerA");
      const entity2 = root.createChild("triggerB");

      // Both at origin to guarantee overlap
      setColliderProps(entity1, false, true, false);
      setColliderProps(entity2, true, false, false);

      const onTriggerEnter = vi.fn((other: Collider) => {
        entity2.destroy();
        expect(entity2.pendingDestroy).toBe(true);
        expect(entity2.destroyed).toBe(false);
      });
      const onTriggerEnterB = vi.fn((other: Collider, self: Collider) => {
        expect(other.entity).toBe(entity1);
        expect(self.entity).toBe(entity2);
      });

      entity1.addComponent(
        class extends Script {
          onTriggerEnter(other: Collider): void {
            onTriggerEnter(other);
          }
        }
      );
      entity2.addComponent(
        class extends Script {
          onTriggerEnter(other: Collider, self: Collider): void {
            onTriggerEnterB(other, self);
          }
        }
      );

      expect(() => updateEnginePhysics(enginePhysX)).not.toThrow();

      expect(onTriggerEnter).toHaveBeenCalledTimes(1);
      expect(onTriggerEnterB).toHaveBeenCalledTimes(1);
      expect(entity2.destroyed).eq(true);
    });

    it("destroying a Collider on an active entity prevents resurrection and raycast crashes", () => {
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("destroyed-collider");
      const collider = root.addComponent(BoxCollider);
      collider.destroy();
      expect(collider.destroyed).toBe(true);

      collider.center = new Vector3(1, 0, 0);
      collider.size = new Vector3(2, 2, 2);

      const hit = new HitResult();
      expect(physicsScene.raycast(new Ray(new Vector3(-5, 0, 0), new Vector3(1, 0, 0)), hit)).toBe(false);
      expect(physicsScene.raycast(new Ray(new Vector3(1, 5, 0), new Vector3(0, -1, 0)), hit)).toBe(false);
    });

    it("keeps contact event consumer count balanced across dynamic callback assignment and destroyed script disable", () => {
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("contact-consumer-balance");
      physicsScene.gravity.set(0, 0, 0);

      class EmptyScript extends Script {}
      const dynamicScript = root.addComponent(EmptyScript);
      (dynamicScript as any).onCollisionEnter = vi.fn();
      dynamicScript.destroy();
      dynamicScript.enabled = false;

      const protoScript = root.addComponent(CollisionConsumerScript);
      protoScript.destroy();
      protoScript.enabled = false;

      expect((physicsScene as any)._contactEventConsumerCount).toBe(0);

      const boxA = root.createChild("boxA");
      boxA.transform.setPosition(-0.9, 0, 0);
      boxA.addComponent(BoxCollider);
      const bodyA = boxA.addComponent(Rigidbody);
      bodyA.linearVelocity = new Vector3(20, 0, 0);

      const boxB = root.createChild("boxB");
      boxB.transform.setPosition(0.9, 0, 0);
      boxB.addComponent(BoxCollider);
      boxB.addComponent(Rigidbody);

      const onCollisionEnter = vi.fn();
      boxB.addComponent(
        class extends Script {
          onCollisionEnter(): void {
            onCollisionEnter();
          }
        }
      );

      for (let i = 0; i < 10 && onCollisionEnter.mock.calls.length === 0; i++) {
        physicsScene._update(physicsScene.fixedTimeStep);
      }
      expect(onCollisionEnter).toHaveBeenCalled();
    });

    it("normalizes non-unit query and kinematic move quaternions", () => {
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("non-unit-quat");
      const target = root.createChild("target");
      const targetCollider = target.addComponent(BoxCollider);

      const nonUnitQuat = new Quaternion(0, 2, 0, 2);
      const hit = new HitResult();
      expect(
        physicsScene.boxCast(
          new Vector3(-5, 0, 0),
          new Vector3(0.5, 0.5, 0.5),
          new Vector3(1, 0, 0),
          nonUnitQuat,
          20,
          Layer.Everything,
          hit
        )
      ).toBe(true);
      expect(hit.collider === targetCollider).toBe(true);
      expect(physicsScene.overlapBoxAll(new Vector3(0, 0, 0), new Vector3(1, 1, 1), nonUnitQuat)).toContain(
        targetCollider
      );
      expect(physicsScene.overlapCapsuleAll(new Vector3(0, 0, 0), 0.5, 2, nonUnitQuat)).toContain(targetCollider);

      const mover = root.createChild("mover");
      mover.transform.setPosition(0, 5, 0);
      mover.addComponent(BoxCollider);
      const body = mover.addComponent(Rigidbody);
      body.isKinematic = true;
      body.move(new Vector3(0, 5, 0), nonUnitQuat);
      physicsScene._update(physicsScene.fixedTimeStep);
      expect(mover.transform.rotationQuaternion.length()).toBeCloseTo(1, 4);
    });

    it("rejects non-positive or non-finite query geometry and distances without hits or inverted normals", () => {
      const root = enginePhysX.sceneManager.activeScene.createRootEntity("invalid-query-dims");
      const target = root.createChild("target");
      target.addComponent(BoxCollider).size = new Vector3(2, 2, 2);

      const hit = new HitResult();
      hit.distance = 99;
      const origin = new Vector3(-5, 0, 0);
      const dir = new Vector3(1, 0, 0);
      const idQ = new Quaternion();

      expect(physicsScene.raycast(new Ray(origin, dir), 0, hit)).toBe(false);
      expect(hit.collider).toBeNull();
      expect(physicsScene.raycast(new Ray(origin, dir), -5, hit)).toBe(false);
      expect(physicsScene.raycast(new Ray(origin, dir), NaN, hit)).toBe(false);

      expect(physicsScene.boxCast(origin, new Vector3(0, 1, 1), dir, 20, hit)).toBe(false);
      expect(physicsScene.boxCast(origin, new Vector3(-1, 1, 1), dir, 20, hit)).toBe(false);
      expect(physicsScene.boxCast(origin, new Vector3(1, 1, 1), dir, 0, hit)).toBe(false);
      expect(physicsScene.sphereCast(origin, 0, dir, 20, hit)).toBe(false);
      expect(physicsScene.sphereCast(origin, -1, dir, 20, hit)).toBe(false);
      expect(physicsScene.sphereCast(origin, NaN, dir, 20, hit)).toBe(false);
      expect(physicsScene.sphereCast(origin, 0.5, dir, -1, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 0, 1, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, -0.5, 1, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 0.5, -1, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 0.5, NaN, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 0.5, 0, dir, 20, hit)).toBe(true);
      expect(hit.distance).toBeCloseTo(3.5, 4);
      expect(hit.normal.x).toBeCloseTo(-1, 4);
      expect(physicsScene.capsuleCast(origin, 0.5, 0.5, dir, 20, hit)).toBe(true);
      expect(physicsScene.capsuleCast(origin, 0.5, 1, dir, 20, hit)).toBe(true);
      expect(physicsScene.capsuleCast(origin, 0.5, 2, dir, 20, hit)).toBe(true);
      expect(hit.normal.x).toBeCloseTo(-1, 4);
      // Degenerate sphere extent does not extend past radius 0.5 regardless of capsule height <= 2 * radius
      expect(physicsScene.capsuleCast(new Vector3(-5, 1.75, 0), 0.5, 1, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(new Vector3(-5, 1.75, 0), 0.5, 2, dir, 20, hit)).toBe(true);

      const existing = [target.getComponent(BoxCollider)!];
      expect(physicsScene.overlapBoxAll(new Vector3(), new Vector3(0, 1, 1), idQ, Layer.Everything, existing)).toEqual(
        []
      );
      expect(physicsScene.overlapBoxAll(new Vector3(), new Vector3(-1, 1, 1))).toEqual([]);
      expect(physicsScene.overlapSphereAll(new Vector3(), 0)).toEqual([]);
      expect(physicsScene.overlapSphereAll(new Vector3(), -1)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0, 1)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0.5, -1)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0.5, NaN)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0.5, 0)).toHaveLength(1);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0.5, 0.5)).toHaveLength(1);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0.5, 1)).toHaveLength(1);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 0.5, 2)).toHaveLength(1);
      expect(physicsScene.overlapCapsuleAll(new Vector3(0, 1.75, 0), 0.5, 1)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(0, 1.25, 0), 0.5, 0.5)).toHaveLength(1);
      expect(physicsScene.overlapCapsuleAll(new Vector3(0, 1.75, 0), 0.5, 2)).toHaveLength(1);

      // Exercise values that are positive in JS but invalid after Float32 conversion.
      expect(physicsScene.boxCast(origin, new Vector3(1e-40, 1, 1), dir, 20, hit)).toBe(false);
      expect(physicsScene.boxCast(origin, new Vector3(1e40, 1, 1), dir, 20, hit)).toBe(false);
      expect(physicsScene.sphereCast(origin, 1e-40, dir, 20, hit)).toBe(false);
      expect(physicsScene.sphereCast(origin, 1e40, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 1e-40, 1, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 1e40, 1, dir, 20, hit)).toBe(false);
      expect(physicsScene.capsuleCast(origin, 1, 1e-40, dir, 20, hit)).toBe(true);
      expect(physicsScene.capsuleCast(origin, 1, 1e40, dir, 20, hit)).toBe(false);
      expect(physicsScene.overlapBoxAll(new Vector3(), new Vector3(1e-40, 1, 1))).toEqual([]);
      expect(physicsScene.overlapBoxAll(new Vector3(), new Vector3(1e40, 1, 1))).toEqual([]);
      expect(physicsScene.overlapSphereAll(new Vector3(), 1e-40)).toEqual([]);
      expect(physicsScene.overlapSphereAll(new Vector3(), 1e40)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 1e-40, 1)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 1e40, 1)).toEqual([]);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 1, 1e-40)).toHaveLength(1);
      expect(physicsScene.overlapCapsuleAll(new Vector3(), 1, 1e40)).toEqual([]);
    });

    it("stops remaining physics substeps when an onPhysicsUpdate callback deactivates the scene", () => {
      const scene = new Scene(enginePhysX);
      enginePhysX.sceneManager.addScene(scene);
      const root = scene.createRootEntity("deactivate-in-substep");
      let armed = false;
      let calls = 0;
      root.addComponent(
        class extends Script {
          override onPhysicsUpdate(): void {
            if (!armed) return;
            calls++;
            scene.isActive = false;
          }
        }
      );
      try {
        enginePhysX.update();
        armed = true;
        scene.physics._update(scene.physics.fixedTimeStep * 3);
        expect(calls).toBe(1);
      } finally {
        scene.destroy();
      }
    });

    it("defers mass and inertia recomputation across queries until simulation or mass-dependent Rigidbody APIs", () => {
      const scene = enginePhysX.sceneManager.activeScene;
      const root = scene.createRootEntity("deferred-mass");
      const bodyEntity = root.createChild("body");
      const body = bodyEntity.addComponent(Rigidbody);
      body.useGravity = false;
      const child = bodyEntity.createChild("box");
      const box = child.addComponent(BoxCollider);
      box.size = new Vector3(2, 2, 2);

      const controllerEntity = root.createChild("controller");
      controllerEntity.transform.setPosition(50, 0, 0);
      const controller = controllerEntity.addComponent(CharacterController);

      physicsScene._update(physicsScene.fixedTimeStep);
      const actor = (body as any)._nativeActor;
      const updateMass = vi.spyOn(actor, "updateMassAndInertia");
      const setMassProps = vi.spyOn(actor, "setMassProperties");

      body.mass = 8;
      child.transform.setPosition(4, 0, 0);
      box.size = new Vector3(1, 2, 2);

      const hit = new HitResult();
      expect(physicsScene.raycast(new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0)), 20, hit)).toBe(true);
      expect(hit.collider).toBe(box);
      expect(hit.distance).toBeCloseTo(3.5, 4);
      expect(physicsScene.overlapSphereAll(new Vector3(4, 0, 0), 0.1)).toEqual([box]);
      expect(box.getClosestPoint(new Vector3(3, 0, 0), new Vector3())).toBeCloseTo(0.5, 4);
      controller.move(new Vector3(0, 0, 0.1), 0.001, physicsScene.fixedTimeStep);
      expect(updateMass).not.toHaveBeenCalled();
      expect(setMassProps).not.toHaveBeenCalled();

      expect(body.centerOfMass.x).toBeCloseTo(4, 5);
      expect(updateMass).toHaveBeenCalledExactlyOnceWith(8, null, null, null);

      body.mass = 12;
      expect(physicsScene.raycast(new Ray(new Vector3(0, 0, 0), new Vector3(1, 0, 0)), 20, hit)).toBe(true);
      expect(updateMass).toHaveBeenCalledTimes(1);

      physicsScene._update(physicsScene.fixedTimeStep);
      expect(updateMass).toHaveBeenCalledTimes(2);
      expect(updateMass).toHaveBeenLastCalledWith(12, null, null, null);
    });

    it("recycles more than 256 trimmed raycastAll HitResults and drains the pool on gc", () => {
      enginePhysX.resourceManager.gc();
      const pool = (PhysicsScene as any)._raycastHitPool as HitResult[];
      expect(pool).toHaveLength(0);

      const hits = Array.from({ length: 300 }, () => new HitResult());
      expect(physicsScene.raycastAll(new Ray(new Vector3(0, 500, 0), new Vector3(0, 1, 0)), 10, hits)).toBe(false);
      expect(hits).toHaveLength(0);
      expect(pool).toHaveLength(300);

      enginePhysX.resourceManager.gc();
      expect(pool).toHaveLength(0);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      for (const root of enginePhysX.sceneManager.activeScene.rootEntities.slice()) {
        root.destroy();
      }
      for (const scene of enginePhysX.sceneManager.scenes.slice(1)) {
        scene.destroy();
      }
      physicsScene.setColliderLayerCollision(Layer.Layer0, Layer.Layer2, true);
    });
  });
});
