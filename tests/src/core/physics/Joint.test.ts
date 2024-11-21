import { FixedJoint, Entity, DynamicCollider, StaticCollider, BoxColliderShape, Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { vi, describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("Joint", function () {
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

  it("connected to null", function () {
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));

    const joint = box.addComponent(FixedJoint);

    joint.autoConnectedAnchor = false;
    joint.connectedAnchor = new Vector3(1, 4, 1);
    expect(joint.anchor).deep.include({ x: 0, y: 0, z: 0 });

    expect(joint.connectedAnchor).deep.include({ x: 1, y: 4, z: 1 });
    expect(joint.connectedCollider).eq(null);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box.transform.position).deep.include({ x: 1, y: 4, z: 1 });

    joint.anchor = new Vector3(0, -0.5, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position).deep.include({ x: 1, y: 4.5, z: 1 });
  });

  it("connected to another collider", function () {
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(1, 0, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(3, 3, 3));

    const box2Collider = box2.getComponent(DynamicCollider);
    box2Collider.isKinematic = true;

    const joint = box1.addComponent(FixedJoint);
    joint.autoConnectedAnchor = false;
    joint.connectedCollider = box2.getComponent(DynamicCollider);
    joint.anchor = new Vector3(0, 0.5, 0);
    joint.connectedAnchor = new Vector3(0, -0.5, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box1.transform.position).deep.include({ x: 3, y: 2, z: 3 });

    joint.anchor = new Vector3(0, 1, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box1.transform.position).deep.include({ x: 3, y: 1.5, z: 3 });
  });

  it("autoConnectedAnchor", function () {
    const consoleWarnSpy = vi.spyOn(console, "warn");
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(4, 4, 4));

    // No connectedCollider
    const joint = box.addComponent(FixedJoint);
    joint.autoConnectedAnchor = true;
    joint.connectedAnchor = new Vector3(1, 1, 1);
    expect(consoleWarnSpy).toBeCalledTimes(1);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 4, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    joint.anchor = new Vector3(0, -1, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 3, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    // Has connectedCollider
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2Collider = box2.getComponent(DynamicCollider);
    box2Collider.isKinematic = true;
    joint.connectedCollider = box2Collider;

    expect(joint.connectedAnchor).deep.include({ x: 4, y: -2, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    // Change connectedCollider
    const box3 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 3, 0));
    const box3Collider = box3.getComponent(DynamicCollider);
    box3Collider.isKinematic = true;
    joint.connectedCollider = box3Collider;

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 0, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });
  });

  it("massScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
    const box1Collider = box1.getComponent(DynamicCollider);
    const box2Collider = box2.getComponent(DynamicCollider);
    box1Collider.isKinematic = true;
    const fixedJoint = box2.addComponent(FixedJoint);
    fixedJoint.connectedCollider = box1.getComponent(DynamicCollider);
    fixedJoint.autoConnectedAnchor = true;
    fixedJoint.breakForce = 10;

    fixedJoint.massScale = 10;
    expect(fixedJoint.massScale).eq(10);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).eq(0);

    fixedJoint.massScale = 10.01;
    expect(fixedJoint.massScale).eq(10.01);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).lessThan(0);
  });

  it("connectedMassScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
    const box1Collider = box1.getComponent(DynamicCollider);
    const box2Collider = box2.getComponent(DynamicCollider);
    box1Collider.isKinematic = true;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.connectedCollider = box2.getComponent(DynamicCollider);
    fixedJoint.autoConnectedAnchor = true;
    fixedJoint.breakForce = 10;

    fixedJoint.connectedMassScale = 10;
    expect(fixedJoint.connectedMassScale).eq(10);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box2Collider.linearVelocity.y).eq(0);

    fixedJoint.connectedMassScale = 10.01;
    expect(fixedJoint.connectedMassScale).eq(10.01);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).lessThan(0);
  });

  it("inertiaScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(1, 1, 0));
    const fixedJoint = box2.addComponent(FixedJoint);
    const box2Collider = box2.getComponent(DynamicCollider);
    const box1Collider = (fixedJoint.connectedCollider = box1.getComponent(DynamicCollider));
    box1Collider.automaticInertiaTensor = false;
    box2Collider.automaticInertiaTensor = false;
    box1Collider.mass = 0.00001;
    box1Collider.inertiaTensor = new Vector3(1, 1, 1);
    box2Collider.inertiaTensor = new Vector3(1, 1, 1);
    fixedJoint.autoConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).eq(8.32635);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    box2Collider.inertiaTensor.y *= 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(1.513, 0.001);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box2Collider.inertiaTensor.y = 1;
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    fixedJoint.inertiaScale = 10;
    expect(fixedJoint.inertiaScale).eq(10);
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(1.513, 0.001);
  });

  it("connectedInertiaScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(1, 1, 0));
    const fixedJoint = box1.addComponent(FixedJoint);
    const box1Collider = box1.getComponent(DynamicCollider);
    const box2Collider = (fixedJoint.connectedCollider = box2.getComponent(DynamicCollider));
    box1Collider.automaticInertiaTensor = false;
    box2Collider.automaticInertiaTensor = false;
    box1Collider.mass = 0.00001;
    box1Collider.inertiaTensor = new Vector3(1, 1, 1);
    box2Collider.inertiaTensor = new Vector3(1, 1, 1);
    fixedJoint.autoConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).eq(8.32635);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    box2Collider.inertiaTensor.y *= 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(1.513, 0.001);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box2Collider.inertiaTensor.y = 1;
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    fixedJoint.connectedInertiaScale = 10;
    expect(fixedJoint.connectedInertiaScale).eq(10);
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(1.513, 0.001);
  });

  it("breakForce", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 2, 0));
    const box1Collider = box1.getComponent(DynamicCollider);
    const box2Collider = box2.getComponent(DynamicCollider);
    box1Collider.isKinematic = true;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.connectedCollider = box2.getComponent(DynamicCollider);
    fixedJoint.autoConnectedAnchor = true;
    fixedJoint.breakForce = 10;
    expect(fixedJoint.breakForce).eq(10);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).eq(0);

    fixedJoint.breakForce = 0.9;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).lessThan(0);
  });

  it("breakTorque", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(1, 1, 0));
    const fixedJoint = box1.addComponent(FixedJoint);
    const box2Collider = box2.getComponent(DynamicCollider);
    fixedJoint.connectedCollider = box2.getComponent(DynamicCollider);
    fixedJoint.autoConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(10);
    expect(Math.abs(box1.transform.position.z)).lessThan(1);

    fixedJoint.breakTorque = 1;
    expect(fixedJoint.breakTorque).eq(1);
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(10);
    expect(Math.abs(box1.transform.position.z)).greaterThan(1);
  });

  it("clone", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 2, 0));
    const box1Collider = box1.getComponent(DynamicCollider);
    const box2Collider = box2.getComponent(DynamicCollider);
    box1Collider.isKinematic = true;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.connectedCollider = box2Collider;
    fixedJoint.autoConnectedAnchor = true;
    fixedJoint.breakForce = 1;

    const newBox1 = box1.clone();
    rootEntity.addChild(newBox1);
    box1.isActive = false;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).eq(0);
  });

  it("inActive modification", function () {
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 2, 0));

    box1.isActive = false;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.autoConnectedAnchor = true;
    fixedJoint.autoConnectedAnchor = false;
    fixedJoint.connectedCollider = null;
    fixedJoint.connectedCollider = box2.getComponent(DynamicCollider);
    fixedJoint.anchor = new Vector3(0, 3, 0);
    fixedJoint.connectedAnchor = new Vector3(0, 3, 0);
    fixedJoint.massScale = 3;
    fixedJoint.inertiaScale = 3;
    fixedJoint.connectedMassScale = 3;
    fixedJoint.connectedInertiaScale = 3;
    fixedJoint.breakForce = 3;
    fixedJoint.breakTorque = 3;
    fixedJoint.destroy();
  });
});
