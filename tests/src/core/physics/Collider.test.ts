import {
  BoxColliderShape,
  Collision,
  DynamicCollider,
  Entity,
  Layer,
  PlaneColliderShape,
  Script,
  SphereColliderShape,
  StaticCollider
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { LitePhysics } from "@galacean/engine-physics-lite";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { vi, describe, beforeAll, beforeEach, expect, it, afterEach } from "vitest";

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

class CollisionDetectionScript extends Script {
  collisionDetected = false;

  onTriggerEnter() {
    this.collisionDetected = true;
  }

  onCollisionEnter(other: Collision) {
    this.collisionDetected = true;
  }

  reset() {
    this.collisionDetected = false;
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

describe("Collider Layer Collision Tests", () => {
  describe("LitePhysics Layer Collision", () => {
    let engine: WebGLEngine;
    let rootEntity: Entity;
    let physics: LitePhysics;

    beforeAll(async () => {
      physics = new LitePhysics();
      engine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics
      });
      rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
    });

    it("should respect collision group settings", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(DynamicCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      collider2.addShape(shape2);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      const script = entity1.addComponent(CollisionDetectionScript);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
      expect(script.collisionDetected).toBe(true);

      script.reset();

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(false);

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, true);
    });

    it("should handle collision groups correctly when entity layer changes", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(DynamicCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      collider2.addShape(shape2);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      const script = entity1.addComponent(CollisionDetectionScript);

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(false);

      script.reset();

      entity2.layer = Layer.Layer3;
      entity2.layer = Layer.Layer3;

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(true);

      // 恢复默认设置
      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, true);
    });

    it("should handle manual collision group setting in LitePhysics", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(StaticCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      shape2.isTrigger = true;
      collider2.addShape(shape2);

      const script = entity2.addComponent(CollisionDetectionScript);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
      expect(script.collisionDetected).toBe(true);

      script.reset();

      collider1.syncCollisionGroupByLayer = false;
      collider1.collisionGroup = 10;

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(10, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(false);

      // 恢复默认设置
      engine.sceneManager.activeScene.physics.setColliderGroupCollision(10, 2, true);
      collider1.syncCollisionGroupByLayer = true;
    });

    it("should update collision group when syncCollisionGroupByLayer is true in LitePhysics", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(StaticCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      shape2.isTrigger = true;
      collider2.addShape(shape2);

      const script = entity2.addComponent(CollisionDetectionScript);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      collider1.syncCollisionGroupByLayer = true;

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
      expect(script.collisionDetected).toBe(false);

      script.reset();

      entity1.layer = Layer.Layer3;

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(true);

      // 恢复默认设置
      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, true);
    });

    it("should not update collision group when syncCollisionGroupByLayer is false in LitePhysics", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(StaticCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      shape2.isTrigger = true;
      collider2.addShape(shape2);

      const script = entity2.addComponent(CollisionDetectionScript);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      collider1.syncCollisionGroupByLayer = false;
      collider1.collisionGroup = 10;

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(10, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
      expect(script.collisionDetected).toBe(false);

      script.reset();

      entity1.layer = Layer.Layer3;

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(false);

      // 恢复默认设置
      engine.sceneManager.activeScene.physics.setColliderGroupCollision(10, 2, true);
      collider1.syncCollisionGroupByLayer = true;
    });

    afterEach(() => {
      const entities = rootEntity.children;
      for (let i = entities.length - 1; i >= 0; i--) {
        entities[i].destroy();
      }
    });
  });

  describe("PhysXPhysics Layer Collision", () => {
    let engine: WebGLEngine;
    let rootEntity: Entity;

    beforeAll(async () => {
      engine = await WebGLEngine.create({
        canvas: document.createElement("canvas"),
        physics: new PhysXPhysics()
      });
      rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
    });

    it("should respect collision group settings", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(StaticCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      collider2.addShape(shape2);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      const script = entity1.addComponent(CollisionDetectionScript);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);
      expect(script.collisionDetected).toBe(true);

      script.reset();

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(false);

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, true);
    });

    it("should handle collision groups correctly when entity layer changes", () => {
      const entity1 = rootEntity.createChild("entity1");
      const entity2 = rootEntity.createChild("entity2");

      entity1.transform.position = new Vector3(0, 0, 0);
      entity2.transform.position = new Vector3(0, 0, 0);

      const collider1 = entity1.addComponent(DynamicCollider);
      const shape1 = new BoxColliderShape();
      shape1.size = new Vector3(1, 1, 1);
      collider1.addShape(shape1);

      const collider2 = entity2.addComponent(DynamicCollider);
      const shape2 = new BoxColliderShape();
      shape2.size = new Vector3(1, 1, 1);
      collider2.addShape(shape2);

      entity1.layer = Layer.Layer1;
      entity2.layer = Layer.Layer2;

      const script = entity1.addComponent(CollisionDetectionScript);

      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, false);

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(false);

      script.reset();

      entity2.layer = Layer.Layer3;
      entity2.layer = Layer.Layer3;

      // @ts-ignore
      engine.sceneManager.activeScene.physics._update(1);

      expect(script.collisionDetected).toBe(true);

      // 恢复默认设置
      engine.sceneManager.activeScene.physics.setColliderGroupCollision(1, 2, true);
    });

    afterEach(() => {
      const entities = rootEntity.children;
      for (let i = entities.length - 1; i >= 0; i--) {
        entities[i].destroy();
      }
    });
  });
});
