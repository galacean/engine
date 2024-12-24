import {
  Entity,
  BoxColliderShape,
  CapsuleColliderShape,
  ColliderShapeUpAxis,
  PlaneColliderShape,
  SphereColliderShape,
  DynamicCollider,
  PhysicsMaterial
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import { WebGLEngine } from "@galacean/engine-rhi-webgl";
import { PhysXPhysics } from "@galacean/engine-physics-physx";
import { describe, beforeAll, beforeEach, expect, it } from "vitest";
import { LitePhysics } from "@galacean/engine-physics-lite";

describe("ColliderShape PhysX", () => {
  let dynamicCollider: DynamicCollider;

  function formatValue(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  beforeAll(async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new PhysXPhysics() });
    engine.run();

    const scene = engine.sceneManager.activeScene;
    scene.physics.gravity = new Vector3(0, 0, 0);
    const root = scene.createRootEntity("root");

    const roleEntity = root.createChild("role");

    dynamicCollider = roleEntity.addComponent(DynamicCollider);
  });

  beforeEach(() => {
    const entity = dynamicCollider.entity;
    entity.transform.setPosition(0, 0, 0);
    entity.transform.setScale(1, 1, 1);
    entity.transform.setRotation(0, 0, 0);
    dynamicCollider.clearShapes();
  });

  it("BoxColliderShape", () => {
    const boxShape = new BoxColliderShape();
    dynamicCollider.addShape(boxShape);

    // Test that set size works correctly.
    boxShape.size = new Vector3(1, 2, 3);
    expect(boxShape.size).to.deep.include({ x: 1, y: 2, z: 3 });

    // Test that set trigger works correctly.
    boxShape.isTrigger = true;
    expect(boxShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = boxShape.contactOffset;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.4;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    const material = new PhysicsMaterial();
    boxShape.material = material;
    expect(boxShape.material).to.eq(material);

    // Test that set position works correctly.
    boxShape.position = new Vector3(1, 2, -1);
    expect(boxShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    boxShape.rotation = new Vector3(40, -182, 720);
    expect(boxShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("CapsuleColliderShape", () => {
    const capsuleShape = new CapsuleColliderShape();
    dynamicCollider.addShape(capsuleShape);

    // Test that set radius works correctly.
    let radius = capsuleShape.radius;
    expect(capsuleShape.radius).to.eq(radius);

    radius *= 0.5;
    capsuleShape.radius = radius;
    expect(capsuleShape.radius).to.eq(radius);

    radius *= 4;
    capsuleShape.radius = radius;
    expect(capsuleShape.radius).to.eq(radius);

    // Test that set height works correctly.
    let height = capsuleShape.height;
    expect(capsuleShape.height).to.eq(height);

    height *= 0.5;
    capsuleShape.height = height;
    expect(capsuleShape.height).to.eq(height);

    height *= 4;
    capsuleShape.height = height;
    expect(capsuleShape.height).to.eq(height);

    // Test that set upAxis works correctly.
    const upAxis = capsuleShape.upAxis;
    expect(capsuleShape.upAxis).to.eq(upAxis);

    capsuleShape.upAxis = ColliderShapeUpAxis.X;
    expect(capsuleShape.upAxis).to.eq(ColliderShapeUpAxis.X);

    capsuleShape.upAxis = ColliderShapeUpAxis.Y;
    expect(capsuleShape.upAxis).to.eq(ColliderShapeUpAxis.Y);

    capsuleShape.upAxis = ColliderShapeUpAxis.Z;
    expect(capsuleShape.upAxis).to.eq(ColliderShapeUpAxis.Z);

    // Test that set trigger works correctly.
    capsuleShape.isTrigger = true;
    expect(capsuleShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = capsuleShape.contactOffset;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.4;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    capsuleShape.contactOffset = contactOffset;
    expect(capsuleShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    const material = new PhysicsMaterial();
    capsuleShape.material = material;
    expect(capsuleShape.material).to.eq(material);

    // Test that set position works correctly.
    capsuleShape.position = new Vector3(1, 2, -1);
    expect(capsuleShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    capsuleShape.rotation = new Vector3(40, -182, 720);
    expect(capsuleShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("PlaneColliderShape", () => {
    const planeShape = new PlaneColliderShape();
    dynamicCollider.addShape(planeShape);

    // Test that set trigger works correctly.
    planeShape.isTrigger = true;
    expect(planeShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = planeShape.contactOffset;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.4;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    planeShape.contactOffset = contactOffset;
    expect(planeShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    const material = new PhysicsMaterial();
    planeShape.material = material;
    expect(planeShape.material).to.eq(material);

    // Test that set position works correctly.
    planeShape.position = new Vector3(1, 2, -1);
    expect(planeShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    planeShape.rotation = new Vector3(40, -182, 720);
    expect(planeShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("SphereColliderShape", () => {
    const sphereShape = new SphereColliderShape();
    dynamicCollider.addShape(sphereShape);

    // Test that set radius works correctly.
    let radius = sphereShape.radius;
    expect(sphereShape.radius).to.eq(radius);

    radius *= 0.5;
    sphereShape.radius = radius;
    expect(sphereShape.radius).to.eq(radius);

    radius *= 4;
    sphereShape.radius = radius;
    expect(sphereShape.radius).to.eq(radius);

    // Test that set trigger works correctly.
    sphereShape.isTrigger = true;
    expect(sphereShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = sphereShape.contactOffset;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.4;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    const material = new PhysicsMaterial();
    sphereShape.material = material;
    expect(sphereShape.material).to.eq(material);

    // Test that set position works correctly.
    sphereShape.position = new Vector3(1, 2, -1);
    expect(sphereShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    sphereShape.rotation = new Vector3(40, -182, 720);
    expect(sphereShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("boxShape getClosestPoint", () => {
    const boxShape = new BoxColliderShape();
    boxShape.size.set(1, 2, 3);
    boxShape.position.set(2, 3, 4);
    boxShape.rotation.set(23, 45, 12);
    dynamicCollider.addShape(boxShape);
    const entity = dynamicCollider.entity;
    const engine = entity.engine;
    entity.transform.setPosition(2, 3, 5);
    entity.transform.setScale(3, 4, 5);
    entity.transform.setRotation(13, -45, 38);

    const point = new Vector3(-9, 7, 6);
    const closestPoint = new Vector3();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    let distance = boxShape.getClosestPoint(point, closestPoint);
    expect(formatValue(distance)).to.eq(10.492);
    expect(formatValue(closestPoint.x)).to.eq(-16.0876);
    expect(formatValue(closestPoint.y)).to.eq(10.7095);
    expect(formatValue(closestPoint.z)).to.eq(12.7889);

    entity.transform.setScale(1, 1, 1);
    entity.transform.setRotation(0, 0, 0);

    point.set(4, 6, 9);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    distance = boxShape.getClosestPoint(point, closestPoint);
    expect(distance).to.eq(0);
    expect(formatValue(closestPoint.x)).to.eq(4);
    expect(formatValue(closestPoint.y)).to.eq(6);
    expect(formatValue(closestPoint.z)).to.eq(9);
  });

  it("sphereShape getClosestPoint", () => {
    const sphereShape = new SphereColliderShape();
    sphereShape.radius = 2;
    sphereShape.position.set(2, 3, 4);
    dynamicCollider.addShape(sphereShape);
    const entity = dynamicCollider.entity;
    const engine = entity.engine;
    entity.transform.setPosition(2, 3, 5);
    entity.transform.setScale(3, 4, 5);
    entity.transform.setRotation(13, -45, 38);

    const point = new Vector3(14, 8, 10);
    const closestPoint = new Vector3();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    const distance = sphereShape.getClosestPoint(point, closestPoint);
    expect(formatValue(distance)).to.eq(21.2571);
    expect(formatValue(closestPoint.x)).to.eq(-6.2337);
    expect(formatValue(closestPoint.y)).to.eq(10.2538);
    expect(formatValue(closestPoint.z)).to.eq(16.1142);

    entity.transform.setScale(1, 1, 1);
    entity.transform.setRotation(0, 0, 0);
    point.set(4, 6, 9);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    const distance2 = sphereShape.getClosestPoint(point, closestPoint);
    expect(distance2).to.eq(0);
    expect(closestPoint).to.deep.include({ x: 4, y: 6, z: 9 });
  });

  it("getClosestPoint with collider disabled", () => {
    const sphereShape = new BoxColliderShape();
    dynamicCollider.addShape(sphereShape);
    dynamicCollider.enabled = false;

    const point = new Vector3(2, 0, 0);
    const closestPoint = new Vector3();
    const distance = sphereShape.getClosestPoint(point, closestPoint);
    expect(distance).to.eq(-1);
  });

  it("clone", () => {
    // SphereColliderShape
    const sphereShape = new SphereColliderShape();
    sphereShape.radius = 2;
    dynamicCollider.addShape(sphereShape);
    const newCollider = dynamicCollider.entity.clone().getComponent(DynamicCollider);
    expect(newCollider.shapes.length).to.eq(1);
    expect((newCollider.shapes[0] as SphereColliderShape).radius).to.eq(2);

    // BoxColliderShape
    dynamicCollider.clearShapes();
    const boxShape = new BoxColliderShape();
    boxShape.size = new Vector3(1, 2, 3);
    dynamicCollider.addShape(boxShape);
    const newCollider2 = dynamicCollider.entity.clone().getComponent(DynamicCollider);
    expect(newCollider2.shapes.length).to.eq(1);
    expect((newCollider2.shapes[0] as BoxColliderShape).size).to.deep.include({ x: 1, y: 2, z: 3 });

    // CapsuleColliderShape
    dynamicCollider.clearShapes();
    const capsuleShape = new CapsuleColliderShape();
    capsuleShape.radius = 2;
    capsuleShape.height = 3;
    dynamicCollider.addShape(capsuleShape);
    const newCollider3 = dynamicCollider.entity.clone().getComponent(DynamicCollider);
    expect(newCollider3.shapes.length).to.eq(1);
    expect((newCollider3.shapes[0] as CapsuleColliderShape).radius).to.eq(2);
    expect((newCollider3.shapes[0] as CapsuleColliderShape).height).to.eq(3);
  });
});

describe("ColliderShape Lite", () => {
  let dynamicCollider: DynamicCollider;

  function formatValue(value: number) {
    return Math.round(value * 10000) / 10000;
  }

  beforeAll(async () => {
    const engine = await WebGLEngine.create({ canvas: document.createElement("canvas"), physics: new LitePhysics() });
    engine.run();

    const scene = engine.sceneManager.activeScene;
    const root = scene.createRootEntity("root");

    const roleEntity = root.createChild("role");

    dynamicCollider = roleEntity.addComponent(DynamicCollider);
  });

  beforeEach(() => {
    const entity = dynamicCollider.entity;
    entity.transform.setPosition(0, 0, 0);
    entity.transform.setScale(1, 1, 1);
    entity.transform.setRotation(0, 0, 0);
    dynamicCollider.clearShapes();
  });

  it("BoxColliderShape", () => {
    const boxShape = new BoxColliderShape();
    dynamicCollider.addShape(boxShape);

    // Test that set size works correctly.
    boxShape.size = new Vector3(1, 2, 3);
    expect(boxShape.size).to.deep.include({ x: 1, y: 2, z: 3 });

    // Test that set trigger works correctly.
    boxShape.isTrigger = true;
    expect(boxShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = boxShape.contactOffset;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.4;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    boxShape.contactOffset = contactOffset;
    expect(boxShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    const material = new PhysicsMaterial();
    boxShape.material = material;
    expect(boxShape.material).to.eq(material);

    // Test that set position works correctly.
    boxShape.position = new Vector3(1, 2, -1);
    expect(boxShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    boxShape.rotation = new Vector3(40, -182, 720);
    expect(boxShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("SphereColliderShape", () => {
    const sphereShape = new SphereColliderShape();
    dynamicCollider.addShape(sphereShape);

    // Test that set radius works correctly.
    let radius = sphereShape.radius;
    expect(sphereShape.radius).to.eq(radius);

    radius *= 0.5;
    sphereShape.radius = radius;
    expect(sphereShape.radius).to.eq(radius);

    radius *= 4;
    sphereShape.radius = radius;
    expect(sphereShape.radius).to.eq(radius);

    // Test that set trigger works correctly.
    sphereShape.isTrigger = true;
    expect(sphereShape.isTrigger).to.eq(true);

    // Test that set contactOffset works correctly.
    let contactOffset = sphereShape.contactOffset;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.4;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 0;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    contactOffset = 2.7;
    sphereShape.contactOffset = contactOffset;
    expect(sphereShape.contactOffset).to.eq(contactOffset);

    // Test that set material works correctly.
    const material = new PhysicsMaterial();
    sphereShape.material = material;
    expect(sphereShape.material).to.eq(material);

    // Test that set position works correctly.
    sphereShape.position = new Vector3(1, 2, -1);
    expect(sphereShape.position).to.deep.include({ x: 1, y: 2, z: -1 });

    // Test that set rotation works correctly.
    sphereShape.rotation = new Vector3(40, -182, 720);
    expect(sphereShape.rotation).to.deep.include({ x: 40, y: -182, z: 720 });
  });

  it("boxShape getClosestPoint", () => {
    const boxShape = new BoxColliderShape();
    boxShape.size.set(1, 2, 3);
    boxShape.position.set(2, 3, 4);
    boxShape.rotation.set(23, 45, 12);
    dynamicCollider.addShape(boxShape);
    const entity = dynamicCollider.entity;
    const engine = entity.engine;
    entity.transform.setPosition(2, 3, 5);
    entity.transform.setScale(3, 4, 5);
    entity.transform.setRotation(13, -45, 38);

    const point = new Vector3(-9, 7, 6);
    const closestPoint = new Vector3();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    let distance = boxShape.getClosestPoint(point, closestPoint);
    expect(formatValue(distance)).to.eq(10.492);
    expect(formatValue(closestPoint.x)).to.eq(-16.0876);
    expect(formatValue(closestPoint.y)).to.eq(10.7095);
    expect(formatValue(closestPoint.z)).to.eq(12.7889);

    entity.transform.setScale(1, 1, 1);
    entity.transform.setRotation(0, 0, 0);

    point.set(4, 6, 9);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    distance = boxShape.getClosestPoint(point, closestPoint);
    expect(distance).to.eq(0);
    expect(formatValue(closestPoint.x)).to.eq(4);
    expect(formatValue(closestPoint.y)).to.eq(6);
    expect(formatValue(closestPoint.z)).to.eq(9);
  });

  it("sphereShape getClosestPoint", () => {
    const sphereShape = new SphereColliderShape();
    sphereShape.radius = 2;
    sphereShape.position.set(2, 3, 4);
    dynamicCollider.addShape(sphereShape);
    const entity = dynamicCollider.entity;
    const engine = entity.engine;
    entity.transform.setPosition(2, 3, 5);
    entity.transform.setScale(3, 4, 5);
    entity.transform.setRotation(13, -45, 38);

    const point = new Vector3(14, 8, 10);
    const closestPoint = new Vector3();
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    const distance = sphereShape.getClosestPoint(point, closestPoint);
    expect(formatValue(distance)).to.eq(21.2571);
    expect(formatValue(closestPoint.x)).to.eq(-6.2337);
    expect(formatValue(closestPoint.y)).to.eq(10.2538);
    expect(formatValue(closestPoint.z)).to.eq(16.1142);

    entity.transform.setScale(1, 1, 1);
    entity.transform.setRotation(0, 0, 0);
    point.set(3, 6, 9);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    const distance2 = sphereShape.getClosestPoint(point, closestPoint);
    expect(distance2).to.eq(0);
    expect(closestPoint).to.deep.include({ x: 3, y: 6, z: 9 });

    point.set(8, 6, 9);
    // @ts-ignore
    engine.sceneManager.activeScene.physics._update(1 / 60);
    const distance3 = sphereShape.getClosestPoint(point, closestPoint);
    expect(distance3).to.eq(2);
    expect(closestPoint).to.deep.include({ x: 6, y: 6, z: 9 });
  });

  it("getClosestPoint with collider disabled", () => {
    const sphereShape = new BoxColliderShape();
    dynamicCollider.addShape(sphereShape);
    dynamicCollider.enabled = false;

    const point = new Vector3(2, 0, 0);
    const closestPoint = new Vector3();
    const distance = sphereShape.getClosestPoint(point, closestPoint);
    expect(distance).to.eq(-1);
  });

  it("clone", () => {
    // SphereColliderShape
    const sphereShape = new SphereColliderShape();
    sphereShape.radius = 2;
    dynamicCollider.addShape(sphereShape);
    const newCollider = dynamicCollider.entity.clone().getComponent(DynamicCollider);
    expect(newCollider.shapes.length).to.eq(1);
    expect((newCollider.shapes[0] as SphereColliderShape).radius).to.eq(2);

    // BoxColliderShape
    dynamicCollider.clearShapes();
    const boxShape = new BoxColliderShape();
    boxShape.size = new Vector3(1, 2, 3);
    dynamicCollider.addShape(boxShape);
    const newCollider2 = dynamicCollider.entity.clone().getComponent(DynamicCollider);
    expect(newCollider2.shapes.length).to.eq(1);
    expect((newCollider2.shapes[0] as BoxColliderShape).size).to.deep.include({ x: 1, y: 2, z: 3 });
  });
});
