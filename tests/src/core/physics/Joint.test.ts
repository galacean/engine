import { createPhysics } from "../../utils/physics";
import { FixedJoint, HingeJoint, Entity, Rigidbody, BoxCollider, Engine } from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { Vector3 } from "@galacean/engine-math";
import { vi, describe, beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";

describe("Joint", function () {
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

  afterEach(() => vi.restoreAllMocks());

  it("automatically adds a Rigidbody and can reconnect from a body to world space", () => {
    const entity = rootEntity.createChild("joint");
    entity.transform.setPosition(0, 5, 0);
    const joint = entity.addComponent(FixedJoint);
    const body = entity.getComponent(Rigidbody);
    expect(body).toBeInstanceOf(Rigidbody);
    expect(entity.getComponents(Rigidbody, []).length).toBe(1);
    const anchor = rootEntity.createChild("anchor").addComponent(Rigidbody);
    anchor.isKinematic = true;
    joint.connectedBody = anchor;
    expect(joint.connectedBody).toBe(anchor);
    joint.connectedBody = null;
    expect(joint.connectedBody).toBeNull();
    engine.sceneManager.activeScene.physics._update(1);
    expect(entity.transform.position.y).toBeCloseTo(5, 5);
  });

  it("connected to null", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 0, 0));

    const joint = box.addComponent(FixedJoint);

    joint.automaticConnectedAnchor = false;
    joint.connectedAnchor = new Vector3(1, 4, 1);
    expect(joint.anchor).deep.include({ x: 0, y: 0, z: 0 });

    expect(joint.connectedAnchor).deep.include({ x: 1, y: 4, z: 1 });
    expect(joint.connectedBody).eq(null);

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box.transform.position).deep.include({ x: 1, y: 4, z: 1 });

    joint.anchor = new Vector3(0, -0.5, 0);

    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position).deep.include({ x: 1, y: 4.5, z: 1 });
  });

  it("connected to another Rigidbody", function () {
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(1, 0, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(3, 3, 3));

    const box2Collider = box2.getComponent(Rigidbody);
    box2Collider.isKinematic = true;

    const joint = box1.addComponent(FixedJoint);
    joint.automaticConnectedAnchor = false;
    joint.connectedBody = box2.getComponent(Rigidbody);
    joint.anchor = new Vector3(0, 0.5, 0);
    joint.connectedAnchor = new Vector3(0, -0.5, 0);

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box1.transform.position).deep.include({ x: 3, y: 2, z: 3 });

    joint.anchor = new Vector3(0, 1, 0);

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(box1.transform.position).deep.include({ x: 3, y: 1.5, z: 3 });
  });

  it("automaticConnectedAnchor", function () {
    const consoleWarnSpy = vi.spyOn(console, "warn");
    const box = addBox(new Vector3(1, 1, 1), new Vector3(4, 4, 4));

    // No connectedBody
    const joint = box.addComponent(FixedJoint);
    joint.automaticConnectedAnchor = true;
    joint.connectedAnchor = new Vector3(1, 1, 1);
    expect(consoleWarnSpy).toBeCalledTimes(1);
    joint.connectedAnchor.y = 3;
    expect(consoleWarnSpy).toBeCalledTimes(2);
    joint.automaticConnectedAnchor = false;
    joint.automaticConnectedAnchor = true;
    expect(joint.connectedAnchor).deep.include({ x: 4, y: 4, z: 4 });

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 4, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    joint.anchor = new Vector3(0, -1, 0);

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 3, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    // Has connectedBody
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2Collider = box2.getComponent(Rigidbody);
    box2Collider.isKinematic = true;
    joint.connectedBody = box2Collider;

    expect(joint.connectedAnchor).deep.include({ x: 4, y: -2, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    // Change connectedBody
    const box3 = addBox(new Vector3(1, 1, 1), new Vector3(0, 3, 0));
    const box3Collider = box3.getComponent(Rigidbody);
    box3Collider.isKinematic = true;
    joint.connectedBody = box3Collider;

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 0, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });
  });

  it("rotated", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(4, 4, 4));
    box.transform.rotation = new Vector3(30, 45, 0);
    box.addComponent(FixedJoint);
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.rotation.x)).eq(30);
    expect(formatValue(box.transform.rotation.y)).eq(45);
    expect(formatValue(box.transform.rotation.z)).eq(0);
  });

  it("rotated with connectedBody", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(4, 4, 4));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(4, 4, 4));
    const connectedBody = box2.getComponent(Rigidbody);
    box.getComponent(Rigidbody).useGravity = false;
    connectedBody.useGravity = false;
    box.transform.rotation = new Vector3(30, 45, 0);
    box2.transform.rotation = new Vector3(20, 45, 50);
    const joint = box.addComponent(FixedJoint);
    joint.connectedBody = connectedBody;
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(box.transform.rotation.x)).eq(30);
    expect(formatValue(box.transform.rotation.y)).eq(45);
    expect(formatValue(box.transform.rotation.z)).eq(0);
    expect(formatValue(box2.transform.rotation.x)).eq(20);
    expect(formatValue(box2.transform.rotation.y)).eq(45);
    expect(formatValue(box2.transform.rotation.z)).eq(50);
  });

  it.each(["entering the scene", "reconnecting to world space"])("preserves world rotation when %s", (transition) => {
    const anchor = rootEntity.createChild("rotated anchor");
    anchor.transform.setRotation(0, 0, 60);
    const anchorBody = anchor.addComponent(Rigidbody);
    anchorBody.isKinematic = true;
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    box.transform.setRotation(0, 30, 0);

    if (transition === "entering the scene") {
      rootEntity.createChild("other joint").addComponent(FixedJoint).connectedBody = anchorBody;
      box.addComponent(FixedJoint);
    } else {
      const joint = box.addComponent(FixedJoint);
      joint.connectedBody = anchorBody;
      joint.connectedBody = null;
    }

    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(box.transform.rotation.x).toBeCloseTo(0, 4);
    expect(box.transform.rotation.y).toBeCloseTo(30, 4);
    expect(box.transform.rotation.z).toBeCloseTo(0, 4);
  });

  it("massScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 1, 0));
    const box1Collider = box1.getComponent(Rigidbody);
    const box2Collider = box2.getComponent(Rigidbody);
    box1Collider.isKinematic = true;
    const fixedJoint = box2.addComponent(FixedJoint);
    fixedJoint.connectedBody = box1.getComponent(Rigidbody);
    fixedJoint.automaticConnectedAnchor = true;
    fixedJoint.breakForce = 10;

    fixedJoint.massScale = 10;
    expect(fixedJoint.massScale).eq(10);

    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).eq(0);

    fixedJoint.massScale = 10.01;
    expect(fixedJoint.massScale).eq(10.01);
    box2Collider.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).lessThan(0);
  });

  it("connectedMassScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 1, 0));
    const box1Collider = box1.getComponent(Rigidbody);
    const box2Collider = box2.getComponent(Rigidbody);
    box1Collider.isKinematic = true;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.connectedBody = box2.getComponent(Rigidbody);
    fixedJoint.automaticConnectedAnchor = true;
    fixedJoint.breakForce = 10;

    fixedJoint.connectedMassScale = 10;
    expect(fixedJoint.connectedMassScale).eq(10);

    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box2Collider.linearVelocity.y).eq(0);

    fixedJoint.connectedMassScale = 10.01;
    expect(fixedJoint.connectedMassScale).eq(10.01);
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).lessThan(0);
  });

  it("inertiaScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(1, 1, 0));
    const fixedJoint = box2.addComponent(FixedJoint);
    const box2Collider = box2.getComponent(Rigidbody);
    const box1Collider = (fixedJoint.connectedBody = box1.getComponent(Rigidbody));
    box1Collider.automaticInertiaTensor = false;
    box2Collider.automaticInertiaTensor = false;
    box1Collider.mass = 0.00001;
    box1Collider.inertiaTensor = new Vector3(1, 1, 1);
    box2Collider.inertiaTensor = new Vector3(1, 1, 1);
    fixedJoint.automaticConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).eq(477.06462);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    box2Collider.inertiaTensor.y *= 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(86.74174, 0.01);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box2Collider.inertiaTensor.y = 1;
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    fixedJoint.inertiaScale = 10;
    expect(fixedJoint.inertiaScale).eq(10);
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(86.74174, 0.01);
  });

  it("connectedInertiaScale", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(1, 1, 0));
    const fixedJoint = box1.addComponent(FixedJoint);
    const box1Collider = box1.getComponent(Rigidbody);
    const box2Collider = (fixedJoint.connectedBody = box2.getComponent(Rigidbody));
    box1Collider.automaticInertiaTensor = false;
    box2Collider.automaticInertiaTensor = false;
    box1Collider.mass = 0.00001;
    box1Collider.inertiaTensor = new Vector3(1, 1, 1);
    box2Collider.inertiaTensor = new Vector3(1, 1, 1);
    fixedJoint.automaticConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).eq(477.06451);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    box2Collider.inertiaTensor.y *= 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(86.74174, 0.01);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box2Collider.inertiaTensor.y = 1;
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    fixedJoint.connectedInertiaScale = 10;
    expect(fixedJoint.connectedInertiaScale).eq(10);
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(86.74174, 0.01);
  });

  it("breakForce", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 2, 0));
    const box1Collider = box1.getComponent(Rigidbody);
    const box2Collider = box2.getComponent(Rigidbody);
    box1Collider.isKinematic = true;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.connectedBody = box2.getComponent(Rigidbody);
    fixedJoint.automaticConnectedAnchor = true;
    fixedJoint.breakForce = 10;
    expect(fixedJoint.breakForce).eq(10);

    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).eq(0);

    fixedJoint.breakForce = 0.9;
    box2Collider.wakeUp();
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).lessThan(0);
  });

  it("breakTorque", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 1, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(1, 1, 0));
    const fixedJoint = box1.addComponent(FixedJoint);
    const box2Collider = box2.getComponent(Rigidbody);
    fixedJoint.connectedBody = box2.getComponent(Rigidbody);
    fixedJoint.automaticConnectedAnchor = true;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(10);
    expect(Math.abs(box1.transform.position.z)).lessThan(1);

    fixedJoint.breakTorque = 1;
    expect(fixedJoint.breakTorque).eq(1);
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(10);
    expect(Math.abs(box1.transform.position.z)).greaterThan(1);
  });

  it("clone", function () {
    engine.sceneManager.activeScene.physics.gravity = new Vector3(0, -1, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 2, 0));
    const box1Collider = box1.getComponent(Rigidbody);
    const box2Collider = box2.getComponent(Rigidbody);
    box1Collider.isKinematic = true;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.connectedBody = box2Collider;
    fixedJoint.automaticConnectedAnchor = true;
    fixedJoint.breakForce = 1;

    const newBox1 = box1.clone();
    rootEntity.addChild(newBox1);
    box1.isActive = false;
    engine.sceneManager.activeScene.physics._update(1);
    expect(box2Collider.linearVelocity.y).eq(0);
  });

  it.each(["inside", "outside"])("updates a cloned joint when its connected body scales %s the clone", (location) => {
    const group = rootEntity.createChild("assembly");
    const anchorEntity = (location === "inside" ? group : rootEntity).createChild("anchor");
    anchorEntity.transform.setPosition(0, 5, 0);
    const anchor = anchorEntity.addComponent(Rigidbody);
    anchor.isKinematic = true;
    const host = group.createChild("host");
    host.transform.setPosition(1, 5, 0);
    host.addComponent(BoxCollider);
    const joint = host.addComponent(FixedJoint);
    joint.connectedBody = anchor;
    joint.automaticConnectedAnchor = false;
    joint.connectedAnchor.set(1, 0, 0);

    const clone = group.clone();
    group.isActive = false;
    rootEntity.addChild(clone);
    const cloneHost = clone.findByName("host");
    const cloneJoint = cloneHost.getComponent(FixedJoint);
    const cloneAnchor = location === "inside" ? clone.findByName("anchor").getComponent(Rigidbody) : anchor;
    expect(cloneJoint.connectedBody).toBe(cloneAnchor);
    const physics = engine.sceneManager.activeScene.physics;
    physics._update(physics.fixedTimeStep);
    expect(cloneHost.transform.worldPosition.x).toBeCloseTo(1, 5);

    cloneAnchor.entity.transform.setScale(2, 1, 1);
    physics._update(physics.fixedTimeStep);
    expect(cloneHost.transform.worldPosition.x).toBeCloseTo(2, 5);
    expect(cloneJoint.connectedAnchor.x).toBe(1);
  });

  it("applies joint settings configured while inactive when the Entity enters simulation", function () {
    engine.sceneManager.activeScene.physics.gravity.set(0, 0, 0);
    const box1 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 2, 0));

    box1.isActive = false;
    const fixedJoint = box1.addComponent(FixedJoint);
    fixedJoint.automaticConnectedAnchor = true;
    fixedJoint.automaticConnectedAnchor = false;
    fixedJoint.connectedBody = null;
    fixedJoint.connectedBody = box2.getComponent(Rigidbody);
    fixedJoint.anchor = new Vector3(0, 3, 0);
    fixedJoint.connectedAnchor = new Vector3(0, 3, 0);
    fixedJoint.massScale = 3;
    fixedJoint.inertiaScale = 3;
    fixedJoint.connectedMassScale = 3;
    fixedJoint.connectedInertiaScale = 3;
    fixedJoint.breakForce = 3;
    fixedJoint.breakTorque = 3;
    box2.getComponent(Rigidbody).isKinematic = true;
    box1.isActive = true;
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(fixedJoint.connectedBody).toBe(box2.getComponent(Rigidbody));
    expect(box1.transform.position.y).toBeCloseTo(2, 5);
    fixedJoint.destroy();
    expect(box1.getComponent(FixedJoint)).toBeNull();
  });

  it("removes transform listeners when destroyed and allows teardown after failed joint creation", async function () {
    const anchor = rootEntity.createChild("anchor");
    const anchorBody = anchor.addComponent(Rigidbody);
    const host = rootEntity.createChild("host");
    const joint = host.addComponent(HingeJoint);
    joint.connectedBody = anchorBody;

    const removeSelf = vi.spyOn((host as any)._updateFlagManager, "removeListener");
    const removeConnected = vi.spyOn((anchor as any)._updateFlagManager, "removeListener");
    joint.destroy();
    expect(removeSelf).toHaveBeenCalledTimes(1);
    expect(removeConnected).toHaveBeenCalledTimes(1);
    expect(() => anchor.transform.setScale(2, 2, 2)).not.toThrow();

    const noPhysicsEngine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
    const previousNativePhysics = (Engine as any)._nativePhysics;
    (Engine as any)._nativePhysics = undefined;
    try {
      const entity = noPhysicsEngine.sceneManager.activeScene.createRootEntity("no-physics-joint");
      expect(() => entity.addComponent(Rigidbody)).toThrow();
      expect(() => entity.addComponent(HingeJoint)).toThrow();
      expect(() => entity.destroy()).not.toThrow();
    } finally {
      (Engine as any)._nativePhysics = previousNativePhysics;
      noPhysicsEngine.destroy();
    }
  });
});
