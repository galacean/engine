import { Entity, DynamicCollider, StaticCollider, BoxColliderShape, Engine, SpringJoint } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("SpringJoint", function () {
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

  beforeAll(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(function () {
    rootEntity.clearChildren();
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -9.81, 0);
  });

  it("minDistance", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000;
    joint.damping = 1000;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.minDistance).eq(1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).eq(2);

    joint.minDistance = 1.1;
    expect(joint.minDistance).eq(1.1);
    collider2.wakeUp();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).greaterThan(2);
  });

  it("maxDistance", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1.1;
    joint.maxDistance = 5;
    joint.tolerance = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).eq(6);
  });

  it("tolerance", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1.1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.tolerance).eq(0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).eq(6);

    boxEntity2.transform.position.x = 2;
    joint.tolerance = 0.1;
    expect(joint.tolerance).eq(0.1);
    collider2.wakeUp();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.x).eq(2);
  });

  it("low stiffness", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10;
    joint.damping = 1;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.stiffness).eq(10);
    collider2.applyForce(new Vector3(100000, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(boxEntity2.transform.position.x).greaterThan(6);
  });

  it("high stiffness", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10000000000;
    joint.damping = 1;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.stiffness).eq(10000000000);
    collider2.applyForce(new Vector3(100000, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.x).lessThanOrEqual(6);
  });

  it("damping", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
    joint.anchor = new Vector3(-0.5, 0, 0);
    joint.connectedAnchor = new Vector3(0.5, 0, 0);
    joint.stiffness = 10;
    joint.damping = 1;
    joint.minDistance = 1;
    joint.maxDistance = 5;
    joint.tolerance = 0;
    expect(joint.damping).eq(1);
    collider2.applyForce(new Vector3(1000, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(collider2.linearVelocity.x).not.eq(0);

    boxEntity2.transform.position.x = 2;
    collider2.linearVelocity.x = 0;
    joint.damping = 10000;
    expect(joint.damping).eq(10000);
    collider2.applyForce(new Vector3(1000, 0, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(collider2.linearVelocity.x).eq(0);
  });

  it("clone", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    const joint = boxEntity2.addComponent(SpringJoint);
    const collider = (joint.connectedCollider = boxEntity.getComponent(DynamicCollider));
    collider.isKinematic = true;
    joint.autoConnectedAnchor = false;
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

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);

    expect(newBox.transform.position.x).eq(6);
  });

  it("inActive modification", function () {
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    box1.isActive = false;
    const springJoint = box1.addComponent(SpringJoint);
    springJoint.minDistance = 1;
    springJoint.maxDistance = 5;
    springJoint.tolerance = 0;
    springJoint.stiffness = 10000000000;
    springJoint.damping = 1;
    springJoint.destroy();
  });
});
