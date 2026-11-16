import { createPhysics } from "../../utils/physics";
import { BoxCollider, Collision, ContactPoint, Rigidbody, Entity, Engine, Script } from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine";
import { describe, beforeAll, afterAll, beforeEach, expect, it } from "vitest";

describe("Collision", function () {
  let rootEntity: Entity;
  let engine: Engine;

  function addBox(cubeSize: Vector3, type: typeof Rigidbody | null, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = boxEntity.addComponent(BoxCollider);
    const material = physicsBox.getInstanceMaterial();
    material.dynamicFriction = 0;
    material.staticFriction = 0;
    physicsBox.size = cubeSize;
    if (type) {
      boxEntity.addComponent(type);
    }
    return boxEntity;
  }

  function formatValue(value: number) {
    return Math.round(value * 100000) / 100000;
  }

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: createPhysics() });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  afterAll(() => engine.destroy());

  beforeEach(function () {
    while (rootEntity.children.length) {
      rootEntity.children[0].destroy();
    }
    engine.resourceManager.gc();
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -9.81, 0);
  });

  it("contacts on the moving body", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(-3, 0, 0));
    const box2 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(0, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box1.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.collider).toBe(box2.getComponent(BoxCollider));
            expect(other.contactCount).toBe(3);
            expect(other.selfCollider).toBe(this.entity.getComponent(BoxCollider));
            const contacts: ContactPoint[] = [];
            expect(other.getContacts(contacts)).toBe(other.contactCount);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(-1);
            expect(formatValue(contacts[0].impulse.x)).toBe(-7.38326);

            done();
          }
        }
      );

      box1.getComponent(Rigidbody).applyForce(new Vector3(1000, 0, 0));
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("contacts on the moving body created second", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box2 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(0, 0, 0));
    const box1 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(-3, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box1.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.collider).toBe(box2.getComponent(BoxCollider));
            expect(other.contactCount).toBe(3);
            expect(other.selfCollider).toBe(this.entity.getComponent(BoxCollider));
            const contacts: ContactPoint[] = [];
            expect(other.getContacts(contacts)).toBe(other.contactCount);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(-1);
            expect(formatValue(contacts[0].impulse.x)).toBe(-7.38326);

            done();
          }
        }
      );

      box1.getComponent(Rigidbody).applyForce(new Vector3(1000, 0, 0));
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("contacts on the stationary body", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(-3, 0, 0));
    const box2 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(0, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box2.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.collider).toBe(box1.getComponent(BoxCollider));
            expect(other.contactCount).toBe(3);
            expect(other.selfCollider).toBe(this.entity.getComponent(BoxCollider));
            const contacts: ContactPoint[] = [];
            expect(other.getContacts(contacts)).toBe(other.contactCount);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(1);
            expect(formatValue(contacts[0].impulse.x)).toBe(7.38326);

            done();
          }
        }
      );

      box1.getComponent(Rigidbody).applyForce(new Vector3(1000, 0, 0));
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("contacts on the stationary body created first", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box2 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(0, 0, 0));
    const box1 = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(-3, 0, 0));

    box1.transform.rotate(45, 45, 0);

    return new Promise<void>((done) => {
      box2.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.collider).toBe(box1.getComponent(BoxCollider));
            expect(other.contactCount).toBe(3);
            expect(other.selfCollider).toBe(this.entity.getComponent(BoxCollider));
            const contacts: ContactPoint[] = [];
            expect(other.getContacts(contacts)).toBe(other.contactCount);
            expect(contacts.length).toBe(3);
            expect(formatValue(contacts[0].position.x)).closeTo(-0.5, 0.1);
            expect(formatValue(contacts[0].separation)).toBe(-0.02022);
            expect(formatValue(contacts[0].normal.x)).toBe(1);
            expect(formatValue(contacts[0].impulse.x)).toBe(7.38326);

            done();
          }
        }
      );

      box1.getComponent(Rigidbody).applyForce(new Vector3(1000, 0, 0));
      engine.sceneManager.activeScene.physics._update(1);
    });
  });

  it("reports contact normal from the static collider toward the dynamic receiver", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const dynamicBox = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3(-3, 0, 0));
    const staticBox = addBox(new Vector3(1, 1, 1), null, new Vector3(0, 0, 0));

    return new Promise<void>((done) => {
      dynamicBox.addComponent(
        class extends Script {
          onCollisionEnter(other: Collision): void {
            expect(other.collider).toBe(staticBox.getComponent(BoxCollider));
            expect(other.selfCollider).toBe(this.entity.getComponent(BoxCollider));
            const contacts: ContactPoint[] = [];
            expect(other.getContacts(contacts)).toBe(other.contactCount);
            expect(contacts.length).toBeGreaterThan(0);
            expect(formatValue(contacts[0].normal.x)).toBe(-1);

            done();
          }
        }
      );

      dynamicBox.getComponent(Rigidbody).applyForce(new Vector3(1000, 0, 0));
      engine.sceneManager.activeScene.physics._update(1);
    });
  });
});
