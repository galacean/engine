import { createPhysics } from "../../utils/physics";
import { FixedJoint, HingeJoint, Entity, Rigidbody, BoxCollider, Engine, Scene } from "@galacean/engine-core";
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

  it("clones joints without warnings in automatic and manual connectedAnchor modes", function () {
    const autoBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const autoJoint = autoBox.addComponent(FixedJoint);
    autoJoint.anchor = new Vector3(0, 0.5, 0);

    const manualBox = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const manualJoint = manualBox.addComponent(FixedJoint);
    manualJoint.automaticConnectedAnchor = false;
    manualJoint.connectedAnchor = new Vector3(2, 6, 0);

    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const autoClone = autoBox.clone();
    const manualClone = manualBox.clone();
    rootEntity.addChild(autoClone);
    rootEntity.addChild(manualClone);

    expect(warnings).not.toHaveBeenCalled();
    const clonedAutoJoint = autoClone.getComponent(FixedJoint);
    const clonedManualJoint = manualClone.getComponent(FixedJoint);
    expect(clonedAutoJoint.anchor.y).toBeCloseTo(0.5, 5);
    expect(clonedManualJoint.automaticConnectedAnchor).toBe(false);
    expect(clonedManualJoint.connectedAnchor).deep.include({ x: 2, y: 6, z: 0 });

    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(autoClone.transform.position.y).toBeCloseTo(5, 4);
    expect(manualClone.transform.position.y).toBeCloseTo(6, 4);
  });

  it("updates automatic connectedAnchor on in-place anchor edits and does not mutate connectedAnchor when rejected", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(1, 2, 3));
    const joint = box.addComponent(FixedJoint);
    joint.anchor.set(0, 1, 0);
    expect(joint.connectedAnchor.x).toBeCloseTo(1, 5);
    expect(joint.connectedAnchor.y).toBeCloseTo(3, 5);
    expect(joint.connectedAnchor.z).toBeCloseTo(3, 5);

    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    joint.connectedAnchor = new Vector3(9, 9, 9);
    expect(warnings).toHaveBeenCalledOnce();
    expect(joint.connectedAnchor.x).toBeCloseTo(1, 5);
    expect(joint.connectedAnchor.y).toBeCloseTo(3, 5);
    expect(joint.connectedAnchor.z).toBeCloseTo(3, 5);

    joint.automaticConnectedAnchor = false;
    expect(joint.connectedAnchor.x).toBeCloseTo(1, 5);
    expect(joint.connectedAnchor.y).toBeCloseTo(3, 5);
    expect(joint.connectedAnchor.z).toBeCloseTo(3, 5);
  });

  it("detaches a destroyed connectedBody cleanly on access and re-enable", function () {
    const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 10, 0));
    const anchorBody = anchor.getComponent(Rigidbody);
    anchorBody.isKinematic = true;

    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(FixedJoint);
    joint.connectedBody = anchorBody;
    engine.sceneManager.activeScene.physics._update(1 / 60);

    anchor.destroy();
    expect(joint.connectedBody).toBeNull();

    joint.enabled = false;
    joint.enabled = true;
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position.y).toBeCloseTo(5, 4);
  });

  it("rejects self-connection, cross-scene connectedBody, and cross-engine connectedBody", async function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const ownBody = box.getComponent(Rigidbody);
    const joint = box.addComponent(FixedJoint);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    joint.connectedBody = ownBody;
    expect(joint.connectedBody).toBeNull();
    expect(errors).toHaveBeenCalledTimes(1);

    const otherScene = new Scene(engine);
    engine.sceneManager.addScene(otherScene);
    const otherBody = otherScene.createRootEntity("other").addComponent(Rigidbody);
    try {
      joint.connectedBody = otherBody;
      expect(joint.connectedBody).toBeNull();
      expect(errors).toHaveBeenCalledTimes(2);

      const pendingEntity = new Entity(engine, "pending");
      const pendingJoint = pendingEntity.addComponent(FixedJoint);
      pendingJoint.connectedBody = otherBody;
      rootEntity.addChild(pendingEntity);
      expect(pendingJoint.connectedBody).toBeNull();
      expect(errors).toHaveBeenCalledTimes(3);
    } finally {
      otherScene.destroy();
    }

    const otherEngine = await WebGLEngine.create({
      canvas: document.createElement("canvas"),
      physics: (Engine as any)._nativePhysics
    });
    try {
      const foreignBody = otherEngine.sceneManager.activeScene.createRootEntity("foreign").addComponent(Rigidbody);
      expect(() => {
        joint.connectedBody = foreignBody;
      }).toThrow();
    } finally {
      otherEngine.destroy();
    }
  });

  it("keeps Rigidbody alive after a blocked destroy and cleans it up when the entity is destroyed", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody);
    box.addComponent(FixedJoint);

    expect(() => body.destroy()).toThrow();
    expect(body.destroyed).toBe(false);

    expect(() => box.destroy()).not.toThrow();
    expect(body.destroyed).toBe(true);
    expect((engine.sceneManager.activeScene.physics as any)._bodies.includes(body)).toBe(false);
    expect(() => engine.sceneManager.activeScene.physics._update(1 / 60)).not.toThrow();
  });

  it("allows Joint before Rigidbody in Entity constructor and rejects duplicate Rigidbody", function () {
    const entity = new Entity(engine, "joint-first", FixedJoint, Rigidbody);
    rootEntity.addChild(entity);
    expect(entity.getComponents(Rigidbody, [])).toHaveLength(1);
    expect(entity.getComponents(FixedJoint, [])).toHaveLength(1);
    expect(entity._components.indexOf(entity.getComponent(Rigidbody)!)).toBeLessThan(
      entity._components.indexOf(entity.getComponent(FixedJoint)!)
    );
    expect(() => entity.destroy()).not.toThrow();

    const multi = new Entity(engine, "multi-joint-first", FixedJoint, HingeJoint, Rigidbody);
    expect(multi.getComponents(Rigidbody, [])).toHaveLength(1);
    expect(multi.getComponent(FixedJoint)).not.toBeNull();
    expect(multi.getComponent(HingeJoint)).not.toBeNull();
    expect(() => multi.destroy()).not.toThrow();

    expect(() => new Entity(engine, "dup-rb-1", Rigidbody, Rigidbody)).toThrow(/already has a Rigidbody/);
    expect(() => new Entity(engine, "dup-rb-2", FixedJoint, Rigidbody, Rigidbody)).toThrow(/already has a Rigidbody/);
  });

  it("detaches an active joint immediately when connectedBody is destroyed without toggling enabled", function () {
    const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 10, 0));
    const anchorBody = anchor.getComponent(Rigidbody)!;
    anchorBody.isKinematic = true;

    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(FixedJoint);
    joint.connectedBody = anchorBody;
    engine.sceneManager.activeScene.physics._update(1 / 60);

    // Destroy only the connected Rigidbody while the anchor entity stays alive
    const removeListener = vi.spyOn((anchor as any)._updateFlagManager, "removeListener");
    anchorBody.destroy();
    expect(removeListener).toHaveBeenCalledWith((joint as any)._onConnectedTransformChanged);
    expect(() => anchor.transform.setScale(2, 2, 2)).not.toThrow();
    expect(joint.connectedBody).toBeNull();

    // Without toggling enabled, the active joint is now cleanly pinned to world space at y = 5
    engine.sceneManager.activeScene.physics._update(0.5);
    expect(box.transform.position.y).toBeCloseTo(5, 3);

    // And it can subsequently reconnect to a new Rigidbody
    const newAnchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 8, 0));
    const newAnchorBody = newAnchor.getComponent(Rigidbody)!;
    newAnchorBody.isKinematic = true;
    joint.automaticConnectedAnchor = false;
    joint.connectedBody = newAnchorBody;
    joint.anchor.set(0, 0, 0);
    joint.connectedAnchor.set(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box.transform.position.y).toBeCloseTo(8, 3);
  });

  it("wakes sleeping bodies when an active joint is disabled or destroyed", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(FixedJoint);

    engine.sceneManager.activeScene.physics._update(0.6);
    expect(body.isSleeping()).toBe(true);
    expect(box.transform.position.y).toBeCloseTo(5, 3);

    joint.destroy();
    expect(body.isSleeping()).toBe(false);
    engine.sceneManager.activeScene.physics._update(0.3);
    expect(box.transform.position.y).toBeLessThan(4.8);
  });

  it("validates massScale and connectedMassScale and wakes sleeping bodies", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(FixedJoint);

    for (const invalid of [0, -1, NaN, Infinity, -Infinity]) {
      expect(() => (joint.massScale = invalid)).toThrow();
      expect(() => (joint.connectedMassScale = invalid)).toThrow();
    }

    body.sleep();
    expect(body.isSleeping()).toBe(true);
    joint.massScale = 2;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.connectedMassScale = 2;
    expect(body.isSleeping()).toBe(false);
  });

  it("detaches an active joint when connectedBody moves to another scene, but preserves it when both move together", function () {
    const secondScene = new Scene(engine, "second-joint-scene");
    const secondRoot = secondScene.createRootEntity("second-root");
    try {
      const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 10, 0));
      const anchorBody = anchor.getComponent(Rigidbody)!;
      anchorBody.isKinematic = true;

      const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
      const joint = box.addComponent(FixedJoint);
      joint.connectedBody = anchorBody;
      engine.sceneManager.activeScene.physics._update(1 / 60);

      // Moving only connectedBody to another scene detaches the joint before the actor joins secondScene
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      secondRoot.addChild(anchor);
      expect(errors).toHaveBeenCalledWith("Joint: connectedBody belongs to another scene.");
      expect(joint.connectedBody).toBeNull();

      // Both scenes simulate cleanly with no cross-scene constraint
      engine.sceneManager.activeScene.physics._update(0.2);
      secondScene.physics._update(0.2);
      expect(box.transform.position.y).toBeCloseTo(5, 3);
      expect(Number.isFinite(anchor.transform.position.y)).toBe(true);

      // Moving a parent group containing BOTH entities together preserves the joint
      errors.mockClear();
      const group = rootEntity.createChild("joint-group");
      const pairAnchor = group.createChild("pair-anchor");
      pairAnchor.transform.setPosition(0, 10, 0);
      pairAnchor.addComponent(BoxCollider);
      const pairAnchorBody = pairAnchor.addComponent(Rigidbody);
      pairAnchorBody.isKinematic = true;

      const pairBox = group.createChild("pair-box");
      pairBox.transform.setPosition(0, 6, 0);
      pairBox.addComponent(BoxCollider);
      pairBox.addComponent(Rigidbody);
      const pairJoint = pairBox.addComponent(FixedJoint);
      pairJoint.connectedBody = pairAnchorBody;

      secondRoot.addChild(group);
      expect(errors).not.toHaveBeenCalled();
      expect(pairJoint.connectedBody).toBe(pairAnchorBody);
      secondScene.physics._update(0.2);
      expect(pairBox.transform.position.y).toBeCloseTo(6, 3);
    } finally {
      secondScene.destroy();
    }
  });

  it("keeps Rigidbody alive when destroy is blocked by a Joint and cleans up on entity.destroy or deferred destroy", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(FixedJoint);

    expect(() => body.destroy()).toThrow(/Joint/);
    expect(body.destroyed).toBe(false);
    expect(body.pendingDestroy).toBe(false);
    expect(box.getComponent(Rigidbody)).toBe(body);

    // Entity destruction tears down Joint before Rigidbody cleanly
    expect(() => box.destroy()).not.toThrow();
    expect(joint.destroyed).toBe(true);
    expect(body.destroyed).toBe(true);

    // Deferred destroy within a frame: destroying Joint then Rigidbody flushes cleanly at end of frame
    const deferredBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 6, 0));
    const deferredBody = deferredBox.getComponent(Rigidbody)!;
    const deferredJoint = deferredBox.addComponent(FixedJoint);
    (engine as any)._frameInProcess = true;
    try {
      deferredJoint.destroy();
      deferredBody.destroy();
      expect(deferredJoint.pendingDestroy).toBe(true);
      expect(deferredBody.pendingDestroy).toBe(true);
      expect(deferredBody.destroyed).toBe(false);
    } finally {
      (engine as any)._frameInProcess = false;
    }
    (engine as any)._processPendingDestroyObjects();
    expect(deferredJoint.destroyed).toBe(true);
    expect(deferredBody.destroyed).toBe(true);
    expect(deferredBox.getComponent(Rigidbody)).toBeNull();
  });
});
