import { createPhysics } from "../../utils/physics";
import { BoxCollider, Collision, ContactPoint, Rigidbody, Entity, Engine, Scene, Script } from "@galacean/engine-core";
import { Ray, Vector3 } from "@galacean/engine-math";
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

  it.each([false, true])(
    "keeps borrowed contacts intact while another scene advances (contacts: %s)",
    (hasContacts) => {
      const outerScene = engine.sceneManager.activeScene;
      const innerScene = new Scene(engine);
      let ranInner = false;
      if (hasContacts) {
        engine.sceneManager.addScene(innerScene);
        const innerBody = innerScene.createRootEntity();
        innerBody.transform.setPosition(100, 100, 100);
        innerBody.addComponent(BoxCollider);
        innerBody.addComponent(Rigidbody);
        innerBody.addComponent(
          class extends Script {
            override onCollisionEnter(): void {
              ranInner = true;
            }
          }
        );
        const innerBox = innerScene.createRootEntity();
        innerBox.transform.setPosition(100.3, 100, 100);
        innerBox.addComponent(BoxCollider);
      }
      const staticBox = addBox(new Vector3(1, 1, 1), null, new Vector3(0.3, 0, 0)).getComponent(BoxCollider);
      const body = addBox(new Vector3(1, 1, 1), Rigidbody, new Vector3());
      let ran = false;
      body.addComponent(
        class extends Script {
          override onCollisionEnter(collision: Collision): void {
            const count = collision.contactCount;
            const before: ContactPoint[] = [];
            expect(collision.getContacts(before)).toBe(count);
            const expected = before.map((contact) => ({
              position: contact.position.clone(),
              normal: contact.normal.clone(),
              impulse: contact.impulse.clone(),
              separation: contact.separation
            }));

            innerScene.physics._update(innerScene.physics.fixedTimeStep);
            expect(count).toBeGreaterThan(0);
            expect(collision.contactCount).toBe(count);
            expect(collision.collider).toBe(staticBox);

            const after: ContactPoint[] = [];
            expect(collision.getContacts(after)).toBe(count);
            for (let i = 0; i < count; i++) {
              expect(after[i].position.x).toBeCloseTo(expected[i].position.x, 5);
              expect(after[i].position.y).toBeCloseTo(expected[i].position.y, 5);
              expect(after[i].position.z).toBeCloseTo(expected[i].position.z, 5);
              expect(after[i].normal.x).toBeCloseTo(expected[i].normal.x, 5);
              expect(after[i].normal.y).toBeCloseTo(expected[i].normal.y, 5);
              expect(after[i].normal.z).toBeCloseTo(expected[i].normal.z, 5);
              expect(after[i].impulse.x).toBeCloseTo(expected[i].impulse.x, 5);
              expect(after[i].impulse.y).toBeCloseTo(expected[i].impulse.y, 5);
              expect(after[i].impulse.z).toBeCloseTo(expected[i].impulse.z, 5);
              expect(after[i].separation).toBeCloseTo(expected[i].separation, 5);
            }
            ran = true;
          }
        }
      );

      try {
        outerScene.physics._update(outerScene.physics.fixedTimeStep);
        expect(ran).toBe(true);
        expect(ranInner).toBe(hasContacts);
      } finally {
        innerScene.destroy();
      }
    }
  );

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

  it("does not accumulate shape removal entries in paused scenes with no active triggers", function () {
    const scene = engine.sceneManager.activeScene;
    const nativeScene = scene.physics._nativePhysicsScene as unknown as {
      _shapeChanges: Map<number, number>;
    };
    const ray = new Ray(new Vector3(0, 5, 0), new Vector3(0, -1, 0));
    scene.physics._update(scene.physics.fixedTimeStep);
    expect(nativeScene._shapeChanges.size).toBe(0);

    engine.pause();
    try {
      for (let i = 0; i < 64; i++) {
        const entity = rootEntity.createChild(`paused-box-${i}`);
        entity.addComponent(BoxCollider);
        expect(scene.physics.raycast(ray, 10)).toBe(true);
        entity.destroy();
        expect(scene.physics.raycast(ray, 10)).toBe(false);
      }
      engine.resourceManager.gc();
      expect(nativeScene._shapeChanges.size).toBe(0);
    } finally {
      engine.resume();
    }
  });
});
