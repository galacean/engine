import {
  DynamicCollider,
  PhysicsMaterial,
  PhysicsMaterialCombineMode,
  Entity,
  Engine,
  BoxColliderShape,
  StaticCollider,
  PlaneColliderShape
} from "@galacean/engine-core";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { Vector3 } from "@galacean/engine-math";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";

describe("PhysicsMaterial", () => {
  let rootEntity: Entity;
  let engine: Engine;

  function addPlane(x: number, y: number, z: number) {
    const planeEntity = rootEntity.createChild("PlaneEntity");
    planeEntity.transform.setPosition(x, y, z);
    planeEntity.transform.setScale(20, 1, 20);

    const physicsPlane = new PlaneColliderShape();
    physicsPlane.material.dynamicFriction = 0;
    physicsPlane.material.staticFriction = 0;
    physicsPlane.material.bounciness = 0;
    const planeCollider = planeEntity.addComponent(StaticCollider);
    planeCollider.addShape(physicsPlane);
    return planeEntity;
  }

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

  beforeAll(async () => {
    engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });

    rootEntity = engine.sceneManager.activeScene.createRootEntity("root");
  });

  beforeEach(function () {
    rootEntity.clearChildren();
  });

  it("bounciness", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(3, 5, 0));
    const ground = addPlane(0, -0.5, 0);

    const collider = boxEntity.getComponent(DynamicCollider);
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider2.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider2.automaticInertiaTensor = true;

    collider.shapes[0].material.bounciness = 1;
    collider2.shapes[0].material.bounciness = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(boxEntity.transform.position.y).greaterThan(0);
    expect(formatValue(boxEntity2.transform.position.y)).eq(0);
  });

  it("bounceCombine Average", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;

    collider.shapes[0].material.bounciness = 1;
    collider.shapes[0].material.bounceCombine = PhysicsMaterialCombineMode.Average;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0.1775);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);
    collider2.automaticCenterOfMass = true;
    collider2.automaticInertiaTensor = true;
    collider2.shapes[0].material.bounciness = 0.5;
    ground.getComponent(StaticCollider).shapes[0].material.bounciness = 0.5;
    collider2.shapes[0].material.bounceCombine = PhysicsMaterialCombineMode.Average;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity2.transform.position.y)).eq(0.1775);
  });

  it("bounceCombine Minimum", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.shapes[0].material.bounciness = 1;
    collider.shapes[0].material.bounceCombine = PhysicsMaterialCombineMode.Minimum;
    ground.getComponent(StaticCollider).shapes[0].material.bounciness = 0;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0);
  });

  it("bounceCombine Maximum", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.shapes[0].material.bounciness = 0;
    collider.shapes[0].material.bounceCombine = PhysicsMaterialCombineMode.Maximum;
    ground.getComponent(StaticCollider).shapes[0].material.bounciness = 1;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(5.1645);
  });

  it("bounceCombine Multiply", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 5, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    collider.automaticCenterOfMass = true;
    collider.automaticInertiaTensor = true;
    collider.shapes[0].material.bounciness = 1;
    collider.shapes[0].material.bounceCombine = PhysicsMaterialCombineMode.Multiply;
    ground.getComponent(StaticCollider).shapes[0].material.bounciness = 0.5;

    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(2);
    expect(formatValue(boxEntity.transform.position.y)).eq(0.1775);
  });

  it("dynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider2.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.dynamicFriction = 1;
    collider2.shapes[0].material.dynamicFriction = 0.5;

    collider.applyForce(new Vector3(0, 0, 1000));
    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).greaterThan(boxEntity.transform.position.z);
    expect(collider2.linearVelocity.z).greaterThan(collider.linearVelocity.z);
  });

  it("staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(2, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider2.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.staticFriction = 2000;
    collider2.shapes[0].material.staticFriction = 100;

    collider.applyForce(new Vector3(0, 0, 1000));
    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
    expect(boxEntity2.transform.position.z).not.closeTo(0, 0.001);
    expect(boxEntity2.transform.position.z).greaterThan(boxEntity.transform.position.z);
  });

  it("frictionCombine Average staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Average;

    collider.shapes[0].material.staticFriction = 2000;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    collider.shapes[0].material.staticFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 2000;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Minimum staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider.shapes[0].material.staticFriction = 2000;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).greaterThan(10);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider2.shapes[0].material.staticFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 2000;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).greaterThan(10);
  });

  it("frictionCombine Maximum staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider.shapes[0].material.staticFriction = 2000;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider2.shapes[0].material.staticFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 2000;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity2.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Multiply staticFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider.shapes[0].material.staticFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 200;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider2.shapes[0].material.staticFriction = 100;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 20;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(boxEntity.transform.position.z).closeTo(0, 0.001);
  });

  it("frictionCombine Average DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Average;

    collider.shapes[0].material.dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].material.staticFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(1.27903);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Average;

    collider2.shapes[0].material.dynamicFriction = 5;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 5;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(1.27903);
  });

  it("frictionCombine Minimum DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider.shapes[0].material.dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(16.66667);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Minimum;

    collider2.shapes[0].material.dynamicFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 10;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(16.66667);
  });

  it("frictionCombine Maximum DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider.shapes[0].material.dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 0;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(0.57139);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Maximum;

    collider2.shapes[0].material.dynamicFriction = 0;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 10;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(0.57139);
  });

  it("frictionCombine Multiply DynamicFriction", () => {
    const boxEntity = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const ground = addPlane(0, -0.5, 0);
    const collider = boxEntity.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider.automaticInertiaTensor = false;
    collider.inertiaTensor.set(10000000, 10000000, 10000000);

    collider.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider.shapes[0].material.dynamicFriction = 2;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 5;

    collider.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity.transform.position.z)).eq(0.57139);

    boxEntity.isActive = false;
    const boxEntity2 = addBox(new Vector3(1, 1, 1), DynamicCollider, new Vector3(0, 0, 0));
    const collider2 = boxEntity2.getComponent(DynamicCollider);

    // Avoid the box rotating
    collider2.automaticInertiaTensor = false;
    collider2.inertiaTensor.set(10000000, 10000000, 10000000);

    collider2.shapes[0].material.frictionCombine = PhysicsMaterialCombineMode.Multiply;

    collider2.shapes[0].material.dynamicFriction = 10;
    ground.getComponent(StaticCollider).shapes[0].material.dynamicFriction = 1;

    collider2.applyForce(new Vector3(0, 0, 1000));
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1);
    expect(formatValue(boxEntity2.transform.position.z)).eq(0.57139);
  });

  it("destroy", () => {
    const physicsMaterial = new PhysicsMaterial();
    physicsMaterial.destroy();
    expect(() => {
      physicsMaterial.bounciness = 1;
    }).toThrowError();
  });
});
