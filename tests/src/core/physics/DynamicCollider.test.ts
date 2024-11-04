import {
  Engine,
  Entity,
  BoxColliderShape,
  CapsuleColliderShape,
  DynamicCollider,
  DynamicColliderConstraints,
  CollisionDetectionMode,
  StaticCollider,
  PlaneColliderShape
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("DynamicCollider", function () {
  let engine: Engine;
  let rootEntity: Entity;

  function addPlane(x: number, y: number, z: number) {
    const planeEntity = rootEntity.createChild("PlaneEntity");
    planeEntity.transform.setPosition(x, y, z);
    planeEntity.transform.setScale(20, 1, 20);

    const physicsPlane = new PlaneColliderShape();
    physicsPlane.material.dynamicFriction = 0;
    physicsPlane.material.staticFriction = 0;
    const planeCollider = planeEntity.addComponent(StaticCollider);
    planeCollider.addShape(physicsPlane);
    return planeEntity;
  }

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
  });

  it("addShape and removeShape", function () {
    const collider = rootEntity.createChild("entity").addComponent(DynamicCollider);
    const boxCollider = new BoxColliderShape();
    collider.addShape(new BoxColliderShape());
    collider.addShape(new CapsuleColliderShape());
    collider.addShape(boxCollider);
    expect(collider.shapes.length).to.equal(3);

    const collider2 = rootEntity.createChild("entity2").addComponent(DynamicCollider);
    collider2.addShape(boxCollider);

    expect(collider.shapes.length).to.equal(2);
    expect(collider2.shapes.length).to.equal(1);

    // Test that repeated add same shape to a collider.
    collider2.addShape(boxCollider);
    expect(collider2.shapes.length).to.equal(1);

    // Test that removeShape works correctly.
    collider.removeShape(boxCollider);
    collider2.removeShape(boxCollider);

    expect(collider.shapes.length).to.equal(2);
    expect(collider2.shapes.length).to.equal(0);

    // Test that clearShapes works correctly.
    collider.clearShapes();
    expect(collider.shapes.length).to.equal(0);
  });

  it("linearDamping", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -1, 0);
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    boxCollider.linearDamping = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).to.equal(1);

    boxCollider.linearDamping = 0.1;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).to.equal(0.90476);
  });

  it("angularDamping", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -1, 0);
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.angularVelocity = new Vector3(0, 1, 0);
    boxCollider.angularDamping = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(1);

    boxCollider.angularDamping = 0.1;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(0.90476);
  });

  it("linearVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -1, 0);
    const boxCollider = box.getComponent(DynamicCollider);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).to.equal(0);
    expect(formatValue(box.transform.position.x)).to.equal(0);

    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).to.equal(1);
    expect(formatValue(box.transform.position.x)).to.equal(1);
  });

  it("angularVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -1, 0);
    const boxCollider = box.getComponent(DynamicCollider);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(0);
    expect(formatValue(box.transform.rotation.y)).to.equal(0);

    boxCollider.angularVelocity = new Vector3(0, 1, 0);
    boxCollider.angularDamping = 0;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(1);
    expect(formatValue(box.transform.rotation.y)).to.equal(57.29577);
  });

  it("mass", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);

    boxCollider.mass = 1;
    expect(boxCollider.mass).to.equal(1);
    boxCollider.applyForce(new Vector3(1, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).to.equal(0.01667);
    boxCollider.mass = 0.01;
    expect(boxCollider.mass).to.equal(0.01);

    boxCollider.linearVelocity.x = 0;
    boxCollider.applyForce(new Vector3(1, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.linearVelocity.x)).to.equal(1.66667);
  });

  it("centerOfMass", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    const support = addBox(new Vector3(1, 1, 2), StaticCollider, new Vector3(0, -1.5, 0));
    boxCollider.centerOfMass = new Vector3(0, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(box.transform.rotation.z)).to.lessThan(0.1);

    boxCollider.wakeUp();
    boxCollider.centerOfMass = new Vector3(1, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(box.transform.rotation.z)).to.greaterThan(90);
  });

  it("inertiaTensor", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.inertiaTensor = new Vector3(0, 1, 0);
    boxCollider.applyTorque(new Vector3(0, 10, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.inertiaTensor.y)).to.equal(1);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(0.15853);

    boxCollider.inertiaTensor = new Vector3(0, 2, 0);
    boxCollider.angularVelocity.y = 0;
    boxCollider.applyTorque(new Vector3(0, 10, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.inertiaTensor.y)).to.equal(2);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(0.07927);
  });

  it("maxAngularVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.maxAngularVelocity = 100;
    boxCollider.angularDamping = 0;
    boxCollider.angularVelocity = new Vector3(0, 300, 0);
    expect(boxCollider.maxAngularVelocity).to.equal(100);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxCollider.angularVelocity.y)).to.equal(100);
  });

  it("maxDepenetrationVelocity", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const box2 = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -1, 0);
    const boxCollider = box.getComponent(DynamicCollider);
    const boxCollider2 = box2.getComponent(DynamicCollider);
    boxCollider.maxDepenetrationVelocity = boxCollider2.maxDepenetrationVelocity = 0;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.linearVelocity.x).to.equal(0);
    boxCollider2.maxDepenetrationVelocity = boxCollider.maxDepenetrationVelocity = 10;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(boxCollider.linearVelocity.x)).to.gt(1);
  });

  it("sleepThreshold", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -1, 0);
    const boxCollider = box.getComponent(DynamicCollider);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxCollider.isSleeping()).to.be.true;
    boxCollider.linearVelocity = new Vector3(1, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.isSleeping()).to.be.false;

    boxCollider.sleepThreshold = 100;
    expect(boxCollider.sleepThreshold).to.equal(100);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxCollider.isSleeping()).to.be.true;
  });

  it("solverIterations", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    expect(boxCollider.solverIterations).to.equal(4);
    boxCollider.solverIterations = 10;
    expect(boxCollider.solverIterations).to.equal(10);
  });

  it("isKinematic", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 1, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.isKinematic = true;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box.transform.position.y).to.equal(1);

    boxCollider.isKinematic = false;
    boxCollider.wakeUp();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box.transform.position.y).to.be.below(1);
  });

  it("constraints", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    expect(boxCollider.constraints).to.equal(DynamicColliderConstraints.None);

    boxCollider.constraints = DynamicColliderConstraints.FreezePositionX;
    boxCollider.applyForce(new Vector3(10, 0, 10));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box.transform.position.x).to.equal(0);
    expect(box.transform.position.z).to.greaterThan(0);
  });

  it("collisionDetectionMode", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    // @ts-ignore
    const physX = boxCollider._nativeCollider._physXPhysics._physX;

    boxCollider.collisionDetectionMode = CollisionDetectionMode.Discrete;
    // @ts-ignore
    expect(boxCollider._nativeCollider._pxActor.getRigidBodyFlags(physX.PxRigidBodyFlag.eENABLE_CCD)).toBeFalsy();

    boxCollider.collisionDetectionMode = CollisionDetectionMode.Continuous;
    // @ts-ignore
    expect(boxCollider._nativeCollider._pxActor.getRigidBodyFlags(physX.PxRigidBodyFlag.eENABLE_CCD)).toBeTruthy();

    boxCollider.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
    expect(
      // @ts-ignore
      boxCollider._nativeCollider._pxActor.getRigidBodyFlags(physX.PxRigidBodyFlag.eENABLE_CCD_FRICTION)
    ).toBeTruthy();

    boxCollider.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
    expect(
      // @ts-ignore
      boxCollider._nativeCollider._pxActor.getRigidBodyFlags(physX.PxRigidBodyFlag.eENABLE_SPECULATIVE_CCD)
    ).toBeTruthy();
  });

  it("sleep", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    expect(boxCollider.isSleeping()).to.be.false;
    boxCollider.sleep();
    expect(boxCollider.isSleeping()).to.be.true;
  });

  it("wakeUp", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.sleep();
    expect(boxCollider.isSleeping()).to.be.true;
    boxCollider.wakeUp();
    expect(boxCollider.isSleeping()).to.be.false;
  });

  it("applyForce", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);

    boxCollider.applyForce(new Vector3(30, 0, 30));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.x)).to.equal(0.5);
    expect(formatValue(box.transform.position.z)).to.equal(0.5);
  });

  it("applyTorque", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);

    boxCollider.applyTorque(new Vector3(0, 10, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.rotation.y)).to.equal(13.96578);
  });

  it("move", function () {
    const box = addBox(new Vector3(2, 2, 2), DynamicCollider, new Vector3(0, 0, 0));
    const boxCollider = box.getComponent(DynamicCollider);
    boxCollider.isKinematic = false;
    boxCollider.move(new Vector3(1, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.x)).to.equal(0);

    boxCollider.isKinematic = true;
    boxCollider.move(new Vector3(1, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.position.x)).to.equal(1);
  });

  it("destroy", function () {
    const entity = rootEntity.createChild("collider");
    const collider = entity.addComponent(DynamicCollider);
    collider.addShape(new BoxColliderShape());
    collider.destroy();

    // Test that destroy works correctly.
    expect(collider.shapes.length).to.eq(0);
    expect(entity.getComponent(DynamicCollider)).to.be.null;
  });
});
