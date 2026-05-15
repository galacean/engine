import {
  BoxColliderShape,
  DynamicCollider,
  DynamicColliderConstraints,
  Entity,
  Engine,
  Script,
  StaticCollider
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Collision } from "packages/core/types/physics/Collision";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("Collision", function () {
  let rootEntity: Entity;
  let engine: Engine;

  function addBox(cubeSize: Vector3, type: typeof DynamicCollider | typeof StaticCollider, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = new BoxColliderShape();
    physicsBox.material.dynamicFriction = 0;
    physicsBox.material.staticFriction = 0;
    physicsBox.size = cubeSize;
    const boxCollider = boxEntity.addComponent(type);
    boxCollider.addShape(physicsBox);
    return boxEntity;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(function () {
    rootEntity.clearChildren();
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -9.81, 0);
  });

  it("collision shape1", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box1.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.shape).toBe(box2.getComponent(DynamicCollider).shapes[0]);
            expect(other.contactCount).toBe(3);
            const contacts = [];
            other.getContacts(contacts);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(-1);
            expect(formatValue(contacts[0].impulse.x)).toBe(-7.38326);

            done();
          }
        }
      );

      box1.getComponent(DynamicCollider).applyForce(new Vector3(1000, 0, 0));
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("collision shape1 inv", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box1.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.shape).toBe(box2.getComponent(DynamicCollider).shapes[0]);
            expect(other.contactCount).toBe(3);
            const contacts = [];
            other.getContacts(contacts);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(-1);
            expect(formatValue(contacts[0].impulse.x)).toBe(-7.38326);

            done();
          }
        }
      );

      box1.getComponent(DynamicCollider).applyForce(new Vector3(1000, 0, 0));
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("collision shape2", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box2.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.shape).toBe(box1.getComponent(DynamicCollider).shapes[0]);
            expect(other.contactCount).toBe(3);
            const contacts = [];
            other.getContacts(contacts);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(1);
            expect(formatValue(contacts[0].impulse.x)).toBe(7.38326);

            done();
          }
        }
      );

      box1.getComponent(DynamicCollider).applyForce(new Vector3(1000, 0, 0));
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("collision shape2 inv", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box2.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.shape).toBe(box1.getComponent(DynamicCollider).shapes[0]);
            expect(other.contactCount).toBe(3);
            const contacts = [];
            other.getContacts(contacts);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(1);
            expect(formatValue(contacts[0].impulse.x)).toBe(7.38326);

            done();
          }
        }
      );

      box1.getComponent(DynamicCollider).applyForce(new Vector3(1000, 0, 0));
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────────
  // Kinematic-pair collision callback (3D billiard aim-line use case).
  // PhysX 4.x defaults suppress kineKine + staticKine pairs. SceneBinding already
  // sets kineKineFilteringMode = eKEEP and staticKineFilteringMode = eKEEP, and
  // filter shader returns eNOTIFY_TOUCH_FOUND/PERSISTS/LOST for all pairs.
  // Question: does the kinematic pair actually fire onCollisionEnter when a
  // kinematic actor is moved into another actor's volume via setWorldTransform
  // (i.e. setGlobalPose teleport, NOT setKinematicTarget)?
  //
  // Cocos parity expectation: yes — Cocos PhysX backend fires onCollisionEnter
  // for kinematic↔dynamic and kinematic↔kinematic pairs on overlap.
  // ──────────────────────────────────────────────────────────────────────────────

  function probeKinematicCallback(opts: {
    aKine: boolean;
    bKine: boolean;
    timeoutMs?: number;
  }): Promise<{ fired: boolean }> {
    return new Promise((resolve) => {
      engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
      const boxA = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));
      const boxB = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(3, 0, 0));
      const colA = boxA.getComponent(DynamicCollider);
      const colB = boxB.getComponent(DynamicCollider);
      colA.useGravity = false;
      colB.useGravity = false;
      colA.isKinematic = opts.aKine;
      colB.isKinematic = opts.bKine;

      let fired = false;
      boxA.addComponent(
        class extends Script {
          onCollisionEnter(_other: Collision): void {
            fired = true;
            resolve({ fired: true });
          }
        }
      );

      // Step a few frames to let PhysX settle initial state.
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // Teleport B onto A → expect onCollisionEnter.
      boxB.transform.setPosition(-3, 0, 0);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);

      if (!fired) resolve({ fired: false });
    });
  }

  // Probes that the standard transform→PhysX sync path routes correctly for
  // kinematic actors. With the fix in PhysXDynamicCollider.setWorldTransform,
  // moving a kinematic actor via transform.setPosition() goes through
  // setKinematicTarget(), which lets PhysX detect contact and fire the callback.
  it("kinematic-kinematic overlap via transform.setPosition fires onCollisionEnter", async function () {
    const r = await probeKinematicCallback({ aKine: true, bKine: true });
    expect(r.fired).toBe(true);
  });

  it("kinematic-dynamic overlap via transform.setPosition fires onCollisionEnter", async function () {
    const r = await probeKinematicCallback({ aKine: true, bKine: false });
    expect(r.fired).toBe(true);
  });

  it("dynamic-dynamic overlap via transform.setPosition fires onCollisionEnter", async function () {
    const r = await probeKinematicCallback({ aKine: false, bKine: false });
    expect(r.fired).toBe(true);
  });

  // Probe whether "dynamic actor + freeze 6 constraints + teleport via setGlobalPose"
  // can substitute for a kinematic actor and still trigger contact callbacks.
  // This is the proposed fix path for the 3D billiard hitBall: ditch kinematic,
  // use a fully-frozen dynamic actor that is moved via setWorldPosition.
  it("HYPOTHESIS: kine-kine fires onCollisionEnter when moved via setKinematicTarget (not setGlobalPose)", function () {
    return new Promise<void>((resolve, reject) => {
      engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
      const boxA = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));
      const boxB = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(3, 0, 0));
      const colA = boxA.getComponent(DynamicCollider);
      const colB = boxB.getComponent(DynamicCollider);
      colA.useGravity = false;
      colB.useGravity = false;
      colA.isKinematic = true;
      colB.isKinematic = true;

      let fired = false;
      boxA.addComponent(
        class extends Script {
          onCollisionEnter(_other: Collision): void {
            fired = true;
            resolve();
          }
        }
      );

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // Move B onto A via DynamicCollider.move() — this internally calls setKinematicTarget.
      colB.move(new Vector3(-3, 0, 0));
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);

      if (!fired) reject(new Error("kine-kine setKinematicTarget did NOT fire onCollisionEnter"));
    });
  });

  it("dynamic + frozen-6 + teleport: overlap fires onCollisionEnter (fix candidate)", function () {
    return new Promise<void>((resolve) => {
      engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
      const boxA = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-3, 0, 0));
      const boxB = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(3, 0, 0));
      const colA = boxA.getComponent(DynamicCollider);
      const colB = boxB.getComponent(DynamicCollider);
      // Both fully frozen — emulates the cocos kinematic semantics (no gravity, no movement).
      const FREEZE_ALL =
        DynamicColliderConstraints.FreezePositionX |
        DynamicColliderConstraints.FreezePositionY |
        DynamicColliderConstraints.FreezePositionZ |
        DynamicColliderConstraints.FreezeRotationX |
        DynamicColliderConstraints.FreezeRotationY |
        DynamicColliderConstraints.FreezeRotationZ;
      colA.constraints = FREEZE_ALL;
      colB.constraints = FREEZE_ALL;
      colA.useGravity = false;
      colB.useGravity = false;
      colA.isKinematic = false;
      colB.isKinematic = false;

      let fired = false;
      boxA.addComponent(
        class extends Script {
          onCollisionEnter(_other: Collision): void {
            fired = true;
            resolve();
          }
        }
      );

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      boxB.transform.setPosition(-3, 0, 0);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1 / 60);

      if (!fired) {
        expect.fail("expected onCollisionEnter to fire for dynamic-frozen pair after teleport");
      }
    });
  });
});
