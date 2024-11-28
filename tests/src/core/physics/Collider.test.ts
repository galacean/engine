import {
  BoxColliderShape,
  DynamicCollider,
  Entity,
  PlaneColliderShape,
  Script,
  SphereColliderShape,
  StaticCollider
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { vi, describe, beforeAll, beforeEach, expect, it } from "vitest";

class CollisionScript extends Script {
  onTriggerEnter = vi.fn(CollisionScript.prototype.onTriggerEnter);
  onTriggerStay = vi.fn(CollisionScript.prototype.onTriggerStay);
  onTriggerExit = vi.fn(CollisionScript.prototype.onTriggerExit);
  onCollisionEnter = vi.fn(CollisionScript.prototype.onCollisionEnter);
  onCollisionStay = vi.fn(CollisionScript.prototype.onCollisionStay);
  onCollisionExit = vi.fn(CollisionScript.prototype.onCollisionExit);
}

class MoveScript extends Script {
  pos: Vector3 = new Vector3(0, 0, 0);
  vel: number = 1;
  velSign: number = 1;

  move() {
    if (this.pos.x >= 3) {
      this.velSign = -1;
    }
    if (this.pos.x <= -3) {
      this.velSign = 1;
    }
    this.pos.x += this.vel * this.velSign;
    this.entity.getComponent(DynamicCollider).move(this.pos);
  }
}

describe("physics collider test", function () {
  let engine: WebGLEngine;
  let rootEntity: Entity;
  let boxEntity: Entity;
  let sphereEntity: Entity;
  let physicsBox: BoxColliderShape;
  let physicsSphere: SphereColliderShape;

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

    boxEntity = rootEntity.createChild("BoxEntity");

    sphereEntity = rootEntity.createChild("SphereEntity");

    //ground
    const ground = rootEntity.createChild("ground");
    const physicsPlane = new PlaneColliderShape();
    const planeCollider = ground.addComponent(StaticCollider);
    planeCollider.addShape(physicsPlane);

    const cubeSize = 2.0;
    boxEntity.transform.position.x = 5;
    boxEntity.transform.position.y = cubeSize / 2;
    physicsBox = new BoxColliderShape();
    physicsBox.size = new Vector3(cubeSize, cubeSize, cubeSize);
    physicsBox.material.bounciness = 0.1;

    const radius = 1.25;
    sphereEntity.transform.position.x = 0;
    sphereEntity.transform.position.y = radius;
    physicsSphere = new SphereColliderShape();
    physicsSphere.radius = radius;

    CollisionScript.prototype.onCollisionEnter = vi.fn(CollisionScript.prototype.onCollisionEnter);
    CollisionScript.prototype.onCollisionStay = vi.fn(CollisionScript.prototype.onCollisionStay);
    CollisionScript.prototype.onCollisionExit = vi.fn(CollisionScript.prototype.onCollisionExit);
    CollisionScript.prototype.onTriggerEnter = vi.fn(CollisionScript.prototype.onTriggerEnter);
    CollisionScript.prototype.onTriggerStay = vi.fn(CollisionScript.prototype.onTriggerStay);
    CollisionScript.prototype.onTriggerExit = vi.fn(CollisionScript.prototype.onTriggerExit);
  });

  it("Dynamic vs Dynamic", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    boxCollider.addShape(physicsBox);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(collisionScript.onCollisionEnter.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionExit.mock.calls.length).eq(1);
    expect(boxEntity.transform.position.x).not.to.be.equal(5);
  });

  it("Dynamic vs Static", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(collisionScript.onCollisionEnter.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionExit.mock.calls.length).toBeGreaterThan(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Dynamic vs Kinematic", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    boxCollider.isKinematic = true;
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(collisionScript.onCollisionEnter.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionExit.mock.calls.length).toBeGreaterThan(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Kinematic vs Static", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.isKinematic = true;
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onCollisionEnter.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionExit.mock.calls.length).toBe(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Kinematic vs Kinematic", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    boxCollider.isKinematic = true;
    boxCollider.addShape(physicsBox);

    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.isKinematic = true;
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onCollisionEnter.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onCollisionExit.mock.calls.length).toBe(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Dynamic vs Static Trigger", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    physicsBox.isTrigger = true;
    boxCollider.addShape(physicsBox);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);

    expect(collisionScript.onTriggerEnter.mock.calls.length).toBe(1);
    expect(collisionScript.onTriggerStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onTriggerExit.mock.calls.length).toBe(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Kinematic vs Static Trigger", function () {
    const boxCollider = boxEntity.addComponent(StaticCollider);
    physicsBox.isTrigger = true;
    boxCollider.addShape(physicsBox);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    sphereCollider.isKinematic = true;
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onTriggerEnter.mock.calls.length).toBe(1);
    expect(collisionScript.onTriggerStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onTriggerExit.mock.calls.length).toBe(1);
    expect(boxEntity.transform.position.x).to.be.equal(5);
  });

  it("Dynamic vs Dynamic Trigger", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    physicsBox.isTrigger = true;
    const physicsBox2 = new BoxColliderShape();
    physicsBox2.size = new Vector3(2, 2, 2);
    boxCollider.addShape(physicsBox);
    boxCollider.addShape(physicsBox2);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    sphereCollider.applyForce(new Vector3(500, 0, 0));

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);

    expect(collisionScript.onTriggerEnter.mock.calls.length).toBe(1);
    expect(collisionScript.onTriggerStay.mock.calls.length).toBeGreaterThan(1);
    expect(collisionScript.onTriggerExit.mock.calls.length).toBe(1);
    expect(boxEntity.transform.position.x).not.to.be.equal(5);
  });

  it("Kinematic vs Dynamic Trigger", function () {
    const boxCollider = boxEntity.addComponent(DynamicCollider);
    physicsBox.isTrigger = true;
    const physicsBox2 = new BoxColliderShape();
    physicsBox2.size = new Vector3(2, 2, 2);
    boxCollider.addShape(physicsBox);
    boxCollider.addShape(physicsBox2);
    const sphereCollider = sphereEntity.addComponent(DynamicCollider);
    sphereCollider.addShape(physicsSphere);
    sphereCollider.isKinematic = true;
    const collisionScript = sphereEntity.addComponent(CollisionScript);
    const script = sphereEntity.addComponent(MoveScript);

    for (let i = 0; i < 5; i++) {
      script.move();
      //@ts-ignore
      engine.physicsManager._update(16);
    }
    expect(collisionScript.onTriggerEnter.mock.calls.length).toBe(1);
    expect(collisionScript.onTriggerStay.mock.calls.length).toBe(1);
    expect(collisionScript.onTriggerExit.mock.calls.length).toBe(1);
    expect(boxEntity.transform.position.x).not.to.be.equal(5);
  });

  it("clone StaticCollider", function () {
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0.5, 0));
    const collider = box.getComponent(DynamicCollider);
    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider.applyForce(new Vector3(1000, 0, 0));
    collider.shapes[0].material.dynamicFriction = 1;
    //@ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(collider.linearVelocity.x)).eq(0.97066);
    box.isActive = false;
    const ground = rootEntity.findByName("ground");
    const newGround = ground.clone();
    ground.isActive = false;
    rootEntity.addChild(newGround);
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0.5, 0));
    const collider2 = box2.getComponent(DynamicCollider);
    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.applyForce(new Vector3(1000, 0, 0));
    collider2.shapes[0].material.dynamicFriction = 1;
    //@ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(collider2.linearVelocity.x)).eq(0.97066);
  });

  it("clone DynamicCollider", function () {
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0.5, 0));
    const collider = box.getComponent(DynamicCollider);
    // Avoid the box rotating
    collider.automaticCenterOfMass = false;
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider.applyForce(new Vector3(1000, 0, 0));
    collider.shapes[0].material.dynamicFriction = 1;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(collider.linearVelocity.x)).eq(0.97066);

    const box2 = box.clone();
    rootEntity.addChild(box2);
    box2.transform.position.z = 2;
    const collider2 = box2.getComponent(DynamicCollider);
    expect(formatValue(collider2.linearVelocity.x)).eq(0.97066);
    expect(collider2.shapes[0].material.dynamicFriction).eq(1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(collider.linearVelocity.x)).eq(0);
    expect(formatValue(collider2.linearVelocity.x)).eq(0);
  });

  it("inActive modification", function () {
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0.5, 0));
    box.isActive = false;
    const collider = box.getComponent(DynamicCollider);
    const physicsBox = new BoxColliderShape();
    collider.addShape(physicsBox);
    expect(collider.shapes.length).eq(2);
    collider.removeShape(physicsBox);
    expect(collider.shapes.length).eq(1);
    collider.clearShapes();
    expect(collider.shapes.length).eq(0);
    collider.destroy();
    expect(box.getComponent(DynamicCollider)).to.null;
  });

  it("destroy", function () {
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0.5, 0));
    const collider = box.getComponent(DynamicCollider);
    collider.destroy();
    expect(collider.destroyed).to.eq(true);
    expect(box.getComponent(DynamicCollider)).to.null;
    expect(collider.shapes.length).eq(0);
  });
});
