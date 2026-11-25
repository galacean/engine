import { createPhysics } from "../../utils/physics";
import {
  AnimationClip,
  AnimationVector3Curve,
  FixedJoint,
  HingeJoint,
  SpringJoint,
  Entity,
  Rigidbody,
  BoxCollider,
  Engine,
  Loader,
  PhysicsMaterial,
  Scene,
  Script
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine";
import { HorizontalAlignmentMode, UITransform } from "@galacean/engine-ui";
import { Ray, Vector3 } from "@galacean/engine-math";
import {
  ParserContext,
  ParserType
} from "../../../../packages/loader/src/resource-deserialize/resources/parser/ParserContext";
import { SceneParser } from "../../../../packages/loader/src/resource-deserialize/resources/scene/SceneParser";
import type { SceneFile } from "../../../../packages/loader/src/schema/SceneSchema";
import { vi, describe, beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";

describe("Joint", function () {
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
    const box = addBox(new Vector3(1, 1, 1), new Vector3(4, 4, 4));

    const joint = box.addComponent(FixedJoint);
    expect(joint.connectedAnchor).deep.include({ x: 4, y: 4, z: 4 });

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 4, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    const body = box.getComponent(Rigidbody)!;
    body.sleep();
    expect(body.isSleeping()).toBe(true);
    joint.anchor = new Vector3(0, -1, 0);
    expect(body.isSleeping()).toBe(false);

    engine.sceneManager.activeScene.physics._update(1 / 60);

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 3, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    const box2 = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const box2Collider = box2.getComponent(Rigidbody);
    box2Collider.isKinematic = true;
    joint.connectedBody = box2Collider;

    expect(joint.connectedAnchor).deep.include({ x: 4, y: -2, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });

    const box3 = addBox(new Vector3(1, 1, 1), new Vector3(0, 3, 0));
    const box3Collider = box3.getComponent(Rigidbody);
    box3Collider.isKinematic = true;
    joint.connectedBody = box3Collider;

    expect(joint.connectedAnchor).deep.include({ x: 4, y: 0, z: 4 });
    expect(box.transform.position).deep.include({ x: 4, y: 4, z: 4 });
  });

  it.each([true, false])(
    "defers automatic connectedAnchor calculation until the joint is active (managed scene=%s)",
    (managed) => {
      const scene = managed ? engine.sceneManager.activeScene : new Scene(engine);
      const owner = scene.createRootEntity("joint owner");
      const target = scene.createRootEntity("joint target");
      try {
        owner.transform.setPosition(10, 0, 0);
        owner.addComponent(BoxCollider);
        const joint = owner.addComponent(FixedJoint);
        owner.getComponent(Rigidbody).useGravity = false;
        joint.enabled = false;

        joint.anchor.set(2, 0, 0);
        expect(joint.connectedAnchor.x).toBe(10);

        target.transform.setPosition(5, 0, 0);
        const targetBody = target.addComponent(Rigidbody);
        targetBody.isKinematic = true;
        targetBody.enabled = false;
        joint.connectedBody = targetBody;
        expect(joint.connectedAnchor.x).toBe(10);

        targetBody.enabled = true;
        joint.enabled = true;
        expect(joint.connectedAnchor.x).toBe(7);

        joint.automaticConnectedAnchor = false;
        scene.physics._update(1 / 60);
        expect(owner.transform.worldPosition.x).toBeCloseTo(10, 5);
      } finally {
        owner.destroy();
        target.destroy();
        if (!managed) scene.destroy();
      }
    }
  );

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
    expect(box2Collider.angularVelocity.y).toBeCloseTo(8.32635, 5);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    box2Collider.inertiaTensor.y *= 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box2Collider.angularVelocity.y).toBeCloseTo(1.51393, 4);

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
    expect(box2Collider.angularVelocity.y).toBeCloseTo(1.51393, 4);
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
    expect(box2Collider.angularVelocity.y).toBeCloseTo(8.32635, 5);

    box2.transform.rotation = new Vector3(0, 0, 0);
    box1Collider.angularVelocity = new Vector3(0, 0, 0);
    box2Collider.angularVelocity = new Vector3(0, 0, 0);
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(formatValue(box2Collider.angularVelocity.y)).closeTo(0, 0.01);

    box2Collider.inertiaTensor.y *= 10;
    box2Collider.applyTorque(new Vector3(0, 1000, 0));
    engine.sceneManager.activeScene.physics._update(1 / 60);
    expect(box2Collider.angularVelocity.y).toBeCloseTo(1.51393, 4);

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
    expect(box2Collider.angularVelocity.y).toBeCloseTo(1.51393, 4);
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

  it("releases a cloned joint's constructor connection when it is cleared", () => {
    const target = rootEntity.createChild().addComponent(Rigidbody);
    target.isKinematic = true;
    class Pin extends FixedJoint {
      constructor(entity: Entity) {
        super(entity);
        this.connectedBody = target;
        this.connectedAnchor.set(1, 0, 0);
      }
    }
    const source = rootEntity.createChild();
    source.addComponent(Pin);
    const clone = source.clone();
    rootEntity.addChild(clone);
    const joint = clone.getComponent(Pin)!;
    expect(joint.connectedBody).toBe(target);
    joint.connectedBody = null;
    target.entity.transform.setScale(2, 1, 1);
    joint.automaticConnectedAnchor = true;
    const pinnedX = joint.connectedAnchor.x;
    clone.transform.setPosition(pinnedX + 3, 0, 0);
    target.enabled = false;
    expect(joint.connectedAnchor.x).toBe(pinnedX);
    expect(source.getComponent(Pin)!.connectedBody).toBe(target);
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
    try {
      const entity = noPhysicsEngine.sceneManager.activeScene.createRootEntity("no-physics-joint");
      expect(() => entity.addComponent(HingeJoint)).toThrow();
      expect(() => entity.destroy()).not.toThrow();
    } finally {
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

  it("updates an unwritten connectedAnchor on in-place anchor edits until automatic mode is disabled", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(1, 2, 3));
    const joint = box.addComponent(FixedJoint);
    joint.anchor.set(0, 1, 0);
    expect(joint.connectedAnchor.x).toBeCloseTo(1, 5);
    expect(joint.connectedAnchor.y).toBeCloseTo(3, 5);
    expect(joint.connectedAnchor.z).toBeCloseTo(3, 5);

    joint.automaticConnectedAnchor = false;
    joint.anchor.set(0, 2, 0);
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

  it("rejects the joint's own body, destroyed bodies, and bodies from another engine", async function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const ownBody = box.getComponent(Rigidbody);
    const joint = box.addComponent(FixedJoint);

    expect(() => (joint.connectedBody = ownBody)).toThrow(/to itself/);
    const destroyedBody = rootEntity.createChild("destroyed").addComponent(Rigidbody);
    destroyedBody.destroy();
    expect(() => (joint.connectedBody = destroyedBody)).toThrow(/destroyed/);
    expect(joint.connectedBody).toBeNull();

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

  it("rejects duplicate Rigidbody on the same Entity", function () {
    expect(() => new Entity(engine, "dup-rb-1", Rigidbody, Rigidbody)).toThrow(/already has a Rigidbody/);
    const entity = new Entity(engine, "joint-then-rb", FixedJoint);
    expect(() => entity.addComponent(Rigidbody)).toThrow(/already has a Rigidbody/);
    entity.destroy();
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

    // Keep the joint enabled to verify rebinding to a world-space anchor.
    engine.sceneManager.activeScene.physics._update(0.5);
    expect(box.transform.position.y).toBeCloseTo(5, 3);

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

  it("validates massScale and connectedMassScale, supports Infinity, and wakes sleeping bodies", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity = new Vector3(0, 0, 0);
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const connected = addBox(new Vector3(1, 1, 1), new Vector3(2, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const connectedBody = connected.getComponent(Rigidbody)!;
    const joint = box.addComponent(FixedJoint);
    joint.connectedBody = connectedBody;

    for (const invalid of [0, -1, NaN, -Infinity, 1e-40, "2" as unknown as number, true as unknown as number]) {
      expect(() => (joint.massScale = invalid)).toThrow();
      expect(() => (joint.connectedMassScale = invalid)).toThrow();
    }

    joint.massScale = 1e40;
    expect(joint.massScale).toBe(1e40);
    joint.massScale = Infinity;
    expect(joint.massScale).toBe(Infinity);
    body.linearVelocity = new Vector3(1, 0, 0);
    physics._update(physics.fixedTimeStep);
    expect(body.linearVelocity.x).toBeCloseTo(1, 4);
    expect(connectedBody.linearVelocity.x).toBeCloseTo(1, 4);

    joint.massScale = 1;
    joint.connectedMassScale = 1e40;
    expect(joint.connectedMassScale).toBe(1e40);
    joint.connectedMassScale = Infinity;
    expect(joint.connectedMassScale).toBe(Infinity);
    body.linearVelocity = new Vector3(0, 0, 0);
    connectedBody.linearVelocity = new Vector3(1, 0, 0);
    physics._update(physics.fixedTimeStep);
    expect(connectedBody.linearVelocity.x).toBeCloseTo(1, 4);
    expect(body.linearVelocity.x).toBeCloseTo(1, 4);

    body.sleep();
    expect(body.isSleeping()).toBe(true);
    joint.massScale = 2;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.connectedMassScale = 2;
    expect(body.isSleeping()).toBe(false);
  });

  it("suspends a joint across scenes and reconnects when both bodies share a scene", function () {
    const secondScene = new Scene(engine, "second-joint-scene");
    const secondRoot = secondScene.createRootEntity("second-root");
    try {
      const anchor = addBox(new Vector3(1, 1, 1), new Vector3(0, 10, 0));
      const anchorBody = anchor.getComponent(Rigidbody)!;
      anchorBody.isKinematic = true;

      const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
      const joint = box.addComponent(FixedJoint);
      joint.automaticConnectedAnchor = false;
      joint.connectedAnchor.set(0, -5, 0);
      joint.connectedBody = anchorBody;
      const physics = engine.sceneManager.activeScene.physics;
      physics._update(1 / 60);

      secondRoot.addChild(anchor);
      expect(joint.connectedBody).toBe(anchorBody);
      physics._update(0.2);
      secondScene.physics._update(0.2);
      expect(box.transform.position.y).toBeLessThan(4.9);

      rootEntity.addChild(anchor);
      physics._update(0.2);
      expect(box.transform.position.y).toBeCloseTo(5, 3);

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
      expect(pairJoint.connectedBody).toBe(pairAnchorBody);
      secondScene.physics._update(0.2);
      expect(pairBox.transform.position.y).toBeCloseTo(6, 3);
    } finally {
      secondScene.destroy();
    }
  });

  it("keeps an authored connection pending until both bodies are registered", function () {
    const secondScene = new Scene(engine, "pending-joint-scene");
    try {
      const anchor = secondScene.createRootEntity("anchor");
      anchor.transform.setPosition(0, 10, 0);
      const anchorBody = anchor.addComponent(Rigidbody);
      anchorBody.isKinematic = true;

      const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
      const joint = box.addComponent(FixedJoint);
      joint.automaticConnectedAnchor = false;
      joint.connectedAnchor.set(0, -5, 0);
      joint.connectedBody = anchorBody;
      const physics = engine.sceneManager.activeScene.physics;
      expect(joint.connectedBody).toBe(anchorBody);
      physics._update(0.2);
      expect(box.transform.position.y).toBeLessThan(4.9);

      anchorBody.enabled = false;
      rootEntity.addChild(anchor);
      physics._update(0.2);
      expect(box.transform.position.y).toBeLessThan(4.5);

      anchorBody.enabled = true;
      physics._update(0.2);
      expect(box.transform.position.y).toBeCloseTo(5, 3);

      const boxBody = box.getComponent(Rigidbody)!;
      boxBody.enabled = false;
      anchor.transform.setPosition(0, 11, 0);
      physics._update(0.2);
      expect(box.transform.position.y).toBeCloseTo(5, 3);

      boxBody.enabled = true;
      physics._update(0.2);
      expect(box.transform.position.y).toBeCloseTo(6, 3);
    } finally {
      secondScene.destroy();
    }
  });

  it("preserves joint connections across SceneManager.mergeScenes in either root order", function () {
    for (const bodyFirst of [true, false]) {
      const srcScene = new Scene(engine, `merge-src-${bodyFirst}`);
      const dstScene = new Scene(engine, `merge-dst-${bodyFirst}`);
      try {
        const makeRootBox = (name: string, y: number, kinematic: boolean) => {
          const e = new Entity(engine, name);
          e.transform.setPosition(0, y, 0);
          e.addComponent(BoxCollider);
          const rb = e.addComponent(Rigidbody);
          rb.isKinematic = kinematic;
          return { entity: e, body: rb };
        };
        const anchor = makeRootBox("anchor", 10, true);
        const follower = makeRootBox("follower", 6, false);
        const mergeJoint = follower.entity.addComponent(FixedJoint);
        mergeJoint.connectedBody = anchor.body;

        if (bodyFirst) {
          srcScene.addRootEntity(anchor.entity);
          srcScene.addRootEntity(follower.entity);
        } else {
          srcScene.addRootEntity(follower.entity);
          srcScene.addRootEntity(anchor.entity);
        }

        engine.sceneManager.mergeScenes(srcScene, dstScene);
        expect(srcScene.rootEntitiesCount).toBe(0);
        expect(dstScene.rootEntitiesCount).toBe(2);
        expect(mergeJoint.connectedBody).toBe(anchor.body);
        dstScene.physics._update(0.2);
        expect(follower.entity.transform.position.y).toBeCloseTo(6, 3);
      } finally {
        srcScene.destroy();
        dstScene.destroy();
      }
    }
  });

  it("cleans up Joint and Rigidbody on entity.destroy and deferred destroy", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(FixedJoint);
    const physics = engine.sceneManager.activeScene.physics;
    const ray = new Ray(new Vector3(-3, 5, 0), new Vector3(1, 0, 0));

    expect(physics.raycast(ray, 10)).toBe(true);

    // Entity destruction tears down Joint before Rigidbody cleanly
    expect(() => box.destroy()).not.toThrow();
    expect(joint.destroyed).toBe(true);
    expect(body.destroyed).toBe(true);
    expect(physics.raycast(ray, 10)).toBe(false);

    // Deferred destroy within a frame: destroying Joint then Rigidbody flushes cleanly at end of frame
    const deferredBox = addBox(new Vector3(1, 1, 1), new Vector3(0, 6, 0));
    const deferredBody = deferredBox.getComponent(Rigidbody)!;
    const deferredJoint = deferredBox.addComponent(FixedJoint);
    deferredBox.addComponent(
      class extends Script {
        override onUpdate(): void {
          deferredJoint.destroy();
          deferredBody.destroy();
          expect(deferredJoint.pendingDestroy).toBe(true);
          expect(deferredBody.pendingDestroy).toBe(true);
          expect(deferredBody.destroyed).toBe(false);
        }
      }
    );
    engine.update();
    expect(deferredJoint.destroyed).toBe(true);
    expect(deferredBody.destroyed).toBe(true);
    expect(deferredBox.getComponent(Rigidbody)).toBeNull();
  });

  it.each([false, true])("destroys a queued joint during activation (remove body=%s)", (removeBody) => {
    const host = new Entity(engine);
    host.addComponent(
      class extends Script {
        override onEnable(): void {
          joint.destroy();
          if (removeBody) body.destroy();
        }
      }
    );
    const body = host.addComponent(Rigidbody);
    const joint = host.addComponent(FixedJoint);
    rootEntity.addChild(host);
    expect(host.getComponent(FixedJoint)).toBeNull();
    if (removeBody) {
      expect(host.getComponent(Rigidbody)).toBeNull();
    } else {
      body.linearVelocity.set(2, 0, 0);
      engine.sceneManager.activeScene.physics._update(0.5);
      expect(host.transform.worldPosition.x).toBeCloseTo(1, 4);
    }
  });

  it("releases a joint destroyed while its deactivating host leaves the hierarchy", () => {
    const parent = rootEntity.createChild();
    const host = parent.createChild();
    const body = host.addComponent(Rigidbody);
    host.addComponent(
      class extends Script {
        override onDisable(): void {
          if (!joint.destroyed) {
            joint.destroy();
            host.parent = null;
          }
        }
      }
    );
    const joint = host.addComponent(FixedJoint);
    parent.isActive = false;
    rootEntity.addChild(host);
    body.linearVelocity.set(2, 0, 0);
    engine.sceneManager.activeScene.physics._update(0.5);
    expect(host.getComponent(FixedJoint)).toBeNull();
    expect(host.transform.worldPosition.x).toBeCloseTo(1, 4);
  });

  it.each([
    [0, 35],
    [30, 60]
  ])(
    "keeps a resampled local anchor fixed in the world after rotating parent %i and body %i degrees",
    (parentAngle, angle) => {
      const parent = rootEntity.createChild();
      parent.transform.setRotation(0, 0, parentAngle);
      const host = parent.createChild();
      const joint = host.addComponent(SpringJoint);
      joint.anchor.set(1, 0, 0);
      const worldAnchor = joint.connectedAnchor.clone();
      host.transform.setRotation(0, 0, angle);
      joint.anchor.set(1, 0, 0);
      expect(Vector3.distance(joint.connectedAnchor, worldAnchor)).toBe(0);
    }
  );

  it("keeps a spring tied to its world anchor while animation samples a constant local anchor", () => {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);
    const host = rootEntity.createChild();
    const spring = host.addComponent(SpringJoint);
    spring.maxDistance = 1;
    spring.stiffness = 20000;
    spring.damping = 30;
    spring.tolerance = 0;
    const curve = new AnimationVector3Curve();
    curve.addKey({ time: 0, value: new Vector3() });
    const clip = new AnimationClip("hold anchor");
    clip.addCurveBinding("", SpringJoint, "anchor", curve);
    host.getComponent(Rigidbody)!.linearVelocity.set(8, 0, 0);
    for (let i = 0; i < 120; i++) {
      clip.sampleAnimation(host, i * physics.fixedTimeStep);
      physics._update(physics.fixedTimeStep);
    }
    expect(spring.connectedAnchor.x).toBe(0);
    expect(Math.abs(host.transform.worldPosition.x)).toBeLessThanOrEqual(1);
  });

  it("disables automaticConnectedAnchor on connectedAnchor assignment and keeps the calculated anchor when disabled", function () {
    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const joint = box.addComponent(FixedJoint);
    expect(joint.automaticConnectedAnchor).toBe(true);
    expect(joint.connectedAnchor).deep.include({ x: 0, y: 5, z: 0 });

    joint.connectedAnchor = new Vector3(0, 7, 0);
    expect(joint.automaticConnectedAnchor).toBe(false);
    engine.sceneManager.activeScene.physics._update(0.2);
    expect(box.transform.position.y).toBeGreaterThan(5.5);

    joint.automaticConnectedAnchor = true;
    const recalculatedY = joint.connectedAnchor.y;
    expect(recalculatedY).toBeCloseTo(box.transform.position.y, 4);

    joint.automaticConnectedAnchor = false;
    joint.anchor = new Vector3(0, 1, 0);
    expect(joint.connectedAnchor.y).toBeCloseTo(recalculatedY, 4);

    joint.automaticConnectedAnchor = true;
    expect(joint.automaticConnectedAnchor).toBe(true);
    const body = box.getComponent(Rigidbody)!;
    body.sleep();
    expect(body.isSleeping()).toBe(true);
    joint.connectedAnchor = joint.connectedAnchor;
    expect(joint.automaticConnectedAnchor).toBe(true);
    expect(body.isSleeping()).toBe(true);

    const curve = new AnimationVector3Curve();
    curve.addKey({ time: 0, value: joint.connectedAnchor.clone() });
    const clip = new AnimationClip("hold connected anchor");
    clip.addCurveBinding("", FixedJoint, "connectedAnchor", curve);
    clip.sampleAnimation(box, 0);
    expect(joint.automaticConnectedAnchor).toBe(false);
    expect(body.isSleeping()).toBe(true);

    joint.automaticConnectedAnchor = true;
    box.transform.setPosition(3, 5, 0);
    joint.automaticConnectedAnchor = true;
    expect(joint.connectedAnchor.x).toBe(3);
  });

  it.each([true, false])(
    "loads manual connectedAnchor from an active Scene regardless of prop order (connectedAnchorFirst=%s)",
    async function (connectedAnchorFirst) {
      Loader.registerClass("BoxCollider", BoxCollider);
      Loader.registerClass("Rigidbody", Rigidbody);
      Loader.registerClass("FixedJoint", FixedJoint);

      const connectedJointProps = connectedAnchorFirst
        ? {
            connectedAnchor: { x: 2, y: -2, z: 0 },
            anchor: { x: 0, y: 0, z: 0 },
            connectedBody: { $component: { entity: [0], type: "Rigidbody", index: 0 } },
            automaticConnectedAnchor: false
          }
        : {
            automaticConnectedAnchor: false,
            connectedBody: { $component: { entity: [0], type: "Rigidbody", index: 0 } },
            anchor: { x: 0, y: 0, z: 0 },
            connectedAnchor: { x: 2, y: -2, z: 0 }
          };
      const worldJointProps = connectedAnchorFirst
        ? {
            connectedAnchor: { x: 0, y: 0, z: 0 },
            anchor: { x: 0, y: 1, z: 0 },
            automaticConnectedAnchor: false
          }
        : {
            automaticConnectedAnchor: false,
            anchor: { x: 0, y: 1, z: 0 },
            connectedAnchor: { x: 0, y: 0, z: 0 }
          };

      const data: SceneFile = {
        version: "2.0",
        refs: [],
        entities: [
          { name: "target", position: [0, 10, 0], components: [0] },
          { name: "follower", position: [0, 5, 0], components: [1, 2, 3] },
          { name: "worldFollower", position: [10, 5, 0], components: [4, 5, 6] }
        ],
        components: [
          { type: "Rigidbody", props: { isKinematic: true } },
          { type: "BoxCollider" },
          { type: "Rigidbody", props: { useGravity: false } },
          { type: "FixedJoint", props: connectedJointProps },
          { type: "BoxCollider" },
          { type: "Rigidbody", props: { useGravity: false } },
          { type: "FixedJoint", props: worldJointProps }
        ],
        scene: {
          rootEntities: [0, 1, 2],
          background: { mode: 0, color: [0, 0, 0, 1] }
        }
      };

      const scene = new Scene(engine);
      engine.sceneManager.addScene(scene);
      try {
        const parser = new SceneParser(data, new ParserContext(engine, ParserType.Scene, scene), scene);
        parser.start();
        await parser.promise;

        const follower = scene.rootEntities[1];
        const connectedJoint = follower.getComponent(FixedJoint)!;
        const targetBody = scene.rootEntities[0].getComponent(Rigidbody)!;
        expect(connectedJoint.connectedBody).toBe(targetBody);
        expect(connectedJoint.automaticConnectedAnchor).toBe(false);
        expect(Vector3.equals(connectedJoint.connectedAnchor, new Vector3(2, -2, 0))).toBe(true);

        const worldFollower = scene.rootEntities[2];
        const worldJoint = worldFollower.getComponent(FixedJoint)!;
        expect(worldJoint.automaticConnectedAnchor).toBe(false);
        expect(Vector3.equals(worldJoint.connectedAnchor, new Vector3(0, 0, 0))).toBe(true);

        scene.physics._update(0.2);
        expect(follower.transform.position.x).toBeGreaterThan(0.5);
        expect(follower.transform.position.y).toBeGreaterThan(6);
        expect(worldFollower.transform.position.x).toBeLessThan(9);
        expect(worldFollower.transform.position.y).toBeLessThan(4);
      } finally {
        scene.destroy();
      }
    }
  );

  it("converts a manual connectedAnchor to world space when connectedBody is destroyed without altering explicit null assignment", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);

    for (const mode of ["body", "entity", "deferred"] as const) {
      const target = addBox(new Vector3(1, 1, 1), new Vector3(10, 0, 0));
      target.transform.setScale(2, 1, 1);
      const targetBody = target.getComponent(Rigidbody)!;
      targetBody.isKinematic = true;

      const box = addBox(new Vector3(1, 1, 1), new Vector3(6, 0, 0));
      const joint = box.addComponent(FixedJoint);
      joint.connectedBody = targetBody;
      joint.automaticConnectedAnchor = false;
      joint.anchor.set(0, 0, 0);
      joint.connectedAnchor.set(-2, 0, 0);

      physics._update(physics.fixedTimeStep);
      expect(box.transform.position.x).toBeCloseTo(6, 3);

      if (mode === "body") {
        targetBody.destroy();
      } else if (mode === "entity") {
        target.destroy();
      } else {
        box.addComponent(
          class extends Script {
            override onUpdate(): void {
              if (!target.destroyed) {
                target.destroy();
              }
            }
          }
        );
        engine.update();
      }

      expect(joint.connectedBody).toBeNull();
      expect(joint.automaticConnectedAnchor).toBe(false);
      expect(joint.connectedAnchor.x).toBeCloseTo(6, 3);

      physics._update(physics.fixedTimeStep);
      expect(box.transform.position.x).toBeCloseTo(6, 3);

      box.destroy();
      if (!target.destroyed) {
        target.destroy();
      }
    }

    // Sheared ancestor: solver frame matches world position + rotated (anchor * lossyWorldScale), distinct from worldMatrix.
    const parent = rootEntity.createChild("sheared-parent");
    parent.transform.setScale(2, 1, 1);
    const shearedTarget = parent.createChild("sheared-target");
    shearedTarget.transform.setPosition(5, 0, 0);
    shearedTarget.transform.setRotation(0, 0, 45);
    shearedTarget.addComponent(BoxCollider);
    const shearedTargetBody = shearedTarget.addComponent(Rigidbody);
    shearedTargetBody.isKinematic = true;

    const follower = addBox(new Vector3(1, 1, 1), new Vector3(10, 0, 0));
    const shearedJoint = follower.addComponent(FixedJoint);
    shearedJoint.connectedBody = shearedTargetBody;
    shearedJoint.automaticConnectedAnchor = false;
    shearedJoint.anchor.set(0, 0, 0);
    shearedJoint.connectedAnchor.set(0, 2, 0);

    physics._update(0.2);
    const solvedX = follower.transform.worldPosition.x;
    const solvedY = follower.transform.worldPosition.y;

    shearedTarget.destroy();
    expect(shearedJoint.connectedBody).toBeNull();
    expect(shearedJoint.automaticConnectedAnchor).toBe(false);
    expect(shearedJoint.connectedAnchor.x).toBeCloseTo(solvedX, 2);
    expect(shearedJoint.connectedAnchor.y).toBeCloseTo(solvedY, 2);

    physics._update(0.2);
    expect(follower.transform.worldPosition.x).toBeCloseTo(solvedX, 2);
    expect(follower.transform.worldPosition.y).toBeCloseTo(solvedY, 2);
    follower.destroy();
    parent.destroy();

    // Explicit connectedBody = null keeps manual local/world anchor untouched.
    const explicitTarget = addBox(new Vector3(1, 1, 1), new Vector3(10, 0, 0));
    const explicitTargetBody = explicitTarget.getComponent(Rigidbody)!;
    explicitTargetBody.isKinematic = true;
    const explicitBox = addBox(new Vector3(1, 1, 1), new Vector3(6, 0, 0));
    const explicitJoint = explicitBox.addComponent(FixedJoint);
    explicitJoint.connectedBody = explicitTargetBody;
    explicitJoint.automaticConnectedAnchor = false;
    explicitJoint.connectedAnchor.set(-2, 0, 0);
    explicitJoint.connectedBody = null;
    expect(explicitJoint.connectedAnchor.x).toBe(-2);
    expect(explicitJoint.automaticConnectedAnchor).toBe(false);
  });

  it("captures the simulated anchor of a layout-aligned body and preserves it on destruction", () => {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);
    const parent = rootEntity.createChild();
    parent.addComponent(UITransform);
    const target = parent.createChild();
    (target.transform as UITransform).horizontalAlignment = HorizontalAlignmentMode.Center;
    target.addComponent(BoxCollider);
    const targetBody = target.addComponent(Rigidbody);
    const follower = addBox(new Vector3(1, 1, 1), new Vector3(2, 0, 0));
    const joint = follower.addComponent(FixedJoint);
    joint.connectedBody = targetBody;
    joint.connectedAnchor.set(2, 0, 0);
    targetBody.linearVelocity.set(8, 0, 0);
    follower.getComponent(Rigidbody)!.linearVelocity.set(8, 0, 0);
    physics._update(1);
    expect(target.transform.worldPosition.x).toBe(0);
    const before = follower.transform.worldPosition.x;
    expect(before).toBeGreaterThan(2);

    const worldJoint = target.addComponent(FixedJoint);
    expect(worldJoint.connectedAnchor.x).toBeCloseTo(before - 2, 3);
    worldJoint.destroy();
    joint.connectedAnchor.x = -3;
    joint.automaticConnectedAnchor = true;
    expect(joint.connectedAnchor.x).toBeCloseTo(2, 3);
    joint.automaticConnectedAnchor = false;
    targetBody.destroy();
    expect(joint.connectedAnchor.x).toBeCloseTo(before, 3);
    physics._update(physics.fixedTimeStep);
    expect(follower.transform.worldPosition.x).toBeCloseTo(before, 3);
  });

  it.each([true, false])("preserves a target's last authored pose on destruction (enabled=%s)", (enabled) => {
    const target = rootEntity.createChild().addComponent(Rigidbody);
    const joint = rootEntity.createChild().addComponent(FixedJoint);
    joint.connectedBody = target;
    joint.connectedAnchor.set(2, 0, 0);
    target.enabled = enabled;
    target.entity.transform.setPosition(20, 0, 0);
    target.destroy();
    expect(joint.connectedAnchor.x).toBe(22);
  });

  it("allows joints under non-uniform parent scale to sleep while waking sleeping joints on scale changes", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);

    for (const { parentScale, anchor } of [
      { parentScale: new Vector3(2, 1, 1), anchor: new Vector3(0, 0, 0) },
      { parentScale: new Vector3(1, 2, 1), anchor: new Vector3(0, 1, 0) }
    ]) {
      const parent = rootEntity.createChild("non-uniform-parent");
      parent.transform.scale = parentScale;
      const child = parent.createChild("hinge-child");
      child.addComponent(BoxCollider);
      const body = child.addComponent(Rigidbody);
      const joint = child.addComponent(HingeJoint);
      joint.anchor.copyFrom(anchor);
      body.angularVelocity.set(0.01, 0, 0);

      for (let i = 0; i < 60 && !body.isSleeping(); i++) {
        physics._update(physics.fixedTimeStep);
      }
      expect(body.isSleeping()).toBe(true);
      parent.destroy();
    }

    // Sleeping joint wakes on an external scale change and resolves to the scaled anchor.
    const scaledBox = addBox(new Vector3(1, 1, 1), new Vector3(1, 0, 0));
    const scaledBody = scaledBox.getComponent(Rigidbody)!;
    const scaledJoint = scaledBox.addComponent(FixedJoint);
    scaledJoint.automaticConnectedAnchor = false;
    scaledJoint.anchor.set(1, 0, 0);
    scaledJoint.connectedAnchor.set(2, 0, 0);

    physics._update(physics.fixedTimeStep);
    scaledBody.sleep();
    expect(scaledBody.isSleeping()).toBe(true);

    scaledBox.transform.setScale(2, 1, 1);
    expect(scaledBody.isSleeping()).toBe(false);
    physics._update(0.2);
    expect(scaledBox.transform.position.x).toBeCloseTo(0, 2);

    // Explicit anchor edits continue to wake sleeping bodies immediately.
    scaledBody.sleep();
    expect(scaledBody.isSleeping()).toBe(true);
    scaledJoint.anchor.set(0.5, 0, 0);
    expect(scaledBody.isSleeping()).toBe(false);
  });

  it("uses the solver frame for automatic connectedAnchor under sheared parents and zero-scaled targets", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);

    // Non-uniform parent + rotated child + non-zero anchor stays at rest in automatic mode.
    const parent = rootEntity.createChild("auto-sheared-parent");
    parent.transform.setScale(2, 1, 1);
    const child = parent.createChild("auto-sheared-child");
    child.transform.setPosition(3, 0, 0);
    child.transform.setRotation(0, 0, 45);
    child.addComponent(BoxCollider);
    child.addComponent(Rigidbody);
    const autoJoint = child.addComponent(FixedJoint);
    autoJoint.anchor.set(0, 2, 0);

    const initialX = child.transform.worldPosition.x;
    const initialY = child.transform.worldPosition.y;
    physics._update(0.2);
    expect(child.transform.worldPosition.x).toBeCloseTo(initialX, 2);
    expect(child.transform.worldPosition.y).toBeCloseTo(initialY, 2);

    // Zero-scaled connectedBody does not read stale matrix state from an earlier joint and preserves non-zero axes.
    const earlierTarget = addBox(new Vector3(1, 1, 1), new Vector3(100, 200, 300));
    earlierTarget.getComponent(Rigidbody)!.isKinematic = true;
    const earlierOwner = addBox(new Vector3(1, 1, 1), new Vector3(105, 205, 305));
    const earlierJoint = earlierOwner.addComponent(FixedJoint);
    earlierJoint.connectedBody = earlierTarget.getComponent(Rigidbody)!;

    const zeroTarget = rootEntity.createChild("zero-scale-target");
    zeroTarget.transform.setPosition(10, 4, 2);
    zeroTarget.transform.setScale(0, 2, 1);
    const zeroTargetBody = zeroTarget.addComponent(Rigidbody);
    zeroTargetBody.isKinematic = true;

    const owner = addBox(new Vector3(1, 1, 1), new Vector3(15, 10, 5));
    const zeroJoint = owner.addComponent(FixedJoint);
    zeroJoint.connectedBody = zeroTargetBody;
    expect(zeroJoint.connectedAnchor.x).toBe(0);
    expect(zeroJoint.connectedAnchor.y).toBeCloseTo(3, 5);
    expect(zeroJoint.connectedAnchor.z).toBeCloseTo(3, 5);

    zeroTarget.transform.setScale(0, 0, 0);
    zeroJoint.automaticConnectedAnchor = true;
    expect(zeroJoint.connectedAnchor.x).toBe(0);
    expect(zeroJoint.connectedAnchor.y).toBe(0);
    expect(zeroJoint.connectedAnchor.z).toBe(0);
  });

  it("skips no-op WorldScale native anchor writes and avoids waking sleeping peers on slack joints", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);

    const parent = rootEntity.createChild("non-uniform-scale-parent");
    parent.transform.setScale(2, 1, 1);
    const spinner = parent.createChild("spinner");
    spinner.transform.setPosition(0, 0, 0);
    spinner.addComponent(BoxCollider);
    const spinnerBody = spinner.addComponent(Rigidbody);

    const peer = addBox(new Vector3(1, 1, 1), new Vector3(5, 0, 0));
    const peerBody = peer.getComponent(Rigidbody)!;

    const spring = spinner.addComponent(SpringJoint);
    spring.connectedBody = peerBody;
    spring.minDistance = 0;
    spring.maxDistance = 20;

    physics._update(physics.fixedTimeStep);
    peerBody.sleep();
    expect(peerBody.isSleeping()).toBe(true);

    const nativeJoint = (spring as any)._nativeJoint;
    const setAnchorSpy = vi.spyOn(nativeJoint, "setAnchor");
    try {
      spinnerBody.angularVelocity.set(0, 0, 1);
      physics._update(physics.fixedTimeStep);
      physics._update(physics.fixedTimeStep);
      expect(setAnchorSpy).not.toHaveBeenCalled();
      expect(peerBody.isSleeping()).toBe(true);
    } finally {
      setAnchorSpy.mockRestore();
    }
  });

  it("wakes sleeping bodies when breakForce, breakTorque, inertiaScale, or connectedInertiaScale change", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, -10, 0);

    const box = addBox(new Vector3(1, 1, 1), new Vector3(0, 5, 0));
    const body = box.getComponent(Rigidbody)!;
    const joint = box.addComponent(FixedJoint);
    joint.breakForce = 100;

    for (let i = 0; i < 60 && !body.isSleeping(); i++) {
      physics._update(physics.fixedTimeStep);
    }
    expect(body.isSleeping()).toBe(true);

    joint.inertiaScale = 2;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.connectedInertiaScale = 2;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    joint.breakTorque = 50;
    expect(body.isSleeping()).toBe(false);

    body.sleep();
    expect(body.isSleeping()).toBe(true);
    joint.breakForce = 1;
    expect(body.isSleeping()).toBe(false);
    physics._update(0.3);
    expect(box.transform.position.y).toBeLessThan(4.8);
  });

  it("preserves local and automatic connected anchors under mirrored ancestors with rotation", function () {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);

    // 1. Self entity under mirrored parent + Y=45° rotation maps local anchor accurately to world space.
    const parent = rootEntity.createChild("mirrored-joint-parent");
    parent.transform.setScale(-1, 1, 1);
    const child = parent.createChild("mirrored-joint-child");
    child.transform.setRotation(0, 45, 0);
    child.addComponent(BoxCollider);
    child.addComponent(Rigidbody);
    const fixed = child.addComponent(FixedJoint);
    fixed.anchor.set(2, 0, 0);
    expect(fixed.connectedAnchor.x).toBeCloseTo(-Math.SQRT2, 4);
    expect(fixed.connectedAnchor.y).toBeCloseTo(0, 4);
    expect(fixed.connectedAnchor.z).toBeCloseTo(-Math.SQRT2, 4);
    physics._update(0.2);
    expect(child.transform.worldPosition.x).toBeCloseTo(0, 3);
    expect(child.transform.worldPosition.z).toBeCloseTo(0, 3);

    // 2. Connected body under mirrored parent + 44.9999°/45° preserves O(1) connectedAnchor and destruction world anchor.
    for (const angle of [44.9999, 45]) {
      const target = parent.createChild(`mirrored-target-${angle}`);
      target.transform.setRotation(0, angle, 0);
      const targetBody = target.addComponent(Rigidbody);
      targetBody.isKinematic = true;

      const owner = addBox(new Vector3(1, 1, 1), new Vector3(5, 3, 2));
      const joint = owner.addComponent(FixedJoint);
      joint.connectedBody = targetBody;
      expect(joint.connectedAnchor.x).toBeCloseTo(-7 * Math.SQRT1_2, 3);
      expect(joint.connectedAnchor.y).toBeCloseTo(3, 4);
      expect(joint.connectedAnchor.z).toBeCloseTo(-3 * Math.SQRT1_2, 3);

      joint.automaticConnectedAnchor = false;
      if (angle === 44.9999) {
        target.transform.setRotation(0, 0, 0);
        targetBody.destroy();
        expect(joint.connectedAnchor.x).toBeCloseTo(7 * Math.SQRT1_2, 3);
        expect(joint.connectedAnchor.y).toBeCloseTo(3, 3);
        expect(joint.connectedAnchor.z).toBeCloseTo(-3 * Math.SQRT1_2, 3);
      } else {
        targetBody.destroy();
        expect(joint.connectedAnchor.x).toBeCloseTo(5, 3);
        expect(joint.connectedAnchor.y).toBeCloseTo(3, 3);
        expect(joint.connectedAnchor.z).toBeCloseTo(2, 3);
      }
      owner.destroy();
      target.destroy();
    }

    // 3. Preserves non-degenerate axes when a mirrored rotated connectedBody has a zero-scaled axis.
    const zeroTarget = parent.createChild("mirrored-zero-target");
    zeroTarget.transform.setWorldPosition(10, 4, 2);
    zeroTarget.transform.setScale(0, 2, 1);
    zeroTarget.transform.setRotation(0, 45, 0);
    const zeroTargetBody = zeroTarget.addComponent(Rigidbody);
    zeroTargetBody.isKinematic = true;
    const owner = addBox(new Vector3(1, 1, 1), new Vector3(15, 10, 5));
    const zeroJoint = owner.addComponent(FixedJoint);
    zeroJoint.connectedBody = zeroTargetBody;
    expect(zeroJoint.connectedAnchor.x).toBe(0);
    expect(zeroJoint.connectedAnchor.y).toBeCloseTo(3, 4);
    expect(zeroJoint.connectedAnchor.z).toBeCloseTo(-Math.SQRT2, 4);
  });

  it("follows successive scale edits on a connected body without a collider", () => {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);
    const parent = rootEntity.createChild();
    parent.transform.setScale(2, 1, 1);
    const target = parent.createChild().addComponent(Rigidbody);
    target.isKinematic = true;
    const owner = rootEntity.createChild();
    owner.transform.setPosition(2, 0, 0);
    const joint = owner.addComponent(FixedJoint);
    joint.connectedBody = target;
    joint.connectedAnchor.set(1, 0, 0);

    for (const x of [3, 5]) {
      parent.transform.setScale(x - 0.5, 1, 1);
      parent.transform.setScale(x, 1, 1);
      physics._update(physics.fixedTimeStep);
      expect(owner.transform.worldPosition.x).toBeCloseTo(x, 4);
    }
  });

  it.each([
    {
      scale: new Vector3(0.0003, 0.0003, 1),
      outerAngle: 0,
      rotation: new Vector3(35, 41, 22),
      point: new Vector3(2, 3, 4)
    },
    { scale: new Vector3(1e-7, 1, 0), outerAngle: 45, rotation: new Vector3(0, 0, 45), point: new Vector3(1, 1, 0) }
  ])(
    "preserves reachable thin axes when capturing an automatic anchor (parent rotation $outerAngle)",
    ({ scale, outerAngle, rotation, point }) => {
      const physics = engine.sceneManager.activeScene.physics;
      physics.gravity.set(0, 0, 0);
      const parent = rootEntity.createChild();
      parent.transform.setRotation(0, 0, outerAngle);
      parent.transform.scale = scale;
      const target = parent.createChild();
      target.transform.rotation = rotation;
      const body = target.addComponent(Rigidbody);
      body.isKinematic = true;
      const owner = rootEntity.createChild();
      owner.transform.position = point;
      owner.addComponent(FixedJoint).connectedBody = body;

      physics._update(0.2);
      expect(Vector3.distance(owner.transform.worldPosition, point)).toBeLessThan(0.001);
    }
  );

  it("keeps the projected anchor when a collapsed ancestor regains its scale", () => {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);
    const parent = rootEntity.createChild();
    parent.transform.setRotation(0, 0, 30);
    parent.transform.setScale(0, 1, 1);
    const middle = parent.createChild();
    middle.transform.setRotation(0, 0, 35);
    const target = middle.createChild();
    target.transform.setRotation(0, 0, -35);
    const body = target.addComponent(Rigidbody);
    body.isKinematic = true;
    const owner = rootEntity.createChild();
    owner.transform.setPosition(Math.sqrt(3) / 2, 0.5, 0);
    const joint = owner.addComponent(FixedJoint);
    joint.connectedBody = body;
    expect(joint.connectedAnchor.length()).toBeLessThan(0.0001);

    parent.transform.setScale(1, 1, 1);
    physics._update(0.2);
    expect(owner.transform.worldPosition.length()).toBeLessThan(0.0001);
  });

  it("keeps a captured anchor stable as a flattened target rotates", () => {
    const physics = engine.sceneManager.activeScene.physics;
    physics.gravity.set(0, 0, 0);
    const parent = rootEntity.createChild();
    parent.transform.setScale(0, 1, 1);
    const target = parent.createChild();
    target.transform.setRotation(0, 0, 0.01);
    target.addComponent(BoxCollider);
    const body = target.addComponent(Rigidbody);
    body.isKinematic = true;
    const owner = rootEntity.createChild();
    owner.transform.setPosition(0, 1, 0);
    const joint = owner.addComponent(FixedJoint);
    joint.connectedBody = body;
    physics._update(physics.fixedTimeStep);
    expect(joint.connectedAnchor.length()).toBeCloseTo(1, 4);

    target.transform.setRotation(0, 0, 0.02);
    physics._update(physics.fixedTimeStep);
    expect(owner.transform.worldPosition.y).toBeCloseTo(1, 4);
  });
});
