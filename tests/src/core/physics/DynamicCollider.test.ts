import {
  Engine,
  Camera,
  Entity,
  ControllerNonWalkableMode,
  BoxColliderShape,
  CapsuleColliderShape,
  DynamicCollider,
  DynamicColliderConstraints,
  CollisionDetectionMode
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { MathUtil, Quaternion, Vector3 } from "@galacean/engine-math";
import { expect } from "chai";

describe("DynamicCollider", function () {
  let engine: Engine;
  let rootEntity: Entity;
  let defaultDynamicCollider: DynamicCollider;

  before(async function () {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");

    let entity = rootEntity.createChild("defaultEntity");
    defaultDynamicCollider = entity.addComponent(DynamicCollider);
    defaultDynamicCollider.addShape(new BoxColliderShape());

    engine.physicsManager.gravity = new Vector3(0, 0, 0);

    engine.run();
  });

  it("test addShape and removeShape", function () {
    // Test that addShape works correctly.
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

  it("test linearDamping", function () {
    // Test that set linearDamping will change the value of linearDamping.
    defaultDynamicCollider.linearDamping = 0;
    expect(defaultDynamicCollider.linearDamping).to.equal(0);

    defaultDynamicCollider.linearDamping = 0.5;
    expect(defaultDynamicCollider.linearDamping).to.equal(0.5);
  });

  it("test angularDamping", function () {
    // Test that set angularDamping will change the value of angularDamping.
    defaultDynamicCollider.angularDamping = 0.05;
    expect(defaultDynamicCollider.angularDamping).to.equal(0.05);

    defaultDynamicCollider.angularDamping = 0;
    expect(defaultDynamicCollider.angularDamping).to.equal(0);
  });

  it("test linearVelocity", function () {
    // Test that set linearVelocity will change the value of linearVelocity.
    defaultDynamicCollider.linearVelocity = defaultDynamicCollider.linearVelocity;
    expect(defaultDynamicCollider.linearVelocity).to.deep.include({ x: 0, y: 0, z: 0 });

    defaultDynamicCollider.linearVelocity = new Vector3(1, 2, 0);
    expect(defaultDynamicCollider.linearVelocity).to.deep.include({ x: 1, y: 2, z: 0 });
  });

  it("test angularVelocity", function () {
    // Test that set angularVelocity will change the value of angularVelocity.
    defaultDynamicCollider.angularVelocity = defaultDynamicCollider.angularVelocity;
    expect(defaultDynamicCollider.angularVelocity).to.deep.include({ x: 0, y: 0, z: 0 });

    defaultDynamicCollider.angularVelocity = new Vector3(0, 2, 0);
    expect(defaultDynamicCollider.angularVelocity).to.deep.include({ x: 0, y: 2, z: 0 });
  });

  it("test mass", function () {
    // Test that set mass will change the value of mass.
    defaultDynamicCollider.mass = 1;
    expect(defaultDynamicCollider.mass).to.equal(1);

    defaultDynamicCollider.mass = 0;
    expect(defaultDynamicCollider.mass).to.equal(0);
  });

  it("test centerOfMass", function () {
    // Test that set centerOfMass will change the value of centerOfMass.
    defaultDynamicCollider.centerOfMass = defaultDynamicCollider.centerOfMass;
    expect(defaultDynamicCollider.centerOfMass).to.deep.include({ x: 0, y: 0, z: 0 });

    defaultDynamicCollider.centerOfMass = new Vector3(1, 0, 0);
    expect(defaultDynamicCollider.centerOfMass).to.deep.include({ x: 1, y: 0, z: 0 });
  });

  it("test inertiaTensor", function () {
    // Test that set inertiaTensor will change the value of inertiaTensor.
    defaultDynamicCollider.inertiaTensor = defaultDynamicCollider.inertiaTensor;
    expect(defaultDynamicCollider.inertiaTensor).to.deep.include({ x: 1, y: 1, z: 1 });

    defaultDynamicCollider.inertiaTensor = new Vector3(1, 0, 0);
    expect(defaultDynamicCollider.inertiaTensor).to.deep.include({ x: 1, y: 0, z: 0 });
  });

  it("test maxAngularVelocity", function () {
    // Test that set maxAngularVelocity will change the value of maxAngularVelocity.
    defaultDynamicCollider.maxAngularVelocity = 100;
    expect(defaultDynamicCollider.maxAngularVelocity).to.equal(100);

    defaultDynamicCollider.maxAngularVelocity = 0;
    expect(defaultDynamicCollider.maxAngularVelocity).to.equal(0);
  });

  it("test maxDepenetrationVelocity", function () {
    // Test that set maxDepenetrationVelocity will change the value of maxDepenetrationVelocity.
    defaultDynamicCollider.maxDepenetrationVelocity = 1000;
    expect(defaultDynamicCollider.maxDepenetrationVelocity).to.equal(1000);

    defaultDynamicCollider.maxDepenetrationVelocity = 0;
    expect(defaultDynamicCollider.maxDepenetrationVelocity).to.equal(0);
  });

  it("test sleepThreshold", function () {
    // Test that set sleepThreshold will change the value of sleepThreshold.
    defaultDynamicCollider.sleepThreshold = 5e-3;
    expect(defaultDynamicCollider.sleepThreshold).to.equal(5e-3);

    defaultDynamicCollider.sleepThreshold = 10;
    expect(defaultDynamicCollider.sleepThreshold).to.equal(10);
  });

  it("test solverIterations", function () {
    // Test that set solverIterations will change the value of solverIterations.
    defaultDynamicCollider.solverIterations = 4;
    expect(defaultDynamicCollider.solverIterations).to.equal(4);

    defaultDynamicCollider.solverIterations = 0;
    expect(defaultDynamicCollider.solverIterations).to.equal(0);
  });

  it("test isKinematic", function () {
    // Test that set isKinematic will change the value of isKinematic.
    defaultDynamicCollider.isKinematic = false;
    expect(defaultDynamicCollider.isKinematic).to.equal(false);

    defaultDynamicCollider.isKinematic = true;
    expect(defaultDynamicCollider.isKinematic).to.equal(true);
  });

  it("test constraints", function () {
    // Test that set constraints will change the value of constraints.
    defaultDynamicCollider.constraints = DynamicColliderConstraints.None;
    expect(defaultDynamicCollider.constraints).to.equal(DynamicColliderConstraints.None);

    defaultDynamicCollider.constraints =
      DynamicColliderConstraints.FreezePositionX | DynamicColliderConstraints.FreezePositionY;
    expect(defaultDynamicCollider.constraints).to.equal(
      DynamicColliderConstraints.FreezePositionX | DynamicColliderConstraints.FreezePositionY
    );
  });

  it("test collisionDetectionMode", function () {
    // Test that set collisionDetectionMode will change the value of collisionDetectionMode.
    defaultDynamicCollider.collisionDetectionMode = CollisionDetectionMode.Discrete;
    expect(defaultDynamicCollider.collisionDetectionMode).to.equal(CollisionDetectionMode.Discrete);

    defaultDynamicCollider.collisionDetectionMode = CollisionDetectionMode.Continuous;
    expect(defaultDynamicCollider.collisionDetectionMode).to.equal(CollisionDetectionMode.Continuous);

    defaultDynamicCollider.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
    expect(defaultDynamicCollider.collisionDetectionMode).to.equal(CollisionDetectionMode.ContinuousDynamic);

    defaultDynamicCollider.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
    expect(defaultDynamicCollider.collisionDetectionMode).to.equal(CollisionDetectionMode.ContinuousSpeculative);
  });

  it("test sleep", function () {
    expect(function () {
      defaultDynamicCollider.sleep();
    }).not.to.throw();
  });

  it("test wakeUp", function () {
    expect(function () {
      defaultDynamicCollider.wakeUp();
    }).not.to.throw();
  });

  it("test applyForce", function () {
    const nonKinematicCollider = rootEntity.createChild("nonKinematicCollider").addComponent(DynamicCollider);
    nonKinematicCollider.entity.transform.setPosition(0, 1, 1.5);
    nonKinematicCollider.isKinematic = false;
    nonKinematicCollider.addShape(new BoxColliderShape());
    nonKinematicCollider.applyForce(new Vector3(10, 0, 10));

    const kinematicCollider = rootEntity.createChild("kinematicCollider").addComponent(DynamicCollider);
    kinematicCollider.entity.transform.setPosition(0, 10, 1.5);
    kinematicCollider.isKinematic = true;
    kinematicCollider.addShape(new BoxColliderShape());
    kinematicCollider.applyForce(new Vector3(0, 0, 10));

    setTimeout(function () {
      // Test that applyForce works correctly.
      expect(nonKinematicCollider.entity.transform.position.x).to.be.greaterThan(0);
      expect(nonKinematicCollider.entity.transform.position.y).to.be.eq(1);
      expect(nonKinematicCollider.entity.transform.position.z).to.be.greaterThan(1.5);

      // Test that applyForce not effect kinematic collider.
      expect(kinematicCollider.entity.transform.position.x).to.be.eq(0);
      expect(kinematicCollider.entity.transform.position.y).to.be.eq(10);
      expect(kinematicCollider.entity.transform.position.z).to.be.eq(1.5);
    }, 1000);
  });

  it("test applyTorque", function () {
    const nonKinematicCollider = rootEntity.createChild("nonKinematicCollider").addComponent(DynamicCollider);
    nonKinematicCollider.entity.transform.setPosition(0, 20, 1.5);
    nonKinematicCollider.isKinematic = false;
    nonKinematicCollider.addShape(new BoxColliderShape());
    nonKinematicCollider.applyTorque(new Vector3(0, 0, 10));
    nonKinematicCollider.applyForce(new Vector3(0, 0, 10));

    const kinematicCollider = rootEntity.createChild("kinematicCollider").addComponent(DynamicCollider);
    kinematicCollider.entity.transform.setPosition(0, 30, 1.5);
    kinematicCollider.isKinematic = true;
    kinematicCollider.addShape(new BoxColliderShape());
    kinematicCollider.applyTorque(new Vector3(0, 0, 10));
    kinematicCollider.applyForce(new Vector3(0, 0, 10));

    setTimeout(function () {
      // Test that applyTorque works correctly.
      expect(nonKinematicCollider.entity.transform.rotation.x).to.be.eq(0);
      expect(nonKinematicCollider.entity.transform.rotation.y).to.be.eq(0);
      expect(nonKinematicCollider.entity.transform.rotation.z).to.be.greaterThan(0);

      // Test that applyTorque not effect kinematic collider.
      expect(kinematicCollider.entity.transform.rotation.x).to.be.eq(0);
      expect(kinematicCollider.entity.transform.rotation.y).to.be.eq(0);
      expect(kinematicCollider.entity.transform.rotation.z).to.be.eq(0);
    }, 1000);
  });

  it("test move", function () {
    const nonKinematicCollider = rootEntity.createChild("nonKinematicCollider").addComponent(DynamicCollider);
    nonKinematicCollider.addShape(new BoxColliderShape());
    nonKinematicCollider.isKinematic = false;
    nonKinematicCollider.entity.transform.setPosition(1, 5, 0);
    nonKinematicCollider.move(
      new Vector3(-1, 5, 1),
      new Quaternion().rotateAxisAngle(new Vector3(0, 1, 0), MathUtil.degreeToRadian(30))
    );

    const kinematicCollider = rootEntity.createChild("kinematicCollider").addComponent(DynamicCollider);
    kinematicCollider.addShape(new BoxColliderShape());
    kinematicCollider.isKinematic = true;
    kinematicCollider.entity.transform.setPosition(1, 5, 0);
    kinematicCollider.move(
      new Vector3(-1, 5, 1),
      new Quaternion().rotateAxisAngle(new Vector3(0, 1, 0), MathUtil.degreeToRadian(30))
    );

    setTimeout(function () {
      // Test that move position and rotation works correctly.
      expect(nonKinematicCollider.entity.transform.position).to.deep.include({ x: 1, y: 5, z: 0 });
      expect(nonKinematicCollider.entity.transform.rotation).to.deep.include({ x: 0, y: 0, z: 0 });

      expect(kinematicCollider.entity.transform.position).to.deep.include({ x: -1, y: 5, z: 1 });
      expect(kinematicCollider.entity.transform.rotation.x).to.eq(0);
      expect(kinematicCollider.entity.transform.rotation.y).to.be.closeTo(30, 0.001);
      expect(kinematicCollider.entity.transform.rotation.z).to.eq(0);
    }, 1000);
  });

  it("test destroy", function () {
    const entity = rootEntity.createChild("collider");
    const collider = entity.addComponent(DynamicCollider);
    collider.addShape(new BoxColliderShape());
    collider.destroy();

    // Test that destroy works correctly.
    expect(collider.shapes.length).to.eq(0);
    expect(entity.getComponent(DynamicCollider)).to.be.null;
  });
});
