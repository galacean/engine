import { createPhysics } from "../../utils/physics";
import { HingeJoint, JointLimits, JointMotor, Entity, Rigidbody, BoxCollider, Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, afterAll, beforeEach, expect, it } from "vitest";

describe("HingeJoint", function () {
  let rootEntity: Entity;
  let engine: Engine;

  function addBox(cubeSize: Vector3, pos: Vector3) {
    const boxEntity = rootEntity.createChild("BoxEntity");
    boxEntity.transform.setPosition(pos.x, pos.y, pos.z);

    const physicsBox = boxEntity.addComponent(BoxCollider);
    physicsBox.getInstanceMaterial().dynamicFriction = 0;
    physicsBox.getInstanceMaterial().staticFriction = 0;
    physicsBox.size = cubeSize;
    boxEntity.addComponent(Rigidbody);
    // Resolve automatic inertia before applying a torque to the body.
    engine.sceneManager.activeScene.physics.overlapSphereAll(new Vector3(10000, 0, 0), 0.1);
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

  it("axis", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis.x = 0;
    joint.axis.y = 1;
    expect(formatValue(joint.angle)).eq(0);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(joint.velocity)).eq(6.89082);
    expect(formatValue(joint.angle)).eq(6.58019);
  });

  it("hardLimit", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useLimits = true;
    const limits = new JointLimits();
    limits.min = -Math.PI / 2;
    limits.max = Math.PI / 2;
    limits.contactDistance = 0.1;
    joint.limits = limits;

    expect(formatValue(joint.angle)).eq(0);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.angle)).eq(1.57019);

    collider2.applyTorque(new Vector3(0, -1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.angle)).eq(-1.57019);
  });

  it("softLimit", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;

    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useLimits = true;
    joint.useSpring = true;
    const limits = new JointLimits();
    limits.min = -90;
    limits.max = 90;
    limits.stiffness = 1000;
    limits.damping = 30;
    joint.limits = limits;

    expect(formatValue(joint.angle)).eq(0);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.angle)).eq(6.27762);
  });

  it("stiffness", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useLimits = true;
    joint.useSpring = true;
    const limits = new JointLimits();
    limits.min = -90;
    limits.max = 90;
    limits.stiffness = 2000;
    limits.damping = 30;
    joint.limits = limits;

    expect(formatValue(joint.angle)).eq(0);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.angle)).eq(-12.93617);
  });

  it("damping", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useLimits = true;
    joint.useSpring = true;
    const limits = new JointLimits();
    limits.min = -90;
    limits.max = 90;
    limits.stiffness = 1000;
    limits.damping = 100;
    joint.limits = limits;

    expect(formatValue(joint.angle)).eq(0);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.angle)).eq(50.06221);
  });

  it("motor", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0.5, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useMotor = true;
    const motor = new JointMotor();
    motor.targetVelocity = 30;
    joint.motor = motor;

    expect(formatValue(joint.velocity)).eq(0);

    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.velocity)).eq(30);
    expect(formatValue(joint.angle)).eq(278.87335);
  });

  it("forceLimit", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0.5, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useMotor = true;
    const motor = new JointMotor();
    motor.targetVelocity = 30;
    motor.forceLimit = 0.01;
    joint.motor = motor;

    expect(formatValue(joint.velocity)).eq(0);

    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.velocity)).eq(3.51291);

    engine.sceneManager.activeScene.physics._update(10);
    expect(formatValue(joint.velocity)).eq(30);
  });

  it("gearRatio", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0.5, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useMotor = true;
    const motor = new JointMotor();
    motor.targetVelocity = 30;
    motor.gearRatio = 2;
    joint.motor = motor;

    expect(formatValue(joint.velocity)).eq(0);

    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(joint.velocity)).eq(15);
  });

  it("freeSpin", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(0.5, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.useMotor = true;
    const motor = new JointMotor();
    motor.targetVelocity = 30;
    motor.freeSpin = false;
    joint.motor = motor;

    expect(formatValue(joint.velocity)).eq(0);
    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(collider2.angularVelocity.y)).eq(1718.87328);

    motor.targetVelocity = 30;
    motor.freeSpin = true;
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(collider2.angularVelocity.y)).eq(1718.87328);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(collider2.angularVelocity.y)).eq(5454.57596);
  });

  it("clone", function () {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const collider = boxEntity.getComponent(Rigidbody);
    const collider2 = boxEntity2.getComponent(Rigidbody);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;
    collider.isKinematic = true;
    const joint = boxEntity.addComponent(HingeJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedBody = boxEntity2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0.5, 0, 0);
    joint.axis = new Vector3(0, 1, 0);
    joint.limits = new JointLimits();
    joint.motor = new JointMotor();

    const newBox = boxEntity.clone();
    boxEntity.isActive = false;
    rootEntity.addChild(newBox);
    const newJoint = newBox.getComponent(HingeJoint);
    expect(formatValue(newJoint.angle)).eq(0);
    expect(newJoint.limits).not.toBe(joint.limits);
    expect(newJoint.motor).not.toBe(joint.motor);

    newJoint.limits.min = -Math.PI;
    expect(joint.limits.min).not.eq(newJoint.limits.min);
    newJoint.motor.targetVelocity = 50;
    expect(joint.motor.targetVelocity).not.eq(newJoint.motor.targetVelocity);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(newJoint.velocity)).eq(6.89082);
    expect(formatValue(newJoint.angle)).eq(6.58019);
  });

  it("applies motor settings configured while inactive when the Entity enters simulation", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    box1.isActive = false;
    const hingeJoint = box1.addComponent(HingeJoint);
    hingeJoint.axis = new Vector3(0, 1, 0);
    hingeJoint.useLimits = true;
    hingeJoint.useMotor = true;
    hingeJoint.useSpring = true;
    const limits = new JointLimits();
    limits.min = -90;
    limits.max = 90;
    hingeJoint.limits = limits;
    const motor = new JointMotor();
    motor.targetVelocity = 1;
    hingeJoint.motor = motor;
    box1.isActive = true;
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(Math.abs(hingeJoint.velocity)).toBeGreaterThan(0);
    expect(Math.abs(box1.getComponent(Rigidbody).angularVelocity.y)).toBeGreaterThan(0);
    expect(box1.transform.position.y).toBeCloseTo(5, 5);
    hingeJoint.destroy();
    expect(box1.getComponent(HingeJoint)).toBeNull();
  });
});
