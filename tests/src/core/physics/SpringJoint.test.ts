import { createPhysics } from "../../utils/physics";
import { Entity, PhysicsMaterial, Rigidbody, BoxCollider, Engine, SpringJoint } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, afterAll, beforeEach, expect, it } from "vitest";

describe("SpringJoint", function () {
  let rootEntity: Entity;
  let engine: Engine;

  function addBox(cubeSize: Vector3, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = boxEntity.addComponent(BoxCollider);
    const material = new PhysicsMaterial(engine);
    material.dynamicFriction = 0;
    material.staticFriction = 0;
    physicsBox.material = material;
    physicsBox.size = cubeSize;
    boxEntity.addComponent(Rigidbody);
    return boxEntity;
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

  it("minDistance", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000;
    joint.damping = 1000;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.minDistance).eq(1);

    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).eq(2);

    joint.minDistance = 1.1;
    expect(joint.minDistance).eq(1.1);
    collider2.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).greaterThan(2);
  });

  it("maxDistance", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1.1;
    joint.maxDistance = 5;
    joint.tolerance = 0;

    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).eq(6);
  });

  it("tolerance", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1.1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.tolerance).eq(0);

    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).eq(6);

    boxEntity2.transform.position.x = 2;
    joint.tolerance = 0.1;
    expect(joint.tolerance).eq(0.1);
    collider2.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.x).eq(2);
  });

  it("low stiffness", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10;
    joint.damping = 1;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.stiffness).eq(10);
    collider2.applyForce(new Vector3(100000, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).greaterThan(6);
  });

  it("high stiffness", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.stiffness).eq(10000000000);
    collider2.applyForce(new Vector3(100000, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.x).lessThanOrEqual(6);
  });

  it("damping", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10;
    joint.damping = 1;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.damping).eq(1);
    collider2.applyForce(new Vector3(1000, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);

    expect(collider2.linearVelocity.x).not.eq(0);

    boxEntity2.transform.position.x = 2;
    collider2.linearVelocity.x = 0;
    joint.damping = 10000;
    expect(joint.damping).eq(10000);
    collider2.applyForce(new Vector3(1000, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(collider2.linearVelocity.x).eq(0);
  });

  it("clone", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(Rigidbody);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedBody = boxEntity.getComponent(Rigidbody));
    collider.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1.1;
    joint.maxDistance = 5;
    joint.tolerance = 0;

    const newBox = boxEntity2.clone();
    boxEntity2.isActive = false;
    rootEntity.addChild(newBox);

    engine.sceneManager.activeScene.physics._update(1);

    expect(newBox.transform.position.x).eq(6);
  });

  it("applies spring settings configured while inactive when the Entity enters simulation", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    box1.isActive = false;
    const springJoint = box1.addComponent(SpringJoint);
    springJoint.minDistance = 1;
    springJoint.maxDistance = 5;
    springJoint.tolerance = 0;
    springJoint.stiffness = 10000000000;
    springJoint.damping = 1;
    springJoint.automaticConnectedAnchor = false;
    springJoint.connectedAnchor.set(0, 0, 0);
    box1.transform.position.y = 10;
    box1.isActive = true;
    engine.sceneManager.activeScene.physics._update(1);
    expect(box1.transform.position.y).toBeCloseTo(5, 4);
    springJoint.destroy();
    expect(box1.getComponent(SpringJoint)).toBeNull();
  });

  it("wakes sleeping bodies automatically when active SpringJoint parameters change", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    anchor.getComponent(Rigidbody)!.isKinematic = true;

    const box = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(SpringJoint);
    joint.connectedBody = anchor.getComponent(Rigidbody)!;
    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000;
    joint.damping = 1000;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;

    engine.sceneManager.activeScene.physics._update(1);
    body.sleep();
    expect(body.isSleeping()).toBe(true);

    // Let the body sleep first so the resulting movement verifies the joint's wake-up.
    joint.minDistance = 2;
    expect(body.isSleeping()).toBe(false);
    engine.sceneManager.activeScene.physics._update(0.5);
    expect(box.transform.position.x).toBeGreaterThan(2.5);

    body.sleep();
    joint.maxDistance = 2.1;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.stiffness = 5000;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.damping = 500;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.tolerance = 0.05;
    expect(body.isSleeping()).toBe(false);
  });
});
