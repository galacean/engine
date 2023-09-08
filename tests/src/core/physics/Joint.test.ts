import {
  FixedJoint,
  HingeJoint,
  SpringJoint,
  JointLimits,
  JointMotor,
  Entity,
  DynamicCollider
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { Vector3, Quaternion } from "@galacean/engine-math";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { expect } from "chai";

describe("Joint", () => {
  let root: Entity;

  before(async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
    engine.run();

    root = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(() => {
    root.clearChildren();
  });

  it("Fixed Joint", () => {
    const entity = root.createChild("FixedJoint");
    // Must add a collider to the entity before add a joint.
    entity.addComponent(DynamicCollider);
    const joint = entity.addComponent(FixedJoint);

    const colliderPrev = root.createChild("ConnectedCollider").addComponent(DynamicCollider);
    const colliderCurrent = root.createChild("ConnectedCollider").addComponent(DynamicCollider);
    // Test that connectedCollider works correctly.
    joint.connectedCollider = colliderPrev;
    expect(joint.connectedCollider).to.eq(colliderPrev);

    joint.connectedCollider = colliderCurrent;
    expect(joint.connectedCollider).to.eq(colliderCurrent);

    joint.connectedCollider = colliderCurrent;
    expect(joint.connectedCollider).to.eq(colliderCurrent);

    // Test that connectedAnchor works correctly.
    const tempVec3 = new Vector3(1, 2, 3);
    joint.connectedAnchor = tempVec3;
    expect(joint.connectedAnchor).to.deep.include({ x: 1, y: 2, z: 3 });

    joint.connectedAnchor = tempVec3;
    expect(joint.connectedAnchor).to.deep.include({ x: 1, y: 2, z: 3 });

    joint.connectedAnchor = new Vector3(1, 2, 3);
    expect(joint.connectedAnchor).to.deep.include({ x: 1, y: 2, z: 3 });

    // Test that connectedMassScale works correctly.
    let tempMassScale = joint.connectedMassScale;
    joint.connectedMassScale = tempMassScale;
    expect(joint.connectedMassScale).to.eq(tempMassScale);

    tempMassScale = 0.5;
    joint.connectedMassScale = tempMassScale;
    expect(joint.connectedMassScale).to.eq(tempMassScale);

    tempMassScale = 10;
    joint.connectedMassScale = tempMassScale;
    expect(joint.connectedMassScale).to.eq(tempMassScale);

    tempMassScale = -1;
    joint.connectedMassScale = tempMassScale;
    expect(joint.connectedMassScale).to.eq(tempMassScale);

    // Test that connectedInertiaScale works correctly.
    let tempInertiaScale = joint.connectedInertiaScale;
    joint.connectedInertiaScale = tempInertiaScale;
    expect(joint.connectedInertiaScale).to.eq(tempInertiaScale);

    tempInertiaScale = 0.5;
    joint.connectedInertiaScale = tempInertiaScale;
    expect(joint.connectedInertiaScale).to.eq(tempInertiaScale);

    tempInertiaScale = 10;
    joint.connectedInertiaScale = tempInertiaScale;
    expect(joint.connectedInertiaScale).to.eq(tempInertiaScale);

    tempInertiaScale = -1;
    joint.connectedInertiaScale = tempInertiaScale;
    expect(joint.connectedInertiaScale).to.eq(tempInertiaScale);

    // Test that massScale works correctly.
    tempMassScale = joint.massScale;
    joint.massScale = tempMassScale;
    expect(joint.massScale).to.eq(tempMassScale);

    tempMassScale = 0.5;
    joint.massScale = tempMassScale;
    expect(joint.massScale).to.eq(tempMassScale);

    tempMassScale = 10;
    joint.massScale = tempMassScale;
    expect(joint.massScale).to.eq(tempMassScale);

    tempMassScale = -1;
    joint.massScale = tempMassScale;
    expect(joint.massScale).to.eq(tempMassScale);

    // Test that inertiaScale works correctly.
    tempInertiaScale = joint.inertiaScale;
    joint.inertiaScale = tempInertiaScale;
    expect(joint.inertiaScale).to.eq(tempInertiaScale);

    tempInertiaScale = 0.5;
    joint.inertiaScale = tempInertiaScale;
    expect(joint.inertiaScale).to.eq(tempInertiaScale);

    tempInertiaScale = 10;
    joint.inertiaScale = tempInertiaScale;
    expect(joint.inertiaScale).to.eq(tempInertiaScale);

    tempInertiaScale = -1;
    joint.inertiaScale = tempInertiaScale;
    expect(joint.inertiaScale).to.eq(tempInertiaScale);

    // Test that breakForce works correctly.
    let tempBreakForce = joint.breakForce;
    joint.breakForce = tempBreakForce;
    expect(joint.breakForce).to.eq(tempBreakForce);

    tempBreakForce = 0.5;
    joint.breakForce = tempBreakForce;
    expect(joint.breakForce).to.eq(tempBreakForce);

    tempBreakForce = 10;
    joint.breakForce = tempBreakForce;
    expect(joint.breakForce).to.eq(tempBreakForce);

    tempBreakForce = -1;
    joint.breakForce = tempBreakForce;
    expect(joint.breakForce).to.eq(tempBreakForce);

    // Test that breakTorque works correctly.
    let tempBreakTorque = joint.breakTorque;
    joint.breakTorque = tempBreakTorque;
    expect(joint.breakTorque).to.eq(tempBreakTorque);

    tempBreakTorque = 0.5;
    joint.breakTorque = tempBreakTorque;
    expect(joint.breakTorque).to.eq(tempBreakTorque);

    tempBreakTorque = 10;
    joint.breakTorque = tempBreakTorque;
    expect(joint.breakTorque).to.eq(tempBreakTorque);

    tempBreakTorque = -1;
    joint.breakTorque = tempBreakTorque;
    expect(joint.breakTorque).to.eq(tempBreakTorque);
  });

  it("Hinge Joint", () => {
    const entity = root.createChild("HingeJoint");
    // Must add a collider to the entity before add a joint.
    entity.addComponent(DynamicCollider);
    const joint = entity.addComponent(HingeJoint);

    // Test that axis works correctly.
    let tempVec3 = joint.axis;
    joint.axis = tempVec3;
    expect(joint.axis).to.deep.eq(tempVec3);

    tempVec3 = new Vector3(1, 2, 3);
    joint.axis = tempVec3.clone();
    const n = tempVec3.normalize();
    expect(joint.axis).to.deep.include({ x: n.x, y: n.y, z: n.z });

    // Test that swingOffset works correctly.
    tempVec3 = joint.swingOffset;
    joint.swingOffset = tempVec3;
    expect(joint.swingOffset).to.deep.eq(tempVec3);

    joint.swingOffset = new Vector3(1, 2, 3);
    expect(joint.swingOffset).to.deep.include({ x: 1, y: 2, z: 3 });

    // Test that angle works correctly.
    expect(() => {
      let tempAngle = joint.angle;
      expect(joint.angle).to.eq(tempAngle);
    }).to.not.throw();

    // Test that velocity works correctly.
    expect(() => {
      let tempVelocity = joint.velocity;
      expect(joint.velocity).to.deep.eq(tempVelocity);
    }).to.not.throw();

    // Test that useLimits works correctly.
    let tempUseLimits = joint.useLimits;
    joint.useLimits = tempUseLimits;
    expect(joint.useLimits).to.eq(tempUseLimits);

    joint.useLimits = true;
    expect(joint.useLimits).to.eq(true);

    joint.useLimits = false;
    expect(joint.useLimits).to.eq(false);

    // Test that useMotor works correctly.
    let tempUseMotor = joint.useMotor;
    joint.useMotor = tempUseMotor;
    expect(joint.useMotor).to.eq(tempUseMotor);

    joint.useMotor = true;
    expect(joint.useMotor).to.eq(true);

    joint.useMotor = false;
    expect(joint.useMotor).to.eq(false);

    // Test that useSpring works correctly.
    let tempSpring = joint.useSpring;
    joint.useSpring = tempSpring;
    expect(joint.useSpring).to.eq(tempSpring);

    joint.useSpring = true;
    expect(joint.useSpring).to.eq(true);

    joint.useSpring = false;
    expect(joint.useSpring).to.eq(false);

    // Test that motor works correctly.
    let tempMotor = joint.motor;
    joint.motor = tempMotor;
    expect(joint.motor).to.be.eq(tempMotor);

    tempMotor = new JointMotor();
    tempMotor.forceLimit = 10;
    tempMotor.freeSpin = true;
    tempMotor.targetVelocity = 10;
    tempMotor.gearRation = 10;
    expect(() => {
      joint.motor = tempMotor;
      expect(joint.motor).to.be.eq(tempMotor);
    }).to.not.throw();

    // Test that limits works correctly.
    let tempLimits = joint.limits;
    joint.limits = tempLimits;
    expect(joint.limits).to.be.eq(tempLimits);

    tempLimits = new JointLimits();
    tempLimits.contactDistance = -10;
    tempLimits.damping = 0;
    tempLimits.max = 10;
    tempLimits.min = -10;
    tempLimits.stiffness = 0;
    expect(() => {
      joint.limits = tempLimits;
      expect(joint.limits).to.be.eq(tempLimits);
    }).to.not.throw();

    // Test that setSoftLimit works correctly.
    joint.useSpring = true;
    tempLimits = new JointLimits();
    tempLimits.contactDistance = -10;
    tempLimits.damping = 0;
    tempLimits.max = 10;
    tempLimits.min = -10;
    tempLimits.stiffness = 0;
    expect(() => {
      joint.limits = tempLimits;
      expect(joint.limits).to.be.eq(tempLimits);
    }).to.not.throw();
  });

  it("Spring Joint", () => {
    const entity = root.createChild("SpringJoint");
    // Must add a collider to the entity before add a joint.
    entity.addComponent(DynamicCollider);
    const joint = entity.addComponent(SpringJoint);

    // Test that swingOffset works correctly.
    let tempVec3 = joint.swingOffset;
    joint.swingOffset = tempVec3;
    expect(joint.swingOffset).to.deep.eq(tempVec3);

    joint.swingOffset = new Vector3(1, 2, 3);
    expect(joint.swingOffset).to.deep.include({ x: 1, y: 2, z: 3 });

    // Test that minDistance works correctly.
    let tempMinDistance = joint.minDistance;
    joint.minDistance = tempMinDistance;
    expect(joint.minDistance).to.eq(tempMinDistance);

    joint.minDistance = Number.MAX_VALUE;
    expect(joint.minDistance).to.eq(Number.MAX_VALUE);

    // Test that maxDistance works correctly.
    let tempMaxDistance = joint.maxDistance;
    joint.maxDistance = tempMaxDistance;
    expect(joint.maxDistance).to.eq(tempMaxDistance);

    joint.maxDistance = Number.MIN_VALUE;
    expect(joint.maxDistance).to.eq(Number.MIN_VALUE);

    // Test that tolerance works correctly.
    let tempTolerance = joint.tolerance;
    joint.tolerance = tempTolerance;
    expect(joint.tolerance).to.eq(tempTolerance);

    joint.tolerance = 0.5;
    expect(joint.tolerance).to.eq(0.5);

    joint.tolerance = -10;
    expect(joint.tolerance).to.eq(-10);

    // Test that stiffness works correctly.
    let tempStiffness = joint.stiffness;
    joint.stiffness = tempStiffness;
    expect(joint.stiffness).to.eq(tempStiffness);

    joint.stiffness = 0.5;
    expect(joint.stiffness).to.eq(0.5);

    joint.stiffness = -10;
    expect(joint.stiffness).to.eq(-10);

    // Test that damping works correctly.
    let tempDamping = joint.damping;
    joint.damping = tempDamping;
    expect(joint.damping).to.eq(tempDamping);

    joint.damping = 0.5;
    expect(joint.damping).to.eq(0.5);

    joint.damping = -10;
    expect(joint.damping).to.eq(-10);
  });
});
