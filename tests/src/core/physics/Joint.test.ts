import {
  FixedJoint,
  HingeJoint,
  SpringJoint,
  JointLimits,
  JointMotor,
  Entity,
  DynamicCollider,
  StaticCollider,
  BoxColliderShape,
  Engine
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector3 } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

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
    expect(joint.anchor).to.deep.include({ x: 0, y: 0, z: 0 });

    expect(joint.connectedAnchor).to.deep.include({ x: 1, y: 4, z: 1 });
    expect(joint.connectedCollider).to.eq(null);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box.transform.position).to.deep.include({ x: 1, y: 4, z: 1 });

    joint.anchor = new Vector3(0, -0.5, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position).to.deep.include({ x: 1, y: 4.5, z: 1 });
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

    expect(box1.transform.position).to.deep.include({ x: 3, y: 2, z: 3 });

    joint.anchor = new Vector3(0, 1, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box1.transform.position).to.deep.include({ x: 3, y: 1.5, z: 3 });
  });

  it("autoConnectedAnchor", function () {
    const box = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(4, 4, 4));

    // No connectedCollider
    const joint = box.addComponent(FixedJoint);
    joint.autoConnectedAnchor = true;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).to.deep.include({ x: 4, y: 4, z: 4 });
    expect(box.transform.position).to.deep.include({ x: 4, y: 4, z: 4 });

    joint.anchor = new Vector3(0, -1, 0);

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).to.deep.include({ x: 4, y: 3, z: 4 });
    expect(box.transform.position).to.deep.include({ x: 4, y: 4, z: 4 });

    // Has connectedCollider
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const box2Collider = box2.getComponent(DynamicCollider);
    box2Collider.isKinematic = true;
    joint.connectedCollider = box2Collider;

    expect(joint.connectedAnchor).to.deep.include({ x: 4, y: -2, z: 4 });
    expect(box.transform.position).to.deep.include({ x: 4, y: 4, z: 4 });
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

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).to.eq(0);

    fixedJoint.massScale = 10.01;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).to.lessThan(0);
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

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box2Collider.linearVelocity.y).to.eq(0);

    fixedJoint.connectedMassScale = 10.01;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).to.lessThan(0);
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
    expect(formatValue(box2Collider.angularVelocity.y)).to.eq(8.32635);

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
    expect(formatValue(box2Collider.angularVelocity.y)).to.closeTo(1.513, 0.001);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box2Collider.inertiaTensor.y = 1;
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    fixedJoint.inertiaScale = 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).to.closeTo(1.513, 0.001);
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
    expect(formatValue(box2Collider.angularVelocity.y)).to.eq(8.32635);

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

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).to.eq(0);

    fixedJoint.breakForce = 0.9;
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).to.lessThan(0);
  });

  it("breakTorque", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(1, 1, 0));
    const fixedJoint = box1.addComponent(FixedJoint);
    const box2Collider = box2.getComponent(DynamicCollider);
    const box1Collider = box1.getComponent(DynamicCollider);
    fixedJoint.connectedCollider = box2.getComponent(DynamicCollider);
    fixedJoint.autoConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(10);
    expect(Math.abs(box1.transform.position.z)).to.lessThan(1);

    fixedJoint.breakTorque = 1;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(10);
    expect(Math.abs(box1.transform.position.z)).to.greaterThan(1);
  });

  // it("connectedMassScale", function () {
  //   const box1 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 1, 0));
  //   const box2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(1, 1, 0));
  //   const box3 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(-1, 1, 0));
  //   const support = addBox(new Vector3(1, 1, 1), StaticCollider, new Vector3(0, 0, 0));
  //   const fixedJoint = box1.addComponent(FixedJoint);
  //   const fixedJoint2 = box3.addComponent(FixedJoint);
  //   fixedJoint.connectedCollider = box2.getComponent(DynamicCollider);
  //   fixedJoint2.connectedCollider = box1.getComponent(DynamicCollider);
  //   fixedJoint.autoConnectedAnchor = true;
  //   fixedJoint.automaticInertiaTensor = true;
  //   fixedJoint2.autoConnectedAnchor = true;
  //   fixedJoint2.automaticInertiaTensor = true;

  //   fixedJoint.connectedMassScale = 10;
  //   box3.getComponent(DynamicCollider).mass = 10;

  //   // @ts-ignore
  //   engine.sceneManager.activeScene.physics._update(1);
  //   expect(formatValue(box3.transform.position.y - box2.transform.position.y)).closeTo(0, 0.01);
  // });

  // it("Hinge Joint", function () {
  //   const entity = root.createChild("HingeJoint");
  //   // Must add a collider to the entity before add a joint.
  //   entity.addComponent(DynamicCollider);
  //   const joint = entity.addComponent(HingeJoint);

  //   // Test that axis works correctly.
  //   let tempVec3 = joint.axis;
  //   joint.axis = tempVec3;
  //   expect(joint.axis).to.deep.eq(tempVec3);

  //   tempVec3 = new Vector3(1, 2, 3);
  //   joint.axis = tempVec3.clone();
  //   const n = tempVec3.normalize();
  //   expect(joint.axis).to.deep.include({ x: n.x, y: n.y, z: n.z });

  //   // Test that swingOffset works correctly.
  //   tempVec3 = joint.swingOffset;
  //   joint.swingOffset = tempVec3;
  //   expect(joint.swingOffset).to.deep.eq(tempVec3);

  //   joint.swingOffset = new Vector3(1, 2, 3);
  //   expect(joint.swingOffset).to.deep.include({ x: 1, y: 2, z: 3 });

  //   // Test that angle works correctly.
  //   expect(function () {
  //     let tempAngle = joint.angle;
  //     expect(joint.angle).to.eq(tempAngle);
  //   }).to.not.throw();

  //   // Test that velocity works correctly.
  //   expect(function () {
  //     let tempVelocity = joint.velocity;
  //     expect(joint.velocity).to.deep.eq(tempVelocity);
  //   }).to.not.throw();

  //   // Test that useLimits works correctly.
  //   let tempUseLimits = joint.useLimits;
  //   joint.useLimits = tempUseLimits;
  //   expect(joint.useLimits).to.eq(tempUseLimits);

  //   joint.useLimits = true;
  //   expect(joint.useLimits).to.eq(true);

  //   joint.useLimits = false;
  //   expect(joint.useLimits).to.eq(false);

  //   // Test that useMotor works correctly.
  //   let tempUseMotor = joint.useMotor;
  //   joint.useMotor = tempUseMotor;
  //   expect(joint.useMotor).to.eq(tempUseMotor);

  //   joint.useMotor = true;
  //   expect(joint.useMotor).to.eq(true);

  //   joint.useMotor = false;
  //   expect(joint.useMotor).to.eq(false);

  //   // Test that useSpring works correctly.
  //   let tempSpring = joint.useSpring;
  //   joint.useSpring = tempSpring;
  //   expect(joint.useSpring).to.eq(tempSpring);

  //   joint.useSpring = true;
  //   expect(joint.useSpring).to.eq(true);

  //   joint.useSpring = false;
  //   expect(joint.useSpring).to.eq(false);

  //   // Test that motor works correctly.
  //   let tempMotor = joint.motor;
  //   joint.motor = tempMotor;
  //   expect(joint.motor).to.be.eq(tempMotor);

  //   tempMotor = new JointMotor();
  //   tempMotor.forceLimit = 10;
  //   tempMotor.freeSpin = true;
  //   tempMotor.targetVelocity = 10;
  //   tempMotor.gearRation = 10;
  //   expect(function () {
  //     joint.motor = tempMotor;
  //     expect(joint.motor).to.be.eq(tempMotor);
  //   }).to.not.throw();

  //   // Test that limits works correctly.
  //   let tempLimits = joint.limits;
  //   joint.limits = tempLimits;
  //   expect(joint.limits).to.be.eq(tempLimits);

  //   tempLimits = new JointLimits();
  //   tempLimits.contactDistance = -10;
  //   tempLimits.damping = 0;
  //   tempLimits.max = 10;
  //   tempLimits.min = -10;
  //   tempLimits.stiffness = 0;
  //   expect(function () {
  //     joint.limits = tempLimits;
  //     expect(joint.limits).to.be.eq(tempLimits);
  //   }).to.not.throw();

  //   // Test that setSoftLimit works correctly.
  //   joint.useSpring = true;
  //   tempLimits = new JointLimits();
  //   tempLimits.contactDistance = -10;
  //   tempLimits.damping = 0;
  //   tempLimits.max = 10;
  //   tempLimits.min = -10;
  //   tempLimits.stiffness = 0;
  //   expect(function () {
  //     joint.limits = tempLimits;
  //     expect(joint.limits).to.be.eq(tempLimits);
  //   }).to.not.throw();
  // });

  // it("Spring Joint", function () {
  //   const entity = root.createChild("SpringJoint");
  //   // Must add a collider to the entity before add a joint.
  //   entity.addComponent(DynamicCollider);
  //   const joint = entity.addComponent(SpringJoint);

  //   // Test that swingOffset works correctly.
  //   let tempVec3 = joint.swingOffset;
  //   joint.swingOffset = tempVec3;
  //   expect(joint.swingOffset).to.deep.eq(tempVec3);

  //   joint.swingOffset = new Vector3(1, 2, 3);
  //   expect(joint.swingOffset).to.deep.include({ x: 1, y: 2, z: 3 });

  //   // Test that minDistance works correctly.
  //   let tempMinDistance = joint.minDistance;
  //   joint.minDistance = tempMinDistance;
  //   expect(joint.minDistance).to.eq(tempMinDistance);

  //   joint.minDistance = Number.MAX_VALUE;
  //   expect(joint.minDistance).to.eq(Number.MAX_VALUE);

  //   // Test that maxDistance works correctly.
  //   let tempMaxDistance = joint.maxDistance;
  //   joint.maxDistance = tempMaxDistance;
  //   expect(joint.maxDistance).to.eq(tempMaxDistance);

  //   joint.maxDistance = Number.MIN_VALUE;
  //   expect(joint.maxDistance).to.eq(Number.MIN_VALUE);

  //   // Test that tolerance works correctly.
  //   let tempTolerance = joint.tolerance;
  //   joint.tolerance = tempTolerance;
  //   expect(joint.tolerance).to.eq(tempTolerance);

  //   joint.tolerance = 0.5;
  //   expect(joint.tolerance).to.eq(0.5);

  //   joint.tolerance = -10;
  //   expect(joint.tolerance).to.eq(-10);

  //   // Test that stiffness works correctly.
  //   let tempStiffness = joint.stiffness;
  //   joint.stiffness = tempStiffness;
  //   expect(joint.stiffness).to.eq(tempStiffness);

  //   joint.stiffness = 0.5;
  //   expect(joint.stiffness).to.eq(0.5);

  //   joint.stiffness = -10;
  //   expect(joint.stiffness).to.eq(-10);

  //   // Test that damping works correctly.
  //   let tempDamping = joint.damping;
  //   joint.damping = tempDamping;
  //   expect(joint.damping).to.eq(tempDamping);

  //   joint.damping = 0.5;
  //   expect(joint.damping).to.eq(0.5);

  //   joint.damping = -10;
  //   expect(joint.damping).to.eq(-10);
  // });
});
