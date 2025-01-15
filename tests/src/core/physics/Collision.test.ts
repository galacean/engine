import { BoxColliderShape, DynamicCollider, Entity, Engine, Script, StaticCollider } from "@galacean/engine-core";
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

    return new Promise<void>((done) => {
      box1.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.shape).toBe(box2.getComponent(DynamicCollider).shapes[0]);
            expect(other.contactCount).toBe(4);
            const contacts = [];
            other.getContacts(contacts);
            expect(contacts.length).toBe(4);
            expect(formatValue(contacts[0].position.x)).toBe(-0.27778);
            expect(formatValue(contacts[0].separation)).toBe(-0.22222);
            expect(formatValue(contacts[0].normal.x)).toBe(-1);
            expect(formatValue(contacts[0].impulse.x)).toBe(-2.93748);

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

    return new Promise<void>((done) => {
      box2.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.shape).toBe(box1.getComponent(DynamicCollider).shapes[0]);
            expect(other.contactCount).toBe(4);
            const contacts = [];
            other.getContacts(contacts);
            expect(contacts.length).toBe(4);
            expect(formatValue(contacts[0].position.x)).toBe(-0.27778);
            expect(formatValue(contacts[0].separation)).toBe(-0.22222);
            expect(formatValue(contacts[0].normal.x)).toBe(1);
            expect(formatValue(contacts[0].impulse.x)).toBe(2.93748);

            done();
          }
        }
      );

      box1.getComponent(DynamicCollider).applyForce(new Vector3(1000, 0, 0));
      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
    });
  });
});
