import { createPhysics } from "../../utils/physics";
import {
  AnimationClip,
  AnimationVector3Curve,
  HingeJoint,
  JointLimits,
  JointMotor,
  Entity,
  PhysicsMaterial,
  Rigidbody,
  BoxCollider,
  Engine
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { MathUtil, Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, afterAll, beforeEach, expect, it } from "vitest";

describe("HingeJoint", function () {
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

  it("disables automaticConnectedAnchor on connectedAnchor edits, recalculates when re-enabled, and clones manual anchors", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = boxEntity.addComponent(HingeJoint);
    const target = rootEntity.createChild();
    const targetBody = target.addComponent(Rigidbody);
    targetBody.isKinematic = true;
    joint.connectedBody = targetBody;

    expect(joint.automaticConnectedAnchor).toBe(true);
    const connectedAnchor = joint.connectedAnchor;
    expect(connectedAnchor.y).toBe(5);

    connectedAnchor.set(4, 7, 8);
    joint.connectedAnchor.z = 9;
    expect(joint.automaticConnectedAnchor).toBe(false);
    expect(joint.connectedAnchor).toBe(connectedAnchor);
    expect(Vector3.equals(connectedAnchor, new Vector3(4, 7, 9))).toBe(true);

    joint.anchor.y = 1;
    expect(connectedAnchor.y).toBe(7);

    const clone = boxEntity.clone();
    rootEntity.addChild(clone);
    const clonedJoint = clone.getComponent(HingeJoint);
    expect(clonedJoint.automaticConnectedAnchor).toBe(false);
    expect(Vector3.equals(clonedJoint.connectedAnchor, new Vector3(4, 7, 9))).toBe(true);
    clonedJoint.connectedAnchor.x = 10;
    expect(Vector3.equals(joint.connectedAnchor, new Vector3(4, 7, 9))).toBe(true);
    clone.destroy();

    target.transform.setScale(2, 1, 1);
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(boxEntity.transform.worldPosition.x).toBeGreaterThan(0.5);
    expect(boxEntity.transform.worldPosition.z).toBeGreaterThan(0.5);

    boxEntity.transform.setPosition(2, 5, 0);
    boxEntity.transform.setRotation(0, 0, 0);
    joint.automaticConnectedAnchor = true;
    expect(joint.connectedAnchor.x).toBeCloseTo(1, 5);
    expect(joint.connectedAnchor.y).toBeCloseTo(6, 5);
    expect(joint.connectedAnchor.z).toBeCloseTo(0, 5);

    joint.automaticConnectedAnchor = false;
    expect(joint.connectedAnchor.x).toBeCloseTo(1, 5);
    expect(joint.connectedAnchor.y).toBeCloseTo(6, 5);
    expect(joint.connectedAnchor.z).toBeCloseTo(0, 5);
  });

  it("uses the sampled hinge axis between connected bodies", function () {
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
    const clip = new AnimationClip("hinge axis");
    const curve = new AnimationVector3Curve();
    curve.addKey({ time: 0, value: new Vector3(0, 2, 0) });
    clip.addCurveBinding("", HingeJoint, "axis", curve);
    const previousAxis = joint.axis;
    clip.sampleAnimation(boxEntity, 0);
    expect(previousAxis).toMatchObject({ x: 1, y: 0, z: 0 });
    expect(joint.axis).toMatchObject({ x: 0, y: 1, z: 0 });
    expect(formatValue(joint.angle)).eq(0);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(joint.velocity)).eq(6.89082);
    expect(formatValue(joint.angle)).eq(6.58019);
    const angularVelocity = collider2.angularVelocity;
    expect(angularVelocity.y / angularVelocity.length()).toBeCloseTo(1, 4);
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
    expect(collider2.angularVelocity.y).toBeCloseTo(30, 5);

    motor.targetVelocity = 30;
    motor.freeSpin = true;
    engine.sceneManager.activeScene.physics._update(1);
    expect(collider2.angularVelocity.y).toBeCloseTo(30, 5);

    collider2.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(collider2.angularVelocity.y).toBeCloseTo(95.2, 3);
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

  it("applies changes to a cloned motor independently of the original motor", () => {
    const entity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = entity.addComponent(HingeJoint);
    joint.motor = new JointMotor();
    joint.motor.targetVelocity = 2;
    joint.useMotor = true;
    const clone = entity.clone();
    clone.transform.setPosition(3, 5, 0);
    rootEntity.addChild(clone);
    const cloneJoint = clone.getComponent(HingeJoint);
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(1);
    expect(Math.abs(cloneJoint.velocity)).toBeCloseTo(2, 4);

    cloneJoint.motor.targetVelocity = 5;
    physics._update(1);
    expect(Math.abs(cloneJoint.velocity)).toBeCloseTo(5, 4);
    expect(Math.abs(joint.velocity)).toBeCloseTo(2, 4);
  });

  it("applies inherited and edited rotation limits on a cloned hinge", () => {
    const entity = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = entity.addComponent(HingeJoint);
    joint.limits = new JointLimits();
    joint.limits.min = -20;
    joint.limits.max = 20;
    joint.useLimits = true;
    const clone = entity.clone();
    clone.transform.setPosition(3, 5, 0);
    rootEntity.addChild(clone);
    const cloneJoint = clone.getComponent(HingeJoint);
    const body = clone.getComponent(Rigidbody);
    const physics = engine.sceneManager.activeScene.physics;
    const torque = new Vector3(1000, 0, 0);
    body.applyTorque(torque);
    physics._update(1);
    expect(Math.abs(cloneJoint.angle)).toBeCloseTo(20, 1);

    cloneJoint.limits.min = -45;
    cloneJoint.limits.max = 45;
    body.applyTorque(torque);
    physics._update(1);
    expect(Math.abs(cloneJoint.angle)).toBeCloseTo(45, 1);
    expect(joint.limits.min).toBe(-20);
    expect(joint.limits.max).toBe(20);
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

  it("handles antiparallel -X axis and transient zero axis without corrupting orientation", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);

    const posBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const posJoint = posBox.addComponent(HingeJoint);
    posJoint.axis = new Vector3(1, 0, 0);
    posJoint.motor = new JointMotor();
    posJoint.motor.targetVelocity = 4;
    posJoint.useMotor = true;

    const negBox = addBox(new Vector3(1, 1, 1), new Vector3(3, 5, 0));
    const negJoint = negBox.addComponent(HingeJoint);
    negJoint.axis = new Vector3(-1, 0, 0);
    negJoint.motor = new JointMotor();
    negJoint.motor.targetVelocity = 4;
    negJoint.useMotor = true;

    engine.sceneManager.activeScene.physics._update(1 / 60);
    const posVelX = posBox.getComponent(Rigidbody).angularVelocity.x;
    const negVelX = negBox.getComponent(Rigidbody).angularVelocity.x;
    expect(posVelX * negVelX).toBeLessThan(0);
    expect(Math.abs(negVelX)).toBeCloseTo(Math.abs(posVelX), 3);

    negJoint.axis = { x: 0, y: 0, z: 1 };
    expect(negJoint.axis.z).toBeCloseTo(1, 5);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(Number.isFinite(negBox.getComponent(Rigidbody).angularVelocity.z)).toBe(true);
  });

  it.each([1, -1])("keeps the authored hinge tilt near %sX", (axisX) => {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody);
    body.useGravity = false;
    const joint = box.addComponent(HingeJoint);
    joint.axis = new Vector3(axisX, 0.001, 0);
    const motor = new JointMotor();
    motor.targetVelocity = 4;
    joint.motor = motor;
    joint.useMotor = true;

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);

    const { x, y } = body.angularVelocity;
    expect(Math.abs(x)).toBeCloseTo(4, 3);
    expect(y / x).toBeCloseTo(axisX * 0.001, 4);
  });

  it("computes default JointLimits contactDistance in radians for narrow degree ranges", function () {
    const limits = new JointLimits();
    limits.min = -4;
    limits.max = 4;
    expect(limits.contactDistance).toBeCloseTo(0.49 * MathUtil.degreeToRadian(8), 6);

    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(HingeJoint);
    joint.limits = limits;
    joint.useLimits = true;
    box.getComponent(Rigidbody).applyTorque(new Vector3(100, 0, 0));
    engine.sceneManager.activeScene.physics._update(1);
    expect(Math.abs(joint.angle)).toBeLessThanOrEqual(4.5);
  });

  it("resets cached angle and velocity on a cloned HingeJoint before simulation", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(HingeJoint);
    joint.motor = new JointMotor();
    joint.motor.targetVelocity = 4;
    joint.useMotor = true;
    engine.sceneManager.activeScene.physics._update(1 / 60);
    joint.enabled = false;
    expect(Math.abs(joint.angle)).toBeGreaterThan(0);
    expect(Math.abs(joint.velocity)).toBeGreaterThan(0);

    const clone = box.clone();
    const clonedJoint = clone.getComponent(HingeJoint);
    expect(clonedJoint.angle).toBe(0);
    expect(clonedJoint.velocity).toBe(0);
    clone.destroy();
  });

  it("initializes motor and limits to null and allows clearing them back to null", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(HingeJoint);
    expect(joint.motor).toBeNull();
    expect(joint.limits).toBeNull();

    const motor = new JointMotor();
    const limits = new JointLimits();
    joint.motor = motor;
    joint.limits = limits;
    expect(joint.motor).toBe(motor);
    expect(joint.limits).toBe(limits);

    joint.motor = null;
    joint.limits = null;
    expect(joint.motor).toBeNull();
    expect(joint.limits).toBeNull();
    expect(() => {
      motor.targetVelocity = 5;
      limits.max = 30;
    }).not.toThrow();
  });

  it("detaches a cloned hinge from motor and limit settings supplied by its constructor", () => {
    class DoorHinge extends HingeJoint {
      constructor(entity: Entity) {
        super(entity);
        this.motor = new JointMotor();
        this.limits = new JointLimits();
      }
    }
    const door = rootEntity.createChild();
    door.addComponent(DoorHinge);
    const clone = door.clone();
    rootEntity.addChild(clone);
    const hinge = clone.getComponent(DoorHinge)!;
    const { motor, limits } = hinge;
    hinge.motor = null;
    hinge.limits = null;
    const body = clone.getComponent(Rigidbody)!;
    body.sleep();
    motor!.targetVelocity = 5;
    limits!.max = 30;
    expect(body.isSleeping()).toBe(true);
  });

  it("disables active drive and limits immediately when motor or limits are cleared to null", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);

    const motorBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const motorBody = motorBox.getComponent(Rigidbody)!;
    motorBody.angularDamping = 0;
    const motorJoint = motorBox.addComponent(HingeJoint);
    const motor = new JointMotor();
    motor.targetVelocity = 6;
    motor.forceLimit = 500;
    motorJoint.motor = motor;
    motorJoint.useMotor = true;

    engine.sceneManager.activeScene.physics._update(0.2);
    expect(motorJoint.velocity).toBeGreaterThan(3);

    motorJoint.motor = null;
    motorBody.angularVelocity.set(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(Math.abs(motorJoint.velocity)).toBeLessThan(0.05);

    motorJoint.enabled = false;
    motorJoint.enabled = true;
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(Math.abs(motorJoint.velocity)).toBeLessThan(0.05);

    motorJoint.motor = motor;
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(motorJoint.velocity).toBeGreaterThan(3);

    const limitBox = addBox(new Vector3(1, 1, 1), new Vector3(4, 5, 0));
    const limitBody = limitBox.getComponent(Rigidbody)!;
    const limitJoint = limitBox.addComponent(HingeJoint);
    const limits = new JointLimits();
    limits.min = -10;
    limits.max = 10;
    limitJoint.limits = limits;
    limitJoint.useLimits = true;
    limitBody.applyTorque(new Vector3(50, 0, 0));
    engine.sceneManager.activeScene.physics._update(0.5);
    expect(Math.abs(limitJoint.angle)).toBeLessThanOrEqual(11);

    // Clearing limits to null while useLimits=true lets the body spin past the former limit
    limitJoint.limits = null;
    limitBody.applyTorque(new Vector3(80, 0, 0));
    engine.sceneManager.activeScene.physics._update(0.5);
    expect(Math.abs(limitJoint.angle)).toBeGreaterThan(20);
  });

  it("wakes sleeping bodies when active HingeJoint constraint parameters change", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(HingeJoint);
    const motor = new JointMotor();
    motor.targetVelocity = 5;
    motor.forceLimit = 500;
    joint.motor = motor;

    body.sleep();
    expect(body.isSleeping()).toBe(true);

    // Enabling useMotor on a sleeping body wakes it and spins it without manual wakeUp()
    joint.useMotor = true;
    expect(body.isSleeping()).toBe(false);
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(joint.velocity).toBeGreaterThan(2);

    body.sleep();
    expect(body.isSleeping()).toBe(true);
    motor.targetVelocity = 3;
    expect(body.isSleeping()).toBe(false);
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(joint.velocity).toBeCloseTo(3, 3);

    body.sleep();
    joint.useMotor = false;
    expect(body.isSleeping()).toBe(false);
    body.angularVelocity.set(0, 0, 0);
    body.sleep();
    expect(body.isSleeping()).toBe(true);

    const limits = new JointLimits();
    limits.min = 20;
    limits.max = 40;
    joint.limits = limits;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.useLimits = true;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    limits.min = 25;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.useSpring = true;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.axis = { x: 0, y: 1, z: 0 };
    expect(body.isSleeping()).toBe(false);
  });

  it("commits complete hinge directions and preserves the axis across reactivation", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(HingeJoint);

    for (const invalid of [new Vector3(NaN, 1, 0), new Vector3(Infinity, 0, 0), new Vector3(0, -Infinity, 0)]) {
      expect(() => (joint.axis = invalid)).toThrow();
    }
    joint.axis = { x: 0, y: 2, z: 0 };
    const axis = joint.axis;
    joint.axis = { x: 0, y: 0, z: 0 };
    expect(joint.axis).toBe(axis);
    expect(joint.axis).toMatchObject({ x: 0, y: 1, z: 0 });

    // Recreating the native joint uses the last committed direction.
    const body = box.getComponent(Rigidbody)!;
    const motor = new JointMotor();
    motor.targetVelocity = 5;
    motor.forceLimit = 500;
    joint.motor = motor;
    joint.useMotor = true;
    expect(() => (joint.axis = { x: NaN, y: 0, z: 0 })).toThrow();
    expect(joint.axis).toBe(axis);
    joint.enabled = false;
    joint.enabled = true;
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(Math.abs(body.angularVelocity.x)).toBeLessThan(MathUtil.degreeToRadian(1));
    expect(Math.abs(body.angularVelocity.y)).toBeGreaterThan(MathUtil.degreeToRadian(50));
    expect(Math.abs(body.angularVelocity.z)).toBeLessThan(MathUtil.degreeToRadian(1));

    // Overflow vector throws in setter without mutating existing axis
    expect(() => (joint.axis = new Vector3(1.5e308, 1.5e308, 0))).toThrow();
    expect(joint.axis.y).toBeCloseTo(1, 5);

    // Set the connected pose and direction before the native joint is created.
    const anchor = addBox(new Vector3(1, 1, 1), new Vector3(5, 8, 0));
    anchor.transform.setRotation(0, 90, 0);
    anchor.getComponent(Rigidbody)!.isKinematic = true;

    const child = addBox(new Vector3(1, 1, 1), new Vector3(5, 5, 0));
    child.isActive = false;
    const childJoint = child.addComponent(HingeJoint);
    childJoint.axis = { x: 0, y: 0, z: 1 };
    childJoint.axis = { x: 0, y: 0, z: 0 };
    expect(childJoint.axis.z).toBe(1);
    childJoint.connectedBody = anchor.getComponent(Rigidbody)!;
    child.isActive = true;
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(Number.isFinite(childJoint.angle)).toBe(true);
    expect(Math.abs(childJoint.angle)).toBeLessThan(1);
  });
});
